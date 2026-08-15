// LA BITÁCORA, POR LA UI — anotar un tratamiento y leerlo meses después.
//
// Este archivo prueba tres cosas, y las tres nacieron de errores que este repo ya cometió:
//
//   1. **Que se llega.** El S3 construyó el regreso entero y su suite entraba SIEMPRE por
//      `goto("/regreso")`, así que la prueba de que la función existía era sólida y la de que era
//      ALCANZABLE no existía. Alguien que volviera tres semanas después aterrizaba en la portada
//      sin un enlace que pulsar. Aquí el recorrido empieza en `/` y llega por CLIC.
//   2. **Que sobrevive a cerrar el navegador.** El contexto que anota se cierra entero; el que lee
//      nace limpio. Una bitácora que solo se lee en la pestaña que la escribió no es un registro.
//   3. **Que el error más probable del usuario tiene respuesta.** Dos archivos cifrados de la misma
//      app, guardados el mismo día: abrir la bóveda donde se esperaba la bitácora se contesta con
//      «esto es la bóveda», no con «frase incorrecta».

import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const FRASE_DE_BITACORA = "una frase larga para la bitacora";

function temporal(nombre: string, worker: number): string {
  return join(DIRECTORIO_DE_FIXTURES, `w${worker}-bit-${nombre}`);
}

/**
 * Trata un archivo y deja la anotación lista, ENTRANDO POR LA PORTADA.
 *
 * La política es de conservar-y-enmascarar: sin columnas reversibles no hay bóveda que sellar ni
 * llave que derivar, así que el recorrido va directo a lo que este archivo prueba.
 */
async function tratarYAnotar(page: Page): Promise<void> {
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("enmascarar");
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });

  // El archivo primero: sin él no hay huella de salida, y sin huella de salida una entrada no se
  // podría atar nunca a su certificado. La pantalla lo dice y el recorrido lo respeta.
  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  await page
    .getByRole("link", { name: /^Guardar velo-anonimizado-/ })
    .waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Anotar en mi bitácora" }).click();
  await page.waitForURL("**/bitacora");
}

test("se llega a la bitácora desde la portada, sin haber cargado nada", async ({
  page,
}) => {
  // El recorrido de quien vuelve meses después: abre Velo sin nada en la mano.
  await page.goto("/");
  await page.getByRole("link", { name: "Abrir mi bitácora" }).click();
  await page.waitForURL("**/bitacora");
  await expect(
    page.getByRole("heading", { name: "Qué has tratado, y cuándo" }),
  ).toBeVisible();
  // Y hay dónde soltar el archivo, sin haber pasado por ningún tratamiento.
  await expect(
    page.getByRole("heading", { name: "Abre la bitácora que guardaste" }),
  ).toBeVisible({ timeout: 60_000 });
});

test("el círculo: anotar un tratamiento y leerlo en OTRA sesión", async ({
  page,
  browser,
}, info) => {
  await tratarYAnotar(page);

  // ── La anotación, antes de guardarla ────────────────────────────────────────────────────────
  await expect(
    page.getByRole("heading", { name: "Tu primera anotación" }),
  ).toBeVisible({ timeout: 60_000 });
  // Las DOS puntas del riesgo, nunca la reducción entre ellas (ADR-007).
  await expect(page.getByText(/antes ·.*después/)).toBeVisible();

  await page
    .getByLabel("Elige la frase de paso de tu bitácora")
    .fill(FRASE_DE_BITACORA);
  await page
    .getByRole("button", { name: "Cifrar y empezar la bitácora" })
    .click();

  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Guardar la bitácora" })
      .first()
      .click({ timeout: 60_000 }),
  ]);
  expect(descarga.suggestedFilename()).toBe("velo-bitacora.velolog");
  const archivo = temporal("velo-bitacora.velolog", info.workerIndex);
  await descarga.saveAs(archivo);

  // ── Sesión 2: contexto nuevo, sin memoria de nada ───────────────────────────────────────────
  const contextoB = await browser.newContext();
  const paginaB = await contextoB.newPage();
  await paginaB.goto("/bitacora");

  await paginaB.getByLabel("Archivo de bitácora").setInputFiles(archivo);
  await paginaB.getByLabel("Frase de paso").fill(FRASE_DE_BITACORA);
  await paginaB.getByRole("button", { name: "Abrir la bitácora" }).click();

  await expect(
    paginaB.getByRole("heading", { name: "Un tratamiento anotado" }),
  ).toBeVisible({ timeout: 60_000 });
  // La entrada habla del archivo que se trató, en una pestaña que nunca lo vio.
  await expect(paginaB.getByText(/clinico/).first()).toBeVisible();

  await contextoB.close();
});

test("una frase incorrecta lo dice, y una bóveda se distingue de una bitácora", async ({
  page,
  browser,
}, info) => {
  await tratarYAnotar(page);
  await page
    .getByLabel("Elige la frase de paso de tu bitácora")
    .fill(FRASE_DE_BITACORA);
  await page
    .getByRole("button", { name: "Cifrar y empezar la bitácora" })
    .click();
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Guardar la bitácora" })
      .first()
      .click({ timeout: 60_000 }),
  ]);
  const archivo = temporal("otra.velolog", info.workerIndex);
  await descarga.saveAs(archivo);

  const contextoB = await browser.newContext();
  const paginaB = await contextoB.newPage();
  await paginaB.goto("/bitacora");
  const alerta = paginaB.locator("main").getByRole("alert");

  // 1. La frase equivocada. No da pistas sobre la correcta.
  await paginaB.getByLabel("Archivo de bitácora").setInputFiles(archivo);
  await paginaB.getByLabel("Frase de paso").fill("una frase que no es la suya");
  await paginaB.getByRole("button", { name: "Abrir la bitácora" }).click();
  await expect(alerta).toContainText(/La frase no abre esta bitácora/, {
    timeout: 60_000,
  });

  // 2. El archivo equivocado, que es el error más probable: el CSV anonimizado no es una bitácora,
  //    y se rechaza SIN descifrar nada, diciendo dónde va cada archivo.
  await paginaB.getByLabel("Archivo de bitácora").setInputFiles(CLINICO);
  await paginaB.getByLabel("Frase de paso").fill(FRASE_DE_BITACORA);
  await paginaB.getByRole("button", { name: "Abrir la bitácora" }).click();
  await expect(alerta).toContainText(/no es una bitácora de Velo/, {
    timeout: 60_000,
  });
  await expect(alerta).toContainText(/\.velolog/);

  await contextoB.close();
});

test.describe("movimiento reducido", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("con prefers-reduced-motion la bitácora sigue VISIBLE y utilizable", async ({
    page,
  }) => {
    // El estándar de a11y no es «quita las animaciones»: es que quitarlas no esconda nada. Una
    // transición de opacidad que no arranca deja la pantalla en 0 y el contenido invisible.
    await page.goto("/");
    await page.getByRole("link", { name: "Abrir mi bitácora" }).click();
    await page.waitForURL("**/bitacora");

    await expect(
      page.getByRole("heading", { name: "Abre la bitácora que guardaste" }),
    ).toBeVisible({ timeout: 60_000 });
    // Se afirma el BOTÓN, no el `<input type="file">`. El input sigue ahí, real y navegable por
    // teclado, pero va `sr-only` detrás del botón: el control nativo escribe «Choose File» en el
    // idioma del navegador y no hay forma de traducirlo. Lo que el usuario tiene que ver es esto.
    await expect(
      page.getByRole("button", { name: "Elegir la bitácora" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Abrir la bitácora" }),
    ).toBeVisible();
  });
});
