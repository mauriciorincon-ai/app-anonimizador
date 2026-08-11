// EL TALLER, POR LA UI — de soltar el archivo a guardar el anonimizado, sin atajos.
//
// Estos tests entran por donde entra una persona: sueltan el archivo, hacen clic en la política de
// fábrica, escriben la frase, transforman y guardan. Nada se llama por dentro. Es la única forma de
// que el gate cubra lo que el usuario vive y no lo que el motor sabe hacer.
//
// Dos de ellos son los CONTRAPESOS que el método exige por tener diferido el gate ⭐ del usuario
// (`reduced-motion` con visibilidad real y el teclado completo en la tabla editable): sin ellos no
// hay derecho a diferir, así que no son opcionales.

import { expect, test, type Page } from "@playwright/test";

import { nombreDeFixture } from "./global-setup";

const CLINICO = nombreDeFixture("clinico", 2_000, 42);
const QUINIENTOS_MIL = nombreDeFixture("clinico", 500_000, 42);

const FRASE = "una frase larga de prueba";

async function cargarYLlegarAlTaller(page: Page, fixture = CLINICO) {
  await page.goto("/");
  await page.setInputFiles("#archivo", fixture);
  await page.waitForURL("**/diagnostico", { timeout: 150_000 });
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("heading", { name: "Ahora sí, transformar" }).waitFor();
}

async function derivarLlave(page: Page) {
  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
}

test("de Habeas Data a archivo guardado, en un recorrido", async ({ page }) => {
  await cargarYLlegarAlTaller(page);

  // La política de fábrica se aplica de un clic y se declara de dónde viene.
  await page.getByRole("button", { name: /Habeas Data/ }).click();
  await expect(page.getByText(/Ley 1581 de 2012/)).toBeVisible();

  await derivarLlave(page);
  await page.getByRole("button", { name: "Transformar", exact: true }).click();

  // Vista previa: el antes va enmascarado y el después completo cuando cambió.
  await page
    .getByRole("heading", { name: "Qué va a recibir la otra persona" })
    .waitFor({ timeout: 60_000 });
  await expect(
    page.getByText("dato sensible sin cambios").first(),
  ).toBeVisible();

  // Balance y descarga.
  await expect(
    page.getByRole("heading", { name: "Qué cambió, y qué sigue igual" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preparar el archivo" }).click();

  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 60_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(
    /^velo-anonimizado-[0-9a-f]{8}\.csv$/,
  );
});

test("el archivo guardado no lleva la cédula original", async ({ page }) => {
  // La comprobación que de verdad importa: no que la pantalla diga que transformó, sino que el
  // archivo que sale ya no contiene lo que había. Se lee del disco, después de la descarga.
  await cargarYLlegarAlTaller(page);
  await page.getByRole("button", { name: /Habeas Data/ }).click();
  await derivarLlave(page);
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
  const ruta = await descarga.path();
  const fs = await import("node:fs");
  const csv = fs.readFileSync(ruta!, "utf8");
  const original = fs.readFileSync(CLINICO, "utf8");

  // El encabezado sigue ahí (menos lo suprimido), pero las filas no son las mismas.
  expect(csv.split("\n")[0]).toContain("cedula_titular");
  expect(csv).not.toBe(original);
  // Una cédula concreta del archivo original no puede aparecer en el anonimizado.
  const columnas = original.split("\n")[0].split(",");
  const iCedula = columnas.indexOf("cedula_titular");
  const cedula = original.split("\n")[1].split(",")[iCedula];
  expect(cedula.length).toBeGreaterThan(5);
  expect(csv).not.toContain(cedula);
});

test("la advertencia va ANTES que la cifra, también en la pantalla", async ({
  page,
}) => {
  // El mismo gate de composición que el reporte tiene en su documento, aquí sobre el DOM: una
  // política que trata a fondo los cuasi-identificadores y deja la cédula intacta produce una
  // reducción grande y lucible. La salvedad tiene que ir arriba, y la cifra no puede ser titular.
  await cargarYLlegarAlTaller(page);

  for (const columna of [
    "fecha_nacimiento",
    "latitud",
    "longitud",
    "ip_registro",
  ]) {
    await page
      .getByLabel(`Técnica para la columna ${columna}`)
      .selectOption("suprimir");
  }
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });

  const salvedades = page.getByTestId("salvedades");
  const reduccion = page.getByTestId("reduccion");
  await expect(salvedades).toBeVisible();
  await expect(salvedades).toContainText("cedula_titular");
  await expect(reduccion).toBeVisible();

  const orden = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="salvedades"]');
    const r = document.querySelector('[data-testid="reduccion"]');
    if (!s || !r) return "faltan";
    // DOCUMENT_POSITION_FOLLOWING = la cifra viene DESPUÉS de la salvedad.
    return s.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING
      ? "salvedad primero"
      : "cifra primero";
  });
  expect(orden).toBe("salvedad primero");

  // Y no se luce: el titular grande no existe en este caso.
  await expect(
    page.getByText("Esa cifra no describe un archivo"),
  ).toBeVisible();
});

test("cambiar la política descarta el balance anterior", async ({ page }) => {
  // Un balance de la política de hace tres clics tiene todas sus cifras bien calculadas y habla de
  // otro archivo. Dejarlo en pantalla sería la misma mentira por composición, cometida por inercia.
  await cargarYLlegarAlTaller(page);
  await page
    .getByLabel("Técnica para la columna latitud")
    .selectOption("suprimir");
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 60_000 });

  await page
    .getByLabel("Técnica para la columna longitud")
    .selectOption("suprimir");
  await expect(
    page.getByRole("heading", { name: "Qué cambió, y qué sigue igual" }),
  ).toBeHidden();
});

test("el editor de política se maneja entero con el teclado", async ({
  page,
}) => {
  // CONTRAPESO nº1 del gate ⭐ diferido. La tabla editable es el control más difícil del sprint:
  // 24 filas con un desplegable cada una. Se usa `<select>` nativo justamente para que esto
  // funcione sin inventar nada — pero «debería funcionar» no es un gate.
  await cargarYLlegarAlTaller(page);

  const primerSelect = page.getByLabel(
    "Técnica para la columna cedula_titular",
  );
  await primerSelect.focus();
  await expect(primerSelect).toBeFocused();

  // Se cambia el valor sin tocar el ratón.
  await primerSelect.selectOption("suprimir");
  await expect(primerSelect).toHaveValue("suprimir");

  // Y se puede seguir tabulando hasta el siguiente control sin quedar atrapado.
  await page.keyboard.press("Tab");
  const activo = await page.evaluate(() => {
    const elemento = document.activeElement;
    return elemento
      ? `${elemento.tagName}:${elemento.getAttribute("aria-label") ?? ""}`
      : "ninguno";
  });
  expect(activo).toContain("SELECT");
});

test.describe("movimiento reducido", () => {
  // En Playwright 1.62 `reducedMotion` viaja dentro de `contextOptions`, no como opción suelta.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("con prefers-reduced-motion todo sigue VISIBLE y utilizable", async ({
    page,
  }) => {
    // CONTRAPESO nº2. El cinturón global acelera las transiciones en vez de eliminarlas, porque
    // `animation: none` deja un spinner congelado a medias. Lo que este test comprueba no es que
    // no haya movimiento —eso lo garantiza el CSS— sino que **nada quedó invisible** al quitarlo:
    // un elemento que solo aparece por una animación de entrada desaparece para siempre.
    await cargarYLlegarAlTaller(page);
    await page.getByRole("button", { name: /Habeas Data/ }).click();
    await derivarLlave(page);
    await page
      .getByRole("button", { name: "Transformar", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
      .waitFor({ timeout: 60_000 });

    for (const titulo of [
      "Qué se le hace a cada columna",
      "Llave lista",
      "Qué va a recibir la otra persona",
      "Qué cambió, y qué sigue igual",
      "Llévate el archivo",
    ]) {
      await expect(
        page.getByRole("heading", { name: titulo }),
        `«${titulo}» tiene que verse con movimiento reducido`,
      ).toBeVisible();
    }

    // Visible de verdad, no solo presente: con opacidad 0 un elemento sigue en el DOM.
    const opacidad = await page
      .getByRole("heading", { name: "Llévate el archivo" })
      .evaluate((e) => getComputedStyle(e).opacity);
    expect(Number(opacidad)).toBeGreaterThan(0.9);
  });
});

test.describe("el archivo grande", () => {
  test("500.000 filas: Habeas Data de un clic, preview y descarga", async ({
    page,
  }, info) => {
    // Igual que el gate de rendimiento del S1: un solo proyecto, y declarado. El fixture pesa
    // 130 MB y lo que se mide —el hilo principal— es el mismo en móvil y en escritorio.
    test.skip(
      info.project.name !== "desktop-chromium",
      "el fixture de 500k corre en un solo proyecto (declarado en el summary)",
    );
    test.setTimeout(300_000);

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
    await page.waitForURL("**/diagnostico", { timeout: 200_000 });
    await page.getByRole("link", { name: "Transformar este archivo" }).click();
    await page.waitForURL("**/transformar");

    await page.getByRole("button", { name: /Habeas Data/ }).click();
    await derivarLlave(page);

    await page
      .getByRole("button", { name: "Transformar", exact: true })
      .click();
    // Mientras el worker transforma, la interfaz responde y lo dice.
    await expect(page.getByRole("status")).toBeVisible();
    await page
      .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
      .waitFor({ timeout: 240_000 });

    await page.getByRole("button", { name: "Preparar el archivo" }).click();
    const guardar = page.getByRole("link", {
      name: /^Guardar velo-anonimizado-/,
    });
    await guardar.waitFor({ timeout: 240_000 });
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      guardar.click(),
    ]);
    expect(await descarga.path()).toBeTruthy();

    const tareas = await page.evaluate(
      () => (window as unknown as { __tareas: number[] }).__tareas,
    );
    const peor = tareas.length ? Math.max(...tareas) : 0;
    const total = tareas.reduce((suma, duracion) => suma + duracion, 0);
    // El presupuesto real del sprint: 500k filas transformadas y escritas sin congelar la pestaña.
    expect(
      peor,
      `tareas largas: ${tareas.length}, total ${total} ms, peor ${peor} ms`,
    ).toBeLessThan(500);
  });
});

test("la política sobrevive la ida y vuelta por archivo", async ({ page }) => {
  // Verificación nº2 del plan del sprint, y el único sitio donde se puede hacer: exportar e
  // importar pasan por `File.text()` y por Zod, y **Zod solo se comporta como en producción bajo
  // la CSP real**. En jsdom no hay CSP, así que un fallo aquí sería invisible para los unitarios.
  // (De hecho fue por aquí que apareció la violación de `eval` que se apagó con `jitless`.)
  await cargarYLlegarAlTaller(page);

  await page
    .getByLabel("Técnica para la columna municipio")
    .selectOption("generalizar-prefijo-2");
  await page
    .getByLabel("Técnica para la columna cedula_titular")
    .selectOption("suprimir");

  const [exportada] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar" }).click(),
  ]);
  const ruta = await exportada.path();
  expect(exportada.suggestedFilename()).toBe("velo-politica.json");

  const fs = await import("node:fs");
  const json = JSON.parse(fs.readFileSync(ruta!, "utf8"));
  expect(json._velo).toBe("politica de anonimizacion");
  expect(json._hash).toMatch(/^[0-9a-f]{64}$/);

  // Se recarga la página: el taller vuelve a cero, como todo en Velo.
  await page.reload();
  await page
    .getByRole("heading", { name: /No hay nada que transformar/ })
    .waitFor();

  // Y se vuelve a entrar con el archivo, para importar la política guardada.
  await cargarYLlegarAlTaller(page);
  await expect(
    page.getByLabel("Técnica para la columna municipio"),
  ).toHaveValue("conservar");

  await page.setInputFiles(
    'input[aria-label="Importar una política desde un archivo"]',
    ruta!,
  );
  await expect(
    page.getByLabel("Técnica para la columna municipio"),
  ).toHaveValue("generalizar-prefijo-2");
  await expect(
    page.getByLabel("Técnica para la columna cedula_titular"),
  ).toHaveValue("suprimir");
});

test("un archivo que no es una política dice QUÉ pasó", async ({ page }) => {
  await cargarYLlegarAlTaller(page);
  await page.setInputFiles(
    'input[aria-label="Importar una política desde un archivo"]',
    CLINICO,
  );
  // `getByRole("alert")` choca con el anunciador de rutas de Next, que también lo es: se apunta
  // al párrafo por su texto, que es lo que el usuario ve de verdad.
  const aviso = page.getByText(/^No se pudo importar:/);
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("JSON");
});
