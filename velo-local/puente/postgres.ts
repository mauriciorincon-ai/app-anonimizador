// PostgreSQL (`pg`, MIT). Ver `./motor.ts` para las reglas.

import pg from "pg";

import {
  COLUMNA_DE_FILA,
  tandas,
  traducir,
  type ColumnaDeTabla,
  type Conexion,
  type TablaValidada,
} from "./motor";

/** Un identificador entre comillas dobles. Ya existe en la base; las comillas internas se duplican. */
export const citar = (nombre: string) => `"${nombre.replaceAll('"', '""')}"`;
const tabla = (esquema: string, nombre: string) =>
  `${citar(esquema)}.${citar(nombre)}`;

/** Lo que PostgreSQL admite por sentencia es 65 535 parámetros; se queda lejos. */
const PARAMETROS_POR_SENTENCIA = 30_000;

export async function conectarPostgres(url: string): Promise<Conexion> {
  const cliente = new pg.Client({ connectionString: url });
  try {
    await cliente.connect();
    // Que el texto de cada valor sea el mismo en cualquier servidor: fechas ISO, flotantes con toda
    // su precisión, hora UTC y bytes en hexadecimal. Sin esto, «los mismos bytes» dependería de cómo
    // tenga configurada la sesión el administrador de la base.
    await cliente.query("SET DateStyle = 'ISO, YMD'");
    await cliente.query("SET extra_float_digits = 3");
    await cliente.query("SET TimeZone = 'UTC'");
    await cliente.query("SET bytea_output = 'hex'");
    await cliente.query("SET IntervalStyle = 'iso_8601'");
  } catch (error) {
    await cliente.end().catch(() => {});
    throw traducir(error);
  }
  const nombre = (await cliente.query("SELECT current_database()")).rows[0]
    .current_database as string;

  const consultar = async (
    text: string,
    values: readonly unknown[] = [],
  ): Promise<(string | null)[][]> => {
    try {
      const r = await cliente.query({
        text,
        values: values as unknown[],
        rowMode: "array",
      });
      return r.rows as (string | null)[][];
    } catch (error) {
      throw traducir(error);
    }
  };

  const conexion: Conexion = {
    motor: "postgres",
    baseDeDatos: nombre,

    async tablas() {
      const filas = await consultar(
        `SELECT DISTINCT tc.table_schema, tc.table_name
           FROM information_schema.table_constraints tc
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY 1, 2`,
      );
      return filas.map(([esquema, t]) => ({ esquema: esquema!, tabla: t! }));
    },

    async describir(esquema, t) {
      const columnas = (
        await consultar(
          `SELECT column_name, data_type FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
          [esquema, t],
        )
      ).map(([n, tipo]): ColumnaDeTabla => ({ nombre: n!, tipo: tipo! }));
      const llave = (
        await consultar(
          `SELECT kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name
              AND kcu.constraint_schema = tc.constraint_schema
              AND kcu.table_schema = tc.table_schema
              AND kcu.table_name = tc.table_name
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = $1 AND tc.table_name = $2
            ORDER BY kcu.ordinal_position`,
          [esquema, t],
        )
      ).map(([n]) => n!);
      return { columnas, llave };
    },

    async existe(esquema, t) {
      const filas = await consultar(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [esquema, t],
      );
      return filas.length > 0;
    },

    async empezar() {
      // Una foto de la base: las pasadas leen la misma tabla varias veces y tienen que ver lo mismo.
      await consultar("BEGIN ISOLATION LEVEL REPEATABLE READ");
    },

    async leer(t: TablaValidada, despuesDe, cuantas) {
      // Toda columna va CALIFICADA con el alias de la tabla (`t."id"`): en PostgreSQL, un `ORDER BY
      // "id"` a secas se resuelve primero contra el nombre de la columna de SALIDA, y la de salida
      // es `"id"::text`: el orden sería el del texto (1, 10, 100…) y no el de la llave, mientras el
      // filtro del paginado compara la columna de verdad. Calificar las dos cosas lo evita.
      const de = (n: string) => `t.${citar(n)}`;
      const lista = [...t.columnas.map((c) => c.nombre), ...t.llave]
        .map((n) => `${de(n)}::text`)
        .join(", ");
      const orden = t.llave.map(de).join(", ");
      let filtro = "";
      const valores: string[] = [];
      if (despuesDe) {
        // Comparación de FILAS: sirve para llaves compuestas y usa el índice de la llave.
        filtro = `WHERE (${orden}) > (${t.llave.map((_, i) => `$${i + 1}`).join(", ")})`;
        valores.push(...despuesDe);
      }
      return consultar(
        `SELECT ${lista} FROM ${tabla(t.esquema, t.tabla)} AS t ${filtro} ORDER BY ${orden} LIMIT ${Math.trunc(cuantas)}`,
        valores,
      );
    },

    async crear(esquema, t, columnas, reemplazar) {
      if (reemplazar)
        await consultar(`DROP TABLE IF EXISTS ${tabla(esquema, t)}`);
      await consultar(
        `CREATE TABLE ${tabla(esquema, t)} (${[
          `${citar(COLUMNA_DE_FILA)} bigint PRIMARY KEY`,
          ...columnas.map((c) => `${citar(c)} text`),
        ].join(", ")})`,
      );
    },

    async insertar(esquema, t, columnas, primeraFila, filas) {
      const ancho = columnas.length + 1;
      const porTanda = Math.max(
        1,
        Math.floor(PARAMETROS_POR_SENTENCIA / ancho),
      );
      let fila = primeraFila;
      for (const tanda of tandas(filas, porTanda)) {
        const valores: (string | null)[] = [];
        const grupos = tanda.map((f, i) => {
          valores.push(
            String(fila + i),
            ...f.map((v) => (v === "" ? null : v)),
          );
          return `(${Array.from({ length: ancho }, (_, c) => `$${i * ancho + c + 1}`).join(", ")})`;
        });
        fila += tanda.length;
        await consultar(
          `INSERT INTO ${tabla(esquema, t)} (${[COLUMNA_DE_FILA, ...columnas].map(citar).join(", ")}) VALUES ${grupos.join(", ")}`,
          valores,
        );
      }
    },

    async terminar() {
      await consultar("COMMIT");
    },

    async deshacer() {
      await cliente.query("ROLLBACK").catch(() => {});
    },

    async cerrar() {
      await cliente.end().catch(() => {});
    },
  };
  return conexion;
}
