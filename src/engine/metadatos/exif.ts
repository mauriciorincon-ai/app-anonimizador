// EXIF — lo que la cámara (o el teléfono) escribe dentro de la foto: marca, modelo y número de
// serie, fecha y hora, el programa que la tocó, el dueño de la cámara y, si el GPS estaba encendido,
// DÓNDE se tomó. Es una estructura TIFF (cabecera `II`/`MM` + directorios de etiquetas, los IFD)
// que va en el APP1 de un JPEG, en el chunk `eXIf` de un PNG y en el `EXIF` de un WebP.
//
// Fuentes: TIFF 6.0 (Adobe, 1992) para la estructura; CIPA DC-008-2023 (Exif 3.0) para las
// etiquetas de la lista cerrada, el IFD de GPS y el `UserComment` con su prefijo de juego de
// caracteres; las etiquetas `XP*` son de Microsoft (Windows Property System) y van en UCS-2LE.
//
// Leer sirve para NOMBRAR, no para decidir qué se quita: el bloque entero se va (lista blanca del
// contenedor). Por eso este lector es tolerante por dentro y estricto en la frontera:
//   · la cabecera TIFF rota lanza `ErrorDeMetadatos` (el contenedor avisa `exif-ilegible`);
//   · un IFD fuera de rango, un valor que apunta fuera, un ciclo o el tope de entradas NO lanzan:
//     se lee lo que se puede y se marca `incompleto` (el contenedor avisa igual).
// El recorrido es iterativo (una cola de IFD con un conjunto de visitados), con un tope de entradas
// en total: un IFD que apunta a sí mismo o un archivo con 65 535 entradas por directorio terminan
// en milisegundos.

import { leerIptcIim } from "./iptc";
import {
  crearCampo,
  type Inventario,
  type LecturaDeCampos,
} from "./inventario";
import {
  ascii,
  BYTES_DE_TEXTO,
  coincide,
  fallar,
  type TextoDecodificado,
  textoUtf16,
  textoUtf8Laxo,
  textoUtf8OLatin1,
  u16,
  u32,
} from "./lector-binario";
import {
  type CampoCrudo,
  ErrorDeMetadatos,
  type OrigenDeCampo,
  type Revela,
} from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

/** Entradas que se leen como mucho entre todos los IFD de un bloque. */
export const MAXIMO_DE_ENTRADAS = 4096;

/** Valores numéricos que se escriben como mucho al pasar a texto un campo de la lista. */
const MAXIMO_DE_NUMEROS = 64;

export interface LecturaDeExif extends LecturaDeCampos {
  /** Etiquetas fuera de la lista cerrada (exposición, ISO, balance de blancos…): se cuentan. */
  readonly otrasEtiquetas: number;
  /** 0x0112, si trae un valor válido (1–8). NO es un campo: es lo único que puede conservarse. */
  readonly orientacion: number | null;
  /** Bytes de la miniatura (IFD1), 0 si no hay. Es OTRA foto: puede no estar recortada como la grande. */
  readonly miniatura: number;
  /** Bytes del `MakerNote` (0x927C), 0 si no hay: un bloque privado del fabricante, sin estándar. */
  readonly fabricante: number;
  /** Algo de la estructura no se pudo leer: lo leído vale, pero no es todo lo que había. */
  readonly incompleto: boolean;
}

// ── La lista cerrada ────────────────────────────────────────────────────────────────────────────

/** Cómo se decodifica el valor: texto, UCS-2LE (`XP*`) o con prefijo de juego de caracteres. */
type Lectura = "texto" | "ucs2" | "comentario";

interface Etiqueta {
  readonly clave: string;
  readonly revela: Revela;
  readonly lectura: Lectura;
}

function e(
  clave: string,
  revela: Revela,
  lectura: Lectura = "texto",
): Etiqueta {
  return { clave, revela, lectura };
}

const ETIQUETAS: ReadonlyMap<number, Etiqueta> = new Map([
  [0x010d, e("DocumentName", "descripcion")],
  [0x010e, e("ImageDescription", "descripcion")],
  [0x010f, e("Make", "dispositivo")],
  [0x0110, e("Model", "dispositivo")],
  [0x0131, e("Software", "software")],
  [0x0132, e("DateTime", "fecha")],
  [0x013b, e("Artist", "autoria")],
  [0x013c, e("HostComputer", "dispositivo")],
  [0x8298, e("Copyright", "autoria")],
  [0x9003, e("DateTimeOriginal", "fecha")],
  [0x9004, e("DateTimeDigitized", "fecha")],
  [0x9010, e("OffsetTime", "fecha")],
  [0x9011, e("OffsetTimeOriginal", "fecha")],
  [0x9012, e("OffsetTimeDigitized", "fecha")],
  [0x9286, e("UserComment", "descripcion", "comentario")],
  [0x9c9b, e("XPTitle", "descripcion", "ucs2")],
  [0x9c9c, e("XPComment", "descripcion", "ucs2")],
  [0x9c9d, e("XPAuthor", "autoria", "ucs2")],
  [0x9c9e, e("XPKeywords", "descripcion", "ucs2")],
  [0x9c9f, e("XPSubject", "descripcion", "ucs2")],
  [0xa420, e("ImageUniqueID", "identificador")],
  [0xa430, e("CameraOwnerName", "autoria")],
  [0xa431, e("BodySerialNumber", "dispositivo")],
  [0xa433, e("LensMake", "dispositivo")],
  [0xa434, e("LensModel", "dispositivo")],
  [0xa435, e("LensSerialNumber", "dispositivo")],
]);

const ORIENTACION = 0x0112;
const MAKER_NOTE = 0x927c;
const XMP_EN_TIFF = 0x02bc;
const IPTC_EN_TIFF = 0x83bb;
const MINIATURA_DESDE = 0x0201;
const MINIATURA_LARGO = 0x0202;
const TIRAS_LARGO = 0x0117;

/** IFD0 es el principal; el IFD1, al que apunta su «siguiente», describe la miniatura. */
type ClaseDeIfd =
  "principal" | "miniatura" | "exif" | "gps" | "interoperabilidad";

/** Las etiquetas que apuntan a otro IFD, y qué clase de IFD es. No se cuentan: son estructura. */
const PUNTEROS: ReadonlyMap<number, ClaseDeIfd> = new Map([
  [0x8769, "exif"],
  [0x8825, "gps"],
  [0xa005, "interoperabilidad"],
]);

// GPS (CIPA DC-008, § 4.6.6): los valores y sus referencias se combinan en UN campo legible.
const GPS = {
  latitudRef: 0x0001,
  latitud: 0x0002,
  longitudRef: 0x0003,
  longitud: 0x0004,
  altitudRef: 0x0005,
  altitud: 0x0006,
  hora: 0x0007,
  direccionRef: 0x0010,
  direccion: 0x0011,
  destinoLatitudRef: 0x0013,
  destinoLatitud: 0x0014,
  destinoLongitudRef: 0x0015,
  destinoLongitud: 0x0016,
  area: 0x001c,
  fecha: 0x001d,
} as const;

/** Las del GPS que se combinan en un campo; las demás (versión, satélites, datum…) se cuentan. */
const GPS_COMBINADAS = new Set<number>(Object.values(GPS));

/** Bytes por valor de cada tipo TIFF (1–13). Un tipo desconocido no se puede medir. */
const TAMANO_DEL_TIPO = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const SSHORT = 8;
const SLONG = 9;
const SRATIONAL = 10;
const IFD = 13;

// ── El recorrido ────────────────────────────────────────────────────────────────────────────────

interface Entrada {
  readonly etiqueta: number;
  readonly tipo: number;
  readonly cuenta: number;
  /** Dónde empieza el valor dentro del bloque TIFF (en la entrada misma si cabe en 4 bytes). */
  readonly desde: number;
  readonly largo: number;
}

class Lector {
  readonly campos: CampoCrudo[] = [];
  recortados = false;
  otrasEtiquetas = 0;
  orientacion: number | null = null;
  miniatura = 0;
  fabricante = 0;
  incompleto = false;

  constructor(
    readonly tiff: Uint8Array,
    readonly le: boolean,
  ) {}

  campo(
    clave: string,
    origen: OrigenDeCampo,
    revela: Revela,
    texto: TextoDecodificado,
  ): void {
    const nuevo = crearCampo(clave, origen, revela, texto.texto, texto.cortado);
    this.recortados ||= nuevo.recortado;
    if (nuevo.campo) this.campos.push(nuevo.campo);
  }

  agregarLectura(lectura: LecturaDeCampos): void {
    this.recortados ||= lectura.recortados;
    this.campos.push(...lectura.campos);
  }

  /** Los bytes del valor, o `null` (y `incompleto`) si apunta fuera del bloque. */
  valor(entrada: Entrada): Uint8Array | null {
    if (entrada.desde + entrada.largo > this.tiff.length) {
      this.incompleto = true;
      return null;
    }
    return this.tiff.subarray(entrada.desde, entrada.desde + entrada.largo);
  }

  /** Los números de un valor SHORT, LONG o (S)RATIONAL; un racional con denominador 0 es `null`. */
  numeros(entrada: Entrada, tope = MAXIMO_DE_NUMEROS): (number | null)[] {
    const v = this.valor(entrada);
    if (!v) return [];
    const salida: (number | null)[] = [];
    const n = Math.min(entrada.cuenta, tope);
    for (let i = 0; i < n; i++) {
      switch (entrada.tipo) {
        case 1:
        case 7:
          salida.push(v[i]);
          break;
        case 6:
          salida.push((v[i] << 24) >> 24);
          break;
        case SHORT:
          salida.push(u16(v, i * 2, this.le));
          break;
        case SSHORT:
          salida.push((u16(v, i * 2, this.le) << 16) >> 16);
          break;
        case LONG:
        case IFD:
          salida.push(u32(v, i * 4, this.le));
          break;
        case SLONG:
          salida.push(u32(v, i * 4, this.le) | 0);
          break;
        case RATIONAL:
        case SRATIONAL: {
          let a = u32(v, i * 8, this.le);
          let b = u32(v, i * 8 + 4, this.le);
          if (entrada.tipo === SRATIONAL) {
            a |= 0;
            b |= 0;
          }
          salida.push(b === 0 ? null : a / b);
          break;
        }
        default:
          // FLOAT y DOUBLE no aparecen en la lista cerrada: no se interpretan.
          return [];
      }
    }
    return salida;
  }
}

/**
 * Texto ASCII de TIFF: puede llevar varias cadenas separadas por `\0` (el Copyright lleva dos: la
 * del fotógrafo y la del editor), y se unen con «; ». Se mira como mucho `BYTES_DE_TEXTO` del
 * valor: un millón de `\0` no son un millón de vueltas.
 */
function textoAscii(bytes: Uint8Array): TextoDecodificado {
  const partes: string[] = [];
  let cortado = false;
  let desde = 0;
  while (desde < bytes.length && desde < BYTES_DE_TEXTO) {
    let hasta = bytes.indexOf(0, desde);
    if (hasta < 0) hasta = bytes.length;
    const parte = textoUtf8OLatin1(bytes.subarray(desde, hasta));
    cortado ||= parte.cortado;
    if (parte.texto.trim() !== "") partes.push(parte.texto);
    desde = hasta + 1;
  }
  if (desde < bytes.length && bytes.subarray(desde).some((b) => b !== 0))
    cortado = true;
  return { texto: partes.join("; "), cortado };
}

const PREFIJO_ASCII = ascii("ASCII\0\0\0");
const PREFIJO_UNICODE = ascii("UNICODE\0");

/**
 * `UserComment` y `GPSAreaInformation`: 8 bytes de juego de caracteres y el texto. UNICODE va en el
 * orden de bytes del bloque, salvo que traiga BOM. JIS y «indefinido» se leen como UTF-8 o Latin-1:
 * lo que importa es nombrar que hay un comentario, y el valor solo se muestra enmascarado.
 */
function textoConPrefijo(bytes: Uint8Array, le: boolean): TextoDecodificado {
  const cuerpo = bytes.subarray(8);
  if (coincide(bytes, PREFIJO_UNICODE)) {
    if (cuerpo[0] === 0xff && cuerpo[1] === 0xfe)
      return textoUtf16(cuerpo.subarray(2), true);
    if (cuerpo[0] === 0xfe && cuerpo[1] === 0xff)
      return textoUtf16(cuerpo.subarray(2), false);
    return textoUtf16(cuerpo, le);
  }
  if (coincide(bytes, PREFIJO_ASCII)) return textoAscii(cuerpo);
  return textoAscii(bytes.length >= 8 ? cuerpo : bytes);
}

function decodificar(
  lector: Lector,
  entrada: Entrada,
  lectura: Lectura,
): TextoDecodificado | null {
  const tipo = entrada.tipo;
  // Un número donde se espera texto (un `Artist` escrito como SHORT): se escriben los números.
  if (tipo !== ASCII && tipo !== 1 && tipo !== 7) {
    const numeros = lector.numeros(entrada);
    return {
      texto: numeros.filter((n) => n !== null).join(" "),
      cortado: entrada.cuenta > MAXIMO_DE_NUMEROS,
    };
  }
  const bytes = lector.valor(entrada);
  if (!bytes) return null;
  if (lectura === "ucs2" && tipo !== ASCII) return textoUtf16(bytes, true);
  if (lectura === "comentario" && tipo !== ASCII)
    return textoConPrefijo(bytes, lector.le);
  return textoAscii(bytes);
}

// ── GPS ─────────────────────────────────────────────────────────────────────────────────────────

/** `-0.000000` no es una coordenada que alguien escriba. */
function fijo(numero: number, decimales: number): string {
  const texto = numero.toFixed(decimales);
  return /^-0\.?0*$/.test(texto) ? texto.slice(1) : texto;
}

function dosCifras(n: number): string {
  return String(Math.trunc(n)).padStart(2, "0");
}

/** Grados, minutos y segundos (1 a 3 racionales) a grados decimales con signo. */
function grados(numeros: (number | null)[], negativo: boolean): number | null {
  if (numeros.length === 0 || numeros.some((n) => n === null)) return null;
  const [g = 0, m = 0, s = 0] = numeros as number[];
  const valor = g + m / 60 + s / 3600;
  return negativo ? -valor : valor;
}

function referencia(lector: Lector, entrada: Entrada | undefined): string {
  if (!entrada) return "";
  const v = lector.valor(entrada);
  if (!v) return "";
  if (entrada.tipo === ASCII) return textoAscii(v).texto.trim().toUpperCase();
  return String(v[0] ?? "");
}

function leerGps(lector: Lector, gps: ReadonlyMap<number, Entrada>): void {
  const en = (clave: number) => gps.get(clave);
  const ubicacion = (texto: string, clave: string) =>
    lector.campo(clave, "gps", "ubicacion", { texto, cortado: false });

  const coordenada = (
    valor: number,
    ref: number,
    negativa: string,
    clave: string,
  ) => {
    const entrada = en(valor);
    if (!entrada) return;
    const r = referencia(lector, en(ref));
    const g = grados(lector.numeros(entrada, 3), r.startsWith(negativa));
    if (g !== null) ubicacion(fijo(g, 6), clave);
  };
  coordenada(GPS.latitud, GPS.latitudRef, "S", "GPSLatitude");
  coordenada(GPS.longitud, GPS.longitudRef, "W", "GPSLongitude");

  const altitud = en(GPS.altitud);
  if (altitud) {
    const [metros] = lector.numeros(altitud, 1);
    const bajoElMar = referencia(lector, en(GPS.altitudRef)) === "1";
    if (metros !== null && metros !== undefined)
      ubicacion(fijo(bajoElMar ? -metros : metros, 2), "GPSAltitude");
  }

  // Fecha y hora UTC del satélite: un CUÁNDO tan preciso como el de la cámara, o más.
  const fecha = en(GPS.fecha);
  const horaEntrada = en(GPS.hora);
  let hora = "";
  if (horaEntrada) {
    const partes = lector.numeros(horaEntrada, 3);
    if (partes.length === 3 && partes.every((p) => p !== null)) {
      const [h, m, s] = partes as number[];
      const segundos = Number.isInteger(s)
        ? dosCifras(s)
        : s.toFixed(2).padStart(5, "0");
      hora = `${dosCifras(h)}:${dosCifras(m)}:${segundos}`;
    }
  }
  const textoDeFecha = fecha ? lector.valor(fecha) : null;
  if (textoDeFecha) {
    const dia = textoAscii(textoDeFecha).texto;
    lector.campo("GPSDateStamp", "gps", "fecha", {
      texto: hora === "" ? dia : `${dia} ${hora}`,
      cortado: false,
    });
  } else if (hora !== "")
    lector.campo("GPSTimeStamp", "gps", "fecha", {
      texto: hora,
      cortado: false,
    });

  const direccion = en(GPS.direccion);
  if (direccion) {
    const [d] = lector.numeros(direccion, 1);
    if (d !== null && d !== undefined) ubicacion(fijo(d, 2), "GPSImgDirection");
  }

  coordenada(GPS.destinoLatitud, GPS.destinoLatitudRef, "S", "GPSDestLatitude");
  coordenada(
    GPS.destinoLongitud,
    GPS.destinoLongitudRef,
    "W",
    "GPSDestLongitude",
  );

  const area = en(GPS.area);
  if (area) {
    const v = lector.valor(area);
    if (v)
      lector.campo(
        "GPSAreaInformation",
        "gps",
        "ubicacion",
        area.tipo === ASCII ? textoAscii(v) : textoConPrefijo(v, lector.le),
      );
  }
}

// ── La entrada ──────────────────────────────────────────────────────────────────────────────────

/**
 * Lee un bloque TIFF/EXIF (desde la cabecera `II`/`MM`, sin el `Exif\0\0` del JPEG). Lanza
 * `ErrorDeMetadatos` solo si la cabecera no es TIFF; todo lo demás se tolera y se marca.
 */
export function leerExif(tiff: Uint8Array): LecturaDeExif {
  const le = cabecera(tiff);
  const lector = new Lector(tiff, le);
  const primero = u32(tiff, 4, le);
  if (primero < 8 || primero >= tiff.length) fallar();

  const cola: [number, ClaseDeIfd][] = [[primero, "principal"]];
  const visitados = new Set<number>();
  let entradas = 0;

  for (let i = 0; i < cola.length; i++) {
    const [desde, clase] = cola[i];
    if (visitados.has(desde)) {
      lector.incompleto = true; // un ciclo: el archivo apunta a un directorio ya leído
      continue;
    }
    visitados.add(desde);
    if (desde < 8 || desde + 2 > tiff.length) {
      lector.incompleto = true;
      continue;
    }
    const cuantas = u16(tiff, desde, le);
    const finDeLaTabla = desde + 2 + cuantas * 12;
    if (finDeLaTabla > tiff.length) {
      lector.incompleto = true;
      continue;
    }

    const gps = new Map<number, Entrada>();
    let miniaturaDesde = -1;
    let miniaturaLargo = -1;
    for (let k = 0; k < cuantas; k++) {
      if (++entradas > MAXIMO_DE_ENTRADAS) {
        lector.incompleto = true;
        break;
      }
      const p = desde + 2 + k * 12;
      const etiqueta = u16(tiff, p, le);
      const tipo = u16(tiff, p + 2, le);
      const cuenta = u32(tiff, p + 4, le);
      const tamano = TAMANO_DEL_TIPO[tipo] ?? 0;
      if (tamano === 0) {
        // Un tipo que TIFF no define: no se puede medir ni leer el valor.
        lector.incompleto = true;
        lector.otrasEtiquetas += 1;
        continue;
      }
      const largo = cuenta * tamano;
      const entrada: Entrada = {
        etiqueta,
        tipo,
        cuenta,
        largo,
        desde: largo <= 4 ? p + 8 : u32(tiff, p + 8, le),
      };

      if (clase === "gps") {
        if (GPS_COMBINADAS.has(etiqueta)) {
          if (!gps.has(etiqueta)) gps.set(etiqueta, entrada);
        } else lector.otrasEtiquetas += 1;
        continue;
      }

      const destino = PUNTEROS.get(etiqueta);
      if (destino) {
        const [puntero] = lector.numeros(entrada, 1);
        if (typeof puntero === "number") cola.push([puntero, destino]);
        else lector.incompleto = true;
        continue;
      }

      switch (etiqueta) {
        case ORIENTACION: {
          const [valor] = lector.numeros(entrada, 1);
          if (
            lector.orientacion === null &&
            typeof valor === "number" &&
            valor >= 1 &&
            valor <= 8
          )
            lector.orientacion = valor;
          continue;
        }
        case MINIATURA_DESDE:
          miniaturaDesde = lector.numeros(entrada, 1)[0] ?? -1;
          continue;
        case MINIATURA_LARGO:
          miniaturaLargo = lector.numeros(entrada, 1)[0] ?? -1;
          continue;
        case TIRAS_LARGO:
          // Una miniatura sin comprimir (en tiras) solo vive en el IFD1.
          if (clase === "miniatura") {
            for (const n of lector.numeros(entrada, MAXIMO_DE_NUMEROS))
              lector.miniatura += n ?? 0;
          } else lector.otrasEtiquetas += 1;
          continue;
        case MAKER_NOTE:
          if (lector.valor(entrada)) lector.fabricante += largo;
          continue;
        case XMP_EN_TIFF: {
          const v = lector.valor(entrada);
          if (v)
            lector.agregarLectura(
              leerXmp(textoUtf8Laxo(v, LARGO_MAXIMO_DE_XMP), "xmp"),
            );
          continue;
        }
        case IPTC_EN_TIFF: {
          const v = lector.valor(entrada);
          if (v) {
            const iptc = leerIptcIim(v);
            lector.agregarLectura(iptc);
            lector.otrasEtiquetas += iptc.otrasEtiquetas;
            lector.incompleto ||= iptc.incompleto;
          }
          continue;
        }
      }

      const conocida = ETIQUETAS.get(etiqueta);
      if (!conocida) {
        lector.otrasEtiquetas += 1;
        continue;
      }
      const texto = decodificar(lector, entrada, conocida.lectura);
      if (texto) lector.campo(conocida.clave, "exif", conocida.revela, texto);
    }

    if (clase === "gps") leerGps(lector, gps);
    if (miniaturaDesde >= 0 && miniaturaLargo > 0) {
      if (miniaturaDesde + miniaturaLargo <= tiff.length)
        lector.miniatura += miniaturaLargo;
      else lector.incompleto = true;
    }
    if (entradas > MAXIMO_DE_ENTRADAS) break;

    // IFD0 → IFD1 (la miniatura). Exif no define un IFD2: lo que encadene el IFD1 no se lee (y se
    // quita con el bloque, como todo).
    if (clase === "principal" && finDeLaTabla + 4 <= tiff.length) {
      const siguiente = u32(tiff, finDeLaTabla, le);
      if (siguiente !== 0) cola.push([siguiente, "miniatura"]);
    }
  }

  return {
    campos: lector.campos,
    recortados: lector.recortados,
    otrasEtiquetas: lector.otrasEtiquetas,
    orientacion: lector.orientacion,
    miniatura: lector.miniatura,
    fabricante: lector.fabricante,
    incompleto: lector.incompleto,
  };
}

const PREFIJO_EXIF = ascii("Exif\0");

/**
 * El TIFF de un bloque EXIF. El APP1 de un JPEG lo trae detrás de `Exif\0\0`; el `eXIf` de PNG y el
 * `EXIF` de WebP no deberían, pero hay programas que lo escriben igual: se aceptan las dos formas.
 */
export function sinPrefijoExif(datos: Uint8Array): Uint8Array {
  return coincide(datos, PREFIJO_EXIF) ? datos.subarray(6) : datos;
}

/**
 * Anota en el inventario lo que dice un bloque EXIF que se va a quitar (sus campos, la miniatura y
 * la nota del fabricante como elementos aparte) y devuelve su orientación. Un bloque ilegible no
 * detiene nada: se avisa `exif-ilegible` y el bloque se quita igual.
 */
export function anotarExif(
  inventario: Inventario,
  tiff: Uint8Array,
): number | null {
  try {
    const lectura = leerExif(tiff);
    inventario.agregarLectura(lectura);
    inventario.contarOtras(lectura.otrasEtiquetas);
    if (lectura.miniatura > 0)
      inventario.quitar("miniatura", "IFD1", lectura.miniatura);
    if (lectura.fabricante > 0)
      inventario.quitar("fabricante", "MakerNote", lectura.fabricante);
    if (lectura.incompleto) inventario.avisar("exif-ilegible");
    return lectura.orientacion;
  } catch (error) {
    if (!(error instanceof ErrorDeMetadatos)) throw error;
    inventario.avisar("exif-ilegible");
    return null;
  }
}

/** `II*\0` (little endian) o `MM\0*` (big endian). Devuelve si es little endian. */
function cabecera(tiff: Uint8Array): boolean {
  if (coincide(tiff, [0x49, 0x49, 0x2a, 0x00])) return true;
  if (coincide(tiff, [0x4d, 0x4d, 0x00, 0x2a])) return false;
  return fallar();
}

// ── El EXIF mínimo que se conserva ──────────────────────────────────────────────────────────────

/**
 * Un TIFF con UNA etiqueta, la orientación (0x0112), y nada más: es lo único del EXIF que hace
 * falta para VER la foto como se tomó. Siempre en big endian y con la misma forma, para que la
 * salida sea una función pura de la orientación y una segunda limpieza lo reconozca como propio.
 *
 *   4D 4D 00 2A 00 00 00 08 | 00 01 | 01 12 00 03 00 00 00 01 00 0V 00 00 | 00 00 00 00
 */
export function exifMinimo(orientacion: number): Uint8Array {
  return new Uint8Array([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientacion & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

/** Bytes del EXIF mínimo. */
export const LARGO_DEL_EXIF_MINIMO = 26;

/** ¿Una orientación que vale la pena conservar? La 1 es «como está»: no hace falta escribirla. */
export function orientacionQueSeConserva(orientacion: number | null): boolean {
  return orientacion !== null && orientacion >= 2 && orientacion <= 8;
}

/** Si el bloque es EXACTAMENTE el EXIF mínimo que escribe Velo, su orientación; si no, `null`. */
export function orientacionDelExifMinimo(tiff: Uint8Array): number | null {
  if (tiff.length !== LARGO_DEL_EXIF_MINIMO) return null;
  const orientacion = tiff[19];
  if (!orientacionQueSeConserva(orientacion)) return null;
  return coincide(tiff, exifMinimo(orientacion)) ? orientacion : null;
}
