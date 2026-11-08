// LA GENERALIZACIÓN ÓPTIMA, POR LA UI (S7) — marcar columnas para el reparto, comparar los dos
// caminos, elegir la óptima, transformar y guardar.
//
// Se prueba lo que el usuario vive: que la comparación llega con sus dos columnas, que elegir la
// óptima cambia el archivo que sale (cada campo en UN nivel de su escalera, el mismo en todo el
// archivo), y que en todo el recorrido no sale una sola petición con datos.

import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);

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

/** Los valores de una columna de un CSV sin comillas en esa columna (el kit no las pone ahí). */
function columna(csv: string, nombre: string): string[] {
  const [encabezado, ...filas] = csv.trimEnd().split("\n");
  const i = encabezado.split(",").indexOf(nombre);
  return filas.map((f) => f.split(",")[i]);
}

test("comparar, elegir la óptima, transformar y guardar: cada campo en un nivel, sin red", async ({
  page,
  baseURL,
}) => {
  const red = vigilarLaRed(page, new URL(baseURL!).origin);
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  for (const nombre of ["municipio", "sexo", "estrato"])
    await page
      .getByLabel(`Técnica para la columna ${nombre}`)
      .selectOption("generalizar-automatico");

  // El panel aparece debajo del k, con la escalera que propone para cada columna.
  await expect(
    page.getByRole("heading", { name: "Cómo llegar al k" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Escalera de generalización para la columna municipio"),
  ).toHaveValue("divipola");

  await page.getByRole("button", { name: "Comparar los dos caminos" }).click();
  const tabla = page.getByRole("table");
  await tabla.waitFor({ timeout: 60_000 });
  await expect(
    tabla.getByRole("row", { name: /¿Llega al k pedido \(5\)\?/ }),
  ).toContainText("✓Sí");
  await expect(
    tabla.getByRole("row", { name: /Combinaciones revisadas/ }),
  ).toContainText(/\d+ de \d+/);
  // Lo que la tabla dice de cada columna en la óptima (la segunda celda: la primera es Mondrian).
  const REPARTO = ["municipio", "sexo", "estrato"];
  const nivelDe = new Map<string, string>();
  for (const nombre of REPARTO)
    nivelDe.set(
      nombre,
      await tabla
        .getByRole("row", { name: new RegExp(`Cómo queda ${nombre}`) })
        .getByRole("cell")
        .nth(1)
        .innerText(),
    );

  await page.getByRole("radio", { name: "La generalización óptima" }).check();
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);

  const csv = readFileSync((await descarga.path())!, "utf8");
  const original = readFileSync(CLINICO, "utf8");
  // El archivo dice lo mismo que la tabla: lo que quedó «sin generalizar» sale idéntico, lo que
  // subió sale con menos valores distintos, y al menos una columna subió (el nodo de abajo no
  // llega a k = 5 con este archivo).
  let subieron = 0;
  for (const nombre of REPARTO) {
    const antes = columna(original, nombre);
    const despues = columna(csv, nombre);
    expect(despues).toHaveLength(antes.length);
    if (nivelDe.get(nombre)!.startsWith("sin generalizar"))
      expect(despues, nombre).toEqual(antes);
    else {
      subieron++;
      expect(new Set(despues).size, nombre).toBeLessThan(new Set(antes).size);
    }
    // Un nivel para todo el archivo: dos filas con el mismo valor salen con la misma etiqueta.
    const etiquetaDe = new Map<string, string>();
    antes.forEach((v, i) => {
      const vista = etiquetaDe.get(v);
      if (vista === undefined) etiquetaDe.set(v, despues[i]);
      else expect(despues[i], `${nombre}: ${v}`).toBe(vista);
    });
  }
  expect(subieron).toBeGreaterThan(0);

  // El certificado cuenta cómo se llegó al k, con la fuente y la fecha de la escalera de fábrica.
  const descargarCertificado = page.getByRole("button", {
    name: "Descargar el certificado",
  });
  await descargarCertificado.waitFor({ timeout: 60_000 });
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    descargarCertificado.click(),
  ]);
  const html = readFileSync((await certificado.path())!, "utf8");
  expect(html).toContain("La generalización óptima");
  expect(html).toContain("gdxc-w37w");
  expect(html).toContain("Ley 2056 de 2020, artículo 45");

  expect(red).toEqual([]);
});

// S11: la CIIU Rev. 5 se reconoce por sus códigos, y el tope de supresión se compara lado a lado.
const REV5 = nombreDeFixture("jerarquias-rev5", 1_500, 42);

test("la Rev. 5 se propone por sus códigos y el tope de supresión suma su columna, sin red", async ({
  page,
  baseURL,
}) => {
  const red = vigilarLaRed(page, new URL(baseURL!).origin);
  await page.goto("/");
  await page.setInputFiles("#archivo", REV5);
  await page.waitForURL("**/diagnostico", { timeout: 60_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  for (const nombre of ["edad", "codigo_municipio", "actividad_ciiu5"])
    await page
      .getByLabel(`Técnica para la columna ${nombre}`)
      .selectOption("generalizar-automatico");

  await expect(
    page.getByLabel(
      "Escalera de generalización para la columna actividad_ciiu5",
    ),
  ).toHaveValue("ciiu5");
  await expect(
    page.getByText(
      /de sus códigos solo existen en la Rev\. 5 A\.C\.: se propone esa\./,
    ),
  ).toBeVisible();

  await page
    .getByLabel("Tope de supresión (opcional), en % de las filas")
    .fill("3");
  await page.getByRole("button", { name: "Comparar los dos caminos" }).click();
  const tabla = page.getByRole("table");
  await tabla.waitFor({ timeout: 60_000 });
  await expect(
    tabla.getByRole("columnheader", { name: "Óptima, borrando hasta 3 %" }),
  ).toBeVisible();
  const quitadas = tabla.getByRole("row", {
    name: /Filas que salen del archivo/,
  });
  await expect(quitadas.getByRole("cell").nth(0)).toHaveText("0");
  await expect(quitadas.getByRole("cell").nth(1)).toHaveText("0");
  // Con el tope, la óptima borra a lo sumo el 3 % de 1.500 filas: 45.
  const borradas = Number(
    (await quitadas.getByRole("cell").nth(2).innerText()).replace(/\D/g, ""),
  );
  expect(borradas).toBeLessThanOrEqual(45);

  expect(red).toEqual([]);
});
