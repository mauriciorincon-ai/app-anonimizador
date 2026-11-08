// JPEG — leer lo que una foto dice de sí misma y escribir una copia que ya no lo diga.
//
// Un JPEG es una fila de segmentos: `FF D8` (SOI), luego marcadores `FF xx` con su largo, el
// escaneo (SOS) seguido de los datos comprimidos, y `FF D9` (EOI). Los metadatos viven en los
// segmentos de aplicación (APPn) y en el comentario (COM); la imagen, en las tablas (DQT, DHT), el
// encabezado de cuadro (SOFn) y los escaneos.
//
// Fuente: ITU-T T.81 (ISO/IEC 10918-1), anexo B, para la sintaxis de marcadores; JFIF 1.02 para el
// APP0; CIPA DC-008 para el APP1 Exif; Adobe XMP Specification Part 3 para el APP1 XMP y el XMP
// extendido; ICC.1 (anexo B.4) para el APP2 del perfil de color; CIPA DC-007 para el APP2 MPF.
//
// La limpieza es por LISTA BLANCA: se copian, byte por byte y en su orden, los segmentos que hacen
// falta para decodificar y mostrar la imagen (SOFn, DHT, DQT, DRI, DAC, DNL, los escaneos con sus
// datos), el JFIF sin su miniatura, el perfil de color (ICC) y el APP14 de Adobe (dice cómo
// convertir los colores de un CMYK). Todo lo demás se va, se entienda o no: un APPn que Velo no
// conoce también. Lo que va después del EOI (otra imagen pegada, la cola de un recorte mal hecho) se
// va con nombre propio. Los datos comprimidos NO se tocan: no hay recompresión ni pérdida.
//
// La orientación es la excepción declarada: si el EXIF decía «girar 90°», quitarla haría que la foto
// se viera de lado. Se escribe un EXIF MÍNIMO (solo esa etiqueta, `exif.ts`) justo después del SOI
// (y del JFIF, que la norma quiere primero), y la pantalla lo dice (`orientacion-conservada`).

import {
  anotarExif,
  exifMinimo,
  LARGO_DEL_EXIF_MINIMO,
  orientacionDelExifMinimo,
  orientacionQueSeConserva,
} from "./exif";
import { CABECERA_PHOTOSHOP, leerIrb } from "./iptc";
import { Inventario } from "./inventario";
import {
  ascii,
  coincide,
  Escritor,
  fallar,
  textoUtf8Laxo,
  textoUtf8OLatin1,
  u16be,
  u32be,
  u8,
} from "./lector-binario";
import type { AnalisisDeMetadatos, ClaseDeElemento, Limpieza } from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;

const JFIF = ascii("JFIF\0");
const JFXX = ascii("JFXX\0");
/** El sexto byte debería ser `\0`; hay cámaras que escriben `\xFF`. Se acepta cualquiera. */
const EXIF = ascii("Exif\0");
const EXIF_CANONICO = ascii("Exif\0\0");
const XMP = ascii("http://ns.adobe.com/xap/1.0/\0");
const XMP_EXTENDIDO = ascii("http://ns.adobe.com/xmp/extension/\0");
const ICC = ascii("ICC_PROFILE\0");
const MPF = ascii("MPF\0");
const ADOBE = ascii("Adobe");
/** APP11 con cajas JUMBF (ISO/IEC 19566-5): ahí viaja un manifiesto C2PA de procedencia. */
const JUMBF = ascii("JP");

/** Bytes del contenido de un JFIF sin miniatura: identificador, versión, unidades, densidades, 0×0. */
const JFIF_SIN_MINIATURA = 14;

/** Lo que una limpieza puede añadir: el APP1 de la orientación (36 bytes), con margen. */
const MARGEN_DE_SALIDA = 64;

/** Un segmento tal como aparece en el archivo. */
interface Segmento {
  readonly marcador: number;
  /** El `FF` del marcador (el relleno de `FF` que lo precede queda fuera). */
  readonly desde: number;
  /** El byte que sigue al segmento; en un SOS, el que sigue a los datos comprimidos. */
  readonly hasta: number;
  /** Dónde empieza el contenido (después del largo); en un marcador sin largo, igual a `hasta`. */
  readonly datos: number;
  /** Dónde termina el contenido que declara el largo (en un SOS, antes de los datos comprimidos). */
  readonly finDeDatos: number;
}

function esSof(m: number): boolean {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

/** Lo que hace falta para decodificar: tablas, cuadro, escaneos, reinicios. Se copia tal cual. */
function esDeLaImagen(m: number): boolean {
  return (
    esSof(m) ||
    m === 0xc4 || // DHT
    m === 0xcc || // DAC
    m === 0xdb || // DQT
    m === 0xdc || // DNL
    m === 0xdd || // DRI
    m === SOS ||
    m === 0xde || // DHP (modo jerárquico)
    m === 0xdf || // EXP
    m === 0x01 || // TEM
    (m >= 0xd0 && m <= 0xd7) || // RSTn
    m === EOI
  );
}

/**
 * Dónde terminan los datos comprimidos de un escaneo: en el primer `FF` que no sea un `FF 00`
 * (relleno de un `FF` de datos) ni un reinicio `FF D0`–`FF D7`. Si el archivo se acaba antes, no
 * hay EOI: el archivo está cortado.
 */
function finDeLaEntropia(bytes: Uint8Array, desde: number): number {
  let i = desde;
  for (;;) {
    const ff = bytes.indexOf(0xff, i);
    if (ff < 0 || ff + 1 >= bytes.length) return fallar();
    const siguiente = bytes[ff + 1];
    if (siguiente === 0x00 || (siguiente >= 0xd0 && siguiente <= 0xd7)) {
      i = ff + 2;
      continue;
    }
    return ff;
  }
}

/**
 * Entre dos segmentos pueden colarse bytes que no son un marcador (un editor que escribió de más,
 * un relleno): libjpeg los salta hasta el siguiente `FF` que empieza un marcador, y un `FF 00` no
 * lo es. Aquí se hace lo mismo, y `recorrer` cuenta cuántos se saltaron para declararlos; la copia
 * limpia no los lleva, porque solo copia segmentos.
 */
function proximoMarcador(bytes: Uint8Array, desde: number): number {
  let i = desde;
  for (;;) {
    const ff = bytes.indexOf(0xff, i);
    if (ff < 0) return fallar();
    let siguiente = ff + 1;
    while (siguiente < bytes.length && bytes[siguiente] === 0xff) siguiente++;
    if (siguiente >= bytes.length) return fallar();
    if (bytes[siguiente] === 0x00) {
      i = siguiente + 1;
      continue;
    }
    return ff;
  }
}

/**
 * Recorre la estructura y llama a `visitar` con cada segmento, en orden. Valida lo que un
 * decodificador exige (SOI al principio, largos dentro del archivo, un cuadro antes del primer
 * escaneo, un escaneo antes del EOI) y lanza `imagen-ilegible` si no se cumple. Devuelve dónde
 * termina el EOI. Lineal y sin memoria propia: cada pasada vuelve a recorrer el archivo.
 * `alSaltar` recibe cuántos bytes sueltos se saltaron entre segmentos, cada vez que hubo.
 */
function recorrer(
  bytes: Uint8Array,
  visitar: (s: Segmento) => void,
  alSaltar?: (cuantos: number) => void,
): number {
  if (!(bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === SOI)) fallar();
  let pos = 2;
  let hayCuadro = false;
  let hayEscaneo = false;
  for (;;) {
    const marcadorAdelante = proximoMarcador(bytes, pos);
    if (marcadorAdelante > pos) alSaltar?.(marcadorAdelante - pos);
    pos = marcadorAdelante;
    // Relleno: la norma deja poner cualquier cantidad de `FF` antes de un marcador.
    while (u8(bytes, pos + 1) === 0xff) pos++;
    const desde = pos;
    const marcador = bytes[pos + 1];
    pos += 2;
    if (marcador === EOI) {
      if (!hayEscaneo) fallar();
      visitar({ marcador, desde, hasta: pos, datos: pos, finDeDatos: pos });
      return pos;
    }
    if (marcador === 0x00 || marcador === SOI) fallar();
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      visitar({ marcador, desde, hasta: pos, datos: pos, finDeDatos: pos });
      continue;
    }
    const largo = u16be(bytes, pos);
    const finDeDatos = pos + largo;
    if (largo < 2 || finDeDatos > bytes.length) fallar();
    let hasta = finDeDatos;
    if (esSof(marcador)) hayCuadro = true;
    if (marcador === SOS) {
      if (!hayCuadro) fallar();
      hayEscaneo = true;
      hasta = finDeLaEntropia(bytes, finDeDatos);
    }
    visitar({ marcador, desde, hasta, datos: pos + 2, finDeDatos });
    pos = hasta;
  }
}

// ── Qué se hace con cada segmento ───────────────────────────────────────────────────────────────

type Destino =
  /** Parte de la imagen: se copia sin listarse. */
  | { readonly accion: "imagen" }
  /** Se conserva y la pantalla lo declara. */
  | {
      readonly accion: "conservar";
      readonly clase: ClaseDeElemento;
      readonly marcador: string;
    }
  | {
      readonly accion: "quitar";
      readonly clase: ClaseDeElemento;
      readonly marcador: string;
    }
  /** El JFIF: se conserva, reescrito sin miniatura si la traía. */
  | { readonly accion: "jfif" }
  /** El EXIF mínimo que escribe Velo: se reconoce, se quita y se vuelve a escribir en su lugar. */
  | { readonly accion: "orientacion"; readonly orientacion: number };

const IMAGEN: Destino = { accion: "imagen" };

function quitar(clase: ClaseDeElemento, marcador: string): Destino {
  return { accion: "quitar", clase, marcador };
}

function conservar(clase: ClaseDeElemento, marcador: string): Destino {
  return { accion: "conservar", clase, marcador };
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

function destinoDe(bytes: Uint8Array, s: Segmento): Destino {
  const m = s.marcador;
  if (esDeLaImagen(m)) return IMAGEN;
  const d = bytes.subarray(s.datos, s.finDeDatos);
  if (m === COM) return quitar("comentario", "COM");
  if (m < 0xe0 || m > 0xef) {
    // Un marcador que T.81 reserva (JPGn, RES) o una extensión (JPEG-LS): un decodificador que lo
    // entienda lo necesita, y nadie guarda metadatos ahí. Se conserva y se declara.
    return conservar("auxiliar", `FF${hex(m)}`);
  }
  const app = `APP${m - 0xe0}`;
  switch (m) {
    case 0xe0:
      if (coincide(d, JFIF))
        return d.length >= JFIF_SIN_MINIATURA
          ? { accion: "jfif" }
          : quitar("aplicacion", app);
      if (coincide(d, JFXX)) return quitar("miniatura", app);
      break;
    case 0xe1:
      if (coincide(d, EXIF)) {
        const orientacion = coincide(d, EXIF_CANONICO)
          ? orientacionDelExifMinimo(d.subarray(EXIF_CANONICO.length))
          : null;
        return orientacion !== null
          ? { accion: "orientacion", orientacion }
          : quitar("exif", app);
      }
      if (coincide(d, XMP)) return quitar("xmp", app);
      if (coincide(d, XMP_EXTENDIDO)) return quitar("xmp-extendido", app);
      break;
    case 0xe2:
      if (coincide(d, ICC)) return conservar("perfil-de-color", app);
      if (coincide(d, MPF)) return quitar("imagenes-adicionales", app);
      break;
    case 0xeb:
      if (coincide(d, JUMBF)) return quitar("procedencia", app);
      break;
    case 0xed:
      return quitar("iptc", app);
    case 0xee:
      if (coincide(d, ADOBE)) return conservar("adobe", app);
      break;
  }
  return quitar("aplicacion", app);
}

// ── Primera pasada: el inventario ───────────────────────────────────────────────────────────────

interface Lectura {
  readonly analisis: AnalisisDeMetadatos;
  /** La orientación que se conserva (2–8), o `null`. */
  readonly orientacion: number | null;
  /** El primer segmento que se conserva es el JFIF: la orientación va DESPUÉS de él. */
  readonly primeroEsJfif: boolean;
}

/** Un trozo de XMP extendido: los paquetes grandes se parten en APP1 con su desplazamiento. */
interface TrozoDeXmp {
  readonly desplazamiento: number;
  readonly datos: Uint8Array;
}

/** GUID (32) + largo total (4) + desplazamiento (4). */
const CABECERA_DEL_TROZO = 40;

function leerXmpExtendido(inventario: Inventario, trozos: TrozoDeXmp[]) {
  if (trozos.length === 0) return;
  // Se ordenan por desplazamiento (el orden de `sort` es estable: un empate queda como venía).
  trozos.sort((a, b) => a.desplazamiento - b.desplazamiento);
  let largo = 0;
  for (const t of trozos) largo += t.datos.length;
  const paquete = new Uint8Array(largo);
  let pos = 0;
  for (const t of trozos) {
    paquete.set(t.datos, pos);
    pos += t.datos.length;
  }
  inventario.agregarLectura(
    leerXmp(textoUtf8Laxo(paquete, LARGO_MAXIMO_DE_XMP), "xmp"),
  );
}

function leer(bytes: Uint8Array): Lectura {
  const inventario = new Inventario();
  let orientacion: number | null = null;
  let primeroEsJfif: boolean | null = null;
  const trozos: TrozoDeXmp[] = [];
  let bytesDeXmpExtendido = 0;

  const visitar = (s: Segmento): void => {
    const destino = destinoDe(bytes, s);
    const d = bytes.subarray(s.datos, s.finDeDatos);
    const tamano = s.hasta - s.desde;
    // Lo que se copia a la salida es lo que no se quita (el EXIF mínimo se reescribe aparte).
    const seCopia =
      destino.accion !== "quitar" && destino.accion !== "orientacion";
    if (primeroEsJfif === null && seCopia)
      primeroEsJfif = destino.accion === "jfif";

    switch (destino.accion) {
      case "imagen":
        return;
      case "orientacion":
        orientacion ??= destino.orientacion;
        return;
      case "conservar":
        inventario.conservar(destino.clase, destino.marcador, tamano);
        return;
      case "jfif": {
        inventario.conservar("jfif", "APP0", 4 + JFIF_SIN_MINIATURA);
        const sobra = d.length - JFIF_SIN_MINIATURA;
        if (sobra > 0)
          inventario.quitar(
            d[12] * d[13] > 0 ? "miniatura" : "aplicacion",
            "APP0",
            sobra,
          );
        return;
      }
    }

    inventario.quitar(destino.clase, destino.marcador, tamano);
    switch (destino.clase) {
      case "exif": {
        // Primero se anota (todo bloque nombra lo suyo); la orientación es la del primero que la trae.
        const suya = anotarExif(inventario, d.subarray(EXIF_CANONICO.length));
        orientacion ??= suya;
        return;
      }
      case "xmp": {
        const paquete = d.subarray(XMP.length);
        // Sin ningún `<` no es XML, y uno más largo que el tope solo se leyó hasta ahí.
        if (paquete.length > LARGO_MAXIMO_DE_XMP || !paquete.includes(0x3c))
          inventario.avisar("iptc-xmp-ilegible");
        inventario.agregarLectura(
          leerXmp(textoUtf8Laxo(paquete, LARGO_MAXIMO_DE_XMP), "xmp"),
        );
        return;
      }
      case "xmp-extendido": {
        const desde = XMP_EXTENDIDO.length + CABECERA_DEL_TROZO;
        if (d.length <= desde || bytesDeXmpExtendido >= LARGO_MAXIMO_DE_XMP)
          return;
        const datos = d.subarray(desde);
        bytesDeXmpExtendido += datos.length;
        trozos.push({
          desplazamiento: u32be(d, desde - 4),
          datos,
        });
        return;
      }
      case "iptc":
        if (coincide(d, CABECERA_PHOTOSHOP)) {
          const irb = leerIrb(d.subarray(CABECERA_PHOTOSHOP.length));
          if (irb.incompleto) inventario.avisar("iptc-xmp-ilegible");
          inventario.agregarLectura(irb);
          inventario.contarOtras(irb.otrasEtiquetas);
          if (irb.miniatura > 0)
            inventario.quitar("miniatura", "8BIM", irb.miniatura);
        }
        return;
      case "imagenes-adicionales":
        inventario.contarAviso("imagenes-adicionales");
        return;
      case "comentario": {
        const texto = textoUtf8OLatin1(d);
        inventario.campo(
          "COM",
          "comentario",
          "descripcion",
          texto.texto,
          texto.cortado,
        );
        return;
      }
    }
  };
  let sueltos = 0;
  const fin = recorrer(bytes, visitar, (cuantos) => {
    sueltos += cuantos;
  });

  leerXmpExtendido(inventario, trozos);
  if (sueltos > 0) inventario.quitar("bytes-sobrantes", "FF", sueltos);
  if (fin < bytes.length)
    inventario.quitar("bytes-sobrantes", "EOI", bytes.length - fin);
  const conservada = orientacionQueSeConserva(orientacion) ? orientacion : null;
  if (conservada !== null) {
    inventario.conservar(
      "orientacion",
      "APP1",
      4 + EXIF_CANONICO.length + LARGO_DEL_EXIF_MINIMO,
    );
    inventario.avisar("orientacion-conservada");
  }
  return {
    analisis: inventario.cerrar("jpeg"),
    orientacion: conservada,
    primeroEsJfif: primeroEsJfif === true,
  };
}

export function analizarJpeg(bytes: Uint8Array): AnalisisDeMetadatos {
  return leer(bytes).analisis;
}

// ── Segunda pasada: la copia limpia ─────────────────────────────────────────────────────────────

/** `FF E1`, largo, `Exif\0\0` y el TIFF mínimo con la orientación. */
function segmentoDeOrientacion(orientacion: number): Uint8Array {
  const tiff = exifMinimo(orientacion);
  const salida = new Escritor(4 + EXIF_CANONICO.length + tiff.length);
  salida.u8(0xff);
  salida.u8(0xe1);
  salida.u16be(2 + EXIF_CANONICO.length + tiff.length);
  salida.escribir(EXIF_CANONICO);
  salida.escribir(tiff);
  return salida.resultado();
}

export function limpiarJpeg(bytes: Uint8Array): Limpieza {
  const { analisis, orientacion, primeroEsJfif } = leer(bytes);
  const minimo =
    orientacion === null ? null : segmentoDeOrientacion(orientacion);
  const salida = new Escritor(bytes.length + MARGEN_DE_SALIDA);
  salida.u8(0xff);
  salida.u8(SOI);
  if (minimo && !primeroEsJfif) salida.escribir(minimo);
  let escritos = 0;

  recorrer(bytes, (s) => {
    const destino = destinoDe(bytes, s);
    if (destino.accion === "quitar" || destino.accion === "orientacion") return;
    if (destino.accion === "jfif") {
      // El JFIF sin miniatura: identificador, versión, unidades y densidades, y 0×0.
      salida.u8(0xff);
      salida.u8(0xe0);
      salida.u16be(2 + JFIF_SIN_MINIATURA);
      salida.copiar(bytes, s.datos, s.datos + JFIF_SIN_MINIATURA - 2);
      salida.u8(0);
      salida.u8(0);
    } else salida.copiar(bytes, s.desde, s.hasta);
    if (escritos++ === 0 && minimo && primeroEsJfif) salida.escribir(minimo);
  });

  return {
    bytes: salida.resultado(),
    quitados: analisis.quitables,
    conservados: analisis.conservables,
    idNuevo: null,
  };
}
