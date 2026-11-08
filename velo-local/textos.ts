// El texto de Velo local, en el idioma de la orden. El catálogo vive con el resto del texto de Velo
// (`src/lib/idioma/textos/velo-local.ts`), donde el gate de paridad lo encuentra solo.

import {
  decir,
  esIdioma,
  sinMarcado,
  type Datos,
  type Idioma,
  type Texto,
} from "@/lib/idioma";
import { VELO_LOCAL } from "@/lib/idioma/textos/velo-local";

export { VELO_LOCAL };

export type ClaveDeError = keyof typeof VELO_LOCAL.error;

/**
 * Un error que Velo sabe explicar: su clave y sus datos, nunca un texto armado con lo que había en
 * la celda o en la conexión. El texto se arma al final, en el idioma de la orden.
 */
export class ErrorDeVelo extends Error {
  constructor(
    readonly clave: ClaveDeError,
    readonly datos: Datos = {},
  ) {
    super(clave);
    this.name = "ErrorDeVelo";
  }
}

/** Un texto del catálogo, para la consola: sin el marcado de la pantalla. */
export function texto(t: Texto, idioma: Idioma, datos?: Datos): string {
  return sinMarcado(decir(t, idioma, datos));
}

export function textoDeError(error: ErrorDeVelo, idioma: Idioma): string {
  return texto(VELO_LOCAL.error[error.clave], idioma, error.datos);
}

/** El idioma de la orden: `--idioma`, o el de la consola (`LANG`), o español. */
export function idiomaDe(
  pedido: string | undefined,
  lang = process.env.LANG,
): Idioma {
  if (esIdioma(pedido)) return pedido;
  const delSistema = (lang ?? "").slice(0, 2);
  return esIdioma(delSistema) ? delSistema : "es";
}
