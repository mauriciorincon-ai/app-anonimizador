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

import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { DIRECTORIO_DE_FIXTURES, nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);

/** Rutas que la aplicación puede pedirle a su propio origen. Nada más está permitido. */
const RUTAS_PERMITIDAS = [
  /^\/$/,
  /^\/diagnostico$/,
  /^\/transformar$/,
  /^\/regreso$/,
  /^\/bitacora$/,
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
  // Una columna reversible: sin bóveda no habría regreso que auditar, y el regreso es justo la
  // superficie nueva de este sprint.
  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("seudonimizar");
  await page.getByRole("checkbox").first().check();
  await page
    .getByLabel("Frase de paso del proyecto")
    .fill("una frase larga de prueba");
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page.getByText("Llave lista").waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });

  // La URL del enlace es `blob:` — un origen opaco de este documento. No hay petición de red que
  // interceptar porque no hay red: los bytes ya están en el navegador.
  expect(await guardar.getAttribute("href")).toMatch(/^blob:/);
  const [anonimizado] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  await anonimizado.path();

  // ── Y el REGRESO: abrir la bóveda y restaurar (S3) ────────────────────────────────────────
  //
  // La extensión que este sprint exige. Hasta aquí el gate cubría leer y escribir el archivo
  // anonimizado; a partir de aquí Velo abre un archivo cifrado que contiene los valores
  // ORIGINALES del usuario y los vuelve a escribir. Es el material más sensible que el producto
  // maneja y la superficie donde una fuga costaría más.
  await page
    .getByLabel("Frase de paso de la bóveda")
    .fill("la frase de la boveda");
  await page
    .getByRole("button", { name: "Cifrar y preparar la bóveda" })
    .click();
  const guardarBoveda = page.getByRole("link", { name: "Guardar la bóveda" });
  await guardarBoveda.waitFor({ timeout: 60_000 });
  expect(await guardarBoveda.getAttribute("href")).toMatch(/^blob:/);
  const [boveda] = await Promise.all([
    page.waitForEvent("download"),
    guardarBoveda.click(),
  ]);
  const rutaDeBoveda = join(DIRECTORIO_DE_FIXTURES, "red-boveda.velo");
  await boveda.saveAs(rutaDeBoveda);

  await page.getByRole("link", { name: "Ir al regreso" }).click();
  await page.waitForURL("**/regreso");
  await page
    .getByLabel("Elegir el archivo de bóveda")
    .setInputFiles(rutaDeBoveda);
  await page
    .getByLabel("Frase de paso de la bóveda")
    .fill("la frase de la boveda");
  await page.getByRole("button", { name: "Abrir la bóveda" }).click();
  await page
    .getByRole("heading", { name: "Bóveda abierta" })
    .waitFor({ timeout: 60_000 });

  // El archivo devuelto es el propio anonimizado: para la red da igual quién lo tocó antes.
  await page
    .getByLabel("Elegir el archivo que devolvió el tercero")
    .setInputFiles(await anonimizado.path());
  await page
    .getByRole("button", { name: "Restaurar los valores originales" })
    .click();
  await page
    .getByRole("button", { name: "Preparar el archivo restaurado" })
    .click({ timeout: 60_000 });
  const guardarRestaurado = page.getByRole("link", {
    name: "Guardar el archivo restaurado",
  });
  await guardarRestaurado.waitFor({ timeout: 60_000 });
  expect(await guardarRestaurado.getAttribute("href")).toMatch(/^blob:/);
  const [restaurado] = await Promise.all([
    page.waitForEvent("download"),
    guardarRestaurado.click(),
  ]);
  await restaurado.path();

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

test("la bitácora y el estimado tampoco mandan nada", async ({
  page,
  baseURL,
}) => {
  // Las dos superficies nuevas del S4, con el mismo listón que el resto:
  //
  //   · **La bitácora** es un archivo cifrado que lleva NOMBRES DE ARCHIVO del usuario — el ADR-005
  //     ya dijo que un nombre cuenta de qué va el contenido antes de que nadie lo abra. Se sella y
  //     se vuelve a abrir aquí dentro.
  //   · **El estimado** pide la población y devuelve una cifra; es la única interacción del sprint
  //     que se parece a una consulta, y por eso conviene demostrar que no consulta nada.
  const origen = new URL(baseURL!).origin;
  const sospechosas: string[] = [];
  const todas: string[] = [];

  page.on("request", (peticion) => {
    const url = new URL(peticion.url());
    todas.push(`${peticion.method()} ${url.pathname}`);
    if (url.origin !== origen) {
      sospechosas.push(`fuera del origen: ${peticion.url()}`);
      return;
    }
    if (peticion.postData()) {
      sospechosas.push(`con cuerpo: ${peticion.method()} ${url.pathname}`);
    }
    if (!RUTAS_PERMITIDAS.some((permitida) => permitida.test(url.pathname))) {
      sospechosas.push(`ruta no prevista: ${url.pathname}`);
    }
    for (const columna of COLUMNAS_DEL_FIXTURE) {
      if (peticion.url().includes(columna)) {
        sospechosas.push(`nombre de columna en la URL: ${peticion.url()}`);
      }
    }
  });
  page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));

  await page.goto("/");
  await page.setInputFiles("#archivo", CLINICO);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");

  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("enmascarar");
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });

  // El estimado: se declara una población y sale una cifra, sin salir de la pestaña.
  await page
    .getByLabel("¿De cuántas personas salió este archivo? (opcional)")
    .fill("20000");
  await page.getByRole("button", { name: "Estimar" }).click();
  await page
    .getByText(/Cifra estimada/)
    .first()
    .waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Preparar el archivo" }).click();
  await page
    .getByRole("link", { name: /^Guardar velo-anonimizado-/ })
    .waitFor({ timeout: 60_000 });

  // Y la bitácora, de punta a punta: sellar, guardar y volver a abrir.
  await page.getByRole("button", { name: "Anotar en mi bitácora" }).click();
  await page.waitForURL("**/bitacora");
  await page
    .getByLabel("Elige la frase de paso de tu bitácora")
    .fill("una frase larga para la bitacora");
  await page
    .getByRole("button", { name: "Cifrar y empezar la bitácora" })
    .click();

  const guardar = page
    .getByRole("link", { name: "Guardar la bitácora" })
    .first();
  await guardar.waitFor({ timeout: 60_000 });
  // `blob:` — un origen opaco de este documento. No hay petición que interceptar porque no hay red.
  expect(await guardar.getAttribute("href")).toMatch(/^blob:/);
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  const ruta = join(DIRECTORIO_DE_FIXTURES, "red-bitacora.velolog");
  await descarga.saveAs(ruta);

  // Se recarga la ruta a propósito: tras sellar, la bitácora ya está abierta en memoria y el
  // formulario de apertura desaparece —no hay nada que abrir—. Una recarga la vacía, que es la
  // promesa de la app, y deja el camino de LEER un `.velolog` del disco expuesto al listener.
  await page.goto("/bitacora");
  await page
    .getByLabel("Archivo de bitácora")
    .setInputFiles(ruta, { timeout: 60_000 });
  await page
    .getByLabel("Frase de paso")
    .fill("una frase larga para la bitacora");
  await page.getByRole("button", { name: "Abrir la bitácora" }).click();
  await page
    .getByRole("heading", { name: /tratamiento[s]? anotado/ })
    .waitFor({ timeout: 60_000 });

  await page.waitForTimeout(1_500);

  expect(sospechosas, `peticiones observadas:\n${todas.join("\n")}`).toEqual(
    [],
  );
  expect(todas.length).toBeGreaterThan(5);
});
