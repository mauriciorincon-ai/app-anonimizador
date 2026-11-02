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
        "hasta {tope}; el JSON se limita por la cantidad de celdas, no por el peso del archivo.",
      en:
        "CSV, Excel or JSON (JSON Lines too). CSV has no size limit; Excel does, up to {tope}; " +
        "JSON is capped by its number of cells, not by the weight of the file.",
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
    },

    // Analizando / listo
    analizando: { es: "Analizando", en: "Analyzing" },
    listo: { es: "Listo", en: "Done" },
    filasLeidas: { es: "{n} filas leídas", en: "{n} rows read" },
    filasRevisadas: { es: "{n} filas revisadas", en: "{n} rows reviewed" },
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
            "Lee tablas: CSV (.csv), Excel (.xlsx, .xls) y JSON (.json, .jsonl, .ndjson). Si tu " +
            "archivo viene de una hoja de cálculo, ábrelo y guárdalo como CSV.",
          en:
            "It reads tables: CSV (.csv), Excel (.xlsx, .xls) and JSON (.json, .jsonl, .ndjson). " +
            "If your file comes from a spreadsheet, open it and save it as CSV.",
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
            "o una imagen, por ejemplo. Revisa que sea el archivo correcto, o vuelve a " +
            "exportarlo desde su origen con la extensión que le corresponde.",
          en:
            "The outside says one thing and the inside another: a `.json` that is really a PDF " +
            "or an image, for instance. Check it is the right file, or export it again from its " +
            "source with the extension that fits.",
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
