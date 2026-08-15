// El sobre cifrado — el formato que comparten la bóveda (S3) y la bitácora (S4).
//
// **Por qué esto existe como módulo y no como dos copias.** El S3 escribió este formato para el
// `.velo`; el S4 necesita exactamente el mismo para la bitácora, con otro contenido dentro. La
// alternativa era duplicarlo, y hay una razón concreta para no hacerlo que no es «no te repitas»:
// **una equivocación en cripto duplicada es dos equivocaciones que se arreglan por separado, y la
// segunda se olvida.** Si mañana hay que subir las iteraciones, endurecer la derivación o corregir
// un fallo del modo, aquí hay un solo sitio donde hacerlo y dos archivos que se benefician.
//
// Lo que **no** se comparte es el contenido ni la palabra mágica: cada tipo de archivo declara la
// suya, y abrir una bóveda donde se esperaba una bitácora se rechaza **sin descifrar nada** y con un
// mensaje que dice cuál es cuál.
//
// **El determinismo no se mide aquí, y no es una excepción que nos concedamos.** AES-GCM exige un IV
// único por operación: reusar el par (llave, IV) permite recuperar la llave de autenticación y
// falsificar mensajes — es el fallo clásico del modo. Así que dos sellados del mismo contenido dan
// bytes distintos **a propósito**. Lo byte-idéntico es la serialización EN CLARO, y ahí es donde
// viven los tests. Razonado en `decisions/006-la-boveda-archivo-no-base-de-datos.md`.
//
// **La frase incorrecta la detecta el cifrado, no un control que nos inventemos.** AES-GCM es
// autenticado: si la llave derivada no es la que selló, la etiqueta no cuadra y `decrypt` lanza. No
// hay que guardar un testigo ni comparar un hash de la frase — el modo ya lo hace, y hacerlo a mano
// sería añadir superficie para equivocarse.

import { bytesAleatorios, ITERACIONES_PBKDF2 } from "./llave";

const BYTES_DE_MAGIA = 4;
const BYTES_DE_ITERACIONES = 4;
const BYTES_DE_SAL = 16;
/** 96 bits: el tamaño de IV que NIST SP 800-38D §8.2 recomienda para GCM. */
const BYTES_DE_IV = 12;

const INICIO_DE_ITERACIONES = BYTES_DE_MAGIA + 1;
const INICIO_DE_SAL = INICIO_DE_ITERACIONES + BYTES_DE_ITERACIONES;
const INICIO_DE_IV = INICIO_DE_SAL + BYTES_DE_SAL;
const BYTES_DE_CABECERA = INICIO_DE_IV + BYTES_DE_IV;

/**
 * Tope de iteraciones que se aceptan al ABRIR.
 *
 * La cabecera va en claro, así que un archivo manipulado puede pedir cuatro mil millones de
 * iteraciones y dejar la pestaña colgada un cuarto de hora sin que nada parezca roto. El tope
 * convierte eso en un rechazo inmediato. Cinco millones son ~300 ms medidos en Chromium: holgura de
 * sobra para endurecer el parámetro en el futuro, y muy lejos de bloquear a nadie.
 */
export const TOPE_DE_ITERACIONES = 5_000_000;

/** Cuatro bytes ASCII que dicen qué tipo de archivo es. Se comprueban sin descifrar nada. */
export function magiaDe(texto: string): Uint8Array {
  if (texto.length !== BYTES_DE_MAGIA) {
    throw new Error(`magia: "${texto}" no tiene ${BYTES_DE_MAGIA} caracteres`);
  }
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}

export type MotivoDeRechazo =
  | "no-es-de-velo"
  | "version-distinta"
  | "frase-incorrecta"
  | "costo-inaceptable";

export type ResultadoDeApertura =
  | { ok: true; claro: string }
  | { ok: false; motivo: MotivoDeRechazo; detalle: string };

/**
 * Cifra un texto en claro y devuelve los bytes del archivo.
 *
 * Formato, para que sea auditable de un vistazo:
 *
 * ```
 * [0..4)    palabra mágica (la del tipo de archivo)
 * [4]       versión del formato
 * [5..9)    iteraciones de PBKDF2, entero de 32 bits big-endian
 * [9..25)   sal de PBKDF2   (no es secreta: existe para que dos frases iguales no den la misma llave)
 * [25..37)  IV de AES-GCM   (único por sellado)
 * [37..]    texto cifrado + etiqueta de autenticación de 16 bytes
 * ```
 *
 * **Las iteraciones viajan en el archivo, y esa es la decisión menos obvia de aquí.** Si el número
 * viviera solo en el código, endurecerlo el año que viene volvería ilegible todo archivo sellado
 * antes — y un archivo que deja de abrirse es la pérdida total que el producto promete evitar. Con
 * el número dentro, cada archivo se abre con el costo con el que se selló y el parámetro puede subir
 * cuando haga falta. Cuatro bytes.
 *
 * La cabecera entera va como **datos autenticados adicionales**: si alguien cambia la sal, la
 * versión, las iteraciones o la palabra mágica, la etiqueta deja de cuadrar y el archivo se rechaza
 * en vez de descifrarse con una llave equivocada.
 */
export async function sellarCifrado(
  magia: Uint8Array,
  version: number,
  claro: string,
  frase: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const sal = bytesAleatorios(BYTES_DE_SAL);
  const iv = bytesAleatorios(BYTES_DE_IV);

  const cabecera = new Uint8Array(BYTES_DE_CABECERA);
  cabecera.set(magia, 0);
  cabecera[BYTES_DE_MAGIA] = version;
  new DataView(cabecera.buffer).setUint32(
    INICIO_DE_ITERACIONES,
    ITERACIONES_PBKDF2,
    false,
  );
  cabecera.set(sal, INICIO_DE_SAL);
  cabecera.set(iv, INICIO_DE_IV);

  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: cabecera },
    await derivarLlaveDeCifrado(frase, sal, ITERACIONES_PBKDF2),
    new TextEncoder().encode(claro),
  );

  const salida = new Uint8Array(BYTES_DE_CABECERA + cifrado.byteLength);
  salida.set(cabecera, 0);
  salida.set(new Uint8Array(cifrado), BYTES_DE_CABECERA);
  return salida;
}

/**
 * Descifra un archivo y devuelve su texto en claro, o un motivo que dice QUÉ pasó.
 *
 * No lanza: abrir un archivo que el usuario eligió a mano falla de formas normales y cada una
 * necesita su mensaje en pantalla. «Archivo inválido» no le dice a nadie qué hacer.
 *
 * Recibe **bytes, no un `File`**, y eso es estructural: el gate de privacidad veta `.arrayBuffer()`
 * y `new FileReader` fuera de `src/workers/`, así que quien abre el archivo es el worker y esta
 * función solo ve el resultado.
 */
export async function abrirCifrado(
  magia: Uint8Array,
  version: number,
  bytes: Uint8Array,
  frase: string,
  queEs: string,
): Promise<ResultadoDeApertura> {
  if (bytes.length < BYTES_DE_CABECERA) {
    return {
      ok: false,
      motivo: "no-es-de-velo",
      detalle: `El archivo es demasiado corto para ser ${queEs}.`,
    };
  }
  for (let i = 0; i < magia.length; i++) {
    if (bytes[i] !== magia[i]) {
      return {
        ok: false,
        motivo: "no-es-de-velo",
        detalle: `El archivo no es ${queEs}.`,
      };
    }
  }
  const versionDelArchivo = bytes[BYTES_DE_MAGIA];
  if (versionDelArchivo !== version) {
    return {
      ok: false,
      motivo: "version-distinta",
      detalle: `El archivo es de la versión ${versionDelArchivo} y esta Velo entiende la ${version}.`,
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
      detalle: `El archivo declara ${iteraciones} iteraciones, fuera de lo que Velo acepta (1 a ${TOPE_DE_ITERACIONES}). Está dañado o alterado.`,
    };
  }

  try {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: cabecera },
      await derivarLlaveDeCifrado(frase, sal, iteraciones),
      bytes.slice(BYTES_DE_CABECERA),
    );
    return { ok: true, claro: new TextDecoder().decode(claro) };
  } catch {
    // GCM no distingue «frase equivocada» de «archivo alterado»: en ambos casos la etiqueta no
    // cuadra, y esa es justamente la garantía. Se reporta la causa que le va a pasar a alguien de
    // verdad, y el detalle nombra la otra.
    return {
      ok: false,
      motivo: "frase-incorrecta",
      detalle: `La frase no abre ${queEs}. También sale este mensaje si el archivo se dañó o lo modificaron.`,
    };
  }
}

/**
 * Deriva la llave de cifrado del archivo.
 *
 * **No es la llave HMAC del proyecto**, y son dos cosas distintas a propósito: la HMAC decide los
 * seudónimos y una filtración suya los vuelve enlazables; esta solo abre el archivo. Comparten el
 * mismo PBKDF2 de 600.000 iteraciones, el mínimo que OWASP recomienda para SHA-256.
 *
 * **Lo que ese costo compra, dicho con el número medido y no con el de la intuición:** 600.000
 * iteraciones son **~36 ms en Chromium** (`tests/medicion/cripto-en-el-navegador.mjs`), no «del
 * orden de un segundo» como decía este comentario antes de medirlo. Treinta y seis milisegundos por
 * intento no protegen una frase corta —quien robe el archivo prueba un diccionario entero en
 * minutos—; lo que hacen es multiplicar por 600.000 el costo de cada intento frente a derivar la
 * llave directo de la frase. La defensa real es la longitud de la frase, y por eso la UI exige un
 * mínimo y lo dice. El parámetro viaja en la cabecera justamente para poder subirlo.
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
    { name: "PBKDF2", salt: sal, iterations: iteraciones, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
