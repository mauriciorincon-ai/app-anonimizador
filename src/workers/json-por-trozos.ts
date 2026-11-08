// JSON por pasadas (S9), del lado de los bytes: une `src/engine/json/trozos.ts` (puro, sobre texto)
// con el alto volumen del S8. Lo usan igual el worker de la web y Velo local, que es lo que hace
// que los dos den los mismos bytes.
//
//   · `abrirJsonPorTrozos`: describe el archivo (primera pasada) y devuelve sus filas como una
//     `FuenteDeFilas`, que es lo único que el alto volumen sabe leer.
//   · `formatoJson`: la salida. Escribe cada fila transformada dentro de la estructura de su
//     registro original, con el mismo visitante que el escritor en memoria.

import type { FuenteDeTexto } from "@/engine/json/lector";
import {
  columnasNumericasDeJson,
  descubrirJson,
  EscritorDeRegistros,
  lotesDeJson,
  registrosCrudos,
  type DescripcionDeJson,
} from "@/engine/json/trozos";
import { ErrorDeJson } from "@/engine/json/tipos";

import type { FormatoDeSalida, FuenteDeFilas } from "./alto-volumen";

export interface JsonPorTrozos {
  readonly descripcion: DescripcionDeJson;
  readonly fuente: FuenteDeFilas;
  /** Las columnas que la bóveda marca como numéricas: lo restaurado vuelve sin comillas. */
  readonly numericas: ReadonlySet<string>;
  /** Un formato NUEVO por cada escritura: lleva dentro el estado de la pasada. */
  formato(): FormatoDeSalida;
}

/**
 * La primera pasada sobre `texto` (que debe ser re-leíble: cada llamada empieza de cero) y lo que
 * hace falta para seguir por pasadas. Lanza `ErrorDeJson` ante un JSON inválido.
 */
export async function abrirJsonPorTrozos(
  texto: FuenteDeTexto,
  bytes: number,
): Promise<JsonPorTrozos> {
  const descripcion = await descubrirJson(texto);
  return {
    descripcion,
    fuente: { bytes, lotes: () => lotesDeJson(texto, descripcion) },
    numericas: columnasNumericasDeJson(descripcion),
    formato: () => formatoJson(texto, descripcion),
  };
}

export function formatoJson(
  texto: FuenteDeTexto,
  descripcion: DescripcionDeJson,
): FormatoDeSalida {
  let escritor: EscritorDeRegistros | null = null;
  let registros: AsyncGenerator<string> | null = null;
  const invalido = () => new ErrorDeJson("json-invalido", null);
  return {
    async iniciar({ vivas, numericas }) {
      escritor = new EscritorDeRegistros(descripcion, vivas, numericas);
      registros = registrosCrudos(texto, descripcion.estructura.forma);
      return "";
    },
    async lote(filas) {
      let salida = "";
      for (const fila of filas) {
        const siguiente = await registros!.next();
        // Más filas que registros: el archivo no es el que se describió.
        if (siguiente.done) throw invalido();
        salida += escritor!.registro(siguiente.value, fila);
      }
      return salida;
    },
    async terminar() {
      // Quedaban registros por escribir: tampoco es el mismo archivo.
      if (!(await registros!.next()).done) throw invalido();
      return escritor!.cierre();
    },
  };
}
