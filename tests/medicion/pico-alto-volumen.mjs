// Medición del alto volumen EN CHROMIUM: el pico de memoria y los tiempos de la ida y del regreso.
//
// Se corre a mano, contra el build: `pnpm build && node tests/medicion/pico-alto-volumen.mjs`. No entra
// a la CI porque tarda unos veinte minutos y no verifica nada salvo que el regreso devuelva el
// original byte a byte: MIDE. Es la prueba del S8 (ADR-015, `tmp/medir-5m.mjs`, que no se versionó),
// ahora en el repo para que la cifra del pico sea repetible antes y después de cada cambio.
//
// El archivo: el CSV `clinico` del generador sembrado, 5 000 000 de filas × 24 columnas (1,36 GB), en
// `tmp/` (ignorado). Regla 17-bis: el arnés declara su árbol al arrancar y aborta si el archivo no es
// el del generador, comparando su SHA-256 con el de la corrida sembrada. Ningún dato real entra aquí.
//
// La política: Habeas Data, más `nombre_completo` seudonimizada con bóveda (para poder volver).
//
// La memoria es el RSS de cada proceso del navegador, muestreado cada 500 ms; el pico es el del
// proceso que más pesó (la pestaña: la página y su worker viven en él). Cuenta la basura aún no
// recogida, así que es un techo, no el montón vivo. Cada paso da su propio pico.
//
// El navegador corre con un perfil de verdad (en `tmp/`, se borra al terminar), no con un contexto de
// incógnito: en incógnito Chromium no puede pasar a disco un Blob de 1,36 GB y cancela la descarga
// (S10). Así es como lo usa una persona. Cada sesión es una pestaña nueva; la anterior se cierra.
//
// Abre `next start` en 127.0.0.1:3300 si nadie escucha allí, y lo cierra al terminar.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const RAIZ = new URL("../..", import.meta.url).pathname;
const TMP = join(RAIZ, "tmp");
const FILAS = Number(process.env.FILAS ?? 5_000_000);
const ARCHIVO = join(TMP, `clinico-${FILAS / 1_000_000}m.csv`);
const SALIDA = join(TMP, "pico-alto-volumen");
const PERFIL = join(SALIDA, "perfil");
// SHA-256 de `generador.mjs --filas 5000000 --seed 42 --perfil clinico` (verificado el 2026-11-08).
const HUELLAS = {
  5_000_000: "47f6d50707b3fddc118ce073f3b966c88f879501a93ab251b1d831bdcf70953d",
};
const PUERTO = 3300;
const BASE = `http://127.0.0.1:${PUERTO}`;
const FRASE_DE_LLAVE = "una frase de la medida de cinco millones";
const FRASE_DE_BOVEDA = "la bóveda de la medida de cinco millones";
const MINUTOS = 60_000;

console.log("Árbol que toca este arnés:");
console.log(`  lee      ${ARCHIVO} (generador sembrado, seed 42)`);
console.log(`  escribe  ${SALIDA}/ (perfil del navegador y descargas; se borra al terminar)`);

async function huella(ruta) {
  const hash = createHash("sha256");
  for await (const trozo of createReadStream(ruta)) hash.update(trozo);
  return hash.digest("hex");
}

if (!existsSync(ARCHIVO)) {
  console.log(`Generando ${ARCHIVO}…`);
  execFileSync(
    "node",
    [
      join(RAIZ, "docs/kit-de-prueba/generador.mjs"),
      ...["--filas", String(FILAS), "--seed", "42", "--perfil", "clinico"],
      ...["--salida", ARCHIVO],
    ],
    { stdio: "inherit" },
  );
}
const huellaOriginal = await huella(ARCHIVO);
if (HUELLAS[FILAS] !== undefined && HUELLAS[FILAS] !== huellaOriginal) {
  console.error(
    `ABORTA: ${ARCHIVO} no es el archivo del generador (SHA-256 ${huellaOriginal}).`,
  );
  process.exit(2);
}
mkdirSync(SALIDA, { recursive: true });

const escucha = () =>
  new Promise((listo) => {
    const s = connect(PUERTO, "127.0.0.1");
    s.once("connect", () => (s.destroy(), listo(true)));
    s.once("error", () => listo(false));
  });
let servidorPropio = null;
if (!(await escucha())) {
  // Su propio grupo de procesos: al cerrar se mata entero (pnpm y el `next start` que lanza).
  servidorPropio = spawn("pnpm", ["start"], { cwd: RAIZ, stdio: "ignore", detached: true });
  for (let i = 0; i < 100 && !(await escucha()); i++)
    await new Promise((r) => setTimeout(r, 200));
}

const nav = await chromium.launchPersistentContext(PERFIL, {
  locale: "es-CO",
  acceptDownloads: true,
});
const propios = new Set(servidorPropio ? [String(servidorPropio.pid)] : []);

const hijosDe = (p) => {
  try {
    return execFileSync("pgrep", ["-P", String(p)], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};
let picoDelPaso = 0;
let picoTotal = 0;
const muestreo = setInterval(() => {
  // Todo lo que cuelga de este proceso salvo el `next start` propio: el navegador y sus hijos.
  const pendientes = hijosDe(process.pid).filter((h) => !propios.has(h));
  const delNavegador = [];
  while (pendientes.length) {
    const h = pendientes.pop();
    delNavegador.push(h);
    pendientes.push(...hijosDe(h));
  }
  for (const h of delNavegador) {
    try {
      const rss = Number(
        execFileSync("ps", ["-o", "rss=", "-p", h], { encoding: "utf8" }).trim(),
      );
      picoDelPaso = Math.max(picoDelPaso, rss);
      picoTotal = Math.max(picoTotal, rss);
    } catch {}
  }
}, 500);

const filas = [];
let desde = Date.now();
const marca = (paso) => {
  const s = (Date.now() - desde) / 1000;
  const mb = Math.round(picoDelPaso / 1024);
  filas.push({ paso, s, mb });
  console.log(`${paso.padEnd(28)} ${s.toFixed(0).padStart(5)} s · pico ${mb} MB`);
  desde = Date.now();
  picoDelPaso = 0;
};
const sinSelector = (pagina) =>
  pagina.addInitScript(() => {
    delete window.showSaveFilePicker;
  });

let codigo = 0;
try {
  // ── La ida ────────────────────────────────────────────────────────────────────────────────────
  const page = await nav.newPage();
  await sinSelector(page);
  await page.goto(BASE + "/");
  await page.setInputFiles("#archivo", ARCHIVO);
  await page.waitForURL("**/diagnostico", { timeout: 30 * MINUTOS });
  await page
    .getByRole("heading", { name: "Este archivo se leyó por pasadas" })
    .waitFor({ timeout: MINUTOS });
  marca("A · diagnóstico");

  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("button", { name: /Habeas Data/ }).first().click();
  // Habeas Data no deja ninguna columna con bóveda, y sin bóveda no hay regreso. `nombre_completo`
  // tiene pocos distintos (325 en 500 000 filas): su bóveda cabe en alto volumen.
  const tecnica = page.getByLabel("Técnica para la columna nombre_completo");
  await tecnica.selectOption("seudonimizar");
  await tecnica
    .locator("xpath=ancestor::*[.//input[@type='checkbox']][1]")
    .getByRole("checkbox")
    .check();
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE_DE_LLAVE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page.getByRole("heading", { name: "Llave lista" }).waitFor({ timeout: MINUTOS });
  desde = Date.now();
  picoDelPaso = 0;
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await Promise.race([
    page
      .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
      .waitFor({ timeout: 60 * MINUTOS }),
    page
      .getByText("No se pudo transformar")
      .waitFor({ timeout: 60 * MINUTOS })
      .then(() => {
        throw new Error("la transformación falló");
      }),
  ]);
  marca("B+M · transformar y medir");

  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", { name: /^Guardar velo-anonimizado-/ });
  await guardar.waitFor({ timeout: 60 * MINUTOS });
  marca("C · escribir");
  const [descarga] = await Promise.all([page.waitForEvent("download"), guardar.click()]);
  const anonimizado = join(SALIDA, "anonimizado.csv");
  await descarga.saveAs(anonimizado);

  await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await page.getByRole("button", { name: "Cifrar y preparar la bóveda" }).click();
  const [descargaVelo] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Guardar la bóveda" }).click({ timeout: 10 * MINUTOS }),
  ]);
  const boveda = join(SALIDA, "boveda.velo");
  await descargaVelo.saveAs(boveda);
  await page.close();
  marca("bóveda y descargas");

  // ── El regreso, en otra sesión ────────────────────────────────────────────────────────────────
  const paginaB = await nav.newPage();
  await sinSelector(paginaB);
  await paginaB.goto(BASE + "/regreso");
  await paginaB.getByLabel("Elegir el archivo de bóveda").setInputFiles(boveda);
  await paginaB.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await paginaB.getByRole("button", { name: "Abrir la bóveda" }).click();
  await paginaB.getByRole("heading", { name: "Bóveda abierta" }).waitFor({ timeout: 10 * MINUTOS });
  marca("R0 · abrir la bóveda");
  await paginaB
    .getByLabel("Elegir el archivo que devolvió el tercero")
    .setInputFiles(anonimizado);
  const restaurar = paginaB.getByRole("button", { name: "Restaurar los valores originales" });
  await restaurar.waitFor({ timeout: 60 * MINUTOS });
  marca("R1 · leer el devuelto");
  await restaurar.click();
  const preparar = paginaB.getByRole("button", { name: "Preparar el archivo restaurado" });
  await preparar.waitFor({ timeout: 60 * MINUTOS });
  await preparar.click();
  const guardarB = paginaB.getByRole("link", { name: "Guardar el archivo restaurado" });
  await guardarB.waitFor({ timeout: 60 * MINUTOS });
  marca("R2 · restaurar y escribir");
  const [descargaB] = await Promise.all([paginaB.waitForEvent("download"), guardarB.click()]);
  const restaurado = join(SALIDA, "restaurado.csv");
  await descargaB.saveAs(restaurado);
  await paginaB.close();

  const igual = (await huella(restaurado)) === huellaOriginal;
  console.log(`regreso byte a byte igual al original: ${igual ? "sí" : "NO"}`);
  if (!igual) codigo = 1;
} catch (error) {
  console.error("FALLO:", error.message);
  codigo = 1;
} finally {
  clearInterval(muestreo);
  console.log(`PICO RSS del proceso más pesado: ${Math.round(picoTotal / 1024)} MB`);
  console.log(JSON.stringify({ filas: FILAS, pasos: filas, picoMb: Math.round(picoTotal / 1024) }));
  await nav.close();
  if (servidorPropio) process.kill(-servidorPropio.pid);
  rmSync(SALIDA, { recursive: true, force: true });
}
process.exit(codigo);
