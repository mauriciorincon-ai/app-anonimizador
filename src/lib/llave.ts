// La llave del usuario — generación y derivación.
//
// **Vive en `lib/`, no en `engine/`, y no es una preferencia de organización.** El gate de
// determinismo del S1 barre cada `.ts` del motor y veta `crypto.getRandomValues` junto a
// `Math.random`: un motor que puede producir azar deja de ser reproducible, que es la promesa
// central del producto. Generar una sal necesita azar de verdad. Así que el azar vive aquí, y al
// motor le llega la llave **ya derivada** como parámetro — con lo cual las técnicas siguen siendo
// funciones puras de (valor, llave).
//
// Lo que esta llave decide:
//   · **Consistencia referencial (C9).** Mismo valor + misma llave ⇒ mismo seudónimo, dentro del
//     archivo y entre archivos. No es una feature que se construya: cae sola del HMAC. Por eso la
//     llave es del proyecto, no del archivo.
//   · **Irreversibilidad.** Sin bóveda (S3), un seudónimo no vuelve. Si la llave se pierde, no hay
//     recuperación — y eso es la garantía, no el defecto.
//   · **Enlazabilidad, si se filtra.** Una llave filtrada vuelve enlazables TODOS los seudónimos
//     de una vez (ENISA lo documenta como el límite conocido de HMAC). De ahí que jamás se
//     persista, jamás se registre y jamás entre a un evento de telemetría.

/**
 * Iteraciones de PBKDF2-HMAC-SHA256.
 *
 * Fuente: **OWASP Password Storage Cheat Sheet** — mínimo 600.000 para PBKDF2-HMAC-SHA256.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 *
 * **La garantía es el número de iteraciones, no los segundos** — y esta línea decía otra cosa hasta
 * que el S3 la midió. Antes afirmaba «tarda del orden de un segundo, y eso es lo que compra». Medido
 * en Chromium sobre esta máquina: **36 ms** con 600.000 iteraciones (61 ms con un millón, 121 ms con
 * dos; `tests/medicion/cripto-en-el-navegador.mjs` lo vuelve a sacar). En un teléfono de gama baja
 * será bastante más, y esa variación de un orden de magnitud entre dispositivos es justamente por
 * qué el estándar se expresa en iteraciones: el tiempo no es una propiedad que se pueda prometer.
 *
 * Lo que sí compra el costo: encarece por igual cada intento de quien quiera adivinar la frase.
 *
 * **Y desde el S2 este número es una constante de compatibilidad, no un parámetro.** Subirlo
 * cambiaría la llave derivada de la misma frase y la misma sal, o sea **cambiaría todos los
 * seudónimos** — que es exactamente romper la consistencia referencial (C9) que el producto promete
 * entre archivos de meses distintos. Endurecerlo exige una versión de llave y una migración, no una
 * edición de esta línea.
 *
 * (Argon2id sería preferible según el mismo documento, pero en navegador exige WASM; PBKDF2 es
 * nativo y no añade dependencias a auditar. Camino de salida declarado en el brief.)
 */
export const ITERACIONES_PBKDF2 = 600_000;

const BYTES_DE_SAL = 16;

export interface LlaveDeProyecto {
  /** La llave HMAC. `extractable: false`: ni el propio código puede volver a sacar sus bytes. */
  readonly clave: CryptoKey;
  /** La sal, en hexadecimal. Hace falta para volver a derivar la MISMA llave el mes que viene. */
  readonly sal: string;
  /**
   * Huella corta y pública de la llave. Sirve para que el usuario reconozca que dos archivos
   * salieron de la misma llave sin enseñar un solo byte de ella: es el HMAC de una constante, así
   * que revelarla no ayuda a invertir nada.
   */
  readonly huella: string;
}

function aHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// El tipo explícito no es adorno: `Uint8Array` a secas se infiere sobre `ArrayBufferLike`, que
// incluye `SharedArrayBuffer`, y `crypto.subtle` exige un búfer que no se comparta entre hilos.
function deHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Bytes aleatorios de verdad. **Es el único sitio de todo `src/` donde nace azar**, y por eso vive
 * en `lib/` y no en `engine/`: el gate de determinismo veta `crypto.getRandomValues` en el motor.
 *
 * Lo usan la sal de aquí abajo y —desde el S3— la sal y el **IV** de la bóveda cifrada
 * (`lib/boveda-archivo.ts`). Tenerlo en una sola función significa que auditar el azar del producto
 * es leer tres líneas.
 */
export function bytesAleatorios(cuantos: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(cuantos);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Sal nueva, en hexadecimal. */
export function generarSal(): string {
  return aHex(bytesAleatorios(BYTES_DE_SAL));
}

/** Texto de la huella: HMAC de una constante conocida. No revela la llave. */
const TESTIGO_DE_HUELLA = "velo:huella-de-llave:v1";

/**
 * Deriva la llave del proyecto de una frase de paso y una sal.
 *
 * Misma frase + misma sal ⇒ misma llave, siempre. Por eso la sal se guarda junto a la política y
 * no dentro de la llave: sin ella, la frase correcta produciría una llave distinta y los
 * seudónimos del mes pasado dejarían de cuadrar.
 */
export async function derivarLlave(
  frase: string,
  sal: string,
): Promise<LlaveDeProyecto> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(frase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const clave = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: deHex(sal),
      iterations: ITERACIONES_PBKDF2,
      hash: "SHA-256",
    },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    // No extraíble: aunque alguien logre una referencia a la llave, no puede leer sus bytes.
    false,
    ["sign"],
  );

  const testigo = await crypto.subtle.sign(
    "HMAC",
    clave,
    new TextEncoder().encode(TESTIGO_DE_HUELLA),
  );

  return { clave, sal, huella: aHex(new Uint8Array(testigo)).slice(0, 12) };
}

/**
 * ¿Dos llaves son la misma? Se compara por huella, que es lo único observable de una llave no
 * extraíble — y lo único que se puede enseñar sin comprometerla.
 */
export function mismaLlave(a: LlaveDeProyecto, b: LlaveDeProyecto): boolean {
  return a.huella === b.huella;
}
