// PNG sintético con metadatos falsos — para probar la limpieza, no para parecer una foto.
//
// Un PNG válido (RGB de 8 bits, bandas de color planas, píxeles sin compresión para que los bytes
// no dependan de la versión de zlib) con todo lo que un PNG puede esconder fuera de la imagen:
// `pHYs`, `tIME`, `eXIf` (TIFF con autoría con cédula y GPS), `tEXt` (Author, Comment, Software,
// Creation Time), `iTXt` con el paquete XMP, un `zTXt` COMPRIMIDO (su centinela no se ve en claro:
// hay que inflarlo para encontrarlo) y bytes sobrantes después de `IEND`.

import { deflateSync } from "node:zlib";

import {
  bandaDeFila,
  construirExif,
  construirXmp,
  crc32,
  crearFicha,
  crearRegistro,
  zlibAlmacenado,
} from "./comun.mjs";

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Un trozo PNG: largo, tipo, datos y CRC-32 de tipo + datos. */
function trozo(tipo, datos) {
  const cabecera = Buffer.alloc(8);
  cabecera.writeUInt32BE(datos.length, 0);
  cabecera.write(tipo, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([cabecera.subarray(4), datos])));
  return Buffer.concat([cabecera, datos, crc]);
}

const nulo = Buffer.alloc(1);

/** `tEXt`: palabra clave y texto, los dos en Latin-1 (aquí todo es ASCII). */
function texto(clave, valor) {
  return trozo(
    "tEXt",
    Buffer.concat([
      Buffer.from(clave, "latin1"),
      nulo,
      Buffer.from(valor, "latin1"),
    ]),
  );
}

/** `iTXt` sin comprimir: clave, banderas, idioma vacío, clave traducida vacía y el texto en UTF-8. */
function textoInternacional(clave, valor) {
  return trozo(
    "iTXt",
    Buffer.concat([
      Buffer.from(clave, "latin1"),
      nulo,
      Buffer.from([0, 0]),
      nulo,
      nulo,
      Buffer.from(valor),
    ]),
  );
}

/** `zTXt`: clave, método 0 (deflate) y el texto comprimido de verdad. */
function textoComprimido(clave, valor) {
  return trozo(
    "zTXt",
    Buffer.concat([
      Buffer.from(clave, "latin1"),
      nulo,
      Buffer.from([0]),
      deflateSync(Buffer.from(valor, "latin1"), { level: 9 }),
    ]),
  );
}

/**
 * Genera un PNG con metadatos falsos.
 *
 * @param {{ semilla: number, ancho?: number, alto?: number }} opciones
 * @returns {{ bytes: Buffer, centinelas: string[], detalle: import("./comun.mjs").DetalleDeImagen }}
 */
export function generarPng({ semilla, ancho = 64, alto = 48 }) {
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

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, filtro 0, sin entrelazado

  const resolucion = Buffer.alloc(9);
  resolucion.writeUInt32BE(2835, 0); // 72 ppp en píxeles por metro
  resolucion.writeUInt32BE(2835, 4);
  resolucion[8] = 1;

  const { y, m, d, h, mi, s } = ficha.fechas.crudas.modificada;
  const tiempo = Buffer.alloc(7);
  tiempo.writeUInt16BE(y, 0);
  tiempo.set([m, d, h, mi, s], 2);

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

  // Píxeles: cada fila lleva delante su byte de filtro (0 = ninguno).
  const filas = Math.ceil(alto / 8);
  const crudo = Buffer.alloc((1 + 3 * ancho) * alto);
  for (let fila = 0; fila < alto; fila++) {
    const color = bandaDeFila(Math.floor(fila / 8), filas);
    const inicio = fila * (1 + 3 * ancho);
    for (let x = 0; x < ancho; x++) crudo.set(color, inicio + 1 + 3 * x);
  }

  const bytes = Buffer.concat([
    FIRMA,
    trozo("IHDR", ihdr),
    trozo("pHYs", resolucion),
    trozo("tIME", tiempo),
    trozo("eXIf", exif),
    texto("Author", registro.agregar(ficha.autor.completo)),
    texto("Comment", registro.agregar(`Contacto: ${ficha.correo}`)),
    texto("Software", registro.agregar(ficha.software)),
    texto("Creation Time", registro.agregar(ficha.fechas.captura.iso)),
    textoInternacional("XML:com.adobe.xmp", xmp.toString("utf8")),
    textoComprimido(
      "Description",
      registro.agregar(ficha.descripcionComprimida),
    ),
    trozo("IDAT", zlibAlmacenado(crudo)),
    trozo("IEND", Buffer.alloc(0)),
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
