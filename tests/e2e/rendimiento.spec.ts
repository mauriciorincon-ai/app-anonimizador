// Rendimiento medido en un navegador de verdad.
//
// Existe porque el presupuesto de Lighthouse mide otra cosa. Lantern —el simulador de Lighthouse—
// toma la traza real y la reproyecta sobre una 4G lenta genérica: para esta página da ~2,9 s de
// LCP, mientras que el LCP OBSERVADO en el mismo build es de unos 0,4 s. Ninguno de los dos
// números miente; miden cosas distintas, y el que le pasa al usuario en el navegador es este.
//
// Así que el gate va en pareja: el presupuesto simulado con su margen documentado
// (`perf-budget.json`), y aquí el número observado con un techo estricto. Si un día la página
// engorda de verdad, este test se pone rojo antes que el otro.

import { expect, test } from "@playwright/test";

/** Techo del LCP observado. Holgado contra la medición real (~0,4 s), estricto contra una regresión. */
const LCP_MAXIMO_MS = 1_500;

test("la aduana pinta su elemento principal muy por debajo del techo", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "load" });

  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let ultimo = 0;
        new PerformanceObserver((lista) => {
          for (const entrada of lista.getEntries()) ultimo = entrada.startTime;
          // `buffered: true` entrega también las entradas anteriores a este observador, así que no
          // hace falta instalarlo antes de navegar.
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(ultimo), 600);
      }),
  );

  expect(lcp).toBeGreaterThan(0); // que de verdad midió algo
  expect(lcp).toBeLessThan(LCP_MAXIMO_MS);
});
