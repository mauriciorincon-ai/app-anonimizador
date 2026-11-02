// La pantalla del regreso (`/regreso`): cargar la bóveda y lo que devolvió el tercero, y recuperar
// los valores originales. El glosario vive en `comun.ts`.
//
// Dos cosas a tener presentes al editar este archivo:
//
//   · **El orden de la pantalla es el contrato de honestidad del sprint**: la cifra de restauración
//     nunca va sin lo que la matiza, y el aviso de ambigüedad va ANTES del botón de restaurar.
//     Esto es solo texto — el orden lo fija `src/components/regreso.tsx` — pero un texto que
//     prometiera «recuperado del todo» lo desmentiría desde aquí. En inglés, igual: nada de
//     «fully recovered» ni «100% restored» como promesa; lo que dice «no describe un archivo
//     recuperado del todo» lo dice también en inglés, en negativo y con su razón.
//   · **El español es el que ya existía, palabra por palabra** (las pruebas lo buscan). Dos
//     excepciones de concordancia, y solo con UNA fila o UNA columna: «1 fila» y «1 columna» (el
//     original escribía «1 filas»). Donde el español no distingue singular de plural pero el inglés
//     sí (`celdas`, «las 1»), las dos claves comparten el `es` y solo cambia el `en`.

import type { Catalogo } from "../index";

export const REGRESO = {
  pagina: {
    abriendo: { es: "Abriendo…", en: "Opening…" },
    etiqueta: { es: "El regreso", en: "The return" },
    titulo: {
      es: "Recupera lo que entregaste",
      en: "Get back what you handed over",
    },
    intro: {
      es:
        "Carga la bóveda que guardaste y el archivo que te devolvieron. Velo pone los valores " +
        "originales de vuelta —por valor, no por posición— y respeta el trabajo que hicieron " +
        "encima. Todo dentro de esta pestaña.",
      en:
        "Load the vault you saved and the file you got back. Velo puts the original values back " +
        "— by value, not by position — and respects the work done on top of it. All of it " +
        "inside this tab.",
    },
  },

  // Lo que se repite en más de un panel.
  ningunArchivo: {
    es: "Ningún archivo elegido todavía.",
    en: "No file chosen yet.",
  },
  unidades: {
    fila: { es: "fila", en: "row" },
    filas: { es: "filas", en: "rows" },
    columna: { es: "columna", en: "column" },
    columnas: { es: "columnas", en: "columns" },
  },

  reiniciar: {
    boton: { es: "Empezar de nuevo", en: "Start over" },
    nota: {
      es:
        "Al salir de aquí no queda nada. La bóveda y el archivo viven en la memoria de esta " +
        "pestaña y mueren con ella: no hay copia en este navegador, ni en un servidor.",
      en:
        "Nothing is left behind when you leave. The vault and the file live in this tab's " +
        "memory and disappear with it: there is no copy in this browser, or on any server.",
    },
  },

  // ── Paso 1 · la bóveda ───────────────────────────────────────────────────────────────────────
  boveda: {
    paso: { es: "Paso 1 · la bóveda", en: "Step 1 · the vault" },
    abierta: {
      titulo: { es: "Bóveda abierta", en: "Vault open" },
      nota: {
        es:
          "La huella es el SHA-256 de su contenido. Sirve para reconocer que es la bóveda de " +
          "aquel tratamiento y no otra.",
        en:
          "The fingerprint is the SHA-256 of its contents. It lets you recognize that this is " +
          "the vault from that treatment and not another one.",
      },
      huella: { es: "Huella de la bóveda", en: "Vault fingerprint" },
      llave: { es: "Llave del proyecto", en: "Project key" },
      correspondencias: { es: "Correspondencias", en: "Mappings" },
      columnas: {
        es: "Columnas que puede devolver",
        en: "Columns it can restore",
      },
    },
    sinAbrir: {
      titulo: {
        es: "El archivo que guardaste al anonimizar",
        en: "The file you saved when you anonymized",
      },
      nota: {
        es:
          "Termina en `.velo`. Va cifrado: sin su frase de paso no se abre, ni aquí ni en " +
          "ninguna parte.",
        en:
          "It ends in `.velo`. It is encrypted: without its passphrase it does not open, here " +
          "or anywhere else.",
      },
      elegir: { es: "Elegir la bóveda", en: "Choose the vault" },
      ariaArchivo: {
        es: "Elegir el archivo de bóveda",
        en: "Choose the vault file",
      },
      frase: {
        es: "Frase de paso de la bóveda",
        en: "Vault passphrase",
      },
      abrir: { es: "Abrir la bóveda", en: "Open the vault" },
      abriendo: { es: "Abriendo…", en: "Opening…" },
      derivando: {
        es: "Derivando la llave de cifrado y comprobando el archivo.",
        en: "Deriving the encryption key and checking the file.",
      },
    },
    // Cada fallo con su frase. «Archivo inválido» no le dice a nadie qué hacer.
    fallos: {
      "no-es-una-boveda": {
        es: "Ese archivo no es una bóveda de Velo. Busca el que termina en .velo.",
        en: "That file is not a Velo vault. Look for the one that ends in .velo.",
      },
      "version-distinta": {
        es: "Esa bóveda la hizo otra versión de Velo y esta no sabe leerla.",
        en: "That vault was made by another version of Velo, and this one cannot read it.",
      },
      "frase-incorrecta": {
        es: "La frase no abre esta bóveda. También sale este mensaje si el archivo se dañó o lo modificaron.",
        en: "That passphrase does not open this vault. You also get this message if the file was damaged or has been modified.",
      },
      "costo-inaceptable": {
        es: "La bóveda declara un costo de descifrado fuera de lo razonable: está dañada o la modificaron.",
        en: "The vault declares a decryption cost beyond what is reasonable: it is damaged or has been modified.",
      },
      "contenido-invalido": {
        es: "La bóveda se abrió, pero su contenido no tiene la forma que Velo espera.",
        en: "The vault opened, but its contents do not have the shape Velo expects.",
      },
      "lectura-fallida": {
        es: "No se pudo leer el archivo.",
        en: "The file could not be read.",
      },
    },
  },

  // ── Paso 2 · el archivo devuelto ─────────────────────────────────────────────────────────────
  devuelto: {
    paso: {
      es: "Paso 2 · el archivo devuelto",
      en: "Step 2 · the returned file",
    },
    titulo: {
      es: "Lo que te devolvió el tercero",
      en: "What the third party sent back",
    },
    nota: {
      es:
        "CSV. Puede traer las filas en otro orden, columnas nuevas, columnas borradas y valores " +
        "corregidos: nada de eso estorba, porque la restauración es **por valor** y no por " +
        "posición.",
      en:
        "CSV. It can come back with the rows in a different order, new columns, deleted columns " +
        "and corrected values: none of that gets in the way, because restoring works **by " +
        "value**, not by position.",
    },
    elegir: {
      es: "Elegir el archivo devuelto",
      en: "Choose the returned file",
    },
    ariaArchivo: {
      es: "Elegir el archivo que devolvió el tercero",
      en: "Choose the file the third party sent back",
    },
    leyendo: { es: "Leyendo", en: "Reading" },
    // `· {filas} {unidadFilas} · {columnas} {unidadColumnas}.` — las unidades vienen de `unidades`.
    resumen: {
      es: "· {filas} {unidadFilas} · {columnas} {unidadColumnas}.",
      en: "· {filas} {unidadFilas} · {columnas} {unidadColumnas}.",
    },
    // Cada fallo del archivo devuelto con su frase, por el mismo motivo que los de la bóveda.
    // El caso de Excel se dice aquí y no se soporta a medias: `.xlsx` es un zip y PapaParse lo lee
    // como texto binario, así que el fallo llega como archivo ilegible o vacío según el caso.
    fallos: {
      "archivo-vacio": {
        es: "Ese archivo no tiene filas que restaurar. Comprueba que sea el que te devolvieron y que no esté vacío.",
        en: "That file has no rows to restore. Check that it is the one you were sent back, and that it is not empty.",
      },
      "formato-no-soportado": {
        es: "Velo no sabe leer ese formato aquí. El archivo devuelto tiene que ser CSV: si te lo devolvieron en Excel, ábrelo y guárdalo como CSV.",
        en: "Velo cannot read that format here. The returned file has to be a CSV: if it came back to you as Excel, open it and save it as CSV.",
      },
      "lectura-fallida": {
        es: "No se pudo leer ese archivo. Tiene que ser un CSV: si te lo devolvieron en Excel, ábrelo y guárdalo como CSV.",
        en: "That file could not be read. It has to be a CSV: if it came back to you as Excel, open it and save it as CSV.",
      },
    },
    falloPorDefecto: {
      es: "No se pudo usar ese archivo. Tiene que ser el CSV que te devolvió el tercero.",
      en: "That file could not be used. It has to be the CSV the third party sent back to you.",
    },
  },

  // ── Paso 3 · antes de restaurar ──────────────────────────────────────────────────────────────
  // El aviso de ambigüedad va ANTES del botón: la bóveda sabe cuántos seudónimos tienen dos
  // originales sin haber mirado el archivo devuelto, así que el número se puede dar antes de que se
  // pulse. Decirlo después sería contarle el precio cuando ya pagó.
  confirmacion: {
    paso: {
      es: "Paso 3 · antes de restaurar",
      en: "Step 3 · before restoring",
    },
    tituloConColisiones: {
      es: "Hay valores que no van a poder volver",
      en: "Some values will not be able to come back",
    },
    tituloListo: {
      es: "Todo listo para restaurar",
      en: "Ready to restore",
    },
    colisionUna: {
      es:
        "**{n} seudónimo de esta bóveda corresponde a más de un valor original.** Conservar el " +
        "formato reduce el espacio disponible y dos valores distintos chocaron en el mismo " +
        "seudónimo.",
      en:
        "**{n} pseudonym in this vault matches more than one original value.** Keeping the " +
        "format shrinks the available space, and two different values collided on the same " +
        "pseudonym.",
    },
    colisionVarias: {
      es:
        "**{n} seudónimos de esta bóveda corresponden a más de un valor original.** Conservar " +
        "el formato reduce el espacio disponible y dos valores distintos chocaron en el mismo " +
        "seudónimo.",
      en:
        "**{n} pseudonyms in this vault match more than one original value.** Keeping the " +
        "format shrinks the available space, and two different values collided on the same " +
        "pseudonym.",
    },
    sinResolver: {
      es:
        "Las celdas que los usen van a salir **sin resolver**, con el seudónimo intacto. Velo " +
        "no elige por ti: escribir uno de los dos candidatos devolvería el dato de otra " +
        "persona sin que nada lo indicara.",
      en:
        "The cells that use them will come out **unresolved**, with the pseudonym intact. Velo " +
        "does not choose for you: writing one of the two candidates would hand back another " +
        "person's data with nothing to show it.",
    },
    sinColisiones: {
      es:
        "Ningún seudónimo de esta bóveda corresponde a dos valores, así que no hay celdas " +
        "ambiguas que resolver. Lo que no vuelva será porque el tercero lo cambió.",
      en:
        "No pseudonym in this vault matches two values, so there are no ambiguous cells to " +
        "resolve. Anything that does not come back will be because the third party changed it.",
    },
    restaurar: {
      es: "Restaurar los valores originales",
      en: "Restore the original values",
    },
    restaurando: { es: "Restaurando…", en: "Restoring…" },
    fallo: {
      es:
        "La restauración falló. Comprueba que el archivo devuelto sea el que corresponde a " +
        "esta bóveda.",
      en:
        "The restore failed. Check that the returned file is the one that belongs to this " +
        "vault.",
    },
  },

  // ── Paso 4 · el resultado ────────────────────────────────────────────────────────────────────
  // Las salvedades van arriba de la cifra, igual que en el documento exportado: el orden es la
  // decisión, no el adorno.
  resultado: {
    paso: { es: "Paso 4 · el resultado", en: "Step 4 · the result" },
    reconocimiento: {
      completo: {
        es: "Todas las columnas de la bóveda aparecieron",
        en: "All of the vault's columns appeared",
      },
      parcial: {
        es: "Algunas columnas de la bóveda no aparecieron",
        en: "Some of the vault's columns did not appear",
      },
      ninguno: {
        es: "Esta bóveda no corresponde a este archivo",
        en: "This vault does not match this file",
      },
    },
    sinSalvedades: {
      es: "Todas las celdas que la bóveda cubría volvieron a su valor original.",
      en: "Every cell the vault covered went back to its original value.",
    },
    nadaQueRestaurar: {
      es: "No hubo ninguna celda que restaurar.",
      en: "There were no cells to restore.",
    },
    // La cifra de arriba, cuando nada la descalifica: el porcentaje va grande y esto va debajo.
    titular: {
      es: "de las celdas con contenido volvieron a su valor original: {restauradas} de {total}.",
      en: "of the cells with content went back to their original value: {restauradas} of {total}.",
    },
    // La cifra cuando algo la descalifica, en tres tramos para que el aviso conserve su color.
    conSalvedades: {
      cifra: {
        es: "Volvieron {restauradas} de {total} celdas con contenido — {porcentaje}—.",
        en: "{restauradas} of {total} cells with content came back ({porcentaje}).",
      },
      aviso: {
        es: "Esa cifra no describe un archivo recuperado del todo",
        en: "That figure does not describe a file recovered in full",
      },
      mientras: {
        es: "mientras siga en pie lo de arriba.",
        en: "for as long as what is above still stands.",
      },
    },
    restauradas: { es: "Restauradas", en: "Restored" },
    ambiguas: { es: "Ambiguas", en: "Ambiguous" },
    cambiadas: {
      es: "Las cambió el tercero",
      en: "Changed by the third party",
    },

    // Cada salvedad, en singular y en plural. El español comparte el final de la frase entre las
    // dos formas; el inglés concuerda. Donde la frase lleva un nombre de columna del usuario, el
    // nombre NO pasa por el catálogo (podría traer ` o ** y romper el énfasis): la frase se parte
    // en `antes`/`despues` y el nombre va en medio, tal cual.
    salvedades: {
      celdasAmbiguasUna: {
        es: "{n} celda volvió sin resolver: su seudónimo corresponde a más de un valor original y Velo conservó el seudónimo en vez de elegir.",
        en: "{n} cell came back unresolved: its pseudonym matches more than one original value, and Velo kept the pseudonym instead of choosing.",
      },
      celdasAmbiguasVarias: {
        es: "{n} celdas volvieron sin resolver: su seudónimo corresponde a más de un valor original y Velo conservó el seudónimo en vez de elegir.",
        en: "{n} cells came back unresolved: their pseudonyms match more than one original value, and Velo kept the pseudonyms instead of choosing.",
      },
      bovedaNoCorresponde: {
        es: "Ninguna columna de la bóveda apareció en este archivo. O la bóveda es de otro tratamiento, o este no es el archivo que salió de Velo.",
        en: "None of the vault's columns appeared in this file. Either the vault belongs to a different treatment, or this is not the file that came out of Velo.",
      },
      columnasSinAparecerUnaAntes: {
        es: "La bóveda guarda una columna que no apareció en el archivo devuelto:",
        en: "The vault holds a column that did not appear in the returned file:",
      },
      columnasSinAparecerUnaDespues: {
        es: ". El porcentaje no la cuenta.",
        en: ". The percentage does not count it.",
      },
      columnasSinAparecerVariasAntes: {
        es: "La bóveda guarda columnas que no aparecieron en el archivo devuelto:",
        en: "The vault holds columns that did not appear in the returned file:",
      },
      columnasSinAparecerVariasDespues: {
        es: ". El porcentaje no las cuenta.",
        en: ". The percentage does not count them.",
      },
      columnaAMedias: {
        es: "tiene valores de la bóveda, pero solo el {proporcion} de los suyos: por debajo del mínimo para restaurarla, así que salió intacta.",
        en: "has values from the vault, but only {proporcion} of its values match: below the minimum needed to restore it, so it came out untouched.",
      },
      celdasDesconocidasUna: {
        es: "{n} celda no estaba en la bóveda: el tercero la escribió o la cambió. Salieron tal cual.",
        en: "{n} cell was not in the vault: the third party wrote or changed it. It came out as it was.",
      },
      celdasDesconocidasVarias: {
        es: "{n} celdas no estaban en la bóveda: el tercero las escribió o las cambió. Salieron tal cual.",
        en: "{n} cells were not in the vault: the third party wrote or changed them. They came out as they were.",
      },
    },
  },

  // ── Paso 5 · llévatelo ───────────────────────────────────────────────────────────────────────
  descargas: {
    paso: { es: "Paso 5 · llévatelo", en: "Step 5 · take it with you" },
    titulo: {
      es: "El archivo restaurado y su informe",
      en: "The restored file and its report",
    },
    nota: {
      es:
        "El informe no lleva ninguna celda: solo nombres de columna, cifras y huellas. El " +
        "archivo restaurado sí lleva tus datos — trátalo como el original, porque lo es.",
      en:
        "The report contains no cells: only column names, figures and fingerprints. The " +
        "restored file does contain your data — treat it like the original, because it is.",
    },
    guardarArchivo: {
      es: "Guardar el archivo restaurado",
      en: "Save the restored file",
    },
    prepararArchivo: {
      es: "Preparar el archivo restaurado",
      en: "Prepare the restored file",
    },
    preparando: { es: "Preparando…", en: "Preparing…" },
    guardarInforme: { es: "Guardar el informe", en: "Save the report" },
    prepararInforme: { es: "Preparar el informe", en: "Prepare the report" },
    sello: {
      es: "Los dos se arman dentro de esta pestaña. No hubo servidor, ni carga, ni copia.",
      en: "Both are built inside this tab. There was no server, no upload, no copy.",
    },
    volver: {
      es: "Volver a la aduana",
      en: "Back to the customs checkpoint",
    },
  },
} as const satisfies Catalogo;
