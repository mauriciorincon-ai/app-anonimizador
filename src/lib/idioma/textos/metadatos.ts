// Los metadatos de un PDF o una imagen (S6) — qué dice el archivo de sí mismo, qué se quita y qué NO.
//
// Aquí vive todo lo que se lee en el diagnóstico de un PDF o una imagen, en la pantalla de la
// limpieza, en el certificado que la acompaña y en la anotación de la bitácora. Sigue el glosario de
// `comun.ts`: huella = fingerprint, diagnóstico = diagnosis, tratamiento = treatment, bitácora = log.
//
// **La regla de honestidad de esta pantalla (regla dura nº4) es de alcance, no de cifras:** Velo
// limpia lo que el archivo dice DE SÍ MISMO y no toca el texto de las páginas ni lo que se ve en la
// imagen. Ese límite se dice arriba del todo, con el mismo peso que lo que sí hace, y se repite en el
// resultado y en el certificado. Nada de lo que sigue promete que el archivo «queda anónimo»: Velo
// quita metadatos y comprueba que ya no los encuentra; no promete más que eso.
//
// Los nombres técnicos (`APP1`, `tEXt`, `/Info`) NO están aquí: son iguales en los dos idiomas, viajan
// en el contenido del worker (`Elemento.marcador`) y quien los busque en otra herramienta los
// reconoce tal cual.
//
// Tanto el español como el inglés se redactan al lado, no se calcan.

import type { Catalogo } from "../index";

export const METADATOS = {
  // ── El informe (`/diagnostico`) ─────────────────────────────────────────────────────────────
  informe: {
    etiqueta: { es: "Diagnóstico de metadatos", en: "Metadata diagnosis" },
    // El formato sale de los bytes, no de la extensión: se dice, porque es lo que se trató.
    tamano: {
      es: "{peso} · {formato} según su contenido",
      en: "{peso} · {formato} by its contents",
    },
  },

  // ── El límite, dicho de entrada ─────────────────────────────────────────────────────────────
  limite: {
    titulo: {
      es: "Qué limpia Velo y qué no toca",
      en: "What Velo cleans and what it leaves alone",
    },
    principal: {
      es:
        "!!Velo limpia lo que el archivo dice de sí mismo; no toca el texto de las páginas ni lo " +
        "que se ve en la imagen.!!",
      en:
        "!!Velo cleans what the file says about itself; it does not touch the text on the pages " +
        "or what can be seen in the image.!!",
    },
    pdf: {
      es:
        "En un PDF, el texto, las tablas y los dibujos de cada página salen **igual que " +
        "entraron**: un nombre escrito en un párrafo sigue ahí. Lo que cambia es lo que el " +
        "documento guardaba aparte: autor, programa, fechas, identificadores y versiones " +
        "anteriores.",
      en:
        "In a PDF, the text, tables and drawings on each page come out **exactly as they went " +
        "in**: a name typed into a paragraph is still there. What changes is what the document " +
        "kept on the side: author, software, dates, identifiers and earlier versions.",
    },
    imagen: {
      es:
        "En una imagen no se toca ningún píxel: una cara, un letrero o una placa de fondo " +
        "siguen a la vista. Lo que cambia es lo que la cámara o el programa escribieron aparte: " +
        "ubicación, dispositivo, fechas, autoría y miniaturas.",
      en:
        "In an image no pixel is touched: a face, a sign or a license plate in the background " +
        "stay in view. What changes is what the camera or the software wrote on the side: " +
        "location, device, dates, authorship and thumbnails.",
    },
    consejo: {
      es:
        "Si el contenido en sí es sensible, edítalo antes —tapa el nombre, recorta la imagen— y " +
        "limpia después esa copia.",
      en:
        "If the content itself is sensitive, edit it first —cover the name, crop the image— and " +
        "then clean that copy.",
    },
  },

  // ── Los campos con nombre ───────────────────────────────────────────────────────────────────
  campos: {
    etiqueta: { es: "Campo por campo", en: "Field by field" },
    titulo: {
      es: "Qué dice el archivo de sí mismo",
      en: "What the file says about itself",
    },
    nota: {
      es:
        "Cada valor se enseña **enmascarado**: Velo no muestra más de la mitad, y uno corto sale " +
        "como `***`. El valor completo no sale de esta pestaña.",
      en:
        "Every value is shown **masked**: Velo never shows more than half of it, and a short " +
        "one appears as `***`. The full value never leaves this tab.",
    },
    descripcion: {
      es: "Campos con nombre que Velo encontró dentro del archivo, uno por fila",
      en: "Named fields Velo found inside the file, one per row",
    },
    detalle: {
      es: "Detalle de los campos del archivo",
      en: "Details of the file's fields",
    },
    encabezados: {
      campo: { es: "Campo", en: "Field" },
      donde: { es: "Dónde vive", en: "Where it lives" },
      revela: { es: "Qué revela", en: "What it reveals" },
      muestra: { es: "Muestra enmascarada", en: "Masked sample" },
      reconoce: { es: "Qué reconoce Velo", en: "What Velo recognizes" },
    },
    // «Contiene: …» cuando el validador lo vio en una PARTE del valor (`Ana Pérez · CC 1032456789`),
    // no en el valor entero: «aquí dentro hay una cédula», no «esto es una cédula».
    contiene: { es: "Contiene: {tipo}", en: "Contains: {tipo}" },
    sinReconocer: {
      es: "Nada que un algoritmo confirme",
      en: "Nothing an algorithm confirms",
    },
    vacio: { es: "(vacío)", en: "(empty)" },
    otrasUna: {
      es:
        "Además hay {n} etiqueta técnica sin nada personal (exposición, ISO, resolución…): se " +
        "quita junto con su bloque.",
      en:
        "There is also {n} technical tag with nothing personal in it (exposure, ISO, " +
        "resolution…): it is removed along with its block.",
    },
    otrasVarias: {
      es:
        "Además hay {n} etiquetas técnicas sin nada personal (exposición, ISO, resolución…): se " +
        "quitan junto con su bloque.",
      en:
        "There are also {n} technical tags with nothing personal in them (exposure, ISO, " +
        "resolution…): they are removed along with their block.",
    },
    ninguno: {
      titulo: {
        es: "Velo no encontró campos con nombre",
        en: "Velo found no named fields",
      },
      detalle: {
        es:
          "«Sin campos con nombre» no es lo mismo que «sin metadatos»: Velo lista lo que sabe " +
          "leer, y la limpieza quita además todo lo que no reconoce. Lo que se va a quitar está " +
          "más abajo.",
        en:
          "“No named fields” is not the same as “no metadata”: Velo lists what it knows how to " +
          "read, and the cleaning removes everything it does not recognize on top of that. What " +
          "will be removed is listed below.",
      },
    },
  },

  // Qué deja saber un campo. El símbolo es una forma, no un adorno: el texto lo dice igual.
  revela: {
    autoria: { es: "Autoría", en: "Authorship" },
    ubicacion: { es: "Ubicación", en: "Location" },
    dispositivo: { es: "Dispositivo", en: "Device" },
    software: { es: "Programa", en: "Software" },
    fecha: { es: "Fecha", en: "Date" },
    identificador: { es: "Identificador", en: "Identifier" },
    descripcion: { es: "Descripción", en: "Description" },
    otro: { es: "Otro", en: "Other" },
  },

  // Dónde vive el campo, con el nombre de su estándar y una pista de qué guarda.
  origen: {
    exif: { es: "EXIF (datos de la cámara)", en: "EXIF (camera data)" },
    gps: { es: "GPS (ubicación)", en: "GPS (location)" },
    xmp: {
      es: "XMP (etiquetas del programa)",
      en: "XMP (tags written by software)",
    },
    iptc: { es: "IPTC (autoría y derechos)", en: "IPTC (credit and rights)" },
    "png-texto": { es: "Texto de PNG", en: "PNG text" },
    comentario: { es: "Comentario", en: "Comment" },
    "pdf-info": { es: "Info del PDF", en: "PDF Info" },
    "pdf-xmp": { es: "XMP del PDF", en: "PDF XMP" },
    "pdf-revision-anterior": {
      es: "Versión anterior del PDF",
      en: "Earlier version of the PDF",
    },
  },

  // ── Qué se quita y qué se conserva ──────────────────────────────────────────────────────────
  elementos: {
    etiqueta: { es: "Antes de limpiar", en: "Before cleaning" },
    titulo: {
      es: "Qué se quita y qué se conserva",
      en: "What is removed and what is kept",
    },
    nota: {
      es:
        "La limpieza es por **lista blanca**: se conserva lo mínimo para ver la imagen o abrir " +
        "el documento, y todo lo demás se quita, aunque Velo no lo reconozca.",
      en:
        "The cleaning works from an **allow list**: only what is needed to display the image or " +
        "open the document is kept, and everything else is removed, even if Velo does not " +
        "recognize it.",
    },
    quitar: {
      titulo: { es: "Se quita", en: "Removed" },
      descripcion: {
        es: "Bloques que la limpieza quita del archivo",
        en: "Blocks the cleaning removes from the file",
      },
      ninguno: {
        es: "Velo no encontró bloques de metadatos que quitar.",
        en: "Velo found no metadata blocks to remove.",
      },
    },
    conservar: {
      titulo: { es: "Se conserva", en: "Kept" },
      descripcion: {
        es: "Bloques que la limpieza conserva",
        en: "Blocks the cleaning keeps",
      },
      ninguno: {
        es: "Nada aparte del contenido.",
        en: "Nothing beyond the content itself.",
      },
    },
    encabezados: {
      que: { es: "Qué es", en: "What it is" },
      marcador: { es: "Marcador técnico", en: "Technical marker" },
      cuantos: { es: "Cuántos", en: "How many" },
      tamano: { es: "Tamaño", en: "Size" },
    },
    // Un diccionario dentro de un PDF no ocupa bytes propios que se puedan contar.
    sinTamano: { es: "sin tamaño propio", en: "no size of its own" },
    clase: {
      // imágenes
      exif: {
        es: "Bloque EXIF (cámara, fecha, ubicación)",
        en: "EXIF block (camera, date, location)",
      },
      xmp: {
        es: "Bloque XMP (etiquetas del programa)",
        en: "XMP block (tags written by software)",
      },
      "xmp-extendido": { es: "XMP extendido", en: "Extended XMP" },
      iptc: {
        es: "Bloque IPTC (autoría y derechos)",
        en: "IPTC block (credit and rights)",
      },
      miniatura: {
        es: "Miniatura incrustada",
        en: "Embedded thumbnail",
      },
      fabricante: {
        es: "Notas privadas del fabricante de la cámara",
        en: "Camera maker's private notes",
      },
      "imagenes-adicionales": {
        es: "Imágenes adicionales dentro del archivo",
        en: "Additional images inside the file",
      },
      procedencia: {
        es: "Datos de procedencia del contenido (C2PA)",
        en: "Content provenance data (C2PA)",
      },
      comentario: { es: "Comentario", en: "Comment" },
      texto: { es: "Texto libre del archivo", en: "Free text in the file" },
      "fecha-de-cambio": {
        es: "Fecha de la última modificación",
        en: "Last-modified date",
      },
      aplicacion: { es: "Datos de una aplicación", en: "Application data" },
      auxiliar: {
        es: "Otros bloques del formato que Velo no reconoce",
        en: "Other format blocks Velo does not recognize",
      },
      "bytes-sobrantes": {
        es: "Bytes que sobran tras el final del archivo",
        en: "Bytes left over after the end of the file",
      },
      "datos-sin-uso": {
        es: "Datos dentro de la imagen que ningún elemento usa",
        en: "Data inside the image that no item uses",
      },
      // lo que se conserva en una imagen
      "perfil-de-color": { es: "Perfil de color", en: "Color profile" },
      orientacion: {
        es: "Orientación de la foto",
        en: "Photo orientation",
      },
      jfif: { es: "Cabecera de formato JFIF", en: "JFIF format header" },
      adobe: { es: "Marca de color de Adobe", en: "Adobe color marker" },
      // PDF
      "pdf-info": {
        es: "Diccionario de información (autor, programa, fechas)",
        en: "Information dictionary (author, software, dates)",
      },
      "pdf-xmp": {
        es: "Flujo de metadatos XMP",
        en: "XMP metadata stream",
      },
      "pdf-piece-info": {
        es: "Datos de la aplicación que lo creó",
        en: "Data from the application that made it",
      },
      "pdf-miniatura": { es: "Miniaturas de página", en: "Page thumbnails" },
      "pdf-ultima-modificacion": {
        es: "Fecha de la última edición de una página",
        en: "When a page was last edited",
      },
      "pdf-revisiones": {
        es: "Versiones anteriores del documento",
        en: "Earlier versions of the document",
      },
      "pdf-huerfanos": {
        es: "Objetos huérfanos (sin uso en el documento)",
        en: "Orphan objects (unused by the document)",
      },
      "pdf-id": {
        es: "Identificador del documento",
        en: "Document identifier",
      },
    },
  },

  // ── Los avisos ──────────────────────────────────────────────────────────────────────────────
  // Lo que hay que saber ANTES de limpiar y que el diagnóstico no puede callar. Los que llevan una
  // cuenta (`con`) la dicen al final, tras dos puntos, para que lea igual con 1 que con 40; si el
  // worker no la manda, vale la frase `sin`.
  avisos: {
    etiqueta: { es: "Avisos", en: "Notices" },
    titulo: {
      es: "Lo que hay que saber antes de limpiar",
      en: "What to know before cleaning",
    },
    tipos: {
      "extension-distinta": {
        es:
          "La extensión del archivo no coincide con su contenido. Velo lo trató por lo que es, " +
          "no por lo que dice su nombre.",
        en:
          "The file's extension does not match its contents. Velo treated it by what it is, not " +
          "by what its name says.",
      },
      "orientacion-conservada": {
        es:
          "Se conserva la orientación de la foto (un bloque EXIF mínimo con solo ese dato) para " +
          "que no se gire al abrirla.",
        en:
          "The photo's orientation is kept (a minimal EXIF block holding only that tag) so the " +
          "picture is not rotated when opened.",
      },
      "imagenes-adicionales": {
        es:
          "Había imágenes adicionales dentro del archivo (por ejemplo el mapa de ganancia HDR o " +
          "vistas alternativas): se quitan con lo demás.",
        en:
          "There were additional images inside the file (for instance an HDR gain map or " +
          "alternative views): they are removed along with the rest.",
      },
      "heic-auxiliares": {
        es:
          "La foto trae imágenes auxiliares (un mapa de profundidad o de realce HDR). Son píxeles " +
          "y se conservan; los datos que las describen se quitan, así que en una pantalla HDR la " +
          "foto puede verse con menos rango.",
        en:
          "The photo carries auxiliary images (a depth map or an HDR boost map). They are pixels " +
          "and are kept; the data describing them is removed, so on an HDR screen the photo may " +
          "show less range.",
      },
      "texto-comprimido": {
        es:
          "El archivo trae texto comprimido: se quita sin leerlo, así que no aparece en la " +
          "tabla de campos.",
        en:
          "The file carries compressed text: it is removed without being read, so it does not " +
          "appear in the table of fields.",
      },
      "exif-ilegible": {
        es: "Un bloque EXIF no se pudo leer: se quita entero igual, pero Velo no sabe qué decía.",
        en:
          "An EXIF block could not be read: it is removed whole anyway, but Velo does not know " +
          "what it said.",
      },
      "valores-recortados": {
        con: {
          es:
            "Valores demasiado largos, recortados en la tabla: {n}. Se quitan enteros de todos " +
            "modos.",
          en: "Values too long, shortened in the table: {n}. They are removed whole all the same.",
        },
        sin: {
          es:
            "Algunos valores eran demasiado largos y se recortaron en la tabla. Se quitan " +
            "enteros de todos modos.",
          en:
            "Some values were too long and were shortened in the table. They are removed whole " +
            "all the same.",
        },
      },
      "campos-de-mas": {
        con: {
          es: "Campos que no caben en la tabla: {n} más. La limpieza los quita igual.",
          en: "Fields that do not fit in the table: {n} more. The cleaning removes them anyway.",
        },
        sin: {
          es: "Había más campos de los que caben en la tabla. La limpieza los quita igual.",
          en: "There were more fields than fit in the table. The cleaning removes them anyway.",
        },
      },
      "pdf-firmado": {
        es:
          "Este PDF está firmado. Reescribirlo para limpiarlo **invalida la firma**: la copia " +
          "limpia ya no la conserva.",
        en:
          "This PDF is signed. Rewriting it to clean it **invalidates the signature**: the " +
          "clean copy no longer carries it.",
      },
      "pdf-anotaciones": {
        con: {
          es:
            "Anotaciones con autor: {n}. Velo las enseña pero **no las limpia**: el nombre de " +
            "quien comentó sigue dentro de la copia limpia.",
          en:
            "Annotations with an author: {n}. Velo shows them but **does not clean them**: the " +
            "name of whoever commented stays inside the clean copy.",
        },
        sin: {
          es:
            "Hay anotaciones con autor. Velo las enseña pero **no las limpia**: el nombre de " +
            "quien comentó sigue dentro de la copia limpia.",
          en:
            "There are annotations with an author. Velo shows them but **does not clean them**: " +
            "the name of whoever commented stays inside the clean copy.",
        },
      },
      "pdf-adjuntos": {
        con: {
          es:
            "Archivos adjuntos: {n}. Velo **no los limpia**: cada uno puede llevar sus propios " +
            "metadatos.",
          en:
            "Attached files: {n}. Velo **does not clean them**: each one can carry its own " +
            "metadata.",
        },
        sin: {
          es:
            "Hay archivos adjuntos. Velo **no los limpia**: cada uno puede llevar sus propios " +
            "metadatos.",
          en:
            "There are attached files. Velo **does not clean them**: each one can carry its own " +
            "metadata.",
        },
      },
      "pdf-formularios": {
        con: {
          es:
            "Campos de formulario: {n}. Sus nombres y valores **quedan como están**: lo que " +
            "alguien escribió en ellos sigue en la copia limpia.",
          en:
            "Form fields: {n}. Their names and values **stay as they are**: what someone typed " +
            "into them is still in the clean copy.",
        },
        sin: {
          es:
            "Hay campos de formulario. Sus nombres y valores **quedan como están**: lo que " +
            "alguien escribió en ellos sigue en la copia limpia.",
          en:
            "There are form fields. Their names and values **stay as they are**: what someone " +
            "typed into them is still in the clean copy.",
        },
      },
      "pdf-javascript": {
        es:
          "Este PDF lleva JavaScript incrustado. Velo **no lo toca**: puede contener datos o " +
          "direcciones, y sigue en la copia limpia.",
        en:
          "This PDF carries embedded JavaScript. Velo **does not touch it**: it can contain " +
          "data or addresses, and it stays in the clean copy.",
      },
      "pdf-flujos-de-objetos": {
        es:
          "Una versión anterior estaba guardada en flujos de objetos comprimidos: se quita, " +
          "pero Velo no puede listar qué decía.",
        en:
          "An earlier version was stored in compressed object streams: it is removed, but Velo " +
          "cannot list what it said.",
      },
    },
  },

  // ── La historia de un PDF ───────────────────────────────────────────────────────────────────
  revisiones: {
    etiqueta: { es: "La historia del PDF", en: "The PDF's history" },
    tituloUna: {
      es: "Este PDF guarda una sola versión",
      en: "This PDF keeps a single version",
    },
    tituloVarias: {
      es: "Este PDF guarda {n} versiones dentro",
      en: "This PDF keeps {n} versions inside",
    },
    sinHistoria: {
      es: "Velo no detectó versiones anteriores dentro del archivo.",
      en: "Velo detected no earlier versions inside the file.",
    },
    conHistoria: {
      es:
        "Cada vez que un programa «guarda» sumando cambios al final, la versión anterior se " +
        "queda dentro del archivo aunque no se vea: un texto reemplazado, un autor anterior, " +
        "una página borrada.",
      en:
        "Every time a program “saves” by adding changes at the end, the earlier version stays " +
        "inside the file even though it cannot be seen: a replaced text, a previous author, a " +
        "deleted page.",
    },
    anterioresUna: {
      es: "La limpieza deja solo la última versión y **quita la anterior**.",
      en: "The cleaning keeps only the last version and **removes the earlier one**.",
    },
    anterioresVarias: {
      es: "La limpieza deja solo la última versión y **quita las {anteriores} anteriores**.",
      en: "The cleaning keeps only the last version and **removes the {anteriores} earlier ones**.",
    },
    cifras: {
      versiones: { es: "Versiones guardadas", en: "Versions kept" },
      redefinidos: {
        es: "Objetos reemplazados por una edición",
        en: "Objects replaced by an edit",
      },
      id: {
        es: "Identificador de documento",
        en: "Document identifier",
      },
      conId: { es: "Sí, lo trae", en: "Yes, it has one" },
      sinId: { es: "No lo trae", en: "It has none" },
    },
    idNota: {
      es:
        "El identificador (`/ID`) ata una copia a su original y sobrevive a cada edición. La " +
        "limpieza lo cambia por uno nuevo, calculado solo a partir del contenido limpio.",
      en:
        "The identifier (`/ID`) ties a copy to its original and survives every edit. The " +
        "cleaning replaces it with a new one, computed only from the clean content.",
    },
  },

  // ── La limpieza (`/transformar`) ────────────────────────────────────────────────────────────
  limpieza: {
    etiqueta: { es: "Limpieza de metadatos", en: "Metadata cleaning" },
    titulo: {
      es: "Limpia lo que el archivo dice de sí mismo",
      en: "Clean what the file says about itself",
    },
    // Va partido porque en medio está el nombre del archivo, que es del usuario.
    resumen: {
      antes: {
        es: "Velo va a escribir una copia de",
        en: "Velo will write a copy of",
      },
      despues: {
        es:
          " sin sus metadatos y a volver a leerla para comprobarlo. No hay opciones que elegir: " +
          "se quita todo lo que no hace falta para ver el archivo, y el diagnóstico ya dijo qué " +
          "era. Todo ocurre en esta pestaña.",
        en:
          " without its metadata and read it again to check it. There are no options to " +
          "choose: everything not needed to display the file is removed, and the diagnosis " +
          "already said what that was. Everything happens in this tab.",
      },
    },
    limpiar: { es: "Limpiar", en: "Clean" },
    limpiando: { es: "Limpiando…", en: "Cleaning…" },
    progreso: {
      limpiando: {
        es: "Reescribiendo el archivo sin sus metadatos",
        en: "Rewriting the file without its metadata",
      },
      comprobando: {
        es: "Volviendo a leer el archivo limpio, para comprobarlo",
        en: "Reading the clean file again, to check it",
      },
    },
    // Los fallos dicen QUÉ HACER, igual que los de la aduana y los del taller.
    fallo: {
      titulo: {
        es: "No se entregó ningún archivo",
        en: "No file was handed over",
      },
      limpiezaIncompleta: {
        es:
          "Velo reescribió el archivo y lo volvió a leer, y esa lectura todavía encontró campos " +
          "con nombre; por eso **no te lo entrega**. El original no se tocó. No uses un archivo " +
          "que Velo no pudo dejar limpio: genera una copia nueva desde su origen —imprime el " +
          "documento a PDF, o exporta la imagen otra vez— y limpia esa.",
        en:
          "Velo rewrote the file and read it again, and that second read still found named " +
          "fields; that is why it **will not hand it over**. The original was not touched. Do " +
          "not use a file Velo could not leave clean: make a fresh copy from its source —print " +
          "the document to PDF, or export the image again— and clean that one.",
      },
      ilegible: {
        es:
          "Velo no pudo reescribir el archivo: puede estar dañado o tener una estructura que no " +
          "sabe leer. Vuelve a la aduana, genera una copia nueva desde su origen y suéltala.",
        en:
          "Velo could not rewrite the file: it may be damaged or have a structure it cannot " +
          "read. Go back to the customs checkpoint, make a fresh copy from its source and drop " +
          "it in.",
      },
      perdido: {
        es:
          "Velo ya no tiene el archivo en memoria. Vuelve a la aduana y suéltalo otra vez: " +
          "tarda lo mismo que la primera.",
        en:
          "Velo no longer has the file in memory. Go back to the customs checkpoint and drop it " +
          "in again: it takes as long as the first time.",
      },
      generico: {
        es:
          "Algo falló al limpiar y Velo prefirió no entregar nada. Vuelve a la aduana, suelta " +
          "el archivo otra vez e inténtalo de nuevo.",
        en:
          "Something went wrong while cleaning, and Velo preferred to hand over nothing. Go " +
          "back to the customs checkpoint, drop the file in again and try once more.",
      },
    },

    // ── El resultado ────────────────────────────────────────────────────────────────────────
    resultado: {
      etiqueta: { es: "Resultado", en: "Result" },
      titulo: {
        es: "Esto es lo que Velo quitó",
        en: "This is what Velo removed",
      },
      // El límite se repite aquí, a pie de resultado: es la pantalla desde la que se entrega.
      limite: {
        es:
          "**Qué no cambió:** el texto de las páginas y lo que se ve en la imagen quedaron como " +
          "estaban. Si ahí hay un nombre, una cara o un número, siguen ahí.",
        en:
          "**What did not change:** the text on the pages and what can be seen in the image are " +
          "as they were. If there is a name, a face or a number in them, it is still there.",
      },
      cifras: {
        campos: {
          es: "Campos con nombre que tenía",
          en: "Named fields it had",
        },
        bloques: { es: "Bloques quitados", en: "Blocks removed" },
        versiones: {
          es: "Versiones anteriores quitadas",
          en: "Earlier versions removed",
        },
        tamano: { es: "Tamaño", en: "Size" },
        // Dos tamaños con una flecha: sin letras, igual en los dos idiomas.
        tamanoValor: { es: "{antes} → {despues}", en: "{antes} → {despues}" },
      },
      // La poscomprobación dicha como un HECHO con su cifra, que es la parte que alguien puede
      // volver a comprobar. Entregado, siempre dice 0: si no, Velo no lo entrega.
      comprobacionUna: {
        es: "Velo volvió a leer el archivo limpio: **{n} campo con nombre**.",
        en: "Velo read the clean file again: **{n} named field**.",
      },
      comprobacionVarias: {
        es: "Velo volvió a leer el archivo limpio: **{n} campos con nombre**.",
        en: "Velo read the clean file again: **{n} named fields**.",
      },
      versionUnica: {
        es: "El PDF limpio guarda **una sola versión**: no queda ninguna anterior.",
        en: "The clean PDF keeps **a single version**: no earlier one is left.",
      },
      versionesQueQuedan: {
        es: "El PDF limpio todavía guarda **{n} versiones**.",
        en: "The clean PDF still keeps **{n} versions**.",
      },
      // La comprobación la hace el mismo lector que hizo el diagnóstico: se dice, y se ofrece la salida.
      comprobacionLimite: {
        es:
          "Lo comprobó el mismo lector que hizo el diagnóstico. Si quieres una segunda opinión, " +
          "pásale al archivo limpio otra herramienta de metadatos.",
        en:
          "The same reader that made the diagnosis ran the check. For a second opinion, run " +
          "another metadata tool on the clean file.",
      },
      quitado: {
        titulo: { es: "Se quitó", en: "Removed" },
        descripcion: {
          es: "Bloques que la limpieza quitó del archivo",
          en: "Blocks the cleaning removed from the file",
        },
        ninguno: {
          es: "No había bloques de metadatos que quitar.",
          en: "There were no metadata blocks to remove.",
        },
      },
      conservado: {
        titulo: { es: "Se conservó", en: "Kept" },
        descripcion: {
          es: "Bloques que la limpieza conservó",
          en: "Blocks the cleaning kept",
        },
        ninguno: {
          es: "Nada aparte del contenido.",
          en: "Nothing beyond the content itself.",
        },
      },
      idNuevo: {
        titulo: {
          es: "Identificador nuevo del documento",
          en: "New document identifier",
        },
        nota: {
          es:
            "Se calculó solo a partir del contenido limpio: el mismo archivo da siempre el " +
            "mismo identificador, y ya no ata esta copia a su original.",
          en:
            "It was computed only from the clean content: the same file always gets the same " +
            "identifier, and it no longer ties this copy to its original.",
        },
      },
    },

    // ── El archivo limpio ───────────────────────────────────────────────────────────────────
    archivo: {
      etiqueta: { es: "El archivo limpio", en: "The clean file" },
      titulo: { es: "Llévate la copia limpia", en: "Take the clean copy" },
      nota: {
        es:
          "El nombre sale de la huella del original, no de su nombre: un nombre de archivo ya " +
          "cuenta de qué trata. El original no se tocó.",
        en:
          "The name comes from the original's fingerprint, not from its name: a file name " +
          "already says what the file is about. The original was not touched.",
      },
      huellaDeEntrada: {
        es: "Huella del original",
        en: "Original's fingerprint",
      },
      huellaDeSalida: {
        es: "Huella del archivo limpio",
        en: "Clean file's fingerprint",
      },
      guardar: { es: "Guardar", en: "Save" },
      escribeTuNavegador: {
        es: "{tamano} · lo escribe tu navegador, no un servidor",
        en: "{tamano} · written by your browser, not by a server",
      },
    },
  },

  // ── El certificado de la limpieza ───────────────────────────────────────────────────────────
  // El resto del panel (formato, vista previa, descargar) es el del certificado del taller.
  certificado: {
    etiqueta: { es: "Certificado de la limpieza", en: "Cleaning certificate" },
    titulo: {
      es: "Llévate el certificado de la limpieza",
      en: "Take the cleaning certificate with you",
    },
    nota: {
      es:
        "Lleva las **dos huellas**: la del archivo que entró y la de la copia limpia. Quien lo " +
        "reciba puede recalcular la segunda y comprobar que este documento habla de **esa copia " +
        "exacta** — y lee, con el mismo peso, lo que la limpieza no tocó.",
      en:
        "It carries **both fingerprints**: the one for the file that came in and the one for " +
        "the clean copy. Whoever receives it can recompute the second and check that this " +
        "document is about **that exact copy** — and reads, with the same weight, what the " +
        "cleaning did not touch.",
    },
    lleva: {
      etiqueta: { es: "Lleva:", en: "Carries:" },
      cuerpo: {
        es:
          "los campos que tenía el archivo con sus valores enmascarados, qué se quitó y qué se " +
          "conservó, lo que Velo no toca, la comprobación posterior, las dos huellas y la fecha.",
        en:
          "the fields the file had, with their values masked, what was removed and what was " +
          "kept, what Velo does not touch, the check made afterwards, both fingerprints and " +
          "the date.",
      },
    },
    noLleva: {
      etiqueta: { es: "No lleva:", en: "Does not carry:" },
      cuerpo: {
        es: "ningún valor completo de los metadatos, ni nada del contenido del archivo.",
        en: "any full metadata value, or anything from the file's contents.",
      },
    },
  },

  // ── La anotación en la bitácora ─────────────────────────────────────────────────────────────
  anotar: {
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
  },
} as const satisfies Catalogo;
