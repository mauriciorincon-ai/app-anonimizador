// LA POLÍTICA RGPD, DE PUNTA A PUNTA POR LA UI (S8, ADR-016).
//
// Un CSV europeo sintético del kit (perfil `europeo`: un identificador nacional con control oficial
// de cada país, campos personales con nombres en otras lenguas, un dato del art. 9 y uno del art. 10)
// entra por la portada, se diagnostica, se le aplica la política de fábrica del RGPD con un clic y
// sale seudonimizado. Lo que se comprueba es lo que haría quien recibe el archivo: que los
// identificadores sigan teniendo la forma de su país, que ninguno sea el original, que las columnas
// de categorías especiales y de condenas no estén, y que el certificado diga «seudonimizado» y NUNCA
// «anónimo». Hecho en español; el inglés lo cubren los unitarios del certificado y el barrido de
// paridad.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { nombreDeFixture } from "./global-setup";

const EUROPEO = nombreDeFixture("europeo", 1_500, 42);
const FRASE = "una frase larga de prueba";

function leerCsv(ruta: string): { columnas: string[]; filas: string[][] } {
  const [encabezado, ...cuerpo] = readFileSync(ruta, "utf8")
    .split("\n")
    .filter((linea) => linea !== "");
  return {
    columnas: encabezado.split(","),
    // El kit no escribe comas dentro de comillas en este perfil salvo en el nombre y el correo,
    // que no se leen aquí: se corta por la coma sin más.
    filas: cuerpo.map((linea) => linea.split(",")),
  };
}

function columna(csv: ReturnType<typeof leerCsv>, nombre: string): string[] {
  const i = csv.columnas.indexOf(nombre);
  expect(i, `la columna ${nombre}`).toBeGreaterThanOrEqual(0);
  return csv.filas.map((fila) => fila[i]);
}

async function aplicarLaPoliticaDelRgpd(page: Page) {
  await page.goto("/");
  await page.setInputFiles("#archivo", EUROPEO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("button", { name: /RGPD/ }).click();
}

async function transformar(page: Page) {
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });
}

test("el diagnóstico reconoce cada documento nacional por su algoritmo oficial", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", EUROPEO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });

  // Cada identificador, con el nombre llano de su norma. El oráculo es el kit, no el motor.
  for (const etiqueta of [
    /DNI \(España\)/,
    /NIE \(España\)/,
    /NIR \(Francia\)/,
    /Codice fiscale \(Italia\)/,
    /Steuer-IdNr \(Alemania\)/,
    /BSN \(Países Bajos\)/,
    /PESEL \(Polonia\)/,
  ]) {
    await expect(page.getByText(etiqueta).first()).toBeVisible();
  }
});

test("la política RGPD cita su artículo, su fuente y su fecha, y dice que no es una certificación", async ({
  page,
}) => {
  await aplicarLaPoliticaDelRgpd(page);

  await expect(
    page.getByText("Qué cubre, artículo por artículo"),
  ).toBeVisible();
  await expect(page.getByText(/art\. 4\.1/).first()).toBeVisible();
  await expect(page.getByText(/art\. 9/).first()).toBeVisible();
  await expect(page.getByText(/art\. 10/).first()).toBeVisible();
  await expect(
    page.getByText(/consultada el 2026-11-02/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/No es una certificación de cumplimiento/),
  ).toBeVisible();
  await expect(page.getByText(/Seudonimizar no es anonimizar/)).toBeVisible();
  await expect(page.getByText(/el RGPD no fija ningún k/)).toBeVisible();
});

test("del europeo al archivo seudonimizado, y su certificado dice «seudonimizado»", async ({
  page,
}) => {
  await aplicarLaPoliticaDelRgpd(page);
  await transformar(page);
  await page.getByRole("button", { name: "Preparar el archivo" }).click();

  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  const rutaDelCsv = (await csv.path())!;

  // Las categorías especiales (art. 9) y las condenas (art. 10) no están en el archivo.
  const original = leerCsv(EUROPEO);
  const entregado = leerCsv(rutaDelCsv);
  expect(entregado.columnas).not.toContain("diagnose");
  expect(entregado.columnas).not.toContain("casier_judiciaire");
  expect(original.columnas).toContain("diagnose");

  // Cada identificador conserva la forma de su país y ninguno es el original.
  const formas: Record<string, RegExp> = {
    dni_es: /^[1-9]\d{7}[A-Z]$/,
    nie_es: /^[XYZ]\d{7}[A-Z]$/,
    nir_fr: /^[12]\d{14}$/,
    codice_fiscale_it: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/,
    steuer_id_de: /^[1-9]\d{10}$/,
    bsn_nl: /^[1-9]\d{8}$/,
    pesel_pl: /^\d{11}$/,
    iban_es: /^ES\d{22}$/,
  };
  for (const [nombre, forma] of Object.entries(formas)) {
    const antes = columna(original, nombre);
    const despues = columna(entregado, nombre);
    expect(
      despues.filter((v) => v !== "" && !forma.test(v)),
      nombre,
    ).toEqual([]);
    expect(
      despues.filter((v, i) => v !== "" && v === antes[i]),
      nombre,
    ).toEqual([]);
  }

  // El certificado.
  const descargar = page.getByRole("button", {
    name: "Descargar el certificado",
  });
  await descargar.waitFor({ timeout: 60_000 });
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    descargar.click(),
  ]);
  const html = readFileSync((await certificado.path())!, "utf8");
  expect(html).toContain("Seudonimizado (art. 4.5 RGPD)");
  expect(html).toContain(
    "sigue siendo dato personal para quien tenga la llave y la bóveda",
  );
  expect(html).toContain("No declara este archivo anónimo");
  expect(html).toContain("considerando 26");
  expect(html).toContain("consultado el 2026-11-02");
  expect(html).not.toMatch(
    /an[oó]nim\w*\s+(seg[uú]n|conforme\s+(a|al|con)|bajo)\s+(el\s+)?(RGPD|GDPR)/i,
  );
  expect(html).not.toMatch(/cumpl\w*\s+(con\s+)?(el\s+)?(RGPD|GDPR)/i);
  // La huella del certificado es la del archivo, comprobada con otra implementación de SHA-256.
  expect(html).toContain(
    createHash("sha256").update(readFileSync(rutaDelCsv)).digest("hex"),
  );

  // Los identificadores seudonimizados son reversibles: Velo ofrece la bóveda, la información
  // adicional que el art. 4.5 pide mantener por separado.
  await expect(
    page.getByRole("heading", {
      name: "La correspondencia para poder deshacerlo",
    }),
  ).toBeVisible();
});
