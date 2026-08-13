// El archivo `.velo` — la bóveda cifrada que el usuario guarda.
//
// **Por qué está aquí y no en `engine/`:** este archivo hace las dos cosas que el motor tiene
// prohibidas. Genera azar (`crypto.getRandomValues`, vetado en `src/engine/**` por el gate de
// determinismo) y es asíncrono (`crypto.subtle` lo es). El motor construye y serializa la bóveda,
// que es determinista; aquí se la cifra, que no puede serlo. Es la misma frontera que el S2 trazó
// con la llave HMAC.
//
// **El determinismo NO se mide sobre este archivo, y no es una excepción que nos concedamos.**
// AES-GCM exige un IV único por operación: reusar el par (llave, IV) permite recuperar la llave de
// autenticación y falsificar mensajes — es el fallo clásico del modo, no un detalle de
// implementación. Así que dos sellados de la misma bóveda dan bytes distintos **a propósito**. Lo
// que sí es byte-idéntico, y tiene su test, es la serialización en claro. Razonado en
// `decisions/006-la-boveda-archivo-no-base-de-datos.md`.
//
// **La frase de paso incorrecta la detecta el cifrado, no un control que nos inventemos.** AES-GCM
// es autenticado: si la llave derivada no es la que selló, la etiqueta no cuadra y `decrypt` lanza.
// No hay que guardar un testigo ni comparar un hash de la frase — el modo ya lo hace, y hacerlo a
// mano sería añadir superficie para equivocarse.

import {
  deserializarBoveda,
  serializarBoveda,
  type Boveda,
} from "@/engine/boveda";
import { bytesAleatorios, ITERACIONES_PBKDF2 } from "./llave";

/** `VELO` en ASCII. Un archivo que no empieza así no es una bóveda, y se dice sin descifrar nada. */
const MAGIA = Uint8Array.from([0x56, 0x45, 0x4c, 0x4f]);
const VERSION_DEL_ARCHIVO = 1;
const BYTES_DE_ITERACIONES = 4;
const BYTES_DE_SAL = 16;
/** 96 bits: el tamaño de IV que NIST SP 800-38D §8.2 recomienda para GCM. */
const BYTES_DE_IV = 12;

const INICIO_DE_ITERACIONES = MAGIA.length + 1;
const INICIO_DE_SAL = INICIO_DE_ITERACIONES + BYTES_DE_ITERACIONES;
const INICIO_DE_IV = INICIO_DE_SAL + BYTES_DE_SAL;
const BYTES_DE_CABECERA = INICIO_DE_IV + BYTES_DE_IV;

/**
 * Tope de iteraciones que se aceptan al ABRIR.
 *
 * La cabecera va en claro, así que un `.velo` manipulado puede pedir cuatro mil millones de
 * iteraciones y dejar la pestaña colgada un cuarto de hora sin que nada parezca roto. El tope
 * convierte eso en un rechazo inmediato. Cinco millones son ~300 ms medidos en Chromium: holgura de
 * sobra para endurecer el parámetro en el futuro, y muy lejos de bloquear a nadie.
 */
const TOPE_DE_ITERACIONES = 5_000_000;

/** La extensión del archivo que el usuario guarda. */
export const EXTENSION_DE_BOVEDA = ".velo";

/**
 * Deriva la llave de cifrado de la bóveda.
 *
 * **No es la llave HMAC del proyecto**, y son dos cosas distintas a propósito: la HMAC decide los
 * seudónimos y una filtración suya los vuelve enlazables; esta solo abre el archivo. Comparten el
 * mismo PBKDF2 de 600.000 iteraciones, el mínimo que OWASP recomienda para SHA-256.
 *
 * **Lo que ese costo compra, dicho con el número medido y no con el de la intuición:** 600.000
 * iteraciones son **~36 ms en Chromium** (`tests/medicion/cripto-en-el-navegador.mjs`), no «del
 * orden de un segundo» como decía este comentario antes de medirlo. Treinta y seis milisegundos por
 * intento no protegen una frase corta —quien robe el `.velo` prueba un diccionario entero en
 * minutos—; lo que hacen es multiplicar por 600.000 el costo de cada intento frente a derivar la
 * llave directo de la frase. La defensa real es la longitud de la frase, y por eso la UI exige un
 * mínimo y lo dice. El parámetro viaja en la cabecera justamente para poder subirlo (ver abajo).
 *
 * `extractable: false`: ni el propio código puede volver a sacar sus bytes.
 */
async function derivarLlaveDeCifrado(
  frase: string,
  sal: Uint8Array<ArrayBuffer>,
  iteraciones: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(frase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: sal,
      iterations: iteraciones,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Sella la bóveda: serializa en claro, cifra, y devuelve los bytes del `.velo`.
 *
 * Formato, para que sea auditable de un vistazo:
 *
 * ```
 * [0..4)    "VELO"
 * [4]       versión del archivo
 * [5..9)    iteraciones de PBKDF2, entero de 32 bits big-endian
 * [9..25)   sal de PBKDF2   (no es secreta: existe para que dos frases iguales no den la misma llave)
 * [25..37)  IV de AES-GCM   (único por sellado)
 * [37..]    texto cifrado + etiqueta de autenticación de 16 bytes
 * ```
 *
 * **Las iteraciones viajan en el archivo, y esa es la decisión menos obvia de aquí.** Si el número
 * viviera solo en el código, endurecerlo el año que viene volvería ilegible toda bóveda sellada
 * antes — y una bóveda que deja de abrirse es la pérdida total que el producto promete evitar. Con
 * el número dentro, cada `.velo` se abre con el costo con el que se selló y el parámetro puede
 * subir cuando haga falta. Cuatro bytes.
 *
 * La cabecera entera va como **datos autenticados adicionales**: si alguien cambia la sal, la
 * versión o las iteraciones de un `.velo` ajeno, la etiqueta deja de cuadrar y el archivo se rechaza
 * en vez de descifrarse con una llave equivocada.
 */
export async function sellarBoveda(
  boveda: Boveda,
  frase: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const sal = bytesAleatorios(BYTES_DE_SAL);
  const iv = bytesAleatorios(BYTES_DE_IV);

  const cabecera = new Uint8Array(BYTES_DE_CABECERA);
  cabecera.set(MAGIA, 0);
  cabecera[MAGIA.length] = VERSION_DEL_ARCHIVO;
  new DataView(cabecera.buffer).setUint32(
    INICIO_DE_ITERACIONES,
    ITERACIONES_PBKDF2,
    false,
  );
  cabecera.set(sal, INICIO_DE_SAL);
  cabecera.set(iv, INICIO_DE_IV);

  const claro = new TextEncoder().encode(serializarBoveda(boveda));
  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: cabecera },
    await derivarLlaveDeCifrado(frase, sal, ITERACIONES_PBKDF2),
    claro,
  );

  const salida = new Uint8Array(BYTES_DE_CABECERA + cifrado.byteLength);
  salida.set(cabecera, 0);
  salida.set(new Uint8Array(cifrado), BYTES_DE_CABECERA);
  return salida;
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
 * Abre un `.velo`. No lanza: cada forma de fallar necesita su propio mensaje en pantalla, y
 * «archivo inválido» no le dice a nadie qué hacer.
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
  if (bytes.length < BYTES_DE_CABECERA) {
    return {
      ok: false,
      motivo: "no-es-una-boveda",
      detalle: "El archivo es demasiado corto para ser una bóveda de Velo.",
    };
  }
  for (let i = 0; i < MAGIA.length; i++) {
    if (bytes[i] !== MAGIA[i]) {
      return {
        ok: false,
        motivo: "no-es-una-boveda",
        detalle: "El archivo no es una bóveda de Velo.",
      };
    }
  }
  const version = bytes[MAGIA.length];
  if (version !== VERSION_DEL_ARCHIVO) {
    return {
      ok: false,
      motivo: "version-distinta",
      detalle: `La bóveda es de la versión ${version} y esta Velo entiende la ${VERSION_DEL_ARCHIVO}.`,
    };
  }

  // `slice` y no `subarray`: `crypto.subtle` exige búferes que no se compartan, y un `subarray`
  // comparte el búfer del archivo entero.
  const cabecera = bytes.slice(0, BYTES_DE_CABECERA);
  const sal = bytes.slice(INICIO_DE_SAL, INICIO_DE_IV);
  const iv = bytes.slice(INICIO_DE_IV, BYTES_DE_CABECERA);
  const iteraciones = new DataView(cabecera.buffer).getUint32(
    INICIO_DE_ITERACIONES,
    false,
  );

  // Antes de derivar nada: la cabecera va en claro y un archivo manipulado puede pedir un costo que
  // cuelgue la pestaña. Se rechaza en vez de obedecer.
  if (iteraciones < 1 || iteraciones > TOPE_DE_ITERACIONES) {
    return {
      ok: false,
      motivo: "costo-inaceptable",
      detalle: `La bóveda declara ${iteraciones} iteraciones, fuera de lo que Velo acepta (1 a ${TOPE_DE_ITERACIONES}). El archivo está dañado o alterado.`,
    };
  }

  let claro: ArrayBuffer;
  try {
    claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: cabecera },
      await derivarLlaveDeCifrado(frase, sal, iteraciones),
      bytes.slice(BYTES_DE_CABECERA),
    );
  } catch {
    // GCM no distingue «frase equivocada» de «archivo alterado»: en ambos casos la etiqueta no
    // cuadra, y esa es justamente la garantía. Se reporta la causa que le va a pasar a alguien de
    // verdad, y el detalle nombra la otra.
    return {
      ok: false,
      motivo: "frase-incorrecta",
      detalle:
        "La frase no abre esta bóveda. También sale este mensaje si el archivo se dañó o lo modificaron.",
    };
  }

  const contenido = deserializarBoveda(new TextDecoder().decode(claro));
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
