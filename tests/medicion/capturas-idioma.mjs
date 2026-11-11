// Pasada de capturas del builder — el conmutador de idioma (S5).
//
// Se corre a mano contra un `pnpm start` ya levantado (con `tsx`, porque reutiliza el traductor del
// e2e en inglés, que lee los catálogos `{ es, en }`):
//   pnpm exec tsx tests/medicion/capturas-idioma.mjs
//
// Además del conmutador, recorre TODO el flujo en inglés (el taller, la llave, el resultado, la
// bóveda, el regreso y la bitácora) y deja una imagen por pantalla, en móvil y escritorio, claro y
// oscuro. Los archivos que descarga van a `tmp/capturas-en/` (ignorado, todo sintético).
//
// No sustituye a un test: PRODUCE imágenes para mirarlas y MIDE dos cosas que una imagen no dice.
// La regla 22 de la constitución pide que la pasada active cada control nuevo y compruebe que
// ALGO cambió (un control dibujado sin su efecto es el defecto que esa regla existe para cazar), y
// el inglés suele ser más largo que el español, así que el encabezado —donde ahora viven el
// conmutador y el sello— se mide por si se desborda en un teléfono estrecho.
//
// Sale con código distinto de cero si el conmutador no cambió nada o si algo se desbordó.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, devices } from "@playwright/test";

import { crearTraductor } from "../e2e/ingles-completo-lexico.ts";

const SALIDA = join(process.cwd(), "tmp", "capturas");
mkdirSync(SALIDA, { recursive: true });

const BASE = process.env.BASE ?? "http://127.0.0.1:3300";
const FIXTURE = join(process.cwd(), "tmp", "e2e", "clinico-2000-s42.csv");

const FRASES = {
  llave: "a long passphrase for the test",
  boveda: "another long passphrase, the vault one",
  bitacora: "one more long passphrase for the log",
};
const DESCARGAS = join(process.cwd(), "tmp", "capturas-en");
mkdirSync(DESCARGAS, { recursive: true });
const en = await crearTraductor();

const PANTALLAS = [
  {
    nombre: "movil-360",
    ...devices["Pixel 7"],
    viewport: { width: 360, height: 740 },
  },
  { nombre: "movil", ...devices["Pixel 7"] },
  { nombre: "escritorio", viewport: { width: 1280, height: 900 } },
];

const fallos = [];
const navegador = await chromium.launch();

for (const pantalla of PANTALLAS) {
  for (const tema of ["light", "dark"]) {
    const { nombre, ...opciones } = pantalla;
    const sufijo = `${nombre}-${tema}`;
    const contexto = await navegador.newContext({
      ...opciones,
      colorScheme: tema,
      locale: "es-CO",
    });
    const pagina = await contexto.newPage();

    const desborde = () =>
      pagina.evaluate(() => ({
        ancho: document.documentElement.clientWidth,
        contenido: document.documentElement.scrollWidth,
        encabezado: document.querySelector("header")?.scrollWidth ?? 0,
        encabezadoVisible: document.querySelector("header")?.clientWidth ?? 0,
      }));
    const mide = async (donde) => {
      const d = await desborde();
      if (d.contenido > d.ancho + 1 || d.encabezado > d.encabezadoVisible + 1)
        fallos.push(
          `${sufijo} · ${donde}: desborde horizontal ${JSON.stringify(d)}`,
        );
    };
    const lang = () => pagina.evaluate(() => document.documentElement.lang);
    const pie = () => pagina.locator("footer p").first().innerText();

    // 1. La aduana en español, tal como llega.
    await pagina.goto(`${BASE}/`);
    await pagina.getByRole("group", { name: "Idioma · Language" }).waitFor();
    const lemaEs = await pie();
    await mide("aduana-es");
    await pagina.screenshot({
      path: join(SALIDA, `idioma-aduana-es-${sufijo}.png`),
      fullPage: true,
    });

    // 2. Se ACTIVA el control y se comprueba que algo cambió (regla 22).
    await pagina.getByRole("button", { name: "English" }).click();
    await pagina.waitForFunction(
      () => document.documentElement.lang === "en-US",
    );
    const lemaEn = await pie();
    if (lemaEn === lemaEs)
      fallos.push(`${sufijo}: el conmutador no cambió el texto del pie`);
    if ((await lang()) !== "en-US")
      fallos.push(`${sufijo}: el lang no pasó a en-US`);
    await mide("aduana-en");
    await pagina.screenshot({
      path: join(SALIDA, `idioma-aduana-en-${sufijo}.png`),
      fullPage: true,
    });

    // 3. El encabezado solo, de cerca (es lo que cambió a la vista).
    await pagina
      .locator("header")
      .screenshot({ path: join(SALIDA, `idioma-encabezado-en-${sufijo}.png`) });
    await pagina.getByRole("button", { name: "Español" }).click();
    await pagina.waitForFunction(
      () => document.documentElement.lang === "es-CO",
    );
    await pagina
      .locator("header")
      .screenshot({ path: join(SALIDA, `idioma-encabezado-es-${sufijo}.png`) });

    // 4. El diagnóstico en inglés con un archivo sintético: textos largos, tabla, cifras con coma.
    await pagina.getByRole("button", { name: "English" }).click();
    await pagina.setInputFiles("#archivo", FIXTURE);
    await pagina.waitForURL("**/diagnostico");
    await pagina.getByRole("heading", { level: 1 }).waitFor();
    await mide("diagnostico-en");
    await pagina.screenshot({
      path: join(SALIDA, `idioma-diagnostico-en-${sufijo}.png`),
      fullPage: true,
    });

    await contexto.close();

    // 5. El flujo entero en inglés, con un archivo de verdad (el navegador abre en inglés).
    if (nombre !== "movil-360") {
      await recorridoEnIngles({ nombre, opciones, tema, sufijo });
    }
  }
}

/** Toda la ida y el regreso en inglés: una imagen por pantalla y el desborde de cada una. */
async function recorridoEnIngles({ opciones, tema, sufijo }) {
  const abrir = async () => {
    const contexto = await navegador.newContext({
      ...opciones,
      colorScheme: tema,
      locale: "en-US",
    });
    return { contexto, pagina: await contexto.newPage() };
  };
  const { contexto, pagina } = await abrir();
  const foto = async (paso) => {
    const d = await pagina.evaluate(() => ({
      ancho: document.documentElement.clientWidth,
      contenido: document.documentElement.scrollWidth,
    }));
    if (d.contenido > d.ancho + 1)
      fallos.push(
        `${sufijo} · ${paso}: desborde horizontal ${JSON.stringify(d)}`,
      );
    await pagina.screenshot({
      path: join(SALIDA, `idioma-${paso}-en-${sufijo}.png`),
      fullPage: true,
    });
  };

  await pagina.goto(`${BASE}/`);
  if ((await pagina.evaluate(() => document.documentElement.lang)) !== "en-US")
    fallos.push(`${sufijo}: el navegador en inglés no abrió la app en inglés`);
  await foto("aduana-vacia");

  await pagina.setInputFiles("#archivo", FIXTURE);
  await pagina.waitForURL("**/diagnostico", { timeout: 150_000 });
  const transformar = pagina.getByRole("link", {
    name: en("Transformar este archivo"),
  });
  await transformar.waitFor({ timeout: 60_000 });
  await foto("diagnostico-completo");
  await transformar.click();
  await pagina.waitForURL("**/transformar");
  await pagina
    .getByLabel(
      en("Técnica para la columna {columna}", { columna: "cedula_titular" }),
    )
    .selectOption("seudonimizar");
  await pagina.getByRole("checkbox").first().check();
  await foto("taller");

  await pagina.getByLabel(en("Frase de paso del proyecto")).fill(FRASES.llave);
  await pagina.getByRole("button", { name: en("Derivar la llave") }).click();
  await pagina
    .getByRole("heading", { name: en("Llave lista") })
    .waitFor({ timeout: 60_000 });
  await pagina
    .getByRole("button", { name: en("Transformar"), exact: true })
    .click();
  await pagina
    .getByRole("heading", {
      name: en.enAlguna("Qué cambió, y qué sigue igual"),
    })
    .waitFor({ timeout: 60_000 });
  await foto("resultado");

  await pagina.getByRole("button", { name: en("Preparar el archivo") }).click();
  const guardar = pagina.getByRole("link", { name: /^Save velo-anonimizado-/ });
  await guardar.waitFor({ timeout: 60_000 });
  const [descarga] = await Promise.all([
    pagina.waitForEvent("download"),
    guardar.click(),
  ]);
  const anonimizado = join(DESCARGAS, `anonimizado-${sufijo}.csv`);
  await descarga.saveAs(anonimizado);

  await pagina.getByLabel(en("Frase de paso de la bóveda")).fill(FRASES.boveda);
  await pagina
    .getByRole("button", { name: en("Cifrar y preparar la bóveda") })
    .click();
  const [descargaVelo] = await Promise.all([
    pagina.waitForEvent("download"),
    pagina
      .getByRole("link", { name: en("Guardar la bóveda") })
      .click({ timeout: 60_000 }),
  ]);
  const boveda = join(DESCARGAS, `boveda-${sufijo}.velo`);
  await descargaVelo.saveAs(boveda);
  await foto("boveda-guardada");

  await pagina
    .getByRole("button", { name: en("Anotar en mi bitácora") })
    .click();
  await pagina.waitForURL("**/bitacora");
  await pagina
    .getByLabel(en("Elige la frase de paso de tu bitácora"))
    .waitFor({ timeout: 60_000 });
  await foto("bitacora-primera-anotacion");
  await pagina
    .getByLabel(en("Elige la frase de paso de tu bitácora"))
    .fill(FRASES.bitacora);
  await pagina
    .getByRole("button", { name: en("Cifrar y empezar la bitácora") })
    .click();
  const [descargaLog] = await Promise.all([
    pagina.waitForEvent("download"),
    pagina
      .getByRole("link", { name: en("Guardar la bitácora") })
      .first()
      .click({ timeout: 60_000 }),
  ]);
  const bitacora = join(DESCARGAS, `bitacora-${sufijo}.velolog`);
  await descargaLog.saveAs(bitacora);
  await foto("bitacora-guardada");
  await contexto.close();

  // El regreso, y la bitácora abierta, en otra sesión.
  const segunda = await abrir();
  const p2 = segunda.pagina;
  const foto2 = async (paso) => {
    const d = await p2.evaluate(() => ({
      ancho: document.documentElement.clientWidth,
      contenido: document.documentElement.scrollWidth,
    }));
    if (d.contenido > d.ancho + 1)
      fallos.push(
        `${sufijo} · ${paso}: desborde horizontal ${JSON.stringify(d)}`,
      );
    await p2.screenshot({
      path: join(SALIDA, `idioma-${paso}-en-${sufijo}.png`),
      fullPage: true,
    });
  };
  await p2.goto(`${BASE}/regreso`);
  await foto2("regreso-vacio");
  await p2.getByLabel(en("Elegir el archivo de bóveda")).setInputFiles(boveda);
  await p2.getByLabel(en("Frase de paso de la bóveda")).fill(FRASES.boveda);
  await p2.getByRole("button", { name: en("Abrir la bóveda") }).click();
  await p2
    .getByRole("heading", { name: en("Bóveda abierta") })
    .waitFor({ timeout: 60_000 });
  await foto2("regreso-boveda-abierta");
  await p2
    .getByLabel(en("Elegir el archivo que devolvió el tercero"))
    .setInputFiles(anonimizado);
  const restaurar = p2.getByRole("button", {
    name: en("Restaurar los valores originales"),
  });
  await restaurar.waitFor({ timeout: 60_000 });
  await restaurar.click();
  const preparar = p2.getByRole("button", {
    name: en("Preparar el archivo restaurado"),
  });
  await preparar.waitFor({ timeout: 60_000 });
  await preparar.click();
  await p2
    .getByRole("link", { name: en("Guardar el archivo restaurado") })
    .waitFor({ timeout: 60_000 });
  await foto2("regreso-restaurado");

  await p2.goto(`${BASE}/bitacora`);
  await p2.getByLabel(en("Archivo de bitácora")).setInputFiles(bitacora);
  await p2.getByLabel(en("Frase de paso")).fill(FRASES.bitacora);
  await p2.getByRole("button", { name: en("Abrir la bitácora") }).click();
  await p2
    .getByRole("heading", { name: en("Un tratamiento anotado") })
    .waitFor({ timeout: 60_000 });
  await foto2("bitacora-abierta");

  await p2.goto(`${BASE}/conoce`);
  await p2.waitForLoadState("load");
  await foto2("conoce");
  await segunda.contexto.close();
}

await navegador.close();

if (fallos.length) {
  console.error(`✗ ${fallos.length} problema(s):\n  ${fallos.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `✓ el conmutador cambia el texto y el lang, y nada se desborda · imágenes en ${SALIDA}`,
);
