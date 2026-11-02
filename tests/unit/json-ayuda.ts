// Ayudas compartidas por las pruebas del motor de JSON (S6). No es una prueba: `vitest` solo corre
// los `*.test.ts`; esto se importa desde ellos.

import { expect } from "vitest";

import {
  ConstructorColumnar,
  type TablaColumnar,
  valorEn,
} from "../../src/engine/columnar";
import { escribirJson } from "../../src/engine/json/escritor";
import {
  type FuenteDeTexto,
  type LecturaJson,
  leerJson,
} from "../../src/engine/json/lector";
import {
  ErrorDeJson,
  type MotivoJson,
  type TopesJson,
} from "../../src/engine/json/tipos";

/** Una fuente que entrega `texto` en trozos de `tamano` caracteres (o entero si no se da). */
export function fuenteDe(texto: string, tamano = Infinity): FuenteDeTexto {
  return () =>
    (async function* () {
      if (tamano >= texto.length) {
        yield texto;
        return;
      }
      for (let i = 0; i < texto.length; i += tamano) {
        yield texto.slice(i, i + tamano);
      }
    })();
}

export async function recoger(trozos: AsyncIterable<string>): Promise<string> {
  let texto = "";
  for await (const trozo of trozos) texto += trozo;
  return texto;
}

/** El valor de cada fila de la columna `nombre` de la lectura. */
export function celdas(lectura: LecturaJson, nombre: string): string[] {
  const columna = lectura.tabla.columnas.find((c) => c.nombre === nombre);
  if (!columna) throw new Error(`no hay columna ${nombre}`);
  return Array.from({ length: lectura.tabla.filas }, (_, f) =>
    valorEn(columna, f),
  );
}

export function clasesDe(lectura: LecturaJson, nombre: string): number[] {
  const i = lectura.tabla.columnas.findIndex((c) => c.nombre === nombre);
  if (i < 0) throw new Error(`no hay columna ${nombre}`);
  return [...lectura.clases[i]];
}

export function nombresDe(lectura: LecturaJson): string[] {
  return lectura.tabla.columnas.map((c) => c.nombre);
}

/** Lee y reescribe con la política identidad (la tabla transformada ES la leída). */
export async function reescribir(
  texto: string,
  tamano = Infinity,
  topes?: TopesJson,
): Promise<string> {
  const lectura = await leerJson(fuenteDe(texto, tamano), topes);
  return recoger(escribirJson(fuenteDe(texto, tamano), lectura, lectura.tabla));
}

interface OpcionesDeTransformacion {
  /** Columnas que la transformación suprime. */
  suprimir?: readonly string[];
  /** El valor nuevo de una celda; sin esto, la celda queda como estaba. */
  valor?: (nombre: string, fila: number, original: string) => string;
}

/** Una tabla transformada a mano: mismas filas, mismas columnas menos las suprimidas. */
export function transformar(
  lectura: LecturaJson,
  { suprimir = [], valor }: OpcionesDeTransformacion = {},
): TablaColumnar {
  const columnas = lectura.tabla.columnas.filter(
    (c) => !suprimir.includes(c.nombre),
  );
  const constructor = new ConstructorColumnar(
    columnas.map((c) => c.nombre),
    lectura.tabla.filas,
  );
  for (let fila = 0; fila < lectura.tabla.filas; fila++) {
    constructor.agregarFila(
      columnas.map((c) => {
        const original = valorEn(c, fila);
        return valor ? valor(c.nombre, fila, original) : original;
      }),
    );
  }
  return constructor.finalizar();
}

/** Lee `texto`, transforma y escribe. */
export async function pasarPorLaAduana(
  texto: string,
  opciones: OpcionesDeTransformacion = {},
  tamano = Infinity,
): Promise<{ lectura: LecturaJson; salida: string }> {
  const lectura = await leerJson(fuenteDe(texto, tamano));
  const salida = await recoger(
    escribirJson(
      fuenteDe(texto, tamano),
      lectura,
      transformar(lectura, opciones),
    ),
  );
  return { lectura, salida };
}

/** Comprueba que leer `texto` falla con `ErrorDeJson` de ese motivo y devuelve la línea. */
export async function esperarError(
  texto: string,
  motivo: MotivoJson,
  tamano = Infinity,
  topes?: TopesJson,
): Promise<number | null> {
  let error: unknown = null;
  try {
    await leerJson(fuenteDe(texto, tamano), topes);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ErrorDeJson);
  const errorDeJson = error as ErrorDeJson;
  expect(errorDeJson.motivo).toBe(motivo);
  // El mensaje es la clave del motivo y nada más: jamás un trozo del archivo.
  expect(errorDeJson.message).toBe(motivo);
  return errorDeJson.linea;
}
