// El brochure vivo servido en `/conoce`.
//
// Dos de estas pruebas existen por el precedente del piloto del pipeline, donde la CI estuvo
// VERDE con un entregable rechazado:
//
//   1. **reduced-motion.** En el piloto el titular quedaba EN BLANCO bajo `prefers-reduced-motion`
//      y eso pasó doce e2e y un Lighthouse 100/100 — ningún gate miraba esa rama. Aquí la rama
//      quieta se carga de verdad y se afirma visibilidad REAL (opacidad y tamaño), no presencia
//      en el DOM.
//   2. **Lo cerrado fuera del árbol de accesibilidad.** `grid-template-rows: 0fr` con
//      `overflow: hidden` engaña al ojo, pero un lector de pantalla recita el detalle completo de
//      las cinco tarjetas «cerradas». axe NO lo ve: se comprueba contra el árbol real por CDP.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const RUTAS_DEL_MAPA = [
  "/",
  "/diagnostico",
  "/transformar",
  "/regreso",
  "/bitacora",
  "/conoce",
];

/** Los nombres accesibles del árbol real, aplanados. Es lo que oye un lector de pantalla. */
async function textoDelArbol(page: import("@playwright/test").Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
    nodes: { name?: { value?: string } }[];
  };
  await cdp.detach();
  return nodes.map((n) => n.name?.value ?? "").join(" ");
}

test("la ruta responde y trae el brochure entero", async ({ page }) => {
  const respuesta = await page.goto("/conoce");
  expect(respuesta?.status()).toBe(200);
  // El nombre accesible, no el texto: el titular va partido en palabras para poder
  // enfocarlas una a una, así que su textContent llega con los saltos de línea del formato.
  // Lo que importa es que un lector de pantalla oiga la frase entera y de una pieza.
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    "Entrega tus datos sin entregar a tu gente",
  );
  // El clímax tiene escena propia y texto VISIBLE: jamás enterrado en un acordeón.
  await expect(
    page.getByRole("heading", {
      name: /El viaje completo, de ida y de vuelta/,
    }),
  ).toBeVisible();
});

test("las tarjetas llegan cerradas y solo las abre el toque", async ({
  page,
}) => {
  await page.goto("/conoce");
  const botones = page.locator(".tarjeta-boton");
  await expect(botones).toHaveCount(5);

  // Ninguna abierta al primer frame: nadie lee lo que no pidió.
  for (let i = 0; i < 5; i++) {
    await expect(botones.nth(i)).toHaveAttribute("aria-expanded", "false");
  }

  // Y recorrer la página entera tampoco abre ninguna: la portada promete que cada tarjeta se
  // abre solo si tú quieres, y esta prueba es la que impide que esa frase se vuelva falsa.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  for (let i = 0; i < 5; i++) {
    await expect(botones.nth(i)).toHaveAttribute("aria-expanded", "false");
  }

  await botones.first().click();
  await expect(botones.first()).toHaveAttribute("aria-expanded", "true");
  await expect(botones.nth(1)).toHaveAttribute("aria-expanded", "false");
});

test("se abre con el teclado", async ({ page }) => {
  await page.goto("/conoce");
  const tercera = page.locator(".tarjeta-boton").nth(2);
  await tercera.focus();
  await page.keyboard.press("Enter");
  await expect(tercera).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("heading", { name: "Cuatro familias de técnicas" }),
  ).toBeVisible();
});

test("lo cerrado NO está en el árbol de accesibilidad", async ({ page }) => {
  await page.goto("/conoce");
  const dentroDeUnaTarjeta = "Cuatro familias de técnicas";

  expect(await textoDelArbol(page)).not.toContain(dentroDeUnaTarjeta);

  await page.locator(".tarjeta-boton").nth(2).click();
  await expect(
    page.getByRole("heading", { name: dentroDeUnaTarjeta }),
  ).toBeVisible();
  expect(await textoDelArbol(page)).toContain(dentroDeUnaTarjeta);
});

test.describe("con prefers-reduced-motion", () => {
  // Va por `contextOptions` y no como opción suelta: en esta versión de Playwright
  // `reducedMotion` solo existe ahí, y así queda puesto AL CREAR el contexto — antes de que el
  // script de la página lea su `matchMedia`, que es el único momento en que sirve.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("la experiencia alterna está COMPLETA y es visible de verdad", async ({
    page,
  }) => {
    await page.goto("/conoce");

    // El titular, que es el candidato LCP: opaco y con tamaño, no solo presente en el DOM.
    const titular = page.getByRole("heading", { level: 1 });
    await expect(titular).toBeVisible();
    const caja = await titular.boundingBox();
    expect(caja?.height ?? 0).toBeGreaterThan(20);
    expect(await titular.evaluate((el) => getComputedStyle(el).opacity)).toBe(
      "1",
    );

    // Las cinco tarjetas y sus títulos, sin un solo frame de movimiento.
    await expect(page.locator(".tarjeta")).toHaveCount(5);
    for (const titulo of [
      "Mira lo que te delata",
      "Decide qué se le hace",
      "Vela con exactitud",
      "Mide el riesgo de verdad",
      "Entrega, recupera, deja constancia",
    ]) {
      await expect(
        page.getByText(titulo, { exact: false }).first(),
      ).toBeVisible();
    }

    // La tabla de la portada llega YA velada, con su antes→después en estático.
    await expect(page.locator(".tabla-mini .velado").first()).toHaveText(
      "CC-4f7a91b2",
    );
    await expect(page.locator(".solo-quieto")).toContainText(
      "1.035.873.389 → CC-4f7a91b2",
    );

    // El respiro: el cuadro final, con original y velado a la vista.
    await expect(page.getByText("900.123.456-8").first()).toBeVisible();
    await expect(page.getByText("900.884.201-1").first()).toBeVisible();

    // El clímax: las tres estaciones quietas, con el mensaje entero. Se busca DENTRO del
    // corte quieto — el texto de los pasos animados dice casi lo mismo y sigue en el DOM.
    const quieto = page.locator(".viaje-quieto");
    for (const estacion of [
      /En tu mesa, velado/,
      /El tercero trabaja/,
      /De vuelta, desvelado/,
    ]) {
      await expect(quieto.getByText(estacion)).toBeVisible();
    }
    // Y su versión en movimiento se retira, no se queda debajo.
    await expect(page.locator(".viaje-animado")).toBeHidden();

    // El conteo del pie, quieto desde el primer byte.
    await expect(page.locator("#conteo")).toHaveText("14");
  });
});

test("el mapa enlaza rutas que existen de verdad", async ({
  page,
  request,
}) => {
  await page.goto("/conoce");
  const enlaces = page.locator(".mapa a");
  const hrefs = await enlaces.evaluateAll((as) =>
    as.map((a) => a.getAttribute("href") ?? ""),
  );
  expect(hrefs).toEqual(RUTAS_DEL_MAPA);
  for (const href of hrefs) {
    const respuesta = await request.get(href);
    expect(respuesta.status(), `la ruta ${href} no responde`).toBe(200);
  }
});

test("el pie declara el conteo y el estado del brochure", async ({ page }) => {
  await page.goto("/conoce");
  await expect(page.locator("#conteo")).toHaveText("14");
  await expect(page.locator("footer .sr-only")).toHaveText(
    "14 funcionalidades",
  );
  await expect(page.getByText(/Brochure inicial/)).toBeVisible();
});

test("no hace una sola petición fuera de su propio origen", async ({
  page,
}) => {
  const forasteras: string[] = [];
  await page.route("**/*", (ruta) => {
    const url = new URL(ruta.request().url());
    if (url.origin !== "http://localhost:3000" && url.protocol !== "data:") {
      forasteras.push(url.href);
    }
    return ruta.continue();
  });
  await page.goto("/conoce");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  expect(forasteras).toEqual([]);
});

for (const tema of ["light", "dark"] as const) {
  test(`pasa axe en tema ${tema}, con el detalle abierto`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.goto("/conoce");
    // Con TODO abierto: es la composición con más texto y más contraste en juego.
    await page.locator(".tarjeta-boton").evaluateAll((botones) => {
      for (const b of botones) (b as HTMLButtonElement).click();
    });
    await page.locator("details.fino").evaluateAll((ds) => {
      for (const d of ds) (d as HTMLDetailsElement).open = true;
    });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
  });
}
