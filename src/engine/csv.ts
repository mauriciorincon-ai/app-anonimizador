// El CSV de salida — el archivo que otra persona va a recibir.
//
// La promesa nº3 del sprint es que el mismo input produce el archivo **byte-idéntico**. Eso no sale
// de un `join(",")`: sale de fijar cinco decisiones y no volver a tocarlas. Están aquí, escritas,
// porque cambiar cualquiera cambia el hash del archivo y por tanto lo que el certificado del S3
// afirma.
//
//   1. **Separador:** coma. No punto y coma, aunque Excel en español lo prefiera — RFC 4180 dice
//      coma, y el archivo tiene que abrirse igual en cualquier herramienta del mundo.
//   2. **Comillas:** solo cuando hacen falta (el valor lleva coma, comilla, salto de línea, o
//      espacios en los bordes). Entrecomillarlo todo también sería válido y determinista, pero
//      engorda el archivo y lo hace más difícil de leer con los ojos.
//   3. **Escape:** la comilla se duplica (`"` → `""`), como manda RFC 4180. Nada de barras
//      invertidas: eso es JSON, no CSV.
//   4. **Fin de línea:** `\n`, no `\r\n`. RFC 4180 dice CRLF, pero se elige LF a propósito y se
//      declara: es lo que todo lector moderno espera, y mezclar los dos daría archivos distintos
//      según el sistema donde se generó — que es exactamente lo que el determinismo prohíbe.
//   5. **Sin BOM.** Un BOM haría que el archivo dejara de ser byte-idéntico con el mismo contenido
//      escrito por otra herramienta, y ensucia la primera columna en varios lectores. La
//      consecuencia se declara en el manual: **Excel en Windows puede necesitar que le digas que
//      es UTF-8 al abrirlo.** Se prefiere decirlo a romper el determinismo por comodidad.
//
// El orden de las columnas es el de la tabla, que es el del archivo original menos las suprimidas.

import { CODIGO_VACIO, type TablaColumnar } from "./columnar";

/** Caracteres que obligan a entrecomillar. El espacio en los bordes también: se perdería al leer. */
const NECESITA_COMILLAS = /[",\n\r]|^\s|\s$/;

export function escaparCampo(valor: string): string {
  if (valor === "") return "";
  if (!NECESITA_COMILLAS.test(valor)) return valor;
  return `"${valor.replaceAll('"', '""')}"`;
}

/**
 * Las filas del CSV, de a una, para que un archivo de 130 MB no tenga que existir como una sola
 * cadena en memoria. El worker las va acumulando en trozos y arma el `Blob` al final.
 */
export function* filasDeCsv(tabla: TablaColumnar): Generator<string> {
  yield `${tabla.columnas.map((c) => escaparCampo(c.nombre)).join(",")}\n`;

  const campos = new Array<string>(tabla.columnas.length);
  for (let fila = 0; fila < tabla.filas; fila++) {
    for (let c = 0; c < tabla.columnas.length; c++) {
      const columna = tabla.columnas[c];
      const codigo = columna.codigos[fila];
      campos[c] =
        codigo === CODIGO_VACIO ? "" : escaparCampo(columna.valores[codigo]);
    }
    yield `${campos.join(",")}\n`;
  }
}

/**
 * El CSV entero como texto. Para tests y archivos pequeños: con 500k filas hay que usar
 * `filasDeCsv` y acumular en trozos, o la cadena sola se come la memoria de la pestaña.
 */
export function serializarCsv(tabla: TablaColumnar): string {
  let texto = "";
  for (const fila of filasDeCsv(tabla)) texto += fila;
  return texto;
}

/**
 * Nombre del archivo de salida.
 *
 * **No repite el nombre del original.** Un archivo llamado `pacientes-oncologia-2026-anon.csv`
 * cuenta de qué va el contenido antes de que nadie lo abra, y ese nombre viaja en el asunto de un
 * correo, en una carpeta compartida y en la barra de descargas. El sufijo con la huella corta de
 * la política es lo que permite reconocer dos entregas del mismo tratamiento.
 */
export function nombreDelArchivoAnonimizado(hashDePolitica: string): string {
  return `velo-anonimizado-${hashDePolitica.slice(0, 8)}.csv`;
}
