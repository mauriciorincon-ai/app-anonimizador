// El archivo de la bitácora — cifrado, propio, y aparte de la bóveda.
//
// Comparte el sobre con el `.velo` (`lib/archivo-cifrado.ts`): mismo AES-GCM con IV único, mismo
// PBKDF2 con las iteraciones dentro del archivo, misma cabecera autenticada. Lo que cambia son tres
// cosas, y las tres importan:
//
//   · **Otra palabra mágica.** Abrir una bóveda donde se esperaba una bitácora se rechaza SIN
//     descifrar nada, con un mensaje que dice cuál es cuál. Es el error más probable del usuario
//     —dos archivos cifrados de la misma app, guardados el mismo día— y merece una respuesta clara
//     en vez de un «frase incorrecta» que le haría dudar de la frase.
//   · **Otra extensión.** El selector de archivos filtra por ella, así que la equivocación se evita
//     antes de ocurrir. La palabra mágica es la defensa; la extensión es la cortesía.
//   · **Otro contenido**, con su propio esquema y su propia versión.
//
// **Y otra frase de paso, que es lo que el usuario tiene que entender:** la bitácora no se abre con
// la frase de la bóveda ni con la del proyecto. Son tres secretos con tres alcances distintos, y
// reusarlos convertiría la pérdida de uno en la pérdida de todo.

import {
  deserializarBitacora,
  serializarBitacora,
  type Bitacora,
} from "@/engine/bitacora";
import { abrirCifrado, magiaDe, sellarCifrado } from "./archivo-cifrado";

/** `VLOG` en ASCII — distinta de la `VELO` de la bóveda, a propósito. */
const MAGIA = magiaDe("VLOG");
const VERSION_DEL_ARCHIVO = 1;

const QUE_ES = "una bitácora de Velo";

/** La extensión del archivo que el usuario guarda. */
export const EXTENSION_DE_BITACORA = ".velolog";

/** Nombre sugerido. Sin fecha dentro: la bitácora es una sola y se sobrescribe al crecer. */
export const NOMBRE_DE_BITACORA = `velo-bitacora${EXTENSION_DE_BITACORA}`;

export async function sellarBitacora(
  bitacora: Bitacora,
  frase: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return sellarCifrado(
    MAGIA,
    VERSION_DEL_ARCHIVO,
    serializarBitacora(bitacora),
    frase,
  );
}

export type ResultadoDelArchivo =
  | { ok: true; bitacora: Bitacora }
  | {
      ok: false;
      motivo:
        | "no-es-una-bitacora"
        | "version-distinta"
        | "frase-incorrecta"
        | "costo-inaceptable"
        | "contenido-invalido";
      detalle: string;
    };

/**
 * Abre una bitácora. No lanza: cada forma de fallar necesita su mensaje en pantalla.
 *
 * Recibe **bytes, no un `File`** — el gate de privacidad veta `.arrayBuffer()` fuera de
 * `src/workers/`, así que quien abre el archivo es el worker. Una bitácora es una lista de nombres
 * de archivo del usuario: exactamente el material que no puede pasar por la página.
 */
export async function abrirBitacora(
  bytes: Uint8Array,
  frase: string,
): Promise<ResultadoDelArchivo> {
  const sobre = await abrirCifrado(
    MAGIA,
    VERSION_DEL_ARCHIVO,
    bytes,
    frase,
    QUE_ES,
  );
  if (!sobre.ok) {
    return {
      ok: false,
      motivo:
        sobre.motivo === "no-es-de-velo" ? "no-es-una-bitacora" : sobre.motivo,
      detalle: sobre.detalle,
    };
  }

  const contenido = deserializarBitacora(sobre.claro);
  if (!contenido.ok) {
    return {
      ok: false,
      motivo:
        contenido.motivo === "version-distinta"
          ? "version-distinta"
          : "contenido-invalido",
      detalle: contenido.detalle,
    };
  }
  return { ok: true, bitacora: contenido.bitacora };
}
