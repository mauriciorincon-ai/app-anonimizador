// Enmascarado de MUESTRAS para la interfaz.
//
// Ojo con lo que este archivo NO es: en el Sprint 001 Velo no transforma datos. Esto no toca el
// dataset ni produce archivo de salida — solo prepara el valor de ejemplo que la tabla de
// diagnóstico enseña, para que ni el propio diagnóstico exponga un dato completo sin necesidad.
//
// Regla: se revela poco y siempre por los extremos, que es donde vive el formato (lo que ayuda a
// reconocer la columna) y no la identidad.

/** Cuántos caracteres se muestran al inicio, como máximo. */
const CABEZA = 3;
/** Cuántos al final, como máximo. */
const COLA = 2;
/** Por debajo de esta longitud no se revela nada: quedaría casi todo el valor a la vista. */
const LONGITUD_MINIMA_PARA_REVELAR = 6;

/**
 * `1032456789` → `103***89`. Determinista: el mismo valor da siempre la misma máscara.
 *
 * El número de asteriscos NO refleja la longitud oculta — es fijo. Si variara, la máscara
 * filtraría cuántos caracteres tiene el valor original, que en un dataset de identificadores es
 * información suficiente para estrechar mucho el campo.
 */
export function enmascarar(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length === 0) return "";
  if (limpio.length < LONGITUD_MINIMA_PARA_REVELAR) return "***";
  return `${limpio.slice(0, CABEZA)}***${limpio.slice(-COLA)}`;
}

/**
 * Muestra para una columna, o `null` cuando enseñarla no se justifica.
 *
 * Las columnas de datos sensibles del art. 5 (salud, origen étnico, convicciones) no llevan
 * muestra: sus valores son de baja cardinalidad —"Indígena", "J45.9"— y ninguna máscara los
 * protege de verdad, porque con tres opciones posibles el asterisco no esconde nada. El
 * diagnóstico dice QUÉ hay en la columna sin enseñar un solo valor.
 */
export function muestraParaColumna(
  valor: string | null,
  esSensible: boolean,
): { texto: string; omitida: boolean } | null {
  if (esSensible) return { texto: "", omitida: true };
  if (valor === null || valor.trim() === "") return null;
  return { texto: enmascarar(valor), omitida: false };
}
