// El azar del ruido (S7): sembrado por la llave del usuario, y separado del de los seudónimos.
//
// Regla dura 3: mismo archivo + misma política + misma llave + mismo idioma ⇒ el mismo archivo,
// byte por byte, también con ruido. Por eso aquí no hay `Math.random` ni `crypto.getRandomValues`
// (los dos están vetados en `src/engine/` y un test lo vigila): el azar de cada celda sale de la
// HMAC de la llave, que es secreta, y quien no la tiene no puede ni predecirlo ni quitarlo. Correr
// dos veces el mismo archivo da el MISMO ruido, así que no se puede promediar para limpiarlo.
//
// La semilla de cada celda (32 bytes):
//
//     HMAC-SHA256(llave, "velo-ruido-v1" ‖ 0 ‖ huella ‖ 0 ‖ tecnica ‖ 0 ‖ campo ‖ 0 ‖ fila)
//
//   · la etiqueta separa este dominio del de los seudónimos (que firman el valor solo): ningún
//     ruido puede coincidir con un seudónimo, y los seudónimos no cambian;
//   · la `huella` es el SHA-256 del archivo de entrada. Sin ella, dos archivos con las filas en el
//     mismo orden (el reporte de marzo y el de abril de los mismos clientes) recibirían el MISMO
//     ruido en cada fila, y quien conociera un valor de marzo despejaría el ruido y leería el de
//     abril exacto. Con ella, archivos distintos reciben ruido independiente y el ε de cada
//     entrega se suma, como dice la teoría (ADR-014);
//   · la `tecnica` es la serialización canónica de la técnica con sus parámetros (mecanismo, ε,
//     rango, decimales, porcentaje). Sin ella, el MISMO archivo entregado con ε = 1 y con ε = 2
//     compartiría el azar: el segundo ruido sería el primero a escala, y restando las dos entregas
//     se despeja el valor. Con ella, otra técnica es otro azar, independiente, y los ε se suman;
//     la misma técnica repite el mismo ruido, y una entrega repetida no enseña nada nuevo. Es JSON:
//     no lleva un 0 crudo, así que no se confunde con el campo que la sigue;
//   · el campo y la fila hacen independiente cada celda.
//
// Las palabras de 32 bits: el bloque 0 es la semilla misma; el bloque b ≥ 1 es
// SHA-256(semilla ‖ b), con b en 4 bytes big-endian: SHA-256 en modo contador sobre una semilla
// secreta de 256 bits. La llave no es extraíble (ADR-004) y Web Crypto es asíncrono, así que la
// HMAC da la semilla y el resto se expande aquí, de forma síncrona, con el SHA-256 propio del repo
// (FIPS 180-4, `src/lib/sha256.ts`).

import { Sha256 } from "@/lib/sha256";

import { TOPE_UNIFORME } from "./limites";

export const ETIQUETA_DEL_RUIDO = "velo-ruido-v1";

const codificador = new TextEncoder();

/** La semilla de una celda. Ver el encabezado. */
export async function semillaDeCelda(
  llave: CryptoKey,
  huella: string,
  tecnica: string,
  campo: string,
  fila: number,
): Promise<Uint8Array> {
  const firma = await crypto.subtle.sign(
    "HMAC",
    llave,
    codificador.encode(
      `${ETIQUETA_DEL_RUIDO}\0${huella}\0${tecnica}\0${campo}\0${String(fila)}`,
    ),
  );
  return new Uint8Array(firma);
}

const DOS_A_LA_32 = 0x1_0000_0000;
const DOS_A_LA_53 = 2 ** 53;

/** El tope de `uniforme`: lo que un `number` cuenta exacto con margen para los productos de abajo. */
export { TOPE_UNIFORME };

/** Una fuente de palabras de 32 bits que sale de una semilla y nunca se acaba. */
export class AzarSembrado {
  private palabras: Uint32Array;
  private posicion = 0;
  private bloque = 0;

  constructor(private readonly semilla: Uint8Array) {
    this.palabras = palabrasDe(semilla);
  }

  palabra(): number {
    if (this.posicion === this.palabras.length) {
      this.bloque++;
      const contador = new Uint8Array(4);
      new DataView(contador.buffer).setUint32(0, this.bloque, false);
      this.palabras = new Sha256()
        .actualizar(this.semilla)
        .actualizar(contador)
        .terminarEnPalabras();
      this.posicion = 0;
    }
    return this.palabras[this.posicion++];
  }

  /**
   * Un entero uniforme en [0, n), EXACTO: por rechazo, sin el sesgo del módulo. Hasta 2³² con una
   * palabra; hasta `TOPE_UNIFORME` con 53 bits de dos palabras (un `number` los cuenta sin pérdida).
   */
  uniforme(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TOPE_UNIFORME)
      throw new RangeError(`uniforme: n fuera de rango (${n})`);
    if (n <= DOS_A_LA_32) {
      const limite = DOS_A_LA_32 - (DOS_A_LA_32 % n);
      for (;;) {
        const w = this.palabra();
        if (w < limite) return w % n;
      }
    }
    const limite = DOS_A_LA_53 - (DOS_A_LA_53 % n);
    for (;;) {
      const r = (this.palabra() >>> 11) * DOS_A_LA_32 + this.palabra();
      if (r < limite) return r % n;
    }
  }

  /** Bernoulli(num/den), exacto: un entero uniforme en [0, den) cae por debajo de `num`. */
  bernoulli(num: number, den: number): boolean {
    return this.uniforme(den) < num;
  }
}

function palabrasDe(bytes: Uint8Array): Uint32Array {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const palabras = new Uint32Array(Math.floor(bytes.byteLength / 4));
  for (let i = 0; i < palabras.length; i++)
    palabras[i] = vista.getUint32(i * 4, false);
  return palabras;
}
