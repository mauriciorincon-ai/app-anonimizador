// Medición del alto volumen: el pico de memoria y los tiempos de la ida y del regreso.
//
// S11: en Chromium (por omisión) y, con `NAVEGADOR=firefox` o `NAVEGADOR=webkit`, en el Firefox y el
// WebKit de Playwright, que no tienen selector de archivo del sistema. `SERVICE_WORKER=0` bloquea el
// service worker de la descarga: sin él, el CSV sale por el respaldo por partes (armado en memoria),
// que es lo que antes de la F3 hacían todos los navegadores sin selector; con él, por el canal a la
// descarga del navegador. `SOLO_IDA=1` termina tras escribir y descargar el anonimizado (sin bóveda
// ni regreso): es lo que cambia en la F3 y lo único que hace falta medir en esos navegadores.
// El pico de Firefox y de WebKit es el RSS de los procesos cuyo ejecutable vive en `ms-playwright/`
// (los de WebKit no cuelgan de este proceso en macOS), y se compara contra sí mismo, no con Chromium.
//
// Se corre a mano, contra el build: `pnpm build && node tests/medicion/pico-alto-volumen.mjs`. No entra
// a la CI porque tarda unos veinte minutos y no verifica nada salvo el regreso (la columna con
// bóveda vuelve a la original y las demás quedan como en el anonimizado, celda a celda): MIDE. Es la prueba del S8 (ADR-015, `tmp/medir-5m.mjs`, que no se versionó),
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

import { chromium, firefox, webkit } from "@playwright/test";
import Papa from "papaparse";

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
const NAVEGADOR = process.env.NAVEGADOR ?? "chromium";
const SERVICE_WORKER = process.env.SERVICE_WORKER !== "0";
const SOLO_IDA = Boolean(process.env.SOLO_IDA);
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

/**
 * Una huella por columna, sobre los VALORES y no sobre los bytes: el regreso vuelve a escribir el
 * CSV y lo que se compara es qué dice cada celda, no cómo se citó.
 */
async function huellasPorColumna(ruta) {
  let nombres = null;
  let hashes = [];
  // Como texto, no como bytes: PapaParse decodifica cada trozo del stream por su cuenta y una
  // letra con tilde partida entre dos trozos se vuelve otra cosa.
  await new Promise((resuelto, fallo) =>
    Papa.parse(createReadStream(ruta, { encoding: "utf8" }), {
      skipEmptyLines: true,
      step: ({ data }) => {
        if (nombres === null) {
          nombres = data;
          hashes = data.map(() => createHash("sha256"));
          return;
        }
        hashes.forEach((hash, c) => hash.update(`${data[c] ?? ""}\u0000`));
      },
      complete: resuelto,
      error: fallo,
    }),
  );
  return { nombres, huellas: hashes.map((hash) => hash.digest("hex")) };
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

const nav = await { chromium, firefox, webkit }[NAVEGADOR].launchPersistentContext(PERFIL, {
  locale: "es-CO",
  acceptDownloads: true,
  serviceWorkers: SERVICE_WORKER ? "allow" : "block",
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
/** Los procesos de Firefox o de WebKit de Playwright: por su ejecutable, no por quién los lanzó. */
const delNavegadorPorRuta = () => {
  try {
    return execFileSync("ps", ["-axo", "pid=,rss=,command="], { encoding: "utf8" })
      .split("\n")
      .filter((linea) => linea.includes(`ms-playwright/${NAVEGADOR}`))
      .map((linea) => Number(linea.trim().split(/\s+/)[1]));
  } catch {
    return [];
  }
};
const muestreo = setInterval(() => {
  if (NAVEGADOR !== "chromium") {
    for (const rss of delNavegadorPorRuta()) {
      picoDelPaso = Math.max(picoDelPaso, rss);
      picoTotal = Math.max(picoTotal, rss);
    }
    return;
  }
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

/** `SOLO_IDA`: se acabó lo que había que medir; no es un fallo. */
class Termino extends Error {}

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

  const anonimizado = join(SALIDA, "anonimizado.csv");
  if (SERVICE_WORKER) {
    // S11: «Preparar el archivo» dispara la descarga y el archivo se guarda mientras se escribe.
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 60 * MINUTOS }),
      page.getByRole("button", { name: "Preparar el archivo" }).click(),
    ]);
    await page
      .getByText(/Enviado a la descarga de tu navegador/)
      .waitFor({ timeout: 60 * MINUTOS });
    marca("C · escribir (service worker)");
    await descarga.saveAs(anonimizado);
  } else {
    await page.getByRole("button", { name: "Preparar el archivo" }).click();
    // Sin service worker: un solo archivo si cabe en una parte, o el respaldo por partes.
    const guardar = page.getByRole("link", { name: /^Guardar velo-anonimizado-/ });
    const partes = page.getByText(/salió en \d+ partes/);
    await Promise.race([
      guardar.waitFor({ timeout: 60 * MINUTOS }),
      partes.waitFor({ timeout: 60 * MINUTOS }),
    ]);
    marca("C · escribir (en memoria)");
    if ((await guardar.count()) > 0) {
      const [descarga] = await Promise.all([page.waitForEvent("download"), guardar.click()]);
      await descarga.saveAs(anonimizado);
    }
  }
  if (SOLO_IDA) throw new Termino();

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

  // Habeas Data deja casi todo anonimizado a propósito: lo único que vuelve es `nombre_completo`.
  // El regreso está bien si esa columna es la original y todas las demás son las del anonimizado.
  const [original, ida, vuelta] = [
    await huellasPorColumna(ARCHIVO),
    await huellasPorColumna(anonimizado),
    await huellasPorColumna(restaurado),
  ];
  const nombre = vuelta.nombres.indexOf("nombre_completo");
  const enOrden = vuelta.nombres.join() === ida.nombres.join();
  const volvio =
    vuelta.huellas[nombre] === original.huellas[original.nombres.indexOf("nombre_completo")] &&
    vuelta.huellas[nombre] !== ida.huellas[nombre];
  const intactas = vuelta.huellas.every((h, c) => c === nombre || h === ida.huellas[c]);
  console.log(`nombre_completo vuelve al original: ${volvio ? "sí" : "NO"}`);
  console.log(
    `las otras ${vuelta.nombres.length - 1} columnas, iguales al anonimizado: ${enOrden && intactas ? "sí" : "NO"}`,
  );
  if (!(volvio && enOrden && intactas)) codigo = 1;
} catch (error) {
  if (!(error instanceof Termino)) {
    console.error("FALLO:", error.message);
    codigo = 1;
  }
} finally {
  clearInterval(muestreo);
  console.log(`PICO RSS del proceso más pesado: ${Math.round(picoTotal / 1024)} MB`);
  console.log(
    JSON.stringify({
      navegador: NAVEGADOR,
      serviceWorker: SERVICE_WORKER,
      filas: FILAS,
      pasos: filas,
      picoMb: Math.round(picoTotal / 1024),
    }),
  );
  await nav.close();
  if (servidorPropio) process.kill(-servidorPropio.pid);
  // `CONSERVAR=1` deja las descargas en `tmp/` para mirarlas cuando el regreso no cuadra.
  if (process.env.CONSERVAR) rmSync(PERFIL, { recursive: true, force: true });
  else rmSync(SALIDA, { recursive: true, force: true });
}
process.exit(codigo);
