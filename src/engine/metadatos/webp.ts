// WebP — leer lo que una imagen dice de sí misma y escribir una copia que ya no lo diga.
//
// Un WebP es un contenedor RIFF: `RIFF`, tamaño (4, little endian), `WEBP`, y chunks con un código
// de cuatro caracteres (FourCC), su tamaño (little endian), los datos y un byte de relleno si el
// tamaño es impar. El formato simple trae un solo `VP8 ` (con pérdida) o `VP8L` (sin pérdida); el
// extendido empieza con `VP8X`, cuyas banderas dicen qué más hay (perfil ICC, alfa, EXIF, XMP,
// animación), y puede llevar `EXIF` y `XMP ` al final.
//
// Fuente: RFC 9649 («WebP Image Format», 2024), §2.5–2.7.
//
// La limpieza es por LISTA BLANCA: se conservan `VP8X`, `ICCP`, `ANIM`, `ANMF`, `ALPH`, `VP8 ` y
// `VP8L`, byte por byte y en su orden; todo lo demás se va, un chunk que Velo no conoce también. Las
// banderas del `VP8X` se reescriben (EXIF y XMP apagadas; EXIF encendida solo si se conserva la
// orientación), y el tamaño del RIFF se recalcula. Lo que va después del final del RIFF se va con
// nombre propio.
//
// La orientación se conserva solo en el formato EXTENDIDO: el simple no admite un chunk `EXIF`
// (RFC 9649, §2.7), así que ahí una orientación nunca fue válida y no hay nada que conservar.

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
  nombreTecnico,
  textoUtf8Laxo,
  u32le,
} from "./lector-binario";
import type { AnalisisDeMetadatos, ClaseDeElemento, Limpieza } from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");

/** Banderas del `VP8X` (RFC 9649, §2.7): EXIF y XMP. Las demás se dejan como estaban. */
const BANDERA_EXIF = 0x08;
const BANDERA_XMP = 0x04;

/** El contenido de un `VP8X`: banderas (4) y ancho y alto del lienzo (3 + 3). */
const LARGO_DEL_VP8X = 10;

/** Lo que una limpieza puede añadir: el `EXIF` mínimo (34 bytes) y rellenos que faltaban. */
const MARGEN_DE_SALIDA = 64;

const DE_LA_IMAGEN = new Set(["VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);
const PRIMEROS = new Set(["VP8 ", "VP8L", "VP8X"]);
const CON_IMAGEN = new Set(["VP8 ", "VP8L", "ANMF"]);

interface Chunk {
  /** El FourCC tal cual (con el espacio de `VP8 ` y `XMP `). */
  readonly codigo: string;
  readonly desde: number;
  readonly datos: number;
  readonly finDeDatos: number;
  /** El byte que sigue al chunk y a su relleno (si el relleno está; ver `recorrer`). */
  readonly hasta: number;
}

function codigoEn(bytes: Uint8Array, pos: number): string {
  return String.fromCharCode(
    bytes[pos],
    bytes[pos + 1],
    bytes[pos + 2],
    bytes[pos + 3],
  );
}

/**
 * Recorre los chunks del RIFF y llama a `visitar` con cada uno, en orden. Valida lo que un
 * decodificador exige (cabecera, un tamaño de RIFF que cabe en el archivo, chunks dentro del RIFF,
 * un primer chunk de imagen o `VP8X`, al menos una imagen) y lanza `imagen-ilegible` si no se
 * cumple. Devuelve dónde termina el RIFF. Si al ÚLTIMO chunk le falta el byte de relleno (hay
 * programas que no lo escriben), se tolera: la copia limpia lo escribe.
 */
function recorrer(bytes: Uint8Array, visitar: (c: Chunk) => void): number {
  if (!coincide(bytes, RIFF) || !coincide(bytes, WEBP, 8)) fallar();
  const tamano = u32le(bytes, 4);
  const fin = 8 + tamano;
  if (tamano < 4 || fin > bytes.length) fallar();
  let pos = 12;
  let hayImagen = false;
  for (let primero = true; pos < fin; primero = false) {
    if (pos + 8 > fin) fallar();
    const codigo = codigoEn(bytes, pos);
    const largo = u32le(bytes, pos + 4);
    const datos = pos + 8;
    const finDeDatos = datos + largo;
    if (finDeDatos > fin) fallar();
    if (primero && !PRIMEROS.has(codigo)) fallar();
    if (codigo === "VP8X" && largo < LARGO_DEL_VP8X) fallar();
    if (CON_IMAGEN.has(codigo)) hayImagen = true;
    const hasta = Math.min(fin, finDeDatos + (largo % 2));
    visitar({ codigo, desde: pos, datos, finDeDatos, hasta });
    pos = hasta;
  }
  if (!hayImagen) fallar();
  return fin;
}

// ── Qué se hace con cada chunk ──────────────────────────────────────────────────────────────────

type Destino =
  | { readonly accion: "imagen" | "vp8x" }
  | {
      readonly accion: "conservar" | "quitar";
      readonly clase: ClaseDeElemento;
    }
  /** El `EXIF` mínimo que escribe Velo: se reconoce, se quita y se vuelve a escribir en su lugar. */
  | { readonly accion: "orientacion"; readonly orientacion: number };

function destinoDe(bytes: Uint8Array, c: Chunk): Destino {
  if (DE_LA_IMAGEN.has(c.codigo)) return { accion: "imagen" };
  switch (c.codigo) {
    case "VP8X":
      return { accion: "vp8x" };
    case "ICCP":
      return { accion: "conservar", clase: "perfil-de-color" };
    case "EXIF": {
      const orientacion = orientacionDelExifMinimo(
        bytes.subarray(c.datos, c.finDeDatos),
      );
      return orientacion !== null
        ? { accion: "orientacion", orientacion }
        : { accion: "quitar", clase: "exif" };
    }
    case "XMP ":
      return { accion: "quitar", clase: "xmp" };
  }
  return { accion: "quitar", clase: "auxiliar" };
}

function marcadorDe(bytes: Uint8Array, c: Chunk): string {
  return nombreTecnico(bytes.subarray(c.desde, c.desde + 4));
}

// ── Primera pasada: el inventario ───────────────────────────────────────────────────────────────

interface Lectura {
  readonly analisis: AnalisisDeMetadatos;
  readonly orientacion: number | null;
}

function leer(bytes: Uint8Array): Lectura {
  const inventario = new Inventario();
  let orientacion: number | null = null;
  let extendido = false;

  const fin = recorrer(bytes, (c) => {
    const destino = destinoDe(bytes, c);
    const tamano = c.hasta - c.desde;
    switch (destino.accion) {
      case "imagen":
        return;
      case "vp8x":
        extendido = true;
        return;
      case "orientacion":
        orientacion ??= destino.orientacion;
        return;
      case "conservar":
        inventario.conservar(destino.clase, marcadorDe(bytes, c), tamano);
        return;
    }
    inventario.quitar(destino.clase, marcadorDe(bytes, c), tamano);
    const d = bytes.subarray(c.datos, c.finDeDatos);
    if (c.codigo === "EXIF") {
      const suya = anotarExif(inventario, sinPrefijoExif(d));
      orientacion ??= suya;
    } else if (c.codigo === "XMP ")
      inventario.agregarLectura(
        leerXmp(textoUtf8Laxo(d, LARGO_MAXIMO_DE_XMP), "xmp"),
      );
  });

  if (fin < bytes.length)
    inventario.quitar("bytes-sobrantes", "RIFF", bytes.length - fin);
  const conservada =
    extendido && orientacionQueSeConserva(orientacion) ? orientacion : null;
  if (conservada !== null) {
    inventario.conservar("orientacion", "EXIF", 8 + LARGO_DEL_EXIF_MINIMO);
    inventario.avisar("orientacion-conservada");
  }
  return { analisis: inventario.cerrar("webp"), orientacion: conservada };
}

export function analizarWebp(bytes: Uint8Array): AnalisisDeMetadatos {
  return leer(bytes).analisis;
}

// ── Segunda pasada: la copia limpia ─────────────────────────────────────────────────────────────

export function limpiarWebp(bytes: Uint8Array): Limpieza {
  const { analisis, orientacion } = leer(bytes);
  const salida = new Escritor(bytes.length + MARGEN_DE_SALIDA);
  salida.escribir(RIFF);
  salida.u32le(0); // el tamaño se escribe al final, cuando se sabe
  salida.escribir(WEBP);

  recorrer(bytes, (c) => {
    const destino = destinoDe(bytes, c);
    if (destino.accion === "quitar" || destino.accion === "orientacion") return;
    if (destino.accion === "vp8x") {
      salida.copiar(bytes, c.desde, c.datos);
      const banderas = bytes[c.datos] & ~(BANDERA_EXIF | BANDERA_XMP);
      salida.u8(orientacion === null ? banderas : banderas | BANDERA_EXIF);
      salida.copiar(bytes, c.datos + 1, c.finDeDatos);
    } else salida.copiar(bytes, c.desde, c.finDeDatos);
    // El relleno se escribe siempre como 0, haya estado o no, y valga lo que valiera.
    if ((c.finDeDatos - c.datos) % 2 === 1) salida.u8(0);
  });

  if (orientacion !== null) {
    salida.escribir(ascii("EXIF"));
    salida.u32le(LARGO_DEL_EXIF_MINIMO);
    salida.escribir(exifMinimo(orientacion));
  }
  salida.fijarU32le(4, salida.largo - 8);

  return {
    bytes: salida.resultado(),
    quitados: analisis.quitables,
    conservados: analisis.conservables,
    idNuevo: null,
  };
}
