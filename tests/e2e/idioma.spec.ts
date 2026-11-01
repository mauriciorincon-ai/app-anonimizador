// El idioma: español e inglés, elegido a mano, por la URL o por el navegador — y sin guardar nada.
//
// Los e2e del resto del producto corren en español (`playwright.config.ts` fija `es-CO`): un idioma
// por sprint, el otro al cierre del hito. Este archivo es la excepción deliberada: lo único que
// prueba es el cambio de idioma en sí, y por eso pide el inglés a propósito.
//
// Lo que se vigila no es la redacción —eso lo lee una persona en el ensayo del hito— sino lo que la
// vuelve confiable: que el conmutador se maneje con el teclado, que el `lang` del documento siga al
// idioma, que el idioma sobreviva a navegar entre pantallas, que cambiarlo no abra ninguna
// conexión y que NO deje nada en el navegador (regla dura nº2: lo que no se pidió no se guarda).

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { COMUN } from "../../src/lib/idioma/textos/comun";

const LEMA_ES = COMUN.pie.lema.es;
const LEMA_EN = COMUN.pie.lema.en;

const boton = (page: Page, nombre: "Español" | "English") =>
  page
    .getByRole("group", { name: "Idioma · Language" })
    .getByRole("button", { name: nombre });

const lang = (page: Page) => page.evaluate(() => document.documentElement.lang);

test("arranca en español cuando el navegador está en español", async ({
  page,
}) => {
  await page.goto("/");
  await expect(boton(page, "Español")).toHaveAttribute("aria-pressed", "true");
  await expect(boton(page, "English")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(LEMA_ES)).toBeVisible();
  expect(await lang(page)).toBe("es-CO");
});

test("el conmutador cambia el idioma de la interfaz y el `lang` del documento", async ({
  page,
}) => {
  await page.goto("/");
  await boton(page, "English").click();

  await expect(boton(page, "English")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(LEMA_EN)).toBeVisible();
  await expect(page.getByText(LEMA_ES)).toHaveCount(0);
  await expect.poll(() => lang(page)).toBe("en-US");
  await expect(page).toHaveTitle(COMUN.documento.titulo.en);
  // El enlace que se copie abre igual.
  await expect(page).toHaveURL(/[?&]lang=en\b/);

  // Y se vuelve.
  await boton(page, "Español").click();
  await expect(page.getByText(LEMA_ES)).toBeVisible();
  await expect.poll(() => lang(page)).toBe("es-CO");
  await expect(page).toHaveTitle(COMUN.documento.titulo.es);
});

test("se maneja con el teclado, con Enter y con Espacio", async ({ page }) => {
  await page.goto("/");

  await boton(page, "English").focus();
  await expect(boton(page, "English")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(LEMA_EN)).toBeVisible();

  // El foco no se pierde al cambiar de idioma: el botón sigue siendo el mismo elemento.
  await boton(page, "Español").focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(LEMA_ES)).toBeVisible();
});

test("el idioma activo se distingue sin depender del color", async ({
  page,
}) => {
  await page.goto("/");
  const activo = boton(page, "Español");
  const inactivo = boton(page, "English");
  // Tres señales a la vez: `aria-pressed`, subrayado y peso de letra.
  await expect(activo).toHaveAttribute("aria-pressed", "true");
  const estilo = (b: typeof activo) =>
    b.evaluate((el) => {
      const s = getComputedStyle(el);
      return { subrayado: s.textDecorationLine, peso: Number(s.fontWeight) };
    });
  const a = await estilo(activo);
  const i = await estilo(inactivo);
  expect(a.subrayado).toBe("underline");
  expect(i.subrayado).toBe("none");
  expect(a.peso).toBeGreaterThan(i.peso);
});

test("cada botón declara su propio idioma para los lectores de pantalla", async ({
  page,
}) => {
  await page.goto("/");
  await expect(boton(page, "Español")).toHaveAttribute("lang", "es");
  await expect(boton(page, "English")).toHaveAttribute("lang", "en");
});

test("?lang=en abre en inglés aunque el navegador esté en español", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await expect(page.getByText(LEMA_EN)).toBeVisible();
  await expect(boton(page, "English")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => lang(page)).toBe("en-US");
});

test("el idioma sobrevive a navegar entre pantallas", async ({ page }) => {
  await page.goto("/");
  await boton(page, "English").click();
  await expect(page.getByText(LEMA_EN)).toBeVisible();

  // Navegación del lado del cliente (un enlace, no una recarga): el módulo del idioma sigue vivo.
  await page.locator('a[href="/regreso"]').first().click();
  await page.waitForURL("**/regreso**");
  await expect(page.getByText(LEMA_EN)).toBeVisible();
  await expect(boton(page, "English")).toHaveAttribute("aria-pressed", "true");
  expect(await lang(page)).toBe("en-US");
});

test("cambiar de idioma no abre ninguna conexión", async ({ page }) => {
  await page.goto("/");
  const peticiones: string[] = [];
  page.on("request", (r) => peticiones.push(r.url()));
  await boton(page, "English").click();
  await expect(page.getByText(LEMA_EN)).toBeVisible();
  await boton(page, "Español").click();
  await expect(page.getByText(LEMA_ES)).toBeVisible();
  expect(peticiones).toEqual([]);
});

test("no deja nada guardado en el navegador", async ({ page }) => {
  await page.goto("/");
  await boton(page, "English").click();
  await expect(page.getByText(LEMA_EN)).toBeVisible();

  const guardado = await page.evaluate(async () => ({
    local: localStorage.length,
    sesion: sessionStorage.length,
    cookies: document.cookie,
    bases: ("databases" in indexedDB ? await indexedDB.databases() : []).length,
  }));
  expect(guardado).toEqual({ local: 0, sesion: 0, cookies: "", bases: 0 });

  // Recargar sin el parámetro vuelve al idioma del navegador: nada lo recordó.
  await page.goto("/");
  await expect(page.getByText(LEMA_ES)).toBeVisible();
});

test.describe("con el navegador en inglés", () => {
  test.use({ locale: "en-US" });

  test("abre en inglés sin que nadie lo pida", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(LEMA_EN)).toBeVisible();
    await expect(boton(page, "English")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(() => lang(page)).toBe("en-US");
  });

  test("y ?lang=es lo pasa a español", async ({ page }) => {
    await page.goto("/?lang=es");
    await expect(page.getByText(LEMA_ES)).toBeVisible();
    await expect.poll(() => lang(page)).toBe("es-CO");
  });
});

for (const tema of ["light", "dark"] as const) {
  test(`la aduana en inglés pasa axe en tema ${tema}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.goto("/?lang=en");
    await expect(page.getByText(LEMA_EN)).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
  });
}
