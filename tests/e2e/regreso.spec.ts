// EL REGRESO, POR LA UI — de anonimizar a recuperar, pasando por las manos del tercero.
//
// Este archivo prueba lo único que justifica el sprint: que el círculo se cierra. Y lo prueba con
// las dos condiciones que lo hacen real y no una demo:
//
//   1. **En OTRA sesión de navegador.** El contexto que anonimiza se cierra; el que restaura nace
//      limpio, sin memoria, sin estado compartido. Una bóveda que solo funciona en la pestaña que
//      la escribió no es una bóveda: el archivo vuelve semanas después, en otro computador.
//   2. **Con el archivo maltratado por el tercero.** Filas al revés, una columna nueva suya, una
//      columna borrada y valores corregidos a mano. Restaurar es por VALOR, y esto lo demuestra.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const FRASE_DE_LLAVE = "una frase larga de prueba";
const FRASE_DE_BOVEDA = "otra frase larga, la de la boveda";
const COLUMNA = "cedula_titular";

/** Lee un CSV a matriz. Los fixtures del kit no llevan comas dentro de las celdas de esta columna. */
function leerCsv(ruta: string): string[][] {
  return readFileSync(ruta, "utf8")
    .trimEnd()
    .split("\n")
    .map((linea) => linea.split(","));
}

function columna(filas: string[][], nombre: string): string[] {
  const i = filas[0].indexOf(nombre);
  return filas.slice(1).map((fila) => fila[i]);
}

/**
 * Lo que le pasa a un archivo cuando alguien de verdad trabaja con él.
 *
 * No es una simulación decorativa: cada una de las cuatro cosas rompería una restauración por
 * posición, que es la razón por la que Velo restaura por valor.
 */
function loQueHaceElTercero(entrada: string, salida: string): void {
  const filas = leerCsv(entrada);
  const encabezado = filas[0];
  const datos = filas.slice(1).reverse(); // 1. reordena las filas

  const iBorrada = encabezado.indexOf("monto"); // 2. borra una columna que no le sirve
  const nuevoEncabezado = [
    ...encabezado.filter((_, i) => i !== iBorrada),
    "resultado_del_estudio", // 3. añade la suya
  ];
  const nuevasFilas = datos.map((fila, n) => [
    ...fila.filter((_, i) => i !== iBorrada),
    n % 2 === 0 ? "positivo" : "negativo",
  ]);

  // 4. corrige dos valores a mano, incluida una celda de la columna reversible.
  const iColumna = nuevoEncabezado.indexOf(COLUMNA);
  nuevasFilas[0][iColumna] = "CORREGIDO-A-MANO";

  writeFileSync(
    salida,
    [nuevoEncabezado, ...nuevasFilas].map((f) => f.join(",")).join("\n") + "\n",
    "utf8",
  );
}

/**
 * La alerta de ESTA pantalla, no la de Next.
 *
 * `getByRole("alert")` encuentra también `#__next-route-announcer__`, que el router deja siempre en
 * el documento y está vacío: el selector sin acotar rompía por «strict mode violation». Se busca
 * dentro del `<main>`, que es donde vive el contenido de la aplicación.
 */
function alertaDelRegreso(page: Page) {
  return page.locator("main").getByRole("alert");
}

/**
 * Nombre de archivo temporal **por worker**.
 *
 * `fullyParallel` reparte los tests entre workers y cada uno corre su propio `beforeAll`: con un
 * nombre fijo, cuatro procesos escribirían el mismo `.velo` a la vez y el suite se volvería
 * intermitente por una razón que no tiene nada que ver con el producto. El sprint lleva doce
 * corridas sin un solo `flaky` y no va a estrenarlo aquí.
 */
function temporal(nombre: string, worker: number): string {
  return join(DIRECTORIO_DE_FIXTURES, `w${worker}-${nombre}`);
}

async function anonimizarConBoveda(
  page: Page,
  worker: number,
): Promise<{ anonimizado: string; boveda: string }> {
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  // Una sola columna, seudónimo y reversible. El resto se conserva: así el archivo devuelto tiene
  // las mismas columnas de siempre y la comparación de después es directa.
  await page
    .getByLabel(`Técnica para la columna ${COLUMNA}`)
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();
  await expect(page.getByText(/guardar una bóveda/)).toBeVisible();

  await page.getByLabel("Frase de paso del proyecto").fill(FRASE_DE_LLAVE);
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
  const [descargaCsv] = await Promise.all([
    page.waitForEvent("download"),
    guardarCsv.click(),
  ]);
  const anonimizado = temporal("anonimizado.csv", worker);
  await descargaCsv.saveAs(anonimizado);

  // Y la bóveda, que es lo que hace posible el regreso.
  await expect(
    page.getByRole("heading", {
      name: "La correspondencia para poder deshacerlo",
    }),
  ).toBeVisible();
  await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await page
    .getByRole("button", { name: "Cifrar y preparar la bóveda" })
    .click();
  const [descargaVelo] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Guardar la bóveda" })
      .click({ timeout: 60_000 }),
  ]);
  const boveda = temporal("boveda.velo", worker);
  await descargaVelo.saveAs(boveda);

  return { anonimizado, boveda };
}

/**
 * El flujo de anonimizar corre UNA vez para todo el archivo.
 *
 * No es un ahorro cosmético: son ~40 s de reloj, y el suite ya gasta 60 de los 90 de la alarma en
 * su prueba más lenta (medido en el runner, Fase 0). Repetirlo tres veces habría metido la
 * intermitencia por la puerta de atrás.
 */
let anonimizado = "";
let boveda = "";

test.beforeAll(async ({ browser }, info) => {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  const salida = await anonimizarConBoveda(pagina, info.workerIndex);
  anonimizado = salida.anonimizado;
  boveda = salida.boveda;
  // La sesión se cierra ENTERA. Lo que sobrevive son dos archivos en el disco del usuario.
  await contexto.close();
});

test("el círculo completo: anonimizar, entregar, y recuperar en OTRA sesión", async ({
  browser,
}) => {
  // El archivo entregado NO lleva las cédulas originales: eso es lo que se entregó.
  const original = leerCsv(CLINICO);
  const entregado = leerCsv(anonimizado);
  const cedulasOriginales = columna(original, COLUMNA);
  expect(columna(entregado, COLUMNA)).not.toEqual(cedulasOriginales);

  // ── El tercero trabaja ──────────────────────────────────────────────────────────────────────
  const devuelto = temporal("devuelto.csv", test.info().workerIndex);
  loQueHaceElTercero(anonimizado, devuelto);

  // ── Sesión 2: contexto nuevo, sin memoria de nada ───────────────────────────────────────────
  const contextoB = await browser.newContext();
  const paginaB = await contextoB.newPage();
  await paginaB.goto("/regreso");

  await paginaB.getByLabel("Elegir el archivo de bóveda").setInputFiles(boveda);
  await paginaB.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await paginaB.getByRole("button", { name: "Abrir la bóveda" }).click();
  await paginaB
    .getByRole("heading", { name: "Bóveda abierta" })
    .waitFor({ timeout: 60_000 });

  await paginaB
    .getByLabel("Elegir el archivo que devolvió el tercero")
    .setInputFiles(devuelto);
  await expect(paginaB.getByText(/1\.999 filas|2\.000 filas/)).toBeVisible({
    timeout: 60_000,
  });

  await paginaB
    .getByRole("button", { name: "Restaurar los valores originales" })
    .click();
  await paginaB
    .getByRole("button", { name: "Preparar el archivo restaurado" })
    .waitFor({ timeout: 60_000 });
  await paginaB
    .getByRole("button", { name: "Preparar el archivo restaurado" })
    .click();
  const [descarga] = await Promise.all([
    paginaB.waitForEvent("download"),
    paginaB
      .getByRole("link", { name: "Guardar el archivo restaurado" })
      .click({ timeout: 60_000 }),
  ]);
  const restaurado = join(DIRECTORIO_DE_FIXTURES, "restaurado.csv");
  await descarga.saveAs(restaurado);

  // ── Y lo que importa: ¿volvieron los originales? ────────────────────────────────────────────
  const filasRestauradas = leerCsv(restaurado);
  const cedulasRestauradas = columna(filasRestauradas, COLUMNA);

  // El tercero puso las filas al revés; se comparan como conjuntos, que es lo que la promesa dice.
  const esperadas = new Set(cedulasOriginales.filter((v) => v !== ""));
  const recuperadas = cedulasRestauradas.filter((v) => esperadas.has(v));
  expect(recuperadas.length).toBeGreaterThan(cedulasOriginales.length * 0.9);

  // La celda que el tercero corrigió a mano sale como él la dejó: su trabajo no se toca.
  expect(cedulasRestauradas).toContain("CORREGIDO-A-MANO");

  // Y su columna nueva sigue ahí, con su contenido.
  expect(filasRestauradas[0]).toContain("resultado_del_estudio");
  expect(columna(filasRestauradas, "resultado_del_estudio")).toContain(
    "positivo",
  );

  // La columna que él borró no reaparece: Velo no inventa lo que no le dieron.
  expect(filasRestauradas[0]).not.toContain("monto");

  await contextoB.close();
});

test("una bóveda que no es de este archivo se dice, y no se restaura nada", async ({
  page,
}) => {
  await page.goto("/regreso");
  // Un CSV cualquiera en el sitio de la bóveda: se reconoce sin descifrar nada.
  await page.getByLabel("Elegir el archivo de bóveda").setInputFiles(CLINICO);
  await page.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await page.getByRole("button", { name: "Abrir la bóveda" }).click();
  await expect(alertaDelRegreso(page)).toContainText(/no es una bóveda de Velo/i, {
    timeout: 60_000,
  });
});

test("la frase incorrecta lo dice, sin dar pistas", async ({ page }) => {
  await page.goto("/regreso");
  await page.getByLabel("Elegir el archivo de bóveda").setInputFiles(boveda);
  await page
    .getByLabel("Frase de paso de la bóveda")
    .fill("una frase que no es la buena");
  await page.getByRole("button", { name: "Abrir la bóveda" }).click();
  await expect(alertaDelRegreso(page)).toContainText(
    /La frase no abre esta bóveda/i,
    { timeout: 60_000 },
  );
});

test.describe("movimiento reducido", () => {
  // En Playwright 1.62 `reducedMotion` viaja dentro de `contextOptions`, no como opción suelta.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("con prefers-reduced-motion el regreso sigue VISIBLE y utilizable", async ({
    page,
  }) => {
    // El contrapeso que el método exige por tener diferido el gate ⭐: no basta con que no haya
    // animación, hay que comprobar que el contenido está de verdad ahí y se puede usar.
    await page.goto("/regreso");
    await expect(
      page.getByRole("heading", { name: "Recupera lo que entregaste" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "El archivo que guardaste al anonimizar",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Elegir la bóveda" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Abrir la bóveda" }),
    ).toBeDisabled();

    // Y por teclado: el foco llega al campo de la frase sin ratón.
    await page.getByLabel("Frase de paso de la bóveda").focus();
    await page.keyboard.type("una frase larga de prueba");
    await expect(page.getByLabel("Frase de paso de la bóveda")).toHaveValue(
      "una frase larga de prueba",
    );
  });
});
