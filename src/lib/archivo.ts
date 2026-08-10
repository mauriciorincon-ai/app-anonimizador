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

export function formatoDeArchivo(nombre: string): FormatoDeArchivo | null {
  if (/\.csv$/i.test(nombre)) return "csv";
  if (/\.xlsx?$/i.test(nombre)) return "excel";
  return null;
}

/** ¿Un Excel lo bastante grande como para avisar, pero por debajo del tope? */
export function excelGrande(formato: FormatoDeArchivo, bytes: number): boolean {
  return (
    formato === "excel" &&
    bytes >= AVISO_EXCEL_BYTES &&
    bytes <= TOPE_EXCEL_BYTES
  );
}

export function excedeElTope(
  formato: FormatoDeArchivo,
  bytes: number,
): boolean {
  return formato === "excel" && bytes > TOPE_EXCEL_BYTES;
}
