// EL INGLÉS, DE PUNTA A PUNTA — todas las pantallas, y ninguna palabra en español.
//
// `idioma.spec.ts` prueba el conmutador; el barrido de `tests/unit/idioma-barrido.test.ts` mira el
// CÓDIGO (ninguna frase escrita a mano fuera de los catálogos). Lo que ninguno de los dos ve es lo
// que de verdad aparece en pantalla: un texto que llega del motor, del worker o de un documento y
// se quedó en español. Este recorrido abre cada pantalla en inglés con un archivo de verdad (la
// portada, el diagnóstico, el taller, la llave, el resultado, la bóveda, el regreso, la bitácora y
// el brochure) y falla si el texto visible, o el que se oye (`aria-label`, `title`, `alt`,
// `placeholder`), trae una palabra que solo el español usa.
//
// «Una palabra en español» sale de los propios catálogos (ver `ingles-completo-lexico.ts`): su
// vocabulario en español menos el que el inglés también escribe. Lo que el producto conserva a
// propósito (el nombre «Velo», «Habeas Data», un nombre de columna del archivo) no se marca.
//
// El navegador está en `en-US`, así que la app abre en inglés sin pulsar el conmutador: es lo que
// vería una persona de habla inglesa. Los selectores reutilizan los de los demás e2e: `en("…")` es
// lo que el mismo control dice en inglés, tomado del catálogo.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";
import {
  crearDetector,
  crearTraductor,
  type Detector,
} from "./ingles-completo-lexico";

test.use({ locale: "en-US" });

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const COLUMNA = "cedula_titular";
const FRASE_DE_LLAVE = "a long passphrase for the test";
const FRASE_DE_BOVEDA = "another long passphrase, the vault one";
const FRASE_DE_BITACORA = "one more long passphrase for the log";

/** El texto que una persona ve y oye en la pantalla: contenido, título y atributos de lectura. */
function textoDeLaPantalla(page: Page): Promise<string> {
  return page.evaluate(() => {
    const partes = [document.title, document.body.innerText];
    const atributos = ["aria-label", "title", "placeholder", "alt"];
    for (const elemento of document.querySelectorAll(
      atributos.map((a) => `[${a}]`).join(","),
    )) {
      for (const a of atributos) {
        const valor = elemento.getAttribute(a);
        if (valor) partes.push(valor);
      }
    }
    return partes.join("\n");
  });
}

test("cada pantalla, en inglés, sin una palabra en español", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);

  const detector: Detector = await crearDetector(
    // Los encabezados y las celdas del archivo de prueba son datos del usuario, no interfaz.
    readFileSync(CLINICO, "utf8").split("\n").slice(0, 200).join("\n"),
  );
  // Si el vocabulario saliera vacío el recorrido pasaría por no mirar nada.
  expect(detector.tamano).toBeGreaterThan(500);
  const en = await crearTraductor();

  const fallos: string[] = [];
  const revisar = async (pagina: Page, donde: string) => {
    const texto = await textoDeLaPantalla(pagina);
    for (const palabra of detector.enEspanol(texto)) {
      // El contexto de la primera aparición: sin él, «su» en una pantalla es imposible de rastrear.
      const lugar = new RegExp(
        `.{0,40}(?<!\\p{L})${palabra}(?!\\p{L}).{0,40}`,
        "iu",
      ).exec(texto.replace(/\s+/g, " "));
      fallos.push(`${donde}: «${palabra}» en «${lugar?.[0] ?? "?"}»`);
    }
  };
  const temporal = (nombre: string) =>
    join(DIRECTORIO_DE_FIXTURES, `w${info.workerIndex}-en-${nombre}`);

  // ── Las pantallas sin nada cargado ──────────────────────────────────────────────────────────
  for (const ruta of ["/", "/regreso", "/bitacora", "/conoce"]) {
    await page.goto(ruta);
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await revisar(page, `${ruta} (vacía)`);
  }

  // ── La ida, con un archivo de verdad ────────────────────────────────────────────────────────
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page
    .getByRole("link", { name: en("Transformar este archivo") })
    .waitFor({ timeout: 60_000 });
  await revisar(page, "/diagnostico");

  await page
    .getByRole("link", { name: en("Transformar este archivo") })
    .click();
  await page.waitForURL("**/transformar");
  await page
    .getByLabel(en("Técnica para la columna {columna}", { columna: COLUMNA }))
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();
  await revisar(page, "/transformar (taller)");

  await page.getByLabel(en("Frase de paso del proyecto")).fill(FRASE_DE_LLAVE);
  await page.getByRole("button", { name: en("Derivar la llave") }).click();
  await page
    .getByRole("heading", { name: en("Llave lista") })
    .waitFor({ timeout: 60_000 });
  await revisar(page, "/transformar (llave lista)");

  await page
    .getByRole("button", { name: en("Transformar"), exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: en.enAlguna("Qué cambió, y qué sigue igual"),
    })
    .waitFor({ timeout: 60_000 });
  await revisar(page, "/transformar (resultado)");

  await page.getByRole("button", { name: en("Preparar el archivo") }).click();
  const guardarCsv = page.getByRole("link", {
    name: /^Save velo-anonimizado-/,
  });
  await guardarCsv.waitFor({ timeout: 60_000 });
  await revisar(page, "/transformar (archivo listo)");
  const [descargaCsv] = await Promise.all([
    page.waitForEvent("download"),
    guardarCsv.click(),
  ]);
  const anonimizado = temporal("anonimizado.csv");
  await descargaCsv.saveAs(anonimizado);

  await page.getByLabel(en("Frase de paso de la bóveda")).fill(FRASE_DE_BOVEDA);
  await page
    .getByRole("button", { name: en("Cifrar y preparar la bóveda") })
    .click();
  const [descargaVelo] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: en("Guardar la bóveda") })
      .click({ timeout: 60_000 }),
  ]);
  const boveda = temporal("boveda.velo");
  await descargaVelo.saveAs(boveda);
  await revisar(page, "/transformar (bóveda guardada)");

  // ── La bitácora: de la anotación al archivo ─────────────────────────────────────────────────
  await page.getByRole("button", { name: en("Anotar en mi bitácora") }).click();
  await page.waitForURL("**/bitacora");
  await page
    .getByLabel(en("Elige la frase de paso de tu bitácora"))
    .waitFor({ timeout: 60_000 });
  await revisar(page, "/bitacora (primera anotación)");
  await page
    .getByLabel(en("Elige la frase de paso de tu bitácora"))
    .fill(FRASE_DE_BITACORA);
  await page
    .getByRole("button", { name: en("Cifrar y empezar la bitácora") })
    .click();
  const [descargaLog] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: en("Guardar la bitácora") })
      .first()
      .click({ timeout: 60_000 }),
  ]);
  const bitacora = temporal("velo-bitacora.velolog");
  await descargaLog.saveAs(bitacora);
  await revisar(page, "/bitacora (guardada)");

  // ── El regreso y la bitácora abierta, en OTRA sesión ────────────────────────────────────────
  const contextoB = await browser.newContext({ locale: "en-US" });
  const paginaB = await contextoB.newPage();
  await paginaB.goto("/regreso");
  await paginaB
    .getByLabel(en("Elegir el archivo de bóveda"))
    .setInputFiles(boveda);
  await paginaB
    .getByLabel(en("Frase de paso de la bóveda"))
    .fill(FRASE_DE_BOVEDA);
  await paginaB.getByRole("button", { name: en("Abrir la bóveda") }).click();
  await paginaB
    .getByRole("heading", { name: en("Bóveda abierta") })
    .waitFor({ timeout: 60_000 });
  await revisar(paginaB, "/regreso (bóveda abierta)");

  await paginaB
    .getByLabel(en("Elegir el archivo que devolvió el tercero"))
    .setInputFiles(anonimizado);
  const restaurar = paginaB.getByRole("button", {
    name: en("Restaurar los valores originales"),
  });
  await restaurar.waitFor({ timeout: 60_000 });
  await revisar(paginaB, "/regreso (archivo devuelto leído)");
  await restaurar.click();
  const preparar = paginaB.getByRole("button", {
    name: en("Preparar el archivo restaurado"),
  });
  await preparar.waitFor({ timeout: 60_000 });
  await preparar.click();
  await paginaB
    .getByRole("link", { name: en("Guardar el archivo restaurado") })
    .waitFor({ timeout: 60_000 });
  await revisar(paginaB, "/regreso (restaurado)");

  await paginaB.goto("/bitacora");
  await paginaB.getByLabel(en("Archivo de bitácora")).setInputFiles(bitacora);
  await paginaB.getByLabel(en("Frase de paso")).fill(FRASE_DE_BITACORA);
  await paginaB.getByRole("button", { name: en("Abrir la bitácora") }).click();
  await paginaB
    .getByRole("heading", { name: en("Un tratamiento anotado") })
    .waitFor({ timeout: 60_000 });
  await revisar(paginaB, "/bitacora (abierta)");
  await contextoB.close();

  // Una sola lista de fallos, con la pantalla de cada uno: así una corrida roja los muestra todos.
  expect(fallos, "palabras en español en la interfaz inglesa").toEqual([]);
});
