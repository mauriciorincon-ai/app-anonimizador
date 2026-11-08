#!/usr/bin/env node
// KIT DE BASE (S9): un PostgreSQL embebido con una tabla sintética, para ensayar el puente de Velo
// local sin instalar nada. PGlite (Apache-2.0) corre PostgreSQL dentro de este proceso; el socket
// lo deja hablar con el driver `pg` igual que un servidor de verdad.
//
//   pnpm kit:base [--filas 2000] [--seed 42] [--perfil clinico] [--puerto 5433] [--segundos 0]
//
// Escucha SOLO en 127.0.0.1. Con `--segundos N` se cierra solo a los N segundos; sin él, con Ctrl-C.
// Todo dato sale del generador sembrado (regla dura 5): nada real, nada que no sea reproducible.
// La tabla es `public.clientes`: `id` entero (llave primaria) y una columna de texto por columna
// del perfil, con el vacío como NULL.

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { generarFilas } from "./generador.mjs";

const comillas = (nombre) => `"${nombre.replaceAll('"', '""')}"`;

/** Crea `public.clientes` y la llena con el generador sembrado. */
export async function sembrarTabla(
  db,
  { filas = 2_000, seed = 42, perfil = "clinico", tabla = "clientes" } = {},
) {
  const generadas = generarFilas({
    filas,
    seed,
    perfil,
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  });
  const encabezado = generadas.next().value;
  await db.exec(
    `CREATE TABLE public.${comillas(tabla)} (id integer PRIMARY KEY, ${encabezado
      .map((c) => `${comillas(c)} text`)
      .join(", ")})`,
  );
  const ancho = encabezado.length + 1;
  const porTanda = Math.floor(30_000 / ancho);
  let lote = [];
  let id = 1;
  const volcar = async () => {
    if (lote.length === 0) return;
    const valores = [];
    const grupos = lote.map((fila, i) => {
      valores.push(...fila);
      return `(${Array.from({ length: ancho }, (_, c) => `$${i * ancho + c + 1}`).join(", ")})`;
    });
    await db.query(
      `INSERT INTO public.${comillas(tabla)} VALUES ${grupos.join(", ")}`,
      valores,
    );
    lote = [];
  };
  for (const fila of generadas) {
    lote.push([id++, ...fila.map((v) => (v === "" ? null : v))]);
    if (lote.length === porTanda) await volcar();
  }
  await volcar();
  return { tabla: `public.${tabla}`, filas: id - 1, columnas: encabezado };
}

/** Levanta el servidor. `puerto: 0` toma uno libre (las pruebas). Devuelve cómo cerrarlo. */
export async function levantarKitDeBase(opciones = {}) {
  const db = await PGlite.create();
  const sembrada = await sembrarTabla(db, opciones);
  const servidor = new PGLiteSocketServer({
    db,
    port: opciones.puerto ?? 5433,
    host: "127.0.0.1",
  });
  await servidor.start();
  return {
    ...sembrada,
    direccion: servidor.getServerConn(),
    url: `postgres://velo@${servidor.getServerConn()}/postgres?sslmode=disable`,
    async cerrar() {
      await servidor.stop();
      await db.close();
    },
  };
}

async function principal() {
  const { values } = parseArgs({
    options: {
      filas: { type: "string", default: "2000" },
      seed: { type: "string", default: "42" },
      perfil: { type: "string", default: "clinico" },
      puerto: { type: "string", default: "5433" },
      segundos: { type: "string", default: "0" },
    },
  });
  const kit = await levantarKitDeBase({
    filas: Number(values.filas),
    seed: Number(values.seed),
    perfil: values.perfil,
    puerto: Number(values.puerto),
  });
  process.stderr.write(
    `Kit de base: ${kit.tabla} (${kit.filas} filas, llave primaria id) en ${kit.direccion}, solo este equipo.\n` +
      `  export VELO_DB_URL='${kit.url}'\n` +
      `  pnpm velo puente --tabla ${kit.tabla} --politica habeas-data\n` +
      `Ctrl-C lo cierra.\n`,
  );
  let cerrando = false;
  const cerrar = async () => {
    if (cerrando) return;
    cerrando = true;
    await kit.cerrar();
    process.exit(0);
  };
  process.once("SIGINT", cerrar);
  process.once("SIGTERM", cerrar);
  const segundos = Number(values.segundos);
  if (segundos > 0) setTimeout(cerrar, segundos * 1000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
