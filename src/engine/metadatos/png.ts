// PNG — leer lo que una imagen dice de sí misma y escribir una copia que ya no lo diga.
//
// Un PNG es una firma de 8 bytes y una fila de chunks: largo (4, big endian), tipo (4 letras),
// datos y CRC-32. La primera letra del tipo dice si el chunk es CRÍTICO (mayúscula: sin él no se
// puede decodificar) o AUXILIAR (minúscula). Los metadatos viven en auxiliares: `tEXt`, `iTXt`,
// `zTXt` (texto libre: autor, programa, comentario, y el XMP), `eXIf` (EXIF), `tIME` (la última
// modificación), `caBX` (un manifiesto C2PA).
//
// Fuente: W3C PNG Specification (Third Edition, 2025) — §5 estructura, §11 chunks; ISO/IEC 15948.
//
// La limpieza es por LISTA BLANCA: se copian, byte por byte y en su orden, los chunks críticos y los
// auxiliares que cambian cómo SE VE la imagen (transparencia, gamma, cromaticidad, perfil de color,
// tamaño de píxel, animación APNG, HDR); todo lo demás se va. Un chunk crítico que Velo no conoce se
// CONSERVA (sin él la imagen no se decodifica) y se declara. Lo que va después del IEND se va con
// nombre propio: es la clase de fallo de «aCropalypse», donde un recorte guardado encima del
// original dejaba la cola del original en el archivo.
//
// La orientación del `eXIf` se conserva igual que en JPEG: un `eXIf` mínimo antes del primer IDAT
// (donde la norma lo exige), con su CRC calculado.

import {
  anotarExif,
  exifMinimo,
  LARGO_DEL_EXIF_MINIMO,
  orientacionDelExifMinimo,
  orientacionQueSeConserva,
  sinPrefijoExif,
} from "./exif";
import { Inventario } from "./inventario";
import {
  ascii,
  coincide,
  Escritor,
  fallar,
  textoLatin1,
  textoUtf8Laxo,
  textoUtf8OLatin1,
  u32be,
} from "./lector-binario";
import type {
  AnalisisDeMetadatos,
  ClaseDeElemento,
  Limpieza,
  Revela,
} from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** El largo de un chunk no puede pasar de 2^31 − 1 (§5.3). */
const LARGO_MAXIMO_DE_CHUNK = 0x7fffffff;

/** Lo que una limpieza puede añadir: el `eXIf` mínimo (38 bytes), con margen. */
const MARGEN_DE_SALIDA = 64;

/** Las palabras clave de PNG ocupan de 1 a 79 bytes (§11.3.3.2). */
const LARGO_MAXIMO_DE_PALABRA = 79;

const PALABRA_XMP = ascii("XML:com.adobe.xmp\0");

/** Auxiliares que hacen falta para VER la imagen como es. Se copian sin listarse. */
const DE_LA_IMAGEN = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "sBIT",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
  "cICP",
  "mDCV",
  "cLLI",
]);

interface Chunk {
  readonly tipo: string;
  /** El primer byte del largo. */
  readonly desde: number;
  readonly datos: number;
  readonly finDeDatos: number;
  /** El byte que sigue al CRC. */
  readonly hasta: number;
}

function esLetra(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/**
 * Recorre los chunks y llama a `visitar` con cada uno, en orden. Valida lo que un decodificador
 * exige (firma, IHDR primero y solo primero, tipos de cuatro letras, largos dentro del archivo, al
 * menos un IDAT, IEND) y lanza `imagen-ilegible` si no se cumple. Devuelve dónde termina el IEND.
 * El CRC no se comprueba: los chunks que se conservan se copian con el suyo, tal cual.
 */
function recorrer(bytes: Uint8Array, visitar: (c: Chunk) => void): number {
  if (!coincide(bytes, FIRMA)) fallar();
  let pos = FIRMA.length;
  let hayIdat = false;
  for (let primero = true; ; primero = false) {
    const largo = u32be(bytes, pos);
    const datos = pos + 8;
    const finDeDatos = datos + largo;
    const hasta = finDeDatos + 4;
    if (largo > LARGO_MAXIMO_DE_CHUNK || hasta > bytes.length) fallar();
    for (let i = 4; i < 8; i++) if (!esLetra(bytes[pos + i])) fallar();
    const tipo = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );
    if (primero !== (tipo === "IHDR")) fallar();
    if (tipo === "IDAT") hayIdat = true;
    visitar({ tipo, desde: pos, datos, finDeDatos, hasta });
    if (tipo === "IEND") {
      if (!hayIdat) fallar();
      return hasta;
    }
    pos = hasta;
  }
}

// ── Qué se hace con cada chunk ──────────────────────────────────────────────────────────────────

type Destino =
  | { readonly accion: "imagen" }
  | {
      readonly accion: "conservar" | "quitar";
      readonly clase: ClaseDeElemento;
    }
  /** El `eXIf` mínimo que escribe Velo: se reconoce, se quita y se vuelve a escribir en su lugar. */
  | { readonly accion: "orientacion"; readonly orientacion: number };

/** Crítico = la primera letra en mayúscula (el bit 5 del primer byte en 0, §5.4). */
function esCritico(tipo: string): boolean {
  return (tipo.charCodeAt(0) & 0x20) === 0;
}

function destinoDe(bytes: Uint8Array, c: Chunk): Destino {
  if (DE_LA_IMAGEN.has(c.tipo)) return { accion: "imagen" };
  const d = bytes.subarray(c.datos, c.finDeDatos);
  switch (c.tipo) {
    case "iCCP":
      return { accion: "conservar", clase: "perfil-de-color" };
    case "eXIf": {
      const orientacion = orientacionDelExifMinimo(d);
      return orientacion !== null
        ? { accion: "orientacion", orientacion }
        : { accion: "quitar", clase: "exif" };
    }
    case "tEXt":
    case "zTXt":
      return { accion: "quitar", clase: "texto" };
    case "iTXt":
      return {
        accion: "quitar",
        clase: coincide(d, PALABRA_XMP) ? "xmp" : "texto",
      };
    case "tIME":
      return { accion: "quitar", clase: "fecha-de-cambio" };
    case "caBX":
      return { accion: "quitar", clase: "procedencia" };
  }
  return esCritico(c.tipo)
    ? { accion: "conservar", clase: "auxiliar" }
    : { accion: "quitar", clase: "auxiliar" };
}

// ── Primera pasada: el inventario ───────────────────────────────────────────────────────────────

/** Lo que revela una palabra clave de texto, cuando es obvio (§11.3.3.2 y las que escribe ImageMagick). */
function revelaDePalabra(palabra: string): Revela {
  const p = palabra.toLowerCase();
  if (p === "author" || p === "copyright" || p === "artist") return "autoria";
  if (p === "software") return "software";
  if (p === "source") return "dispositivo";
  if (p === "description" || p === "comment" || p === "title")
    return "descripcion";
  if (/date|time/.test(p)) return "fecha";
  return "otro";
}

/** La palabra clave: los bytes antes del primer `\0`, o `null` si no hay un `\0` donde debe. */
function palabraClave(d: Uint8Array): { palabra: string; fin: number } | null {
  const fin = d.subarray(0, LARGO_MAXIMO_DE_PALABRA + 1).indexOf(0);
  if (fin < 1) return null;
  return { palabra: textoLatin1(d.subarray(0, fin)).texto, fin };
}

function leerTexto(inventario: Inventario, d: Uint8Array): void {
  const clave = palabraClave(d);
  if (!clave) return;
  // tEXt es Latin-1 por norma (§11.3.3.2).
  const texto = textoLatin1(d.subarray(clave.fin + 1));
  inventario.campo(
    clave.palabra,
    "png-texto",
    revelaDePalabra(clave.palabra),
    texto.texto,
    texto.cortado,
  );
}

/**
 * iTXt: palabra `\0` compresión método idioma `\0` palabra traducida `\0` texto UTF-8 (§11.3.3.4).
 * Comprimido no se lee (Velo no lleva un descompresor para nombrar algo que va a quitar igual): se
 * avisa `texto-comprimido`.
 */
function leerTextoInternacional(inventario: Inventario, d: Uint8Array): void {
  const clave = palabraClave(d);
  if (!clave) return;
  const comprimido = d[clave.fin + 1];
  const idioma = d.indexOf(0, clave.fin + 3);
  const traducida = idioma < 0 ? -1 : d.indexOf(0, idioma + 1);
  if (comprimido === undefined || traducida < 0) return;
  if (comprimido !== 0) {
    inventario.contarAviso("texto-comprimido");
    return;
  }
  const cuerpo = d.subarray(traducida + 1);
  if (coincide(d, PALABRA_XMP)) {
    inventario.agregarLectura(
      leerXmp(textoUtf8Laxo(cuerpo, LARGO_MAXIMO_DE_XMP), "xmp"),
    );
    return;
  }
  const texto = textoUtf8OLatin1(cuerpo);
  inventario.campo(
    clave.palabra,
    "png-texto",
    revelaDePalabra(clave.palabra),
    texto.texto,
    texto.cortado,
  );
}

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

/** tIME: año (2), mes, día, hora, minuto, segundo — la última vez que alguien guardó la imagen. */
function leerFecha(inventario: Inventario, d: Uint8Array): void {
  if (d.length !== 7) return;
  const anio = (d[0] << 8) | d[1];
  inventario.campo(
    "tIME",
    "png-texto",
    "fecha",
    `${String(anio).padStart(4, "0")}-${dos(d[2])}-${dos(d[3])} ${dos(d[4])}:${dos(d[5])}:${dos(d[6])}`,
  );
}

interface Lectura {
  readonly analisis: AnalisisDeMetadatos;
  readonly orientacion: number | null;
}

function leer(bytes: Uint8Array): Lectura {
  const inventario = new Inventario();
  let orientacion: number | null = null;

  const fin = recorrer(bytes, (c) => {
    const destino = destinoDe(bytes, c);
    if (destino.accion === "imagen") return;
    if (destino.accion === "orientacion") {
      orientacion ??= destino.orientacion;
      return;
    }
    const tamano = c.hasta - c.desde;
    if (destino.accion === "conservar") {
      inventario.conservar(destino.clase, c.tipo, tamano);
      return;
    }
    inventario.quitar(destino.clase, c.tipo, tamano);
    const d = bytes.subarray(c.datos, c.finDeDatos);
    switch (c.tipo) {
      case "eXIf": {
        const suya = anotarExif(inventario, sinPrefijoExif(d));
        orientacion ??= suya;
        return;
      }
      case "tEXt":
        leerTexto(inventario, d);
        return;
      case "zTXt":
        inventario.contarAviso("texto-comprimido");
        return;
      case "iTXt":
        leerTextoInternacional(inventario, d);
        return;
      case "tIME":
        leerFecha(inventario, d);
        return;
    }
  });

  if (fin < bytes.length)
    inventario.quitar("bytes-sobrantes", "IEND", bytes.length - fin);
  const conservada = orientacionQueSeConserva(orientacion) ? orientacion : null;
  if (conservada !== null) {
    inventario.conservar("orientacion", "eXIf", 12 + LARGO_DEL_EXIF_MINIMO);
    inventario.avisar("orientacion-conservada");
  }
  return { analisis: inventario.cerrar("png"), orientacion: conservada };
}

export function analizarPng(bytes: Uint8Array): AnalisisDeMetadatos {
  return leer(bytes).analisis;
}

// ── Segunda pasada: la copia limpia ─────────────────────────────────────────────────────────────

let TABLA_CRC: Uint32Array | null = null;

function tablaCrc(): Uint32Array {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
}

/** CRC-32 de ISO 3309 / ITU-T V.42, el de PNG (§5.5), sobre el tipo y los datos. */
export function crc32(bytes: Uint8Array): number {
  TABLA_CRC ??= tablaCrc();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Un chunk `eXIf` con el TIFF mínimo de la orientación y su CRC. */
function chunkDeOrientacion(orientacion: number): Uint8Array {
  const tipoYDatos = new Escritor(4 + LARGO_DEL_EXIF_MINIMO);
  tipoYDatos.escribir(ascii("eXIf"));
  tipoYDatos.escribir(exifMinimo(orientacion));
  const cuerpo = tipoYDatos.resultado();
  const chunk = new Escritor(12 + LARGO_DEL_EXIF_MINIMO);
  chunk.u32be(LARGO_DEL_EXIF_MINIMO);
  chunk.escribir(cuerpo);
  chunk.u32be(crc32(cuerpo));
  return chunk.resultado();
}

export function limpiarPng(bytes: Uint8Array): Limpieza {
  const { analisis, orientacion } = leer(bytes);
  let minimo = orientacion === null ? null : chunkDeOrientacion(orientacion);
  const salida = new Escritor(bytes.length + MARGEN_DE_SALIDA);
  salida.escribir(new Uint8Array(FIRMA));

  recorrer(bytes, (c) => {
    const destino = destinoDe(bytes, c);
    if (destino.accion === "quitar" || destino.accion === "orientacion") return;
    if (minimo && c.tipo === "IDAT") {
      salida.escribir(minimo);
      minimo = null;
    }
    salida.copiar(bytes, c.desde, c.hasta);
  });

  return {
    bytes: salida.resultado(),
    quitados: analisis.quitables,
    conservados: analisis.conservables,
    idNuevo: null,
  };
}
