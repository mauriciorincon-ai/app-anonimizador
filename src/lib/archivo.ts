// Reglas de admisión de la aduana: qué archivos entran y hasta qué tamaño.
//
// Módulo puro y sin dependencias a propósito: lo usan la interfaz (que decide antes de crear el
// worker) y el propio worker. Nada de esto puede vivir dentro del worker, porque entonces la
// página tendría que cargar el worker solo para saber si el archivo sirve.

import type { FormatoDeArchivo } from "@/workers/contrato";

/**
 * Tope duro para `.xlsx`, medido en el spike B (decisions/003-excel-suministro-y-tope.md).
 *
 * Está en BYTES DE ARCHIVO y no en filas, y la diferencia importa: el número de filas de un .xlsx
 * no se conoce hasta abrirlo, y abrirlo es justo la operación que puede tumbar la pestaña —
 * SheetJS no tiene lectura en streaming en el navegador, así que el libro entero entra a memoria.
 * `file.size`, en cambio, se conoce en el momento en que el usuario suelta el archivo.
 *
 * El CSV no tiene tope: se lee por chunks y nunca existe una copia completa en memoria.
 */
export const TOPE_EXCEL_BYTES = 150 * 1024 * 1024;

/** Desde aquí el archivo sigue entrando, pero se avisa y se ofrece la salida (guardar como CSV). */
export const AVISO_EXCEL_BYTES = 40 * 1024 * 1024;

/**
 * Topes de un PDF y de una imagen (S6). Los dos se abren ENTEROS en el worker —un PDF no se puede
 * reescribir por trozos, y una imagen se reescribe de una vez—, así que, como el Excel, tienen tope
 * por bytes y se decide sin abrirlos.
 *
 * El del PDF es medido (tabla en `src/workers/limpiar-pdf.ts`): lo que cuesta memoria son sus
 * objetos, y con 50 MB el peor caso aceptado queda en ≈ 0,75 GB de pico; el worker añade un tope de
 * objetos y uno de lo que se infla. Una imagen solo vive dos veces (la entrada y la copia limpia),
 * sin grafo encima: 100 MB son ≈ 200 MB.
 */
export const TOPE_PDF_BYTES = 50 * 1024 * 1024;
export const TOPE_IMAGEN_BYTES = 100 * 1024 * 1024;

export function formatoDeArchivo(nombre: string): FormatoDeArchivo | null {
  if (/\.csv$/i.test(nombre)) return "csv";
  if (/\.xlsx?$/i.test(nombre)) return "excel";
  // JSON y JSON Lines son el mismo formato para la interfaz: cuál de los dos es lo decide el worker.
  if (/\.(json|jsonl|ndjson)$/i.test(nombre)) return "json";
  // PDF e imágenes: la extensión solo abre la puerta. Qué son lo deciden sus bytes, en el worker.
  if (/\.pdf$/i.test(nombre)) return "pdf";
  if (/\.(jpe?g|jpe|png|webp|heic|heif)$/i.test(nombre)) return "imagen";
  return null;
}

/** ¿Es un formato al que Velo le limpia los metadatos (no una tabla)? */
export function esDeMetadatos(
  formato: FormatoDeArchivo,
): formato is "pdf" | "imagen" {
  return formato === "pdf" || formato === "imagen";
}

/** ¿Un Excel lo bastante grande como para avisar, pero por debajo del tope? */
export function excelGrande(formato: FormatoDeArchivo, bytes: number): boolean {
  return (
    formato === "excel" &&
    bytes >= AVISO_EXCEL_BYTES &&
    bytes <= TOPE_EXCEL_BYTES
  );
}

/** El motivo con el que se rechaza, sin abrirlo, un archivo por encima de su tope; o null. */
export function motivoDelTope(
  formato: FormatoDeArchivo,
  bytes: number,
): "excel-excede-tope" | "pdf-excede-tope" | "imagen-excede-tope" | null {
  if (formato === "excel" && bytes > TOPE_EXCEL_BYTES)
    return "excel-excede-tope";
  if (formato === "pdf" && bytes > TOPE_PDF_BYTES) return "pdf-excede-tope";
  if (formato === "imagen" && bytes > TOPE_IMAGEN_BYTES)
    return "imagen-excede-tope";
  return null;
}

export function excedeElTope(
  formato: FormatoDeArchivo,
  bytes: number,
): boolean {
  return motivoDelTope(formato, bytes) !== null;
}
