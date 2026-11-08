// La anotación de una limpieza en la bitácora.
//
// Vive aparte de `metadatos.ts` a propósito: ese catálogo es grande y lo cargan la pantalla de la
// limpieza y el informe; el componente que anota en la bitácora se descarga con el taller y solo
// necesita estas dos frases, no el catálogo entero.

import type { Catalogo } from "../index";

export const ANOTAR_LIMPIEZA = {
  etiqueta: { es: "La bitácora", en: "The log" },
  cuerpo: {
    es:
      "Se anotan el nombre del archivo, la fecha, el formato, cuántos campos con nombre tenía, " +
      "cuántos bloques se quitaron y las dos huellas. Los valores de los metadatos no se " +
      "anotan.",
    en:
      "What gets logged: the file name, the date, the format, how many named fields it had, " +
      "how many blocks were removed and both fingerprints. The metadata values are not " +
      "logged.",
  },
} as const satisfies Catalogo;
