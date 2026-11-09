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
const FTYP = ascii("ftyp");
const CABECERA_PDF = ascii("%PDF-");

/**
 * Marcas de `ftyp` que dicen «HEIC»: foto fija y secuencia de imágenes HEVC (ISO/IEC 23008-12,
 * anexo B: `heic`/`heix`/`heim`/`heis` y `hevc`/`hevx`/`hevm`/`hevs`).
 */
export const MARCAS_HEIC: ReadonlySet<string> = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
]);

/** Marcas de `ftyp` que dicen «AVIF»: foto fija y secuencia AV1 (AV1 Image File Format, AOM, 7). */
export const MARCAS_AVIF: ReadonlySet<string> = new Set(["avif", "avis"]);

/** La marca de QuickTime (QuickTime File Format, «File Type Compatibility Atom»): el `.mov`. */
export const MARCAS_MOV: ReadonlySet<string> = new Set(["qt  "]);

/** Qué marcas tiene que traer el `ftyp` de cada formato de la familia ISO BMFF. */
export const MARCAS_DEL_FORMATO: Record<
  "heic" | "avif" | "mov",
  ReadonlySet<string>
> = { heic: MARCAS_HEIC, avif: MARCAS_AVIF, mov: MARCAS_MOV };

/**
 * Un HEIC, un AVIF o un `.mov` empiezan con la caja `ftyp`: su tamaño, `ftyp`, la marca principal,
 * una versión y las marcas compatibles. Manda la marca principal; si no es de ninguno, la primera
 * compatible que lo sea. Un HEIF con otra codificación (JPEG en HEIF, por ejemplo) no es ninguno de
 * los tres, y Velo no lo trata.
 */
function formatoBmff(bytes: Uint8Array): "heic" | "avif" | "mov" | null {
  if (!empiezaCon(bytes, FTYP, 4)) return null;
  const tamano =
    bytes[0] * 0x1000000 + ((bytes[1] << 16) | (bytes[2] << 8) | bytes[3]);
  const fin = Math.min(tamano, bytes.length);
  const marca = (p: number) =>
    String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
  if (fin < 16) return null;
  const de = (m: string) =>
    MARCAS_HEIC.has(m)
      ? "heic"
      : MARCAS_AVIF.has(m)
        ? "avif"
        : MARCAS_MOV.has(m)
          ? "mov"
          : null;
  const principal = de(marca(8));
  if (principal) return principal;
  for (let p = 16; p + 4 <= fin; p += 4) {
    const compatible = de(marca(p));
    if (compatible) return compatible;
  }
  return null;
}

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
  const bmff = formatoBmff(bytes);
  if (bmff) return bmff;
  if (inicioDelPdf(bytes) >= 0) return "pdf";
  return null;
}

/** La extensión que le corresponde al contenido: es la que lleva el archivo limpio. */
export const EXTENSION_DEL_FORMATO: Record<FormatoBinario, string> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  heic: "heic",
  avif: "avif",
  mov: "mov",
};

/** El tipo MIME del archivo limpio. */
export const MIME_DEL_FORMATO: Record<FormatoBinario, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  avif: "image/avif",
  mov: "video/quicktime",
};

/** ¿La extensión del nombre corresponde al formato de los bytes? */
export function extensionCoincide(
  nombre: string,
  formato: FormatoBinario,
): boolean {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre)?.[1]?.toLowerCase() ?? "";
  if (formato === "jpeg")
    return extension === "jpg" || extension === "jpeg" || extension === "jpe";
  if (formato === "heic") return extension === "heic" || extension === "heif";
  if (formato === "mov") return extension === "mov" || extension === "qt";
  return extension === formato;
}
