// JSON como tercer formato (S6) — los tipos que comparten el motor, el worker y la interfaz.
//
// Un JSON no es una tabla: Velo lo lee con un lector PROPIO (no `JSON.parse`) y lo vuelve columnas
// cuyo nombre es la RUTA de cada valor (`paciente.contacto.correo`). Lo que no cabe en una columna
// —las listas— no se aplana en silencio: se DECLARA (`EstructuraJson.noTratadas`) y se copia tal cual.
// El modelo y sus límites están en `decisions/011-json.md`.

/**
 * Qué era una celda en el original. La tabla columnar solo guarda cadenas (código 0 = vacío), así que
 * esto es lo único que recuerda la diferencia entre un número y un texto, y entre «ausente», `null`
 * y `""`. La tabla TRANSFORMADA manda: la clase solo decide cómo se escribe una celda que quedó
 * vacía y si una celda NO cambiada va con comillas.
 */
export const CLASE_DE_CELDA = {
  ausente: 0,
  texto: 1,
  /** El valor de la tabla es el TEXTO CRUDO del número (`1E3`, `12345678901234567890`). */
  numero: 2,
  verdadero: 3,
  falso: 4,
  nulo: 5,
} as const;
export type ClaseDeCelda = (typeof CLASE_DE_CELDA)[keyof typeof CLASE_DE_CELDA];

/** `arreglo`: un `[ {…}, {…} ]`. `lineas`: JSON Lines (un objeto por línea). */
export type FormaJson = "arreglo" | "lineas";

/** Los tipos que Velo distingue al describir una ruta. */
export type TipoJson =
  "texto" | "numero" | "booleano" | "nulo" | "objeto" | "lista";

/** Por qué un archivo JSON no se puede tratar. Son CLAVES: el error jamás cita contenido. */
export type MotivoJson =
  | "json-invalido"
  | "json-no-es-registros"
  | "json-demasiado-profundo"
  | "json-demasiado-ancho"
  | "json-claves-duplicadas"
  | "json-excede-tope";

/**
 * El único error que lanza el lector. `message` es la clave del motivo y nada más: ni un trozo del
 * archivo, ni el nombre de una clave (los mensajes de `JSON.parse` citan el contenido; este no).
 * `linea` es la línea (1-based) donde se vio el problema, o null si no hay una (un arreglo en una
 * sola línea sigue teniendo línea 1).
 */
export class ErrorDeJson extends Error {
  readonly motivo: MotivoJson;
  readonly linea: number | null;
  constructor(motivo: MotivoJson, linea: number | null) {
    super(motivo);
    this.name = "ErrorDeJson";
    this.motivo = motivo;
    this.linea = linea;
  }
}

/** Topes duros del lector. Los mismos valen en el worker y en la interfaz. */
export interface TopesJson {
  /** Rutas distintas (columnas) que se admiten. */
  readonly rutas: number;
  /** Registros × rutas: lo que de verdad ocupa la memoria. */
  readonly celdas: number;
  /** Niveles de anidamiento de un registro. */
  readonly profundidad: number;
  /** Largo máximo de una clave, en caracteres. */
  readonly largoDeClave: number;
  /** Largo máximo de un valor de texto, en caracteres. */
  readonly largoDeTexto: number;
}

export const TOPES_JSON: TopesJson = {
  rutas: 256,
  celdas: 40_000_000,
  profundidad: 32,
  largoDeClave: 256,
  largoDeTexto: 1_048_576,
};

/** Una lista dentro de un registro: no es una columna, se declara y se copia cruda. */
export type MotivoNoTratada = "lista" | "lista-de-objetos";

export interface RutaNoTratada {
  /** Con `[]` al final: `contactos[]`. */
  readonly ruta: string;
  readonly motivo: MotivoNoTratada;
  /** En cuántos registros aparece. */
  readonly registros: number;
  /**
   * Hasta 8 sub-rutas que se vieron dentro de la lista (`contactos[].correo`): son NOMBRES de
   * campo, jamás valores, y le dicen a quien mira qué puede llevar la lista sin tratar.
   */
  readonly pistas: readonly string[];
}

/** Una ruta que no está en todos los registros, o que cambia de tipo de un registro a otro. */
export interface RutaHeterogenea {
  readonly ruta: string;
  /** En cuántos registros aparece. */
  readonly presencia: number;
  /** Los tipos distintos que tomó, en orden alfabético. */
  readonly tipos: readonly TipoJson[];
}

/** Lo que el diagnóstico enseña de un JSON, y lo único de él que cruza el worker. */
export interface EstructuraJson {
  readonly forma: FormaJson;
  readonly registros: number;
  /** Rutas que son columna (se tratan). */
  readonly rutasTratadas: number;
  readonly noTratadas: readonly RutaNoTratada[];
  readonly heterogeneas: readonly RutaHeterogenea[];
  /** El nivel más profundo que se vio (un registro plano = 1). */
  readonly profundidad: number;
}
