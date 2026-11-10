// Sonda: cancelar a medias la descarga de un archivo de alto volumen, en el navegador que se elija.
//
// S11 (hallazgos): el e2e `tests/e2e/descarga-en-flujo.spec.ts` prueba la cancelación en Chromium.
// Esta sonda hace lo mismo en el Firefox o el WebKit de Playwright (`NAVEGADOR=firefox|webkit`), que
// el e2e no corre: abre una descarga por el service worker, la cancela en cuanto el navegador la
// empieza (`download.cancel()`), y comprueba tres cosas:
//   1. la pantalla dice «No se pudo escribir el archivo» (no se queda en «Escribiendo…»);
//   2. no se ofrece un archivo a medias;
//   3. volver a prepararlo sale entero: 100 001 líneas y los bytes que dice el certificado.
//
// Se corre a mano contra el build: `pnpm build && NAVEGADOR=firefox node tests/medicion/cancelar-descarga.mjs`.
// El archivo es el `ancho` sembrado que el global-setup de los e2e deja en `tmp/e2e/` (si no está,
// la sonda lo genera con el mismo generador y la misma semilla). Regla 17-bis: declara su árbol al
// arrancar; ningún dato real entra aquí. Abre `next start` en 127.0.0.1:3300 si nadie escucha allí
// y lo cierra al terminar.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

import { chromium, firefox, webkit } from "@playwright/test";

const RAIZ = new URL("../..", import.meta.url).pathname;
const TMP = join(RAIZ, "tmp");
const ARCHIVO = join(TMP, "e2e", "ancho-100000-s42.csv");
const SALIDA = join(TMP, "cancelar-descarga");
const NAVEGADOR = process.env.NAVEGADOR ?? "firefox";
const PUERTO = 3300;
const BASE = `http://127.0.0.1:${PUERTO}`;
const FRASE_DE_LLAVE = "una frase de la llave de la sonda de cancelar";

console.log("Árbol que toca esta sonda:");
console.log(`  lee      ${ARCHIVO} (generador sembrado, seed 42)`);
console.log(`  escribe  ${SALIDA}/ (descargas de la sonda)`);

if (!existsSync(ARCHIVO)) {
  mkdirSync(join(TMP, "e2e"), { recursive: true });
  execFileSync(
    "node",
    [
      join(RAIZ, "docs/kit-de-prueba/generador.mjs"),
      ...["--filas", "100000", "--seed", "42", "--perfil", "ancho"],
      ...["--salida", ARCHIVO],
    ],
    { stdio: "inherit" },
  );
}
mkdirSync(SALIDA, { recursive: true });

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const resultados = [];
const anota = (ok, texto) => {
  resultados.push(ok);
  console.log(`${ok ? "OK    " : "FALLA "} ${texto}`);
};

const escucha = () =>
  new Promise((listo) => {
    const s = connect(PUERTO, "127.0.0.1");
    s.once("connect", () => (s.destroy(), listo(true)));
    s.once("error", () => listo(false));
  });
let servidorPropio = null;
if (!(await escucha())) {
  servidorPropio = spawn("pnpm", ["start"], { cwd: RAIZ, stdio: "ignore", detached: true });
  for (let i = 0; i < 100 && !(await escucha()); i++)
    await new Promise((r) => setTimeout(r, 200));
}

const navegador = await { chromium, firefox, webkit }[NAVEGADOR].launch();
let falloGrave = null;
try {
  const contexto = await navegador.newContext({ locale: "es-CO", acceptDownloads: true });
  const page = await contexto.newPage();
  const delServiceWorker = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname.startsWith("/descarga/"))
      delServiceWorker.push(r.fromServiceWorker());
  });

  await page.goto(BASE + "/");
  await page.setInputFiles("#archivo", ARCHIVO);
  await page.waitForURL("**/diagnostico", { timeout: 300_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE_DE_LLAVE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page.getByRole("heading", { name: "Llave lista" }).waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 300_000 });

  const preparar = page.getByRole("button", { name: "Preparar el archivo" });

  // 1ª vez: se cancela en cuanto el navegador empieza a bajar.
  const [cancelada] = await Promise.all([
    page.waitForEvent("download", { timeout: 300_000 }),
    preparar.click(),
  ]);
  await cancelada.cancel();
  anota((await cancelada.failure()) === "canceled", `${NAVEGADOR}: el navegador da la descarga por cancelada`);
  const alerta = page.getByRole("alert").filter({ hasText: "No se pudo escribir el archivo" });
  let dicho = true;
  try {
    await alerta.waitFor({ timeout: 60_000 });
  } catch {
    dicho = false;
  }
  anota(dicho, `${NAVEGADOR}: la pantalla dice «No se pudo escribir el archivo» tras cancelar`);
  anota(
    (await page.getByText(/Enviado a la descarga de tu navegador/).count()) === 0,
    `${NAVEGADOR}: no se ofrece un archivo a medias`,
  );
  anota(await preparar.isEnabled(), `${NAVEGADOR}: «Preparar el archivo» vuelve a estar disponible`);

  // 2ª vez: sale entero y es el que dice el certificado.
  const [entera] = await Promise.all([
    page.waitForEvent("download", { timeout: 300_000 }),
    preparar.click(),
  ]);
  const ruta = join(SALIDA, `repetida-${NAVEGADOR}.csv`);
  await entera.saveAs(ruta);
  await page
    .getByText(/Enviado a la descarga de tu navegador/)
    .waitFor({ timeout: 300_000 });
  const bytes = readFileSync(ruta);
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar el certificado" }).click(),
  ]);
  const html = readFileSync(await certificado.path(), "utf8");
  anota(html.includes(sha(bytes)), `${NAVEGADOR}: la segunda descarga tiene los bytes del certificado (${bytes.length})`);
  anota(
    bytes.toString("utf8").split("\n").length - 1 === 100_001,
    `${NAVEGADOR}: la segunda descarga trae las 100 001 líneas`,
  );
  anota(
    delServiceWorker.length === 2 && delServiceWorker.every(Boolean),
    `${NAVEGADOR}: las dos respuestas las dio el service worker (${JSON.stringify(delServiceWorker)})`,
  );
  await contexto.close();
} catch (error) {
  falloGrave = error;
  console.error(error);
} finally {
  await navegador.close();
  if (servidorPropio) {
    try {
      process.kill(-servidorPropio.pid);
    } catch {
      /* ya cerrado */
    }
  }
}

writeFileSync(join(SALIDA, `resultado-${NAVEGADOR}.json`), JSON.stringify({ navegador: NAVEGADOR, resultados }));
const bien = !falloGrave && resultados.length > 0 && resultados.every(Boolean);
console.log(bien ? `\n${NAVEGADOR}: la cancelación se comporta como en Chromium.` : `\n${NAVEGADOR}: HAY FALLAS.`);
process.exit(bien ? 0 : 1);
