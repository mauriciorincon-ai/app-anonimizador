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

/** Baja en pasos cortos, como una rueda de ratón — no de un salto, que no dispara nada. */
async function recorrer(
  page: import("@playwright/test").Page,
  direccion: "abajo" | "arriba",
) {
  const alto = page.viewportSize()?.height ?? 800;
  const paso = Math.round(alto / 2);
  // El tope es generoso a propósito: con las cinco tarjetas abiertas la página mide varias
  // decenas de miles de píxeles en móvil, y el bucle sale solo al tocar fondo.
  for (let i = 0; i < 200; i++) {
    const fin = await page.evaluate(
      ([d, p]) => {
        window.scrollBy(0, d === "abajo" ? (p as number) : -(p as number));
        return d === "abajo"
          ? window.scrollY + window.innerHeight >=
              document.body.scrollHeight - 2
          : window.scrollY <= 0;
      },
      [direccion, paso] as const,
    );
    await page.waitForTimeout(70);
    if (fin) break;
  }
  await page.waitForTimeout(300);
}

test("llegan cerradas, se despliegan al bajar y se recogen al subir", async ({
  page,
}) => {
  await page.goto("/conoce");
  const botones = page.locator(".tarjeta-boton");
  await expect(botones).toHaveCount(5);

  // Al primer frame, ninguna abierta: nadie lee lo que no pidió.
  for (let i = 0; i < 5; i++) {
    await expect(botones.nth(i)).toHaveAttribute("aria-expanded", "false");
  }

  // Bajando, el recorrido las va abriendo — las cinco, en su turno.
  await recorrer(page, "abajo");
  for (let i = 0; i < 5; i++) {
    await expect(
      botones.nth(i),
      `la tarjeta ${i + 1} no se desplegó al bajar`,
    ).toHaveAttribute("aria-expanded", "true");
  }

  // Y subiendo se recogen: volver al principio encuentra la página como estaba.
  await recorrer(page, "arriba");
  for (let i = 0; i < 5; i++) {
    await expect(
      botones.nth(i),
      `la tarjeta ${i + 1} siguió abierta al subir`,
    ).toHaveAttribute("aria-expanded", "false");
  }
});

/**
 * Deja la primera tarjeta asomando exactamente la fracción pedida por el borde inferior.
 *
 * Va en dos tiempos a propósito: la tarjeta llega a la pantalla desplazada 18 px por su
 * coreografía de entrada, así que medir su sitio antes de que se asiente da un número falso
 * —y el error se paga entero al posicionar—. Primero se la hace asomar para que entre, se
 * espera a que termine, y solo entonces se mide y se coloca.
 */
async function asomar(page: import("@playwright/test").Page, fraccion: number) {
  await page.evaluate(() => {
    const t = document.querySelector(".tarjeta") as HTMLElement;
    const arriba = t.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, arriba - window.innerHeight + 4);
  });
  await expect(page.locator(".tarjeta").first()).toHaveClass(/visto/);
  await page.waitForTimeout(900);
  await page.evaluate((f) => {
    const t = document.querySelector(".tarjeta") as HTMLElement;
    const caja = t.getBoundingClientRect();
    window.scrollTo(
      0,
      caja.top + window.scrollY - window.innerHeight + caja.height * f,
    );
  }, fraccion);
  await page.waitForTimeout(400);
}

test("no se despliega ninguna antes de que se vea un tercio de ella", async ({
  page,
}) => {
  await page.goto("/conoce");
  const primera = page.locator(".tarjeta").first();

  // Asomando apenas por el borde inferior: mucho menos de un tercio.
  await asomar(page, 0.12);
  await expect(primera).not.toHaveAttribute("data-abierta", "");

  // Un empujón más y ya se ve de sobra el tercio: ahí sí.
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.waitForTimeout(400);
  await expect(primera).toHaveAttribute("data-abierta", "");
});

test("el toque manda: lo que la persona cierra no se vuelve a abrir solo", async ({
  page,
}) => {
  await page.goto("/conoce");
  const primera = page.locator(".tarjeta").first();
  const boton = primera.locator(".tarjeta-boton");

  await boton.click();
  await expect(boton).toHaveAttribute("aria-expanded", "true");
  await boton.click();
  await expect(boton).toHaveAttribute("aria-expanded", "false");

  // Recorrer entera la página no la contradice.
  await recorrer(page, "abajo");
  await expect(boton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".tarjeta-boton").nth(1)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("una tarjeta que se despliega no mueve su propia cabecera", async ({
  page,
}) => {
  // El defecto que esta prueba impide: la tarjeta crece HACIA ARRIBA, empuja el texto que el
  // lector tiene bajo los ojos y le hace perder el renglón. En el piloto del pipeline el
  // salto llegó a 1.291 px. Aquí se abre una por una, sin tocar el scroll: cualquier
  // movimiento de la cabecera es puro desplazamiento de maquetación.
  await page.goto("/conoce");
  const botones = page.locator(".tarjeta-boton");
  const tarjetas = page.locator(".tarjeta");

  for (let i = 0; i < 5; i++) {
    const boton = botones.nth(i);
    await boton.scrollIntoViewIfNeeded();
    // La tarjeta pudo entrar con su coreografía (18 px de `alzar`) y el recorrido pudo
    // abrirla ya. Las dos cosas tienen que haber terminado antes de medir, o lo que se
    // estaría midiendo es la entrada y no el despliegue.
    await expect(tarjetas.nth(i)).toHaveClass(/visto/);
    await page.waitForTimeout(900);

    // Se mide el TOGGLE en los dos sentidos: ni abrir ni cerrar puede mover la cabecera.
    for (const paso of ["primer clic", "segundo clic"]) {
      const estaba = await boton.getAttribute("aria-expanded");
      const antes = (await boton.boundingBox())?.y ?? 0;
      await boton.click();
      await expect(boton).toHaveAttribute(
        "aria-expanded",
        estaba === "true" ? "false" : "true",
      );
      await page.waitForTimeout(800); // la transición entera
      const despues = (await boton.boundingBox())?.y ?? 0;
      expect(
        Math.abs(despues - antes),
        `la cabecera de la tarjeta ${i + 1} se movió en el ${paso}`,
      ).toBeLessThan(2);
    }
  }
});

test("la que se despliega SOLA tampoco se mueve de su sitio", async ({
  page,
}) => {
  // El mismo invariante por el camino nuevo: el que abre el recorrido, no el dedo. Se deja la
  // primera tarjeta justo por debajo del umbral, se empuja el scroll un tanto conocido, y la
  // cabecera tiene que haber subido EXACTAMENTE ese tanto — ni un píxel más.
  await page.goto("/conoce");
  const boton = page.locator(".tarjeta-boton").first();

  // Un 22 %: bastante por debajo del tercio, y con la entrada ya asentada — sus 18 px de
  // movimiento se contarían si no como causados por el despliegue. Lo dijo esta prueba en rojo.
  await asomar(page, 0.22);
  await expect(page.locator(".tarjeta").first()).not.toHaveAttribute(
    "data-abierta",
    "",
  );
  const antes = (await boton.boundingBox())?.y ?? 0;

  const empujon = 140;
  await page.evaluate((p) => window.scrollBy(0, p), empujon);
  await expect(boton).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(800);
  const despues = (await boton.boundingBox())?.y ?? 0;

  expect(
    Math.abs(antes - despues - empujon),
    "la cabecera se movió por encima del empujón del scroll",
  ).toBeLessThan(3);
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
