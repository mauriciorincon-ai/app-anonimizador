// Las capturas de la app que viajan DENTRO del brochure.
//
// El brochure es un archivo autocontenido que se abre con doble clic sin internet, así que las
// imágenes no pueden ser archivos aparte: entran como `data:` URI. Este script las produce de
// punta a punta —abre la app de verdad, hace el recorrido por la UI, captura, comprime y las
// incrusta en `docs/BROCHURE.html`— para que nadie tenga que pegar base64 a mano.
//
// Reglas que este script respeta y por las que existe:
//  · Los datos son del generador sintético seeded (`docs/kit-de-prueba/`), la ÚNICA fuente
//    autorizada. En una captura de un repo público no entra un dato real (regla dura 5).
//  · Cada pantalla se captura en los DOS temas: el brochure sigue `prefers-color-scheme`, y una
//    captura clara sobre papel oscuro es un rectángulo encendido en mitad de la página.
//  · Se captura con `prefers-reduced-motion: reduce` para que la pose sea la final y no un
//    fotograma a medio camino de una transición.
//
// Uso:  pnpm build && pnpm start   (en otra terminal)
//       node scripts/capturas-brochure.mjs
//
// Requiere `cwebp` (brew install webp). Es una herramienta de taller, no de CI: las imágenes
// quedan commiteadas dentro del HTML y el script solo se corre cuando la UI cambia.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SALIDA = join(process.cwd(), "tmp", "capturas");
const BROCHURE = join(process.cwd(), "docs", "BROCHURE.html");
const MUESTRA = join(SALIDA, "muestra.csv");

/**
 * La ventana se captura ESTRECHA a propósito, y ahí está casi todo el diseño de estas imágenes.
 *
 * Una captura de 1400 px metida en una tarjeta de 620 se reduce a menos de la mitad y deja de
 * ser una pantalla para volverse una textura: se adivina la forma y no se lee una palabra.
 * Capturando a 880 —el ancho al que la app ya usa su disposición de escritorio— la reducción es
 * suave y los rótulos siguen siendo rótulos. El resto es aritmética: se guarda al doble del
 * tamaño en que se verá, para que en pantallas densas no se vea blanda.
 */
const ANCHO = 1000;
const CALIDAD = 66;
const VISTA = { width: 880, height: 900 };

const FRASE = "una frase de paso larga para la muestra";

/** Espera a que la app termine de trabajar: los estados de progreso hablan por `role="status"`. */
async function asentar(page) {
  await page.waitForTimeout(400);
}

/** Deja el archivo cargado y el diagnóstico en pantalla — el punto de partida de casi todo. */
async function hastaDiagnostico(page) {
  await page.goto(`${BASE}/`);
  await page.setInputFiles("#archivo", MUESTRA);
  await page.waitForURL("**/diagnostico", { timeout: 120_000 });
  await page.getByRole("table").first().waitFor();
  await asentar(page);
}

async function hastaTransformar(page) {
  await hastaDiagnostico(page);
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("heading", { name: "Ahora sí, transformar" }).waitFor();
  await asentar(page);
}

/**
 * Corre la transformación con la política de Habeas Data y la llave derivada.
 *
 * El orden importa y no es caprichoso: la frase de paso no existe en la pantalla hasta que la
 * política pide un seudónimo. Pedirla antes es esperar por un campo que la app tiene razones
 * para no haber puesto todavía.
 */
async function hastaTransformado(page) {
  await hastaTransformar(page);
  await page.getByRole("button", { name: /Habeas Data/ }).click();
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page.getByRole("heading", { name: "Llave lista" }).waitFor({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });
  await asentar(page);
}

const FRASE_BOVEDA = "otra frase distinta para la boveda";

/**
 * El viaje de ida: anonimiza una columna con seudónimo reversible y guarda los DOS archivos que
 * salen de ahí — el que se entrega y la bóveda que permite deshacerlo. Devuelve sus rutas.
 */
async function anonimizarConBoveda(page) {
  await hastaTransformar(page);
  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();

  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardarCsv = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardarCsv.waitFor({ timeout: 60_000 });
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    guardarCsv.click(),
  ]);
  const anonimizado = join(SALIDA, "entregado.csv");
  await csv.saveAs(anonimizado);

  await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_BOVEDA);
  await page
    .getByRole("button", { name: "Cifrar y preparar la bóveda" })
    .click();
  const [velo] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Guardar la bóveda" })
      .click({ timeout: 60_000 }),
  ]);
  const boveda = join(SALIDA, "boveda.velo");
  await velo.saveAs(boveda);

  return { anonimizado, boveda };
}

/**
 * El tercero de mentiras: añade una columna suya y devuelve las filas en otro orden.
 *
 * Es lo mínimo que hace cualquiera que reciba una tabla para trabajarla, y es exactamente lo que
 * el regreso tiene que tolerar — por eso la restauración es por VALOR y no por posición.
 */
function loQueHaceElTercero(ruta) {
  const [cabecera, ...filas] = readFileSync(ruta, "utf8").trim().split("\n");
  const devuelto = join(SALIDA, "devuelto.csv");
  writeFileSync(
    devuelto,
    [
      `${cabecera},revisado_por_el_tercero`,
      ...filas.reverse().map((f, i) => `${f},${i % 3 === 0 ? "sí" : "no"}`),
    ].join("\n"),
    "utf8",
  );
  return devuelto;
}

/**
 * Las cinco capturas, una por tarjeta del recorrido.
 *
 * Cada una declara la pantalla a la que llega y cómo se encuadra: el `ancla` es el elemento que
 * manda en la composición, `off` a qué altura de la ventana se lo coloca, y `alto` cuánto de esa
 * ventana se lleva la imagen. Encuadrar y no recortar el documento es lo que hace que la imagen
 * quepa en una tarjeta y se entienda a ese tamaño.
 */
const CAPTURAS = [
  {
    id: "diagnostico",
    // Tarjeta 1 · «Mira lo que te delata» — el archivo con su huella y el riesgo exacto.
    //
    // El texto alternativo vive aquí, con la escena, y no en el HTML: describe lo que la captura
    // ACABA de encuadrar, y si el recorte cambia tiene que cambiar con él.
    alt: "La pantalla de diagnóstico de Velo: el nombre del archivo, su huella SHA-256, cuántas columnas caen en cada categoría de la ley, y el panel de riesgo con el porcentaje exacto de registros que quedan solos.",
    async escena(page) {
      await hastaDiagnostico(page);
      return { ancla: "main", alto: 700, off: 0 };
    },
  },
  {
    id: "politica",
    // Tarjeta 2 · «Decide qué se le hace» — el panel de la política, no el titular de la página:
    // lo que cuenta esta tarjeta es la decisión columna por columna.
    alt: "El taller de Velo con la política de Habeas Data aplicada: los botones de política de fábrica, la nota que cita la Ley 1581 de 2012, y debajo cada columna con la técnica que le tocó y la casilla para poder deshacerlo con una bóveda.",
    async escena(page) {
      await hastaTransformar(page);
      await page.getByRole("button", { name: /Habeas Data/ }).click();
      const panel = page.getByRole("heading", {
        name: "Qué se le hace a cada columna",
      });
      await panel.scrollIntoViewIfNeeded();
      await asentar(page);
      return { ancla: panel, alto: 660, off: 46 };
    },
  },
  {
    id: "velado",
    // Tarjeta 3 · «Vela con exactitud» — el antes y el después, valor por valor.
    alt: "La vista previa de Velo, en tres columnas: el nombre de la columna, el valor de antes enmascarado y el de después. Las cédulas siguen teniendo diez dígitos y los NIT conservan su guion y su dígito de verificación.",
    async escena(page) {
      await hastaTransformado(page);
      const previa = page.getByRole("heading", {
        name: "Qué va a recibir la otra persona",
      });
      await previa.scrollIntoViewIfNeeded();
      await asentar(page);
      return { ancla: previa, alto: 600, off: 46 };
    },
  },
  {
    id: "riesgo",
    // Tarjeta 4 · «Mide el riesgo de verdad»
    alt: "El balance de Velo después de transformar: cuánto bajó el riesgo de reidentificación, cuántos registros siguen quedando solos y qué columnas se conservaron intactas.",
    async escena(page) {
      await hastaTransformado(page);
      const cambio = page.getByRole("heading", {
        name: "Qué cambió, y qué sigue igual",
      });
      await cambio.scrollIntoViewIfNeeded();
      await asentar(page);
      return { ancla: cambio, alto: 640, off: 46 };
    },
  },
  {
    id: "regreso",
    // Tarjeta 5 ⭐ · «Entrega, recupera, deja constancia»
    //
    // Esta captura hace el VIAJE ENTERO antes de disparar: anonimiza con bóveda, guarda los dos
    // archivos, le pasa el anonimizado por encima a un tercero de mentiras y lo trae de vuelta.
    // Cuesta unos cuarenta segundos y vale cada uno: la tarjeta estrella es el round-trip, y un
    // formulario vacío pidiendo la bóveda no enseña el round-trip — enseña un formulario vacío.
    alt: "El regreso terminado: Velo informa cuántos valores originales volvieron desde la bóveda, y conserva la columna que la otra persona añadió mientras trabajaba con el archivo.",
    async escena(page) {
      const { anonimizado, boveda } = await anonimizarConBoveda(page);
      const devuelto = loQueHaceElTercero(anonimizado);

      await page.goto(`${BASE}/regreso`);
      await page
        .getByLabel("Elegir el archivo de bóveda")
        .setInputFiles(boveda);
      await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_BOVEDA);
      await page.getByRole("button", { name: "Abrir la bóveda" }).click();
      await page
        .getByRole("heading", { name: "Bóveda abierta" })
        .waitFor({ timeout: 60_000 });

      await page
        .getByLabel("Elegir el archivo que devolvió el tercero")
        .setInputFiles(devuelto);
      await page
        .getByRole("button", { name: "Restaurar los valores originales" })
        .click({ timeout: 60_000 });
      const listo = page.getByRole("button", {
        name: "Preparar el archivo restaurado",
      });
      await listo.waitFor({ timeout: 60_000 });
      await listo.scrollIntoViewIfNeeded();
      await asentar(page);
      return { ancla: listo, alto: 640, off: 520 };
    },
  },
];

function png(id, tema) {
  return join(SALIDA, `brochure-${id}-${tema}.png`);
}
function webp(id, tema) {
  return join(SALIDA, `brochure-${id}-${tema}.webp`);
}

/**
 * Alto en píxeles de cada imagen ya reducida, medido al capturar.
 *
 * Va al `<img>` junto al ancho, y no es cosmético: sin las dos medidas el navegador no sabe
 * cuánto espacio reservar y la página salta cuando la imagen carga. En un brochure que se
 * recorre —y cuyas tarjetas se abren solas al bajar— ese salto sería el defecto que este mismo
 * PR viene a corregir.
 */
const ALTOS = {};

async function capturar(navegador, tema) {
  const contexto = await navegador.newContext({
    viewport: VISTA,
    deviceScaleFactor: 2,
    colorScheme: tema === "oscuro" ? "dark" : "light",
    reducedMotion: "reduce",
  });
  const page = await contexto.newPage();

  for (const { id, escena } of CAPTURAS) {
    const { ancla, alto, off = 0 } = await escena(page);
    const el = typeof ancla === "string" ? page.locator(ancla) : ancla;

    // Se COLOCA la pantalla y se captura la VENTANA, no el documento: recortar el documento
    // dejaba el encabezado fijo de la app flotando en mitad de la imagen, porque un elemento
    // `sticky` se pinta donde el scroll lo dejó y una captura de página entera lo congela ahí.
    //
    // Y el encuadre empieza JUSTO DEBAJO de ese encabezado. Es semitransparente —en la app se
    // ve pasar el contenido por detrás, que ahí está bien— pero en una imagen quieta eso es un
    // titular fantasma partido por la mitad, y parece un error de dibujo. Lo que sitúa cada
    // captura es el rótulo con la ruta que el brochure le pone encima, no el encabezado.
    const cabecera = await page
      .locator("body > header, header")
      .first()
      .count();
    const altoCabecera = cabecera
      ? await page
          .locator("body > header, header")
          .first()
          .evaluate((n) => Math.round(n.getBoundingClientRect().height))
      : 0;

    await el.evaluate(
      (nodo, [tapa, margen]) => {
        const y =
          nodo.getBoundingClientRect().top + window.scrollY - tapa - margen;
        window.scrollTo(0, Math.max(0, y));
      },
      [altoCabecera, off],
    );
    await page.waitForTimeout(250);

    ALTOS[id] = Math.round((ANCHO * alto) / VISTA.width);
    await page.screenshot({
      path: png(id, tema),
      clip: { x: 0, y: altoCabecera, width: VISTA.width, height: alto },
      scale: "device",
    });
    process.stdout.write(`  ✓ ${id} · ${tema}\n`);
  }

  await contexto.close();
}

function comprimir() {
  for (const { id } of CAPTURAS) {
    for (const tema of ["claro", "oscuro"]) {
      execFileSync("cwebp", [
        "-quiet",
        "-q",
        String(CALIDAD),
        "-resize",
        String(ANCHO),
        "0",
        png(id, tema),
        "-o",
        webp(id, tema),
      ]);
    }
  }
}

/**
 * Sustituye el interior de cada bloque marcado del brochure por el `<picture>` con las dos
 * imágenes. Los marcadores hacen el script re-ejecutable: se vuelve a correr cuando la UI cambia
 * y el HTML se reescribe solo, sin tocar una línea a mano.
 */
function incrustar() {
  let html = readFileSync(BROCHURE, "utf8");
  let total = 0;

  for (const { id } of CAPTURAS) {
    const claro = readFileSync(webp(id, "claro")).toString("base64");
    const oscuro = readFileSync(webp(id, "oscuro")).toString("base64");
    total += claro.length + oscuro.length;

    const marca = new RegExp(
      `(<!-- captura:${id} -->)[\\s\\S]*?(<!-- /captura:${id} -->)`,
    );
    if (!marca.test(html)) throw new Error(`falta el marcador captura:${id}`);

    const { alt } = CAPTURAS.find((c) => c.id === id);
    html = html.replace(
      marca,
      `$1<source media="(prefers-color-scheme: dark)" srcset="data:image/webp;base64,${oscuro}" />` +
        `<img src="data:image/webp;base64,${claro}" alt="${alt}"` +
        ` width="${ANCHO}" height="${ALTOS[id]}" decoding="async" />$2`,
    );
  }

  writeFileSync(BROCHURE, html, "utf8");
  return total;
}

mkdirSync(SALIDA, { recursive: true });

execFileSync("node", [
  join(process.cwd(), "docs", "kit-de-prueba", "generador.mjs"),
  "--filas",
  "600",
  "--seed",
  "42",
  "--perfil",
  "clinico",
  "--formato",
  "csv",
  "--salida",
  MUESTRA,
]);

const navegador = await chromium.launch();
for (const tema of ["claro", "oscuro"]) await capturar(navegador, tema);
await navegador.close();

comprimir();

// El paso de taller: con SOLO_CAPTURAR=1 se producen las imágenes sin tocar el brochure, que es
// como se afinan los recortes mirándolas.
if (process.env.SOLO_CAPTURAR) {
  process.stdout.write(`\n${CAPTURAS.length * 2} capturas en ${SALIDA}\n`);
} else {
  const bytes = incrustar();
  process.stdout.write(
    `\nbrochure ← ${CAPTURAS.length * 2} capturas · ${Math.round(bytes / 1024)} KB en base64\n`,
  );
}
