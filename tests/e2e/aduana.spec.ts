// El camino que recorre una persona: soltar la tabla, leer el diagnóstico, llevarse el reporte.
//
// Todo pasa POR LA UI —clics y teclado desde `/`— y no llamando a funciones por debajo: un flujo
// que solo se prueba por dentro puede estar roto en el único sitio donde el usuario lo toca.

import { expect, test } from "@playwright/test";
import { join } from "node:path";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const SIN_PERSONALES = nombreDeFixture("sin-personales", 800, 42);
const EXCEL = nombreDeFixture("clinico", 1_000, 42, "xlsx");
const NO_TABLA = join(DIRECTORIO_DE_FIXTURES, "notas.txt");

test("camino feliz: del archivo al reporte descargado", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Mira tu tabla/ }),
  ).toBeVisible();
  await expect(page.getByText("Nada sale de este navegador.")).toBeVisible();

  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico");

  // El diagnóstico habla del archivo que se cargó, con su huella a la vista.
  await expect(
    page.getByRole("heading", { level: 1, name: "clinico-2000-s42.csv" }),
  ).toBeVisible();
  await expect(page.getByText(/2\.000 filas · 24 columnas/)).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{64}$/)).toBeVisible();

  // Riesgo exacto, con su marca de naturaleza.
  const riesgo = page.getByRole("region", {
    name: "Cuánta gente queda sola en tu tabla",
  });
  await expect(riesgo.getByText("Cifra exacta.")).toBeVisible();

  // Detección con su porqué y su fuente oficial.
  const tabla = page.getByRole("table");
  const filaDelNit = tabla.locator("tr", { hasText: "nit_empresa" });
  await expect(filaDelNit).toContainText("NIT con dígito de verificación");
  await expect(filaDelNit).toContainText("DIAN");
  await expect(filaDelNit).toContainText("Identificador directo");

  // Ninguna muestra es un valor completo.
  await expect(
    tabla.locator("tr", { hasText: "cedula_titular" }),
  ).toContainText(/\d{3}\*\*\*\d{2}/);

  // Y el reporte se descarga de verdad.
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar el reporte" }).click(),
  ]);
  expect(descarga.suggestedFilename()).toBe(
    "velo-diagnostico-clinico-2000-s42.html",
  );
});

test("la vista previa enseña el reporte antes de mandarlo a ningún lado", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico");

  await page.getByRole("button", { name: "Ver antes de descargar" }).click();
  const reporte = page.frameLocator('iframe[title="Vista previa del reporte"]');
  await expect(reporte.locator("h1")).toHaveText("clinico-2000-s42.csv");
  await expect(reporte.getByText("Nada salió de ese navegador")).toBeVisible();
  await expect(reporte.getByText(/sha256sum/)).toBeVisible();

  await page.getByRole("button", { name: "Cerrar la vista" }).click();
  await expect(
    page.locator('iframe[title="Vista previa del reporte"]'),
  ).toHaveCount(0);
});

test("se puede cargar el archivo sin arrastrar nada, solo con el teclado", async ({
  page,
}) => {
  await page.goto("/");
  // Se llega al control tabulando desde el principio del documento — sin ratón y sin arrastre.
  const entrada = page.locator("#archivo");
  for (
    let i = 0;
    i < 6 && !(await entrada.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(entrada).toBeFocused();
  await expect(page.getByText("Elegir archivo")).toBeVisible();

  // Abrir el diálogo del sistema con Enter es cosa del navegador; elegir el archivo dentro de él
  // es exactamente lo que hace `setInputFiles`. De ahí en adelante, el flujo completo.
  await page.setInputFiles("#archivo", SIN_PERSONALES);
  await page.waitForURL("**/diagnostico");
  await expect(
    page.getByText("Velo no reconoció datos personales aquí"),
  ).toBeVisible();
});

test("Excel se lee de punta a punta", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", EXCEL);
  await page.waitForURL("**/diagnostico");
  await expect(
    page.getByRole("heading", { level: 1, name: "clinico-1000-s42.xlsx" }),
  ).toBeVisible();
  await expect(page.getByText(/1\.000 filas · 24 columnas/)).toBeVisible();
});

test("un Excel por encima del tope se rechaza SIN abrirlo, y dice qué hacer", async ({
  page,
}) => {
  await page.goto("/");
  // El archivo se fabrica en el navegador para no mover 160 MB por el canal de pruebas. Entra
  // por la zona de arrastre, que es la otra vía de carga y la que no cubre `setInputFiles`.
  await page.evaluate(() => {
    const enorme = new File(
      [new Uint8Array(160 * 1024 * 1024)],
      "gigante.xlsx",
    );
    const transferencia = new DataTransfer();
    transferencia.items.add(enorme);
    const zona = document.querySelector("main > div > div") as HTMLElement;
    zona.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transferencia,
      }),
    );
  });

  const alerta = page.getByRole("alert", {
    name: "Ese Excel es más grande de lo que Velo puede abrir",
  });
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText("Guárdalo como CSV");
  await expect(alerta).toContainText("gigante.xlsx");
  // No navegó: el archivo nunca se abrió.
  expect(new URL(page.url()).pathname).toBe("/");
});

test("un archivo que no es tabla no rompe nada", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", NO_TABLA);
  const alerta = page.getByRole("alert", {
    name: "Velo no reconoce ese tipo de archivo",
  });
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText("guárdalo como CSV");

  // Y se puede volver a intentar sin recargar.
  await page.getByRole("button", { name: "Elegir otro archivo" }).click();
  await expect(page.getByText("Trae tu tabla")).toBeVisible();
});

test("recargar el diagnóstico no recupera nada, y la pantalla lo explica", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", SIN_PERSONALES);
  await page.waitForURL("**/diagnostico");
  await page.reload();

  await expect(
    page.getByRole("heading", { name: /No quedó nada/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Volver a la aduana" }).click();
  await expect(page.getByText("Trae tu tabla")).toBeVisible();
});

test.describe("con prefers-reduced-motion", () => {
  // En Playwright 1.62 la preferencia vive dentro de `contextOptions`, no suelta en `use`.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("todo sigue visible: el cinturón apaga el movimiento, no el contenido", async ({
    page,
  }) => {
    // El patrón que se protege: un cinturón mal puesto (`animation: none` sobre elementos que
    // entran animados desde `opacity: 0`) deja la pantalla en blanco para quien pidió menos
    // movimiento. Por eso el test afirma VISIBILIDAD REAL, no ausencia de animación.
    await page.goto("/");
    await expect(page.getByText("Trae tu tabla")).toBeVisible();

    await page.setInputFiles("#archivo", CLINICO);
    await page.waitForURL("**/diagnostico");

    await expect(
      page.getByRole("heading", { level: 1, name: "clinico-2000-s42.csv" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Descargar el reporte" }),
    ).toBeVisible();

    // Y las transiciones sí quedaron desactivadas. Se compara el número, no la cadena: el
    // navegador imprime el mismo valor como "0.00001s" o como "1e-05s" según le convenga.
    const segundos = await page
      .getByRole("button", { name: "Descargar el reporte" })
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(segundos).toBeLessThan(0.001);
  });
});
