// Cómo Velo escribe un número.
//
// Formato colombiano: punto para los miles, coma para los decimales (1.234.567 y 0,5). No es un
// detalle cosmético — un archivo de cédulas leído con la convención equivocada se lee mal.
//
// Y una regla propia del producto: **todo número enseña su denominador**. "412 registros únicos"
// sin "de 3.000" no es información, es alarma. De ahí `deCada()`.

const ENTERO = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function numero(valor: number): string {
  return ENTERO.format(valor);
}

/**
 * Porcentaje con la precisión justa: sin decimales cuando el número es grande, con uno cuando es
 * pequeño. Redondear "0,04%" a "0%" convertiría un riesgo real en un cero tranquilizador.
 */
export function porcentaje(proporcion: number): string {
  const valor = proporcion * 100;
  const decimales = valor > 0 && valor < 10 ? 1 : 0;
  return `${new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor)} %`;
}

/** "412 de 3.000" — la cifra con su denominador pegado, nunca suelta. */
export function deCada(parte: number, total: number): string {
  return `${numero(parte)} de ${numero(total)}`;
}

export function bytes(valor: number): string {
  if (valor < 1024) return `${numero(valor)} B`;
  const mb = valor / (1024 * 1024);
  if (mb < 1)
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(valor / 1024)} KB`;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}

export function milisegundos(valor: number): string {
  if (valor < 1000) return `${numero(valor)} ms`;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(valor / 1000)} s`;
}

/**
 * El riesgo por registro como fracción legible: "1 en 3" dice más que "0,33".
 *
 * El caso límite es el importante: con k = 1 el registro está solo, y la forma honesta de decirlo
 * es "1 en 1" — uno a uno, señalable con el dedo.
 */
export function unoEn(riesgo: number): string {
  if (riesgo <= 0) return "—";
  return `1 en ${numero(Math.round(1 / riesgo))}`;
}
