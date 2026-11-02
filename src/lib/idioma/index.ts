// La capa de idioma de Velo — español e inglés, y nada más que eso.
//
// Cada texto nace como un mapa `{ es, en }` REDACTADO en los dos idiomas, uno al lado del otro. No
// se escribe en español para traducir después: las dos versiones se piensan juntas, porque un
// aviso de privacidad que suena natural en un idioma y calcado en el otro es un aviso que se lee
// peor justo donde más importa. `tests/unit/idioma.test.ts` comprueba que ningún texto tenga
// una sola cara.
//
// Esta capa es PURA: no toca React, ni el DOM, ni el navegador. El estado del idioma elegido vive
// aparte (`estado.ts`), y los motores y el worker no lo conocen: devuelven `Mensaje`s (una clave y
// sus datos) y la interfaz, o el documento que se descarga, los convierte en frase. Así una misma
// corrida del motor sirve a los dos idiomas y ningún texto del worker se queda en español.
//
// Nada de esto se guarda en el navegador (regla dura nº2): el idioma vive en memoria y en el
// parámetro `?lang=` de la URL.

export const IDIOMAS = ["es", "en"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_POR_DEFECTO: Idioma = "es";

/** El nombre de cada idioma escrito en su propio idioma — para el conmutador. */
export const NOMBRE_PROPIO: Record<Idioma, string> = {
  es: "Español",
  en: "English",
};

/** Configuración regional de cada idioma: separadores de miles y decimales, y nombres de mes. */
export const LOCALE: Record<Idioma, string> = { es: "es-CO", en: "en-US" };

export function esIdioma(valor: unknown): valor is Idioma {
  return (
    typeof valor === "string" && (IDIOMAS as readonly string[]).includes(valor)
  );
}

/** Un texto con sus dos caras. Los marcadores `{nombre}` se llenan con `Datos`. */
export interface Texto {
  readonly es: string;
  readonly en: string;
}

/** Un catálogo: textos agrupados por pantalla o por tema, anidables. */
export interface Catalogo {
  readonly [clave: string]: Texto | Catalogo | readonly (Texto | Catalogo)[];
}

export type Datos = Readonly<Record<string, string | number>>;

/**
 * Lo que el motor y el worker devuelven en lugar de una frase: una clave del catálogo del motor y
 * los datos que la llenan. Es serializable (cruza el `postMessage` tal cual) y determinista.
 */
export interface Mensaje<C extends string = string> {
  readonly clave: C;
  readonly datos?: Datos;
}

export function mensaje<C extends string>(clave: C, datos?: Datos): Mensaje<C> {
  return datos === undefined ? { clave } : { clave, datos };
}

export function esTexto(valor: unknown): valor is Texto {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as Texto).es === "string" &&
    typeof (valor as Texto).en === "string"
  );
}

// ── Qué idioma usar ──────────────────────────────────────────────────────────────────────────

/**
 * El idioma que corresponde a lo que el navegador dice y a lo que la URL pide. La URL manda (es una
 * elección explícita de quien abre el enlace); si no hay, la primera lengua del navegador que Velo
 * hable; si ninguna, español.
 */
export function detectarIdioma(
  parametro: string | null | undefined,
  preferencias: readonly string[] | undefined,
): Idioma {
  const pedido = parametro?.trim().toLowerCase().slice(0, 2);
  if (esIdioma(pedido)) return pedido;
  for (const preferencia of preferencias ?? []) {
    const base = preferencia.trim().toLowerCase().slice(0, 2);
    if (esIdioma(base)) return base;
  }
  return IDIOMA_POR_DEFECTO;
}

// ── Cómo se escribe un número ────────────────────────────────────────────────────────────────

const FORMATOS = new Map<string, Intl.NumberFormat>();

/** Un formateador por idioma y precisión: construirlos cuesta más que usarlos. */
export function formatoNumerico(
  idioma: Idioma,
  opciones: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const llave = `${idioma}|${opciones.minimumFractionDigits ?? ""}|${opciones.maximumFractionDigits ?? ""}`;
  let formato = FORMATOS.get(llave);
  if (!formato) {
    formato = new Intl.NumberFormat(LOCALE[idioma], opciones);
    FORMATOS.set(llave, formato);
  }
  return formato;
}

// ── Llenar un texto ──────────────────────────────────────────────────────────────────────────

const MARCADOR = /\{([A-Za-z0-9_]+)(?::(\d+))?\}/g;

/**
 * Llena los marcadores de una plantilla.
 *
 * `{n}` escribe el número con la convención del idioma (1.234 en español, 1,234 en inglés);
 * `{n:2}` lo escribe con exactamente dos decimales. Una cadena pasa tal cual. Un dato que falta
 * deja el marcador a la vista: es un defecto que se ve, no una frase silenciosamente rota.
 */
export function interpolar(
  plantilla: string,
  idioma: Idioma,
  datos?: Datos,
): string {
  if (!datos) return plantilla;
  return plantilla.replace(
    MARCADOR,
    (entero, nombre: string, decimales?: string) => {
      if (!(nombre in datos)) return entero;
      const valor = datos[nombre];
      if (typeof valor === "string") return valor;
      return decimales === undefined
        ? formatoNumerico(idioma, { maximumFractionDigits: 3 }).format(valor)
        : formatoNumerico(idioma, {
            minimumFractionDigits: Number(decimales),
            maximumFractionDigits: Number(decimales),
          }).format(valor);
    },
  );
}

/**
 * Un texto listo para pintar: el énfasis se resuelve sobre la PLANTILLA y los datos se llenan
 * DESPUÉS, dentro de cada tramo. El orden importa: si los datos se llenaran primero, un nombre de
 * columna como `**x**` o con comillas invertidas —que es dato del usuario, no marcado— se
 * leería como énfasis y se comería los caracteres.
 */
export function armar(
  plantilla: string,
  idioma: Idioma,
  datos?: Datos,
): Tramo[] {
  return tramos(plantilla).map((tramo) => ({
    tipo: tramo.tipo,
    texto: interpolar(tramo.texto, idioma, datos),
  }));
}

/** El texto en un idioma, con sus datos y sin marcas de énfasis (atributos, títulos, comparaciones). */
export function decir(texto: Texto, idioma: Idioma, datos?: Datos): string {
  return armar(texto[idioma], idioma, datos)
    .map((t) => t.texto)
    .join("");
}

/** Los nombres de los marcadores de una plantilla — para comprobar que las dos caras coinciden. */
export function marcadores(plantilla: string): string[] {
  return [
    ...new Set([...plantilla.matchAll(MARCADOR)].map((m) => m[1]!)),
  ].sort();
}

// ── Énfasis dentro de un texto ───────────────────────────────────────────────────────────────

/**
 * Un tramo de texto: llano, en negrita (`**así**`), código (`` `así` ``) o advertencia (`!!así!!`,
 * la negrita en el color de alerta — el color nunca va solo: sigue siendo negrita y sigue siendo texto).
 */
export interface Tramo {
  readonly tipo: "texto" | "negrita" | "codigo" | "alerta";
  readonly texto: string;
}

const TRAMO = /\*\*([^*]+)\*\*|`([^`]+)`|!!([^!]+)!!/g;

export function tramos(texto: string): Tramo[] {
  const salida: Tramo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(TRAMO)) {
    if (m.index > desde)
      salida.push({ tipo: "texto", texto: texto.slice(desde, m.index) });
    salida.push(
      m[1] !== undefined
        ? { tipo: "negrita", texto: m[1] }
        : m[2] !== undefined
          ? { tipo: "codigo", texto: m[2] }
          : { tipo: "alerta", texto: m[3]! },
    );
    desde = m.index + m[0].length;
  }
  if (desde < texto.length)
    salida.push({ tipo: "texto", texto: texto.slice(desde) });
  return salida;
}

export function sinMarcado(texto: string): string {
  return tramos(texto)
    .map((t) => t.texto)
    .join("");
}

/** La forma del énfasis de un texto — `n` negritas y `m` códigos — para compararla entre idiomas. */
export function formaDelMarcado(plantilla: string): string {
  return tramos(plantilla)
    .filter((t) => t.tipo !== "texto")
    .map((t) => t.tipo)
    .join(",");
}

/** Elige entre singular y plural con la regla de los dos idiomas (1 → singular, el resto → plural). */
export function plural(cantidad: number, singular: Texto, otros: Texto): Texto {
  return cantidad === 1 ? singular : otros;
}
