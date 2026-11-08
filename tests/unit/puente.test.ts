// @vitest-environment node
//
// EL PUENTE A BASES DE DATOS (S9, ADR-017), contra PostgreSQL de verdad: PGlite en este proceso, con
// el driver `pg` real hablando por un socket en 127.0.0.1 (puerto libre, cerrado al terminar).
// SQL Server tiene la misma interfaz y su evidencia es el job `puente` de la CI (`tests/puente/`).
//
// Lo que se prueba, en el orden en que importa:
//   · la tabla es un archivo: el mismo tratamiento da los MISMOS bytes que sobre el CSV de esa tabla;
//   · la tabla de origen no se toca (huella antes y después, medida por fuera del puente);
//   · ida y regreso: lo restaurado es la tabla original;
//   · nada se inyecta por un nombre; sin llave primaria se niega; no pisa; no deja una tabla a medias;
//   · la conexión no sale en ningún mensaje.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { levantarKitDeBase } from "../../docs/kit-de-prueba/kit-base.mjs";
import { serializarBoveda } from "@/engine/boveda";
import { filaDeCsv } from "@/engine/csv";
import { exportarPolitica, type Politica } from "@/engine/politica";
import { abrirBoveda } from "@/lib/boveda-archivo";
import { derivarLlave, type LlaveDeProyecto } from "@/lib/llave";
import { sha256 } from "@/lib/sha256";

import { principal } from "../../velo-local/cli";
import { anonimizar, DestinoConHuella, leer } from "../../velo-local/nucleo";
import { conectar } from "../../velo-local/puente/conectar";
import type { Conexion } from "../../velo-local/puente/motor";
import {
  anonimizarTabla,
  huellaDeTabla,
  restaurarTabla,
  validarTabla,
} from "../../velo-local/puente/tabla";
import { ErrorDeVelo } from "../../velo-local/textos";

const SAL = "00112233445566778899aabbccddeeff";
const FRASE = "una frase larga del puente";
const FRASE_DE_BOVEDA = "la frase de la boveda del puente";
const FECHA = "7 de noviembre de 2026";

/** Cédula y correo reversibles, más una técnica de cada familia (con ruido: depende de la huella). */
const POLITICA: Politica = {
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
    { columna: "celular", tecnica: { tipo: "enmascarar" } },
    {
      columna: "fecha_nacimiento",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    { columna: "nombre_completo", tecnica: { tipo: "suprimir" } },
    {
      columna: "monto",
      tecnica: {
        tipo: "laplace",
        epsilon: 1,
        minimo: 0,
        maximo: 10_000_000,
        decimales: 0,
      },
    },
  ],
};
/** Solo reversibles: lo restaurado tiene que ser la tabla original. */
const SOLO_REVERSIBLES: Politica = {
  ...POLITICA,
  reglas: POLITICA.reglas.slice(0, 2),
};

let kit: Awaited<ReturnType<typeof levantarKitDeBase>>;
let llave: LlaveDeProyecto;
let carpeta: string;
let admin: pg.Client;
let conexion: Conexion;

const texto = (politica: Politica) => ({ texto: exportarPolitica(politica) });

/** El volcado de una tabla como el CSV canónico, medido por FUERA del puente (con un cliente propio). */
async function volcado(
  esquema: string,
  tabla: string,
  sinFila = false,
): Promise<string> {
  const cols = (
    await admin.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
      [esquema, tabla],
    )
  ).rows
    .map((r) => r.column_name as string)
    .filter((c) => !(sinFila && c === "__velo_fila"));
  const orden = sinFila ? '"__velo_fila"' : '"id"';
  const filas = (
    await admin.query({
      // Calificadas con el alias: un `ORDER BY "id"` a secas ordenaría por la columna de SALIDA (texto).
      text: `SELECT ${cols.map((c) => `t."${c}"::text`).join(", ")} FROM "${esquema}"."${tabla}" AS t ORDER BY t.${orden}`,
      rowMode: "array",
    })
  ).rows as (string | null)[][];
  return [cols, ...filas.map((f) => f.map((v) => v ?? ""))]
    .map(filaDeCsv)
    .join("");
}

beforeAll(async () => {
  kit = await levantarKitDeBase({ filas: 400, seed: 42, puerto: 0 });
  llave = await derivarLlave(FRASE, SAL);
  carpeta = mkdtempSync(join(tmpdir(), "velo-puente-"));
  admin = new pg.Client({ connectionString: kit.url });
  await admin.connect();
  // El puente exige la tabla de su transacción: una conexión por prueba, la única del servidor.
}, 60_000);

afterAll(async () => {
  await admin?.end().catch(() => {});
  await kit?.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

/** Una conexión de puente para UNA operación: el servidor de PGlite admite una a la vez. */
async function conUnaConexion<T>(f: (c: Conexion) => Promise<T>): Promise<T> {
  await admin.end().catch(() => {});
  conexion = await conectar(kit.url);
  try {
    return await f(conexion);
  } finally {
    await conexion.cerrar();
    admin = new pg.Client({ connectionString: kit.url });
    await admin.connect();
  }
}

describe("anonimizar una tabla", () => {
  it("la tabla es un archivo: los mismos bytes que sobre su CSV, con la huella de origen", async () => {
    const csv = await volcado("public", "clientes");
    const r = await conUnaConexion((c) =>
      anonimizarTabla({
        conexion: c,
        esquema: "public",
        tabla: "clientes",
        idioma: "es",
        fecha: FECHA,
        reemplazar: false,
        politica: texto(POLITICA),
        llave,
      }),
    );
    // La huella de origen es la del CSV canónico de la tabla (medido por fuera del puente).
    expect(r.huellaDeOrigen.sha256).toBe(sha256(new TextEncoder().encode(csv)));
    expect(r.nombreDeLaNueva).toBe("clientes__velo");

    // El mismo CSV, por el camino de archivo, da el mismo anonimizado: el motor no sabe de dónde vino.
    const bytes = new TextEncoder().encode(csv);
    const origen = {
      nombre: "clientes.csv",
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
    const fuente = new Blob([bytes]);
    const partes: Uint8Array[] = [];
    const delArchivo = await anonimizar({
      fuente,
      origen,
      lectura: await leer(fuente, origen),
      politica: r.politicaAplicada,
      llave,
      idioma: "es",
      destino: new DestinoConHuella({
        escribir: async (b) => void partes.push(b),
      }),
      fecha: FECHA,
    });
    expect(r.resultado.sha256DeSalida).toBe(delArchivo.sha256DeSalida);
    // La bóveda, en claro (ADR-006), es la misma por los dos caminos.
    expect(r.resultado.boveda).not.toBeNull();
    expect(serializarBoveda(r.resultado.boveda!)).toBe(
      serializarBoveda(delArchivo.boveda!),
    );

    // Lo que quedó escrito en la tabla nueva ES ese CSV (el vacío vuelve como NULL y sale vacío).
    const escrita = await volcado("public", "clientes__velo", true);
    expect(sha256(new TextEncoder().encode(escrita))).toBe(
      r.resultado.sha256DeSalida,
    );
    // El certificado nombra la tabla de origen y las dos huellas.
    expect(r.resultado.certificado).toContain("public.clientes");
    expect(r.resultado.certificado).toContain(r.resultado.sha256DeSalida);
  }, 60_000);

  it("la tabla de origen no se toca: su volcado es el mismo antes y después", async () => {
    const antes = await volcado("public", "clientes");
    await conUnaConexion((c) =>
      anonimizarTabla({
        conexion: c,
        esquema: "public",
        tabla: "clientes",
        idioma: "es",
        fecha: FECHA,
        reemplazar: true,
        politica: texto(POLITICA),
        llave,
      }),
    );
    expect(await volcado("public", "clientes")).toBe(antes);
    // Y sigue teniendo SUS columnas: ninguna columna nueva, ninguna menos.
    const columnas = (
      await admin.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='clientes' ORDER BY ordinal_position`,
      )
    ).rows.map((r) => r.column_name);
    expect(columnas).not.toContain("__velo_fila");
    expect(columnas).toContain("cedula_titular");
  }, 60_000);

  it("ida y regreso: la tabla restaurada es la original", async () => {
    const original = await volcado("public", "clientes");
    const ida = await conUnaConexion((c) =>
      anonimizarTabla({
        conexion: c,
        esquema: "public",
        tabla: "clientes",
        idioma: "es",
        fecha: FECHA,
        reemplazar: true,
        politica: texto(SOLO_REVERSIBLES),
        llave,
      }),
    );
    expect(ida.resultado.boveda).not.toBeNull();
    const vuelta = await conUnaConexion((c) =>
      restaurarTabla({
        conexion: c,
        esquema: "public",
        tabla: "clientes__velo",
        idioma: "es",
        fecha: FECHA,
        reemplazar: true,
        boveda: ida.resultado.boveda!,
      }),
    );
    expect(vuelta.nombreDeLaNueva).toBe("clientes__restaurada");
    expect(vuelta.restauradas).toBeGreaterThan(0);
    // Los datos restaurados, en el orden de la llave, son los de la original.
    const restaurada = await volcado("public", "clientes__restaurada", true);
    expect(sha256(new TextEncoder().encode(restaurada))).toBe(
      sha256(new TextEncoder().encode(original)),
    );
  }, 60_000);
});

describe("el paginado por llave (tablas de más de una página)", () => {
  /** El oráculo: el volcado ordenado por la llave REAL (calificada), medido por fuera del puente. */
  async function oraculo(tabla: string, orden: string): Promise<string> {
    const filas = (
      await admin.query({
        text: `SELECT t.a::text, t.b::text, t.c::text FROM public.${tabla} AS t ORDER BY ${orden}`,
        rowMode: "array",
      })
    ).rows as (string | null)[][];
    return [["a", "b", "c"], ...filas.map((f) => f.map((v) => v ?? ""))].map(filaDeCsv).join("");
  }

  it("llave simple numérica: 12 000 filas en su orden numérico, no el del texto", async () => {
    await admin.query(`CREATE TABLE public.larga (a integer PRIMARY KEY, b text, c text)`);
    await admin.query(
      `INSERT INTO public.larga SELECT g, 'b' || g, CASE WHEN g % 7 = 0 THEN NULL ELSE 'c' || g END FROM generate_series(1, 12000) g`,
    );
    const esperada = sha256(new TextEncoder().encode(await oraculo("larga", "t.a")));
    const huella = await conUnaConexion(async (c) =>
      huellaDeTabla(c, await validarTabla(c, "public", "larga")),
    );
    expect(huella.sha256).toBe(esperada);
    expect(huella.filas).toBe(12_000);
  }, 60_000);

  it("llave compuesta: ninguna fila salta ni se repite entre páginas", async () => {
    await admin.query(`CREATE TABLE public.compuesta (a integer, b integer, c text, PRIMARY KEY (a, b))`);
    await admin.query(
      `INSERT INTO public.compuesta SELECT x, y, 'v' || x || '-' || y FROM generate_series(1, 120) x, generate_series(1, 100) y`,
    );
    const esperada = sha256(new TextEncoder().encode(await oraculo("compuesta", "t.a, t.b")));
    const huella = await conUnaConexion(async (c) =>
      huellaDeTabla(c, await validarTabla(c, "public", "compuesta")),
    );
    expect(huella.sha256).toBe(esperada);
    expect(huella.filas).toBe(12_000);
  }, 60_000);

  it("anonimizar una tabla de dos páginas escribe todas sus filas, una vez cada una", async () => {
    const r = await conUnaConexion((c) =>
      anonimizarTabla({
        conexion: c,
        esquema: "public",
        tabla: "larga",
        idioma: "es",
        fecha: FECHA,
        reemplazar: false,
        politica: texto({ ...POLITICA, reglas: [] }),
        llave,
      }),
    );
    expect(r.resultado.filas).toBe(12_000);
    const n = await admin.query(`SELECT count(*)::int AS n, count(DISTINCT a)::int AS d FROM public.larga__velo`);
    expect(n.rows[0]).toEqual({ n: 12_000, d: 12_000 });
    // Sin reglas, todo se conserva: lo escrito es la tabla, fila por fila.
    const escrita = await admin.query({ text: `SELECT a, b, c FROM public.larga__velo ORDER BY __velo_fila`, rowMode: "array" });
    const origen = await admin.query({ text: `SELECT a::text, b, c FROM public.larga AS t ORDER BY t.a`, rowMode: "array" });
    expect(escrita.rows).toEqual(origen.rows);
  }, 120_000);
});

describe("lo que el puente se niega a hacer", () => {
  const intentar = (tabla: string, extra: Record<string, unknown> = {}) =>
    conUnaConexion((c) =>
      anonimizarTabla({
        conexion: c,
        esquema: "public",
        tabla,
        idioma: "es",
        fecha: FECHA,
        reemplazar: false,
        politica: texto(POLITICA),
        llave,
        ...extra,
      }),
    );
  const clave = async (p: Promise<unknown>) =>
    p.then(
      () => "no-fallo",
      (e: unknown) =>
        e instanceof ErrorDeVelo ? e.clave : `otro:${(e as Error).name}`,
    );

  it("sin llave primaria: se niega y lo dice", async () => {
    await admin.query(`CREATE TABLE public.sin_llave (a text, b text)`);
    await admin.query(
      `INSERT INTO public.sin_llave VALUES ('1','x'),('2','y')`,
    );
    expect(await clave(intentar("sin_llave"))).toBe("sinLlavePrimaria");
  });

  it("una tabla que no existe: se niega", async () => {
    expect(await clave(intentar("no_existe"))).toBe("tablaDesconocida");
  });

  it("un nombre con una inyección no llega a ninguna sentencia: la base no lo conoce", async () => {
    const malicioso = `clientes"; DROP TABLE public.clientes; --`;
    expect(await clave(intentar(malicioso))).toBe("tablaDesconocida");
    expect(await clave(intentar(`clientes' OR '1'='1`))).toBe(
      "tablaDesconocida",
    );
    const sigue = await admin.query(
      `SELECT count(*)::int AS n FROM public.clientes`,
    );
    expect(sigue.rows[0].n).toBe(400);
  });

  it("no pisa una tabla que ya existe, salvo que se pida", async () => {
    await admin.query(`DROP TABLE IF EXISTS public.clientes__velo`);
    await intentar("clientes");
    expect(await clave(intentar("clientes"))).toBe("tablaDestinoExiste");
    expect(await clave(intentar("clientes", { reemplazar: true }))).toBe(
      "no-fallo",
    );
  }, 60_000);

  it("un fallo antes del COMMIT no deja una tabla a medias (ROLLBACK)", async () => {
    await admin.query(`DROP TABLE IF EXISTS public.clientes__velo`);
    const fallo = await clave(
      intentar("clientes", {
        antesDeConfirmar: async () => {
          throw new ErrorDeVelo("yaExiste", { ruta: "x" });
        },
      }),
    );
    expect(fallo).toBe("yaExiste");
    const existe = await admin.query(
      `SELECT to_regclass('public.clientes__velo') AS t`,
    );
    expect(existe.rows[0].t).toBeNull();
  }, 60_000);

  it("una tabla que cambia entre pasadas: se niega y no escribe nada", async () => {
    await admin.query(`DROP TABLE IF EXISTS public.clientes__velo`);
    const fallo = await clave(
      conUnaConexion(async (c) => {
        let lecturas = 0;
        const cambiante: Conexion = {
          ...c,
          // Después de la huella de origen (la primera lectura), la tabla «cambia»: la primera celda de la primera fila.
          leer: async (...a) => {
            const filas = await c.leer(...a);
            if (++lecturas > 1 && filas[0]) filas[0][1] = "cambio";
            return filas;
          },
        };
        return anonimizarTabla({
          conexion: cambiante,
          esquema: "public",
          tabla: "clientes",
          idioma: "es",
          fecha: FECHA,
          reemplazar: false,
          politica: texto(POLITICA),
          llave,
        });
      }),
    );
    expect(fallo).toBe("tablaCambio");
    const existe = await admin.query(
      `SELECT to_regclass('public.clientes__velo') AS t`,
    );
    expect(existe.rows[0].t).toBeNull();
  }, 60_000);

  it("nombres raros (comillas, espacios) se citan y funcionan", async () => {
    await admin.query(
      `CREATE TABLE public."Mi tabla ""rara""" ("id" integer PRIMARY KEY, "mi columna" text, "correo" text)`,
    );
    await admin.query(
      `INSERT INTO public."Mi tabla ""rara""" VALUES (1,'a','uno@ejemplo.test'),(2,'b','dos@ejemplo.test'),(3,'c','tres@ejemplo.test')`,
    );
    expect(
      await clave(
        intentar(`Mi tabla "rara"`, {
          politica: texto({
            ...SOLO_REVERSIBLES,
            reglas: SOLO_REVERSIBLES.reglas.slice(1),
          }),
        }),
      ),
    ).toBe("no-fallo");
    const nueva = await admin.query(
      `SELECT count(*)::int AS n FROM public."Mi tabla ""rara""__velo"`,
    );
    expect(nueva.rows[0].n).toBe(3);
  });

  it("un nombre que la base recortaría en silencio: se niega", async () => {
    const largo = "t".repeat(60);
    await admin.query(
      `CREATE TABLE public."${largo}" (id integer PRIMARY KEY, a text)`,
    );
    await admin.query(`INSERT INTO public."${largo}" VALUES (1,'x')`);
    expect(await clave(intentar(largo))).toBe("nombreLargo");
  });
});

describe("pnpm velo puente, de punta a punta", () => {
  it("escribe la tabla nueva, el certificado y la bóveda, y no suelta la conexión", async () => {
    await admin.query(`DROP TABLE IF EXISTS public.clientes__velo`);
    await admin.end().catch(() => {});
    const salida = mkdtempSync(join(carpeta, "orden-"));
    const politica = join(salida, "p.json");
    writeFileSync(politica, exportarPolitica(SOLO_REVERSIBLES));
    const registro: string[] = [];
    process.env.VELO_DB_URL = kit.url;
    process.env.VELO_FRASE = FRASE;
    process.env.VELO_FRASE_BOVEDA = FRASE_DE_BOVEDA;
    try {
      const codigo = await principal(
        [
          "puente",
          "--tabla",
          "public.clientes",
          "--politica",
          politica,
          "--sal",
          SAL,
          "--salida",
          salida,
        ],
        {
          salida: (l) => void registro.push(l),
          aviso: (l) => void registro.push(l),
        },
        () => new Date("2026-11-07T12:00:00Z"),
      );
      expect(codigo, registro.join("\n")).toBe(0);
    } finally {
      delete process.env.VELO_DB_URL;
      delete process.env.VELO_FRASE;
      delete process.env.VELO_FRASE_BOVEDA;
    }
    admin = new pg.Client({ connectionString: kit.url });
    await admin.connect();
    const salidaTexto = registro.join("\n");
    expect(salidaTexto).toContain("La original no se tocó");
    expect(salidaTexto).toContain("public.clientes__velo");
    // La conexión no sale en ningún mensaje.
    expect(salidaTexto).not.toContain(kit.direccion);
    const { readdirSync, readFileSync } = await import("node:fs");
    const archivos = readdirSync(salida);
    const boveda = archivos.find((a) => a.endsWith(".velo"));
    expect(boveda).toBeTruthy();
    expect(archivos.some((a) => a.startsWith("velo-certificado-"))).toBe(true);
    const abierta = await abrirBoveda(
      new Uint8Array(readFileSync(join(salida, boveda!))),
      FRASE_DE_BOVEDA,
    );
    expect(abierta.ok).toBe(true);
  }, 60_000);

  it("un fallo de conexión dice su código, jamás la dirección ni la clave", async () => {
    const registro: string[] = [];
    process.env.VELO_DB_URL =
      "postgres://velo:una-clave-secreta@127.0.0.1:1/postgres?sslmode=disable";
    try {
      const codigo = await principal(
        ["puente", "--tabla", "public.clientes", "--politica", "habeas-data"],
        {
          salida: (l) => void registro.push(l),
          aviso: (l) => void registro.push(l),
        },
      );
      expect(codigo).toBe(1);
    } finally {
      delete process.env.VELO_DB_URL;
    }
    const todo = registro.join("\n");
    expect(todo).toContain("ECONNREFUSED");
    expect(todo).not.toContain("una-clave-secreta");
    expect(todo).not.toContain("127.0.0.1");
  });

  it("sin VELO_DB_URL y sin consola: dice qué variable falta", async () => {
    const registro: string[] = [];
    delete process.env.VELO_DB_URL;
    const codigo = await principal(
      ["puente", "--tabla", "public.clientes", "--politica", "habeas-data"],
      {
        salida: (l) => void registro.push(l),
        aviso: (l) => void registro.push(l),
      },
    );
    expect(codigo).toBe(1);
    expect(registro.join("\n")).toContain("VELO_DB_URL");
  });
});
