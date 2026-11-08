// Muestreo EXACTO para el ruido con garantía (S7), sin coma flotante.
//
// Canonne, Kamath y Steinke, *The Discrete Gaussian for Differential Privacy*, NeurIPS 2020
// (arXiv:2004.00010), algoritmos 1 y 2. Es la respuesta a Mironov, *On Significance of the Least
// Significant Bits for Differential Privacy*, CCS 2012: un Laplace muestreado con flotantes deja
// huecos y patrones en los bits bajos que pueden delatar el valor original, y la garantía de ε se
// rompe sin que nada lo avise. Aquí todo es aritmética entera sobre un azar exacto
// (`AzarSembrado.uniforme`): las probabilidades son las que el papel dice, no aproximaciones.
//
// Los ε son racionales de una lista fija (`EPSILONES`), para que la escala del Laplace sea un
// cociente de enteros. Los números se pasan a una rejilla entera (la de los decimales pedidos)
// antes de sumarles ruido, y se devuelven a decimales al final: el ruido mismo es entero.

import type { AzarSembrado } from "./azar";

import { EPSILONES, type ClaveDeEpsilon } from "./limites";

/** Los ε que la política admite, como racionales: viven en `limites.ts`, con la escala del Laplace. */
export { EPSILONES, type ClaveDeEpsilon };

/**
 * Bernoulli(exp(−n/d)), exacto, con n ≥ 0 y d ≥ 1 enteros (algoritmo 1).
 *
 * Con γ = n/d en [0, 1]: se sacan Bernoulli(γ/k) con k = 1, 2, 3… hasta el primer 0; sale 1 si el
 * k en que paró es impar. Con γ > 1 se parte en ⌊γ⌋ ensayos de Bernoulli(exp(−1)) y un resto.
 */
export function bernoulliExpNeg(
  azar: AzarSembrado,
  n: number,
  d: number,
): boolean {
  if (n <= d) {
    // Bernoulli(γ/k) como el producto de dos independientes, Bernoulli(n/d) y Bernoulli(1/k): da
    // la misma probabilidad sin que el denominador d·k crezca fuera de lo que `uniforme` cuenta.
    let k = 1;
    while (azar.bernoulli(n, d) && azar.bernoulli(1, k)) k++;
    return k % 2 === 1;
  }
  const enteros = Math.floor(n / d);
  for (let i = 0; i < enteros; i++)
    if (!bernoulliExpNeg(azar, 1, 1)) return false;
  return bernoulliExpNeg(azar, n - enteros * d, d);
}

/**
 * Laplace discreto de escala t/s: P[Y = y] ∝ exp(−|y|·s/t) sobre los enteros (algoritmo 2).
 *
 * Con sensibilidad Δ (en unidades de la rejilla) y ε = a/b, la escala Δ/ε es t/s con s = a y
 * t = b·Δ: la razón entre las probabilidades de una misma salida para dos entradas a distancia
 * ≤ Δ queda acotada por e^ε, que es la privacidad diferencial (local, por valor).
 */
export function laplaceDiscreto(
  azar: AzarSembrado,
  s: number,
  t: number,
): number {
  for (;;) {
    const u = azar.uniforme(t);
    if (!bernoulliExpNeg(azar, u, t)) continue;
    let v = 0;
    while (bernoulliExpNeg(azar, 1, 1)) v++;
    const x = u + t * v;
    const y = Math.floor(x / s);
    const negativo = azar.bernoulli(1, 2);
    if (negativo && y === 0) continue;
    return negativo ? -y : y;
  }
}

// ── Respuesta aleatorizada ──────────────────────────────────────────────────────────────────────
//
// Con probabilidad w se responde un valor al azar entre los m del dominio; si no, el verdadero.
// P(y = x) = 1 − w + w/m y P(y = x′) = w/m, así que la razón es 1 + m(1 − w)/w, y es ε-DP local
// cuando w ≥ m / (e^ε − 1 + m). Velo elige w = W/2³² con el MENOR W entero que lo cumple, y para no
// depender del redondeo de `Math.exp` (que no es igual en todos los motores, y la regla 3 pide el
// mismo archivo en todos), usa una cota INFERIOR racional de e^ε: con ella, el w que sale es igual
// o mayor que el necesario, y el ε efectivo, igual o menor que el pedido. Exacto con BigInt.

/** Cotas inferiores de e^ε, truncadas a 9 decimales: L ≤ e^ε (un test lo comprueba). */
export const COTAS_DE_E: Record<ClaveDeEpsilon, readonly [bigint, bigint]> = {
  "0.1": [BigInt(1_105_170_918), BigInt(1_000_000_000)],
  "0.5": [BigInt(1_648_721_270), BigInt(1_000_000_000)],
  "1": [BigInt(2_718_281_828), BigInt(1_000_000_000)],
  "2": [BigInt(7_389_056_098), BigInt(1_000_000_000)],
  "4": [BigInt(54_598_150_033), BigInt(1_000_000_000)],
  "8": [BigInt(2_980_957_987_041), BigInt(1_000_000_000)],
};

export const DOS_A_LA_32 = 0x1_0000_0000;

/** El W (de 2³²) de la respuesta aleatorizada con m valores y ε pedido. Ver arriba. */
export function pesoDelAzar(m: number, epsilon: ClaveDeEpsilon): number {
  if (m <= 1) return 0;
  const [num, den] = COTAS_DE_E[epsilon];
  const mm = BigInt(m);
  // W ≥ 2³² · m / (L − 1 + m) = 2³² · m · den / (num − den + m · den)
  const arriba = BigInt(DOS_A_LA_32) * mm * den;
  const abajo = num - den + mm * den;
  const w = (arriba + abajo - BigInt(1)) / abajo;
  return Number(w > BigInt(DOS_A_LA_32) ? BigInt(DOS_A_LA_32) : w);
}

/**
 * El ε EFECTIVO de la respuesta aleatorizada: ln(1 + m(1 − w)/w). Es lo que se declara; siempre
 * es ≤ el pedido. Es una cifra para leer (pantalla, certificado, bitácora), no entra al archivo.
 */
export function epsilonEfectivo(m: number, peso: number): number {
  if (m <= 1 || peso <= 0) return 0;
  const w = peso / DOS_A_LA_32;
  return Math.log1p((m * (1 - w)) / w);
}
