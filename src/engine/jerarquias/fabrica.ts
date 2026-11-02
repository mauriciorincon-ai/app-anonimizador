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
import divipola from "./fabrica/divipola.json";

import type { Nivel } from "./tipos";

export type JerarquiaDeFabrica = "divipola" | "edad-dane" | "ciiu";

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

// ── CIIU Rev. 4 A.C. ────────────────────────────────────────────────────────────────────────────

interface TablasCiiu {
  readonly clases: ReadonlySet<string>;
  /** Grupos (3 dígitos) y divisiones (2): los prefijos de las clases, porque todo grupo tiene clases. */
  readonly grupos: ReadonlySet<string>;
  readonly seccionDeDivision: ReadonlyMap<string, string>;
}

let tablasCiiu: TablasCiiu | null = null;

function cargarCiiu(): TablasCiiu {
  if (tablasCiiu) return tablasCiiu;
  const seccionDeDivision = new Map<string, string>();
  for (const [seccion, desde, hasta] of ciiu.secciones as [
    string,
    string,
    string,
  ][])
    for (let d = Number(desde); d <= Number(hasta); d++)
      seccionDeDivision.set(String(d).padStart(2, "0"), seccion);
  const clases = new Set(ciiu.clases as string[]);
  const grupos = new Set([...clases].map((c) => c.slice(0, 3)));
  tablasCiiu = { clases, grupos, seccionDeDivision };
  return tablasCiiu;
}

/**
 * La clase CIIU de un valor, o null si no existe en la clasificación. Tres dígitos se leen como una
 * clase que perdió su cero (`111` → `0111`, lo que hace una hoja de cálculo con una columna
 * numérica), no como un grupo: `141` es la clase 0141, aunque también exista el grupo 141.
 */
function claseDe(valor: string): string | null {
  const limpio = valor.trim();
  if (!/^\d{3,4}$/.test(limpio)) return null;
  const clase = limpio.padStart(4, "0");
  return cargarCiiu().clases.has(clase) ? clase : null;
}

// Clase → grupo → división → sección. Cada paso recibe lo que dejó el anterior.
const PASOS_CIIU: readonly Nivel[] = [
  (v) => claseDe(v)?.slice(0, 3) ?? v,
  (v) => {
    const limpio = v.trim();
    return cargarCiiu().grupos.has(limpio) ? limpio.slice(0, 2) : v;
  },
  (v) => cargarCiiu().seccionDeDivision.get(v.trim()) ?? v,
];

/** Los pasos de una jerarquía de fábrica, sin el `*` final (lo pone `index.ts`, igual para todas). */
export function pasosDeFabrica(tipo: JerarquiaDeFabrica): readonly Nivel[] {
  switch (tipo) {
    case "divipola":
      return PASOS_DIVIPOLA;
    case "edad-dane":
      return PASOS_EDAD;
    case "ciiu":
      return PASOS_CIIU;
  }
}
