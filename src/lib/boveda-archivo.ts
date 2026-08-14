// El archivo `.velo` — la bóveda cifrada que el usuario guarda.
//
// **Por qué está aquí y no en `engine/`:** este archivo hace las dos cosas que el motor tiene
// prohibidas. Genera azar (`crypto.getRandomValues`, vetado en `src/engine/**` por el gate de
// determinismo) y es asíncrono (`crypto.subtle` lo es). El motor construye y serializa la bóveda,
// que es determinista; aquí se la cifra, que no puede serlo. Es la misma frontera que el S2 trazó
// con la llave HMAC.
//
// **El sobre cifrado vive en `lib/archivo-cifrado.ts` desde el S4**, cuando la bitácora necesitó el
// mismo formato con otro contenido dentro. Lo que queda aquí es lo propio de la bóveda: su palabra
// mágica, su extensión y qué hacer con el texto en claro. El determinismo byte-idéntico se mide
// sobre la serialización EN CLARO —jamás sobre el `.velo` cifrado, que lleva un IV único por
// diseño—; razonado en `decisions/006-la-boveda-archivo-no-base-de-datos.md`.

import {
  deserializarBoveda,
  serializarBoveda,
  type Boveda,
} from "@/engine/boveda";
import { abrirCifrado, magiaDe, sellarCifrado } from "./archivo-cifrado";

/** `VELO` en ASCII. Un archivo que no empieza así no es una bóveda, y se dice sin descifrar nada. */
const MAGIA = magiaDe("VELO");
const VERSION_DEL_ARCHIVO = 1;

/** Cómo se nombra en los mensajes de error, para que digan qué se esperaba. */
const QUE_ES = "una bóveda de Velo";

/** La extensión del archivo que el usuario guarda. */
export const EXTENSION_DE_BOVEDA = ".velo";

/** Sella la bóveda: serializa en claro, cifra, y devuelve los bytes del `.velo`. */
export async function sellarBoveda(
  boveda: Boveda,
  frase: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return sellarCifrado(
    MAGIA,
    VERSION_DEL_ARCHIVO,
    serializarBoveda(boveda),
    frase,
  );
}

export type ResultadoDelArchivo =
  | { ok: true; boveda: Boveda }
  | {
      ok: false;
      motivo:
        | "no-es-una-boveda"
        | "version-distinta"
        | "frase-incorrecta"
        | "costo-inaceptable"
        | "contenido-invalido";
      detalle: string;
    };

/**
 * Abre un `.velo`. No lanza: cada forma de fallar necesita su propio mensaje en pantalla.
 *
 * Recibe **bytes, no un `File`**, y eso también es estructural: el gate de privacidad veta
 * `.arrayBuffer()` y `new FileReader` fuera de `src/workers/`, así que quien abre el archivo es el
 * worker y esta función solo ve el resultado. Una bóveda contiene los valores ORIGINALES del
 * usuario — es exactamente el contenido que nunca puede pasar por la página.
 */
export async function abrirBoveda(
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
      // `no-es-de-velo` es el motivo genérico del sobre; aquí recupera el nombre que la pantalla
      // de la bóveda ya sabía decir. El resto coincide uno a uno.
      motivo:
        sobre.motivo === "no-es-de-velo" ? "no-es-una-boveda" : sobre.motivo,
      detalle: sobre.detalle,
    };
  }

  const contenido = deserializarBoveda(sobre.claro);
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
  return { ok: true, boveda: contenido.boveda };
}
