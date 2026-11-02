// EL REGRESO DE UN JSON, POR LA UI (S7) — anonimizar un JSON Lines con una ruta reversible, guardar la
// bóveda, y en OTRA sesión restaurar lo que «devolvió el tercero».
//
// La promesa que se prueba es la más fuerte que Velo puede hacer con un JSON: si el tercero no tocó
// nada, el archivo restaurado es el ORIGINAL, byte por byte —estructura, orden de claves, todo—. Y
// como con cualquier formato, mientras tanto no sale una sola petición con datos.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, FIXTURE_ANIDADO_JSONL } from "./global-setup";

const FRASE_DE_LLAVE = "una frase larga de prueba";
const FRASE_DE_BOVEDA = "otra frase larga, la de la boveda";
const RUTA = "paciente.contacto.correo";

/** Escucha la red de la página y anota cualquier petición con cuerpo o fuera del origen. */
function vigilarLaRed(page: Page, origen: string): string[] {
  const sospechosas: string[] = [];
  page.on("request", (peticion) => {
    const url = new URL(peticion.url());
    if (url.origin !== origen)
      sospechosas.push(`fuera del origen: ${url.href}`);
    if (peticion.postData()) sospechosas.push(`con cuerpo: ${url.pathname}`);
  });
  page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));
  return sospechosas;
}

test("un JSON Lines con una ruta reversible vuelve a su original, byte por byte, en otra sesión", async ({
  browser,
  baseURL,
}, info) => {
  const origen = new URL(baseURL!).origin;
  const original = readFileSync(FIXTURE_ANIDADO_JSONL, "utf8");

  // ── Sesión 1: anonimizar y guardar la bóveda ────────────────────────────────────────────────
  const contextoA = await browser.newContext();
  const page = await contextoA.newPage();
  const redA = vigilarLaRed(page, origen);
  await page.goto("/");
  await page.setInputFiles("#archivo", FIXTURE_ANIDADO_JSONL);
  await page.waitForURL("**/diagnostico", { timeout: 90_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  await page
    .getByLabel(`Técnica para la columna ${RUTA}`)
    .selectOption("seudonimizar");
  // La casilla de la bóveda ya no se apaga con un JSON (S7).
  const casilla = page.getByRole("checkbox").first();
  await expect(casilla).toBeEnabled();
  await casilla.check();
  await expect(page.getByText(/guardar una bóveda/)).toBeVisible();

  await page.getByLabel("Frase de paso del proyecto").fill(FRASE_DE_LLAVE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 90_000 });

  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/\.jsonl$/);
  const anonimizado = join(
    DIRECTORIO_DE_FIXTURES,
    `w${info.workerIndex}-anonimizado.jsonl`,
  );
  await descarga.saveAs(anonimizado);

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
  const boveda = join(
    DIRECTORIO_DE_FIXTURES,
    `w${info.workerIndex}-boveda-json.velo`,
  );
  await descargaVelo.saveAs(boveda);
  await contextoA.close();

  // Lo entregado no lleva ni un correo del original.
  const entregado = readFileSync(anonimizado, "utf8");
  const correos = [...original.matchAll(/"correo":"([^"]+)"/g)].map(
    (m) => m[1],
  );
  expect(correos.length).toBeGreaterThan(100);
  for (const correo of correos.slice(0, 50))
    expect(entregado).not.toContain(correo);

  // ── Sesión 2: sin memoria de nada, restaurar ────────────────────────────────────────────────
  const contextoB = await browser.newContext();
  const pageB = await contextoB.newPage();
  const redB = vigilarLaRed(pageB, origen);
  await pageB.goto("/regreso");
  await pageB.getByLabel("Elegir el archivo de bóveda").setInputFiles(boveda);
  await pageB.getByLabel("Frase de paso de la bóveda").fill(FRASE_DE_BOVEDA);
  await pageB.getByRole("button", { name: "Abrir la bóveda" }).click();
  await pageB
    .getByRole("heading", { name: "Bóveda abierta" })
    .waitFor({ timeout: 60_000 });

  await pageB
    .getByLabel("Elegir el archivo que devolvió el tercero")
    .setInputFiles(anonimizado);
  await expect(pageB.getByText(/2\.000 filas/)).toBeVisible({
    timeout: 60_000,
  });
  await pageB
    .getByRole("button", { name: "Restaurar los valores originales" })
    .click();
  const preparar = pageB.getByRole("button", {
    name: "Preparar el archivo restaurado",
  });
  await preparar.waitFor({ timeout: 60_000 });
  await preparar.click();
  const [restaurada] = await Promise.all([
    pageB.waitForEvent("download"),
    pageB
      .getByRole("link", { name: "Guardar el archivo restaurado" })
      .click({ timeout: 60_000 }),
  ]);
  expect(restaurada.suggestedFilename()).toMatch(
    /^velo-restaurado-[0-9a-f]{8}\.jsonl$/,
  );
  const texto = readFileSync((await restaurada.path())!, "utf8");
  expect(texto).toBe(original);
  await contextoB.close();

  expect(redA).toEqual([]);
  expect(redB).toEqual([]);
});
