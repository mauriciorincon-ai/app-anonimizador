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
 * Deja la cabecera de la primera tarjeta a la fracción pedida de la ALTURA DE LA PANTALLA.
 *
 * Que la referencia sea la pantalla y no la tarjeta es justo lo que se corrigió: un tercio de
 * una tarjeta cerrada son 28 px, y con esa medida el despliegue ocurría asomando por el borde
 * inferior, fuera de la vista.
 *
 * Va en dos tiempos a propósito: la tarjeta llega a la pantalla desplazada 18 px por su
 * coreografía de entrada, así que medir su sitio antes de que se asiente da un número falso
 * —y el error se paga entero al posicionar—. Primero se la hace asomar para que entre, se
 * espera a que termine, y solo entonces se mide y se coloca.
 */
async function colocar(page: import("@playwright/test").Page, alto: number) {
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
    window.scrollTo(0, caja.top + window.scrollY - window.innerHeight * f);
  }, alto);
  await page.waitForTimeout(500);
}

test("no se despliega hasta que le queda un tercio de pantalla por debajo", async ({
  page,
}) => {
  // El defecto que esta prueba impide es el que trajo la tercera ronda del gate: «cuando llegan
  // a la pantalla que estoy viendo ya están desplegadas». Pasaba porque el tercio se medía
  // sobre la tarjeta CERRADA —83 px de cabecera, un tercio son 28— así que se abría asomando
  // por el borde inferior y crecía donde nadie la veía.
  await page.goto("/conoce");
  const primera = page.locator(".tarjeta").first();

  // Asomando por el borde inferior. Antes esto ya la abría.
  await colocar(page, 0.95);
  await expect(
    primera,
    "se desplegó asomando por el borde inferior",
  ).not.toHaveAttribute("data-abierta", "");

  // Bien dentro de la pantalla, pero todavía sin el tercio por debajo: sigue cerrada.
  await colocar(page, 0.8);
  await expect(
    primera,
    "se desplegó sin espacio debajo para verse crecer",
  ).not.toHaveAttribute("data-abierta", "");

  // Y al cruzar la línea de los dos tercios, con un tercio de pantalla por debajo, se despliega.
  await colocar(page, 0.6);
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

  // Al 80 % de la pantalla: dentro, pero todavía sin el tercio por debajo, y con la entrada ya
  // asentada — sus 18 px de movimiento se contarían si no como causados por el despliegue. Lo
  // dijo esta prueba en rojo.
  await colocar(page, 0.8);
  await expect(page.locator(".tarjeta").first()).not.toHaveAttribute(
    "data-abierta",
    "",
  );
  const antes = (await boton.boundingBox())?.y ?? 0;

  // Un cuarto de pantalla: la deja al 55 %, cruzada la línea de los dos tercios.
  const empujon = Math.round((page.viewportSize()?.height ?? 800) * 0.25);
  await page.evaluate((p) => window.scrollBy(0, p), empujon);
  await expect(boton).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(800);
  const despues = (await boton.boundingBox())?.y ?? 0;

  expect(
    Math.abs(antes - despues - empujon),
    "la cabecera se movió por encima del empujón del scroll",
  ).toBeLessThan(3);
});

test("subir no mueve ni un renglón de lo que se está leyendo", async ({
  page,
}) => {
  // ESTE es el defecto que trajo el gate visual: bajando iba bien, subiendo «pegaba saltos».
  //
  // La causa: al subir se cerraban tarjetas que ya habían pasado por encima del borde superior.
  // Quitarle alto a algo que está ARRIBA de la línea de lectura sube de golpe todo lo que hay
  // debajo — o sea, todo lo que se está mirando. Ahora esas se cierran de golpe y se compensa
  // el scroll con el alto exacto que pierden.
  //
  // Se mide lo que se VE, nunca `scrollY`: el navegador ajusta `scrollY` a propósito para dejar
  // el contenido quieto, así que penalizar ese ajuste sería castigar al mecanismo que salva la
  // lectura. La referencia es la cabecera de una tarjeta visible, que no se anima sola.
  await page.goto("/conoce");
  await recorrer(page, "abajo");

  const paso = Math.round((page.viewportSize()?.height ?? 800) / 3);

  for (let vuelta = 0; vuelta < 60; vuelta++) {
    const arriba = await page.evaluate(() => window.scrollY);
    // Cerca del tope el scroll se topa y el empujón deja de ser el pedido: ahí ya no se mide.
    if (arriba <= paso * 2) break;

    const antes = await page.evaluate(() => {
      const visible = Array.from(
        document.querySelectorAll(".tarjeta-cabeza"),
      ).find((c) => {
        const r = c.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      });
      (window as unknown as { __ref?: Element }).__ref = visible;
      return visible ? visible.getBoundingClientRect().top : null;
    });

    await page.evaluate((p) => window.scrollBy(0, -p), paso);
    await page.waitForTimeout(140);

    if (antes === null) continue;

    const despues = await page.evaluate(() => {
      const ref = (window as unknown as { __ref?: Element }).__ref;
      return ref ? ref.getBoundingClientRect().top : null;
    });

    // La referencia tiene que haber bajado EXACTAMENTE lo que se empujó el scroll. Cualquier
    // píxel de más es una tarjeta que encogió por encima sin compensar.
    expect(
      Math.abs((despues ?? 0) - (antes + paso)),
      `algo se movió solo al subir (empujón ${vuelta + 1})`,
    ).toBeLessThan(4);
  }
});

test("al subir, la que está en pantalla sigue desplegada y solo se recoge al pasar de largo", async ({
  page,
}) => {
  // La regla del gate, en su forma final: «mientras esté en mi pantalla debe estar desplegada la
  // que ya desplegó». Una versión anterior recogía al empezar a subir TODAS las que quedaban por
  // encima del borde superior, compensando el scroll a mano; con `scroll-behavior: smooth` esa
  // compensación se animaba mientras el encogido era instantáneo, y subir desde la tercera
  // tarjeta mandaba la página a la sección siguiente.
  //
  // Ahora ninguna tarjeta cambia de alto por encima del borde INFERIOR: se recogen al salir por
  // abajo, o sea cuando ya se pasó de largo por ellas. Esta prueba recorre la subida entera y
  // vigila las dos mitades del invariante en cada paso.
  await page.goto("/conoce");
  await recorrer(page, "abajo");

  const botones = page.locator(".tarjeta-boton");
  for (let i = 0; i < 5; i++) {
    await expect(botones.nth(i)).toHaveAttribute("aria-expanded", "true");
  }

  const paso = Math.round((page.viewportSize()?.height ?? 800) / 2);
  for (let vuelta = 0; vuelta < 120; vuelta++) {
    if ((await page.evaluate(() => window.scrollY)) <= 0) break;
    await page.evaluate((p) => window.scrollBy(0, -p), paso);
    await page.waitForTimeout(110);

    const estado = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".tarjeta")).map((t) => {
        const r = t.getBoundingClientRect();
        return {
          abierta: t.hasAttribute("data-abierta"),
          enPantalla: r.bottom > 0 && r.top < window.innerHeight,
          debajo: r.top >= window.innerHeight,
        };
      }),
    );

    estado.forEach((e, i) => {
      if (e.enPantalla) {
        expect(
          e.abierta,
          `la tarjeta ${i + 1} se cerró estando en pantalla (empujón ${vuelta + 1})`,
        ).toBe(true);
      }
      if (e.debajo) {
        expect(
          e.abierta,
          `la tarjeta ${i + 1} siguió abierta después de pasarla de largo`,
        ).toBe(false);
      }
    });
  }
});

test("la página nunca mueve el scroll por su cuenta", async ({ page }) => {
  // El invariante estructural del que cuelga todo lo demás, y la lección más cara de este gate.
  //
  // La versión anterior recogía las tarjetas que quedaban por encima del borde superior y
  // devolvía el scroll a mano con el alto exacto que perdían. Sobre el papel era exacto. En un
  // navegador de verdad no: la página lleva `scroll-behavior: smooth`, así que ese `scrollBy` se
  // ANIMABA mientras el encogido era instantáneo — y con inercia de trackpad, además, competía
  // con un desplazamiento que el navegador ya tenía en marcha. Subiendo desde la tercera
  // tarjeta, la página se iba a la sección siguiente.
  //
  // Las pruebas de arriba no lo cazaban porque miden después de dejar asentar, y ningún e2e
  // reproduce la inercia de un dedo. Esta sí lo caza, porque no mide el resultado sino la
  // causa: **el guion no puede tocar el scroll**. Si no lo toca, no hay nada que se le pueda ir.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __movidas: string[];
      __scrollBy: (x: number, y: number) => void;
    };
    w.__movidas = [];
    // El original, para que la prueba pueda conducir sin registrarse a sí misma.
    w.__scrollBy = window.scrollBy.bind(window);
    const vigilar = (nombre: string, original: unknown) =>
      function (this: unknown, ...args: unknown[]) {
        w.__movidas.push(nombre);
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      };
    window.scrollBy = vigilar("scrollBy", window.scrollBy) as typeof scrollBy;
    window.scrollTo = vigilar("scrollTo", window.scrollTo) as typeof scrollTo;
  });

  await page.goto("/conoce");

  const paso = Math.round((page.viewportSize()?.height ?? 800) / 2);
  const conducir = (signo: number) =>
    page.evaluate(
      ([p, s]) =>
        (
          window as unknown as { __scrollBy: (x: number, y: number) => void }
        ).__scrollBy(0, (p as number) * (s as number)),
      [paso, signo] as const,
    );

  for (let i = 0; i < 120; i++) {
    await conducir(1);
    await page.waitForTimeout(70);
    const fondo = await page.evaluate(
      () =>
        window.scrollY + window.innerHeight >= document.body.scrollHeight - 2,
    );
    if (fondo) break;
  }
  for (let i = 0; i < 120; i++) {
    await conducir(-1);
    await page.waitForTimeout(70);
    if ((await page.evaluate(() => window.scrollY)) <= 0) break;
  }

  expect(
    await page.evaluate(
      () => (window as unknown as { __movidas: string[] }).__movidas,
    ),
    "el brochure movió el scroll por su cuenta durante el recorrido",
  ).toEqual([]);
});

test("cada tarjeta enseña una pantalla de la app, en los dos temas", async ({
  page,
}) => {
  await page.goto("/conoce");
  const figuras = page.locator(".tarjeta .captura");
  await expect(figuras).toHaveCount(5);

  for (let i = 0; i < 5; i++) {
    const figura = figuras.nth(i);
    await expect(figura.locator(".ruta")).toHaveText(/^\/[a-z]/);

    const img = figura.locator("img");
    // Autocontenida: la imagen viaja DENTRO del archivo. El brochure se abre con doble clic sin
    // internet, y una captura pedida a un servidor sería un archivo roto encima de la mesa.
    expect(await img.getAttribute("src")).toMatch(/^data:image\/webp;base64,/);
    // Y la variante oscura, que evita el rectángulo encendido en mitad del papel oscuro.
    await expect(figura.locator('source[media*="dark"]')).toHaveCount(1);

    // Informativa, no decorativa: sin `alt` la captura es un agujero para quien no la ve.
    const alt = (await img.getAttribute("alt")) ?? "";
    expect(
      alt.length,
      `la captura ${i + 1} llegó sin texto alternativo`,
    ).toBeGreaterThan(40);

    // Las dos medidas puestas, o el navegador no reserva el hueco y la página salta al cargar.
    expect(Number(await img.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(await img.getAttribute("height"))).toBeGreaterThan(0);

    // Y que descodifique de verdad: un `data:` URI truncado da 0 y no falla en ninguna otra parte.
    expect(
      await img.evaluate((n) => (n as HTMLImageElement).naturalWidth),
      `la captura ${i + 1} no se descodificó`,
    ).toBeGreaterThan(500);
  }
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
