// PDF E IMÁGENES, POR LA UI — de soltar el archivo a guardar la copia limpia y su certificado.
//
// Lo que se prueba no es que «funciona»: es que los metadatos que el kit escondió (autor, cédula,
// GPS, identificadores, versiones anteriores) no aparecen NI en la pantalla —que enseña muestras
// enmascaradas— NI en el archivo que sale, que la copia sigue siendo del formato que era, que el
// certificado trae las dos huellas y el límite dicho primero, y que no sale una sola petición con
// datos. Cada centinela es una cadena que el generador registró AL ESCRIBIRLA (ver
// `docs/kit-de-prueba/binarios/comun.mjs`), así que «no está» significa algo.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  centinelasDe,
  FIXTURE_JPEG,
  FIXTURE_PDF,
  FIXTURE_PDF_CIFRADO,
  FIXTURE_PDF_FIRMADO,
  FIXTURE_PNG,
  FIXTURE_WEBP,
} from "./global-setup";

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** ¿Está la cadena en los bytes, en cualquiera de las codificaciones en que un metadato la guarda? */
function contiene(bytes: Buffer, cadena: string): boolean {
  return (
    bytes.includes(Buffer.from(cadena, "utf8")) ||
    bytes.includes(Buffer.from(cadena, "latin1")) ||
    bytes.includes(Buffer.from(cadena, "utf16le")) ||
    bytes.includes(Buffer.from(cadena, "utf16le").swap16())
  );
}

async function soltar(page: Page, fixture: string) {
  await page.goto("/");
  await page.setInputFiles("#archivo", fixture);
  await page.waitForURL("**/diagnostico", { timeout: 60_000 });
  await page
    .getByRole("heading", { name: "Qué limpia Velo y qué no toca" })
    .waitFor();
}

/** Del diagnóstico a la copia limpia: devuelve su nombre y sus bytes. */
async function limpiarYGuardar(page: Page) {
  await page.getByRole("link", { name: "Limpiar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Esto es lo que Velo quitó" })
    .waitFor({ timeout: 60_000 });
  const guardar = page.getByRole("link", { name: /^Guardar velo-limpio-/ });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  return {
    nombre: descarga.suggestedFilename(),
    bytes: readFileSync((await descarga.path())!),
  };
}

async function descargarCertificado(page: Page) {
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar el certificado" }).click(),
  ]);
  return {
    nombre: descarga.suggestedFilename(),
    html: readFileSync((await descarga.path())!, "utf8"),
  };
}

const IMAGENES = [
  {
    formato: "JPEG",
    fixture: FIXTURE_JPEG,
    extension: "jpg",
    firma: [0xff, 0xd8, 0xff],
  },
  {
    formato: "PNG",
    fixture: FIXTURE_PNG,
    extension: "png",
    firma: [0x89, 0x50, 0x4e, 0x47],
  },
  {
    formato: "WebP",
    fixture: FIXTURE_WEBP,
    extension: "webp",
    firma: [0x52, 0x49, 0x46, 0x46],
  },
];

for (const { formato, fixture, extension, firma } of IMAGENES) {
  test(`una foto ${formato}: la pantalla enmascara, la copia sale sin un solo metadato y con su certificado`, async ({
    page,
  }) => {
    const centinelas = centinelasDe(fixture);
    expect(centinelas.length).toBeGreaterThan(10);
    await soltar(page, fixture);

    // El límite va primero, y el diagnóstico nombra campos sin enseñar ningún valor entero.
    await expect(
      page.getByText(/Velo limpia lo que el archivo dice de sí mismo/).first(),
    ).toBeVisible();
    await expect(page.getByText("Artist").first()).toBeVisible();
    const pantalla = await page.locator("body").innerText();
    for (const centinela of centinelas)
      expect(pantalla, `«${centinela}» en la pantalla`).not.toContain(
        centinela,
      );

    const { nombre, bytes } = await limpiarYGuardar(page);
    expect(nombre).toMatch(
      new RegExp(`^velo-limpio-[0-9a-f]{8}\\.${extension}$`),
    );
    expect([...bytes.subarray(0, firma.length)]).toEqual(firma);
    for (const centinela of centinelas)
      expect(contiene(bytes, centinela), `«${centinela}» en la copia`).toBe(
        false,
      );
    await expect(
      page.getByText(/volvió a leer el archivo limpio: 0 campos con nombre/),
    ).toBeVisible();

    const original = readFileSync(fixture);
    const certificado = await descargarCertificado(page);
    expect(certificado.nombre).toMatch(/^velo-limpieza-.+\.html$/);
    expect(certificado.html).toContain(sha256(original));
    expect(certificado.html).toContain(sha256(bytes));
    expect(certificado.html).toContain(
      "El texto de las páginas y lo que se ve en la imagen no se tocaron.",
    );
    for (const centinela of centinelas)
      expect(certificado.html).not.toContain(centinela);
  });
}

test("un PDF con dos versiones sale con una sola, un /ID nuevo y sin lo que decía antes", async ({
  page,
}) => {
  const centinelas = centinelasDe(FIXTURE_PDF);
  await soltar(page, FIXTURE_PDF);
  await expect(
    page.getByText("Este PDF guarda 2 versiones dentro"),
  ).toBeVisible();
  await expect(page.getByText(/Velo las enseña pero/).first()).toBeVisible();

  const { nombre, bytes } = await limpiarYGuardar(page);
  expect(nombre).toMatch(/^velo-limpio-[0-9a-f]{8}\.pdf$/);
  const texto = bytes.toString("latin1");
  expect(texto.startsWith("%PDF-")).toBe(true);
  expect(texto.split("%%EOF").length - 1).toBe(1);
  expect(texto).not.toContain("/Prev");
  expect(texto).not.toContain("/Info");
  expect(texto).not.toContain("/Metadata");
  expect(texto).toContain("Documento sintetico de prueba - Velo");

  // Lo único que puede quedar es lo que la pantalla AVISÓ que no se limpia: el autor y el texto de
  // una anotación viva. Cada centinela que siga en la copia tiene que estar dentro de una.
  for (const centinela of centinelas.filter((c) => contiene(bytes, c))) {
    const donde = texto.indexOf(centinela);
    const diccionario = texto.slice(texto.lastIndexOf("<<", donde), donde);
    expect(diccionario, `«${centinela}» fuera de una anotación`).toContain(
      "/Annot",
    );
  }
  await expect(page.getByText(/El PDF limpio guarda/).first()).toBeVisible();
});

test("un PDF cifrado se rechaza diciendo qué hacer, sin pedir la contraseña", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", FIXTURE_PDF_CIFRADO);
  await expect(
    page.getByRole("heading", {
      name: "Ese PDF está protegido con contraseña",
    }),
  ).toBeVisible({ timeout: 30_000 });
  // Ningún campo donde escribirla: Velo no pide contraseñas.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("un PDF firmado avisa que limpiarlo invalida la firma, y se limpia igual", async ({
  page,
}) => {
  await soltar(page, FIXTURE_PDF_FIRMADO);
  await expect(page.getByText(/invalida la firma/).first()).toBeVisible();
  const { bytes } = await limpiarYGuardar(page);
  expect(bytes.toString("latin1").split("%%EOF").length - 1).toBe(1);
});

test("un PNG con nombre de JPEG se trata como PNG, y se dice", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", {
    name: "foto-renombrada.jpg",
    mimeType: "image/jpeg",
    buffer: readFileSync(FIXTURE_PNG),
  });
  await page.waitForURL("**/diagnostico", { timeout: 60_000 });
  await expect(
    page.getByText(/La extensión del archivo no coincide con su contenido/),
  ).toBeVisible();
  const { nombre } = await limpiarYGuardar(page);
  expect(nombre).toMatch(/\.png$/);
});

// ── La garantía de red, también para PDF e imágenes ─────────────────────────────────────────

const RUTAS_PERMITIDAS = [
  /^\/$/,
  /^\/diagnostico$/,
  /^\/transformar$/,
  /^\/regreso$/,
  /^\/bitacora$/,
  /^\/_next\/static\//,
  /^\/favicon\.ico$/,
];
const PARAMETROS_PERMITIDOS = new Set(["_rsc", "dpl"]);

for (const fixture of [FIXTURE_JPEG, FIXTURE_PDF]) {
  test(`cero peticiones con datos al limpiar ${fixture.split("/").pop()}`, async ({
    page,
    baseURL,
  }) => {
    const origen = new URL(baseURL!).origin;
    const centinelas = centinelasDe(fixture);
    const sospechosas: string[] = [];
    let observadas = 0;
    page.on("request", (peticion) => {
      observadas++;
      const url = new URL(peticion.url());
      if (url.origin !== origen) {
        sospechosas.push(`fuera del origen: ${peticion.url()}`);
        return;
      }
      if (peticion.postData())
        sospechosas.push(`con cuerpo: ${peticion.method()} ${url.pathname}`);
      if (!RUTAS_PERMITIDAS.some((r) => r.test(url.pathname)))
        sospechosas.push(`ruta no prevista: ${url.pathname}`);
      for (const p of url.searchParams.keys())
        if (!PARAMETROS_PERMITIDOS.has(p))
          sospechosas.push(`parámetro no previsto: ${p}`);
      const completa = decodeURIComponent(peticion.url());
      for (const centinela of centinelas)
        if (completa.includes(centinela))
          sospechosas.push(`metadato en la URL: ${centinela}`);
    });
    page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));

    await soltar(page, fixture);
    await limpiarYGuardar(page);
    await descargarCertificado(page);

    expect(observadas).toBeGreaterThan(5);
    expect(sospechosas).toEqual([]);
  });
}
