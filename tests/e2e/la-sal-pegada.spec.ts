// S13 — LA SAL PEGADA EN LA WEB, DE PUNTA A PUNTA, EN ESPAÑOL Y EN INGLÉS.
//
// Una persona anonimiza el archivo de marzo, apunta la sal que la pantalla le enseña, cierra todo
// (la sesión vive solo en memoria: recargar no deja nada) y el mes siguiente pega la MISMA sal con
// la MISMA frase: el cliente que estaba en los dos archivos tiene el mismo seudónimo en los dos. Sin
// la sal, la misma frase estrena otra llave y los seudónimos no cuadran: ese contraste es lo que
// demuestra que el campo se obedece (y es lo que cae si la sal pegada se ignora).
//
// El archivo del mes siguiente es sintético: las mismas filas del kit, en otro orden y recortadas,
// como un segundo corte de los mismos clientes.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import Papa from "papaparse";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";
import { crearTraductor, type Traductor } from "./ingles-completo-lexico";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const COLUMNA = "cedula_titular";

const IDIOMAS = [
  {
    id: "es",
    locale: "es-CO",
    frase: "una frase larga para el ensayo de la sal",
    guardar: /^Guardar velo-anonimizado-/,
  },
  {
    id: "en",
    locale: "en-US",
    frase: "a long passphrase for the salt rehearsal",
    guardar: /^Save velo-anonimizado-/,
  },
] as const;

/** Lo que el mismo control dice en cada idioma: el español tal cual, el inglés desde el catálogo. */
function textos(id: "es" | "en", en: Traductor) {
  const d = (es: string, datos?: Record<string, string | number>) =>
    id === "es"
      ? es.replace(/\{(\w+)\}/g, (_, k: string) => String(datos?.[k] ?? ""))
      : en(es, datos);
  const alguna = (es: string) =>
    id === "es" ? new RegExp(`^${es}$`) : en.enAlguna(es);
  return { d, alguna };
}

/** Anonimiza `entrada` por la interfaz y devuelve la sal que la pantalla enseña y los bytes. */
async function anonimizar(
  page: Page,
  idioma: (typeof IDIOMAS)[number],
  en: Traductor,
  entrada: string,
  salPegada?: string,
) {
  const { d, alguna } = textos(idioma.id, en);
  await page.goto("/");
  await page.setInputFiles("#archivo", entrada);
  await page.waitForURL("**/diagnostico", { timeout: 90_000 });
  await page
    .getByRole("link", { name: d("Transformar este archivo") })
    .click({ timeout: 60_000 });
  await page.waitForURL("**/transformar");
  await page
    .getByLabel(d("Técnica para la columna {columna}", { columna: COLUMNA }))
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();

  await page.getByLabel(d("Frase de paso del proyecto")).fill(idioma.frase);
  const campoDeSal = page.getByLabel(d("¿Vuelves a un proyecto? Pega su sal"));
  // Recién abierto el taller, el campo está vacío: no queda nada del mes anterior.
  await expect(campoDeSal).toHaveValue("");
  if (salPegada) await campoDeSal.fill(salPegada);
  await page.getByRole("button", { name: d("Derivar la llave") }).click();
  await page
    .getByRole("heading", { name: d("Llave lista") })
    .waitFor({ timeout: 60_000 });
  const sal = (
    await page
      .locator("dt", { hasText: /^Sal(t)?$/ })
      .locator("xpath=following-sibling::dd")
      .innerText()
  ).trim();
  expect(sal).toMatch(/^[0-9a-f]{32}$/);

  await page
    .getByRole("button", { name: d("Transformar"), exact: true })
    .click();
  await page
    .getByRole("heading", { name: alguna("Qué cambió, y qué sigue igual") })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: d("Preparar el archivo") }).click();
  const guardar = page.getByRole("link", { name: idioma.guardar });
  await guardar.waitFor({ timeout: 60_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  const bytes = readFileSync((await descarga.path())!, "utf8");
  return { sal, bytes };
}

const seudonimos = (csv: string): Set<string> => {
  const { data } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const valores = data.map((fila) => fila[COLUMNA]).filter(Boolean);
  return new Set(valores);
};

for (const idioma of IDIOMAS)
  test.describe(`la sal pegada (${idioma.id})`, () => {
    test.use({ locale: idioma.locale });

    test("misma frase + misma sal en otra sesión ⇒ el mismo seudónimo para el mismo cliente; sin la sal, otro", async ({
      page,
    }, info) => {
      test.skip(
        info.project.name !== "desktop-chromium",
        "el recorrido de la sal corre en un solo proyecto",
      );
      test.setTimeout(240_000);
      const en = await crearTraductor();
      await page.addInitScript(() => {
        delete (window as Window & { showSaveFilePicker?: unknown })
          .showSaveFilePicker;
      });

      // El archivo del mes siguiente: los mismos clientes, otro orden, recortado (sintético).
      const lineas = readFileSync(CLINICO, "utf8").trim().split("\n");
      const carpeta = mkdtempSync(join(DIRECTORIO_DE_FIXTURES, "sal-pegada-"));
      const segundo = join(carpeta, "segundo-corte.csv");
      writeFileSync(
        segundo,
        [lineas[0], ...lineas.slice(1, 301).reverse()].join("\n") + "\n",
      );

      // Archivo 1: la sal nace nueva y la pantalla la enseña.
      const uno = await anonimizar(page, idioma, en, CLINICO);
      const delUno = seudonimos(uno.bytes);
      expect(delUno.size).toBeGreaterThan(100);

      // Otra sesión (navegación completa: la memoria de la página no sobrevive) y la sal pegada.
      const dos = await anonimizar(page, idioma, en, segundo, uno.sal);
      expect(dos.sal).toBe(uno.sal);
      const delDos = seudonimos(dos.bytes);
      expect(delDos.size).toBeGreaterThan(100);
      // Todo cliente del segundo corte salió con el seudónimo que ya tenía en el primero.
      const ajenos = [...delDos].filter((s) => !delUno.has(s));
      expect(ajenos).toEqual([]);

      // El contraste que prueba que el campo se obedece: sin la sal, la misma frase da otra llave.
      const sin = await anonimizar(page, idioma, en, segundo);
      expect(sin.sal).not.toBe(uno.sal);
      const delSin = seudonimos(sin.bytes);
      expect([...delSin].filter((s) => delUno.has(s))).toEqual([]);
    });

    test("una sal mal formada se rechaza con su mensaje y no deja derivar", async ({
      page,
    }, info) => {
      test.skip(
        info.project.name !== "desktop-chromium",
        "el recorrido de la sal corre en un solo proyecto",
      );
      test.setTimeout(120_000);
      const en = await crearTraductor();
      const { d } = textos(idioma.id, en);
      await page.goto("/");
      await page.setInputFiles("#archivo", CLINICO);
      await page.waitForURL("**/diagnostico", { timeout: 90_000 });
      await page
        .getByRole("link", { name: d("Transformar este archivo") })
        .click({ timeout: 60_000 });
      await page.waitForURL("**/transformar");
      await page
        .getByLabel(
          d("Técnica para la columna {columna}", { columna: COLUMNA }),
        )
        .selectOption("seudonimizar");
      await page.getByRole("checkbox").first().check();

      await page.getByLabel(d("Frase de paso del proyecto")).fill(idioma.frase);
      const campo = page.getByLabel(d("¿Vuelves a un proyecto? Pega su sal"));
      await campo.fill("esto-no-es-una-sal");
      await expect(page.locator("p[role=alert]")).toContainText(
        idioma.id === "es" ? "La sal no es válida" : "That salt isn't valid",
      );
      await expect(campo).toHaveAttribute("aria-invalid", "true");
      await expect(
        page.getByRole("button", { name: d("Derivar la llave") }),
      ).toBeDisabled();

      // Corregida, el mensaje se va y el botón vuelve.
      await campo.fill("00112233445566778899AABBCCDDEEFF");
      await expect(page.locator("p[role=alert]")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: d("Derivar la llave") }),
      ).toBeEnabled();
    });
  });
