// JSON dentro del worker — el único lugar donde los bytes de un JSON se vuelven texto.
//
// El motor (`src/engine/json/`) es puro y trabaja sobre TEXTO que le llega en trozos; no sabe qué
// es un `File`, ni lee bytes (`.arrayBuffer()` solo se permite dentro de `src/workers/`, y esto es lo
// que lo cumple). Aquí se hacen las dos cosas que el motor no puede hacer:
//
//   · decodificar UTF-8 en modo ESTRICTO. Un byte inválido no se «arregla» con un carácter de
//     reemplazo: sería escribir en el archivo de salida algo que el original no tenía. Es un
//     `json-invalido`, y sin citar el byte.
//   · comprobar, al final de la segunda pasada, que el archivo es el MISMO que se diagnosticó. El
//     certificado ata la huella de entrada a este archivo; si cambió en el disco entre las dos
//     lecturas, esa huella sería falsa y escribir la salida sería firmar una mentira.

import { ErrorDeJson } from "@/engine/json/tipos";
import type { FuenteDeTexto } from "@/engine/json/lector";
import { Sha256 } from "@/lib/sha256";

/** Trozo con el que se recorre el archivo. Ninguno sobrevive al siguiente. */
const TROZO_DE_LECTURA = 4 * 1024 * 1024;

/** El archivo en el disco ya no es el que se diagnosticó. No es un error del JSON: es del archivo. */
export class ArchivoCambio extends Error {
  constructor() {
    super("archivo-cambio");
    this.name = "ArchivoCambio";
  }
}

export interface OpcionesDeFuente {
  /** Se llama con los bytes leídos hasta ahora, para la barra de avance. */
  readonly alAvanzar?: (bytesLeidos: number) => void;
  /**
   * SHA-256 que el archivo debe tener. Si se da, al terminar de leerlo se compara y, si no
   * coincide, la fuente lanza `ArchivoCambio`.
   */
  readonly huellaEsperada?: string;
}

/**
 * Una fuente de texto RE-LEÍBLE: cada llamada empieza otra vez desde el principio del archivo, que
 * es lo que pide el motor (una pasada para leer, otra para escribir).
 */
export function fuenteDeArchivo(
  archivo: Blob,
  opciones: OpcionesDeFuente = {},
): FuenteDeTexto {
  return async function* () {
    const decodificador = new TextDecoder("utf-8", { fatal: true });
    const huella = opciones.huellaEsperada === undefined ? null : new Sha256();
    for (let desde = 0; desde < archivo.size; desde += TROZO_DE_LECTURA) {
      const hasta = Math.min(desde + TROZO_DE_LECTURA, archivo.size);
      const bytes = new Uint8Array(
        await archivo.slice(desde, hasta).arrayBuffer(),
      );
      huella?.actualizar(bytes);
      let texto: string;
      try {
        texto = decodificador.decode(bytes, { stream: hasta < archivo.size });
      } catch {
        // El mensaje de `TextDecoder` no se reenvía: puede citar la posición y el byte.
        throw new ErrorDeJson("json-invalido", null);
      }
      opciones.alAvanzar?.(hasta);
      if (texto !== "") yield texto;
    }
    if (huella && huella.terminar() !== opciones.huellaEsperada)
      throw new ArchivoCambio();
  };
}
