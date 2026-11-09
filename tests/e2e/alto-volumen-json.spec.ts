// JSON en alto volumen de punta a punta (S9): un JSON Lines con más celdas (registros × campos) que
// el tope de la memoria se diagnostica por pasadas, se anonimiza con una cédula reversible, se
// guarda como JSON Lines, y vuelve con su bóveda en OTRA sesión. Al final, lo más fuerte: el
// restaurado es el ORIGINAL, byte a byte. Y en todo el recorrido, la red no ve nada.
//
// Como el del CSV (`alto-volumen.spec.ts`), va por la vía del `Blob`: el selector de archivo del
// sistema no se puede automatizar. El archivo pesa ~316 MB (en JSON cada celda lleva su clave): por
// eso corre en un solo proyecto.

import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const ANCHO = nombreDeFixture("ancho", 100_000, 42, "jsonl");
const FRASE_DE_LLAVE = "una frase de la llave del json en alto volumen";
const FRASE_DE_BOVEDA = "otra frase distinta para la boveda del json";

const huella = (ruta: string) =>
  createHash("sha256").update(readFileSync(ruta)).digest("hex");

/** La primera línea del archivo, sin leerlo entero. */
function primeraLinea(ruta: string): string {
  const asa = openSync(ruta, "r");
  try {
    const buffer = Buffer.alloc(16 * 1024);
    const leidos = readSync(asa, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, leidos).split("\n", 1)[0];
  } finally {
    closeSync(asa);
  }
}

function vigilarLaRed(page: Page, origen: string): string[] {
  const sospechosas: string[] = [];
  page.on("request", (peticion) => {
    const url = new URL(peticion.url());
    if (url.origin !== origen)
      sospechosas.push(`fuera del origen: ${url.href}`);
    if (peticion.postData()) sospechosas.push(`con cuerpo: ${url.pathname}`);
  });
  page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));
  return sospechosas;
}

/** Sin selector de archivo: la vía del `Blob`, la que se puede automatizar. */
async function sinSelector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as Window & { showSaveFilePicker?: unknown })
      .showSaveFilePicker;
  });
}

test("un JSON Lines de 21 millones de celdas: por pasadas, y vuelve igual al original byte a byte, sin red", async ({
  browser,
  baseURL,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "el archivo de alto volumen corre en un solo proyecto",
  );
  test.setTimeout(600_000);
  const origen = new URL(baseURL!).origin;

  // ── Sesión 1: anonimizar con una cédula reversible ───────────────────────────────────────────
  // S11: sin service worker, que es la vía del `Blob` que este test recorre. Con él, «Preparar el
  // archivo» entrega el archivo por la descarga del navegador, y eso lo prueba `descarga-en-flujo`.
  const contextoA = await browser.newContext({ serviceWorkers: "block" });
  const page = await contextoA.newPage();
  await sinSelector(page);
  const redA = vigilarLaRed(page, origen);
  await page.goto("/");
  await page.setInputFiles("#archivo", ANCHO);
  await page.waitForURL("**/diagnostico", { timeout: 420_000 });
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
    .waitFor({ timeout: 420_000 });

  await expect(
    page.getByText(/este navegador no deja elegir un archivo de destino/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  // Sale como JSON Lines: el nombre lo dice.
  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-.*\.jsonl$/,
  });
  await guardar.waitFor({ timeout: 420_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  const anonimizado = join(
    DIRECTORIO_DE_FIXTURES,
    "alto-volumen-json-anonimizado.jsonl",
  );
  await descarga.saveAs(anonimizado);

  await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await page
    .getByRole("button", { name: "Cifrar y preparar la bóveda" })
    .click();
  const [descargaVelo] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Guardar la bóveda" })
      .click({ timeout: 60_000 }),
  ]);
  const boveda = join(DIRECTORIO_DE_FIXTURES, "alto-volumen-json.velo");
  await descargaVelo.saveAs(boveda);
  await contextoA.close();

  // Lo entregado es JSON Lines y no lleva la cédula original de la primera fila.
  const original = JSON.parse(primeraLinea(ANCHO)) as Record<string, unknown>;
  const entregado = JSON.parse(primeraLinea(anonimizado)) as Record<
    string,
    unknown
  >;
  expect(Object.keys(entregado)).toEqual(Object.keys(original));
  expect(entregado.cedula_titular).not.toBe(original.cedula_titular);

  // ── Sesión 2: el regreso, en otra sesión, también por pasadas ────────────────────────────────
  const contextoB = await browser.newContext();
  const paginaB = await contextoB.newPage();
  await sinSelector(paginaB);
  const redB = vigilarLaRed(paginaB, origen);
  await paginaB.goto("/regreso");
  await paginaB.getByLabel("Elegir el archivo de bóveda").setInputFiles(boveda);
  await paginaB.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await paginaB.getByRole("button", { name: "Abrir la bóveda" }).click();
  await paginaB
    .getByRole("heading", { name: "Bóveda abierta" })
    .waitFor({ timeout: 60_000 });
  await paginaB
    .getByLabel("Elegir el archivo que devolvió el tercero")
    .setInputFiles(anonimizado);
  await expect(paginaB.getByText(/100\.000 filas/)).toBeVisible({
    timeout: 420_000,
  });
  await paginaB
    .getByRole("button", { name: "Restaurar los valores originales" })
    .click();
  await paginaB
    .getByRole("button", { name: "Preparar el archivo restaurado" })
    .waitFor({ timeout: 420_000 });
  await paginaB
    .getByRole("button", { name: "Preparar el archivo restaurado" })
    .click();
  const [descargaB] = await Promise.all([
    paginaB.waitForEvent("download"),
    paginaB
      .getByRole("link", { name: "Guardar el archivo restaurado" })
      .click({ timeout: 420_000 }),
  ]);
  const restaurado = join(
    DIRECTORIO_DE_FIXTURES,
    "alto-volumen-json-restaurado.jsonl",
  );
  await descargaB.saveAs(restaurado);
  await contextoB.close();

  // Lo más fuerte que se puede decir: el restaurado ES el original, byte a byte.
  expect(huella(restaurado)).toBe(huella(ANCHO));
  expect([...redA, ...redB]).toEqual([]);
});
