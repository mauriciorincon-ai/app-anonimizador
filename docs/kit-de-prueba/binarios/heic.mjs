// HEIC sintético con metadatos falsos — para probar la limpieza, no para parecer una foto.
//
// Los píxeles no se inventan: un flujo HEVC no se escribe a mano como un VP8L de un color. Salen de
// `base.heic`, una imagen de cuatro bandas de color plano hecha UNA vez con `sips` en un Mac y
// versionada junto a su `.meta.json` (cómo se hizo, fecha y sha256): la CI es Linux y no escribe HEIC.
// De ahí se toman el flujo HEVC y sus propiedades (`hvcC`, `ispe`, `colr`, `irot`, `pixi`); TODO lo
// demás —la estructura entera del contenedor y cada metadato— se escribe aquí, a mano:
//
//   · un elemento `Exif` (con los 4 bytes de desplazamiento y `Exif\0\0`, como lo guarda Apple) con
//     autoría, cédula sintética y GPS;
//   · un elemento `mime` XMP con creador, programa, fechas e identificadores;
//   · una miniatura (`thmb`) que reutiliza el mismo flujo HEVC;
//   · una propiedad `udes` (descripción de usuario) con nombre y descripción;
//   · nombres de elemento y de `hdlr` con texto;
//   · una caja `free` con texto, bytes que ningún elemento usa dentro de `mdat`, y bytes sobrantes
//     después de la última caja.
//
// El archivo es un HEIC válido: Vista Previa lo abre (cuatro bandas de color), aunque un navegador
// no lo muestre.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  construirExif,
  construirXmp,
  crearFicha,
  crearRegistro,
} from "./comun.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_BASE = join(AQUI, "base.heic");
const META_BASE = JSON.parse(
  readFileSync(join(AQUI, "base.heic.meta.json"), "utf8"),
);

/** Cajas hijas entre `desde` y `hasta` de un búfer (sin tamaños de 64 bits más allá de 4 GiB). */
function cajas(b, desde, hasta) {
  const lista = [];
  for (let p = desde; p < hasta; ) {
    let tamano = b.readUInt32BE(p);
    const tipo = b.toString("latin1", p + 4, p + 8);
    let datos = p + 8;
    if (tamano === 1) {
      tamano = b.readUInt32BE(p + 12);
      datos = p + 16;
    } else if (tamano === 0) tamano = hasta - p;
    lista.push({ tipo, desde: p, datos, hasta: p + tamano });
    p += tamano;
  }
  return lista;
}

/** Lo que se toma de `base.heic`: el flujo HEVC del elemento primario y sus propiedades. */
function leerBase() {
  const b = readFileSync(RUTA_BASE);
  const huella = createHash("sha256").update(b).digest("hex");
  if (huella !== META_BASE.sha256)
    throw new Error(
      `base.heic no coincide con su .meta.json (${huella} ≠ ${META_BASE.sha256})`,
    );
  const meta = cajas(b, 0, b.length).find((c) => c.tipo === "meta");
  const hijos = cajas(b, meta.datos + 4, meta.hasta);
  const iprp = hijos.find((c) => c.tipo === "iprp");
  const ipco = cajas(b, iprp.datos, iprp.hasta).find((c) => c.tipo === "ipco");
  const propiedades = Object.fromEntries(
    cajas(b, ipco.datos, ipco.hasta).map((c) => [
      c.tipo,
      b.subarray(c.desde, c.hasta),
    ]),
  );
  // `iloc` de la base: versión 0, desplazamiento y largo de 4 bytes, un elemento, una extensión.
  const iloc = hijos.find((c) => c.tipo === "iloc");
  const tamanos = b.readUInt16BE(iloc.datos + 4);
  if (tamanos !== 0x4400 || b.readUInt16BE(iloc.datos + 6) !== 1)
    throw new Error("base.heic: iloc con una forma que este generador no espera");
  const desplazamiento = b.readUInt32BE(iloc.datos + 14);
  const largo = b.readUInt32BE(iloc.datos + 18);
  return { propiedades, hevc: b.subarray(desplazamiento, desplazamiento + largo) };
}

function caja(tipo, ...partes) {
  const cuerpo = Buffer.concat(partes);
  const cabecera = Buffer.alloc(8);
  cabecera.writeUInt32BE(8 + cuerpo.length, 0);
  cabecera.write(tipo, 4, "latin1");
  return Buffer.concat([cabecera, cuerpo]);
}

function completa(version, banderas) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(((version << 24) | banderas) >>> 0, 0);
  return b;
}

const u16 = (v) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v, 0);
  return b;
};
const u32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v, 0);
  return b;
};
const texto = (t) => Buffer.from(`${t}\0`, "utf8");

/** `infe` versión 2: id de 16 bits, sin protección, tipo, nombre y (para `mime`) el tipo de contenido. */
function infe(id, tipo, nombre, contenido) {
  return caja(
    "infe",
    completa(2, 0),
    u16(id),
    u16(0),
    Buffer.from(tipo, "latin1"),
    texto(nombre),
    contenido === undefined ? Buffer.alloc(0) : texto(contenido),
  );
}

/**
 * Genera un HEIC con metadatos falsos.
 *
 * @param {{ semilla: number }} opciones
 * @returns {{ bytes: Buffer, centinelas: string[], detalle: import("./comun.mjs").DetalleDeImagen }}
 */
export function generarHeic({ semilla }) {
  const { propiedades, hevc } = leerBase();
  const ficha = crearFicha(semilla);
  const registro = crearRegistro();

  const tiff = construirExif(ficha, registro, { completo: false });
  // ISO/IEC 23008-12, A.2.1: 4 bytes con el desplazamiento hasta la cabecera TIFF; Apple pone
  // `Exif\0\0` en medio y el desplazamiento vale 6.
  const exif = Buffer.concat([u32(6), Buffer.from("Exif\0\0", "latin1"), tiff]);
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

  // Texto libre en sitios que no son EXIF ni XMP: también tiene que irse.
  const nombreDelElemento = registro.agregar(`Foto de ${ficha.autor.completo}`);
  const nombreDelManejador = registro.agregar(ficha.software);
  const udes = caja(
    "udes",
    completa(0, 0),
    texto("es-CO"),
    texto(registro.agregar(ficha.derechos)),
    texto(registro.agregar(ficha.comentarioDeUsuario)),
    texto("velo,sintetico"),
  );
  const libre = Buffer.from(registro.agregar(ficha.notaDeFabricante), "latin1");
  const sinUso = Buffer.from(
    `${registro.agregar(`MDAT-SIN-USO-${ficha.serie}`)}\n`,
    "latin1",
  );

  // Propiedades: 1 hvcC · 2 ispe · 3 colr · 4 irot · 5 pixi · 6 udes. Las esenciales llevan 0x80.
  const ipco = caja(
    "ipco",
    propiedades.hvcC,
    propiedades.ispe,
    propiedades.colr,
    propiedades.irot,
    propiedades.pixi,
    udes,
  );
  const asociar = (id, indices) =>
    Buffer.concat([u16(id), Buffer.from([indices.length, ...indices])]);
  const ipma = caja(
    "ipma",
    completa(0, 0),
    u32(2),
    asociar(1, [0x81, 0x02, 0x03, 0x84, 0x05, 0x06]),
    asociar(4, [0x81, 0x02, 0x03, 0x84, 0x05]),
  );

  // Elementos: 1 la imagen · 2 Exif · 3 XMP · 4 la miniatura (el mismo flujo, otra copia).
  const datos = [
    { id: 1, bytes: hevc },
    { id: 2, bytes: exif },
    { id: 3, bytes: xmp },
    { id: 4, bytes: hevc },
  ];

  const ftyp = caja(
    "ftyp",
    Buffer.from("heic", "latin1"),
    u32(0),
    Buffer.from("mif1heicmiaf", "latin1"),
  );
  const metaCon = (base) => {
    let p = base;
    const extensiones = [];
    for (const d of datos) {
      extensiones.push(Buffer.concat([u16(d.id), u16(0), u16(1), u32(p), u32(d.bytes.length)]));
      p += d.bytes.length;
    }
    return caja(
      "meta",
      completa(0, 0),
      caja(
        "hdlr",
        completa(0, 0),
        u32(0),
        Buffer.from("pict", "latin1"),
        Buffer.alloc(12),
        texto(nombreDelManejador),
      ),
      caja("dinf", caja("dref", completa(0, 0), u32(1), caja("url ", completa(0, 1)))),
      caja("pitm", completa(0, 0), u16(1)),
      caja(
        "iinf",
        completa(0, 0),
        u16(4),
        infe(1, "hvc1", nombreDelElemento),
        infe(2, "Exif", ""),
        infe(3, "mime", "", "application/rdf+xml"),
        infe(4, "hvc1", ""),
      ),
      caja(
        "iref",
        completa(0, 0),
        caja("cdsc", u16(2), u16(1), u16(1)),
        caja("cdsc", u16(3), u16(1), u16(1)),
        caja("thmb", u16(4), u16(1), u16(1)),
      ),
      caja("iprp", ipco, ipma),
      caja("iloc", completa(0, 0), u16(0x4400), u16(datos.length), ...extensiones),
    );
  };

  // La `meta` no cambia de tamaño con los desplazamientos: se mide con 0 y se escribe de verdad.
  const cajaLibre = caja("free", libre);
  const antesDelMdat = ftyp.length + metaCon(0).length + cajaLibre.length;
  const meta = metaCon(antesDelMdat + 8);
  const mdat = caja("mdat", ...datos.map((d) => d.bytes), sinUso);

  const bytes = Buffer.concat([
    ftyp,
    meta,
    cajaLibre,
    mdat,
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
      ancho: 64,
      alto: 48,
    },
  };
}
