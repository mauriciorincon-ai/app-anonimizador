// Qué es un archivo, por sus primeros bytes — no por su nombre.
//
// La extensión la escribe cualquiera (una foto `.jpg` que en realidad es un PNG es lo más común del
// mundo); los bytes mágicos los escribe el programa que hizo el archivo. Velo trata el archivo por lo
// que ES, y si la extensión dice otra cosa lo avisa (`extension-distinta`) en vez de fallar o de
// adivinar.

import type { FormatoBinario } from "./tipos";

/**
 * Hasta dónde se busca la cabecera `%PDF-`. La norma la quiere al principio, pero los lectores
 * aceptan basura delante en el primer kilobyte (ISO 32000-1, anexo H.3, nota 3); Velo hace lo mismo
 * y la reescritura la deja fuera.
 */
const ALCANCE_DE_LA_CABECERA_PDF = 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function empiezaCon(bytes: Uint8Array, firma: readonly number[], desde = 0) {
  if (bytes.length < desde + firma.length) return false;
  for (let i = 0; i < firma.length; i++)
    if (bytes[desde + i] !== firma[i]) return false;
  return true;
}

function ascii(texto: string): number[] {
  return [...texto].map((c) => c.charCodeAt(0));
}

const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const CABECERA_PDF = ascii("%PDF-");

/** Posición de `%PDF-` dentro del primer kilobyte, o -1. */
export function inicioDelPdf(bytes: Uint8Array): number {
  const tope = Math.min(bytes.length, ALCANCE_DE_LA_CABECERA_PDF);
  for (let i = 0; i + CABECERA_PDF.length <= tope; i++)
    if (empiezaCon(bytes, CABECERA_PDF, i)) return i;
  return -1;
}

export function formatoPorContenido(bytes: Uint8Array): FormatoBinario | null {
  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (empiezaCon(bytes, PNG)) return "png";
  if (empiezaCon(bytes, RIFF) && empiezaCon(bytes, WEBP, 8)) return "webp";
  if (inicioDelPdf(bytes) >= 0) return "pdf";
  return null;
}

/** La extensión que le corresponde al contenido: es la que lleva el archivo limpio. */
export const EXTENSION_DEL_FORMATO: Record<FormatoBinario, string> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

/** El tipo MIME del archivo limpio. */
export const MIME_DEL_FORMATO: Record<FormatoBinario, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** ¿La extensión del nombre corresponde al formato de los bytes? */
export function extensionCoincide(
  nombre: string,
  formato: FormatoBinario,
): boolean {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre)?.[1]?.toLowerCase() ?? "";
  if (formato === "jpeg")
    return extension === "jpg" || extension === "jpeg" || extension === "jpe";
  return extension === formato;
}
