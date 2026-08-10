// Enmascarado de MUESTRAS para la interfaz.
//
// Ojo con lo que este archivo NO es: en el Sprint 001 Velo no transforma datos. Esto no toca el
// dataset ni produce archivo de salida — solo prepara el valor de ejemplo que la tabla de
// diagnóstico enseña, para que ni el propio diagnóstico exponga un dato completo sin necesidad.
//
// Regla: se revela poco y siempre por los extremos, que es donde vive el formato (lo que ayuda a
// reconocer la columna) y no la identidad.

/**
 * Cuánto se revela, según lo que haya para esconder.
 *
 * La regla: **nunca más de la mitad del valor a la vista.** Con extremos fijos de 3+2 la máscara
 * se rompía justo donde más importa — una placa mide 6 caracteres, así que `ABC123` salía como
 * `ABC***23` y dejaba UN carácter oculto: diez candidatos, no una máscara. Una cédula de serie
 * histórica (7–8 dígitos) quedaba igual de expuesta. Y esa muestra no se queda en la pantalla:
 * viaja dentro del reporte HTML que el usuario le manda a alguien más.
 *
 * Los tramos solo aprietan; ninguno revela más de lo que revelaba antes.
 */
function extremos(longitud: number): { cabeza: number; cola: number } {
  if (longitud >= 10) return { cabeza: 3, cola: 2 };
  if (longitud >= 6) return { cabeza: 2, cola: 1 };
  // Por debajo de 6 no hay nada que esconder: revelar los extremos sería enseñar el valor.
  return { cabeza: 0, cola: 0 };
}

/**
 * `1032456789` → `103***89`, `ABC123` → `AB***3`. Determinista: el mismo valor da siempre la
 * misma máscara.
 *
 * El número de asteriscos NO refleja la longitud oculta — es fijo. Si variara, la máscara
 * filtraría cuántos caracteres tiene el valor original, que en un dataset de identificadores es
 * información suficiente para estrechar mucho el campo.
 */
export function enmascarar(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length === 0) return "";
  const { cabeza, cola } = extremos(limpio.length);
  if (cabeza === 0) return "***";
  return `${limpio.slice(0, cabeza)}***${limpio.slice(-cola)}`;
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
