// JPEG sintético con metadatos falsos — para probar la limpieza, no para parecer una foto.
//
// Es un JPEG de línea base REAL, codificado aquí a mano (sin dependencias): YCbCr 4:4:4, las tablas
// de cuantización y de Huffman estándar del Anexo K de ITU-T T.81, bytes de relleno (0xFF 0x00) y
// todo. Como la imagen son bandas de color planas, cada bloque de 8×8 tiene un solo coeficiente
// distinto de cero —el DC— y el bloque se codifica como «diferencia de DC + fin de bloque». Un
// visor, un navegador o `sips` lo abren y muestran las bandas.
//
// Lo que lleva dentro y NO es imagen (el limpiador debe quitarlo todo, menos lo que hace falta para
// verla): JFIF, EXIF completo (autoría con cédula, cámara, serie, fechas, MakerNote, GPS con
// segundos, miniatura), XMP, IPTC en un recurso 8BIM de Photoshop, un comentario COM y, después del
// EOI, unos bytes sobrantes con una marca reconocible.

import {
  BANDAS,
  bandaDeFila,
  construirApp13Iptc,
  construirExif,
  construirXmp,
  crearFicha,
  crearRegistro,
} from "./comun.mjs";

// ── Anexo K de T.81 ───────────────────────────────────────────────────────────────────────────

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
];

// Tablas de cuantización de la Tabla K.1 y la K.2 (calidad ≈ 50), en orden natural (fila a fila).
const Q_LUMINANCIA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const Q_CROMINANCIA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56,
  99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99,
];

// Tablas de Huffman de las Tablas K.3 a K.6: número de códigos de cada largo (1 a 16) y símbolos.
const DC_LUMINANCIA = {
  bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  valores: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const DC_CROMINANCIA = {
  bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  valores: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const AC_LUMINANCIA = {
  bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
  valores: [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
    0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
    0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
    0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ],
};
const AC_CROMINANCIA = {
  bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
  valores: [
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41,
    0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
    0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1,
    0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
    0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44,
    0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
    0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74,
    0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
    0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
    0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
    0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
    0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4,
    0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ],
};

/** Asigna los códigos canónicos del Anexo C de T.81 y comprueba que forman un código de prefijo. */
function construirCodigos({ bits, valores }) {
  if (bits.reduce((a, b) => a + b, 0) !== valores.length) {
    throw new Error(
      "tabla de Huffman incoherente: el total de códigos no es el de símbolos",
    );
  }
  const codigos = new Map();
  let codigo = 0;
  let k = 0;
  for (let largo = 1; largo <= 16; largo++) {
    for (let i = 0; i < bits[largo - 1]; i++) {
      if (codigo >= (1 << largo) - 1) {
        throw new Error(
          "tabla de Huffman incoherente: rebasa el espacio de códigos",
        );
      }
      codigos.set(valores[k++], { codigo, largo });
      codigo++;
    }
    codigo <<= 1;
  }
  return codigos;
}

const CODIGOS = {
  dcLuminancia: construirCodigos(DC_LUMINANCIA),
  dcCrominancia: construirCodigos(DC_CROMINANCIA),
  acLuminancia: construirCodigos(AC_LUMINANCIA),
  acCrominancia: construirCodigos(AC_CROMINANCIA),
};

// ── Escritura de bits (MSB primero) con relleno de 0xFF ───────────────────────────────────────

class EscritorDeBits {
  constructor() {
    this.bytes = [];
    this.acumulado = 0;
    this.cuenta = 0;
  }

  escribir(valor, largo) {
    for (let i = largo - 1; i >= 0; i--) {
      this.acumulado = (this.acumulado << 1) | ((valor >> i) & 1);
      this.cuenta++;
      if (this.cuenta === 8) this.#byte(this.acumulado);
    }
  }

  #byte(byte) {
    this.bytes.push(byte);
    if (byte === 0xff) this.bytes.push(0x00); // byte stuffing: un 0xFF de datos va seguido de 0x00
    this.acumulado = 0;
    this.cuenta = 0;
  }

  /** Completa el último byte con unos (T.81 B.1.1.5) y devuelve el segmento entrópico. */
  cerrar() {
    if (this.cuenta > 0) {
      const relleno = 8 - this.cuenta;
      this.#byte(((this.acumulado << relleno) | ((1 << relleno) - 1)) & 0xff);
    }
    return Buffer.from(this.bytes);
  }
}

// ── Piezas del archivo ────────────────────────────────────────────────────────────────────────

function segmento(marcador, contenido) {
  if (contenido.length > 65533)
    throw new Error("segmento JPEG demasiado grande");
  const cabecera = Buffer.from([0xff, marcador, 0, 0]);
  cabecera.writeUInt16BE(contenido.length + 2, 2);
  return Buffer.concat([cabecera, contenido]);
}

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

function tablaDeCuantizacion(identificador, tabla) {
  return Buffer.from([identificador, ...ZIGZAG.map((i) => tabla[i])]);
}

function tablaDeHuffman(claseEIdentificador, { bits, valores }) {
  return Buffer.from([claseEIdentificador, ...bits, ...valores]);
}

/** RGB → YCbCr (JFIF, T.871), redondeado y acotado a 0–255. */
function aYCbCr([r, g, b]) {
  const acotar = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return [
    acotar(0.299 * r + 0.587 * g + 0.114 * b),
    acotar(128 - 0.168736 * r - 0.331264 * g + 0.5 * b),
    acotar(128 + 0.5 * r - 0.418688 * g - 0.081312 * b),
  ];
}

function categoria(diferencia) {
  let magnitud = Math.abs(diferencia);
  let n = 0;
  while (magnitud > 0) {
    n++;
    magnitud >>= 1;
  }
  return n;
}

/**
 * DQT + SOF0 + DHT + SOS + datos entrópicos de una imagen de bandas planas. `colorDeFila` da el
 * RGB de cada fila de bloques de 8 píxeles. Es todo lo que hace falta para decodificar la imagen;
 * con un SOI delante y un EOI detrás es un JPEG completo.
 */
function codificarImagen(ancho, alto, colorDeFila) {
  const bloquesX = Math.ceil(ancho / 8);
  const bloquesY = Math.ceil(alto / 8);

  const bits = new EscritorDeBits();
  const previo = [0, 0, 0];
  for (let by = 0; by < bloquesY; by++) {
    const ycc = aYCbCr(colorDeFila(by, bloquesY));
    for (let bx = 0; bx < bloquesX; bx++) {
      for (let c = 0; c < 3; c++) {
        // Un bloque plano de valor v tiene DC = 8·(v − 128) tras la DCT; se cuantiza con Q[0].
        const cuantizador = c === 0 ? Q_LUMINANCIA[0] : Q_CROMINANCIA[0];
        const dc = Math.round((8 * (ycc[c] - 128)) / cuantizador);
        const diferencia = dc - previo[c];
        previo[c] = dc;

        const dcCodigos =
          c === 0 ? CODIGOS.dcLuminancia : CODIGOS.dcCrominancia;
        const acCodigos =
          c === 0 ? CODIGOS.acLuminancia : CODIGOS.acCrominancia;
        const n = categoria(diferencia);
        const { codigo, largo } = dcCodigos.get(n);
        bits.escribir(codigo, largo);
        // Los negativos se codifican como (valor − 1) en n bits (complemento a uno de la magnitud).
        if (n > 0)
          bits.escribir(
            diferencia < 0 ? diferencia + (1 << n) - 1 : diferencia,
            n,
          );
        const fin = acCodigos.get(0x00); // EOB: el resto de los 63 coeficientes AC es cero
        bits.escribir(fin.codigo, fin.largo);
      }
    }
  }

  const sof = Buffer.alloc(15);
  sof[0] = 8; // precisión
  sof.writeUInt16BE(alto, 1);
  sof.writeUInt16BE(ancho, 3);
  sof[5] = 3;
  sof.set([1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1], 6); // Y, Cb, Cr sin submuestreo, tablas Q 0/1/1

  return Buffer.concat([
    segmento(
      0xdb,
      Buffer.concat([
        tablaDeCuantizacion(0, Q_LUMINANCIA),
        tablaDeCuantizacion(1, Q_CROMINANCIA),
      ]),
    ),
    segmento(0xc0, sof),
    segmento(
      0xc4,
      Buffer.concat([
        tablaDeHuffman(0x00, DC_LUMINANCIA),
        tablaDeHuffman(0x10, AC_LUMINANCIA),
        tablaDeHuffman(0x01, DC_CROMINANCIA),
        tablaDeHuffman(0x11, AC_CROMINANCIA),
      ]),
    ),
    segmento(0xda, Buffer.from([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0])),
    bits.cerrar(),
  ]);
}

/**
 * Genera un JPEG con metadatos falsos.
 *
 * @param {{ semilla: number, ancho?: number, alto?: number, orientacion?: number }} opciones
 * @returns {{ bytes: Buffer, centinelas: string[], detalle: import("./comun.mjs").DetalleDeImagen & { orientacion: number } }}
 *   `centinelas`: las cadenas escondidas en los metadatos (todas ≥ 6 caracteres, ninguna en los
 *   píxeles). `detalle`: los valores principales, por si un test quiere compararlos.
 */
export function generarJpeg({
  semilla,
  ancho = 64,
  alto = 48,
  orientacion = 6,
}) {
  if (
    !Number.isInteger(ancho) ||
    !Number.isInteger(alto) ||
    ancho < 1 ||
    alto < 1 ||
    ancho > 4096 ||
    alto > 4096
  ) {
    throw new Error(
      `dimensiones fuera de rango: ${String(ancho)}×${String(alto)} (de 1 a 4096)`,
    );
  }
  const ficha = crearFicha(semilla);
  const registro = crearRegistro();

  // La miniatura del IFD1: un JPEG completo de 8×8 (un solo bloque), del primer color de la paleta.
  const miniatura = Buffer.concat([
    SOI,
    codificarImagen(8, 8, () => BANDAS[0]),
    EOI,
  ]);

  const exif = construirExif(ficha, registro, {
    completo: true,
    orientacion,
    ancho,
    alto,
    miniatura,
  });

  const f = ficha.fechas;
  const xmp = construirXmp({
    atributos: [
      ["xmpMM", "DocumentID", registro.agregar(ficha.ids.documento)],
      ["xmpMM", "InstanceID", registro.agregar(ficha.ids.instancia)],
      ["xmpMM", "OriginalDocumentID", registro.agregar(ficha.ids.original)],
    ],
    elementos: [
      ["dc", "creator", { seq: [registro.agregar(ficha.autor.completo)] }],
      ["dc", "description", { alt: registro.agregar(ficha.descripcion) }],
      ["dc", "rights", { alt: registro.agregar(ficha.derechos) }],
      ["xmp", "CreatorTool", registro.agregar(ficha.software)],
      ["xmp", "CreateDate", registro.agregar(f.captura.iso)],
      ["xmp", "ModifyDate", registro.agregar(f.modificada.iso)],
      ["photoshop", "City", registro.agregar(ficha.municipio)],
      ["exif", "GPSLatitude", registro.agregar(ficha.gps.latXmp)],
      ["exif", "GPSLongitude", registro.agregar(ficha.gps.lonXmp)],
      [
        "exifEX",
        "CameraOwnerName",
        registro.agregar(ficha.propietario.completo),
      ],
      ["exifEX", "BodySerialNumber", registro.agregar(ficha.serie)],
      [
        "Iptc4xmpCore",
        "CreatorContactInfo",
        {
          crudo: `<Iptc4xmpCore:CiEmailWork>${registro.agregar(ficha.correo)}</Iptc4xmpCore:CiEmailWork>`,
        },
      ],
    ],
  });

  const iptc = construirApp13Iptc([
    [1, 90, Buffer.from([0x1b, 0x25, 0x47])], // juego de caracteres codificado: UTF-8
    [2, 0, Buffer.from([0x00, 0x02])], // versión del registro
    [2, 55, f.captura.iptc],
    [2, 80, registro.agregar(ficha.autor.completo)], // By-line
    [2, 90, registro.agregar(ficha.municipio)], // City
    [2, 116, registro.agregar(ficha.derechos)], // Copyright Notice
    [2, 120, registro.agregar(ficha.pie)], // Caption-Abstract
  ]);

  const jfif = Buffer.from([
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48,
    0x00, 0x00,
  ]);
  const resto = Buffer.from(`${registro.agregar(ficha.resto)}\n`, "latin1");

  const bytes = Buffer.concat([
    SOI,
    segmento(0xe0, jfif),
    segmento(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), exif])),
    segmento(
      0xe1,
      Buffer.concat([
        Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"),
        xmp,
      ]),
    ),
    segmento(0xed, iptc),
    segmento(
      0xfe,
      Buffer.from(registro.agregar(ficha.comentarioDeCampo), "latin1"),
    ),
    codificarImagen(ancho, alto, (fila, filas) => bandaDeFila(fila, filas)),
    EOI,
    resto,
  ]);

  return {
    bytes,
    centinelas: registro.lista,
    detalle: {
      autor: ficha.autor.completo,
      cedula: ficha.cedula,
      latitud: ficha.gps.latitud,
      longitud: ficha.gps.longitud,
      correo: ficha.correo,
      serie: ficha.serie,
      orientacion,
      ancho,
      alto,
    },
  };
}
