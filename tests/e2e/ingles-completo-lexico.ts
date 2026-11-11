// El diccionario de español que usa `ingles-completo.spec.ts`, sin ninguna dependencia nueva.
//
// «Una palabra en español» se define con lo que Velo mismo escribe: el vocabulario de todos los
// catálogos `{ es, en }` MENOS el de sus caras en inglés. Lo que queda son las palabras que solo el
// español usa (`aduana`, `bóveda`, `llave`…); un nombre propio, una sigla o un término que el inglés
// también escribe (`Velo`, `Habeas Data`, `NIT`, `k`) está en las dos caras y no se marca. Si el
// producto agrega un catálogo, entra aquí solo: la lista no se mantiene a mano.
//
// A eso se suman unas pocas palabras vacías que ninguna frase en inglés lleva, para atrapar una
// oración española entera aunque sus palabras de contenido también existan en inglés (`modelo`).
//
// Lo que NO se marca: los valores del propio archivo de prueba (encabezados y celdas son datos del
// usuario, en el idioma que él los escribió) y la lista corta de `PERMITIDAS`, cada una con su razón.

import { readdirSync } from "node:fs";
import { join } from "node:path";

const CATALOGOS = join(process.cwd(), "src", "lib", "idioma", "textos");

/** Nombres propios o términos que la interfaz inglesa conserva a propósito, y por qué. */
export const PERMITIDAS: Readonly<Record<string, string>> = {
  velo: "el nombre del producto",
  cedula: "documento colombiano; el inglés lo nombra así",
  cédula: "documento colombiano; el inglés lo nombra así",
  habeas: "«Habeas Data», nombre propio de la política de fábrica",
  colombia: "nombre propio",
  bogotá: "nombre propio (ciudad)",
  español:
    "el conmutador de idioma nombra cada idioma en el suyo («ES · Español», «EN · English»)",
  cadena:
    "apellido de una persona inventada en la muestra del brochure (dato, no interfaz)",
  control:
    "inglés corriente («stay in control»); ningún catálogo en inglés lo usa",
  anonimizado:
    "parte fija del nombre del archivo que Velo escribe (`velo-anonimizado-…`), igual en los dos idiomas",
};

/** Palabras vacías que una frase en inglés no lleva: una sola basta para marcar el texto. */
const VACIAS_DEL_ESPANOL = new Set([
  "para",
  "con",
  "los",
  "las",
  "una",
  "del",
  "por",
  "que",
  "tus",
  "sus",
  "esta",
  "este",
  "cada",
  "sin",
  "más",
  "pero",
  "cuando",
  "donde",
  "también",
  "aquí",
  "desde",
  "hasta",
  "sobre",
  "tiene",
  "puede",
  "lo",
  "al",
  "el",
  "la",
  "se",
  "como",
  "entre",
  "todo",
  "todos",
]);

const PALABRA = /\p{L}+/gu;

export function palabrasDe(texto: string): string[] {
  return (texto.match(PALABRA) ?? []).map((p) => p.toLowerCase());
}

export interface Hoja {
  es: string;
  en: string;
}

const esHoja = (v: unknown): v is Hoja =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Hoja).es === "string" &&
  typeof (v as Hoja).en === "string";

/** Todas las hojas `{ es, en }` de un valor de catálogo, a cualquier profundidad. */
function hojasDe(valor: unknown, salida: Hoja[] = []): Hoja[] {
  if (esHoja(valor)) {
    salida.push(valor);
  } else if (Array.isArray(valor)) {
    for (const v of valor) hojasDe(v, salida);
  } else if (typeof valor === "object" && valor !== null) {
    for (const v of Object.values(valor)) hojasDe(v, salida);
  }
  return salida;
}

/** Quita lo que no es prosa: marcadores `{dato}`, énfasis en Markdown y código en línea. */
const prosa = (texto: string) =>
  texto.replace(/\{[^}]*\}/g, " ").replace(/`[^`]*`/g, " ");

async function cargarHojas(): Promise<Hoja[]> {
  const hojas: Hoja[] = [];
  for (const nombre of readdirSync(CATALOGOS).filter((f) =>
    f.endsWith(".ts"),
  )) {
    const modulo = (await import(join(CATALOGOS, nombre))) as Record<
      string,
      unknown
    >;
    for (const exportado of Object.values(modulo)) hojasDe(exportado, hojas);
  }
  return hojas;
}

export interface Traductor {
  /** La cara inglesa de `es`. Falla si dos catálogos la redactan distinto: ahí se usa `enAlguna`. */
  (es: string, datos?: Record<string, string | number>): string;
  /** Todas las caras inglesas de `es` como una expresión, para un texto que más de una pantalla dice. */
  enAlguna(es: string): RegExp;
}

/**
 * La cara inglesa de un texto escrito en español, para que el recorrido use los selectores de los
 * demás e2e sin repetir la redacción: `en("Derivar la llave")` es lo que el botón dice en inglés.
 * Acepta una plantilla con sus datos (`en("Técnica para la columna {columna}", { columna })`).
 */
export async function crearTraductor(): Promise<Traductor> {
  const hojas = await cargarHojas();
  const llenar = (texto: string, datos?: Record<string, string | number>) =>
    texto.replace(/\{(\w+)\}/g, (_, k: string) =>
      String(datos?.[k] ?? `{${k}}`),
    );
  const variantes = (es: string): string[] => {
    const caras = new Set(hojas.filter((h) => h.es === es).map((h) => h.en));
    if (caras.size === 0) throw new Error(`Ningún catálogo trae «${es}»`);
    return [...caras];
  };
  const en = ((es: string, datos?: Record<string, string | number>) => {
    const caras = variantes(es);
    if (caras.length > 1) {
      throw new Error(
        `«${es}» se redacta de ${caras.length} maneras en inglés; usa enAlguna(): ${caras.join(" | ")}`,
      );
    }
    return llenar(caras[0], datos);
  }) as Traductor;
  en.enAlguna = (es) =>
    new RegExp(
      `^(?:${variantes(es)
        .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")})$`,
    );
  return en;
}

export interface Detector {
  /** Palabras del texto que son español y no están permitidas. Vacío si el texto es inglés. */
  enEspanol(texto: string): string[];
  /** Cuántas palabras solo-español tiene el vocabulario (para que el test vea que no está vacío). */
  tamano: number;
}

/**
 * @param delArchivo texto del archivo de prueba (encabezados y celdas): son datos, no interfaz.
 */
export async function crearDetector(
  delArchivo: string,
  hojasDadas?: Hoja[],
): Promise<Detector> {
  const hojas = hojasDadas ?? (await cargarHojas());

  // Una cara «inglesa» que lleva palabras vacías del español es una frase sin traducir: no se toma
  // como inglés de confianza. Sin esto, una frase española pegada en una cara inglesa «envenena» su
  // propio detector: sus palabras pasarían a contar como inglés y nadie las marcaría.
  const parecenEspanol = (texto: string) =>
    palabrasDe(prosa(texto)).some((p) => VACIAS_DEL_ESPANOL.has(p));
  const delIngles = new Set(
    hojas
      .filter((h) => !parecenEspanol(h.en))
      .flatMap((h) => palabrasDe(prosa(h.en))),
  );
  const delArchivoSet = new Set(palabrasDe(delArchivo));
  const soloEspanol = new Set<string>();
  for (const hoja of hojas) {
    for (const palabra of palabrasDe(prosa(hoja.es))) {
      if (palabra.length < 4) continue;
      if (delIngles.has(palabra) || delArchivoSet.has(palabra)) continue;
      if (palabra in PERMITIDAS) continue;
      soloEspanol.add(palabra);
    }
  }

  return {
    tamano: soloEspanol.size,
    enEspanol(texto) {
      const halladas = new Set<string>();
      for (const palabra of palabrasDe(texto)) {
        if (palabra in PERMITIDAS || delArchivoSet.has(palabra)) continue;
        if (soloEspanol.has(palabra) || VACIAS_DEL_ESPANOL.has(palabra)) {
          halladas.add(palabra);
        }
      }
      return [...halladas];
    },
  };
}
