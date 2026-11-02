// Jerarquías de generalización (S7) — la escalera que la generalización óptima sube campo por campo.
//
// Una jerarquía es una lista de NIVELES: el 0 es el valor tal cual y el último es `*`, que no dice
// nada. La propiedad que sostiene todo lo demás es que son **anidados**: el nivel j+1 es función del
// nivel j (el quinquenio `35-39` siempre cae en el gran grupo `15-64`; el mes `1987-03` siempre en el
// trimestre `1987-01/1987-03`). Con niveles anidados, subir un campo de nivel solo puede JUNTAR clases
// de equivalencia, nunca partirlas: eso hace monótono el k (y la ℓ distinta), y monótona la pérdida
// medida en bits. Las dos monotonías son las que dejan a OLA podar la retícula sin perder el óptimo
// (`src/engine/optima.ts`, ADR-013).
//
// El anidamiento no se confía a que cada nivel esté bien escrito: sale POR CONSTRUCCIÓN. Una jerarquía
// se declara como PASOS, y el nivel j es el paso j aplicado al nivel j−1, nunca al valor original. Dos
// valores iguales en el nivel j no pueden separarse en el j+1, porque el j+1 solo ve el j. Si los
// niveles se calcularan sobre el original, un `5-9` que el archivo ya traía agrupado se quedaría
// `5-9` mientras un `7` sube de `5-9` a `0-9`: dos celdas juntas en un nivel y separadas en el
// siguiente, y la poda de OLA dejaría de ser segura.
//
// Reglas comunes, las mismas de `tecnicas/generalizar.ts`:
//   · un valor que no se puede subir de nivel (un texto en una columna de edades) se queda como está
//     en los niveles intermedios: inventarle un rango sería afirmar un dato que nadie escribió;
//   · el vacío sigue vacío en los niveles intermedios;
//   · el ÚLTIMO nivel es `*` para TODA celda, vacía incluida: es la supresión del valor, y es lo que
//     garantiza que el nodo de arriba de la retícula siempre cumpla k si el archivo tiene k filas.
//
// Ningún nivel escribe palabras: rangos con guion, fechas ISO (el trimestre es un intervalo ISO 8601
// de meses), códigos oficiales y `*`. La salida es la misma en los dos idiomas.

import { generalizarRango } from "../tecnicas/generalizar";
import { pasosDeFabrica, type JerarquiaDeFabrica } from "./fabrica";
import { SUPRIMIDO, type Nivel } from "./tipos";

/** Lo que la política declara por columna. Las de fábrica citan su fuente en `fabrica/*.meta.json`. */
export type Jerarquia =
  | { readonly tipo: "rango"; readonly amplitudes: readonly number[] }
  | { readonly tipo: "fecha" }
  | { readonly tipo: "prefijo"; readonly largos: readonly number[] }
  | { readonly tipo: "supresion" }
  | { readonly tipo: JerarquiaDeFabrica };

export { SUPRIMIDO, type Nivel } from "./tipos";

const identidad: Nivel = (v) => v;
const suprimir: Nivel = () => SUPRIMIDO;

/** El vacío no se generaliza en los niveles intermedios. */
function sinTocarElVacio(nivel: Nivel): Nivel {
  return (v) => (v === "" ? "" : nivel(v));
}

// ── Fechas ──────────────────────────────────────────────────────────────────────────────────────

const ISO = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const LOCAL = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;
/** Un trimestre ya escrito como intervalo ISO de meses: lo que este mismo módulo produce. */
const TRIMESTRE = /^(\d{4})-(\d{2})\/\d{4}-\d{2}$/;

interface Fecha {
  readonly anio: string;
  readonly mes: string | null;
  /** Un trimestre ya escrito: tiene año y trimestre, pero no un mes que se pueda afirmar. */
  readonly esTrimestre: boolean;
}

function leerFecha(valor: string): Fecha | null {
  const limpio = valor.trim();
  const iso = ISO.exec(limpio);
  if (iso) {
    if (iso[2] !== undefined && !mesValido(iso[2])) return null;
    return { anio: iso[1], mes: iso[2] ?? null, esTrimestre: false };
  }
  const local = LOCAL.exec(limpio);
  if (local)
    return mesValido(local[2])
      ? { anio: local[3], mes: local[2], esTrimestre: false }
      : null;
  const trimestre = TRIMESTRE.exec(limpio);
  if (trimestre && mesValido(trimestre[2]))
    return { anio: trimestre[1], mes: trimestre[2], esTrimestre: true };
  return null;
}

function mesValido(mes: string): boolean {
  const n = Number(mes);
  return n >= 1 && n <= 12;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** `1987-03` → `1987-01/1987-03`: el trimestre como intervalo ISO 8601, sin palabras. */
function trimestreDe(f: Fecha): string | null {
  if (f.mes === null) return null;
  const inicio = Math.floor((Number(f.mes) - 1) / 3) * 3 + 1;
  return `${f.anio}-${dos(inicio)}/${f.anio}-${dos(inicio + 2)}`;
}

// Día → mes → trimestre → año. Un trimestre ya escrito no baja a mes: no hay mes que afirmar.
const PASOS_DE_FECHA: readonly Nivel[] = [
  (v) => {
    const f = leerFecha(v);
    return f?.mes && !f.esTrimestre ? `${f.anio}-${f.mes}` : v;
  },
  (v) => {
    const f = leerFecha(v);
    return (f && trimestreDe(f)) ?? v;
  },
  (v) => leerFecha(v)?.anio ?? v,
];

// ── Las genéricas ───────────────────────────────────────────────────────────────────────────────

/** Un rango ya escrito (`35-39`, `-10--1`), como lo deja `generalizarRango`. */
const RANGO = /^(-?\d+)-(-?\d+)$/;

/**
 * El paso a rangos de `amplitud`. Recibe un número o el rango del paso anterior, y un rango solo sube
 * si cabe ENTERO en el nuevo: un `7-12` que el archivo ya traía no cabe en `5-9` y se queda como está.
 */
function pasoDeRango(amplitud: number): Nivel {
  return (v) => {
    const rango = RANGO.exec(v.trim());
    if (!rango) return generalizarRango(v, amplitud);
    const desde = Number(rango[1]);
    const hasta = Number(rango[2]);
    if (desde > hasta) return v;
    const piso = Math.floor(desde / amplitud) * amplitud;
    const techo = piso + amplitud - 1;
    return hasta <= techo ? `${piso}-${techo}` : v;
  };
}

function pasoDePrefijo(largo: number): Nivel {
  return (v) => {
    const limpio = v.trim();
    return limpio.length <= largo ? limpio : limpio.slice(0, largo);
  };
}

/**
 * Los PASOS de una jerarquía: el paso j lleva del nivel j−1 al j, y el último siempre es `*` (para
 * toda celda, vacía incluida). Los intermedios no tocan el vacío. Las de fábrica se cargan aquí y no
 * en la política: sus tablas solo viven en el worker.
 */
export function pasosDe(jerarquia: Jerarquia): readonly Nivel[] {
  const intermedios = ((): readonly Nivel[] => {
    switch (jerarquia.tipo) {
      case "rango":
        return jerarquia.amplitudes.map(pasoDeRango);
      case "fecha":
        return PASOS_DE_FECHA;
      case "prefijo":
        return jerarquia.largos.map(pasoDePrefijo);
      case "supresion":
        return [];
      default:
        return pasosDeFabrica(jerarquia.tipo);
    }
  })();
  return [...intermedios.map(sinTocarElVacio), suprimir];
}

/** Los niveles de una jerarquía, del 0 (el valor) al último (`*`): los pasos, compuestos. */
export function nivelesDe(jerarquia: Jerarquia): readonly Nivel[] {
  const niveles: Nivel[] = [identidad];
  for (const paso of pasosDe(jerarquia)) {
    const anterior = niveles[niveles.length - 1];
    niveles.push((v) => paso(anterior(v)));
  }
  return niveles;
}

/** El nombre de cada nivel, para la pantalla y el certificado (claves; las frases van en el catálogo). */
export function nombresDeNiveles(jerarquia: Jerarquia): readonly string[] {
  switch (jerarquia.tipo) {
    case "rango":
      return [
        "valor",
        ...jerarquia.amplitudes.map((a) => `rango-${a}`),
        "suprimido",
      ];
    case "fecha":
      return ["valor", "mes", "trimestre", "anio", "suprimido"];
    case "prefijo":
      return [
        "valor",
        ...jerarquia.largos.map((n) => `prefijo-${n}`),
        "suprimido",
      ];
    case "supresion":
      return ["valor", "suprimido"];
    case "divipola":
      return ["valor", "departamento", "region", "suprimido"];
    case "edad-dane":
      return ["valor", "quinquenio", "gran-grupo", "suprimido"];
    case "ciiu":
      return ["valor", "grupo", "division", "seccion", "suprimido"];
  }
}
