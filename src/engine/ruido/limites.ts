// Los límites del ruido (S7) que también lee la página (el panel y el certificado). Viven aparte de
// `index.ts` por peso: este archivo no importa nada, así que nombrar el tope no arrastra el motor
// del ruido al bundle de la pantalla.
//
// S10: aquí vive también la escala del Laplace. El esquema de la política (`politica.ts`, que viaja
// en la página) y el motor del ruido la calculan con la MISMA función, para que no puedan discrepar:
// antes el esquema aceptaba rangos que el motor rechazaba, y el worker se caía (deuda del S7).

/** El dominio más grande que la respuesta aleatorizada acepta. */
export const DOMINIO_MAXIMO = 64;

/** Los ε que la política admite, como racionales (numerador, denominador). */
export const EPSILONES = {
  "0.1": [1, 10],
  "0.5": [1, 2],
  "1": [1, 1],
  "2": [2, 1],
  "4": [4, 1],
  "8": [8, 1],
} as const satisfies Record<string, readonly [number, number]>;

export type ClaveDeEpsilon = keyof typeof EPSILONES;

/** Hasta dónde sortea exacto `AzarSembrado.uniforme` (53 bits de dos palabras; ver `azar.ts`). */
export const TOPE_UNIFORME = 2 ** 40;

export const NUMERO = /^(-?)(\d+)(?:[.,](\d+))?$/;

/** `"37,25"` con 1 decimal → 373 (redondeo mitad hacia arriba, sobre los dígitos: sin flotantes). */
export function aUnidades(texto: string, decimales: number): number | null {
  const m = NUMERO.exec(texto.trim());
  if (!m) return null;
  const fraccion = (m[3] ?? "").padEnd(decimales + 1, "0");
  let unidades =
    Number(m[2]) * 10 ** decimales +
    Number(fraccion.slice(0, decimales) || "0");
  if (Number(fraccion[decimales]) >= 5) unidades += 1;
  if (!Number.isSafeInteger(unidades)) return null;
  return m[1] === "-" && unidades !== 0 ? -unidades : unidades;
}

/** Sensibilidad en unidades de la rejilla y escala t del Laplace, o null si no caben exactas. */
export function escalaDelLaplace(tecnica: {
  readonly epsilon: number;
  readonly minimo: number;
  readonly maximo: number;
  readonly decimales: number;
}): { minimo: number; maximo: number; s: number; t: number } | null {
  const minimo = aUnidades(String(tecnica.minimo), tecnica.decimales);
  const maximo = aUnidades(String(tecnica.maximo), tecnica.decimales);
  if (minimo === null || maximo === null || maximo <= minimo) return null;
  const racional: readonly [number, number] | undefined =
    EPSILONES[String(tecnica.epsilon) as ClaveDeEpsilon];
  if (racional === undefined) return null;
  const [a, b] = racional;
  const t = b * (maximo - minimo);
  return t <= TOPE_UNIFORME ? { minimo, maximo, s: a, t } : null;
}
