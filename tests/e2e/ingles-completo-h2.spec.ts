// EL INGLÉS DE LO CONSTRUIDO EN EL H-2 — las pantallas que `ingles-completo.spec.ts` no abre.
//
// Aquel recorrido sigue el flujo de un CSV con seudónimos. Aquí se abre en inglés lo que el H-2 sumó
// y que solo el motor, el worker o un documento escriben: el JSON, el PDF y la foto, la generalización
// óptima, el ruido (ε), la política del RGPD, el alto volumen y los documentos que se descargan (el
// certificado de limpieza y el del tratamiento). Falla ante una palabra que solo el español usa en lo
// que se ve, en lo que se oye (`aria-label`, `title`, `alt`) o en un documento descargado.
//
// Con `CAPTURAS=1` deja además una imagen por pantalla en `tmp/capturas-en/`, en móvil y escritorio.
//
// Mismo detector y mismo traductor que el recorrido de la ida (ver `ingles-completo-lexico.ts`): los
// selectores son los de los demás e2e, dichos en inglés por el catálogo.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Download, type Page } from "@playwright/test";

import {
  FIXTURE_ANIDADO_JSON,
  FIXTURE_JPEG,
  FIXTURE_PDF,
  nombreDeFixture,
} from "./global-setup";
import {
  crearDetector,
  crearTraductor,
  type Detector,
  type Traductor,
} from "./ingles-completo-lexico";
import { crearRevisor, sinDatos } from "./ingles-completo-pantalla";

test.use({ locale: "en-US" });

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const EUROPEO = nombreDeFixture("europeo", 1_500, 42);
const ANCHO = nombreDeFixture("ancho", 100_000, 42);
const FRASE = "a long passphrase for the test";

interface Contexto {
  en: Traductor;
  detector: Detector;
  fallos: string[];
  revisar: (pagina: Page, donde: string) => Promise<void>;
  /** El texto de un documento descargado (HTML), sin etiquetas, revisado como una pantalla más. */
  revisarDocumento: (descarga: Download, donde: string) => Promise<void>;
}

async function contexto(archivoDePrueba: string): Promise<Contexto> {
  const detector = await crearDetector(archivoDePrueba);
  expect(detector.tamano).toBeGreaterThan(500);
  const fallos: string[] = [];
  const revisarTexto = crearRevisor(detector, fallos);
  const revisar = async (pagina: Page, donde: string) => {
    await revisarTexto(pagina, donde);
    // `CAPTURAS=1`: una imagen por pantalla, en `tmp/capturas-en/` (ignorado, todo sintético).
    if (process.env.CAPTURAS) {
      const nombre = `h2-${test.info().project.name}-${donde}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-");
      await pagina.screenshot({
        path: join(process.cwd(), "tmp", "capturas-en", `${nombre}.png`),
        fullPage: true,
      });
    }
  };
  return {
    en: await crearTraductor(),
    detector,
    fallos,
    revisar,
    revisarDocumento: async (descarga, donde) => {
      const html = readFileSync((await descarga.path())!, "utf8");
      const texto = sinDatos(
        html
          .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&[a-z#0-9]+;/gi, " "),
      );
      for (const palabra of detector.enEspanol(texto)) {
        fallos.push(`${donde}: «${palabra}» en el documento descargado`);
      }
    },
  };
}

const cabecera = (archivo: string, lineas = 200) =>
  readFileSync(archivo, "utf8").split("\n").slice(0, lineas).join("\n");

async function soltar(page: Page, archivo: string, espera = 150_000) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await page.setInputFiles("#archivo", archivo);
  await page.waitForURL("**/diagnostico", { timeout: espera });
}

/** Del diagnóstico al taller con la llave derivada y, si se pide, hasta el resultado. */
async function derivarLaLlave(page: Page, { en }: Contexto) {
  await page.getByLabel(en("Frase de paso del proyecto")).fill(FRASE);
  await page.getByRole("button", { name: en("Derivar la llave") }).click();
  await page
    .getByRole("heading", { name: en("Llave lista") })
    .waitFor({ timeout: 60_000 });
}

async function transformarHastaElResultado(
  page: Page,
  { en, revisar }: Contexto,
  donde: string,
  tope = 90_000,
) {
  await page
    .getByRole("button", { name: en("Transformar"), exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: en.enAlguna("Qué cambió, y qué sigue igual"),
    })
    .or(page.getByRole("heading", { name: /Local differential privacy/ }))
    .first()
    .waitFor({ timeout: tope });
  await revisar(page, `${donde} (resultado)`);
}

async function guardarYRevisarElCertificado(
  page: Page,
  ctx: Contexto,
  donde: string,
) {
  const { en } = ctx;
  await page.getByRole("button", { name: en("Preparar el archivo") }).click();
  await page
    .getByRole("link", { name: /^Save velo-anonimizado-/ })
    .waitFor({ timeout: 90_000 });
  await ctx.revisar(page, `${donde} (archivo listo)`);
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: en("Descargar el certificado") }).click(),
  ]);
  await ctx.revisarDocumento(descarga, `${donde} (certificado)`);
}

test("JSON anidado, en inglés: diagnóstico, taller, resultado y entrega", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const ctx = await contexto(cabecera(FIXTURE_ANIDADO_JSON));
  const { en, revisar } = ctx;

  await soltar(page, FIXTURE_ANIDADO_JSON, 90_000);
  await page
    .getByRole("heading", { name: en("Qué se trató y qué no en este JSON") })
    .waitFor();
  await revisar(page, "JSON · diagnóstico");

  await page
    .getByRole("link", { name: en("Transformar este archivo") })
    .click();
  await page.waitForURL("**/transformar");
  await page
    .getByRole("heading", { name: en("Ahora sí, transformar") })
    .waitFor();
  await page.getByRole("button", { name: /Habeas Data/ }).click();
  await revisar(page, "JSON · taller");
  await derivarLaLlave(page, ctx);
  await transformarHastaElResultado(page, ctx, "JSON");
  await guardarYRevisarElCertificado(page, ctx, "JSON");

  expect(ctx.fallos, "palabras en español en el JSON en inglés").toEqual([]);
});

for (const [nombre, archivo] of [
  ["una foto JPEG", FIXTURE_JPEG],
  ["un PDF", FIXTURE_PDF],
] as const) {
  test(`${nombre}, en inglés: diagnóstico de metadatos, limpieza y certificado`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // Un binario no tiene encabezados que excluir: las etiquetas de sus metadatos son del archivo.
    const ctx = await contexto("");
    const { en, revisar } = ctx;

    await soltar(page, archivo, 60_000);
    await page
      .getByRole("heading", { name: en("Qué limpia Velo y qué no toca") })
      .waitFor();
    await revisar(page, `${nombre} · diagnóstico`);

    await page.getByRole("link", { name: en("Limpiar este archivo") }).click();
    await page.waitForURL("**/transformar");
    await page
      .getByRole("button", { name: en("Limpiar"), exact: true })
      .click();
    await page
      .getByRole("heading", { name: en("Esto es lo que Velo quitó") })
      .waitFor({ timeout: 60_000 });
    await revisar(page, `${nombre} · resultado`);
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: en("Descargar el certificado") })
        .click(),
    ]);
    await ctx.revisarDocumento(descarga, `${nombre} · certificado de limpieza`);

    expect(ctx.fallos, `palabras en español (${nombre})`).toEqual([]);
  });
}

test("generalización óptima y ruido, en inglés: el comparador, ε y los certificados", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const ctx = await contexto(cabecera(CLINICO));
  const { en, revisar } = ctx;

  await soltar(page, CLINICO);
  await page
    .getByRole("link", { name: en("Transformar este archivo") })
    .click();
  await page.waitForURL("**/transformar");

  // La óptima: tres cuasi-identificadores, la escalera y el comparador de caminos.
  for (const columna of ["municipio", "sexo", "estrato"]) {
    await page
      .getByLabel(en("Técnica para la columna {columna}", { columna }))
      .selectOption("generalizar-automatico");
  }
  await page.getByRole("heading", { name: en("Cómo llegar al k") }).waitFor();
  await revisar(page, "óptima · taller");
  await page
    .getByRole("button", { name: en("Comparar los dos caminos") })
    .click();
  await page.getByRole("table").first().waitFor({ timeout: 60_000 });
  await revisar(page, "óptima · comparador");

  // El ruido: Laplace con su máximo y respuesta aleatorizada con su ε.
  await page
    .getByLabel(en("Técnica para la columna {columna}", { columna: "monto" }))
    .selectOption("laplace");
  await page
    .getByLabel(en("Máximo posible de {columna}", { columna: "monto" }))
    .fill("10000000");
  await page
    .getByLabel(
      en("Técnica para la columna {columna}", { columna: "diagnostico" }),
    )
    .selectOption("respuesta-aleatorizada");
  await revisar(page, "ruido · taller");

  await derivarLaLlave(page, ctx);
  await transformarHastaElResultado(page, ctx, "ruido");
  await guardarYRevisarElCertificado(page, ctx, "ruido");

  expect(ctx.fallos, "palabras en español en la óptima y el ruido").toEqual([]);
});

test("política del RGPD, en inglés: cobertura por artículo, resultado y certificado", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const ctx = await contexto(cabecera(EUROPEO));
  const { en, revisar } = ctx;

  await soltar(page, EUROPEO);
  await revisar(page, "RGPD · diagnóstico");
  await page
    .getByRole("link", { name: en("Transformar este archivo") })
    .click();
  await page.waitForURL("**/transformar");
  await page.getByRole("button", { name: /GDPR|RGPD/ }).click();
  await revisar(page, "RGPD · taller");
  await derivarLaLlave(page, ctx);
  await transformarHastaElResultado(page, ctx, "RGPD");
  await guardarYRevisarElCertificado(page, ctx, "RGPD");

  expect(ctx.fallos, "palabras en español en el RGPD en inglés").toEqual([]);
});

test("alto volumen, en inglés: «leído por pasadas» y el resultado de un archivo ancho", async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "100 000 filas × 210 columnas: solo en el escritorio",
  );
  test.setTimeout(300_000);
  const ctx = await contexto(cabecera(ANCHO, 50));
  const { en, revisar } = ctx;
  // Sin el selector de archivo del sistema ni el service worker: el camino por trozos, como en Safari.
  const contexto2 = await browser.newContext({
    locale: "en-US",
    serviceWorkers: "block",
  });
  const page = await contexto2.newPage();

  await soltar(page, ANCHO, 180_000);
  await page
    .getByRole("heading", { name: en("Este archivo se leyó por pasadas") })
    .waitFor();
  await revisar(page, "alto volumen · diagnóstico");
  await page
    .getByRole("link", { name: en("Transformar este archivo") })
    .click();
  await page.waitForURL("**/transformar");
  await page
    .getByLabel(
      en("Técnica para la columna {columna}", { columna: "cedula_titular" }),
    )
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();
  await revisar(page, "alto volumen · taller");
  await derivarLaLlave(page, ctx);
  await transformarHastaElResultado(page, ctx, "alto volumen", 120_000);
  await contexto2.close();

  expect(
    ctx.fallos,
    "palabras en español en el alto volumen en inglés",
  ).toEqual([]);
});
