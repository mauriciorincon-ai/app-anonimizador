// Rutas de un JSON (S6) — el nombre de una columna que viene de un campo anidado.
//
// `{"paciente":{"contacto":{"correo":"…"}}}` se vuelve la columna `paciente.contacto.correo`. El
// punto separa niveles, así que una clave que LLEVA un punto (`"a.b"`) no puede escribirse igual que
// dos niveles (`{"a":{"b":…}}`) o el archivo de salida las fundiría. El escape es una barra invertida
// delante de `\ . [ ]` (los corchetes porque `[]` marca una lista: `contactos[]`), y la clave vacía
// —legal en JSON— se escribe `\_`, que ninguna otra clave puede producir (una clave `_` se queda `_`).
//
// Unir y partir son inversas exactas para cualquier clave: eso es lo que permite que el escritor
// reconstruya la estructura a partir del NOMBRE de la columna y que dos campos distintos jamás
// colisionen en una misma columna.

/** Lo que cierra el nombre de una lista: `contactos[]`. */
export const SUFIJO_DE_LISTA = "[]";

const NECESITA_ESCAPE = /[\\.[\]]/g;

/** Una clave como segmento de ruta: escapa `\ . [ ]` y marca la clave vacía como `\_`. */
export function escaparSegmento(segmento: string): string {
  if (segmento === "") return "\\_";
  return segmento.replace(NECESITA_ESCAPE, "\\$&");
}

/** Los segmentos (claves sin escapar) hechos nombre de columna. */
export function unirRuta(segmentos: readonly string[]): string {
  let ruta = "";
  for (let i = 0; i < segmentos.length; i++) {
    if (i > 0) ruta += ".";
    ruta += escaparSegmento(segmentos[i]);
  }
  return ruta;
}

/**
 * El nombre de columna deshecho en sus claves. Solo entiende rutas de valores sueltos (las que
 * `unirRuta` produce): el `[]` de una lista es una MARCA de la ruta de una lista, no una clave, y esas
 * rutas jamás vuelven a partirse, solo se muestran.
 */
export function partirRuta(ruta: string): string[] {
  if (ruta === "") return [];
  const segmentos: string[] = [];
  let actual = "";
  for (let i = 0; i < ruta.length; i++) {
    const c = ruta[i];
    if (c === "\\") {
      const siguiente = ruta[i + 1];
      // `\_` solo vale como segmento ENTERO (la clave vacía); en otro sitio sería una `_` escapada
      // de más y se lee como la `_` que es.
      const finDeSegmento = i + 2 >= ruta.length || ruta[i + 2] === ".";
      if (siguiente === "_" && actual === "" && finDeSegmento) {
        i++;
        continue;
      }
      if (siguiente !== undefined) actual += siguiente;
      i++;
    } else if (c === ".") {
      segmentos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  segmentos.push(actual);
  return segmentos;
}
