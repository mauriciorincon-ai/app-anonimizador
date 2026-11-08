// Las jerarquías de FÁBRICA (S7) — colombianas, con su fuente oficial.
//
// Ninguna tabla de aquí se inventó: cada una salió de un documento público, descargado UNA vez a mano
// por quien construyó Velo, y viaja con un `.meta.json` que dice qué documento, de dónde, cuándo, con
// qué SHA-256, y cómo se derivó la tabla (`scripts/jerarquias/derivar.mjs`). Un test comprueba que la
// tabla que está en el repo es la que el `.meta.json` describe: si alguien la toca, el gate cae.
// La aplicación nunca usa la red; estas tablas se empaquetan con el worker.
//
//   · `divipola`  — municipio → departamento → región → `*`. DIVIPOLA del DANE; la región, de una
//                   regionalización oficial citada en `divipola.meta.json`.
//   · `edad-dane` — edad → quinquenio → gran grupo (0-14 · 15-59 · 60+) → `*`. Los de las proyecciones
//                   vigentes del DANE (PPED, julio de 2025); no hay tabla que bajar, así que la
//                   fuente se cita abajo, en `fuentes.ts` y en el ADR-013.
//   · `ciiu`      — clase → grupo → división → sección → `*`. CIIU Rev. 4 adaptada para Colombia
//                   (DANE); la lista de clases y las secciones, de `ciiu.meta.json`.
//   · `ciiu5`     — lo mismo con la CIIU Rev. 5 A.C. (S11, Resolución 992 de 2026), de `ciiu5.meta.json`.
//
// Lo que no se encuentra en la tabla (un código que no existe, un nombre de municipio que se repite en
// dos departamentos) se queda como está en los niveles intermedios y llega a `*` en el último, igual
// que en las jerarquías genéricas. Un nombre repetido NO se adivina: «La Unión» hay en varios
// departamentos, y elegir uno sería afirmar dónde vive alguien.
//
// Aquí viven los PASOS, no los niveles: cada paso recibe lo que dejó el anterior (el paso a región
// recibe un departamento, no un municipio) y `index.ts` los compone. Por eso cada paso acepta también
// lo que un archivo ya trae agrupado (un quinquenio escrito, un grupo CIIU de 3 dígitos).

import ciiu from "./fabrica/ciiu.json";
import ciiu5 from "./fabrica/ciiu5.json";
import divipola from "./fabrica/divipola.json";

import type { HallazgoDeColumna } from "../clasificador";
import type { TablaColumnar } from "../columnar";
import { esColumnaCiiu } from "./sugerencia";
import type { Nivel } from "./tipos";

export type JerarquiaDeFabrica = "divipola" | "edad-dane" | "ciiu" | "ciiu5";

/** Mayúsculas, sin tildes ni espacios de más: «Bogotá, D.C.» y «BOGOTA, D.C.» son la misma clave. */
export function claveDeNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── DIVIPOLA ────────────────────────────────────────────────────────────────────────────────────

interface Departamento {
  readonly codigo: string;
  readonly nombre: string;
  readonly region: string;
}

interface TablasDivipola {
  readonly departamentoPorCodigo: ReadonlyMap<string, Departamento>;
  readonly departamentoPorNombre: ReadonlyMap<string, Departamento>;
  readonly departamentoDeMunicipio: ReadonlyMap<string, Departamento>;
  /** Solo los nombres de municipio que existen UNA vez en el país. */
  readonly departamentoPorMunicipioUnico: ReadonlyMap<string, Departamento>;
}

let tablasDivipola: TablasDivipola | null = null;

function cargarDivipola(): TablasDivipola {
  if (tablasDivipola) return tablasDivipola;
  const porCodigo = new Map<string, Departamento>();
  const porNombre = new Map<string, Departamento>();
  for (const [codigo, nombre, region] of divipola.departamentos as [
    string,
    string,
    string,
  ][]) {
    const d = { codigo, nombre, region };
    porCodigo.set(codigo, d);
    porNombre.set(claveDeNombre(nombre), d);
  }
  const deMunicipio = new Map<string, Departamento>();
  const porNombreDeMunicipio = new Map<string, Departamento | null>();
  for (const [codigo, nombre, depto] of divipola.municipios as [
    string,
    string,
    string,
  ][]) {
    const d = porCodigo.get(depto);
    if (!d) continue;
    deMunicipio.set(codigo, d);
    const clave = claveDeNombre(nombre);
    // Un nombre visto en dos departamentos queda marcado como ambiguo (`null`) y no se usa.
    const previo = porNombreDeMunicipio.get(clave);
    porNombreDeMunicipio.set(
      clave,
      previo === undefined || previo === d ? d : null,
    );
  }
  const unicos = new Map<string, Departamento>();
  for (const [clave, d] of porNombreDeMunicipio)
    if (d !== null) unicos.set(clave, d);
  tablasDivipola = {
    departamentoPorCodigo: porCodigo,
    departamentoPorNombre: porNombre,
    departamentoDeMunicipio: deMunicipio,
    departamentoPorMunicipioUnico: unicos,
  };
  return tablasDivipola;
}

/**
 * El departamento de un valor, y cómo escribirlo en el nivel «departamento»: un código sale como
 * código (`05001` → `05`) y un nombre como el nombre oficial del departamento.
 */
function departamentoDe(
  valor: string,
): { departamento: Departamento; comoCodigo: boolean } | null {
  const t = cargarDivipola();
  const limpio = valor.trim();
  if (/^\d{4,5}$/.test(limpio)) {
    const d = t.departamentoDeMunicipio.get(limpio.padStart(5, "0"));
    return d ? { departamento: d, comoCodigo: true } : null;
  }
  if (/^\d{1,2}$/.test(limpio)) {
    const d = t.departamentoPorCodigo.get(limpio.padStart(2, "0"));
    return d ? { departamento: d, comoCodigo: true } : null;
  }
  const clave = claveDeNombre(limpio);
  const d =
    t.departamentoPorNombre.get(clave) ??
    t.departamentoPorMunicipioUnico.get(clave);
  return d ? { departamento: d, comoCodigo: false } : null;
}

// Municipio → departamento → región. El paso a región recibe un código o un nombre de departamento.
const PASOS_DIVIPOLA: readonly Nivel[] = [
  (v) => {
    const d = departamentoDe(v);
    if (!d) return v;
    return d.comoCodigo ? d.departamento.codigo : d.departamento.nombre;
  },
  (v) => departamentoDe(v)?.departamento.region ?? v,
];

// ── Edad (DANE) ─────────────────────────────────────────────────────────────────────────────────

const EDAD = /^\d{1,3}(?:[.,]\d+)?$/;
/** Un rango de edades ya escrito (`35-39`), como lo deja el paso a quinquenio. */
const RANGO_DE_EDAD = /^(\d{1,3})-(\d{1,3})$/;
/**
 * La mayor edad humana verificada es de 122 años (Jeanne Calment, 1875-1997). Más que eso no es una
 * edad sino un error de captura, y meterlo en `100+` sería afirmar algo que el archivo no dice.
 */
const EDAD_MAXIMA = 122;

function edadDe(valor: string): number | null {
  const limpio = valor.trim();
  if (!EDAD.test(limpio)) return null;
  const edad = Math.floor(Number(limpio.replace(",", ".")));
  return edad <= EDAD_MAXIMA ? edad : null;
}

/** El gran grupo de una edad, de un quinquenio o de un rango que cabe entero en uno solo. */
function granGrupoDe(valor: string): string | null {
  const edad = edadDe(valor);
  if (edad !== null) return granGrupo(edad);
  const limpio = valor.trim();
  if (limpio === "100+") return granGrupo(100);
  const rango = RANGO_DE_EDAD.exec(limpio);
  if (!rango) return null;
  const desde = Number(rango[1]);
  const hasta = Number(rango[2]);
  if (desde > hasta || hasta > EDAD_MAXIMA) return null;
  const grupo = granGrupo(desde);
  return granGrupo(hasta) === grupo ? grupo : null;
}

// La escalera de edad sale de UNA fuente, la vigente: las Proyecciones de Población y Estudios
// Demográficos (PPED) del DANE, actualización de julio de 2025 (`fuentes.ts`). No hay tabla que
// bajar: la serie va por edades simples de 0 a 99 con un grupo abierto de «100 años y más», y los
// quinquenios son su agregación de cinco en cinco; los grandes grupos son los de su nota técnica
// (Tabla 3: «0 a 14 años», «15 a 59 años», «60 años y más»). El censo de 2018 usaba 15-64 y 65+; las
// proyecciones vigentes, 15-59 y 60+, y esas son las que Velo cita.

/** Quinquenios `0-4` … `95-99` y `100+`: las edades simples de las PPED, de cinco en cinco. */
export function quinquenio(edad: number): string {
  if (edad >= 100) return "100+";
  const piso = Math.floor(edad / 5) * 5;
  return `${piso}-${piso + 4}`;
}

/** Los grandes grupos de edad de las PPED del DANE (nota técnica de julio de 2025): 0-14, 15-59 y 60+. */
export function granGrupo(edad: number): string {
  if (edad < 15) return "0-14";
  if (edad < 60) return "15-59";
  return "60+";
}

const PASOS_EDAD: readonly Nivel[] = [
  (v) => {
    const e = edadDe(v);
    return e === null ? v : quinquenio(e);
  },
  (v) => granGrupoDe(v) ?? v,
];

// ── CIIU Rev. 4 A.C. y Rev. 5 A.C. ──────────────────────────────────────────────────────────────
//
// Las dos revisiones tienen la misma forma (secciones por rango de divisiones, y las clases) y se leen
// con el mismo código. NO se traducen entre ellas: la correlativa del DANE es de muchos a muchos, y
// un código de la Rev. 4 no tiene UN código de la Rev. 5 (`ciiu5.meta.json`). Cada columna sube por la
// escalera de la revisión en que está escrita.

interface TablasCiiu {
  readonly clases: ReadonlySet<string>;
  /** Grupos (3 dígitos) y divisiones (2): los prefijos de las clases, porque todo grupo tiene clases. */
  readonly grupos: ReadonlySet<string>;
  readonly seccionDeDivision: ReadonlyMap<string, string>;
}

interface TablaCiiu {
  readonly secciones: readonly (readonly string[])[];
  readonly clases: readonly string[];
}

export type RevisionCiiu = "ciiu" | "ciiu5";

const FUENTES_CIIU: Readonly<Record<RevisionCiiu, TablaCiiu>> = {
  ciiu,
  ciiu5,
};
const tablasCiiu = new Map<RevisionCiiu, TablasCiiu>();

function cargarCiiu(revision: RevisionCiiu): TablasCiiu {
  const hecha = tablasCiiu.get(revision);
  if (hecha) return hecha;
  const fuente = FUENTES_CIIU[revision];
  const seccionDeDivision = new Map<string, string>();
  for (const [seccion, desde, hasta] of fuente.secciones as [
    string,
    string,
    string,
  ][])
    for (let d = Number(desde); d <= Number(hasta); d++)
      seccionDeDivision.set(String(d).padStart(2, "0"), seccion);
  const clases = new Set(fuente.clases);
  const grupos = new Set([...clases].map((c) => c.slice(0, 3)));
  const tablas = { clases, grupos, seccionDeDivision };
  tablasCiiu.set(revision, tablas);
  return tablas;
}

/**
 * La clase CIIU de un valor, o null si no existe en la revisión. Tres dígitos se leen como una
 * clase que perdió su cero (`111` → `0111`, lo que hace una hoja de cálculo con una columna
 * numérica), no como un grupo: `141` es la clase 0141, aunque también exista el grupo 141.
 */
function claseDe(valor: string, revision: RevisionCiiu): string | null {
  const limpio = valor.trim();
  if (!/^\d{3,4}$/.test(limpio)) return null;
  const clase = limpio.padStart(4, "0");
  return cargarCiiu(revision).clases.has(clase) ? clase : null;
}

// Clase → grupo → división → sección. Cada paso recibe lo que dejó el anterior.
function pasosCiiu(revision: RevisionCiiu): readonly Nivel[] {
  return [
    (v) => claseDe(v, revision)?.slice(0, 3) ?? v,
    (v) => {
      const limpio = v.trim();
      return cargarCiiu(revision).grupos.has(limpio) ? limpio.slice(0, 2) : v;
    },
    (v) => cargarCiiu(revision).seccionDeDivision.get(v.trim()) ?? v,
  ];
}

const PASOS_CIIU = pasosCiiu("ciiu");
const PASOS_CIIU5 = pasosCiiu("ciiu5");

/** Lo que una columna dice de su revisión: cuántos valores distintos son clase de una sola. */
export interface RevisionDetectada {
  /** Valores distintos que son clase SOLO de la Rev. 4 A.C. */
  readonly soloRev4: number;
  /** Valores distintos que son clase SOLO de la Rev. 5 A.C. */
  readonly soloRev5: number;
  /** Valores distintos que son clase de las dos. */
  readonly enAmbas: number;
  /** La que deciden los exclusivos; null si no deciden (ninguno, o de las dos). */
  readonly revision: RevisionCiiu | null;
}

/**
 * La revisión de la CIIU en que está escrita una columna, por sus códigos EXCLUSIVOS: los que solo
 * existen en una. Recibe los valores distintos (el worker los tiene; aquí no llega la columna) y
 * devuelve conteos. Si los exclusivos no deciden, no se adivina: `revision` es null.
 */
export function detectarRevisionCiiu(
  distintos: Iterable<string>,
): RevisionDetectada {
  let soloRev4 = 0;
  let soloRev5 = 0;
  let enAmbas = 0;
  const vistas = new Set<string>();
  for (const valor of distintos) {
    const limpio = valor.trim();
    if (!/^\d{3,4}$/.test(limpio)) continue;
    const clase = limpio.padStart(4, "0");
    if (vistas.has(clase)) continue;
    vistas.add(clase);
    const en4 = cargarCiiu("ciiu").clases.has(clase);
    const en5 = cargarCiiu("ciiu5").clases.has(clase);
    if (en4 && en5) enAmbas++;
    else if (en4) soloRev4++;
    else if (en5) soloRev5++;
  }
  const revision =
    soloRev4 > 0 && soloRev5 === 0
      ? "ciiu"
      : soloRev5 > 0 && soloRev4 === 0
        ? "ciiu5"
        : null;
  return { soloRev4, soloRev5, enAmbas, revision };
}

/**
 * El diagnóstico con la revisión de la CIIU de cada columna de actividad económica (S11), contada
 * sobre sus valores distintos. Vive en el worker: recibe el diccionario de cada columna y devuelve
 * el mismo diagnóstico con conteos de más.
 */
export function conRevisionesCiiu<H extends { readonly nombre: string }>(
  columnas: readonly H[],
  valoresDe: (posicion: number) => Iterable<string>,
): (H & { revisionCiiu?: RevisionDetectada })[] {
  return columnas.map((h, i) =>
    esColumnaCiiu(h.nombre)
      ? { ...h, revisionCiiu: detectarRevisionCiiu(valoresDe(i)) }
      : h,
  );
}

/** Lo mismo sobre una tabla en memoria: los distintos de cada columna son su diccionario. */
export function conRevisionesDeLaTabla<
  D extends { readonly columnas: readonly HallazgoDeColumna[] },
>(diagnostico: D, tabla: TablaColumnar): D {
  return {
    ...diagnostico,
    columnas: conRevisionesCiiu(
      diagnostico.columnas,
      (i) => tabla.columnas[i].valores,
    ),
  };
}

/** Los pasos de una jerarquía de fábrica, sin el `*` final (lo pone `index.ts`, igual para todas). */
export function pasosDeFabrica(tipo: JerarquiaDeFabrica): readonly Nivel[] {
  switch (tipo) {
    case "divipola":
      return PASOS_DIVIPOLA;
    case "edad-dane":
      return PASOS_EDAD;
    case "ciiu":
      return PASOS_CIIU;
    case "ciiu5":
      return PASOS_CIIU5;
  }
}
