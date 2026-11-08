// SQL Server (`mssql`, MIT). Ver `./motor.ts` para las reglas.
//
// En el Mac del usuario no se instala SQL Server: la evidencia de este archivo es el job `puente` de
// la CI, contra `mcr.microsoft.com/mssql/server:2022-latest` (`tests/puente/`).

import sql from "mssql";

import {
  COLUMNA_DE_FILA,
  tandas,
  traducir,
  type ColumnaDeTabla,
  type Conexion,
  type TablaValidada,
} from "./motor";

/** Un identificador entre corchetes. Ya existe en la base; el corchete de cierre se duplica. */
export const citar = (nombre: string) => `[${nombre.replaceAll("]", "]]")}]`;
const tabla = (esquema: string, nombre: string) =>
  `${citar(esquema)}.${citar(nombre)}`;

/** SQL Server admite 2 100 parámetros por petición y 1 000 filas por `VALUES`. */
const PARAMETROS_POR_SENTENCIA = 2_000;
const FILAS_POR_VALUES = 1_000;

const FECHAS = new Set([
  "date",
  "datetime",
  "datetime2",
  "smalldatetime",
  "datetimeoffset",
  "time",
]);
const BINARIOS = new Set(["binary", "varbinary", "image", "timestamp"]);
const FLOTANTES = new Set(["float", "real"]);

/**
 * Una columna leída como texto, con la MISMA forma en cualquier servidor: fechas ISO 8601 (estilo
 * 126), binarios en hexadecimal (estilo 1) y flotantes con toda su precisión (estilo 3). El
 * `CAST` a secas de una fecha depende del idioma de la sesión.
 */
function comoTexto(c: ColumnaDeTabla): string {
  const n = `t.${citar(c.nombre)}`;
  const tipo = c.tipo.toLowerCase();
  if (FECHAS.has(tipo)) return `CONVERT(NVARCHAR(40), ${n}, 126)`;
  if (BINARIOS.has(tipo))
    return `CONVERT(NVARCHAR(MAX), CAST(${n} AS VARBINARY(MAX)), 1)`;
  if (FLOTANTES.has(tipo)) return `CONVERT(NVARCHAR(MAX), ${n}, 3)`;
  return `CAST(${n} AS NVARCHAR(MAX))`;
}

/** `mssql://usuario:clave@servidor:1433/base?encrypt=false&trustServerCertificate=true`. */
function configuracion(url: string): sql.config {
  const u = new URL(url.replace(/^sqlserver:/i, "mssql:"));
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    server: u.hostname,
    port: u.port ? Number(u.port) : 1433,
    database: decodeURIComponent(u.pathname.slice(1)) || undefined,
    options: {
      encrypt: u.searchParams.get("encrypt") !== "false",
      trustServerCertificate:
        u.searchParams.get("trustServerCertificate") === "true",
    },
  };
}

export async function conectarSqlServer(url: string): Promise<Conexion> {
  const pool = new sql.ConnectionPool(configuracion(url));
  try {
    await pool.connect();
  } catch (error) {
    await pool.close().catch(() => {});
    throw traducir(error);
  }
  let transaccion: sql.Transaction | null = null;

  const consultar = async (
    text: string,
    parametros: readonly {
      tipo: sql.ISqlTypeFactoryWithNoParams | sql.ISqlType;
      valor: unknown;
    }[] = [],
  ): Promise<(string | null)[][]> => {
    try {
      const peticion = transaccion
        ? new sql.Request(transaccion)
        : pool.request();
      peticion.arrayRowMode = true;
      parametros.forEach((p, i) => peticion.input(`p${i}`, p.tipo, p.valor));
      const r = await peticion.query(text);
      return ((r.recordset ?? []) as unknown as (string | null)[][]).map(
        (f) => [...f],
      );
    } catch (error) {
      throw traducir(error);
    }
  };
  const texto = (valor: string | null) => ({ tipo: sql.NVarChar(sql.MAX), valor });

  const nombre = (await consultar("SELECT DB_NAME()"))[0][0]!;

  const conexion: Conexion = {
    motor: "mssql",
    baseDeDatos: nombre,

    async tablas() {
      const filas = await consultar(
        `SELECT DISTINCT tc.TABLE_SCHEMA, tc.TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          ORDER BY 1, 2`,
      );
      return filas.map(([esquema, t]) => ({ esquema: esquema!, tabla: t! }));
    },

    async describir(esquema, t) {
      const columnas = (
        await consultar(
          `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = @p0 AND TABLE_NAME = @p1 ORDER BY ORDINAL_POSITION`,
          [texto(esquema), texto(t)],
        )
      ).map(([n, tipo]): ColumnaDeTabla => ({ nombre: n!, tipo: tipo! }));
      const llave = (
        await consultar(
          `SELECT kcu.COLUMN_NAME
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
               ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
              AND kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
              AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
              AND kcu.TABLE_NAME = tc.TABLE_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
              AND tc.TABLE_SCHEMA = @p0 AND tc.TABLE_NAME = @p1
            ORDER BY kcu.ORDINAL_POSITION`,
          [texto(esquema), texto(t)],
        )
      ).map(([n]) => n!);
      return { columnas, llave };
    },

    async existe(esquema, t) {
      const filas = await consultar(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @p0 AND TABLE_NAME = @p1`,
        [texto(esquema), texto(t)],
      );
      return filas.length > 0;
    },

    async empezar() {
      try {
        transaccion = new sql.Transaction(pool);
        await transaccion.begin();
      } catch (error) {
        transaccion = null;
        throw traducir(error);
      }
    },

    async leer(t: TablaValidada, despuesDe, cuantas) {
      const porNombre = new Map(t.columnas.map((c) => [c.nombre, c]));
      // La llave puede ser la columna de fila de Velo, que no es de datos: es un BIGINT.
      const comoTextoLlave = (n: string) =>
        porNombre.has(n)
          ? comoTexto(porNombre.get(n)!)
          : `CAST(t.${citar(n)} AS NVARCHAR(MAX))`;
      const lista = [
        ...t.columnas.map(comoTexto),
        ...t.llave.map(comoTextoLlave),
      ].join(", ");
      const orden = t.llave.map((n) => `t.${citar(n)}`).join(", ");
      let filtro = "";
      const parametros: {
        tipo: ReturnType<typeof sql.NVarChar>;
        valor: string | null;
      }[] = [];
      if (despuesDe) {
        // SQL Server no compara filas: «a > x  O  (a = x  Y  b > y)  O …», una rama por columna.
        const ramas = t.llave.map((_, i) => {
          const iguales = t.llave
            .slice(0, i)
            .map((n, j) => `t.${citar(n)} = @p${j}`);
          return `(${[...iguales, `t.${citar(t.llave[i])} > @p${i}`].join(" AND ")})`;
        });
        filtro = `WHERE ${ramas.join(" OR ")}`;
        parametros.push(...despuesDe.map(texto));
      }
      return consultar(
        `SELECT TOP (${Math.trunc(cuantas)}) ${lista} FROM ${tabla(t.esquema, t.tabla)} AS t ${filtro} ORDER BY ${orden}`,
        parametros,
      );
    },

    async crear(esquema, t, columnas, reemplazar) {
      const completo = tabla(esquema, t);
      if (reemplazar)
        await consultar(
          `IF OBJECT_ID(N'${completo.replaceAll("'", "''")}', N'U') IS NOT NULL DROP TABLE ${completo}`,
        );
      await consultar(
        `CREATE TABLE ${completo} (${[
          `${citar(COLUMNA_DE_FILA)} BIGINT NOT NULL PRIMARY KEY`,
          ...columnas.map((c) => `${citar(c)} NVARCHAR(MAX) NULL`),
        ].join(", ")})`,
      );
    },

    async insertar(esquema, t, columnas, primeraFila, filas) {
      const ancho = columnas.length + 1;
      const porTanda = Math.max(
        1,
        Math.min(
          FILAS_POR_VALUES,
          Math.floor(PARAMETROS_POR_SENTENCIA / ancho),
        ),
      );
      let fila = primeraFila;
      for (const tanda of tandas(filas, porTanda)) {
        const parametros: {
          tipo: sql.ISqlTypeFactoryWithNoParams | sql.ISqlType;
          valor: unknown;
        }[] = [];
        const grupos = tanda.map((f, i) => {
          parametros.push({ tipo: sql.BigInt, valor: fila + i });
          // El vacío es NULL: el CSV no distingue «vacío» de «sin valor», y Velo no inventa la diferencia.
          for (const v of f) parametros.push(texto(v === "" ? null : v));
          return `(${Array.from({ length: ancho }, (_, c) => `@p${i * ancho + c}`).join(", ")})`;
        });
        fila += tanda.length;
        await consultar(
          `INSERT INTO ${tabla(esquema, t)} (${[COLUMNA_DE_FILA, ...columnas].map(citar).join(", ")}) VALUES ${grupos.join(", ")}`,
          parametros,
        );
      }
    },

    async terminar() {
      try {
        await transaccion?.commit();
      } catch (error) {
        throw traducir(error);
      } finally {
        transaccion = null;
      }
    },

    async deshacer() {
      try {
        await transaccion?.rollback();
      } catch {
        // Ya se había cerrado: no hay nada que deshacer.
      } finally {
        transaccion = null;
      }
    },

    async cerrar() {
      await pool.close().catch(() => {});
    },
  };
  return conexion;
}
