// La pantalla de la bitácora (`/bitacora`): abrir el historial cifrado, anotar lo que se acaba de
// hacer, y leerlo meses después. El glosario vive en `comun.ts`: bitácora = log, bóveda = vault,
// frase de paso = passphrase, tratamiento = treatment, huella = fingerprint.
//
// **Las llaves son núcleo de UX (regla dura nº6), y aquí lo son más que en ningún sitio**: la
// bitácora y la bóveda se abren con frases DISTINTAS, y una frase perdida hace el archivo
// irrecuperable — ni Velo ni nadie puede abrirlo. Ese aviso (`ayudaPrimera`) está ANTES del botón
// que cifra, y dice lo mismo, con la misma fuerza, en los dos idiomas. «Garantía, no defecto».
//
// **El español es el que ya existía, palabra por palabra** (las pruebas lo buscan). Donde el español
// no distingue singular de plural pero el inglés sí, las dos claves comparten el `es` y solo cambia
// el `en`.

import type { Catalogo } from "../index";

export const BITACORA = {
  pagina: {
    abriendo: { es: "Abriendo…", en: "Opening…" },
    etiqueta: { es: "La bitácora", en: "The log" },
    titulo: {
      es: "Qué has tratado, y cuándo",
      en: "Which files you've treated, and when",
    },
    intro: {
      es:
        "Tu historial de tratamientos, en un archivo cifrado que guardas tú: qué anonimizaste, " +
        "cuándo, con qué política y con qué riesgo resultante. Va cifrado porque el nombre de un " +
        "archivo ya cuenta de qué va su contenido. Como la bóveda, vive donde tú decidas — no " +
        "en este navegador.",
      en:
        "Your history of treatments, in an encrypted file that you keep: what you anonymized, " +
        "when, with which policy and with what resulting risk. It is encrypted because a file's " +
        "name already tells what its contents are about. Like the vault, it lives wherever you " +
        "decide — not in this browser.",
    },
  },

  guardar: { es: "Guardar la bitácora", en: "Save the log" },
  unidades: {
    fila: { es: "fila", en: "row" },
    filas: { es: "filas", en: "rows" },
  },

  // ── La bitácora ya sellada, esperando a que se guarde ───────────────────────────────────────
  lista: {
    etiqueta: { es: "Guardada", en: "Recorded" },
    titulo: {
      es: "Tu bitácora, lista para guardar",
      en: "Your log, ready to save",
    },
    nota: {
      es: "Sustituye el archivo anterior: una bitácora es una sola y crece.",
      en: "It replaces the previous file: a log is a single file, and it grows.",
    },
  },

  // ── 1 · La anotación que trae del taller ─────────────────────────────────────────────────────
  anotacion: {
    guardada: {
      etiqueta: { es: "Paso 2 · guardar", en: "Step 2 · save" },
      titulo: {
        es: "Anotado. Ahora guarda el archivo",
        en: "Noted. Now save the file",
      },
      nota: {
        es:
          "Sin guardarlo, esta anotación se pierde al cerrar la pestaña — Velo no tiene dónde " +
          "recordarla.",
        en:
          "If you don't save it, this entry is lost when you close the tab — Velo has nowhere " +
          "to remember it.",
      },
      sustituye: {
        es: "— sustituye al archivo anterior. Una bitácora es una sola y crece.",
        en: "— it replaces the previous file. A log is a single file, and it grows.",
      },
    },
    etiqueta: { es: "Paso 1 · la anotación", en: "Step 1 · the entry" },
    tituloPrimera: {
      es: "Tu primera anotación",
      en: "Your first entry",
    },
    // `{n}` es cuántas entradas tiene la bitácora abierta. En español se escribe igual con una
    // que con varias («las 1»); el inglés concuerda.
    tituloSiguienteUna: {
      es: "Añadir al final de las {n}",
      en: "Add to the end of the log ({n} entry)",
    },
    tituloSiguienteVarias: {
      es: "Añadir al final de las {n}",
      en: "Add to the end of the log ({n} entries)",
    },
    notaPrimera: {
      es:
        "No tienes ninguna bitácora abierta, así que esta empieza una. Si ya tenías una, " +
        "ábrela primero ahí abajo y la anotación se le añade al final en vez de empezar otra.",
      en:
        "You have no log open, so this entry starts one. If you already had one, open it first " +
        "down below and the entry is added to the end of it instead of starting another.",
    },
    notaSiguiente: {
      es:
        "Se añade al final. Las anteriores no se tocan: lo que ya está escrito no cambia porque " +
        "se escriba algo nuevo.",
      en:
        "It is added at the end. The earlier ones are not touched: what is already written does " +
        "not change because something new is written.",
    },
    fraseNueva: {
      es: "Elige la frase de paso de tu bitácora",
      en: "Choose the passphrase for your log",
    },
    fraseExistente: {
      es: "Frase de paso de tu bitácora",
      en: "Your log's passphrase",
    },
    // El aviso de la llave. Es la última cosa que se lee antes de cifrar, y no se suaviza.
    ayudaPrimera: {
      es:
        "Al menos {minimo} caracteres. Que **no sea** la de la bóveda ni la del proyecto: son " +
        "tres secretos con tres alcances, y reusarlos convierte la filtración de uno en la " +
        "filtración de todo. Sin ella no hay forma de leer tu bitácora — ni Velo, ni nadie.",
      en:
        "At least {minimo} characters. It must **not be** the same as your vault's or your " +
        "project's: those are three secrets with three different scopes, and reusing them " +
        "turns one leak into a leak of everything. Without it there is no way to read your " +
        "log — not Velo, not anyone.",
    },
    ayudaSiguiente: {
      es:
        "Al menos {minimo} caracteres. La misma con la que la abriste. Velo no la recuerda " +
        "entre pasos, a propósito.",
      en:
        "At least {minimo} characters. The same one you opened it with. Velo does not " +
        "remember it between steps, on purpose.",
    },
    cifrando: { es: "Cifrando…", en: "Encrypting…" },
    cifrarPrimera: {
      es: "Cifrar y empezar la bitácora",
      en: "Encrypt and start the log",
    },
    anadir: { es: "Añadir y cifrar", en: "Add and encrypt" },
    descartar: { es: "Descartar la anotación", en: "Discard the entry" },
    derivando: {
      es: "Derivando la llave de cifrado y sellando el archivo.",
      en: "Deriving the encryption key and sealing the file.",
    },
  },

  // ── 2 · Abrir la que ya existe ───────────────────────────────────────────────────────────────
  apertura: {
    etiqueta: { es: "Tu bitácora", en: "Your log" },
    titulo: {
      es: "Abre la bitácora que guardaste",
      en: "Open the log you saved",
    },
    nota: {
      es:
        "El archivo `.velolog` y su frase. Se descifra dentro de esta pestaña; nada se envía a " +
        "ningún sitio.",
      en:
        "The `.velolog` file and its passphrase. It is decrypted inside this tab; nothing is " +
        "sent anywhere.",
    },
    elegir: { es: "Elegir la bitácora", en: "Choose the log" },
    ariaArchivo: { es: "Archivo de bitácora", en: "Log file" },
    ningunArchivo: {
      es: "Ningún archivo elegido todavía.",
      en: "No file chosen yet.",
    },
    frase: { es: "Frase de paso", en: "Passphrase" },
    abrir: { es: "Abrir la bitácora", en: "Open the log" },
    descifrando: { es: "Descifrando…", en: "Decrypting…" },
    derivando: {
      es: "Derivando la llave. Tarda lo que tiene que tardar.",
      en: "Deriving the key. It takes as long as it takes.",
    },
    // Cada fallo con su frase. El primero es el que más trabajo hace: abrir una bóveda donde se
    // esperaba una bitácora es el error más probable del usuario, y responderle «frase incorrecta»
    // lo mandaría a probar frases media hora.
    fallos: {
      "no-es-una-bitacora": {
        es: "Ese archivo no es una bitácora de Velo. Busca el que termina en .velolog — si el tuyo termina en .velo, esa es la bóveda, y se abre en El regreso.",
        en: "That file is not a Velo log. Look for the one that ends in .velolog — if yours ends in .velo, that is the vault, and it opens in The return.",
      },
      "version-distinta": {
        es: "Esa bitácora la hizo otra versión de Velo y esta no sabe leerla.",
        en: "That log was made by another version of Velo, and this one cannot read it.",
      },
      "frase-incorrecta": {
        es: "La frase no abre esta bitácora. También sale este mensaje si el archivo se dañó o lo modificaron.",
        en: "That passphrase does not open this log. You also get this message if the file was damaged or has been modified.",
      },
      "costo-inaceptable": {
        es: "La bitácora declara un costo de descifrado fuera de lo razonable: está dañada o la modificaron.",
        en: "The log declares a decryption cost beyond what is reasonable: it is damaged or has been modified.",
      },
      "contenido-invalido": {
        es: "El archivo se descifró, pero lo que hay dentro no tiene la forma de una bitácora de Velo.",
        en: "The file was decrypted, but what is inside does not have the shape of a Velo log.",
      },
      "lectura-fallida": {
        es: "No se pudo leer el archivo.",
        en: "The file could not be read.",
      },
    },
  },

  // ── 3 · Las entradas ─────────────────────────────────────────────────────────────────────────
  entradas: {
    etiqueta: { es: "Tu historial", en: "Your history" },
    tituloUna: {
      es: "Un tratamiento anotado",
      en: "One treatment logged",
    },
    tituloVarias: {
      es: "{n} tratamientos anotados",
      en: "{n} treatments logged",
    },
    nota: {
      es:
        "De la más reciente a la más antigua. Cada una lleva las dos huellas, así que puedes " +
        "atarla al certificado que entregaste.",
      en:
        "Newest first. Each one carries both fingerprints, so you can tie it to the " +
        "certificate you handed over.",
    },
    // `{fecha} · {filas} {unidadFilas} · {tecnicas}` — la línea de cada entrada en la lista.
    linea: {
      es: "{fecha} · {filas} {unidadFilas} · {tecnicas}",
      en: "{fecha} · {filas} {unidadFilas} · {tecnicas}",
    },
    sinTecnicas: { es: "sin técnicas", en: "no techniques" },
    huellaAntes: {
      es: "Huella de la bitácora:",
      en: "Log fingerprint:",
    },
    huellaDespues: {
      es:
        "— del contenido en claro, no del archivo cifrado: ese cambia entero cada vez que se " +
        "guarda, por diseño.",
      en:
        "— of the plaintext contents, not of the encrypted file: that one changes entirely " +
        "every time it is saved, by design.",
    },
    cerrar: { es: "Cerrar la bitácora", en: "Close the log" },
  },

  // ── El detalle de una entrada ────────────────────────────────────────────────────────────────
  detalle: {
    archivo: { es: "Archivo", en: "File" },
    fecha: { es: "Fecha", en: "Date" },
    filas: { es: "Filas", en: "Rows" },
    tecnicas: { es: "Técnicas", en: "Techniques" },
    ninguna: { es: "ninguna", en: "none" },
    // Las DOS puntas del riesgo, nunca la reducción entre ellas (ADR-007): «bajó del 30 % al 2 %»
    // es cierta y puede engañar, y una bitácora se lee meses después, sin la pantalla al lado que
    // la matice.
    unicos: { es: "Registros únicos", en: "Unique records" },
    unicosValor: {
      es: "{antes} antes · {despues} después",
      en: "{antes} before · {despues} after",
    },
    politica: { es: "Política", en: "Policy" },
    huellaDeEntrada: { es: "Huella de entrada", en: "Input fingerprint" },
    huellaDeSalida: { es: "Huella de salida", en: "Output fingerprint" },
    salvedades: {
      es:
        "Aquel tratamiento llevaba salvedades que descalificaban su cifra de reducción. Las " +
        "dos proporciones de arriba son ciertas por separado; restarlas y presentarlo como el " +
        "efecto del tratamiento, no.",
      en:
        "That treatment came with caveats that disqualified its reduction figure. The two " +
        "proportions above are true separately; subtracting them and presenting the result as " +
        "the effect of the treatment is not.",
    },
  },
} as const satisfies Catalogo;
