// Accesibilidad automática, en las dos pantallas y en los DOS temas.
//
// Correr axe en un solo tema es cómodo y deja pasar justo el defecto más común: un contraste que
// solo se rompe en oscuro (precedente del pipeline: 3,1:1 en la app de habla, S1). Por eso el
// barrido se repite por tema.
//
// axe automatiza más o menos el 30 % de las reglas de la WCAG; lo que no automatiza —el foco que
// se pierde, el orden de lectura que no tiene sentido— sigue siendo trabajo del gate manual.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { join } from "node:path";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const NO_TABLA = join(DIRECTORIO_DE_FIXTURES, "notas.txt");

/** Resumen legible: el objeto crudo de una violación ocupa cientos de líneas en el reporte. */
function resumir(violaciones: { id: string; nodes: unknown[] }[]) {
  return violaciones.map((v) => `${v.id} (${v.nodes.length})`);
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`tema ${tema}`, () => {
    test.use({ colorScheme: tema });

    test("la aduana en reposo pasa axe", async ({ page }) => {
      await page.goto("/");
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(resumir(violations)).toEqual([]);
    });

    test("el error de formato pasa axe", async ({ page }) => {
      await page.goto("/");
      await page.setInputFiles("#archivo", NO_TABLA);
      await page
        .getByRole("alert", { name: /Velo no reconoce ese tipo de archivo/ })
        .waitFor();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(resumir(violations)).toEqual([]);
    });

    test("el diagnóstico completo pasa axe", async ({ page }) => {
      await page.goto("/");
      await page.setInputFiles("#archivo", CLINICO);
      await page.waitForURL("**/diagnostico");
      await page
        .getByRole("heading", { level: 1, name: /clinico-2000-s42\.csv/ })
        .waitFor();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(resumir(violations)).toEqual([]);
    });

    test("el diagnóstico sin datos cargados pasa axe", async ({ page }) => {
      await page.goto("/diagnostico");
      await page.getByRole("heading", { name: /No quedó nada/ }).waitFor();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(resumir(violations)).toEqual([]);
    });
  });
}
