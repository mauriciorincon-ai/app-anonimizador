// WebP sintético con metadatos falsos — para probar la limpieza, no para parecer una foto.
//
// Un WebP válido en formato EXTENDIDO (`VP8X`) cuya imagen es un VP8L (lossless) de UN SOLO COLOR,
// escrito a mano: con un único símbolo por código de prefijo, los píxeles cuestan cero bits, así
// que el flujo entero son unos pocos bytes (WebP Lossless Bitstream, «simple code length code»).
// Después de la imagen vienen los trozos `EXIF` (TIFF con autoría con cédula y GPS) y `XMP `, y
// después del RIFF, bytes sobrantes con una marca reconocible.

import {
  BANDAS,
  construirExif,
  construirXmp,
  crearFicha,
  crearRegistro,
} from "./comun.mjs";

/** Escritor de bits LSB primero, el orden del flujo VP8L. */
class EscritorDeBitsLsb {
  constructor() {
    this.bytes = [];
    this.acumulado = 0;
    this.cuenta = 0;
  }

  escribir(valor, largo) {
    for (let i = 0; i < largo; i++) {
      this.acumulado |= ((valor >> i) & 1) << this.cuenta;
      this.cuenta++;
      if (this.cuenta === 8) {
        this.bytes.push(this.acumulado);
        this.acumulado = 0;
        this.cuenta = 0;
      }
    }
  }

  cerrar() {
    if (this.cuenta > 0) this.bytes.push(this.acumulado);
    return Buffer.from(this.bytes);
  }
}

/** Un código de prefijo «simple» de un solo símbolo de 8 bits: ocupa 11 bits y los píxeles, ninguno. */
function codigoDeUnSimbolo(bits, simbolo) {
  bits.escribir(1, 1); // simple_code_length_code
  bits.escribir(0, 1); // num_symbols − 1 = 0: un solo símbolo
  bits.escribir(1, 1); // is_first_8bits
  bits.escribir(simbolo, 8);
}

/**
 * El flujo VP8L de una imagen plana de un color ARGB opaco.
 * Cabecera: firma 0x2F, ancho−1 (14 bits), alto−1 (14), alpha_is_used (1), versión 0 (3 bits).
 */
function flujoVp8l(ancho, alto, [r, g, b]) {
  if (ancho > 16384 || alto > 16384)
    throw new Error("VP8L admite hasta 16384 píxeles por lado");
  const bits = new EscritorDeBitsLsb();
  bits.escribir(0x2f, 8);
  bits.escribir(ancho - 1, 14);
  bits.escribir(alto - 1, 14);
  bits.escribir(0, 1); // alpha_is_used
  bits.escribir(0, 3); // versión
  bits.escribir(0, 1); // sin transformaciones
  bits.escribir(0, 1); // sin caché de color
  bits.escribir(0, 1); // sin imagen de meta-prefijos: un solo grupo de códigos
  codigoDeUnSimbolo(bits, g); // verde + longitud de retroreferencia + caché
  codigoDeUnSimbolo(bits, r);
  codigoDeUnSimbolo(bits, b);
  codigoDeUnSimbolo(bits, 255); // alfa opaco
  // Distancia: el símbolo 0, en su forma corta (1 bit).
  bits.escribir(1, 1);
  bits.escribir(0, 1);
  bits.escribir(0, 1); // is_first_8bits = 0: el símbolo cabe en 1 bit
  bits.escribir(0, 1);
  return bits.cerrar();
}

/** Un trozo RIFF: cuatro letras, tamaño LE, datos y un byte de relleno si el tamaño es impar. */
function trozo(tipo, datos) {
  const cabecera = Buffer.alloc(8);
  cabecera.write(tipo, 0, "latin1");
  cabecera.writeUInt32LE(datos.length, 4);
  return Buffer.concat([
    cabecera,
    datos,
    datos.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
}

/**
 * Genera un WebP con metadatos falsos.
 *
 * @param {{ semilla: number, ancho?: number, alto?: number }} opciones
 * @returns {{ bytes: Buffer, centinelas: string[], detalle: import("./comun.mjs").DetalleDeImagen }}
 */
export function generarWebp({ semilla, ancho = 64, alto = 48 }) {
  if (
    !Number.isInteger(ancho) ||
    !Number.isInteger(alto) ||
    ancho < 1 ||
    alto < 1 ||
    ancho > 16384 ||
    alto > 16384
  ) {
    throw new Error(
      `dimensiones fuera de rango: ${String(ancho)}×${String(alto)} (de 1 a 16384)`,
    );
  }
  const ficha = crearFicha(semilla);
  const registro = crearRegistro();

  const exif = construirExif(ficha, registro, { completo: false });
  const xmp = construirXmp({
    elementos: [
      ["dc", "creator", { seq: [registro.agregar(ficha.autor.completo)] }],
      ["dc", "description", { alt: registro.agregar(ficha.descripcion) }],
      ["xmp", "CreatorTool", registro.agregar(ficha.software)],
      ["xmp", "CreateDate", registro.agregar(ficha.fechas.captura.iso)],
      ["xmpMM", "DocumentID", registro.agregar(ficha.ids.documento)],
      ["xmpMM", "InstanceID", registro.agregar(ficha.ids.instancia)],
      ["photoshop", "City", registro.agregar(ficha.municipio)],
      ["exif", "GPSLatitude", registro.agregar(ficha.gps.latXmp)],
      ["exif", "GPSLongitude", registro.agregar(ficha.gps.lonXmp)],
    ],
  });
  registro.agregar(ficha.gps.latitud);
  registro.agregar(ficha.gps.longitud);

  // VP8X: banderas (EXIF 0x08 | XMP 0x04), tres bytes reservados y el lienzo (ancho−1, alto−1) en 24 bits.
  const extendido = Buffer.alloc(10);
  extendido[0] = 0x08 | 0x04;
  extendido.writeUIntLE(ancho - 1, 4, 3);
  extendido.writeUIntLE(alto - 1, 7, 3);

  const trozos = Buffer.concat([
    trozo("VP8X", extendido),
    trozo("VP8L", flujoVp8l(ancho, alto, BANDAS[0])),
    trozo("EXIF", exif),
    trozo("XMP ", xmp),
  ]);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(4 + trozos.length, 4);
  riff.write("WEBP", 8, "latin1");

  const bytes = Buffer.concat([
    riff,
    trozos,
    Buffer.from(`${registro.agregar(ficha.resto)}\n`, "latin1"),
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
      ancho,
      alto,
    },
  };
}
