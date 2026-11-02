// Piezas comunes de los generadores de binarios del kit (JPEG, PNG, WebP y PDF).
//
// Regla dura nº5: el repo es público y aquí no entra un dato real. Todo lo que estos archivos
// llevan sale del PRNG con semilla de `azar.mjs`: las personas son combinaciones de palabras de uso
// común, las cédulas son números sorteados sin dueño, las coordenadas caen dentro de Colombia sin
// corresponder a un lugar concreto. Misma semilla ⇒ mismos bytes, en cada máquina y en cada corrida.
//
// Para qué sirven estos archivos: para probar la LIMPIEZA DE METADATOS. Por eso cada generador
// devuelve, además de los bytes, la lista exacta de cadenas «centinela» que dejó escondidas: el
// test las busca en la salida del limpiador y afirma que ya no están. Un centinela debe poder
// encontrarse como bytes (≥ 6 caracteres, para que no aparezca por azar) y no debe existir en el
// contenido visible: la imagen o el texto de la página.

import { Buffer } from "node:buffer";

import {
  APELLIDOS,
  DOMINIOS,
  MUNICIPIOS,
  NOMBRES,
  cedula,
  crearAzar,
} from "./azar.mjs";

/**
 * Lo que un generador de imagen declara de lo que escondió, por si un test quiere compararlo con lo
 * que lee el limpiador (coordenadas con seis decimales, nombre y cédula inventados, serie del cuerpo).
 * @typedef {{ autor: string, cedula: string, latitud: string, longitud: string, correo: string,
 *   serie: string, ancho: number, alto: number }} DetalleDeImagen
 */

/**
 * @typedef {{ autor: string, autorDeLaRevisionDos: string | null, cedula: string, correo: string,
 *   perfil: string, revisiones: number }} DetalleDePdf
 */

// ── Centinelas ────────────────────────────────────────────────────────────────────────────────

export const LARGO_MINIMO_DE_CENTINELA = 6;

/**
 * Registro de lo que un generador esconde. Cada valor se registra AL INSERTARLO: la lista de
 * centinelas es, por construcción, lo que de verdad está en los bytes, ni más ni menos.
 */
export function crearRegistro() {
  const lista = [];
  return {
    lista,
    /** Registra un valor y lo devuelve, para usarlo en línea: `ascii(tag, reg.agregar(valor))`. */
    agregar(texto) {
      if (
        typeof texto !== "string" ||
        texto.length < LARGO_MINIMO_DE_CENTINELA
      ) {
        throw new Error(
          `centinela demasiado corto (mínimo ${LARGO_MINIMO_DE_CENTINELA}): «${String(texto)}»`,
        );
      }
      if (!lista.includes(texto)) lista.push(texto);
      return texto;
    },
  };
}

/**
 * ¿Aparece el centinela en los bytes, en alguna de las codificaciones en que un formato puede haberlo
 * guardado? UTF-8 (EXIF, XMP, IPTC, iTXt), Latin-1 (tEXt, cadenas de PDF) y UTF-16 (cadenas de PDF
 * con BOM). Es la comprobación que debe usar quien afirme que un metadato «ya no está»: buscar en
 * una sola codificación dejaría pasar la que no miró.
 */
export function contieneCentinela(bytes, centinela) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const utf16le = Buffer.from(centinela, "utf16le");
  const utf16be = Buffer.from(utf16le).swap16();
  return (
    buffer.includes(Buffer.from(centinela, "utf8")) ||
    buffer.includes(Buffer.from(centinela, "latin1")) ||
    buffer.includes(utf16le) ||
    buffer.includes(utf16be)
  );
}

// ── Sumas de comprobación y compresión ────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

/** CRC-32 de ISO 3309 / PNG (polinomio 0xEDB88320). */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 de RFC 1950. */
export function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Un flujo zlib válido SIN comprimir (bloques «stored» de RFC 1951). Se escribe a mano, y no con
 * `zlib.deflateSync`, para que los píxeles del PNG sean idénticos byte por byte en cualquier versión
 * de Node: la salida de un compresor puede cambiar entre versiones de zlib, y el kit promete lo
 * contrario. (El `zTXt` sí usa `deflateSync`: ahí la gracia es que el centinela NO se vea en claro.)
 */
export function zlibAlmacenado(datos) {
  const partes = [Buffer.from([0x78, 0x01])];
  let inicio = 0;
  do {
    const largo = Math.min(65535, datos.length - inicio);
    const ultimo = inicio + largo >= datos.length ? 1 : 0;
    const cabecera = Buffer.alloc(5);
    cabecera[0] = ultimo; // BFINAL; BTYPE = 00 (sin comprimir)
    cabecera.writeUInt16LE(largo, 1);
    cabecera.writeUInt16LE(~largo & 0xffff, 3);
    partes.push(cabecera, datos.subarray(inicio, inicio + largo));
    inicio += largo;
  } while (inicio < datos.length);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(adler32(datos));
  partes.push(suma);
  return Buffer.concat(partes);
}

// ── Píxeles: unas bandas de color para que la imagen se reconozca ─────────────────────────────

/** Cuatro bandas horizontales (rojo, amarillo, verde, azul). Son el «contenido» que no se limpia. */
export const BANDAS = [
  [200, 40, 40],
  [240, 200, 30],
  [40, 160, 70],
  [40, 90, 200],
];

/**
 * El color de una fila de BLOQUES de 8 píxeles. Todos los formatos de imagen reparten las bandas por
 * fila de bloque, así que el mismo ancho y alto dan las mismas bandas en JPEG, PNG y WebP.
 */
export function bandaDeFila(filaDeBloque, filasDeBloques) {
  const indice = Math.floor((filaDeBloque * BANDAS.length) / filasDeBloques);
  return BANDAS[Math.min(indice, BANDAS.length - 1)];
}

// ── La ficha: una persona y un hecho inventados, con todos los datos que un archivo suele filtrar ──

export const sinTildes = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

const MUNICIPIOS_LARGOS = MUNICIPIOS.map(sinTildes).filter(
  (m) => m.length >= 6,
);
const FABRICANTES = [
  "Camaras Ficticias",
  "OpticaSintetica",
  "Lentes del Ejemplo",
];
const dos = (n) => String(n).padStart(2, "0");

function hexadecimal(azar, largo) {
  let texto = "";
  for (let i = 0; i < largo; i++)
    texto += "0123456789abcdef"[azar.entero(0, 15)];
  return texto;
}

function uuid(azar) {
  const h = hexadecimal(azar, 32);
  const variante = "89ab"[azar.entero(0, 3)];
  return `uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function fechaSintetica(azar, anioMin, anioMax) {
  return {
    y: azar.entero(anioMin, anioMax),
    m: azar.entero(1, 12),
    d: azar.entero(1, 28),
    h: azar.entero(6, 20),
    mi: azar.entero(0, 59),
    s: azar.entero(0, 59),
  };
}

/** La misma fecha en las cuatro formas en que la escriben los formatos. */
export function formasDeFecha({ y, m, d, h, mi, s }) {
  return {
    exif: `${y}:${dos(m)}:${dos(d)} ${dos(h)}:${dos(mi)}:${dos(s)}`,
    iso: `${y}-${dos(m)}-${dos(d)}T${dos(h)}:${dos(mi)}:${dos(s)}-05:00`,
    pdf: `D:${y}${dos(m)}${dos(d)}${dos(h)}${dos(mi)}${dos(s)}-05'00'`,
    iptc: `${y}${dos(m)}${dos(d)}`,
  };
}

/**
 * Todo lo que el kit inventa para una semilla. El ORDEN de los sorteos es contrato: añadir un
 * campo se hace SIEMPRE al final, porque intercalarlo cambiaría los valores de todos los de abajo
 * (y con ellos los bytes de todos los fixtures de la semilla).
 *
 * Las personas salen sin tildes a propósito: un metadato así escrito se encuentra como bytes con un
 * `Buffer.includes` simple en cualquier formato, sin discutir si el contenedor era Latin-1 o UTF-8.
 * (La única cadena no ASCII del kit es el « · » de `artistaExif`, que cubre el caso UTF-8.)
 */
export function crearFicha(semilla) {
  const azar = crearAzar(semilla);

  const personas = [];
  const persona = () => {
    let candidata;
    do {
      const nombre = sinTildes(azar.de(NOMBRES));
      const apellido = sinTildes(azar.de(APELLIDOS));
      candidata = {
        nombre,
        apellido,
        completo: `${nombre} ${apellido}`,
        usuario: `${nombre}.${apellido}`.toLowerCase(),
      };
    } while (personas.some((p) => p.completo === candidata.completo));
    personas.push(candidata);
    return candidata;
  };
  // Cuatro personas distintas: quien firma, el dueño de la cámara, quien revisó y quien comentó.
  const autor = persona();
  const propietario = persona();
  const revisor = persona();
  const comentarista = persona();

  const cedulaDelAutor = cedula(azar, 0);
  const correo = `${autor.usuario}${azar.entero(1, 99)}@${azar.de(DOMINIOS)}`;
  const municipio = azar.de(MUNICIPIOS_LARGOS);

  // GPS dentro de Colombia (lat 1°–11° N, lon 72°–78° O), con segundos en milésimas. Se sortea en
  // grados, minutos y segundos —como lo guarda EXIF— y de ahí sale el decimal con seis cifras.
  const latG = azar.entero(1, 11);
  const latM = azar.entero(0, 59);
  const latS = azar.entero(0, 59_999);
  const lonG = azar.entero(72, 78);
  const lonM = azar.entero(0, 59);
  const lonS = azar.entero(0, 59_999);
  const altitud = azar.entero(0, 3200);
  const latitud = (latG + latM / 60 + latS / 3_600_000).toFixed(6);
  const longitud = (-(lonG + lonM / 60 + lonS / 3_600_000)).toFixed(6);
  const gps = {
    latG,
    latM,
    latS,
    lonG,
    lonM,
    lonS,
    altitud,
    latitud,
    longitud,
    // Forma de XMP (exif:GPSLatitude): grados, minutos decimales y hemisferio.
    latXmp: `${latG},${(latM + latS / 60_000).toFixed(6)}N`,
    lonXmp: `${lonG},${(lonM + lonS / 60_000).toFixed(6)}W`,
  };

  const captura = fechaSintetica(azar, 2018, 2025);
  const modificada = fechaSintetica(azar, 2026, 2026);
  const fechas = {
    captura: formasDeFecha(captura),
    modificada: formasDeFecha(modificada),
    crudas: { captura, modificada },
  };

  const fabricante = azar.de(FABRICANTES);
  const modelo = `FF-${azar.entero(1000, 9999)}`;
  const software = `EditorFicticio ${azar.entero(2, 9)}.${azar.entero(0, 9)}.${azar.entero(0, 9)}`;
  const serie = `VS${azar.digitos(10)}`;
  const idUnico = hexadecimal(azar, 32);
  const ids = {
    documento: uuid(azar),
    instancia: uuid(azar),
    original: uuid(azar),
    instancia2: uuid(azar),
  };
  const expediente = `EXP-${azar.digitos(6)}`;
  const resto = `RESTO-DE-EDICION-${hexadecimal(azar, 8)}`;
  const notaDeFabricante = `MNOTE-${hexadecimal(azar, 8)}`;
  const bytesAleatorios = Buffer.from(
    Array.from({ length: 16 }, () => azar.entero(0, 255)),
  );

  // Para el PDF: identificadores del documento, ruta de origen, versiones y los dos campos de
  // la estructura de cifrado (cadenas arbitrarias: la estructura está, el cifrado no funciona).
  const idA = hexadecimal(azar, 32);
  const idB = hexadecimal(azar, 32);
  const cedulaDelPropietario = cedula(azar, 0);
  const ruta = `/Users/${autor.usuario}/Documentos/informe-${hexadecimal(azar, 6)}.docx`;
  const productorUno = `MotorPdfFicticio ${azar.entero(1, 4)}.${azar.entero(0, 9)}.${azar.entero(0, 9)}`;
  const productorDos = `MotorPdfFicticio ${azar.entero(5, 9)}.${azar.entero(0, 9)}.${azar.entero(0, 9)}`;
  const comentario = `Comentario de revision ${hexadecimal(azar, 6)}`;
  const comentarioRetirado = `Comentario retirado ${hexadecimal(azar, 6)}`;
  const propietarioDeLaClave = hexadecimal(azar, 64);
  const verificadorDeClave = hexadecimal(azar, 64);

  return {
    semilla,
    autor,
    propietario,
    revisor,
    comentarista,
    cedula: cedulaDelAutor,
    cedulaDelPropietario,
    correo,
    municipio,
    gps,
    fechas,
    fabricante,
    modelo,
    software,
    serie,
    idUnico,
    ids,
    expediente,
    resto,
    notaDeFabricante,
    bytesAleatorios,
    idA,
    idB,
    ruta,
    productorUno,
    productorDos,
    comentario,
    comentarioRetirado,
    propietarioDeLaClave,
    verificadorDeClave,
    // Textos compuestos, en un solo sitio para que todos los formatos digan lo mismo.
    artistaExif: `${autor.completo} · CC ${cedulaDelAutor}`,
    autorPdf: `${autor.completo} - CC ${cedulaDelAutor}`,
    autorPdfDos: `${propietario.completo} - CC ${cedulaDelPropietario}`,
    derechos: `Copyright (c) ${captura.y} ${autor.completo}`,
    descripcion: `Punto de control ${gps.latitud},${gps.longitud}`,
    pie: `Inspeccion en ${municipio} expediente ${expediente}`,
    comentarioDeCampo: `Notas de campo ${expediente}, contacto ${correo}`,
    comentarioDeUsuario: `Revisado por ${revisor.completo} (${expediente})`,
    descripcionComprimida: `Descripcion interna: revisado por ${revisor.completo}, expediente ${expediente}`,
  };
}

// ── TIFF / EXIF ───────────────────────────────────────────────────────────────────────────────
// Little-endian («II»). Los valores de hasta 4 bytes van dentro de la entrada; los demás, fuera,
// alineados a 2 bytes. Cada IFD se coloca después del anterior, así que las posiciones se calculan
// antes de escribir y los punteros (ExifIFD, GPS, miniatura) se rellenan con ellas.

const TAMANO_DE_TIPO = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 };

export const entrada = {
  byte: (tag, valores) => ({ tag, tipo: 1, datos: Buffer.from(valores) }),
  /** Texto terminado en NUL, en UTF-8 (en ASCII puro, lo que dice la norma, salvo « · »). */
  ascii: (tag, texto) => ({
    tag,
    tipo: 2,
    datos: Buffer.concat([Buffer.from(texto, "utf8"), Buffer.alloc(1)]),
  }),
  corto: (tag, valor) => {
    const datos = Buffer.alloc(2);
    datos.writeUInt16LE(valor);
    return { tag, tipo: 3, datos };
  },
  largo: (tag, valor) => {
    const datos = Buffer.alloc(4);
    datos.writeUInt32LE(valor);
    return { tag, tipo: 4, datos };
  },
  /** Racionales sin signo: `[[numerador, denominador], …]`. */
  racional: (tag, pares) => {
    const datos = Buffer.alloc(8 * pares.length);
    pares.forEach(([n, d], i) => {
      datos.writeUInt32LE(n, 8 * i);
      datos.writeUInt32LE(d, 8 * i + 4);
    });
    return { tag, tipo: 5, datos };
  },
  indefinido: (tag, datos) => ({ tag, tipo: 7, datos: Buffer.from(datos) }),
  /** Un LONG cuyo valor es la posición de otro IFD; se rellena al colocar los bloques. */
  puntero: (tag, hacia) => ({ tag, tipo: 4, datos: Buffer.alloc(4), hacia }),
};

function tamanoDeIfd(entradas) {
  let fuera = 0;
  for (const { datos } of entradas)
    if (datos.length > 4) fuera += datos.length + (datos.length & 1);
  return 2 + 12 * entradas.length + 4 + fuera;
}

function escribirIfd(entradas, inicio, siguiente, posiciones) {
  const ordenadas = [...entradas].sort((a, b) => a.tag - b.tag);
  const bloque = Buffer.alloc(tamanoDeIfd(ordenadas));
  bloque.writeUInt16LE(ordenadas.length, 0);
  let cursor = 2 + 12 * ordenadas.length + 4;
  ordenadas.forEach((e, i) => {
    const datos = e.hacia ? Buffer.alloc(4) : e.datos;
    if (e.hacia) datos.writeUInt32LE(posiciones[e.hacia]);
    const en = 2 + 12 * i;
    bloque.writeUInt16LE(e.tag, en);
    bloque.writeUInt16LE(e.tipo, en + 2);
    bloque.writeUInt32LE(datos.length / TAMANO_DE_TIPO[e.tipo], en + 4);
    if (datos.length <= 4) {
      datos.copy(bloque, en + 8);
    } else {
      bloque.writeUInt32LE(inicio + cursor, en + 8);
      datos.copy(bloque, cursor);
      cursor += datos.length + (datos.length & 1);
    }
  });
  bloque.writeUInt32LE(siguiente, 2 + 12 * ordenadas.length);
  return bloque;
}

/**
 * Un TIFF completo. `ifd0` son las entradas de la imagen; `exif` y `gps` son sus sub-IFD
 * (opcionales); `miniatura` es un JPEG completo que se coloca al final y se anuncia en el IFD1.
 */
export function construirTiff({ ifd0, exif, gps, miniatura }) {
  const e0 = [...ifd0];
  if (exif) e0.push(entrada.puntero(0x8769, "exif"));
  if (gps) e0.push(entrada.puntero(0x8825, "gps"));
  const e1 = miniatura
    ? [
        entrada.corto(0x0103, 6), // Compression: JPEG
        entrada.puntero(0x0201, "miniatura"),
        entrada.largo(0x0202, miniatura.length),
      ]
    : null;

  const posiciones = { ifd0: 8 };
  posiciones.exif = posiciones.ifd0 + tamanoDeIfd(e0);
  posiciones.gps = posiciones.exif + (exif ? tamanoDeIfd(exif) : 0);
  posiciones.ifd1 = posiciones.gps + (gps ? tamanoDeIfd(gps) : 0);
  posiciones.miniatura = posiciones.ifd1 + (e1 ? tamanoDeIfd(e1) : 0);

  const partes = [
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
    escribirIfd(e0, posiciones.ifd0, e1 ? posiciones.ifd1 : 0, posiciones),
  ];
  if (exif) partes.push(escribirIfd(exif, posiciones.exif, 0, posiciones));
  if (gps) partes.push(escribirIfd(gps, posiciones.gps, 0, posiciones));
  if (e1)
    partes.push(escribirIfd(e1, posiciones.ifd1, 0, posiciones), miniatura);
  return Buffer.concat(partes);
}

/** Entradas del IFD de GPS: versión, hemisferios, latitud y longitud en G/M/S, altitud, hora y fecha. */
function entradasDeGps(ficha) {
  const { gps, fechas } = ficha;
  const { y, m, d, h, mi, s } = fechas.crudas.captura;
  return [
    entrada.byte(0x0000, [2, 3, 0, 0]),
    entrada.ascii(0x0001, "N"),
    entrada.racional(0x0002, [
      [gps.latG, 1],
      [gps.latM, 1],
      [gps.latS, 1000],
    ]),
    entrada.ascii(0x0003, "W"),
    entrada.racional(0x0004, [
      [gps.lonG, 1],
      [gps.lonM, 1],
      [gps.lonS, 1000],
    ]),
    entrada.byte(0x0005, [0]),
    entrada.racional(0x0006, [[gps.altitud * 10, 10]]),
    entrada.racional(0x0007, [
      [h, 1],
      [mi, 1],
      [s, 1],
    ]),
    entrada.ascii(0x001d, `${y}:${dos(m)}:${dos(d)}`),
  ];
}

/**
 * El TIFF de EXIF de una ficha. Todo valor de texto que escribe se registra como centinela.
 * `completo` (solo el JPEG) añade descripción, derechos, resolución, MakerNote, UserComment,
 * dimensiones y la miniatura; sin él, queda lo que suele llevar un PNG o un WebP: autoría, cámara,
 * fechas, serie y GPS.
 */
export function construirExif(
  ficha,
  registro,
  { completo = false, orientacion, ancho, alto, miniatura } = {},
) {
  const f = ficha.fechas;
  const ifd0 = [
    entrada.ascii(0x010f, registro.agregar(ficha.fabricante)),
    entrada.ascii(0x0110, registro.agregar(ficha.modelo)),
    entrada.ascii(0x0131, registro.agregar(ficha.software)),
    entrada.ascii(0x0132, registro.agregar(f.modificada.exif)),
    entrada.ascii(0x013b, registro.agregar(ficha.artistaExif)),
  ];
  registro.agregar(ficha.cedula);
  registro.agregar(ficha.autor.completo);
  const exif = [
    entrada.ascii(0x9003, registro.agregar(f.captura.exif)),
    entrada.ascii(0x9004, f.captura.exif),
    entrada.ascii(0xa420, registro.agregar(ficha.idUnico)),
    entrada.ascii(0xa430, registro.agregar(ficha.propietario.completo)),
    entrada.ascii(0xa431, registro.agregar(ficha.serie)),
  ];

  if (completo) {
    ifd0.push(
      entrada.ascii(0x010e, registro.agregar(ficha.descripcion)),
      entrada.corto(0x0112, orientacion),
      entrada.racional(0x011a, [[72, 1]]),
      entrada.racional(0x011b, [[72, 1]]),
      entrada.corto(0x0128, 2),
      entrada.ascii(0x8298, registro.agregar(ficha.derechos)),
    );
    registro.agregar(ficha.gps.latitud);
    registro.agregar(ficha.gps.longitud);
    // MakerNote: bloque opaco del fabricante. Lleva una marca legible dentro para poder buscarla.
    registro.agregar(ficha.notaDeFabricante);
    const notaDelFabricante = Buffer.concat([
      Buffer.from("VELOSIM\0", "latin1"),
      Buffer.from(`${ficha.notaDeFabricante}\0`, "latin1"),
      ficha.bytesAleatorios,
    ]);
    exif.push(
      entrada.racional(0x829a, [[1, 250]]),
      entrada.racional(0x829d, [[28, 10]]),
      entrada.corto(0x8827, 200),
      entrada.indefinido(0x9000, Buffer.from("0231", "latin1")),
      entrada.indefinido(0x927c, notaDelFabricante),
      // UserComment: 8 bytes de prefijo de codificación («ASCII\0\0\0») y luego el texto.
      entrada.indefinido(
        0x9286,
        Buffer.concat([
          Buffer.from("ASCII\0\0\0", "latin1"),
          Buffer.from(registro.agregar(ficha.comentarioDeUsuario), "latin1"),
        ]),
      ),
      entrada.corto(0xa001, 1),
      entrada.largo(0xa002, ancho),
      entrada.largo(0xa003, alto),
    );
  }

  return construirTiff({ ifd0, exif, gps: entradasDeGps(ficha), miniatura });
}

// ── XMP ───────────────────────────────────────────────────────────────────────────────────────

const ESPACIOS_XMP = {
  dc: "http://purl.org/dc/elements/1.1/",
  xmp: "http://ns.adobe.com/xap/1.0/",
  xmpMM: "http://ns.adobe.com/xap/1.0/mm/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/",
  exif: "http://ns.adobe.com/exif/1.0/",
  exifEX: "http://cipa.jp/exif/1.0/",
  tiff: "http://ns.adobe.com/tiff/1.0/",
  pdf: "http://ns.adobe.com/pdf/1.3/",
  Iptc4xmpCore: "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/",
};

export const escaparXml = (texto) =>
  texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function elementoXmp(etiqueta, valor) {
  if (typeof valor === "string")
    return `<${etiqueta}>${escaparXml(valor)}</${etiqueta}>`;
  if (valor.seq) {
    const items = valor.seq
      .map((v) => `<rdf:li>${escaparXml(v)}</rdf:li>`)
      .join("");
    return `<${etiqueta}><rdf:Seq>${items}</rdf:Seq></${etiqueta}>`;
  }
  if (valor.alt !== undefined) {
    return `<${etiqueta}><rdf:Alt><rdf:li xml:lang="x-default">${escaparXml(valor.alt)}</rdf:li></rdf:Alt></${etiqueta}>`;
  }
  // `crudo`: XML ya armado (estructuras anidadas), con sus textos escapados por quien lo arma.
  return `<${etiqueta} rdf:parseType="Resource">${valor.crudo}</${etiqueta}>`;
}

/**
 * Un paquete XMP (ISO 16684-1) listo para incrustar. `atributos` van en el `rdf:Description`
 * (como los escribe Photoshop con los identificadores); `elementos` van dentro. Cada uno es
 * `[prefijo, nombre, valor]`; el valor es texto, `{ seq: [...] }`, `{ alt: "…" }` o `{ crudo }`.
 * El relleno de espacios al final imita el hueco que dejan los editores para reescribir el paquete
 * en su sitio.
 */
export function construirXmp({
  atributos = [],
  elementos = [],
  relleno = 512,
}) {
  const prefijos = new Set([...atributos, ...elementos].map(([p]) => p));
  const espacios = [...prefijos]
    .map((p) => ` xmlns:${p}="${ESPACIOS_XMP[p]}"`)
    .join("");
  const atributosXml = atributos
    .map(([p, nombre, valor]) => `\n    ${p}:${nombre}="${escaparXml(valor)}"`)
    .join("");
  const elementosXml = elementos
    .map(([p, nombre, valor]) => `\n   ${elementoXmp(`${p}:${nombre}`, valor)}`)
    .join("");
  const hueco = `${" ".repeat(99)}\n`.repeat(Math.ceil(relleno / 100));
  const texto =
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 5.6.0 (ficticio)">\n` +
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `  <rdf:Description rdf:about=""${espacios}${atributosXml}>${elementosXml}\n` +
    `  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n${hueco}<?xpacket end="w"?>`;
  return Buffer.from(texto, "utf8");
}

// ── IPTC (IIM) dentro de un recurso 8BIM de Photoshop (APP13 de JPEG) ──────────────────────────

/**
 * El contenido de un APP13 «Photoshop 3.0» con un único recurso 0x0404 (IPTC-NAA). `conjuntos` son
 * `[registro, conjunto, valor]` (por ejemplo `[2, 80, "By-line"]`); el valor es texto UTF-8 o Buffer.
 */
export function construirApp13Iptc(conjuntos) {
  const partes = conjuntos.map(([registro, conjunto, valor]) => {
    const datos = Buffer.isBuffer(valor) ? valor : Buffer.from(valor, "utf8");
    return Buffer.concat([
      Buffer.from([
        0x1c,
        registro,
        conjunto,
        datos.length >> 8,
        datos.length & 0xff,
      ]),
      datos,
    ]);
  });
  const iptc = Buffer.concat(partes);
  const tamano = Buffer.alloc(4);
  tamano.writeUInt32BE(iptc.length);
  return Buffer.concat([
    Buffer.from("Photoshop 3.0\0", "latin1"),
    Buffer.from("8BIM", "latin1"),
    Buffer.from([0x04, 0x04, 0x00, 0x00]), // id 0x0404 y nombre vacío (Pascal, alineado a 2)
    tamano,
    iptc,
    iptc.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
}
