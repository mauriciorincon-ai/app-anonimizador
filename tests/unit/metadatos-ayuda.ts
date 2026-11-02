// Ayudas compartidas por las pruebas de los lectores de IMÁGENES (S6). No es una prueba: `vitest`
// solo corre los `*.test.ts`; esto se importa desde ellos.
//
// Construyen los contenedores BYTE A BYTE, sin pasar por el código que se prueba: la estructura
// TIFF/EXIF, los segmentos JPEG, los chunks PNG (con su CRC-32, calculado aquí por separado) y los
// chunks RIFF de WebP. Solo estructura: los datos comprimidos son bytes de relleno, porque ningún
// lector de Velo decodifica píxeles. Todo valor es SINTÉTICO (regla dura 5) y lleva la palabra
// `CENTINELA`, para poder buscar en la salida que no quedó ni uno.

import { expect } from "vitest";

import { ErrorDeMetadatos } from "../../src/engine/metadatos/tipos";

type Bytes = Uint8Array | readonly number[];

/** UTF-8. */
export function texto(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Latin-1 (un byte por carácter). */
export function latin1(s: string): Uint8Array {
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
}

export function unir(...partes: Bytes[]): Uint8Array {
  const largo = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(largo);
  let pos = 0;
  for (const p of partes) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}

export function buscar(bytes: Uint8Array, aguja: Bytes | string): number {
  const a = typeof aguja === "string" ? texto(aguja) : Uint8Array.from(aguja);
  if (a.length === 0) return 0;
  let desde = 0;
  for (;;) {
    const i = bytes.indexOf(a[0], desde);
    if (i < 0 || i + a.length > bytes.length) return -1;
    let igual = true;
    for (let k = 1; k < a.length && igual; k++) igual = bytes[i + k] === a[k];
    if (igual) return i;
    desde = i + 1;
  }
}

export function contiene(bytes: Uint8Array, aguja: Bytes | string): boolean {
  return buscar(bytes, aguja) >= 0;
}

export function be16(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}

export function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

export function le16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

export function le32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** UCS-2 little endian con su `\0\0` final: lo que Windows escribe en `XPAuthor`. */
export function ucs2le(s: string): Uint8Array {
  const salida: number[] = [];
  for (let i = 0; i < s.length; i++) salida.push(...le16(s.charCodeAt(i)));
  return Uint8Array.from([...salida, 0, 0]);
}

/** Espera que `f` lance un `ErrorDeMetadatos` con ese motivo (y no otra cosa), y nada más en el mensaje. */
export function esperarError(
  f: () => unknown,
  motivo: ErrorDeMetadatos["motivo"] = "imagen-ilegible",
): void {
  let error: unknown = null;
  try {
    f();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ErrorDeMetadatos);
  expect((error as ErrorDeMetadatos).motivo).toBe(motivo);
  expect((error as ErrorDeMetadatos).message).toBe(motivo);
}

/** Generador congruencial lineal sembrado (Numerical Recipes): la misma semilla, los mismos números. */
export function lcg(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado;
  };
}

// ── TIFF / EXIF ─────────────────────────────────────────────────────────────────────────────────

export type ValorTiff =
  | { readonly ascii: string }
  | { readonly asciiCrudo: Bytes }
  | { readonly bytes: Bytes; readonly tipo?: 1 | 7 }
  | { readonly short: readonly number[] }
  | { readonly long: readonly number[] }
  | { readonly racional: readonly (readonly [number, number])[] }
  | { readonly sracional: readonly (readonly [number, number])[] }
  /** Para casos hostiles: tipo, cuenta y bytes del valor tal cual (o un desplazamiento forzado). */
  | {
      readonly crudo: {
        readonly tipo: number;
        readonly cuenta: number;
        readonly datos?: Bytes;
        readonly desplazamiento?: number;
      };
    };

export type EntradasTiff = readonly (readonly [number, ValorTiff])[];

export interface DescripcionTiff {
  /** `true` = `II` (little endian); por omisión `MM`. */
  readonly le?: boolean;
  readonly ifd0?: EntradasTiff;
  readonly exif?: EntradasTiff;
  readonly gps?: EntradasTiff;
  /** Bytes de una miniatura JPEG: crea el IFD1 con 0x0201/0x0202. */
  readonly miniatura?: Bytes;
  /** Entradas de más para el IFD1 (solo si hay `miniatura`). */
  readonly ifd1?: EntradasTiff;
}

interface Codificado {
  readonly tipo: number;
  readonly cuenta: number;
  readonly datos: Uint8Array;
  readonly desplazamiento?: number;
}

function codificar(v: ValorTiff, le: boolean): Codificado {
  const u16 = le ? le16 : be16;
  const u32 = le ? le32 : be32;
  if ("ascii" in v) {
    const d = unir(texto(v.ascii), [0]);
    return { tipo: 2, cuenta: d.length, datos: d };
  }
  if ("asciiCrudo" in v)
    return {
      tipo: 2,
      cuenta: v.asciiCrudo.length,
      datos: Uint8Array.from(v.asciiCrudo),
    };
  if ("bytes" in v)
    return {
      tipo: v.tipo ?? 7,
      cuenta: v.bytes.length,
      datos: Uint8Array.from(v.bytes),
    };
  if ("short" in v)
    return {
      tipo: 3,
      cuenta: v.short.length,
      datos: Uint8Array.from(v.short.flatMap(u16)),
    };
  if ("long" in v)
    return {
      tipo: 4,
      cuenta: v.long.length,
      datos: Uint8Array.from(v.long.flatMap(u32)),
    };
  if ("racional" in v)
    return {
      tipo: 5,
      cuenta: v.racional.length,
      datos: Uint8Array.from(
        v.racional.flatMap(([a, b]) => [...u32(a), ...u32(b)]),
      ),
    };
  if ("sracional" in v)
    return {
      tipo: 10,
      cuenta: v.sracional.length,
      datos: Uint8Array.from(
        v.sracional.flatMap(([a, b]) => [...u32(a >>> 0), ...u32(b >>> 0)]),
      ),
    };
  return {
    tipo: v.crudo.tipo,
    cuenta: v.crudo.cuenta,
    datos: Uint8Array.from(v.crudo.datos ?? []),
    desplazamiento: v.crudo.desplazamiento,
  };
}

/**
 * Un bloque TIFF con IFD0 → (ExifIFD, GPS) → IFD1. Los IFD van detrás de la cabecera y los valores
 * de más de 4 bytes detrás de los IFD; la miniatura, al final.
 */
export function tiff(d: DescripcionTiff): Uint8Array {
  const le = d.le ?? false;
  const u16 = le ? le16 : be16;
  const u32 = le ? le32 : be32;
  // Copias mutables: los punteros se reescriben cuando se conocen los desplazamientos.
  const copia = (e: EntradasTiff = []): [number, ValorTiff][] =>
    e.map(([etiqueta, valor]) => [etiqueta, valor]);
  const ifd0 = copia(d.ifd0);
  const grupos: [number, ValorTiff][][] = [ifd0];
  if (d.exif) grupos.push(copia(d.exif));
  if (d.gps) grupos.push(copia(d.gps));
  const ifd1: [number, ValorTiff][] | null = d.miniatura
    ? [
        [0x0103, { short: [6] }],
        [0x0201, { long: [0] }],
        [0x0202, { long: [d.miniatura.length] }],
        ...copia(d.ifd1),
      ]
    : null;
  if (ifd1) grupos.push(ifd1);
  // Los punteros se agregan antes de medir: el IFD0 crece con ellos.
  if (d.exif) ifd0.push([0x8769, { long: [0] }]);
  if (d.gps) ifd0.push([0x8825, { long: [0] }]);

  const desplazamientos: number[] = [];
  let pos = 8;
  for (const g of grupos) {
    desplazamientos.push(pos);
    pos += 2 + g.length * 12 + 4;
  }
  let i = 1;
  const exifEn = d.exif ? desplazamientos[i++] : 0;
  const gpsEn = d.gps ? desplazamientos[i++] : 0;
  const ifd1En = ifd1 ? desplazamientos[i++] : 0;
  for (const e of ifd0) {
    if (e[0] === 0x8769) e[1] = { long: [exifEn] };
    if (e[0] === 0x8825) e[1] = { long: [gpsEn] };
  }

  // Valores grandes, detrás de los IFD.
  const area: number[] = [];
  const inicioDelArea = pos;
  const codificados = grupos.map((g) =>
    g.map(([etiqueta, valor]) => {
      const c = codificar(valor, le);
      let campo: number[];
      if (c.desplazamiento !== undefined) campo = u32(c.desplazamiento);
      else if (c.datos.length <= 4)
        campo = [...c.datos, 0, 0, 0, 0].slice(0, 4);
      else {
        campo = u32(inicioDelArea + area.length);
        for (const b of c.datos) area.push(b);
        if (area.length % 2) area.push(0);
      }
      return { etiqueta, tipo: c.tipo, cuenta: c.cuenta, campo };
    }),
  );
  if (ifd1) {
    const k = ifd1.findIndex(([e]) => e === 0x0201);
    codificados[codificados.length - 1][k].campo = u32(
      inicioDelArea + area.length,
    );
  }

  const salida: number[] = [
    ...(le ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a]),
    ...u32(8),
  ];
  codificados.forEach((g, n) => {
    salida.push(...u16(g.length));
    for (const e of g)
      salida.push(
        ...u16(e.etiqueta),
        ...u16(e.tipo),
        ...u32(e.cuenta),
        ...e.campo,
      );
    // Solo el IFD0 encadena (al IFD1).
    salida.push(...u32(n === 0 && ifd1 ? ifd1En : 0));
  });
  return unir(salida, area, d.miniatura ?? []);
}

/** Etiquetas que se usan en las pruebas. */
export const T = {
  ImageDescription: 0x010e,
  Make: 0x010f,
  Model: 0x0110,
  Orientation: 0x0112,
  Software: 0x0131,
  DateTime: 0x0132,
  Artist: 0x013b,
  HostComputer: 0x013c,
  Copyright: 0x8298,
  ExposureTime: 0x829a,
  FNumber: 0x829d,
  ISO: 0x8827,
  DateTimeOriginal: 0x9003,
  DateTimeDigitized: 0x9004,
  OffsetTimeOriginal: 0x9011,
  MakerNote: 0x927c,
  UserComment: 0x9286,
  XPTitle: 0x9c9b,
  XPComment: 0x9c9c,
  XPAuthor: 0x9c9d,
  XPKeywords: 0x9c9e,
  XPSubject: 0x9c9f,
  ImageUniqueID: 0xa420,
  CameraOwnerName: 0xa430,
  BodySerialNumber: 0xa431,
  LensMake: 0xa433,
  LensModel: 0xa434,
  LensSerialNumber: 0xa435,
  XMP: 0x02bc,
  IPTC: 0x83bb,
  GPSVersionID: 0x0000,
  GPSLatitudeRef: 0x0001,
  GPSLatitude: 0x0002,
  GPSLongitudeRef: 0x0003,
  GPSLongitude: 0x0004,
  GPSAltitudeRef: 0x0005,
  GPSAltitude: 0x0006,
  GPSTimeStamp: 0x0007,
  GPSImgDirectionRef: 0x0010,
  GPSImgDirection: 0x0011,
  GPSDestLatitudeRef: 0x0013,
  GPSDestLatitude: 0x0014,
  GPSDestLongitudeRef: 0x0015,
  GPSDestLongitude: 0x0016,
  GPSAreaInformation: 0x001c,
  GPSDateStamp: 0x001d,
} as const;

/**
 * Una foto «de teléfono» sintética: autor, cámara con serie, fechas, GPS (4.609710, −74.081750:
 * 4°36'34.956"N, 74°4'54.3"W), miniatura y nota del fabricante, todo con `CENTINELA`.
 */
export function tiffCompleto(
  opciones: { le?: boolean; orientacion?: number } = {},
): Uint8Array {
  const orientacion: EntradasTiff =
    opciones.orientacion === undefined
      ? []
      : [[T.Orientation, { short: [opciones.orientacion] }]];
  return tiff({
    le: opciones.le,
    ifd0: [
      [T.ImageDescription, { ascii: "CENTINELA descripcion" }],
      [T.Make, { ascii: "CENTINELA-Marca" }],
      [T.Model, { ascii: "CENTINELA-Modelo X" }],
      ...orientacion,
      [T.Software, { ascii: "CENTINELA-Editor 1.0" }],
      [T.DateTime, { ascii: "2026:03:14 15:09:26" }],
      [T.Artist, { ascii: "CENTINELA Ana Perez" }],
      [
        T.Copyright,
        {
          asciiCrudo: unir(
            texto("CENTINELA Foto"),
            [0],
            texto("CENTINELA Edicion"),
            [0],
          ),
        },
      ],
      [T.XPAuthor, { bytes: ucs2le("CENTINELA Autor XP"), tipo: 1 }],
    ],
    exif: [
      [T.ExposureTime, { racional: [[1, 120]] }],
      [T.FNumber, { racional: [[18, 10]] }],
      [T.ISO, { short: [100] }],
      [T.DateTimeOriginal, { ascii: "2026:03:14 15:09:26" }],
      [T.OffsetTimeOriginal, { ascii: "-05:00" }],
      [
        T.UserComment,
        { bytes: unir(texto("ASCII\0\0\0"), texto("CENTINELA comentario")) },
      ],
      [
        T.MakerNote,
        { bytes: unir(texto("CENTINELA-FABRICANTE"), new Uint8Array(30)) },
      ],
      [T.ImageUniqueID, { ascii: "CENTINELA0123456789abcdef0123456" }],
      [T.CameraOwnerName, { ascii: "CENTINELA Duena" }],
      [T.BodySerialNumber, { ascii: "CENTINELA-SERIE-0042" }],
      [T.LensModel, { ascii: "CENTINELA Lente 24mm" }],
    ],
    gps: [
      [T.GPSVersionID, { bytes: [2, 3, 0, 0], tipo: 1 }],
      [T.GPSLatitudeRef, { ascii: "N" }],
      [
        T.GPSLatitude,
        {
          racional: [
            [4, 1],
            [36, 1],
            [34956, 1000],
          ],
        },
      ],
      [T.GPSLongitudeRef, { ascii: "W" }],
      [
        T.GPSLongitude,
        {
          racional: [
            [74, 1],
            [4, 1],
            [543, 10],
          ],
        },
      ],
      [T.GPSAltitudeRef, { bytes: [0], tipo: 1 }],
      [T.GPSAltitude, { racional: [[26405, 10]] }],
      [
        T.GPSTimeStamp,
        {
          racional: [
            [20, 1],
            [9, 1],
            [26, 1],
          ],
        },
      ],
      [T.GPSDateStamp, { ascii: "2026:03:14" }],
    ],
    miniatura: unir([0xff, 0xd8], texto("CENTINELA-MINIATURA"), [0xff, 0xd9]),
  });
}

// ── JPEG ────────────────────────────────────────────────────────────────────────────────────────

export function segmento(marcador: number, datos: Bytes): Uint8Array {
  return unir([0xff, marcador], be16(datos.length + 2), datos);
}

export const SOI = [0xff, 0xd8];
export const EOI = [0xff, 0xd9];

const DQT = segmento(0xdb, [
  0x00,
  ...Array.from({ length: 64 }, (_, i) => i + 1),
]);
const SOF0 = segmento(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]);
const DHT = segmento(0xc4, [0x00, 1, ...new Array<number>(15).fill(0), 0x05]);
const SOS = segmento(0xda, [1, 1, 0x00, 0, 63, 0]);
/** Datos comprimidos de relleno, con un `FF 00` (relleno) y un `FF D0` (reinicio) dentro. */
const ENTROPIA = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a];

/** La imagen: tablas, cuadro y un escaneo con sus datos. Es lo que la limpieza copia tal cual. */
export const CUERPO_JPEG = unir(DQT, SOF0, DHT, SOS, ENTROPIA);

/** Una imagen progresiva: dos escaneos, con una tabla entre ellos. */
export const CUERPO_PROGRESIVO = unir(
  DQT,
  segmento(0xc2, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]),
  DHT,
  SOS,
  ENTROPIA,
  DHT,
  SOS,
  [0xab, 0xff, 0x00, 0xcd],
);

/** SOI + segmentos + el cuerpo + EOI + cola. */
export function jpeg(
  segmentos: readonly Bytes[],
  opciones: { cuerpo?: Uint8Array; cola?: Bytes } = {},
): Uint8Array {
  return unir(
    SOI,
    ...segmentos,
    opciones.cuerpo ?? CUERPO_JPEG,
    EOI,
    opciones.cola ?? [],
  );
}

/** APP0 JFIF; con miniatura de `x`×`y` píxeles RGB. */
export function jfif(x = 0, y = 0, relleno = 0x41): Uint8Array {
  return segmento(0xe0, [
    ...texto("JFIF\0"),
    1,
    2,
    1,
    ...be16(72),
    ...be16(72),
    x,
    y,
    ...new Array<number>(3 * x * y).fill(relleno),
  ]);
}

export function app1Exif(t: Uint8Array): Uint8Array {
  return segmento(0xe1, unir(texto("Exif\0\0"), t));
}

export function paqueteXmp(cuerpo: string): string {
  return (
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    `<rdf:Description rdf:about="">${cuerpo}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  );
}

export function app1Xmp(xml: string): Uint8Array {
  return segmento(
    0xe1,
    unir(texto("http://ns.adobe.com/xap/1.0/\0"), texto(xml)),
  );
}

/** Un trozo de XMP extendido (GUID de 32, largo total, desplazamiento, datos). */
export function app1XmpExtendido(
  datos: Uint8Array,
  total: number,
  desplazamiento: number,
): Uint8Array {
  return segmento(
    0xe1,
    unir(
      texto("http://ns.adobe.com/xmp/extension/\0"),
      texto("0123456789ABCDEF0123456789ABCDEF"),
      be32(total),
      be32(desplazamiento),
      datos,
    ),
  );
}

/** IPTC-IIM: `[registro, dataset, valor]`. */
export function iim(
  datasets: readonly (readonly [number, number, Bytes | string])[],
): Uint8Array {
  return unir(
    ...datasets.map(([r, d, v]) => {
      const valor = typeof v === "string" ? texto(v) : Uint8Array.from(v);
      return unir([0x1c, r, d], be16(valor.length), valor);
    }),
  );
}

/** Un recurso de Photoshop: `8BIM`, id, nombre Pascal (par), tamaño, datos (par). */
export function recurso8bim(id: number, datos: Bytes, nombre = ""): Uint8Array {
  const n = latin1(nombre);
  const pascal = unir([n.length], n, (n.length + 1) % 2 ? [0] : []);
  return unir(
    texto("8BIM"),
    be16(id),
    pascal,
    be32(datos.length),
    datos,
    datos.length % 2 ? [0] : [],
  );
}

export function app13(recursos: readonly Uint8Array[]): Uint8Array {
  return segmento(0xed, unir(texto("Photoshop 3.0\0"), ...recursos));
}

export function app2Icc(parte: number, de: number, datos: Bytes): Uint8Array {
  return segmento(0xe2, unir(texto("ICC_PROFILE\0"), [parte, de], datos));
}

export function com(t: string): Uint8Array {
  return segmento(0xfe, texto(t));
}

// ── PNG ─────────────────────────────────────────────────────────────────────────────────────────

const TABLA = (() => {
  const t = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 de PNG, escrito aparte del de `png.ts` para que sirva de oráculo. */
export function crcPng(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (TABLA[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

export const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function chunk(tipo: string, datos: Bytes = []): Uint8Array {
  const cuerpo = unir(latin1(tipo), datos);
  return unir(be32(datos.length), cuerpo, be32(crcPng(cuerpo)));
}

export const IHDR = chunk("IHDR", [...be32(1), ...be32(1), 8, 2, 0, 0, 0]);
export const IDATS = [
  chunk("IDAT", [0x78, 0x9c, 0x63, 0x60]),
  chunk("IDAT", [0x00, 0x00, 0x04, 0x00, 0x01]),
];
export const IEND = chunk("IEND");

export function png(
  opciones: {
    antes?: readonly Uint8Array[];
    despues?: readonly Uint8Array[];
    cola?: Bytes;
  } = {},
): Uint8Array {
  return unir(
    FIRMA_PNG,
    IHDR,
    ...(opciones.antes ?? []),
    ...IDATS,
    ...(opciones.despues ?? []),
    IEND,
    opciones.cola ?? [],
  );
}

export function tEXt(palabra: string, valor: string): Uint8Array {
  return chunk("tEXt", unir(latin1(palabra), [0], latin1(valor)));
}

export function iTXt(
  palabra: string,
  valor: Bytes | string,
  comprimido = false,
): Uint8Array {
  return chunk(
    "iTXt",
    unir(
      latin1(palabra),
      [0, comprimido ? 1 : 0, 0],
      texto("es"),
      [0],
      texto("traducida"),
      [0],
      typeof valor === "string" ? texto(valor) : valor,
    ),
  );
}

export interface ChunkLeido {
  readonly tipo: string;
  readonly bytes: Uint8Array;
  readonly datos: Uint8Array;
  readonly crcValido: boolean;
}

/** Recorre los chunks de un PNG (sin validar nada): tipo, bytes y si el CRC cuadra. */
export function chunksDe(bytes: Uint8Array): ChunkLeido[] {
  const salida: ChunkLeido[] = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const largo =
      bytes[pos] * 0x1000000 +
      ((bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]);
    const tipo = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const crc = bytes.subarray(pos + 8 + largo, pos + 12 + largo);
    const esperado = be32(crcPng(bytes.subarray(pos + 4, pos + 8 + largo)));
    salida.push({
      tipo,
      bytes: bytes.subarray(pos, pos + 12 + largo),
      datos: bytes.subarray(pos + 8, pos + 8 + largo),
      crcValido: esperado.every((b, i) => b === crc[i]),
    });
    pos += 12 + largo;
    if (tipo === "IEND") break;
  }
  return salida;
}

// ── WebP ────────────────────────────────────────────────────────────────────────────────────────

export function riff(
  codigo: string,
  datos: Bytes,
  conRelleno = true,
): Uint8Array {
  return unir(
    latin1(codigo),
    le32(datos.length),
    datos,
    conRelleno && datos.length % 2 ? [0] : [],
  );
}

/** `VP8X` con banderas y un lienzo de 16×16. */
export function vp8x(banderas: number): Uint8Array {
  return riff("VP8X", [banderas, 0, 0, 0, 15, 0, 0, 15, 0, 0]);
}

/** Un `VP8 ` de relleno, de largo IMPAR para que lleve byte de relleno. */
export const VP8 = riff(
  "VP8 ",
  [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x10, 0x00, 0x10, 0x00, 0x77],
);
export const VP8L = riff("VP8L", [0x2f, 0x0f, 0xc0, 0x03, 0x00, 0x07, 0x10]);
export const ALPH = riff("ALPH", [0x00, 0x11, 0x22]);

export function webp(
  chunks: readonly Uint8Array[],
  opciones: { cola?: Bytes } = {},
): Uint8Array {
  const cuerpo = unir(latin1("WEBP"), ...chunks);
  return unir(latin1("RIFF"), le32(cuerpo.length), cuerpo, opciones.cola ?? []);
}

/** Recorre los chunks de un WebP (sin validar nada): FourCC y bytes (cabecera + datos). */
export function chunksRiff(
  bytes: Uint8Array,
): { codigo: string; bytes: Uint8Array }[] {
  const salida: { codigo: string; bytes: Uint8Array }[] = [];
  const fin =
    8 + (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24));
  let pos = 12;
  while (pos + 8 <= Math.min(fin, bytes.length)) {
    const largo =
      bytes[pos + 4] |
      (bytes[pos + 5] << 8) |
      (bytes[pos + 6] << 16) |
      (bytes[pos + 7] << 24);
    salida.push({
      codigo: String.fromCharCode(...bytes.subarray(pos, pos + 4)),
      bytes: bytes.subarray(pos, pos + 8 + largo),
    });
    pos += 8 + largo + (largo % 2);
  }
  return salida;
}
