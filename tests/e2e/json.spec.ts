// JSON, POR LA UI — de soltar el archivo a guardar el anonimizado, con la estructura a la vista.
//
// Un JSON no es una tabla, así que lo que se prueba aquí no es solo que «funciona»: es que Velo
// DICE qué trató y qué no (las listas salen tal cual y la pantalla lo declara), que el archivo que
// sale conserva la forma y el orden de claves del original, que dos corridas con lo mismo dan los
// mismos bytes, y que —como con cualquier formato— no sale una sola petición con datos.
//
// Entran por donde entra una persona: sueltan el archivo, eligen la política de fábrica, escriben la
// frase, transforman y guardan.

import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  FIXTURE_ANIDADO_JSON,
  FIXTURE_ANIDADO_JSONL,
  FIXTURE_CON_LISTAS_JSON,
  FIXTURE_HETEROGENEO_JSON,
} from "./global-setup";

const FRASE = "una frase larga de prueba";

type Objeto = Record<string, unknown>;

async function soltar(page: Page, fixture: string) {
  await page.goto("/");
  await page.setInputFiles("#archivo", fixture);
  await page.waitForURL("**/diagnostico", { timeout: 90_000 });
  await page
    .getByRole("heading", { name: "Qué se trató y qué no en este JSON" })
    .waitFor();
}

/** Del diagnóstico al archivo guardado: devuelve el nombre sugerido y el texto descargado. */
async function transformarYGuardar(page: Page) {
  await page.getByRole("link", { name: "Transformar este archivo" }).click();
  await page.waitForURL("**/transformar");
  await page.getByRole("heading", { name: "Ahora sí, transformar" }).waitFor();
  await page.getByRole("button", { name: /Habeas Data/ }).click();

  await page.getByLabel("Frase de paso del proyecto").fill(FRASE);
  await page.getByRole("button", { name: "Derivar la llave" }).click();
  await page
    .getByRole("heading", { name: "Llave lista" })
    .waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Transformar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Qué cambió, y qué sigue igual" })
    .waitFor({ timeout: 90_000 });
  // El panel de entrega nombra lo que se escribe: un JSON, nunca «un CSV» (hallazgo A1 del S6).
  await expect(
    page.getByText(/Un JSON (Lines )?con [\d.]+ registros/),
  ).toBeVisible();
  await expect(page.getByText(/Un CSV con/)).toHaveCount(0);
  await page.getByRole("button", { name: "Preparar el archivo" }).click();

  const guardar = page.getByRole("link", {
    name: /^Guardar velo-anonimizado-/,
  });
  await guardar.waitFor({ timeout: 90_000 });
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    guardar.click(),
  ]);
  return {
    nombre: descarga.suggestedFilename(),
    texto: readFileSync((await descarga.path())!, "utf8"),
  };
}

function leerRegistros(texto: string, lineas: boolean): Objeto[] {
  return lineas
    ? texto
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as Objeto)
    : (JSON.parse(texto) as Objeto[]);
}

/** ¿`sub` aparece en `completo` en el mismo orden, quizá con huecos (lo que la política quitó)? */
function esSubsecuencia(sub: string[], completo: string[]): boolean {
  let i = 0;
  for (const clave of completo) if (clave === sub[i]) i++;
  return i === sub.length;
}

/** Recorre los dos objetos a la vez: en cada nivel, las claves de la salida respetan el orden original. */
function respetaElOrden(salida: unknown, original: unknown): boolean {
  if (
    typeof salida !== "object" ||
    salida === null ||
    Array.isArray(salida) ||
    typeof original !== "object" ||
    original === null ||
    Array.isArray(original)
  )
    return true;
  const s = salida as Objeto;
  const o = original as Objeto;
  if (!esSubsecuencia(Object.keys(s), Object.keys(o))) return false;
  return Object.keys(s).every((k) => respetaElOrden(s[k], o[k]));
}

test("un JSON anidado: Velo dice qué trató y la salida conserva la forma y el orden de claves", async ({
  page,
}) => {
  await soltar(page, FIXTURE_ANIDADO_JSON);

  // La estructura a la vista: forma, sin listas, y las rutas como columnas.
  await expect(page.getByText("Arreglo de objetos").first()).toBeVisible();
  await expect(
    page.getByText(/Ninguna lista dentro de los registros/),
  ).toBeVisible();
  await expect(
    page.getByText("paciente.contacto.correo").first(),
  ).toBeVisible();

  const { nombre, texto } = await transformarYGuardar(page);
  expect(nombre).toMatch(/^velo-anonimizado-[0-9a-f]{8}\.json$/);

  const original = leerRegistros(
    readFileSync(FIXTURE_ANIDADO_JSON, "utf8"),
    false,
  );
  const salida = leerRegistros(texto, false);
  expect(salida).toHaveLength(original.length);

  // El orden de claves del original, en cada nivel, en una muestra repartida del archivo.
  for (const i of [0, 1, 17, 999, original.length - 1])
    expect(respetaElOrden(salida[i], original[i])).toBe(true);

  // Y lo que importa: la cédula original ya no está en el archivo que sale.
  const documento = (original[0].paciente as Objeto).documento as string;
  expect(documento.length).toBeGreaterThan(5);
  expect(texto).not.toContain(documento);
});

test("JSON Lines: se reconoce por el contenido y sale como JSON Lines", async ({
  page,
}) => {
  await soltar(page, FIXTURE_ANIDADO_JSONL);
  await expect(
    page.getByText("JSON Lines (un objeto por línea)").first(),
  ).toBeVisible();

  const { nombre, texto } = await transformarYGuardar(page);
  expect(nombre).toMatch(/^velo-anonimizado-[0-9a-f]{8}\.jsonl$/);
  expect(texto.endsWith("\n")).toBe(true);
  expect(leerRegistros(texto, true)).toHaveLength(2_000);
});

test("las listas se declaran antes y salen tal cual después", async ({
  page,
}) => {
  await soltar(page, FIXTURE_CON_LISTAS_JSON);

  // El aviso fuerte y las dos rutas que Velo no miró por dentro.
  await expect(page.getByText("Estas rutas salen sin tocar")).toBeVisible();
  await expect(page.getByText("contactos[]").first()).toBeVisible();
  await expect(page.getByText("etiquetas[]").first()).toBeVisible();

  const { texto } = await transformarYGuardar(page);
  const original = leerRegistros(
    readFileSync(FIXTURE_CON_LISTAS_JSON, "utf8"),
    false,
  );
  const salida = leerRegistros(texto, false);
  expect(salida).toHaveLength(original.length);
  // Lo declarado se cumple: la lista del primer registro es idéntica a la de entrada.
  expect(JSON.stringify(salida[0].contactos)).toBe(
    JSON.stringify(original[0].contactos),
  );
  expect(JSON.stringify(salida[0].etiquetas)).toBe(
    JSON.stringify(original[0].etiquetas),
  );
});

/** La forma de un valor: claves en su orden, números/booleanos/null tal cual y los textos como «s». */
function forma(valor: unknown): unknown {
  if (typeof valor === "string") return "s";
  if (Array.isArray(valor)) return valor.map(forma);
  if (valor !== null && typeof valor === "object")
    return Object.fromEntries(
      Object.entries(valor as Objeto).map(([k, v]) => [k, forma(v)]),
    );
  return valor;
}

test("lo heterogéneo se declara, conserva los números crudos y repite la forma", async ({
  page,
}) => {
  await soltar(page, FIXTURE_HETEROGENEO_JSON);
  await expect(
    page.getByText("Rutas que faltan en algunos registros o cambian de tipo"),
  ).toBeVisible();

  const primera = await transformarYGuardar(page);
  const registros = leerRegistros(primera.texto, false);
  expect(registros).toHaveLength(500);
  // El número que no cabe en un double sale con TODOS sus dígitos (JSON.parse lo habría roto).
  expect(primera.texto).toContain('"serial":12345678901234567890');
  // Y los que no son texto conservan su escritura original: `-0.0`, `1E3`, `0.10`.
  expect(primera.texto).toContain('"lectura":-0.0');
  expect(primera.texto).toContain('"lectura":1E3');

  // Otra corrida del mismo archivo, política y frase. Los seudónimos NO son iguales —la llave nace
  // con una sal aleatoria por proyecto, y que mismo dato + misma llave dé los mismos bytes ya lo
  // prueban los unit—, pero la forma entera sí: mismas claves en el mismo orden, mismos números,
  // mismos null y mismas ausencias.
  await soltar(page, FIXTURE_HETEROGENEO_JSON);
  const segunda = await transformarYGuardar(page);
  expect(segunda.nombre).toBe(primera.nombre);
  expect(forma(leerRegistros(segunda.texto, false))).toEqual(forma(registros));
});

test("un JSON roto se explica sin repetir lo que hay dentro", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles("#archivo", {
    name: "roto.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '{"a":1}\n{"b": SENTINELA_QUE_NO_DEBE_SALIR}\n',
      "utf8",
    ),
  });
  await expect(page.getByText("Ese archivo no es un JSON válido")).toBeVisible({
    timeout: 30_000,
  });
  // El mensaje dice QUÉ hacer y en qué línea, pero jamás cita el contenido del archivo.
  await expect(page.getByText(/línea 2/)).toBeVisible();
  const cuerpo = await page.locator("body").innerText();
  expect(cuerpo).not.toContain("SENTINELA_QUE_NO_DEBE_SALIR");
});

// ── La garantía de red, también para JSON ───────────────────────────────────────────────────
//
// Mismo criterio que `garantia-de-red.spec.ts`, con los nombres de ESTE formato: las rutas del
// JSON anidado son nombres de campo y, si alguno aparece en una URL, hubo fuga.

const RUTAS_PERMITIDAS = [
  /^\/$/,
  /^\/diagnostico$/,
  /^\/transformar$/,
  /^\/regreso$/,
  /^\/bitacora$/,
  /^\/_next\/static\//,
  /^\/favicon\.ico$/,
];
const CENTINELAS_DEL_JSON = [
  "paciente",
  "ubicacion",
  "empleador",
  "contacto",
  "documento",
  "correo",
  "direccion",
];
const PARAMETROS_PERMITIDOS = new Set(["_rsc", "dpl"]);

test("cero peticiones con datos durante el flujo completo de un JSON", async ({
  page,
  baseURL,
}) => {
  const origen = new URL(baseURL!).origin;
  const sospechosas: string[] = [];
  let observadas = 0;

  page.on("request", (peticion) => {
    observadas++;
    const url = new URL(peticion.url());
    if (url.origin !== origen) {
      sospechosas.push(
        `fuera del origen: ${peticion.method()} ${peticion.url()}`,
      );
      return;
    }
    if (peticion.postData())
      sospechosas.push(`con cuerpo: ${peticion.method()} ${url.pathname}`);
    if (!RUTAS_PERMITIDAS.some((r) => r.test(url.pathname)))
      sospechosas.push(
        `ruta no prevista: ${peticion.method()} ${url.pathname}`,
      );
    for (const p of url.searchParams.keys())
      if (!PARAMETROS_PERMITIDOS.has(p))
        sospechosas.push(`parámetro no previsto: ${p} en ${url.pathname}`);
    for (const nombre of CENTINELAS_DEL_JSON)
      if (peticion.url().includes(nombre))
        sospechosas.push(`nombre de campo en la URL: ${peticion.url()}`);
  });
  page.on("websocket", (ws) => sospechosas.push(`websocket: ${ws.url()}`));

  await soltar(page, FIXTURE_ANIDADO_JSON);
  await transformarYGuardar(page);

  expect(observadas).toBeGreaterThan(5);
  expect(sospechosas).toEqual([]);
});
