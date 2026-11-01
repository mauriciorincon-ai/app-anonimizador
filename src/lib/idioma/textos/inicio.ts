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
      es: "CSV o Excel. El CSV no tiene tope de tamaño; el Excel sí, hasta {tope}.",
      en: "CSV or Excel. CSV has no size limit; Excel does, up to {tope}.",
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
    elegirOtro: { es: "Elegir otro archivo", en: "Choose another file" },
    errores: {
      formatoNoSoportado: {
        titulo: {
          es: "Velo no reconoce ese tipo de archivo",
          en: "Velo does not recognize that type of file",
        },
        salida: {
          es:
            "Lee tablas: CSV (.csv) y Excel (.xlsx, .xls). Si tu archivo viene de una hoja de " +
            "cálculo, ábrelo y guárdalo como CSV.",
          en:
            "It reads tables: CSV (.csv) and Excel (.xlsx, .xls). If your file comes from a " +
            "spreadsheet, open it and save it as CSV.",
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
