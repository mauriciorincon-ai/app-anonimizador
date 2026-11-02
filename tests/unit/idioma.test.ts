// GATE DE PARIDAD — el texto de Velo existe entero en los dos idiomas.
//
// «Redactado, no traducido» no se puede probar con una máquina, pero sí lo que lo vuelve posible:
// que ninguna frase tenga una sola cara. Este test recorre TODOS los catálogos de
// `src/lib/idioma/textos/` (los descubre solo: una pantalla nueva suma el suyo sin registrarlo en
// ningún sitio) y exige, hoja por hoja:
//
//   · las dos caras existen y no están vacías;
//   · usan los mismos `{marcadores}` — si el inglés olvida `{n}`, la cifra desaparece de la frase;
//   · llevan el mismo énfasis (`**negrita**` y `` `código` ``) — un aviso en negrita en un idioma
//     y llano en el otro es una advertencia que se lee distinto según quién la lea;
//   · el inglés NO es el español pegado (la señal de «se me olvidó escribirlo»), salvo los pocos
//     textos que lo son a propósito y se listan abajo con su razón;
//   · el inglés no trae signos de apertura del español (`¿` `¡`).
//
// Y los ayudantes que sostienen todo lo demás: llenar marcadores, detectar el idioma, el énfasis.

import { describe, expect, it } from "vitest";

import {
  armar,
  decir,
  detectarIdioma,
  esTexto,
  formaDelMarcado,
  interpolar,
  marcadores,
  mensaje,
  plural,
  sinMarcado,
  tramos,
  type Texto,
} from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { MOTOR } from "@/lib/idioma/textos/motor";
import { MOTOR_DIAGNOSTICO } from "@/lib/idioma/textos/motor-diagnostico";
import { MOTOR_REGRESO } from "@/lib/idioma/textos/motor-regreso";
import { MOTOR_TRANSFORMAR } from "@/lib/idioma/textos/motor-transformar";

// ── Descubrir los catálogos ───────────────────────────────────────────────────────────────────

const MODULOS = import.meta.glob("../../src/lib/idioma/textos/*.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

/** Textos que son iguales en los dos idiomas A PROPÓSITO, con la razón. Todo lo demás debe diferir. */
const IGUALES_A_PROPOSITO: Readonly<Record<string, string>> = {
  "comun › conmutador.grupo":
    "es bilingüe a propósito: quien llegó a una pantalla que no entiende debe reconocer dónde se cambia",
  "documentos › utilidad.bits":
    "la unidad de información se escribe «bits» en los dos idiomas",
  "generalizacion › tabla.encabezados.mondrian":
    "Mondrian es el nombre del algoritmo (LeFevre, DeWitt y Ramakrishnan, 2006) en los dos idiomas",
  "generalizacion › tabla.no":
    "la negación de la tabla se escribe «No» en los dos idiomas",
  "transformar › editor.ruido.etiquetas.epsilon":
    "ε es el símbolo de la privacidad diferencial en los dos idiomas",
};

interface Hoja {
  readonly ruta: string;
  readonly texto: Texto;
}

function hojas(valor: unknown, ruta: string, defectos: string[]): Hoja[] {
  if (esTexto(valor)) return [{ ruta, texto: valor }];
  if (Array.isArray(valor))
    return valor.flatMap((v, i) => hojas(v, `${ruta}[${i}]`, defectos));
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([clave, v]) =>
      hojas(v, ruta ? `${ruta}.${clave}` : clave, defectos),
    );
  }
  defectos.push(
    `${ruta}: es ${typeof valor}, no un texto {es, en} (¿falta una de las dos caras?)`,
  );
  return [];
}

const defectosDeForma: string[] = [];
const TODAS: Hoja[] = Object.entries(MODULOS)
  .filter(([archivo]) => !archivo.endsWith("/motor.ts"))
  .flatMap(([archivo, modulo]) => {
    const nombre = archivo.split("/").pop()!.replace(/\.ts$/, "");
    return Object.entries(modulo).flatMap(([exportado, catalogo]) =>
      hojas(catalogo, `${nombre} › ${exportado}`, defectosDeForma).map((h) => ({
        ...h,
        // Se quita el nombre del export para que la ruta sea corta y estable: `comun › sello.titulo`.
        ruta: h.ruta
          .replace(` › ${exportado}.`, " › ")
          .replace(` › ${exportado}`, ""),
      })),
    );
  });

const tieneLetras = (plantilla: string) =>
  /\p{L}/u.test(plantilla.replace(/\{[^}]*\}/g, ""));

describe("los catálogos de texto", () => {
  it("se descubren (el glob encontró los archivos de textos/)", () => {
    expect(Object.keys(MODULOS).length).toBeGreaterThanOrEqual(5);
    expect(TODAS.length).toBeGreaterThan(5);
  });

  it("toda hoja es un texto con sus dos caras", () => {
    expect(defectosDeForma).toEqual([]);
  });

  it("ninguna cara está vacía", () => {
    const vacios = TODAS.filter(
      ({ texto }) => texto.es.trim() === "" || texto.en.trim() === "",
    ).map((h) => h.ruta);
    expect(vacios).toEqual([]);
  });

  it("las dos caras usan los mismos {marcadores}", () => {
    const distintos = TODAS.filter(
      ({ texto }) =>
        marcadores(texto.es).join() !== marcadores(texto.en).join(),
    ).map(
      (h) =>
        `${h.ruta}: es{${marcadores(h.texto.es)}} ≠ en{${marcadores(h.texto.en)}}`,
    );
    expect(distintos).toEqual([]);
  });

  it("las dos caras llevan el mismo énfasis", () => {
    const distintos = TODAS.filter(
      ({ texto }) => formaDelMarcado(texto.es) !== formaDelMarcado(texto.en),
    ).map(
      (h) =>
        `${h.ruta}: es[${formaDelMarcado(h.texto.es)}] ≠ en[${formaDelMarcado(h.texto.en)}]`,
    );
    expect(distintos).toEqual([]);
  });

  it("el inglés no es el español pegado", () => {
    const iguales = TODAS.filter(
      ({ ruta, texto }) =>
        texto.es === texto.en &&
        tieneLetras(texto.es) &&
        !(ruta in IGUALES_A_PROPOSITO),
    ).map((h) => `${h.ruta}: «${h.texto.en}»`);
    expect(iguales).toEqual([]);
  });

  it("cada excepción de «iguales a propósito» sigue existiendo y sigue siendo igual", () => {
    for (const ruta of Object.keys(IGUALES_A_PROPOSITO)) {
      const hoja = TODAS.find((h) => h.ruta === ruta);
      expect(hoja, `${ruta} ya no existe: bórrala de la lista`).toBeDefined();
      expect(hoja!.texto.es, `${ruta} ya difiere: bórrala de la lista`).toBe(
        hoja!.texto.en,
      );
    }
  });

  it("el inglés no trae signos de apertura del español", () => {
    const con = TODAS.filter(({ texto }) => /[¿¡]/.test(texto.en)).map(
      (h) => h.ruta,
    );
    expect(con).toEqual([]);
  });

  it("las claves del motor no se repiten entre áreas", () => {
    const claves = [
      ...Object.keys(MOTOR_DIAGNOSTICO),
      ...Object.keys(MOTOR_TRANSFORMAR),
      ...Object.keys(MOTOR_REGRESO),
    ];
    expect(new Set(claves).size).toBe(claves.length);
    expect(Object.keys(MOTOR).length).toBe(claves.length);
  });
});

// ── Los ayudantes ─────────────────────────────────────────────────────────────────────────────

describe("llenar marcadores", () => {
  it("escribe los números con la convención del idioma", () => {
    expect(interpolar("{n} filas", "es", { n: 1234567 })).toBe(
      "1.234.567 filas",
    );
    expect(interpolar("{n} rows", "en", { n: 1234567 })).toBe("1,234,567 rows");
  });

  it("escribe los decimales que se piden y deja pasar las cadenas tal cual", () => {
    expect(interpolar("{x:2}", "es", { x: 0.5 })).toBe("0,50");
    expect(interpolar("{x:2}", "en", { x: 0.5 })).toBe("0.50");
    expect(interpolar("{nombre}", "es", { nombre: "1.234" })).toBe("1.234");
  });

  it("deja a la vista un dato que falta en vez de esconderlo", () => {
    expect(interpolar("a {falta} b", "es", { otro: 1 })).toBe("a {falta} b");
  });

  it("encuentra los marcadores sin repetirlos", () => {
    expect(marcadores("{b} y {a} y {b:2}")).toEqual(["a", "b"]);
  });
});

describe("el énfasis", () => {
  it("separa texto llano, negrita y código", () => {
    expect(tramos("uno **dos** tres `cuatro`")).toEqual([
      { tipo: "texto", texto: "uno " },
      { tipo: "negrita", texto: "dos" },
      { tipo: "texto", texto: " tres " },
      { tipo: "codigo", texto: "cuatro" },
    ]);
  });

  it("lo quita cuando el texto va a un atributo", () => {
    expect(sinMarcado("el **riesgo** de `k`")).toBe("el riesgo de k");
    const texto: Texto = { es: "**hola** {n}", en: "**hi** {n}" };
    expect(decir(texto, "en", { n: 2 })).toBe("hi 2");
  });

  it("el dato del usuario NUNCA se lee como énfasis, aunque lo parezca", () => {
    // Un nombre de columna es dato, no marcado: `**x**` o `a`b` tienen que llegar enteros. Por eso
    // el énfasis se resuelve sobre la plantilla y los datos se llenan después, dentro de cada tramo.
    const texto: Texto = {
      es: "La columna **{nombre}** sale",
      en: "Column **{nombre}** leaves",
    };
    for (const nombre of ["**x**", "a`b`c", "!!y!!", "{n}"]) {
      expect(decir(texto, "es", { nombre })).toBe(`La columna ${nombre} sale`);
      const tr = armar(texto.en, "en", { nombre });
      expect(tr.map((t) => t.tipo)).toEqual(["texto", "negrita", "texto"]);
      expect(tr[1]!.texto).toBe(nombre);
    }
  });

  it("describe su forma para compararla entre idiomas", () => {
    expect(formaDelMarcado("a **b** `c` **d**")).toBe("negrita,codigo,negrita");
    expect(formaDelMarcado("sin énfasis")).toBe("");
  });
});

describe("el idioma que corresponde", () => {
  it("la URL manda sobre el navegador", () => {
    expect(detectarIdioma("en", ["es-CO"])).toBe("en");
    expect(detectarIdioma("ES", ["en-US"])).toBe("es");
  });

  it("sin URL, la primera lengua del navegador que Velo habla", () => {
    expect(detectarIdioma(null, ["fr-FR", "en-GB", "es"])).toBe("en");
    expect(detectarIdioma(undefined, ["es-CO", "en-US"])).toBe("es");
  });

  it("ante lo desconocido, español", () => {
    expect(detectarIdioma("xx", ["fr-FR", "de"])).toBe("es");
    expect(detectarIdioma(null, [])).toBe("es");
    expect(detectarIdioma(null, undefined)).toBe("es");
  });
});

describe("singular y plural", () => {
  const uno: Texto = { es: "1 fila", en: "1 row" };
  const otros: Texto = { es: "{n} filas", en: "{n} rows" };
  it("elige por la cantidad, igual en los dos idiomas", () => {
    expect(plural(1, uno, otros)).toBe(uno);
    expect(plural(0, uno, otros)).toBe(otros);
    expect(plural(2, uno, otros)).toBe(otros);
  });
});

describe("un mensaje del motor", () => {
  it("una clave desconocida se ve, no se esconde", () => {
    const desconocido = mensaje("no.existe") as unknown as Parameters<
      typeof decirMensaje
    >[0];
    expect(decirMensaje(desconocido, "es")).toBe("⟦no.existe⟧");
  });
});
