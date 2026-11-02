// Imágenes (S6) — la puerta única al análisis y a la limpieza de JPEG, PNG y WebP.
//
// El worker llama aquí con los bytes y el formato que dijo `formatoPorContenido` (los bytes
// mágicos, no la extensión). Cada formato tiene su lector (`jpeg.ts`, `png.ts`, `webp.ts`); los tres
// comparten el inventario (`inventario.ts`), que es donde se aplican las reglas comunes a todo
// campo: `MAXIMO_DE_CAMPOS` (los demás se cuentan y se avisa `campos-de-mas`) y el recorte a
// `LARGO_MAXIMO_DE_VALOR` (`valores-recortados`). Así el tope se aplica MIENTRAS se lee, sin juntar
// primero cien mil palabras clave para descartarlas después.
//
// La limpieza se comprueba a sí misma antes de devolver nada: la copia limpia se vuelve a analizar
// y, si todavía trae un campo o algo que se quitaría, no se entrega (`limpieza-incompleta`). Esa
// segunda lectura es la misma que ve el usuario en el certificado: lo que queda es solo lo que se
// conserva y se declara.

import { analizarJpeg, limpiarJpeg } from "./jpeg";
import { analizarPng, limpiarPng } from "./png";
import {
  type AnalisisDeMetadatos,
  ErrorDeMetadatos,
  type FormatoDeImagen,
  type Limpieza,
} from "./tipos";
import { analizarWebp, limpiarWebp } from "./webp";

/**
 * Qué dice la imagen de sí misma, crudo (vive en el worker). Lanza `ErrorDeMetadatos` con
 * `imagen-ilegible` si el contenedor no es del formato o está roto; nunca otro error.
 */
export function analizarImagen(
  bytes: Uint8Array,
  formato: FormatoDeImagen,
): AnalisisDeMetadatos {
  switch (formato) {
    case "jpeg":
      return analizarJpeg(bytes);
    case "png":
      return analizarPng(bytes);
    case "webp":
      return analizarWebp(bytes);
  }
}

function limpiar(bytes: Uint8Array, formato: FormatoDeImagen): Limpieza {
  switch (formato) {
    case "jpeg":
      return limpiarJpeg(bytes);
    case "png":
      return limpiarPng(bytes);
    case "webp":
      return limpiarWebp(bytes);
  }
}

/**
 * La copia limpia, con la lista de lo que se quitó y de lo que se conservó. Determinista: los mismos
 * bytes dan la misma copia, byte por byte. Lanza `imagen-ilegible` si la entrada no se puede leer y
 * `limpieza-incompleta` si la copia no pasa su propia comprobación.
 */
export function limpiarImagen(
  bytes: Uint8Array,
  formato: FormatoDeImagen,
): Limpieza {
  const limpieza = limpiar(bytes, formato);
  let despues: AnalisisDeMetadatos;
  try {
    despues = analizarImagen(limpieza.bytes, formato);
  } catch (error) {
    if (error instanceof ErrorDeMetadatos)
      throw new ErrorDeMetadatos("limpieza-incompleta");
    throw error;
  }
  if (despues.campos.length > 0 || despues.quitables.length > 0)
    throw new ErrorDeMetadatos("limpieza-incompleta");
  return limpieza;
}
