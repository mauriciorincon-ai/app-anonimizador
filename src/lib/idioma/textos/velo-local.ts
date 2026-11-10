// Velo local (S9, ADR-017) — lo que dicen la consola y la API en el equipo del usuario.
//
// Vive aquí, con el resto del texto de Velo, y no en `velo-local/`: así el gate de paridad lo
// descubre solo y el barrido de copy prohibido lo lee igual que a las pantallas. Es texto, no
// código que corra en la web: ninguna página lo importa.
//
// Glosario (ver `comun.ts`): frase de paso → passphrase · llave → key · sal → salt · huella →
// fingerprint · bóveda → vault · tabla → table · base de datos → database.

import type { Catalogo } from "../index";

export const VELO_LOCAL = {
  ayuda: {
    es:
      "Velo local: el mismo motor de la web, en tu equipo.\n\n" +
      "  pnpm velo diagnosticar <archivo.csv>\n" +
      "  pnpm velo anonimizar <archivo.csv> --politica <habeas-data|hipaa|rgpd|archivo.json> [--salida <carpeta>] [--sal <hex>] [--bitacora <archivo.velolog>]\n" +
      "  pnpm velo restaurar <devuelto.csv> --boveda <archivo.velo> [--salida <carpeta>]\n" +
      "  pnpm velo puente --tabla <esquema.tabla> --politica <…> [--salida <carpeta>] [--reemplazar]\n" +
      "  pnpm velo puente --restaurar --tabla <esquema.tabla__velo> --boveda <archivo.velo>\n" +
      "  pnpm velo api [--politica <…>]\n\n" +
      "Las frases de paso salen de VELO_FRASE (la llave) y VELO_FRASE_BOVEDA (la bóveda), o de la consola, sin eco. " +
      "La conexión a la base sale de VELO_DB_URL o de la consola. Nunca de un argumento: quedaría en el historial.\n" +
      "--idioma es|en cambia el idioma de los mensajes y de los documentos.",
    en:
      "Velo local: the same engine as the web app, on your machine.\n\n" +
      "  pnpm velo diagnosticar <file.csv>\n" +
      "  pnpm velo anonimizar <file.csv> --politica <habeas-data|hipaa|rgpd|file.json> [--salida <folder>] [--sal <hex>] [--bitacora <file.velolog>]\n" +
      "  pnpm velo restaurar <returned.csv> --boveda <file.velo> [--salida <folder>]\n" +
      "  pnpm velo puente --tabla <schema.table> --politica <…> [--salida <folder>] [--reemplazar]\n" +
      "  pnpm velo puente --restaurar --tabla <schema.table__velo> --boveda <file.velo>\n" +
      "  pnpm velo api [--politica <…>]\n\n" +
      "Passphrases come from VELO_FRASE (the key) and VELO_FRASE_BOVEDA (the vault), or from the console, without echo. " +
      "The database connection comes from VELO_DB_URL or from the console. Never from an argument: it would stay in your shell history.\n" +
      "--idioma es|en sets the language of messages and documents.",
  },
  pedir: {
    frase: {
      es: "Frase de paso de la llave (no se ve al escribir): ",
      en: "Key passphrase (hidden while you type): ",
    },
    fraseDeBoveda: {
      es: "Frase de paso de la bóveda (no se ve al escribir): ",
      en: "Vault passphrase (hidden while you type): ",
    },
    fraseDeBitacora: {
      es: "Frase de paso de la bitácora (no se ve al escribir): ",
      en: "Logbook passphrase (hidden while you type): ",
    },
    conexion: {
      es: "Conexión a la base (no se ve al escribir): ",
      en: "Database connection (hidden while you type): ",
    },
    tabla: {
      es: "¿Qué tabla? Escribe esquema.tabla: ",
      en: "Which table? Type schema.table: ",
    },
    politica: {
      es: "¿Qué política? habeas-data, hipaa, rgpd o la ruta de un archivo exportado: ",
      en: "Which policy? habeas-data, hipaa, rgpd or the path of an exported file: ",
    },
    tablas: {
      es: "Tablas con llave primaria en esta base:",
      en: "Tables with a primary key in this database:",
    },
  },
  aviso: {
    fraseIrrecuperable: {
      es: "Si pierdes la frase de paso, la bóveda y la bitácora **no se pueden abrir**: nadie, ni Velo, puede recuperarla.",
      en: "If you lose the passphrase, the vault and the logbook **cannot be opened**: nobody, not even Velo, can recover it.",
    },
    sal: {
      es: "Sal de la llave: {sal}. Guárdala con la frase: sin las dos, los seudónimos de mañana no cuadran con los de hoy.",
      en: "Key salt: {sal}. Keep it with the passphrase: without both, tomorrow's pseudonyms won't match today's.",
    },
    huellaDeLlave: {
      es: "Huella de la llave: {huella}",
      en: "Key fingerprint: {huella}",
    },
    quedoSinBorrar: {
      es: "No pude borrar {ruta}: la corrida falló y ese archivo quedó en el disco, posiblemente a medias. Bórralo tú.",
      en: "I could not delete {ruta}: the run failed and that file is still on disk, possibly half-written. Delete it yourself.",
    },
  },
  resultado: {
    diagnostico: {
      es: "{filas} filas · {columnas} columnas · riesgo exacto: {unicos} de las filas son únicas por sus cuasi-identificadores.",
      en: "{filas} rows · {columnas} columns · exact risk: {unicos} of rows are unique on their quasi-identifiers.",
    },
    columna: {
      es: "  {nombre}: {categoria} ({tipo})",
      en: "  {nombre}: {categoria} ({tipo})",
    },
    escrito: {
      es: "Escrito: {ruta}",
      en: "Written: {ruta}",
    },
    huellas: {
      es: "Huella de entrada: {entrada}\nHuella de salida:  {salida}",
      en: "Input fingerprint:  {entrada}\nOutput fingerprint: {salida}",
    },
    riesgo: {
      es: "Filas únicas: antes {antes}, después {despues} (riesgo exacto, sobre el archivo entero).",
      en: "Unique rows: before {antes}, after {despues} (exact risk, over the whole file).",
    },
    restaurado: {
      es: "Restauradas {restauradas} celdas de {filas} filas.",
      en: "Restored {restauradas} cells across {filas} rows.",
    },
    sinBoveda: {
      es: "La política no pide columnas reversibles: no hay bóveda que guardar.",
      en: "The policy asks for no reversible columns: there is no vault to save.",
    },
  },
  api: {
    escuchando: {
      es: "API de Velo local en http://127.0.0.1:{puerto} (solo este equipo). Token de esta sesión, se muestra una vez:",
      en: "Velo local API on http://127.0.0.1:{puerto} (this machine only). This session's token, shown once:",
    },
    cerrar: {
      es: "Ctrl-C la cierra. El token muere con ella.",
      en: "Ctrl-C closes it. The token dies with it.",
    },
  },
  puente: {
    tablaEscrita: {
      es: "Tabla nueva: {tabla} ({filas} filas). La original no se tocó: su huella antes y después es {huella}.",
      en: "New table: {tabla} ({filas} rows). The original was not touched: its fingerprint before and after is {huella}.",
    },
    restauradaEnClaro: {
      es: "{tabla} lleva los valores originales, en claro, y cualquiera con permiso de leer el esquema puede verla. Dásela solo a quien podía ver la original, y bórrala cuando ya no la necesites.",
      en: "{tabla} holds the original values in clear text, and anyone allowed to read the schema can see it. Give it only to people who could see the original, and drop it once you no longer need it.",
    },
    nota: {
      es: "La huella de la tabla es la de su CSV canónico (encabezado y filas en el orden de la llave primaria, celdas como texto). El vacío y el NULL son lo mismo para Velo; la tabla nueva guarda el vacío como NULL y agrega la columna __velo_fila.",
      en: "The table's fingerprint is that of its canonical CSV (header and rows in primary-key order, cells as text). Velo treats empty and NULL as the same; the new table stores empty as NULL and adds the __velo_fila column.",
    },
  },
  error: {
    uso: {
      es: "No entendí la orden. `pnpm velo --ayuda` enseña las que hay.",
      en: "I didn't understand the command. `pnpm velo --ayuda` lists them.",
    },
    carpetaNoExiste: {
      es: "La carpeta de salida (`--salida`) no existe: créala primero.",
      en: "The output folder (`--salida`) does not exist: create it first.",
    },
    sinArchivo: {
      es: "Falta el archivo de entrada.",
      en: "The input file is missing.",
    },
    sinPolitica: {
      es: "Falta la política (`--politica`).",
      en: "The policy is missing (`--politica`).",
    },
    politicaInvalida: {
      es: "La política no se pudo leer: {detalle}",
      en: "The policy could not be read: {detalle}",
    },
    sinBoveda: {
      es: "Falta la bóveda (`--boveda`).",
      en: "The vault is missing (`--boveda`).",
    },
    bovedaInvalida: {
      es: "La bóveda no se pudo abrir: {detalle}",
      en: "The vault could not be opened: {detalle}",
    },
    bitacoraInvalida: {
      es: "La bitácora no se pudo abrir: {detalle}",
      en: "The logbook could not be opened: {detalle}",
    },
    sinFrase: {
      es: "Falta la frase de paso: ponla en {variable} o corre la orden en una consola para escribirla.",
      en: "The passphrase is missing: set {variable} or run the command in a console to type it.",
    },
    salInvalida: {
      es: "La sal tiene que ser hexadecimal, 32 caracteres.",
      en: "The salt must be hexadecimal, 32 characters.",
    },
    noCabe: {
      es: "Este archivo no se puede tratar por pasadas: {motivo}.",
      en: "This file cannot be processed in passes: {motivo}.",
    },
    jsonInvalido: {
      es: "El JSON no se pudo leer ({motivo}, línea {linea}). No se escribió nada.",
      en: "The JSON could not be read ({motivo}, line {linea}). Nothing was written.",
    },
    archivoCambio: {
      es: "El archivo cambió mientras Velo lo leía. No se escribió nada.",
      en: "The file changed while Velo was reading it. Nothing was written.",
    },
    yaExiste: {
      es: "{ruta} ya existe. Velo no sobrescribe: elige otra carpeta o bórralo tú.",
      en: "{ruta} already exists. Velo does not overwrite: pick another folder or delete it yourself.",
    },
    sinConexion: {
      es: "Falta la conexión a la base: ponla en VELO_DB_URL o corre la orden en una consola para escribirla.",
      en: "The database connection is missing: set VELO_DB_URL or run the command in a console to type it.",
    },
    motorDesconocido: {
      es: "Velo solo habla con PostgreSQL (postgres://) y SQL Server (mssql://).",
      en: "Velo only talks to PostgreSQL (postgres://) and SQL Server (mssql://).",
    },
    tablaDesconocida: {
      es: "La tabla {tabla} no existe en esta base, o no se puede leer.",
      en: "The table {tabla} does not exist in this database, or cannot be read.",
    },
    sinLlavePrimaria: {
      es: "La tabla {tabla} no tiene llave primaria. Sin ella no hay un orden estable de las filas, y sin orden estable Velo no puede prometer los mismos bytes: no la trata.",
      en: "The table {tabla} has no primary key. Without one there is no stable row order, and without a stable order Velo cannot promise the same bytes: it won't process it.",
    },
    tablaDestinoExiste: {
      es: "La tabla {tabla} ya existe. Velo no la reemplaza salvo que se lo pidas con `--reemplazar`.",
      en: "The table {tabla} already exists. Velo won't replace it unless you ask with `--reemplazar`.",
    },
    origenEsDestino: {
      es: "Velo jamás escribe sobre la tabla de origen.",
      en: "Velo never writes over the source table.",
    },
    nombreLargo: {
      es: "El nombre de la tabla nueva pasaría de {maximo} bytes, y la base lo recortaría en silencio. Velo prefiere negarse.",
      en: "The new table's name would exceed {maximo} bytes, and the database would silently truncate it. Velo prefers to refuse.",
    },
    tablaCambio: {
      es: "La tabla cambió mientras Velo la leía (su huella no es la misma entre una pasada y otra). No se escribió nada.",
      en: "The table changed while Velo was reading it (its fingerprint differs between passes). Nothing was written.",
    },
    columnaReservada: {
      es: "La tabla tiene una columna llamada {columna}, que Velo usa para numerar las filas de las tablas que escribe. Renómbrala y vuelve a intentar.",
      en: "The table has a column named {columna}, which Velo uses to number the rows of the tables it writes. Rename it and try again.",
    },
    base: {
      es: "La base respondió con un error ({codigo}). No se escribió nada.",
      en: "The database answered with an error ({codigo}). Nothing was written.",
    },
  },
} satisfies Catalogo;
