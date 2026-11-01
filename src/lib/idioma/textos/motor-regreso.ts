// Mensajes del motor — lo que el motor dice al guardar y recuperar — rechazos de la bóveda y de la bitácora, y el regreso.
//
// Cada clave es una frase que el motor o el worker NOMBRAN sin escribir: devuelven
// `mensaje("area.clave", { datos })` y la interfaz, o el documento que se descarga, la convierte en
// texto en el idioma que corresponde. Claves planas con punto (`area.cosa`); los números viajan
// crudos en `datos` y se formatean al decirlos (`{n}` o `{n:2}`), jamás dentro del motor.
//
// El español de aquí es el que ya tenían los motores y las pruebas — se conserva palabra por palabra.
// El inglés se redacta al lado: no se traduce frase a frase si una construcción natural pide otra.
//
// Tres áreas:
//
//   · `boveda.*`   — por qué el contenido de un `.velo` descifrado no se acepta (`engine/boveda.ts`).
//   · `bitacora.*` — lo mismo para un `.velolog` (`engine/bitacora.ts`), y la lectura fallida.
//   · `cifrado.*`  — lo que el sobre cifrado (`lib/archivo-cifrado.ts`) dice ANTES de descifrar:
//                    cabecera, versión, costo, frase. Cada frase que nombra el tipo de archivo
//                    existe en dos claves (`.boveda` y `.bitacora`) para que cada idioma escoja el
//                    artículo y el sustantivo que le corresponden, en vez de pegar un nombre ya
//                    traducido dentro de una plantilla.
//
// `restaurar.*` no existe a propósito: el motor de restauración no escribe prosa. Sus salvedades son
// datos estructurados (`SalvedadDelRegreso`) y es la pantalla, o el informe, quien las compone.

import type { Texto } from "../index";

export const MOTOR_REGRESO = {
  // ── La bóveda (`engine/boveda.ts`) ─────────────────────────────────────────────────────────
  "boveda.jsonIlegible": {
    es: "El contenido de la bóveda no es un JSON que se pueda leer.",
    en: "The vault's contents are not JSON that can be read.",
  },
  "boveda.noContieneBoveda": {
    es: "El archivo no contiene una bóveda.",
    en: "The file does not contain a vault.",
  },
  "boveda.versionDistinta": {
    es: "La bóveda es de la versión {version} y esta Velo entiende la {entiende}.",
    en: "The vault is version {version}, and this version of Velo understands version {entiende}.",
  },
  "boveda.faltaCampo": {
    es: 'A la bóveda le falta "{campo}".',
    en: 'The vault is missing "{campo}".',
  },
  "boveda.sinColumnas": {
    es: "La bóveda no trae la lista de columnas.",
    en: "The vault does not include the list of columns.",
  },
  "boveda.columnaIncompleta": {
    es: "Una de las columnas de la bóveda está incompleta.",
    en: "One of the vault's columns is incomplete.",
  },
  "boveda.columnaDesalineada": {
    es: 'La columna "{columna}" trae {seudonimos} seudónimos y {originales} listas de originales.',
    en: 'Column "{columna}" has {seudonimos} pseudonyms and {originales} lists of originals.',
  },
  "boveda.lecturaFallida": {
    es: "No se pudo leer el archivo.",
    en: "The file could not be read.",
  },

  // ── La bitácora (`engine/bitacora.ts`) ─────────────────────────────────────────────────────
  "bitacora.jsonIlegible": {
    es: "El contenido de la bitácora no es un JSON que se pueda leer.",
    en: "The log's contents are not JSON that can be read.",
  },
  "bitacora.versionDistinta": {
    es: "La bitácora es de la versión {version} y esta Velo entiende la {entiende}.",
    en: "The log is version {version}, and this version of Velo understands version {entiende}.",
  },
  "bitacora.formaInvalida": {
    es: "El archivo no contiene una bitácora con la forma que Velo espera.",
    en: "The file does not contain a log in the shape Velo expects.",
  },
  "bitacora.lecturaFallida": {
    es: "No se pudo leer el archivo.",
    en: "The file could not be read.",
  },

  // ── El sobre cifrado (`lib/archivo-cifrado.ts`) ────────────────────────────────────────────
  "cifrado.demasiadoCorto.boveda": {
    es: "El archivo es demasiado corto para ser una bóveda de Velo.",
    en: "The file is too short to be a Velo vault.",
  },
  "cifrado.demasiadoCorto.bitacora": {
    es: "El archivo es demasiado corto para ser una bitácora de Velo.",
    en: "The file is too short to be a Velo log.",
  },
  "cifrado.noEs.boveda": {
    es: "El archivo no es una bóveda de Velo.",
    en: "The file is not a Velo vault.",
  },
  "cifrado.noEs.bitacora": {
    es: "El archivo no es una bitácora de Velo.",
    en: "The file is not a Velo log.",
  },
  "cifrado.versionDistinta": {
    es: "El archivo es de la versión {version} y esta Velo entiende la {entiende}.",
    en: "The file is version {version}, and this version of Velo understands version {entiende}.",
  },
  "cifrado.costoInaceptable": {
    es: "El archivo declara {iteraciones} iteraciones, fuera de lo que Velo acepta (1 a {tope}). Está dañado o alterado.",
    en: "The file declares {iteraciones} iterations, outside what Velo accepts (1 to {tope}). It is damaged or has been altered.",
  },
  "cifrado.fraseNoAbre.boveda": {
    es: "La frase no abre una bóveda de Velo. También sale este mensaje si el archivo se dañó o lo modificaron.",
    en: "The passphrase does not open a Velo vault. You also get this message if the file was damaged or has been modified.",
  },
  "cifrado.fraseNoAbre.bitacora": {
    es: "La frase no abre una bitácora de Velo. También sale este mensaje si el archivo se dañó o lo modificaron.",
    en: "The passphrase does not open a Velo log. You also get this message if the file was damaged or has been modified.",
  },
} as const satisfies Readonly<Record<string, Texto>>;
