// EL CERTIFICADO, COMPROBADO COMO LO COMPROBARÍA UN AUDITOR.
//
// Este archivo tiene una sola idea, y es la razón de ser del sprint: **no basta con que el
// certificado declare una huella; tiene que ser la huella del archivo.** Todo lo demás —que el
// documento se vea bien, que diga las palabras correctas— lo pueden verificar los tests unitarios.
// Lo que solo se puede verificar aquí es el par: dos artefactos que salen del navegador por caminos
// distintos —el CSV por su asa, el certificado por otra— y que tienen que corresponder.
//
// Así que este test hace lo que hará quien reciba el archivo: descarga los dos, **calcula el
// SHA-256 con una implementación que no es la de Velo** (`node:crypto`), y compara. Si el motor de
// hash de Velo tuviera un defecto, un test que usara ese mismo motor para verificarlo pasaría
// tranquilamente; `node:crypto` no comparte una línea de código con `lib/sha256.ts`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const FRASE = "una frase larga de prueba";

async function transformarYPrepararArchivo(page: Page) {
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("button", { name: /Habeas Data/ }).click();
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

test("antes de generar el archivo, el certificado dice qué falta y por qué", async ({
  page,
}) => {
  await transformarYPrepararArchivo(page);

  // El estado que el S4 estrena. No es un botón deshabilitado sin explicación: la huella de salida
  // no existe hasta que el archivo existe, y el paso lo dice con esas palabras.
  await expect(
    page.getByRole("heading", {
      name: "Primero el archivo, después su certificado",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Descargar el certificado" }),
  ).toHaveCount(0);
});

test("la huella del certificado ES la del archivo — comprobada fuera de Velo", async ({
  page,
}) => {
  await transformarYPrepararArchivo(page);
  await page.getByRole("button", { name: "Preparar el archivo" }).click();

  // 1. El CSV tratado.
  const guardarCsv = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardarCsv.waitFor({ timeout: 60_000 });
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    guardarCsv.click(),
  ]);
  const rutaDelCsv = await csv.path();

  // 2. El certificado, que ahora sí se ofrece.
  const descargarCertificado = page.getByRole("button", {
    name: "Descargar el certificado",
  });
  await descargarCertificado.waitFor({ timeout: 60_000 });
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    descargarCertificado.click(),
  ]);
  expect(certificado.suggestedFilename()).toMatch(
    /^velo-certificado-.+\.html$/,
  );
  const html = readFileSync((await certificado.path())!, "utf8");

  // 3. La comprobación, con una implementación de SHA-256 que no es la de Velo.
  const huellaReal = createHash("sha256")
    .update(readFileSync(rutaDelCsv!))
    .digest("hex");

  expect(huellaReal).toMatch(/^[0-9a-f]{64}$/);
  expect(html).toContain(huellaReal);

  // Y las DOS huellas: la del original también, y distinta de la de salida.
  const huellaDelOriginal = createHash("sha256")
    .update(readFileSync(CLINICO))
    .digest("hex");
  expect(html).toContain(huellaDelOriginal);
  expect(huellaDelOriginal).not.toBe(huellaReal);

  // 4. El comando que el documento le ofrece a quien lo reciba lleva el nombre real del archivo,
  //    para que se pueda copiar y pegar sin editarlo.
  expect(html).toContain(`shasum -a 256 ${csv.suggestedFilename()}`);

  // 5. Y sigue sin llevar ni una fila del archivo: el certificado prueba, no expone.
  const original = readFileSync(CLINICO, "utf8").split("\n");
  const columnas = original[0].split(",");
  const iCedula = columnas.indexOf("cedula_titular");
  const cedula = original[1].split(",")[iCedula];
  expect(cedula.length).toBeGreaterThan(5);
  expect(html).not.toContain(cedula);
});

test("el certificado se abre sin internet y no llama a nadie", async ({
  page,
}) => {
  await transformarYPrepararArchivo(page);
  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  await page
    .getByRole("link", { name: /^Guardar velo-anonimizado-/ })
    .waitFor({ timeout: 60_000 });

  const descargar = page.getByRole("button", {
    name: "Descargar el certificado",
  });
  await descargar.waitFor({ timeout: 60_000 });
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    descargar.click(),
  ]);
  const html = readFileSync((await certificado.path())!, "utf8");

  // El certificado se abre en el computador de un auditor, quizá meses después, y justo cuando
  // alguien está demostrando que sus datos NO viajaron. Un `<link>` a un CDN convertiría esa lectura
  // en un aviso a un servidor ajeno.
  //
  // Se comprueba sobre el TEXTO y no abriéndolo con la red interceptada, que fue el primer intento:
  // interceptar `**/*` aborta también la navegación `file://` del propio documento, así que el test
  // fallaba por su instrumento y no por su sujeto. Mirar el HTML es más directo y no tiene esa
  // trampa — es el patrón que el S2 ya dejó probado para el reporte.
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/<script\b/i);
  expect(html).not.toMatch(/<link\b/i);
  expect(html).not.toMatch(/\burl\(/i);
  // Y sí lleva lo suyo: la sección de verificación y dos huellas completas.
  expect(html).toContain("No hace falta creerle a este documento");
  expect(html.match(/[0-9a-f]{64}/g)?.length).toBeGreaterThanOrEqual(2);
});
