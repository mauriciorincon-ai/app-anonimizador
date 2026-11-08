// EL PUENTE CONTRA LOS MOTORES DE VERDAD (S9, ADR-017) — el job `puente` de la CI.
//
// PostgreSQL 17 y SQL Server 2022 en contenedor, con una tabla del generador sembrado. Las mismas
// operaciones que `tests/unit/puente.test.ts` hace contra PGlite, pero por los dos drivers reales y
// con tipos que no son texto (DATE, INT): lo que se comprueba aquí es lo que solo un motor real
// puede contestar, sobre todo para SQL Server, que no se instala en el Mac del usuario.
//
// Las huellas salen del propio puente (`huellaDeTabla`), no de un oráculo escrito a mano para cada
// motor: la de la tabla de origen antes y después, y la de la tabla restaurada contra la original.
//
// En la CI las DOS variables existen; si falta una, la prueba FALLA (un `skipped` no es un verde,
// regla 15). Localmente: `VELO_PUENTE_PG=$(…kit:base…) pnpm test:puente`.

import pg from "pg";
import sql from "mssql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { exportarPolitica, type Politica } from "@/engine/politica";
import { derivarLlave, type LlaveDeProyecto } from "@/lib/llave";

import { conectar } from "../../velo-local/puente/conectar";
import type { Conexion, Motor } from "../../velo-local/puente/motor";
import {
  anonimizarTabla,
  huellaDeTabla,
  restaurarTabla,
  validarTabla,
} from "../../velo-local/puente/tabla";
import { ErrorDeVelo } from "../../velo-local/textos";

const URL_DE: Record<Motor, string | undefined> = {
  postgres: process.env.VELO_PUENTE_PG,
  mssql: process.env.VELO_PUENTE_MSSQL,
};
const MOTORES = (Object.keys(URL_DE) as Motor[]).filter((m) => URL_DE[m]);

const SAL = "00112233445566778899aabbccddeeff";
const FECHA = "7 de noviembre de 2026";
const TABLA = "velo_prueba";
/** Una tabla que ningún otro trabajo de la CI toca; se borra al empezar y al terminar. */
const NOMBRES = [
  TABLA,
  `${TABLA}__velo`,
  `${TABLA}__restaurada`,
  "velo_sin_llave",
  "velo_llave_binaria",
];

/** S10: 12 000 filas con llave BINARIA (más de dos lotes de 5 000), hechas por el propio motor. */
const LLAVE_BINARIA = {
  postgres: `CREATE TABLE public.velo_llave_binaria (k bytea PRIMARY KEY, b text);
    INSERT INTO public.velo_llave_binaria
      SELECT decode(lpad(to_hex(g), 8, '0'), 'hex'), 'b' || g FROM generate_series(1, 12000) g`,
  mssql: `CREATE TABLE dbo.velo_llave_binaria (k varbinary(16) NOT NULL PRIMARY KEY, b nvarchar(max));
    WITH n AS (SELECT TOP (12000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS g
      FROM sys.all_objects a CROSS JOIN sys.all_objects b)
    INSERT INTO dbo.velo_llave_binaria SELECT CAST(CAST(g AS int) AS binary(4)), CONCAT('b', g) FROM n`,
} as const;

const SOLO_REVERSIBLES: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "cedula_titular",
      tecnica: {
        tipo: "seudonimizar-con-formato",
        formato: "cedula",
        reversible: true,
      },
    },
    {
      columna: "correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
  ],
};
const CON_TODO: Politica = {
  ...SOLO_REVERSIBLES,
  reglas: [
    ...SOLO_REVERSIBLES.reglas,
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
  ],
};

let llave: LlaveDeProyecto;
beforeAll(async () => {
  llave = await derivarLlave("una frase larga del job puente", SAL);
});

describe("las variables del job", () => {
  it("en la CI están las dos bases (un skipped no es un verde)", () => {
    if (process.env.CI) expect(MOTORES.sort()).toEqual(["mssql", "postgres"]);
    else
      expect(
        MOTORES.length,
        "define VELO_PUENTE_PG y/o VELO_PUENTE_MSSQL",
      ).toBeGreaterThan(0);
  });
});

/** Lo único propio de cada motor en la prueba: preparar y limpiar. Lo demás va por el puente. */
interface Preparador {
  exec(sentencia: string, valores?: (string | null)[]): Promise<void>;
  /** Suelta la conexión de preparación: el kit de base (PGlite) admite una sola a la vez. */
  soltar(): Promise<void>;
  cerrar(): Promise<void>;
  /** Comillas del motor, SOLO para armar la tabla de la prueba (nombres fijos). */
  q(nombre: string): string;
  esquema: string;
  tipos: { fecha: string; entero: string; texto: string; llave: string };
}

async function preparar(motor: Motor): Promise<Preparador> {
  const url = URL_DE[motor]!;
  if (motor === "postgres") {
    let c: pg.Client | null = null;
    return {
      async exec(s, v = []) {
        if (!c) {
          c = new pg.Client({ connectionString: url });
          await c.connect();
        }
        await c.query(s, v);
      },
      async soltar() {
        await c?.end();
        c = null;
      },
      async cerrar() {
        await c?.end();
        c = null;
      },
      q: (n) => `"${n}"`,
      esquema: "public",
      tipos: {
        fecha: "date",
        entero: "integer",
        texto: "text",
        llave: "integer",
      },
    };
  }
  const u = new URL(url.replace(/^sqlserver:/i, "mssql:"));
  const config: sql.config = {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    server: u.hostname,
    port: Number(u.port || 1433),
    database: u.pathname.slice(1) || undefined,
    options: { encrypt: true, trustServerCertificate: true },
  };
  // SQL Server tarda en aceptar conexiones después de que el contenedor «arranca».
  let pool: sql.ConnectionPool | null = null;
  for (let intento = 0; intento < 40 && !pool; intento++) {
    try {
      pool = await new sql.ConnectionPool(config).connect();
    } catch {
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  if (!pool) throw new Error("SQL Server no aceptó conexiones en 2 minutos");
  return {
    async exec(s, v = []) {
      const r = pool!.request();
      v.forEach((x, i) => r.input(`p${i}`, sql.NVarChar(sql.MAX), x));
      await r.query(s);
    },
    soltar: async () => {},
    cerrar: () => pool!.close(),
    q: (n) => `[${n}]`,
    esquema: "dbo",
    tipos: {
      fecha: "date",
      entero: "int",
      texto: "nvarchar(max)",
      llave: "int",
    },
  };
}

async function sembrar(p: Preparador, motor: Motor): Promise<string[]> {
  for (const n of NOMBRES)
    await p.exec(`DROP TABLE IF EXISTS ${p.q(p.esquema)}.${p.q(n)}`);
  const generadas = generarFilas({
    filas: 600,
    seed: 42,
    perfil: "clinico",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  });
  const encabezado = generadas.next().value as string[];
  const tipoDe = (c: string) =>
    c === "fecha_nacimiento"
      ? p.tipos.fecha
      : c === "estrato"
        ? p.tipos.entero
        : p.tipos.texto;
  await p.exec(
    `CREATE TABLE ${p.q(p.esquema)}.${p.q(TABLA)} (${[
      `${p.q("id")} ${p.tipos.llave} NOT NULL PRIMARY KEY`,
      ...encabezado.map((c) => `${p.q(c)} ${tipoDe(c)} NULL`),
    ].join(", ")})`,
  );
  const marca = (i: number) => (motor === "postgres" ? `$${i + 1}` : `@p${i}`);
  let id = 1;
  for (const fila of generadas) {
    // Una fila a la vez: son 600 y la prueba no mide velocidad. «Vacío» entra como NULL.
    const valores: (string | null)[] = [
      String(id++),
      ...fila.map((v: string) => (v === "" ? null : v)),
    ];
    // Las fechas inválidas del generador (tasaInvalida) no caben en una columna DATE: se anulan.
    const i = encabezado.indexOf("fecha_nacimiento") + 1;
    if (valores[i] !== null && Number.isNaN(Date.parse(valores[i]!)))
      valores[i] = null;
    await p.exec(
      `INSERT INTO ${p.q(p.esquema)}.${p.q(TABLA)} VALUES (${valores.map((_, k) => marca(k)).join(", ")})`,
      valores,
    );
  }
  await p.exec(
    `CREATE TABLE ${p.q(p.esquema)}.${p.q("velo_sin_llave")} (a ${p.tipos.texto} NULL)`,
  );
  await p.exec(
    `INSERT INTO ${p.q(p.esquema)}.${p.q("velo_sin_llave")} VALUES (${marca(0)})`,
    ["x"],
  );
  await p.soltar();
  return encabezado;
}

async function conUna<T>(
  motor: Motor,
  f: (c: Conexion) => Promise<T>,
): Promise<T> {
  await preparadorActual?.soltar();
  const c = await conectar(URL_DE[motor]!);
  try {
    return await f(c);
  } finally {
    await c.cerrar();
  }
}

/** La conexión de preparación en uso, para soltarla antes de que el puente abra la suya. */
let preparadorActual: Preparador | null = null;

const clave = (p: Promise<unknown>) =>
  p.then(
    () => "no-fallo",
    (e: unknown) =>
      e instanceof ErrorDeVelo ? e.clave : `otro:${(e as Error).name}`,
  );

for (const motor of MOTORES) {
  describe(`el puente contra ${motor === "postgres" ? "PostgreSQL" : "SQL Server"}`, () => {
    let p: Preparador;
    const pedido = (c: Conexion, tabla: string, extra: object = {}) => ({
      conexion: c,
      esquema: p.esquema,
      tabla,
      idioma: "es" as const,
      fecha: FECHA,
      reemplazar: false,
      ...extra,
    });

    beforeAll(async () => {
      p = await preparar(motor);
      preparadorActual = p;
      await sembrar(p, motor);
    });
    afterAll(async () => {
      for (const n of NOMBRES)
        await p.exec(`DROP TABLE IF EXISTS ${p.q(p.esquema)}.${p.q(n)}`);
      await p.cerrar();
    });

    it("reconoce la tabla por information_schema y su llave primaria", async () => {
      const t = await conUna(motor, (c) => validarTabla(c, p.esquema, TABLA));
      expect(t.llave).toEqual(["id"]);
      expect(t.columnas.map((c) => c.nombre)).toContain("cedula_titular");
      expect(
        t.columnas.find((c) => c.nombre === "fecha_nacimiento")?.tipo,
      ).toBe("date");
    });

    it("anonimiza en una tabla NUEVA y la original queda con la misma huella", async () => {
      const r = await conUna(motor, async (c) => {
        const ida = await anonimizarTabla({
          ...pedido(c, TABLA),
          politica: { texto: exportarPolitica(CON_TODO) },
          llave,
        });
        return ida;
      });
      expect(r.nombreDeLaNueva).toBe(`${TABLA}__velo`);
      expect(r.resultado.filas).toBe(600);
      expect(r.resultado.certificado).toContain(`${p.esquema}.${TABLA}`);
      // La huella del origen, medida otra vez DESPUÉS y desde una conexión nueva.
      const despues = await conUna(motor, async (c) =>
        huellaDeTabla(c, await validarTabla(c, p.esquema, TABLA)),
      );
      expect(despues.sha256).toBe(r.huellaDeOrigen.sha256);
      // La tabla nueva existe, con su columna de fila, y la anonimizada no lleva la cédula original.
      const nueva = await conUna(motor, (c) =>
        validarTabla(c, p.esquema, `${TABLA}__velo`),
      );
      expect(nueva.llave).toEqual(["__velo_fila"]);
      expect(nueva.columnas.map((c) => c.nombre)).not.toContain(
        "nombre_completo",
      );
    });

    it("ida y regreso: la tabla restaurada tiene la huella de la original", async () => {
      const ida = await conUna(motor, (c) =>
        anonimizarTabla({
          ...pedido(c, TABLA, { reemplazar: true }),
          politica: { texto: exportarPolitica(SOLO_REVERSIBLES) },
          llave,
        }),
      );
      expect(ida.resultado.boveda).not.toBeNull();
      const vuelta = await conUna(motor, (c) =>
        restaurarTabla({
          ...pedido(c, `${TABLA}__velo`, { reemplazar: true }),
          boveda: ida.resultado.boveda!,
        }),
      );
      expect(vuelta.nombreDeLaNueva).toBe(`${TABLA}__restaurada`);
      expect(vuelta.restauradas).toBeGreaterThan(0);
      // Los datos restaurados (sin la columna de fila) son la tabla original, celda por celda.
      const restaurada = await conUna(motor, async (c) =>
        huellaDeTabla(
          c,
          await validarTabla(c, p.esquema, `${TABLA}__restaurada`),
        ),
      );
      expect(restaurada.sha256).toBe(ida.huellaDeOrigen.sha256);
    });

    it("se niega: sin llave primaria, tabla inexistente, inyección y destino ya existente", async () => {
      const intentar = (tabla: string, extra: object = {}) =>
        conUna(motor, (c) =>
          anonimizarTabla({
            ...pedido(c, tabla, extra),
            politica: { texto: exportarPolitica(SOLO_REVERSIBLES) },
            llave,
          }),
        );
      expect(await clave(intentar("velo_sin_llave"))).toBe("sinLlavePrimaria");
      expect(await clave(intentar("no_existe"))).toBe("tablaDesconocida");
      expect(await clave(intentar(`${TABLA}"; DROP TABLE ${TABLA}; --`))).toBe(
        "tablaDesconocida",
      );
      expect(await clave(intentar(`${TABLA}]; DROP TABLE ${TABLA}; --`))).toBe(
        "tablaDesconocida",
      );
      expect(await clave(intentar(TABLA))).toBe("tablaDestinoExiste");
      // Y la original sigue ahí, con sus 600 filas.
      const huella = await conUna(motor, async (c) =>
        huellaDeTabla(c, await validarTabla(c, p.esquema, TABLA)),
      );
      expect(huella.filas).toBe(600);
    });

    it("un fallo antes del COMMIT deja la base como estaba (ROLLBACK)", async () => {
      await p.exec(
        `DROP TABLE IF EXISTS ${p.q(p.esquema)}.${p.q(`${TABLA}__velo`)}`,
      );
      const fallo = await clave(
        conUna(motor, (c) =>
          anonimizarTabla({
            ...pedido(c, TABLA),
            politica: { texto: exportarPolitica(SOLO_REVERSIBLES) },
            llave,
            antesDeConfirmar: async () => {
              throw new ErrorDeVelo("yaExiste", { ruta: "x" });
            },
          }),
        ),
      );
      expect(fallo).toBe("yaExiste");
      const existe = await conUna(motor, (c) =>
        c.existe(p.esquema, `${TABLA}__velo`),
      );
      expect(existe).toBe(false);
    });

    it("S10: una llave binaria pagina las 12 000 filas, cada una una vez", async () => {
      await p.exec(LLAVE_BINARIA[motor]);
      await p.soltar();
      const h = await conUna(motor, async (c) =>
        huellaDeTabla(
          c,
          await validarTabla(c, p.esquema, "velo_llave_binaria"),
        ),
      );
      expect(h.filas).toBe(12_000);
    });

    it("un fallo de conexión dice su código y nunca la clave", async () => {
      const mala =
        motor === "postgres"
          ? "postgres://velo:una-clave-secreta@127.0.0.1:1/postgres?sslmode=disable"
          : "mssql://sa:una-clave-secreta@127.0.0.1:1/master?trustServerCertificate=true";
      const error = await conectar(mala).then(
        () => null,
        (e: unknown) => e as ErrorDeVelo,
      );
      expect(error).toBeInstanceOf(ErrorDeVelo);
      expect(error!.clave).toBe("base");
      expect(JSON.stringify([error!.message, error!.datos])).not.toContain(
        "una-clave-secreta",
      );
    });
  });
}
