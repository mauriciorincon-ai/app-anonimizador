// Cómo Velo escribe un número.
//
// Cada idioma usa su propia convención: en español (colombiano) punto para los miles y coma para
// los decimales (1.234.567 y 0,5); en inglés, al revés (1,234,567 y 0.5). No es un detalle
// cosmético — un archivo de cédulas leído con la convención equivocada se lee mal. Por eso el
// idioma es un parámetro OBLIGATORIO de cada función: con uno opcional, un llamador que lo olvide
// escribiría «1.234» en una pantalla en inglés sin que nada se queje.
//
// Y una regla propia del producto: **todo número enseña su denominador**. "412 registros únicos"
// sin "de 3.000" no es información, es alarma. De ahí `deCada()`.

import { decir, formatoNumerico, type Idioma } from "@/lib/idioma";
import { COMUN } from "@/lib/idioma/textos/comun";

export function numero(valor: number, idioma: Idioma): string {
  return formatoNumerico(idioma, { maximumFractionDigits: 0 }).format(valor);
}

/** Por debajo de esto, un decimal ya no alcanza y el redondeo escribiría un cero. */
const MINIMO_REPRESENTABLE = 0.05;

/**
 * Porcentaje con la precisión justa: sin decimales cuando el número es grande, con uno cuando es
 * pequeño. Redondear "0,04 %" a "0 %" convertiría un riesgo real en un cero tranquilizador.
 *
 * Y el decimal tampoco basta solo: en un archivo de 500.000 filas, UNA persona sola es 0,0002 % —
 * que con un decimal se escribe "0,0 %", el mismo cero tranquilizador un orden de magnitud más
 * abajo. Ahí el número deja de ser el instrumento y se dice con palabras. La cifra de al lado
 * ("1 de 500.000") sigue llevando la verdad exacta; esta línea solo deja de contradecirla.
 */
export function porcentaje(proporcion: number, idioma: Idioma): string {
  const valor = proporcion * 100;
  if (valor > 0 && valor < MINIMO_REPRESENTABLE)
    return decir(COMUN.formato.menosDeUnDecimo, idioma);
  const decimales = valor > 0 && valor < 10 ? 1 : 0;
  return decir(COMUN.formato.porcentaje, idioma, {
    valor: formatoNumerico(idioma, {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor),
  });
}

/** "412 de 3.000" — la cifra con su denominador pegado, nunca suelta. */
export function deCada(parte: number, total: number, idioma: Idioma): string {
  return decir(COMUN.formato.deCada, idioma, {
    parte: numero(parte, idioma),
    total: numero(total, idioma),
  });
}

export function bytes(valor: number, idioma: Idioma): string {
  if (valor < 1024) return `${numero(valor, idioma)} B`;
  const mb = valor / (1024 * 1024);
  if (mb < 1)
    return `${formatoNumerico(idioma, { maximumFractionDigits: 0 }).format(valor / 1024)} KB`;
  return `${formatoNumerico(idioma, { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}

export function milisegundos(valor: number, idioma: Idioma): string {
  if (valor < 1000) return `${numero(valor, idioma)} ms`;
  return `${formatoNumerico(idioma, { maximumFractionDigits: 1 }).format(valor / 1000)} s`;
}

/**
 * El riesgo por registro como fracción legible: "1 en 3" dice más que "0,33".
 *
 * El caso límite es el importante: con k = 1 el registro está solo, y la forma honesta de decirlo
 * es "1 en 1" — uno a uno, señalable con el dedo.
 */
export function unoEn(riesgo: number, idioma: Idioma): string {
  if (riesgo <= 0) return "—";
  return decir(COMUN.formato.unoEn, idioma, { n: numero(Math.round(1 / riesgo), idioma) });
}
