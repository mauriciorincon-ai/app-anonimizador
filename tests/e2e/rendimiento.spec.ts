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

import {
  BITACORA_GRANDE,
  ENTRADAS_DE_LA_BITACORA_GRANDE,
  FRASE_DE_LA_BITACORA_GRANDE,
  nombreDeFixture,
} from "./global-setup";

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

    // La cifra se ANOTA, no solo se comprueba. Un gate que solo habla cuando falla obliga a
    // provocar un fallo para saber por cuánto se pasa — y el summary del sprint tiene que poder
    // citar el número medido, no «pasó».
    const medicion = `${tareas.length} tareas largas · total ${total} ms · peor ${peor} ms`;
    info.annotations.push({ type: "bitácora de 2.000 entradas", description: medicion });

    expect(total, medicion).toBeLessThan(PRESUPUESTO_DE_TAREAS_LARGAS_MS);
    expect(peor).toBeLessThan(TAREA_LARGA_MAXIMA_MS);
  });
});

test.describe("la bitácora que ha crecido", () => {
  test("2.000 entradas se abren y se pintan sin congelar el hilo principal", async ({
    page,
  }, info) => {
    // El ADR-007 dejó abierta una pregunta: «la bitácora crece sin techo declarado; se mide en la
    // fase 4 y si hace falta se declara el tope con su número». Esto es esa medición.
    //
    // Lo que se mide NO es el descifrado —eso ocurre en el worker, como todo lo pesado— sino lo
    // que pasa **en el hilo principal** cuando llegan 2.000 entradas y hay que pintarlas. Es la
    // superficie nueva: la bóveda nunca enseñó sus pares, y esta pantalla sí enseña sus entradas.
    test.skip(
      info.project.name !== "desktop-chromium",
      "la medición del hilo principal no cambia por viewport (declarado en el summary)",
    );
    test.setTimeout(180_000);

    await page.goto("/bitacora", { waitUntil: "load" });
    await page
      .getByRole("heading", { name: "Abre la bitácora que guardaste" })
      .waitFor({ timeout: 60_000 });

    await page.evaluate(() => {
      const global = window as unknown as { __tareas: number[] };
      global.__tareas = [];
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) {
          global.__tareas.push(Math.round(entrada.duration));
        }
      }).observe({ entryTypes: ["longtask"] });
    });

    await page
      .getByLabel("Archivo de bitácora")
      .setInputFiles(BITACORA_GRANDE);
    await page.getByLabel("Frase de paso").fill(FRASE_DE_LA_BITACORA_GRANDE);
    await page.getByRole("button", { name: "Abrir la bitácora" }).click();

    // La interfaz responde mientras el worker deriva la llave: el estado se ve.
    await expect(page.getByRole("status")).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: `${ENTRADAS_DE_LA_BITACORA_GRANDE.toLocaleString("es-CO")} tratamientos anotados`,
      }),
    ).toBeVisible({ timeout: 120_000 });

    // Y se puede USAR: desplegar una entrada cualquiera sigue siendo instantáneo.
    await page.getByRole("button", { name: /estudio-01999/ }).click();
    await expect(page.getByText(/Huella de salida/).first()).toBeVisible();

    const tareas = await page.evaluate(
      () => (window as unknown as { __tareas: number[] }).__tareas,
    );
    const total = tareas.reduce((suma, duracion) => suma + duracion, 0);
    const peor = tareas.length ? Math.max(...tareas) : 0;

    // La cifra se ANOTA, no solo se comprueba. Un gate que solo habla cuando falla obliga a
    // provocar un fallo para saber por cuánto se pasa — y el summary del sprint tiene que poder
    // citar el número medido, no «pasó».
    const medicion = `${tareas.length} tareas largas · total ${total} ms · peor ${peor} ms`;
    info.annotations.push({ type: "bitácora de 2.000 entradas", description: medicion });

    expect(total, medicion).toBeLessThan(PRESUPUESTO_DE_TAREAS_LARGAS_MS);
    expect(peor).toBeLessThan(TAREA_LARGA_MAXIMA_MS);
  });
});
