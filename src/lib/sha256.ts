// SHA-256 en streaming — la huella del archivo que va en el reporte.
//
// Fuente del algoritmo: **FIPS PUB 180-4** (NIST, agosto 2015), §6.2 «SHA-256» — las mismas
// constantes K y H(0) que define el estándar, y el mismo relleno de §5.1.1. Igual que los
// validadores del motor, la implementación cita su fuente en el código.
//
// ¿Por qué no `crypto.subtle.digest`, que ya viene en el navegador? Porque no tiene forma de
// streaming: hay que pasarle el archivo ENTERO en un `ArrayBuffer`. En un CSV de 130 MB eso
// significa una copia completa del archivo viva en memoria justo cuando la tabla columnar también
// lo está — y para un archivo más grande, sencillamente no cabe. Velo se comprometió a leer por
// partes y esta es una de esas partes. Aquí el archivo pasa en trozos de unos pocos MB y ninguno
// sobrevive al siguiente.
//
// La implementación no se cree a sí misma: `tests/unit/sha256.test.ts` la confronta con
// `crypto.subtle.digest` sobre decenas de entradas —incluidas las fronteras del relleno: 0, 55,
// 56, 63, 64 y 65 bytes— y contra los tres vectores publicados en el propio estándar. Si un día
// difieren, el que está mal es este archivo.

/** Constantes K: los 32 bits fraccionarios de las raíces cúbicas de los primeros 64 primos. */
// prettier-ignore
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** H(0): los 32 bits fraccionarios de las raíces cuadradas de los primeros 8 primos. */
// prettier-ignore
const H_INICIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOQUE = 64;

function rotar(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * Acumulador de SHA-256. Se le va dando el archivo en trozos y al final entrega el resumen en
 * hexadecimal minúscula, que es lo que imprimen `sha256sum` y `shasum -a 256`.
 */
export class Sha256 {
  private readonly h = new Uint32Array(H_INICIAL);
  private readonly bloque = new Uint8Array(BLOQUE);
  private readonly w = new Uint32Array(64);
  private enBloque = 0;
  /** Longitud total en bytes. Un `number` llega hasta 9 PB sin perder precisión: de sobra. */
  private longitud = 0;
  private terminado = false;

  actualizar(datos: Uint8Array): this {
    if (this.terminado) throw new Error("el resumen ya se cerró");
    this.longitud += datos.length;

    let i = 0;
    // Completa el bloque a medias que quedó del trozo anterior.
    if (this.enBloque > 0) {
      const faltan = Math.min(BLOQUE - this.enBloque, datos.length);
      this.bloque.set(datos.subarray(0, faltan), this.enBloque);
      this.enBloque += faltan;
      i = faltan;
      if (this.enBloque === BLOQUE) {
        this.comprimir(this.bloque, 0);
        this.enBloque = 0;
      }
    }
    // Los bloques completos se comprimen leyendo directo del trozo, sin copiarlos.
    for (; i + BLOQUE <= datos.length; i += BLOQUE) this.comprimir(datos, i);
    // Y el resto se guarda para el próximo trozo.
    if (i < datos.length) {
      this.bloque.set(datos.subarray(i), 0);
      this.enBloque = datos.length - i;
    }
    return this;
  }

  /** Cierra el resumen y devuelve los 64 caracteres hexadecimales. */
  terminar(): string {
    if (this.terminado) throw new Error("el resumen ya se cerró");
    this.terminado = true;

    // Relleno de FIPS 180-4 §5.1.1: un bit en 1, ceros, y la longitud en BITS como entero de
    // 64 bits big-endian.
    const bitsDeLongitud = this.longitud * 8;
    const cola = new Uint8Array(this.enBloque < 56 ? BLOQUE : BLOQUE * 2);
    cola.set(this.bloque.subarray(0, this.enBloque), 0);
    cola[this.enBloque] = 0x80;

    const vista = new DataView(cola.buffer);
    // Se parte en dos mitades de 32 bits: los bits altos solo aparecerían por encima de 512 PB.
    vista.setUint32(
      cola.length - 8,
      Math.floor(bitsDeLongitud / 0x1_0000_0000),
      false,
    );
    vista.setUint32(cola.length - 4, bitsDeLongitud >>> 0, false);

    for (let i = 0; i < cola.length; i += BLOQUE) this.comprimir(cola, i);

    let hex = "";
    for (const palabra of this.h) hex += palabra.toString(16).padStart(8, "0");
    return hex;
  }

  /** Una ronda de compresión sobre el bloque de 64 bytes que empieza en `desde`. */
  private comprimir(datos: Uint8Array, desde: number): void {
    const w = this.w;
    for (let t = 0; t < 16; t++) {
      const p = desde + t * 4;
      w[t] =
        ((datos[p] << 24) |
          (datos[p + 1] << 16) |
          (datos[p + 2] << 8) |
          datos[p + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        (rotar(w[t - 15], 7) ^ rotar(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 =
        (rotar(w[t - 2], 17) ^ rotar(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = this.h;
    for (let t = 0; t < 64; t++) {
      const S1 = (rotar(e, 6) ^ rotar(e, 11) ^ rotar(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = (rotar(a, 2) ^ rotar(a, 13) ^ rotar(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + h) >>> 0;
  }
}

/** Atajo para una sola pasada. */
export function sha256(datos: Uint8Array): string {
  return new Sha256().actualizar(datos).terminar();
}
