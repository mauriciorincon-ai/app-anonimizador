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

import { nombreDeFixture } from "./global-setup";

/** Techo del LCP observado. Holgado contra la medición real (~0,4 s), estricto contra una regresión. */
const LCP_MAXIMO_MS = 1_500;

const QUINIENTOS_MIL = nombreDeFixture("clinico", 500_000, 42);

/**
 * Presupuesto de tareas largas del hilo principal durante el archivo de 500k.
 *
 * El número no es arbitrario: el worker tarda unos 5 segundos en ese archivo. Si el trabajo
 * ocurriera en el hilo principal —que es exactamente lo que la arquitectura promete que no pasa—
 * el total de tareas largas rondaría esos mismos 5.000 ms. Con un techo de 1.000 ms el test
 * distingue las dos situaciones con holgura, sin ponerse quisquilloso con el ruido de un runner
 * compartido. Medido en local: **0 tareas largas**.
 */
const PRESUPUESTO_DE_TAREAS_LARGAS_MS = 1_000;
const TAREA_LARGA_MAXIMA_MS = 300;

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

test.describe("el archivo grande", () => {
  test("500.000 filas por la UI sin congelar el hilo principal", async ({
    page,
  }, info) => {
    // Solo en un proyecto, y se declara: el fixture pesa 130 MB y correrlo en móvil y en
    // escritorio duplicaría el gasto sin añadir información — lo que se mide aquí es el hilo
    // principal, que es el mismo en los dos. Nada de recortes silenciosos: queda escrito aquí,
    // en la bitácora y en el summary del sprint.
    test.skip(
      info.project.name !== "desktop-chromium",
      "el fixture de 500k corre en un solo proyecto (declarado en el summary)",
    );
    test.setTimeout(180_000);
    await page.goto("/", { waitUntil: "load" });

    await page.evaluate(() => {
      const global = window as unknown as { __tareas: number[] };
      global.__tareas = [];
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) {
          global.__tareas.push(Math.round(entrada.duration));
        }
      }).observe({ entryTypes: ["longtask"] });
    });

    await page.setInputFiles("#archivo", QUINIENTOS_MIL);

    // Mientras el worker trabaja, la interfaz responde: la etapa se ve y cambia.
    await expect(page.getByRole("status")).toBeVisible();

    await page.waitForURL("**/diagnostico", { timeout: 150_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /clinico-500000/ }),
    ).toBeVisible();
    await expect(page.getByText(/500\.000 filas · 24 columnas/)).toBeVisible();

    const tareas = await page.evaluate(
      () => (window as unknown as { __tareas: number[] }).__tareas,
    );
    const total = tareas.reduce((suma, duracion) => suma + duracion, 0);
    const peor = tareas.length ? Math.max(...tareas) : 0;

    expect(
      total,
      `tareas largas: ${tareas.length}, total ${total} ms, peor ${peor} ms`,
    ).toBeLessThan(PRESUPUESTO_DE_TAREAS_LARGAS_MS);
    expect(peor).toBeLessThan(TAREA_LARGA_MAXIMA_MS);
  });
});
