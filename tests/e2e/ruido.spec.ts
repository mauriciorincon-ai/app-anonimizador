// EL RUIDO CON GARANTÍA, POR LA UI (S7) — elegir Laplace y respuesta aleatorizada, transformar, ver
// el ε con su alcance, guardar, y comprobar en el archivo y en el certificado lo que la pantalla dijo.
//
// Se prueba lo que el usuario vive: que la técnica se elige con sus parámetros, que el panel de
// privacidad aparece APARTE del balance con el ε por fila, que el archivo trae ruido (los montos
// cambiaron, dentro del rango declarado; los diagnósticos siguen en su dominio), que transformar dos
// veces con la misma llave da el MISMO archivo, y que en todo el recorrido no sale una petición con
// datos.

import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const FRASE = "una frase larga de prueba";

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

function columna(csv: string, nombre: string): string[] {
  const [encabezado, ...filas] = csv.trimEnd().split("\n");
  const i = encabezado.split(",").indexOf(nombre);
  return filas.map((f) => f.split(",")[i]);
}

async function transformarYGuardar(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Privacidad diferencial local" })
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
  return readFileSync((await descarga.path())!, "utf8");
}

test("Laplace y respuesta aleatorizada: ε con su alcance, ruido en el archivo, el mismo dos veces, sin red", async ({
  page,
  baseURL,
}) => {
  const red = vigilarLaRed(page, new URL(baseURL!).origin);
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  await page
    .getByLabel("Técnica para la columna monto")
    .selectOption("laplace");
  await page.getByLabel("Máximo posible de monto").fill("10000000");
  await expect(
    page.getByText(
      /Privacidad diferencial local, ε = 1 por valor de este campo/,
    ),
  ).toBeVisible();
  await page
    .getByLabel("Técnica para la columna diagnostico")
    .selectOption("respuesta-aleatorizada");
  await page.getByLabel("ε de diagnostico").selectOption("2");

  // El ruido sale de la llave: sin ella no se transforma.
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });

  const primera = await transformarYGuardar(page);

  // El panel: aparte del balance, con el ε por fila y cada mecanismo con su alcance.
  const panel = page.getByRole("region", {
    name: "Privacidad diferencial local",
  });
  await expect(panel).toContainText("ε por fila: 3");
  await expect(panel.getByRole("row", { name: /monto/ })).toContainText(
    "Laplace discreto",
  );
  await expect(panel.getByRole("row", { name: /diagnostico/ })).toContainText(
    "sacado del archivo",
  );
  await expect(panel).toContainText("no se suma con ε");

  // El archivo: los montos cambiaron y siguen en el rango declarado; los diagnósticos, en su dominio.
  const original = readFileSync(CLINICO, "utf8");
  const montosAntes = columna(original, "monto");
  const montosDespues = columna(primera, "monto");
  expect(montosDespues).toHaveLength(montosAntes.length);
  const cambiados = montosDespues.filter((m, i) => m !== montosAntes[i]).length;
  expect(cambiados).toBeGreaterThan(montosAntes.length * 0.9);
  for (const m of montosDespues)
    if (m !== "") {
      expect(Number(m)).toBeGreaterThanOrEqual(0);
      expect(Number(m)).toBeLessThanOrEqual(10_000_000);
    }
  const dominio = new Set(columna(original, "diagnostico"));
  for (const d of columna(primera, "diagnostico"))
    expect(dominio.has(d), d).toBe(true);

  // Transformar otra vez con la misma llave y el mismo archivo: el MISMO ruido, byte por byte.
  const segunda = await transformarYGuardar(page);
  expect(segunda).toBe(primera);

  // El certificado lleva la sección, con el ε y la fuente del muestreo.
  const descargarCertificado = page.getByRole("button", {
    name: "Descargar el certificado",
  });
  await descargarCertificado.waitFor({ timeout: 60_000 });
  const [certificado] = await Promise.all([
    page.waitForEvent("download"),
    descargarCertificado.click(),
  ]);
  const html = readFileSync((await certificado.path())!, "utf8");
  expect(html).toContain("Privacidad diferencial local");
  expect(html).toContain("Canonne, Kamath y Steinke");

  expect(red).toEqual([]);
});
