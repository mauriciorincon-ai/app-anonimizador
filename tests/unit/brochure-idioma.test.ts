// @vitest-environment node
//
// GATE DEL BROCHURE BILINGÜE — `docs/BROCHURE.html` en español e inglés.
//
// El brochure es un HTML autocontenido (se abre con doble clic y se sirve en /conoce) y no usa la
// capa de idioma de la app: el español VIVE EN EL MARCADO —se lee igual sin JavaScript— y el
// inglés vive en un diccionario dentro de la propia página (`<script id="velo-en">`). Cada
// elemento traducible lleva `data-t="clave"`; para atributos, `data-t-aria|alt|title|content`; y
// `data-t-sr` para el texto oculto del conteo del pie.
//
// Este test es lo que impide que esa mitad se pudra en silencio: un texto nuevo sin `data-t`, una
// clave sin su inglés, un inglés con otra estructura que el español, o un inglés que prometa más
// que el español. Y prueba, ejecutando el script de la página en jsdom, que elegir el idioma
// funciona, vuelve exacto y NO guarda nada.
//
// OJO con copy.test.ts: su filtro `/\.(tsx?|md)$/` deja FUERA los `.html`, así que el barrido de
// honestidad de ese archivo no mira el brochure aunque `docs/BROCHURE.html` esté en sus raíces.
// El barrido de aquí lo cubre, en los dos idiomas.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

// `jsdom` no trae tipos en este repo (no hay @types/jsdom): se tipa lo mínimo que se usa.
type Ventana = Window & typeof globalThis;
type Dom = { window: Ventana; serialize(): string };
type OpcionesJsdom = {
  url?: string;
  runScripts?: "dangerously" | "outside-only";
  beforeParse?: (window: Ventana) => void;
};
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, opciones?: OpcionesJsdom) => Dom;
};

const RUTA = "docs/BROCHURE.html";
const HTML = readFileSync(RUTA, "utf8");
const EXPORT = JSON.parse(
  readFileSync("docs/brochure-export.json", "utf8"),
) as {
  funcionalidades: { total: number };
};

const TAGLINE_ES = "Velo para entregar. Desvelo para recuperar.";
const TAGLINE_EN = "Veil it to hand it over. Unveil it to get it back.";
const TITULO_ES = "Velo — Conócelo";

/** El documento tal cual está escrito: sin ejecutar sus scripts. */
const estatico = new JSDOM(HTML).window.document;
const EN = JSON.parse(
  estatico.getElementById("velo-en")?.textContent ?? "null",
) as Record<string, string>;

// ── Lo que se enlaza con `data-t*` ────────────────────────────────────────────────────────────

const ATRIBUTOS_DE_CLAVE = [
  "data-t",
  "data-t-aria",
  "data-t-alt",
  "data-t-title",
  "data-t-content",
  "data-t-sr",
] as const;

function clavesDelHtml(doc: Document): Map<string, Element[]> {
  const mapa = new Map<string, Element[]>();
  for (const atributo of ATRIBUTOS_DE_CLAVE) {
    for (const el of Array.from(doc.querySelectorAll(`[${atributo}]`))) {
      const clave = el.getAttribute(atributo) ?? "";
      mapa.set(clave, [...(mapa.get(clave) ?? []), el]);
    }
  }
  return mapa;
}

describe("el diccionario inglés y el marcado hablan de las mismas claves", () => {
  it("el diccionario existe y es un objeto de textos", () => {
    expect(EN).toBeTypeOf("object");
    expect(Object.keys(EN).length).toBeGreaterThan(100);
  });

  it("toda clave data-t* del HTML existe en EN", () => {
    const claves = clavesDelHtml(estatico);
    const faltan = Array.from(claves.keys()).filter((k) => !(k in EN));
    expect(faltan).toEqual([]);
  });

  it("toda clave de EN se usa en el HTML (sin inglés huérfano)", () => {
    const usadas = new Set(clavesDelHtml(estatico).keys());
    const sobran = Object.keys(EN).filter((k) => !usadas.has(k));
    expect(sobran).toEqual([]);
  });

  it("ningún valor está vacío ni deja de ser texto", () => {
    const malos = Object.entries(EN)
      .filter(([, v]) => typeof v !== "string" || v.trim() === "")
      .map(([k]) => k);
    expect(malos).toEqual([]);
  });

  it("los atributos llevan texto llano: ni una etiqueta dentro de un aria-label o un alt", () => {
    const deAtributo = new Set<string>();
    for (const a of ATRIBUTOS_DE_CLAVE.filter((x) => x !== "data-t")) {
      for (const el of Array.from(estatico.querySelectorAll(`[${a}]`))) {
        deAtributo.add(el.getAttribute(a) ?? "");
      }
    }
    expect(deAtributo.size).toBeGreaterThan(10);
    const conEtiquetas = Array.from(deAtributo).filter((k) =>
      /<[^>]+>/.test(EN[k] ?? ""),
    );
    expect(conEtiquetas).toEqual([]);
  });

  it("el inglés no es el español con otra clave: ninguna entrada con letras es idéntica", () => {
    const iguales: string[] = [];
    for (const [clave, els] of clavesDelHtml(estatico)) {
      const el = els[0]!;
      const es = esDeLaClave(el, clave);
      if (/\p{L}{3,}/u.test(es) && es.trim() === EN[clave]?.trim())
        iguales.push(clave);
    }
    expect(iguales).toEqual([]);
  });
});

/** El español que la clave tiene en el marcado (innerHTML o el atributo que traduce). */
function esDeLaClave(el: Element, clave: string): string {
  if (el.getAttribute("data-t") === clave) return el.innerHTML;
  if (el.getAttribute("data-t-aria") === clave)
    return el.getAttribute("aria-label") ?? "";
  if (el.getAttribute("data-t-alt") === clave) {
    return el.querySelector("img")?.getAttribute("alt") ?? "";
  }
  if (el.getAttribute("data-t-title") === clave)
    return el.getAttribute("title") ?? "";
  if (el.getAttribute("data-t-content") === clave)
    return el.getAttribute("content") ?? "";
  if (el.getAttribute("data-t-sr") === clave) {
    return (
      Array.from(el.children).find((c) => c.classList.contains("sr-only"))
        ?.textContent ?? ""
    );
  }
  throw new Error(`la clave ${clave} no está en ${el.tagName}`);
}

// ── Misma estructura en los dos idiomas ───────────────────────────────────────────────────────

/** La secuencia de etiquetas en línea de un fragmento: nombre y atributos, en orden de documento. */
function firma(
  doc: Document,
  fragmento: string,
  ignorarEstilo = false,
): string[] {
  const caja = doc.createElement("div");
  caja.innerHTML = fragmento;
  return Array.from(caja.querySelectorAll("*")).map((e) => {
    const atributos = Array.from(e.attributes)
      .filter((a) => !(ignorarEstilo && a.name === "style"))
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    return `${e.tagName.toLowerCase()}[${atributos.join(",")}]`;
  });
}

/** Las cifras de un texto, sin separadores de miles ni decimales: `600.000` y `600,000` son la misma. */
function cifras(texto: string): string[] {
  return (texto.replace(/<[^>]+>/g, " ").match(/\d[\d.,]*\d|\d/g) ?? [])
    .map((c) => c.replace(/[.,]/g, ""))
    .sort();
}

describe("el inglés conserva la estructura y las cifras del español", () => {
  const conHtml = Array.from(clavesDelHtml(estatico)).filter(([clave, els]) =>
    els.some((el) => el.getAttribute("data-t") === clave),
  );

  it("hay un buen número de textos con etiquetas en línea que comparar", () => {
    const conEtiquetas = conHtml.filter(
      ([clave, els]) => firma(estatico, els[0]!.innerHTML).length > 0 && clave,
    );
    expect(conHtml.length).toBeGreaterThan(100);
    expect(conEtiquetas.length).toBeGreaterThan(30);
  });

  it("cada clave tiene la MISMA secuencia de etiquetas en inglés que en español", () => {
    const distintas: string[] = [];
    for (const [clave, els] of conHtml) {
      if (clave === "portada.titulo") continue; // el titular se prueba aparte: una palabra, un <span>
      const es = firma(estatico, els[0]!.innerHTML);
      const en = firma(estatico, EN[clave] ?? "");
      if (JSON.stringify(es) !== JSON.stringify(en)) distintas.push(clave);
    }
    expect(distintas).toEqual([]);
  });

  it("el titular lleva una palabra por <span> en los dos idiomas, y su aria-label es la frase entera", () => {
    const h1 = estatico.querySelector("h1")!;
    const palabras = (fragmento: string) =>
      Array.from(
        (() => {
          const caja = estatico.createElement("div");
          caja.innerHTML = fragmento;
          return caja.children;
        })(),
      );
    for (const [fragmento, etiqueta] of [
      [h1.innerHTML, h1.getAttribute("aria-label")],
      [EN["portada.titulo"]!, EN["portada.titulo.aria"]],
    ] as const) {
      const spans = palabras(fragmento);
      expect(spans.length).toBeGreaterThan(3);
      for (const s of spans) {
        expect(s.tagName).toBe("SPAN");
        expect(s.getAttribute("aria-hidden")).toBe("true");
        expect(s.getAttribute("style")).toMatch(/^--r: [\d.]+s$/);
      }
      expect(spans.map((s) => s.textContent).join(" ")).toBe(etiqueta);
    }
  });

  it("las cifras (600.000 / 600,000, 150 MB, 87 %…) son las mismas en los dos idiomas", () => {
    const distintas: string[] = [];
    for (const [clave, els] of Array.from(clavesDelHtml(estatico))) {
      const es = esDeLaClave(els[0]!, clave);
      // El titular y el conteo del pie se cuentan aparte; «catorce» / «fourteen» no son cifras.
      if (
        JSON.stringify(cifras(es)) !== JSON.stringify(cifras(EN[clave] ?? ""))
      ) {
        distintas.push(`${clave}: ${cifras(es)} ≠ ${cifras(EN[clave] ?? "")}`);
      }
    }
    expect(distintas).toEqual([]);
  });

  it("el conteo del pie en inglés es el del export, igual que en español", () => {
    expect(EN["pie.cuenta"]).toBe(`${EXPORT.funcionalidades.total} features`);
    expect(estatico.getElementById("conteo")?.textContent).toBe(
      String(EXPORT.funcionalidades.total),
    );
  });
});

// ── Todo texto visible está cubierto ──────────────────────────────────────────────────────────

/** Lo que NO se traduce, y por qué. Una excepción que ya no hace falta falla: la lista no crece sola. */
const LITERALES: Record<string, string> = {
  "María F. Ospina":
    "nombre de persona INVENTADO para el ejemplo (dato sintético, regla dura 5)",
  "Andrés C. Roa":
    "nombre de persona INVENTADO para el ejemplo (dato sintético, regla dura 5)",
  "Luz M. Cadena":
    "nombre de persona INVENTADO para el ejemplo (dato sintético, regla dura 5)",
  "CC-4f7a91b2":
    "seudónimo de ejemplo: el valor tal como lo escribe Velo, no prosa",
  "CC-91e0d347":
    "seudónimo de ejemplo: el valor tal como lo escribe Velo, no prosa",
  "CC-2b6af508":
    "seudónimo de ejemplo: el valor tal como lo escribe Velo, no prosa",
  "/diagnostico":
    "ruta real de la app, que se escribe igual en los dos idiomas",
  "/regreso": "ruta real de la app, que se escribe igual en los dos idiomas",
};

/** Atributos con letras que tampoco se traducen. */
const ATRIBUTOS_LITERALES: Record<string, string> = {
  "Idioma · Language":
    "el grupo del conmutador es bilingüe a propósito: quien llegó en el otro idioma debe reconocerlo",
  Español:
    'nombre propio del idioma, en su propio idioma; el botón lleva `lang="es"`',
  English:
    'nombre propio del idioma, en su propio idioma; el botón lleva `lang="en"`',
};

const ATRIBUTOS_QUE_SE_LEEN: readonly [string, string][] = [
  ["aria-label", "data-t-aria"],
  ["alt", "data-t-alt"],
  ["title", "data-t-title"],
];

const normalizar = (t: string) => t.replace(/\s+/g, " ").trim();
const letras = (t: string) => (t.match(/\p{L}/gu) ?? []).length;

/**
 * Texto con 3 letras o más que no cuelga de un elemento con `data-t` (ni es un literal declarado),
 * y atributos que se leen sin su `data-t-*`. Devuelve lo que encuentra, ya descrito.
 */
function sinCubrir(doc: Document, usados: Set<string> = new Set()): string[] {
  const encontrados: string[] = [];
  const caminante = doc.createTreeWalker(
    doc.body,
    4 /* NodeFilter.SHOW_TEXT */,
  );
  for (let nodo = caminante.nextNode(); nodo; nodo = caminante.nextNode()) {
    const padre = nodo.parentElement;
    if (!padre || padre.closest("script, style, template")) continue;
    const texto = normalizar(nodo.textContent ?? "");
    if (letras(texto) < 3) continue;
    if (padre.closest("[data-t]")) continue;
    const dueno = padre.closest("[data-t-sr]");
    if (dueno && padre.closest(".sr-only")) continue;
    if (texto in LITERALES) {
      usados.add(texto);
      continue;
    }
    encontrados.push(`texto «${texto}» en <${padre.tagName.toLowerCase()}>`);
  }
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    for (const [atributo, clave] of ATRIBUTOS_QUE_SE_LEEN) {
      const valor = normalizar(el.getAttribute(atributo) ?? "");
      if (letras(valor) < 3) continue;
      // El `alt` de las capturas va en el <picture>: el script de capturas reescribe el <img>.
      const cubierto =
        atributo === "alt"
          ? el.parentElement?.hasAttribute(clave)
          : el.hasAttribute(clave);
      if (cubierto) continue;
      if (valor in ATRIBUTOS_LITERALES) {
        usados.add(valor);
        continue;
      }
      encontrados.push(
        `${atributo} «${valor}» en <${el.tagName.toLowerCase()}>`,
      );
    }
  }
  const titulo = doc.querySelector("title");
  if (titulo && !titulo.hasAttribute("data-t"))
    encontrados.push("<title> sin data-t");
  const descripcion = doc.querySelector('meta[name="description"]');
  if (!descripcion) encontrados.push('falta <meta name="description">');
  else if (!descripcion.hasAttribute("data-t-content")) {
    encontrados.push("<meta description> sin data-t-content");
  }
  return encontrados;
}

describe("no queda texto visible sin su inglés", () => {
  it("todo texto de 3 letras o más cuelga de un data-t, salvo los literales declarados", () => {
    const usados = new Set<string>();
    expect(sinCubrir(estatico, usados)).toEqual([]);
    // Y la lista de excepciones se gasta toda: una que ya no aparece en la página sobra.
    const sobran = [
      ...Object.keys(LITERALES),
      ...Object.keys(ATRIBUTOS_LITERALES),
    ].filter((l) => !usados.has(l));
    expect(sobran).toEqual([]);
  });

  it("el gate VE una falta: un párrafo, un atributo y un título nuevos sin traducir caen", () => {
    // Se parte del brochure real y se le mete lo que un descuido metería.
    const doc = new JSDOM(HTML).window.document;
    doc
      .querySelector("main")!
      .insertAdjacentHTML(
        "beforeend",
        '<p>Un párrafo nuevo que nadie tradujo</p><button aria-label="Cerrar la ventana">x</button>',
      );
    doc.querySelector("title")!.removeAttribute("data-t");
    const faltas = sinCubrir(doc);
    expect(faltas).toContain(
      "texto «Un párrafo nuevo que nadie tradujo» en <p>",
    );
    expect(faltas).toContain("aria-label «Cerrar la ventana» en <button>");
    expect(faltas).toContain("<title> sin data-t");
  });

  it("y un documento sin falta no da falsos positivos", () => {
    const doc = new JSDOM(
      '<!doctype html><title data-t="t">T</title><meta name="description" content="x" data-t-content="d"><body><p data-t="a">Hola <b>mundo</b> entero</p><p>ES</p><span aria-hidden="true">★</span></body>',
    ).window.document;
    expect(sinCubrir(doc)).toEqual([]);
  });

  it("el alt vive en el <picture>, FUERA de los marcadores del script de capturas", () => {
    // scripts/capturas-brochure.mjs reescribe todo lo que hay entre `<!-- captura:x -->` y
    // `<!-- /captura:x -->` (el <source> y el <img> con su alt en español): un data-t-alt puesto en
    // el <img> se perdería la primera vez que alguien regenerara las capturas.
    const dentro =
      HTML.match(/<!-- captura:(\w+) -->[\s\S]*?<!-- \/captura:\1 -->/g) ?? [];
    expect(dentro).toHaveLength(5);
    for (const region of dentro) expect(region).not.toMatch(/data-t/);
    expect(estatico.querySelectorAll("picture[data-t-alt]")).toHaveLength(5);
  });
});

// ── La tagline, el título y la descripción, en los dos idiomas ────────────────────────────────

describe("la tagline y el título existen en español y en inglés", () => {
  it("la tagline", () => {
    expect(
      normalizar(
        estatico.querySelector('[data-t="portada.lema"]')?.textContent ?? "",
      ),
    ).toBe(TAGLINE_ES);
    expect(EN["portada.lema"]).toBe(TAGLINE_EN);
  });

  it("el título de la pestaña", () => {
    expect(estatico.title).toBe(TITULO_ES);
    expect(EN["doc.titulo"]).toBeTruthy();
    expect(EN["doc.titulo"]).not.toBe(TITULO_ES);
  });

  it("la descripción de la página", () => {
    const meta = estatico.querySelector('meta[name="description"]');
    expect(meta?.getAttribute("content")?.length).toBeGreaterThan(40);
    expect(EN["doc.descripcion"]!.length).toBeGreaterThan(40);
  });
});

// ── Honestidad medida, en los dos idiomas ─────────────────────────────────────────────────────
// La regla dura nº4. Los mismos patrones que copy.test.ts (que no mira .html), aplicados al español
// del marcado y a TODO el inglés del diccionario.

const PROHIBIDAS: readonly { patron: RegExp; porque: string }[] = [
  {
    patron: /anonimato\s+garantizad/i,
    porque: "ningún método garantiza el anonimato",
  },
  {
    patron: /garantiza\w*\s+(el\s+)?anonimato/i,
    porque: "ningún método garantiza el anonimato",
  },
  { patron: /100\s*%?\s*segur/i, porque: "no existe el 100 % seguro" },
  { patron: /imposible\s+de\s+reidentificar/i, porque: "nunca imposible" },
  {
    patron: /(totalmente|completamente|100\s*%)\s+an[oó]nim/i,
    porque: "anonimato absoluto",
  },
  {
    patron: /riesgo\s+cero/i,
    porque: "ninguna técnica lleva el riesgo a cero",
  },
  { patron: /guaranteed\s+anonymi/i, porque: "no method guarantees anonymity" },
  {
    patron: /anonymity\s+(is\s+|are\s+)?guarantee/i,
    porque: "no method guarantees anonymity",
  },
  {
    patron: /guarantee[sd]?\s+(the\s+|your\s+|full\s+|total\s+)?anonymi/i,
    porque: "no method guarantees anonymity",
  },
  { patron: /100\s*%?\s*(safe|secure)/i, porque: "no such thing as 100% safe" },
  {
    patron: /impossible\s+to\s+(re-?identify|de-?anonymi[sz]e)/i,
    porque: "never impossible",
  },
  {
    patron: /(totally|completely|fully|100\s*%)\s+anonymous/i,
    porque: "absolute anonymity",
  },
  {
    patron: /\bzero[-\s]+(re-?identification[-\s]+)?risk\b|\brisk[-\s]+free\b/i,
    porque: "no technique takes risk to zero",
  },
];

describe("el brochure no promete lo que Velo no puede cumplir, en ninguno de los dos idiomas", () => {
  const textoEs =
    normalizar(estatico.body.textContent ?? "") + " " + (estatico.title ?? "");
  const textoEn = Object.values(EN).join("\n");

  for (const { patron, porque } of PROHIBIDAS) {
    it(`no dice ${patron.source} — ${porque}`, () => {
      expect(patron.test(textoEs), "el español del marcado").toBe(false);
      expect(patron.test(textoEn), "el inglés del diccionario").toBe(false);
    });
  }

  it("los patrones ven lo que deben ver (en el brochure, y no en lo permitido)", () => {
    const cae = (f: string) => PROHIBIDAS.some(({ patron }) => patron.test(f));
    for (const f of [
      "anonimato garantizado",
      "es 100 % seguro",
      "guaranteed anonymity",
      "it is 100% safe",
      "impossible to re-identify",
      "completely anonymous",
      "zero risk",
    ]) {
      expect(cae(f), f).toBe(true);
    }
    for (const f of [
      "no declara anónimo ningún archivo",
      "does not declare any file anonymous",
      "reduce the risk and measure it",
      "the risk of the most exposed record",
    ]) {
      expect(cae(f), f).toBe(false);
    }
  });

  it("lo estimado va SIEMPRE etiquetado: «estimado» en español, «estimated» en inglés", () => {
    // Las dos caras de la tarjeta 4 hablan del riesgo de la población, y las dos lo marcan.
    for (const clave of ["tarjeta4.f2.como", "tarjeta4.captura.pie"]) {
      const es =
        estatico.querySelector(`[data-t="${clave}"]`)?.textContent ?? "";
      expect(es, `${clave} en español`).toMatch(/estimado/);
      expect(EN[clave], `${clave} en inglés`).toMatch(/estimated/);
    }
  });

  it("las salvedades del español están en el inglés: «no lo elimina» / «does not remove it»", () => {
    expect(EN["fino1.intro"]).toMatch(/does not remove it/);
    expect(EN["fino1.intro"]).toMatch(/does not declare any file anonymous/);
    expect(EN["fino1.li1"]).toMatch(/can be attacked/);
    expect(EN["tarjeta5.f2.tip"]).toMatch(/not a digital signature/);
  });
});

// ── El script de la página: ejecutado de verdad, en jsdom ───────────────────────────────────────

type Opciones = { url?: string; idiomas?: string[] };

async function abrir({
  url = "http://localhost/conoce",
  idiomas = ["es-CO"],
}: Opciones = {}) {
  const dom = new JSDOM(HTML, {
    url,
    runScripts: "dangerously",
    beforeParse(window) {
      // jsdom dice `en-US`: cada prueba declara el idioma de SU navegador.
      Object.defineProperty(window.navigator, "languages", {
        value: idiomas,
        configurable: true,
      });
      Object.defineProperty(window.navigator, "language", {
        value: idiomas[0],
        configurable: true,
      });
    },
  });
  const { window } = dom;
  if (window.document.readyState !== "complete") {
    await new Promise<void>((alCargar) =>
      window.addEventListener("load", () => alCargar()),
    );
  }
  return { dom, window, doc: window.document };
}

const h1 = (doc: Document) =>
  doc.querySelector("h1")!.getAttribute("aria-label");
const pulsado = (doc: Document, idioma: string) =>
  doc
    .querySelector(`.idioma button[lang="${idioma}"]`)!
    .getAttribute("aria-pressed");

describe("el idioma se elige solo con ?lang= y con el navegador, y nada se guarda", () => {
  it("abre en español por defecto y el conmutador marca ES", async () => {
    const { window, doc } = await abrir();
    expect(h1(doc)).toBe("Entrega tus datos sin entregar a tu gente");
    expect(doc.documentElement.lang).toBe("es-CO");
    expect(doc.title).toBe(TITULO_ES);
    expect(pulsado(doc, "es")).toBe("true");
    expect(pulsado(doc, "en")).toBe("false");
    expect(doc.querySelector<HTMLElement>(".idioma")!.hidden).toBe(false);
    window.close();
  });

  it("?lang=en abre en inglés: titular, html[lang], título, atributos y conmutador", async () => {
    const { window, doc } = await abrir({
      url: "http://localhost/conoce?lang=en",
    });
    expect(h1(doc)).toBe(EN["portada.titulo.aria"]);
    expect(doc.documentElement.lang).toBe("en-US");
    expect(doc.title).toBe(EN["doc.titulo"]);
    expect(
      doc.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBe(EN["doc.descripcion"]);
    expect(doc.querySelector(".tarjeta .titulo")!.textContent).toBe(
      EN["tarjeta1.titulo"],
    );
    expect(doc.querySelector("#d1")!.getAttribute("aria-label")).toBe(
      EN["tarjeta1.detalle.aria"],
    );
    expect(doc.querySelector("picture img")!.getAttribute("alt")).toBe(
      EN["tarjeta1.captura.alt"],
    );
    expect(doc.querySelector("svg.lamina")!.getAttribute("aria-label")).toBe(
      EN["aduana.lamina.aria"],
    );
    expect(doc.querySelector(".lema")!.textContent).toBe(TAGLINE_EN);
    expect(doc.querySelector("footer .sr-only")!.textContent).toBe(
      EN["pie.cuenta"],
    );
    expect(pulsado(doc, "en")).toBe("true");
    expect(pulsado(doc, "es")).toBe("false");
    // El primer pintado en inglés no se queda oculto.
    expect(doc.documentElement.classList.contains("idioma-pendiente")).toBe(
      false,
    );
    window.close();
  });

  it("sin parámetro, el primer idioma del navegador que sea es o en; si no hay, español", async () => {
    const casos: [string[], string][] = [
      [["en-US"], "en-US"],
      [["en-GB", "es-CO"], "en-US"],
      [["fr-FR", "es-MX"], "es-CO"],
      [["pt-BR", "en", "es"], "en-US"],
      [["fr-FR", "de"], "es-CO"],
    ];
    for (const [idiomas, esperado] of casos) {
      const { window, doc } = await abrir({ idiomas });
      expect(doc.documentElement.lang, idiomas.join(",")).toBe(esperado);
      window.close();
    }
  });

  it("el parámetro manda sobre el navegador, en los dos sentidos; uno inválido se ignora", async () => {
    for (const [url, idiomas, esperado] of [
      ["http://localhost/conoce?lang=es", ["en-US"], "es-CO"],
      ["http://localhost/conoce?lang=en", ["es-CO"], "en-US"],
      ["http://localhost/conoce?lang=EN-us", ["es-CO"], "en-US"],
      ["http://localhost/conoce?lang=fr", ["en-US"], "en-US"],
    ] as const) {
      const { window, doc } = await abrir({ url, idiomas: [...idiomas] });
      expect(doc.documentElement.lang, url).toBe(esperado);
      window.close();
    }
  });

  it("el botón cambia, escribe ?lang= con replaceState y volver deja el español BYTE A BYTE como estaba", async () => {
    const { window, doc } = await abrir({
      url: "http://localhost/conoce?x=1#fino",
    });
    const antes = doc.body.innerHTML;
    const titulo0 = doc.title;
    const historia = window.history.length;

    doc.querySelector<HTMLButtonElement>('.idioma button[lang="en"]')!.click();
    expect(doc.documentElement.lang).toBe("en-US");
    expect(window.location.search).toBe("?x=1&lang=en");
    expect(window.location.hash).toBe("#fino");
    expect(window.history.length, "replaceState, no pushState").toBe(historia);
    expect(doc.body.innerHTML).not.toBe(antes);

    doc.querySelector<HTMLButtonElement>('.idioma button[lang="es"]')!.click();
    expect(window.location.search).toBe("?x=1&lang=es");
    expect(doc.documentElement.lang).toBe("es-CO");
    expect(doc.title).toBe(titulo0);
    // Solo cambia lo único que debe cambiar: el estado de los botones.
    const volvio = doc.body.innerHTML;
    expect(volvio).toBe(antes);
    window.close();
  });

  it("el conteo del pie sigue siendo UN solo número y su texto accesible cambia de idioma", async () => {
    const { window, doc } = await abrir({
      url: "http://localhost/conoce?lang=en",
    });
    const total = String(EXPORT.funcionalidades.total);
    expect(doc.getElementById("conteo")!.textContent).toBe(total);
    expect(doc.querySelector("footer .sr-only")!.textContent).toBe(
      `${total} features`,
    );
    doc.querySelector<HTMLButtonElement>('.idioma button[lang="es"]')!.click();
    expect(doc.querySelector("footer .sr-only")!.textContent).toBe(
      `${total} funcionalidades`,
    );
    window.close();
  });

  it("el mapa conserva sus rutas en los dos idiomas", async () => {
    const hrefs = (doc: Document) =>
      Array.from(doc.querySelectorAll(".mapa a")).map((a) =>
        a.getAttribute("href"),
      );
    const es = await abrir();
    const en = await abrir({ url: "http://localhost/conoce?lang=en" });
    expect(hrefs(es.doc)).toEqual([
      "/",
      "/diagnostico",
      "/transformar",
      "/regreso",
      "/bitacora",
      "/conoce",
    ]);
    expect(hrefs(en.doc)).toEqual(hrefs(es.doc));
    es.window.close();
    en.window.close();
  });

  it("NADA se guarda: ni localStorage, ni sessionStorage, ni cookies, ni IndexedDB", async () => {
    const { window, doc } = await abrir({
      url: "http://localhost/conoce?lang=en",
    });
    doc.querySelector<HTMLButtonElement>('.idioma button[lang="es"]')!.click();
    doc.querySelector<HTMLButtonElement>('.idioma button[lang="en"]')!.click();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(doc.cookie).toBe("");
    window.close();
  });

  it("el código de la página no toca almacenamiento ni red (regla dura nº2, también aquí)", () => {
    // Solo el código que se ejecuta, sin comentarios: los comentarios NOMBRAN lo prohibido para
    // explicar que no se usa, igual que este mismo archivo.
    const scripts = Array.from(
      estatico.querySelectorAll('script:not([type="application/json"])'),
    )
      .map((s) => s.textContent ?? "")
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const prohibido of [
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /document\.cookie/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /sendBeacon/,
      /\bimport\s*\(/,
    ]) {
      expect(scripts, prohibido.source).not.toMatch(prohibido);
    }
    // Ni un recurso externo en todo el documento: el brochure sigue abriéndose con doble clic.
    expect(HTML).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    expect(HTML).not.toMatch(/@import|url\(\s*["']?https?:/i);
  });
});
