// La aduana — la portada y la zona de carga.
//
// Aquí vive todo lo que se lee en `/` : el titular, los cuatro pasos, los dos bloques «y después»
// (el regreso y la bitácora), y los cinco estados de la zona de carga (en reposo, arrastrando,
// analizando, listo, error). Sigue el glosario de `comun.ts`.
//
// El español es el que ya tenía la pantalla, palabra por palabra: las pruebas lo buscan. El inglés
// se redacta al lado, no se calca.

import type { Catalogo } from "../index";

export const INICIO = {
  titulo: {
    es: "Mira tu tabla como la vería un extraño",
    en: "Look at your table the way a stranger would",
  },
  bajada: {
    es:
      "Antes de mandar un archivo a una IA, a una herramienta en la nube o al computador de un " +
      "tercero, Velo te dice qué datos personales lleva dentro, a cuántas personas alcanza a " +
      "señalar con el dedo, y te lo devuelve anonimizado.",
    en:
      "Before you send a file to an AI, a cloud tool or a third party's computer, Velo tells " +
      "you what personal data it holds and how many people it can point a finger at, and " +
      "hands it back to you anonymized.",
  },

  // ── Los cuatro pasos ────────────────────────────────────────────────────────────────────────
  como: {
    es: "Cómo funciona",
    en: "How it works",
  },
  pasos: [
    {
      titulo: { es: "Sueltas la tabla", en: "You drop in the table" },
      texto: {
        es:
          "Se abre en esta pestaña, en un hilo aparte para que el navegador no se congele. No hay " +
          "carga a ningún servidor: es que no hay servidor.",
        en:
          "It opens in this tab, on a separate thread so the browser does not freeze. Nothing is " +
          "uploaded to any server: there is no server.",
      },
    },
    {
      titulo: {
        es: "Velo la lee columna por columna",
        en: "Velo reads it column by column",
      },
      texto: {
        es:
          "Recalcula los dígitos de verificación oficiales —el mod 11 de la DIAN para el NIT, Luhn " +
          "para las tarjetas, el 97-10 del IBAN— y reconoce las formas colombianas: cédulas, " +
          "celulares, placas.",
        en:
          "It recomputes the official check digits —the DIAN's mod 11 for the NIT, Luhn for " +
          "cards, the 97-10 of the IBAN— and recognizes Colombian formats: ID numbers (cédulas), " +
          "mobile numbers, license plates.",
      },
    },
    {
      titulo: {
        es: "Te dice a quién delata",
        en: "It tells you who it gives away",
      },
      texto: {
        es:
          "Cuenta cuántas personas quedan solas al cruzar unas columnas con otras. La cuenta es " +
          "exacta: sale de tus filas, no de un modelo estadístico.",
        en:
          "It counts how many people end up alone when some columns are crossed with others. The " +
          "count is exact: it comes from your rows, not from a statistical model.",
      },
    },
    {
      titulo: { es: "Y lo transformas", en: "Then you transform it" },
      texto: {
        es:
          "Eliges qué se le hace a cada columna —o aplicas Habeas Data de un clic—, ves el antes y " +
          "el después, y te llevas el archivo tratado con el documento que dice qué se le hizo.",
        en:
          "You choose what is done to each column —or apply Habeas Data in one click—, see the " +
          "before and the after, and take away the treated file along with the document that " +
          "says what was done to it.",
      },
    },
  ],

  // ── Los dos «y después» ─────────────────────────────────────────────────────────────────────
  regreso: {
    titulo: { es: "Y semanas después", en: "And weeks later" },
    texto: {
      es:
        "Cuando el tercero te devuelva el archivo trabajado, Velo **pone los valores originales " +
        "de vuelta** y respeta lo que hicieron encima. Para eso guardas la bóveda cifrada al " +
        "anonimizar: sin ella el seudónimo sigue siendo irreversible —que es justo lo que lo hace " +
        "seguro de entregar—; con ella, y solo con ella, vuelve.",
      en:
        "When the third party sends the processed file back, Velo **puts the original values " +
        "back** and respects what they did on top of them. For that you keep the encrypted vault " +
        "when you anonymize: without it the pseudonym stays irreversible —which is exactly what " +
        "makes it safe to hand over—; with it, and only with it, the values come back.",
    },
    enlace: {
      es: "Ya tengo mi bóveda y el archivo devuelto",
      en: "I already have my vault and the returned file",
    },
  },
  bitacora: {
    titulo: { es: "Y meses después", en: "And months later" },
    texto: {
      es:
        "Cuando alguien te pregunte **qué entregaste y con qué criterio**, la respuesta está en tu " +
        "bitácora: un archivo cifrado, tuyo, que recuerda cada tratamiento con su fecha, su " +
        "política y sus dos huellas. Va cifrada porque el nombre de un archivo ya cuenta de qué va " +
        "su contenido.",
      en:
        "When someone asks you **what you handed over and by what criteria**, the answer is in " +
        "your log: an encrypted file, yours, that remembers each treatment with its date, its " +
        "policy and its two fingerprints. It is encrypted because the name of a file already " +
        "says what its contents are about.",
    },
    enlace: {
      es: "Abrir mi bitácora",
      en: "Open my log",
    },
  },
  cierre: {
    es: "Velo reduce el riesgo de reidentificación y lo mide; no declara ningún archivo anónimo.",
    en: "Velo reduces re-identification risk and measures it; it does not declare any file anonymous.",
  },

  // ── La zona de carga ────────────────────────────────────────────────────────────────────────
  carga: {
    // En reposo
    traeTuTabla: { es: "Trae tu tabla", en: "Bring your table" },
    sueltaloAqui: { es: "Suéltalo aquí", en: "Drop it here" },
    instruccion: {
      es: "Arrástrala hasta aquí o elígela desde tu computador.",
      en: "Drag it here or choose it from your computer.",
    },
    elegirArchivo: { es: "Elegir archivo", en: "Choose file" },
    formatos: {
      es:
        "CSV, Excel o JSON (también JSON Lines). El CSV no tiene tope de tamaño; el Excel sí, " +
        "hasta {tope}; el JSON se limita por la cantidad de celdas, no por el peso del archivo. " +
        "También limpia los metadatos de un PDF (hasta {topePdf}) o de una imagen JPEG, PNG, " +
        "WebP o HEIC (hasta {topeImagen}).",
      en:
        "CSV, Excel or JSON (JSON Lines too). CSV has no size limit; Excel does, up to {tope}; " +
        "JSON is capped by its number of cells, not by the weight of the file. Velo also cleans " +
        "the metadata of a PDF (up to {topePdf}) or of a JPEG, PNG, WebP or HEIC image (up " +
        "to {topeImagen}).",
    },

    // Solo las etapas del ANÁLISIS. Las de la transformación viven en `/transformar`.
    etapas: {
      huella: {
        es: "Tomando la huella del archivo",
        en: "Taking the file's fingerprint",
      },
      leyendo: { es: "Leyendo el archivo", en: "Reading the file" },
      clasificando: {
        es: "Reconociendo qué hay en cada columna",
        en: "Recognizing what is in each column",
      },
      midiendoRiesgo: {
        es: "Midiendo el riesgo de reidentificación",
        en: "Measuring the re-identification risk",
      },
      // PDF e imagen (S6): no hay columnas que reconocer, hay un archivo que dice cosas de sí mismo.
      leyendoMetadatos: {
        es: "Leyendo lo que el archivo dice de sí mismo",
        en: "Reading what the file says about itself",
      },
    },

    // Analizando / listo
    analizando: { es: "Analizando", en: "Analyzing" },
    listo: { es: "Listo", en: "Done" },
    filasLeidas: { es: "{n} filas leídas", en: "{n} rows read" },
    filasRevisadas: { es: "{n} filas revisadas", en: "{n} rows reviewed" },
    // Un PDF o una imagen no tienen filas: lo que se cuenta es lo que se encontró dentro.
    camposEncontradosUno: {
      es: "{n} campo con nombre encontrado",
      en: "{n} named field found",
    },
    camposEncontrados: {
      es: "{n} campos con nombre encontrados",
      en: "{n} named fields found",
    },
    // Mientras lee: no hay barra ni filas que contar, y decir «0 filas leídas» sería contar algo
    // que no está pasando. Lo que sí se dice es que el archivo se abre entero.
    leyendoBinario: {
      es: "Velo abre el archivo entero en memoria: un PDF o una imagen no se leen por partes.",
      en: "Velo opens the whole file in memory: a PDF or an image cannot be read in parts.",
    },
    verDiagnostico: { es: "Ver el diagnóstico", en: "View the diagnosis" },
    avisoDeTamano: {
      es:
        "Es un Excel grande ({peso}). Velo lo está abriendo completo en memoria porque un .xlsx " +
        "no se puede leer por partes. Si se demora demasiado o falla, guárdalo como CSV y vuelve " +
        "a soltarlo.",
      en:
        "This is a large Excel file ({peso}). Velo is opening it whole in memory because an " +
        ".xlsx cannot be read in parts. If it takes too long or fails, save it as CSV and drop " +
        "it in again.",
    },

    // Error: dicen QUÉ HACER. Decir «error al procesar» es dejar al usuario donde estaba.
    noSePudoAbrir: { es: "No se pudo abrir", en: "Could not open it" },
    // Solo un número: la línea donde el lector de JSON se detuvo. Jamás el contenido de esa línea.
    lineaDelError: {
      es: "Velo se detuvo en la línea {linea}: ahí, o justo antes, aparece el problema.",
      en: "Velo stopped at line {linea}: the problem is there, or just before it.",
    },
    elegirOtro: { es: "Elegir otro archivo", en: "Choose another file" },
    errores: {
      formatoNoSoportado: {
        titulo: {
          es: "Velo no reconoce ese tipo de archivo",
          en: "Velo does not recognize that type of file",
        },
        salida: {
          es:
            "Lee tablas: CSV (.csv), Excel (.xlsx, .xls) y JSON (.json, .jsonl, .ndjson), y " +
            "limpia los metadatos de PDF (.pdf) e imágenes (.jpg, .png, .webp, .heic). Si tu archivo " +
            "viene de una hoja de cálculo, ábrelo y guárdalo como CSV.",
          en:
            "It reads tables: CSV (.csv), Excel (.xlsx, .xls) and JSON (.json, .jsonl, .ndjson), " +
            "and cleans the metadata of PDFs (.pdf) and images (.jpg, .png, .webp, .heic). If your file " +
            "comes from a spreadsheet, open it and save it as CSV.",
        },
      },
      archivoVacio: {
        titulo: {
          es: "El archivo no tiene filas para revisar",
          en: "The file has no rows to review",
        },
        salida: {
          es:
            "Puede que solo tenga el encabezado, o que la primera hoja del libro esté vacía. " +
            "Revísalo y vuelve a soltarlo.",
          en:
            "It may only have the header row, or the first sheet of the workbook may be empty. " +
            "Check it and drop it in again.",
        },
      },
      excelExcedeTope: {
        titulo: {
          es: "Ese Excel es más grande de lo que Velo puede abrir",
          en: "That Excel file is bigger than Velo can open",
        },
        salida: {
          es:
            "El tope para Excel es {tope}, porque un .xlsx hay que abrirlo entero en memoria para " +
            "leerlo. Guárdalo como CSV: el CSV se lee por partes y no tiene tope.",
          en:
            "The limit for Excel is {tope}, because an .xlsx has to be opened whole in memory to " +
            "be read. Save it as CSV: a CSV is read in parts and has no limit.",
        },
      },
      excelExcedeMemoria: {
        titulo: {
          es: "El navegador se quedó sin memoria abriendo ese Excel",
          en: "The browser ran out of memory opening that Excel file",
        },
        salida: {
          es:
            "Pasa con libros muy anchos o con muchas hojas. Guárdalo como CSV y vuelve a " +
            "intentarlo: así Velo lo lee por partes en vez de completo.",
          en:
            "It happens with very wide workbooks or ones with many sheets. Save it as CSV and " +
            "try again: that way Velo reads it in parts instead of whole.",
        },
      },
      lecturaFallida: {
        titulo: {
          es: "No se pudo leer el archivo",
          en: "The file could not be read",
        },
        salida: {
          es:
            "Puede estar dañado o tener un contenido distinto al que anuncia su extensión. " +
            "Ábrelo, guárdalo de nuevo como CSV e inténtalo otra vez.",
          en:
            "It may be damaged or hold content different from what its extension announces. " +
            "Open it, save it again as CSV and try once more.",
        },
      },
      // ── JSON (S6) ──────────────────────────────────────────────────────────────────────────
      // Cada motivo dice QUÉ está mal y QUÉ HACER, y ninguno cita el contenido: el worker manda una
      // clave cerrada. Los topes salen de `TOPES_JSON` (los mismos del lector), no de este texto.
      jsonInvalido: {
        titulo: {
          es: "Ese archivo no es un JSON válido",
          en: "That file is not valid JSON",
        },
        salida: {
          es:
            "Le falta o le sobra algo —una coma, una llave, una comilla— o se cortó antes de " +
            "terminar. Por privacidad, Velo no repite en pantalla nada de lo que hay dentro: " +
            "ábrelo en un editor, corrígelo y suéltalo de nuevo.",
          en:
            "Something is missing or extra —a comma, a bracket, a quote— or the file was cut off " +
            "before the end. For privacy, Velo does not echo anything from inside it on screen: " +
            "open it in an editor, fix it and drop it in again.",
        },
      },
      jsonNoEsRegistros: {
        titulo: {
          es: "Ese JSON no es una lista de registros",
          en: "That JSON is not a list of records",
        },
        salida: {
          es:
            "Velo lee un arreglo de objetos —`[{ … }, { … }]`— o JSON Lines, con un objeto por " +
            "línea. Un objeto suelto, un valor suelto o un arreglo de números o textos no es una " +
            "tabla. Si tus registros vienen dentro de otro objeto, saca el arreglo y guárdalo " +
            "solo; si no, envuélvelos en un arreglo o guarda uno por línea, y suéltalo otra vez.",
          en:
            "Velo reads an array of objects —`[{ … }, { … }]`— or JSON Lines, one object per " +
            "line. A lone object, a lone value or an array of plain numbers or strings is not a " +
            "table. If your records come inside another object, pull the array out and save it " +
            "on its own; otherwise wrap them in an array or save one per line, and drop it in " +
            "again.",
        },
      },
      jsonDemasiadoProfundo: {
        titulo: {
          es: "Ese JSON tiene demasiados niveles de anidamiento",
          en: "That JSON is nested too deeply",
        },
        salida: {
          es:
            "Velo admite hasta {profundidad} niveles dentro de un registro. Pasarse suele ser un " +
            "error de exportación (un objeto que se contiene a sí mismo) o un archivo armado " +
            "para colgar el programa. Revisa cómo se exportó, aplánalo en el origen y suéltalo " +
            "otra vez.",
          en:
            "Velo accepts up to {profundidad} levels inside a record. Going past that is usually " +
            "an export mistake (an object that contains itself) or a file built to hang the " +
            "program. Check how it was exported, flatten it at the source and drop it in again.",
        },
      },
      jsonDemasiadoAncho: {
        titulo: {
          es: "Ese JSON tiene demasiados campos distintos",
          en: "That JSON has too many distinct fields",
        },
        salida: {
          es:
            "Cada ruta distinta —`paciente.contacto.correo`— se vuelve una columna, y Velo " +
            "admite hasta {rutas} rutas distintas. Se rebasa sobre todo cuando los datos viajan como claves (un " +
            "id o una fecha usados de clave). Cambia esa forma en el origen: una clave fija y el " +
            "dato como valor.",
          en:
            "Each distinct path —`patient.contact.email`— becomes a column, and Velo accepts up " +
            "to {rutas} distinct paths. The limit is usually exceeded when data travels as keys (an id or a " +
            "date used as a key). Change that shape at the source: a fixed key, with the data as " +
            "its value.",
        },
      },
      jsonClavesDuplicadas: {
        titulo: {
          es: "Un registro repite una clave",
          en: "A record repeats a key",
        },
        salida: {
          es:
            "Un objeto con la misma clave dos veces es ambiguo: según quién lo lea gana la " +
            "primera o la última, y Velo no elige por ti qué dato conservar. Corrige el origen " +
            "para que cada clave aparezca una sola vez y suéltalo de nuevo.",
          en:
            "An object with the same key twice is ambiguous: depending on who reads it, the " +
            "first or the last one wins, and Velo will not choose for you which value to keep. " +
            "Fix the source so each key appears only once and drop it in again.",
        },
      },
      jsonExcedeTope: {
        titulo: {
          es: "Ese JSON es más grande de lo que Velo puede tratar",
          en: "That JSON is bigger than Velo can handle",
        },
        salida: {
          es:
            "Superó alguno de los límites: {celdas} celdas en total (registros por campos " +
            "distintos), claves de hasta {largoClave} caracteres o textos de hasta " +
            "{largoTexto} caracteres. Divide el archivo en partes y trata cada una; en JSON Lines basta " +
            "con cortar entre líneas.",
          en:
            "It went past one of the limits: {celdas} cells in total (records times distinct " +
            "fields), keys up to {largoClave} characters or strings up to {largoTexto} characters. Split " +
            "the file into parts and treat each one; with JSON Lines you only need to cut " +
            "between lines.",
        },
      },
      formatoNoCoincide: {
        titulo: {
          es: "El contenido no es el que anuncia el nombre del archivo",
          en: "The content is not what the file name announces",
        },
        salida: {
          es:
            "Por fuera dice una cosa y por dentro es otra: un `.json` que en realidad es un PDF " +
            "o una imagen, o un `.pdf` que no lo es, por ejemplo. Revisa que sea el archivo " +
            "correcto, o vuelve a exportarlo desde su origen con la extensión que le corresponde.",
          en:
            "The outside says one thing and the inside another: a `.json` that is really a PDF " +
            "or an image, or a `.pdf` that is not one, for instance. Check it is the right file, " +
            "or export it again from its source with the extension that fits.",
        },
      },
      // ── PDF e imágenes (S6) ────────────────────────────────────────────────────────────────
      // Igual que los de JSON: dicen QUÉ está mal y QUÉ HACER, y ninguno cita el contenido (el
      // worker manda una clave cerrada). Los topes salen de `archivo.ts`, los mismos del worker.
      pdfCifrado: {
        titulo: {
          es: "Ese PDF está protegido con contraseña",
          en: "That PDF is password-protected",
        },
        salida: {
          es:
            "Velo no pide contraseñas, y un PDF cifrado no se puede leer ni reescribir sin ella. " +
            "Quita la protección con el programa que lo creó —por ejemplo, abriéndolo y " +
            "guardando una copia sin contraseña— y suelta esa copia.",
          en:
            "Velo does not ask for passwords, and an encrypted PDF cannot be read or rewritten " +
            "without one. Remove the protection with the program that made it —for example, by " +
            "opening it and saving a copy without a password— and drop that copy in.",
        },
      },
      pdfIlegible: {
        titulo: {
          es: "No se pudo leer ese PDF",
          en: "That PDF could not be read",
        },
        salida: {
          es:
            "Puede estar dañado, cortado a medias o tener una estructura que Velo no sabe leer. " +
            "Por privacidad, Velo no repite en pantalla nada de lo que hay dentro. Ábrelo en un " +
            "visor: si se ve bien, imprímelo a PDF o guárdalo de nuevo desde ahí y suelta esa " +
            "copia.",
          en:
            "It may be damaged, cut off halfway or have a structure Velo cannot read. For " +
            "privacy, Velo does not echo anything from inside it on screen. Open it in a " +
            "viewer: if it looks fine, print it to PDF or save it again from there and drop " +
            "that copy in.",
        },
      },
      imagenIlegible: {
        titulo: {
          es: "No se pudo leer esa imagen",
          en: "That image could not be read",
        },
        salida: {
          es:
            "Puede estar dañada, cortada a medias o ser de un formato distinto del que dice su " +
            "extensión. Velo lee JPEG, PNG, WebP y HEIC. Ábrela en un visor y, si se ve bien, " +
            "expórtala de nuevo en uno de esos formatos y suelta esa copia.",
          en:
            "It may be damaged, cut off halfway or be a different format from the one its " +
            "extension claims. Velo reads JPEG, PNG, WebP and HEIC. Open it in a viewer and, if it " +
            "looks fine, export it again in one of those formats and drop that copy in.",
        },
      },
      imagenNoSoportada: {
        titulo: {
          es: "Esa foto usa una parte del formato que Velo no reescribe",
          en: "That photo uses a part of the format Velo does not rewrite",
        },
        salida: {
          es:
            "Puede ser una ráfaga, una Live Photo o una foto con piezas que Velo no conoce y que " +
            "el archivo declara imprescindibles. Antes que entregarte una copia rota, Velo no la " +
            "toca. Expórtala como una foto fija —en HEIC o en JPEG— desde el programa de fotos y " +
            "suelta esa copia.",
          en:
            "It may be a burst, a Live Photo or a photo with parts Velo does not know and that the " +
            "file declares essential. Rather than hand you a broken copy, Velo leaves it alone. " +
            "Export it as a still photo —HEIC or JPEG— from your photos app and drop that copy in.",
        },
      },
      pdfExcedeTope: {
        titulo: {
          es: "Ese PDF es más grande de lo que Velo puede abrir",
          en: "That PDF is bigger than Velo can open",
        },
        salida: {
          es:
            "El tope para un PDF es {topePdf}, porque se abre entero en memoria para " +
            "reescribirlo: no se puede limpiar por partes. Divídelo en partes más pequeñas con " +
            "el programa que lo creó y limpia cada una.",
          en:
            "The limit for a PDF is {topePdf}, because it is opened whole in memory to rewrite " +
            "it: it cannot be cleaned in parts. Split it into smaller parts with the program " +
            "that made it and clean each one.",
        },
      },
      imagenExcedeTope: {
        titulo: {
          es: "Esa imagen es más grande de lo que Velo puede abrir",
          en: "That image is bigger than Velo can open",
        },
        salida: {
          es:
            "El tope para una imagen es {topeImagen}, porque se abre entera en memoria para " +
            "reescribirla. Expórtala de nuevo con menos peso —menos resolución o más " +
            "compresión— y suelta esa copia.",
          en:
            "The limit for an image is {topeImagen}, because it is opened whole in memory to " +
            "rewrite it. Export it again at a lower weight —less resolution or more " +
            "compression— and drop that copy in.",
        },
      },
      // Nace limpiando, en `/transformar`, y allá tiene su pantalla; aquí solo llega si el mensaje
      // se retrasa y la sesión ya volvió a la aduana, y la salida honesta es la misma.
      limpiezaIncompleta: {
        titulo: {
          es: "Velo no pudo dejar limpio ese archivo",
          en: "Velo could not leave that file clean",
        },
        salida: {
          es:
            "Reescribió la copia y, al volver a leerla para comprobarla, todavía encontró " +
            "campos con nombre; por eso no te la entrega. No uses un archivo que Velo no pudo " +
            "dejar limpio: genera una copia nueva desde su origen —imprime el documento a PDF, " +
            "o exporta la imagen otra vez— y suéltala.",
          en:
            "It rewrote the copy and, reading it again to check it, still found named fields; " +
            "that is why it will not hand it over. Do not use a file Velo could not leave " +
            "clean: make a fresh copy from its source —print the document to PDF, or export " +
            "the image again— and drop that one in.",
        },
      },
      // Los tres motivos de la transformación no pueden nacer en la aduana; si uno llegara aquí
      // sería por una navegación rara, y la salida honesta es la misma de siempre.
      perdido: {
        titulo: {
          es: "Se perdió el archivo que estabas revisando",
          en: "The file you were reviewing was lost",
        },
        salida: {
          es:
            "Velo no guarda copias en ningún lado, así que no hay nada que recuperar. Suéltalo " +
            "otra vez: tarda lo mismo que la primera.",
          en:
            "Velo keeps no copies anywhere, so there is nothing to recover. Drop it in again: it " +
            "takes as long as the first time.",
        },
      },
    },
  },
} as const satisfies Catalogo;
