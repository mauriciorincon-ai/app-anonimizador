// LA GARANTÍA DE RED — la regla dura nº2 del producto, en forma de test.
//
// Velo promete que los datos del usuario jamás salen del navegador. Esa promesa no se sostiene con
// una declaración en la página web: se sostiene demostrando que durante el flujo completo —con un
// archivo cargado de verdad— no hubo una sola petición capaz de llevarse algo.
//
// El test escucha TODO lo que el navegador intenta hacer: peticiones de cualquier tipo, websockets
// y beacons (que aparecen como peticiones). Y no se conforma con "no hubo peticiones a otro
// dominio": exige que ninguna lleve cuerpo, que ninguna mencione un nombre de columna en su URL, y
// que todas caigan en la lista de rutas de la propia aplicación.
//
// Si un día alguien añade una analítica, un reporte de errores con contenido o un "guardar en la
// nube", este archivo se pone rojo antes de que llegue a `main`.

import { expect, test } from "@playwright/test";

import { nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);

/** Rutas que la aplicación puede pedirle a su propio origen. Nada más está permitido. */
const RUTAS_PERMITIDAS = [
  /^\/$/,
  /^\/diagnostico$/,
  /^\/transformar$/,
  /^\/_next\/static\//,
  /^\/favicon\.ico$/,
];

/**
 * Nombres de columna del fixture: si alguno aparece en una URL, hubo fuga.
 *
 * La columna `diagnostico` queda fuera de la lista a propósito, y no por comodidad: se llama igual
 * que la ruta `/diagnostico`, así que buscarla daría un positivo con la navegación normal de la
 * aplicación. Un test que grita cuando no pasa nada acaba silenciado, que es la peor forma de
 * perder un gate. Las otras cinco no colisionan con nada.
 */
const COLUMNAS_DEL_FIXTURE = [
  "cedula_titular",
  "nombre_completo",
  "grupo_etnico",
  "nit_empresa",
  "fecha_nacimiento",
  "referencia_pago",
];

/** Lo único que la aplicación puede llevar en una query string es el marcador de Next. */
const PARAMETROS_PERMITIDOS = new Set(["_rsc", "dpl"]);

test("cero peticiones con datos durante todo el flujo", async ({
  page,
  baseURL,
}) => {
  const origen = new URL(baseURL!).origin;
  const sospechosas: string[] = [];
  const todas: string[] = [];

  page.on("request", (peticion) => {
    const url = new URL(peticion.url());
    const cuerpo = peticion.postData();
    todas.push(`${peticion.method()} ${url.pathname}`);

    if (url.origin !== origen) {
      sospechosas.push(
        `fuera del origen: ${peticion.method()} ${peticion.url()}`,
      );
      return;
    }
    if (cuerpo) {
      sospechosas.push(
        `con cuerpo (${cuerpo.length} bytes): ${peticion.method()} ${url.pathname}`,
      );
    }
    if (!RUTAS_PERMITIDAS.some((permitida) => permitida.test(url.pathname))) {
      sospechosas.push(
        `ruta no prevista: ${peticion.method()} ${url.pathname}`,
      );
    }
    // Una fuga por la URL es tan real como una por el cuerpo: se revisa que la query string solo
    // lleve los parámetros de Next, y que ningún nombre de columna aparezca en la dirección.
    for (const parametro of url.searchParams.keys()) {
      if (!PARAMETROS_PERMITIDOS.has(parametro)) {
        sospechosas.push(
          `parámetro no previsto: ${parametro} en ${url.pathname}`,
        );
      }
    }
    const completa = peticion.url();
    for (const columna of COLUMNAS_DEL_FIXTURE) {
      if (completa.includes(columna)) {
        sospechosas.push(`nombre de columna en la URL: ${completa}`);
      }
    }
  });

  page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));

  // ── El flujo completo, con archivo cargado ────────────────────────────────────────────────
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico");
  await page.getByRole("heading", { level: 1, name: /clinico/ }).waitFor();

  // Se despliega todo lo desplegable: cada rincón de la interfaz cuenta.
  await page
    .getByRole("group")
    .first()
    .click()
    .catch(() => {});
  await page.getByRole("button", { name: "Ver antes de descargar" }).click();
  await page
    .frameLocator('iframe[title="Vista previa del reporte"]')
    .locator("h1")
    .waitFor();

  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar el reporte" }).click(),
  ]);
  await descarga.path();

  // ── Y el taller: transformar y DESCARGAR el archivo anonimizado ───────────────────────────
  //
  // Sin esta parte, la promesa central se quedaba sin gate justo en el sprint que la pone a
  // prueba: hasta aquí el archivo solo se había leído; a partir de aquí se reescribe entero y
  // sale del navegador hacia el disco. Es el momento con más superficie para una fuga —y el
  // único en que Velo produce bytes nuevos con datos dentro.
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  await page.getByRole("button", { name: /Habeas Data/ }).click();
  await page.getByLabel("Frase de paso del proyecto").fill("una frase larga de prueba");
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page.getByText("Llave lista").waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page.getByRole("heading", { name: "Qué cambió, y qué sigue igual" }).waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", { name: /^Guardar velo-anonimizado-/ });
  await guardar.waitFor({ timeout: 60_000 });

  // La URL del enlace es `blob:` — un origen opaco de este documento. No hay petición de red que
  // interceptar porque no hay red: los bytes ya están en el navegador.
  expect(await guardar.getAttribute("href")).toMatch(/^blob:/);
  const [anonimizado] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  await anonimizado.path();

  // Y un momento de reposo por si algo se enviara con retraso (un beacon diferido, por ejemplo).
  await page.waitForTimeout(1_500);

  expect(sospechosas, `peticiones observadas:\n${todas.join("\n")}`).toEqual(
    [],
  );
  // Que de verdad hubo tráfico que revisar: un test que no observó nada no probó nada.
  expect(todas.length).toBeGreaterThan(5);
});

test("el reporte descargado tampoco llama a nadie cuando se abre", async ({
  page,
}) => {
  // El reporte se abre en el computador de un tercero, quizá meses después. Si llevara un `<link>`
  // a un CDN, ese tercero le estaría avisando a un servidor cada vez que lo mira.
  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico");

  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar el reporte" }).click(),
  ]);
  const ruta = await descarga.path();
  const html = await import("node:fs").then((fs) =>
    fs.readFileSync(ruta!, "utf8"),
  );

  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/<script\b/i);
  expect(html).not.toMatch(/<link\b/i);
  expect(html).not.toMatch(/\burl\(/i);
  // Y sí lleva lo que tiene que llevar.
  expect(html).toMatch(/[0-9a-f]{64}/);
  expect(html).toContain("clinico-2000-s42.csv");
});
