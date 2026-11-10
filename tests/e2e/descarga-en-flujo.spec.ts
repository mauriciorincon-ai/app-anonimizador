// La salida grande sin selector de archivo (S11): un CSV de alto volumen se guarda sin juntarlo
// entero en la memoria de la pestaña.
//
//   · Con service worker: los trozos fluyen worker → service worker → descarga del navegador. Se
//     comprueba que la respuesta la dio el service worker (si la pidiera el servidor de Next, la
//     descarga sería un 404 que una lista blanca por ruta dejaría pasar), que la red no ve nada más,
//     y que los bytes del archivo descargado son los que el worker hasheó (el certificado lo dice).
//   · Cancelar la descarga a medias (S11, hallazgos): el archivo no sale, la pantalla lo dice, y se
//     puede volver a preparar: la segunda vez sale entero, con los bytes del certificado.
//   · Sin service worker (bloqueado): el respaldo por partes. Pegadas en orden dan los mismos bytes,
//     y la huella del todo y la de cada parte son las del certificado y las del manifiesto.
//
// Chromium de escritorio, en español. Firefox y WebKit van por `tests/medicion/pico-alto-volumen.mjs`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const ANCHO = nombreDeFixture("ancho", 100_000, 42);
const FRASE_DE_LLAVE = "una frase de la llave de la descarga en flujo";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Sin selector de archivo del sistema: Chromium de escritorio lo trae y habría que esconderlo. */
async function sinSelector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as Window & { showSaveFilePicker?: unknown })
      .showSaveFilePicker;
  });
}

/** Del archivo cargado hasta la transformación hecha: lo mismo que `alto-volumen.spec.ts`. */
async function hastaTransformado(page: Page): Promise<void> {
  await page.goto("/");
  await page.setInputFiles("#archivo", ANCHO);
  await page.waitForURL("**/diagnostico", { timeout: 180_000 });
  await expect(
    page.getByRole("heading", { name: "Este archivo se leyó por pasadas" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE_DE_LLAVE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 120_000 });
}

/** El SHA-256 de salida que dice el certificado, que el worker calculó sobre lo que escribió. */
async function huellaDelCertificado(page: Page): Promise<string> {
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar el certificado" }).click(),
  ]);
  const html = readFileSync((await certificado.path())!, "utf8");
  const huellas = [...html.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
  expect(huellas.length).toBeGreaterThan(1);
  return html;
}

test.describe("la salida grande sin selector de archivo", () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      info.project.name !== "desktop-chromium",
      `el archivo de alto volumen corre en un solo proyecto (${browserName})`,
    );
  });
  test.setTimeout(300_000);

  test("con service worker: la descarga la da el service worker, sin red de más y con los mismos bytes del certificado", async ({
    browser,
    baseURL,
  }) => {
    const origen = new URL(baseURL!).origin;
    const contexto = await browser.newContext({ acceptDownloads: true });
    const page = await contexto.newPage();
    await sinSelector(page);

    // Toda la red del contexto, también la del service worker: si hiciera una petición, caería aquí.
    const sospechosas: string[] = [];
    const delServiceWorker: boolean[] = [];
    let pidioElScript = false;
    contexto.on("request", (peticion) => {
      const url = new URL(peticion.url());
      if (url.origin !== origen) {
        sospechosas.push(`fuera del origen: ${url.href}`);
        return;
      }
      if (peticion.postData()) sospechosas.push(`con cuerpo: ${url.pathname}`);
      if (url.pathname === "/velo-descarga-sw.js") pidioElScript = true;
    });
    page.on("response", (respuesta) => {
      const ruta = new URL(respuesta.url()).pathname;
      if (ruta.startsWith("/descarga/"))
        delServiceWorker.push(respuesta.fromServiceWorker());
    });
    page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));

    await hastaTransformado(page);
    await expect(
      page.getByText(/este navegador no deja elegir un archivo de destino/),
    ).toBeVisible();

    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("button", { name: "Preparar el archivo" }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(
      /^velo-anonimizado-[0-9a-f]{8}\.csv$/,
    );
    const ruta = join(DIRECTORIO_DE_FIXTURES, "descarga-en-flujo.csv");
    await descarga.saveAs(ruta);
    await expect(
      page.getByText(/Enviado a la descarga de tu navegador/),
    ).toBeVisible({ timeout: 120_000 });

    // Los bytes que bajaron son los que el worker hasheó: el certificado lleva esa huella.
    const bytes = readFileSync(ruta);
    const certificado = await huellaDelCertificado(page);
    expect(certificado).toContain(sha(bytes));
    // El archivo está entero: el encabezado y las 100.000 filas.
    expect(bytes.toString("utf8").split("\n").length - 1).toBe(100_001);

    // La respuesta la dio el service worker, y solo hubo UNA: nada llegó al servidor de Next.
    expect(delServiceWorker).toEqual([true]);
    expect(pidioElScript).toBe(true);
    expect(sospechosas).toEqual([]);
    await contexto.close();
  });

  test("cancelar la descarga a medias: la pantalla lo dice, no queda nada colgado y volver a prepararla sale entera", async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ acceptDownloads: true });
    const page = await contexto.newPage();
    await sinSelector(page);
    const delServiceWorker: boolean[] = [];
    page.on("response", (respuesta) => {
      const ruta = new URL(respuesta.url()).pathname;
      if (ruta.startsWith("/descarga/"))
        delServiceWorker.push(respuesta.fromServiceWorker());
    });

    await hastaTransformado(page);
    const preparar = page.getByRole("button", { name: "Preparar el archivo" });

    // Primera vez: el navegador empieza a bajar y la persona cancela en su administrador de descargas.
    const [cancelada] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      preparar.click(),
    ]);
    await cancelada.cancel();
    expect(await cancelada.failure()).toBe("canceled");
    // El worker se entera por el canal, deja de escribir y la pantalla dice que no se pudo: no se
    // queda en «Escribiendo…» ni ofrece un archivo a medias.
    await expect(
      page.getByRole("alert").filter({ hasText: "No se pudo escribir el archivo" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/hayas cancelado la descarga/)).toBeVisible();
    await expect(page.getByText(/Enviado a la descarga de tu navegador/)).toHaveCount(0);
    await expect(preparar).toBeEnabled();

    // Segunda vez: sale entero, y es el archivo que dice el certificado.
    const [entera] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      preparar.click(),
    ]);
    const ruta = join(DIRECTORIO_DE_FIXTURES, "descarga-cancelada-y-repetida.csv");
    await entera.saveAs(ruta);
    await expect(
      page.getByText(/Enviado a la descarga de tu navegador/),
    ).toBeVisible({ timeout: 120_000 });
    const bytes = readFileSync(ruta);
    expect(await huellaDelCertificado(page)).toContain(sha(bytes));
    expect(bytes.toString("utf8").split("\n").length - 1).toBe(100_001);
    // Las dos respuestas las dio el service worker; nada cayó al servidor de Next.
    expect(delServiceWorker).toEqual([true, true]);
    await contexto.close();
  });

  test("sin service worker: el respaldo por partes, que pegadas dan los mismos bytes y huellas", async ({
    browser,
  }) => {
    const contexto = await browser.newContext({
      acceptDownloads: true,
      serviceWorkers: "block",
    });
    const page = await contexto.newPage();
    await sinSelector(page);
    // Partes pequeñas para que un archivo de 42 MB salga en varias: el límite real es de 256 MB.
    await page.addInitScript(() => {
      const prototipo = Worker.prototype as unknown as {
        postMessage: (...argumentos: unknown[]) => void;
      };
      const original = prototipo.postMessage;
      prototipo.postMessage = function (
        this: Worker,
        mensaje: unknown,
        ...resto: unknown[]
      ) {
        const m = mensaje as { tipo?: string } | null;
        return original.call(
          this,
          m?.tipo === "construir-archivo"
            ? { ...m, limiteDeParte: 8_000_000 }
            : mensaje,
          ...resto,
        );
      };
    });

    await hastaTransformado(page);
    await page.getByRole("button", { name: "Preparar el archivo" }).click();
    await expect(page.getByText(/salió en \d+ partes/)).toBeVisible({
      timeout: 120_000,
    });
    const enlaces = page.getByRole("link", {
      name: /^Guardar la parte \d+ de \d+$/,
    });
    const n = await enlaces.count();
    expect(n).toBeGreaterThanOrEqual(5);

    const partes: Buffer[] = [];
    for (let i = 0; i < n; i++) {
      const [descarga] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("link", { name: `Guardar la parte ${i + 1} de ${n}` })
          .click(),
      ]);
      expect(descarga.suggestedFilename()).toMatch(
        new RegExp(`-parte-${i + 1}-de-${n}\\.csv$`),
      );
      partes.push(readFileSync((await descarga.path())!));
    }
    const [descargaManifiesto] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("link", { name: "Guardar el manifiesto de las partes" })
        .click(),
    ]);
    const manifiesto = JSON.parse(
      readFileSync((await descargaManifiesto.path())!, "utf8"),
    ) as {
      sha256: string;
      bytes: number;
      partes: { nombre: string; sha256: string; bytes: number }[];
    };

    const entero = Buffer.concat(partes);
    expect(sha(entero)).toBe(manifiesto.sha256);
    expect(entero.length).toBe(manifiesto.bytes);
    expect(manifiesto.partes.map((p) => p.sha256)).toEqual(partes.map(sha));
    // El encabezado va solo en la primera parte, y el todo tiene sus 100.000 filas.
    const texto = entero.toString("utf8");
    expect(texto.split("\n").length - 1).toBe(100_001);
    expect(
      partes
        .slice(1)
        .some((p) => p.toString("utf8").startsWith("cedula_titular")),
    ).toBe(false);
    // Y la huella del todo es la del certificado.
    expect(await huellaDelCertificado(page)).toContain(manifiesto.sha256);
    await contexto.close();
  });
});
