// EL PUENTE A BASES DE DATOS (S9, ADR-017) — lo que un motor de base tiene que saber hacer.
//
// PostgreSQL y SQL Server cumplen la misma interfaz, y todo lo demás (`./tabla.ts`) habla solo con
// ella. Las reglas que no se negocian viven aquí y en los dos drivers:
//
//   · Tabla y columnas SOLO si existen en `information_schema`, y entre las comillas del motor:
//     el nombre que escribió el usuario no llega a una sentencia sin haber sido reconocido por la
//     base. Los VALORES van siempre parametrizados.
//   · Sin llave primaria no hay orden estable de las filas, y sin orden estable no hay los mismos
//     bytes: Velo se niega y lo dice.
//   · Todo el trabajo corre en UNA conexión y UNA transacción: lo que se lee, lo que se escribe y
//     el COMMIT final. Si algo falla, ROLLBACK y no queda nada.
//   · Los errores del driver se reducen a su código: su texto puede traer la conexión o un valor.

import { ErrorDeVelo } from "../textos";

export type Motor = "postgres" | "mssql";

/** El nombre de la columna que Velo agrega a las tablas que escribe: el número de la fila. */
export const COLUMNA_DE_FILA = "__velo_fila";
/** Lo que se le pega al nombre de la tabla de origen para nombrar la nueva. */
export const SUFIJO_ANONIMIZADA = "__velo";
export const SUFIJO_RESTAURADA = "__restaurada";

export interface ColumnaDeTabla {
  readonly nombre: string;
  /** `data_type` de `information_schema`: lo único que se usa es para leerla como texto. */
  readonly tipo: string;
}

/** Una tabla reconocida por la base: lo único con lo que se arman sentencias. */
export interface TablaValidada {
  readonly esquema: string;
  readonly tabla: string;
  /** Las columnas de DATOS, en el orden de la tabla (sin la de fila de Velo, si la lleva). */
  readonly columnas: readonly ColumnaDeTabla[];
  /** La llave primaria, en su orden: es el orden de lectura. */
  readonly llave: readonly string[];
}

export interface Conexion {
  readonly motor: Motor;
  readonly baseDeDatos: string;
  /** Las tablas con llave primaria que el usuario puede leer (para el asistente). */
  tablas(): Promise<{ esquema: string; tabla: string }[]>;
  /** Columnas y llave de `information_schema`; vacías si la tabla no existe o no se puede leer. */
  describir(
    esquema: string,
    tabla: string,
  ): Promise<{
    columnas: ColumnaDeTabla[];
    llave: string[];
  }>;
  existe(esquema: string, tabla: string): Promise<boolean>;
  /** Abre la transacción de todo el trabajo. */
  empezar(): Promise<void>;
  /**
   * Hasta `cuantas` filas después de `despuesDe` (los valores de la llave de la última leída),
   * ordenadas por la llave. Cada celda, como texto; el NULL, como `null`.
   */
  leer(
    tabla: TablaValidada,
    despuesDe: readonly string[] | null,
    cuantas: number,
  ): Promise<(string | null)[][]>;
  /** Crea la tabla nueva: la columna de fila (llave primaria) y una de texto por columna. */
  crear(
    esquema: string,
    tabla: string,
    columnas: readonly string[],
    reemplazar: boolean,
  ): Promise<void>;
  insertar(
    esquema: string,
    tabla: string,
    columnas: readonly string[],
    primeraFila: number,
    filas: readonly (readonly string[])[],
  ): Promise<void>;
  /** COMMIT. */
  terminar(): Promise<void>;
  /** ROLLBACK. No lanza: es lo que corre cuando algo ya falló. */
  deshacer(): Promise<void>;
  cerrar(): Promise<void>;
}

/** Cuántos bytes de nombre admite cada motor (PostgreSQL trunca en silencio; Velo prefiere negarse). */
export const LARGO_MAXIMO_DE_NOMBRE: Record<Motor, number> = {
  postgres: 63,
  mssql: 128,
};

/** El motor de una URL de conexión. */
export function motorDe(url: string): Motor {
  const protocolo = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();
  if (protocolo === "postgres" || protocolo === "postgresql") return "postgres";
  if (protocolo === "mssql" || protocolo === "sqlserver") return "mssql";
  throw new ErrorDeVelo("motorDesconocido");
}

/** `esquema.tabla`, o solo `tabla` (con el esquema por defecto del motor). */
export function partirTabla(
  pedida: string,
  motor: Motor,
): { esquema: string; tabla: string } {
  const partes = pedida.split(".");
  if (partes.length === 1 && partes[0])
    return {
      esquema: motor === "postgres" ? "public" : "dbo",
      tabla: partes[0],
    };
  if (partes.length === 2 && partes[0] && partes[1])
    return { esquema: partes[0], tabla: partes[1] };
  throw new ErrorDeVelo("tablaDesconocida", { tabla: pedida });
}

/**
 * Un error del driver, reducido a su código (SQLSTATE de PostgreSQL, `E…` de red, número de SQL
 * Server). Jamás el texto: puede traer la URL de conexión, un nombre o un valor.
 */
export function traducir(error: unknown): Error {
  if (error instanceof ErrorDeVelo) return error;
  const e = error as { code?: unknown; number?: unknown } | null;
  const codigo = e?.code ?? e?.number;
  return new ErrorDeVelo("base", {
    codigo:
      typeof codigo === "string" || typeof codigo === "number"
        ? String(codigo)
        : "?",
  });
}

/** Reparte las filas en tandas de a lo más `max`. */
export function* tandas<T>(filas: readonly T[], max: number): Generator<T[]> {
  for (let i = 0; i < filas.length; i += max) yield filas.slice(i, i + max);
}
