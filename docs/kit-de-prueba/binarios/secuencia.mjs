// Secuencias HEIC y AVIF y el `.mov` de una Live Photo, sintéticos y con metadatos falsos (S11).
//
// Las muestras no se inventan: cada cuadro de la pista de video es el flujo HEVC de `base.heic` o el
// AV1 de `base.avif` (los mismos que usan las fotos del kit, versionados con su `.meta.json`). TODO lo
// demás se escribe aquí, caja por caja, con la forma que les dan las normas (ISO/IEC 14496-12 y
// QuickTime File Format) y los datos que trae una Live Photo de verdad:
//
//   · `mvhd`, `tkhd` y `mdhd` con la fecha de captura;
//   · una pista de video de dos cuadros con fabricante (`appl`) y nombre de compresor en su
//     descripción, y un `hdlr` con nombre;
//   · una pista de metadatos `mebx` con la ubicación ISO 6709 en su muestra, y otra con el instante
//     de la foto (`still-image-time`), que la limpieza tiene que conservar;
//   · una `meta` de QuickTime (`keys` + `ilst`) con ubicación, fabricante, modelo, programa, fecha
//     y el UUID que empareja el video con su foto (`content.identifier`, que se conserva);
//   · una `udta` con `©xyz`, `©swr` y `©mak`, una caja que Velo no conoce dentro de `moov`, una caja
//     `free` con texto, bytes sin dueño dentro de `mdat` y bytes sobrantes al final;
//   · con `conFoto` (solo HEIC y AVIF): además una `meta` de foto fija arriba, como la que escribe
//     ffmpeg en un AVIF animado, con su elemento de imagen y un `Exif` con GPS.
//
// Todo valor de texto se registra como centinela al insertarlo (`crearRegistro`), salvo el UUID de
// la pareja, que no es personal y se queda: la prueba comprueba que SIGUE ahí.

import { construirExif, crearFicha, crearRegistro } from "./comun.mjs";
import { CODECS, caja, completa, leerBase, texto, u16, u32 } from "./heic.mjs";

const latin1 = (t) => Buffer.from(t, "latin1");

/** Segundos desde el 1904-01-01 (UTC), como cuenta QuickTime. */
function segundos1904({ y, m, d, h, mi, s }) {
  return Date.UTC(y, m - 1, d, h, mi, s) / 1000 + 2_082_844_800;
}

const MATRIZ = Buffer.concat(
  [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map((v) => u32(v)),
);

function mvhd(fecha) {
  return caja(
    "mvhd",
    completa(0, 0),
    u32(fecha),
    u32(fecha),
    u32(600),
    u32(1200),
    u32(0x10000),
    u16(0x100),
    Buffer.alloc(10),
    MATRIZ,
    Buffer.alloc(24),
    u32(4),
  );
}

function tkhd(fecha, id, ancho, alto) {
  return caja(
    "tkhd",
    completa(0, 3),
    u32(fecha),
    u32(fecha),
    u32(id),
    u32(0),
    u32(1200),
    Buffer.alloc(8),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    MATRIZ,
    u32(ancho << 16),
    u32(alto << 16),
  );
}

function mdhd(fecha) {
  return caja(
    "mdhd",
    completa(0, 0),
    u32(fecha),
    u32(fecha),
    u32(600),
    u32(1200),
    u16(0x55c4),
    u16(0),
  );
}

function hdlr(tipo, nombre) {
  return caja(
    "hdlr",
    completa(0, 0),
    u32(0),
    latin1(tipo),
    Buffer.alloc(12),
    texto(nombre),
  );
}

const dinf = () =>
  caja(
    "dinf",
    caja("dref", completa(0, 0), u32(1), caja("url ", completa(0, 1))),
  );

/** Las tablas de una pista con un solo bloque de muestras que empieza en `inicio`. */
function tablas(descripcion, tamanos, inicio) {
  return [
    caja("stsd", completa(0, 0), u32(1), descripcion),
    caja("stts", completa(0, 0), u32(1), u32(tamanos.length), u32(600)),
    caja("stsc", completa(0, 0), u32(1), u32(1), u32(tamanos.length), u32(1)),
    caja(
      "stsz",
      completa(0, 0),
      u32(0),
      u32(tamanos.length),
      ...tamanos.map(u32),
    ),
    caja("stco", completa(0, 0), u32(1), u32(inicio)),
  ];
}

/** Descripción de video (78 bytes + configuración): fabricante en +12 y compresor en +42. */
function descripcionDeVideo(tipo, compresor, configuracion) {
  const nombre = Buffer.alloc(32);
  nombre[0] = compresor.length;
  nombre.write(compresor, 1, "latin1");
  return caja(
    tipo,
    Buffer.alloc(6),
    u16(1),
    u16(0),
    u16(0),
    latin1("appl"),
    u32(0),
    u32(0),
    u16(64),
    u16(48),
    u32(0x480000),
    u32(0x480000),
    u32(0),
    u16(1),
    nombre,
    u16(24),
    u16(0xffff),
    configuracion,
  );
}

/** Descripción `mebx`: una clave local (`1`) con su declaración en el espacio `mdta`. */
function descripcionMebx(clave) {
  const local = caja(
    "\0\0\0\u0001",
    caja("keyd", latin1("mdta"), Buffer.from(clave, "utf8")),
    caja("dtyp", u32(0), u32(1)),
  );
  return caja("mebx", Buffer.alloc(6), u16(1), caja("keys", local));
}

/** Una muestra de `mebx`: `[largo][clave local][valor]`. */
const muestraMebx = (valor) => caja("\0\0\0\u0001", valor);

/** La `meta` de QuickTime (sin versión ni banderas): `hdlr mdta` + `keys` + `ilst`. */
function metaQuickTime(nombre, pares) {
  const keys = caja(
    "keys",
    completa(0, 0),
    u32(pares.length),
    ...pares.map(([clave]) => {
      const valor = Buffer.from(clave, "utf8");
      return Buffer.concat([u32(8 + valor.length), latin1("mdta"), valor]);
    }),
  );
  const items = pares.map(([, valor], i) => {
    const cabecera = Buffer.alloc(8);
    cabecera.writeUInt32BE(i + 1, 4);
    const data = caja("data", u32(1), u32(0), Buffer.from(valor, "utf8"));
    cabecera.writeUInt32BE(8 + data.length, 0);
    return Buffer.concat([cabecera, data]);
  });
  return caja("meta", hdlr("mdta", nombre), keys, caja("ilst", ...items));
}

/**
 * Descripción `tmcd` (código de tiempo): 6 reservados, referencia, 18 bytes de la descripción
 * (escala 30000, 1001 por cuadro, 30 cuadros) y el rótulo del carrete en una caja `name`.
 */
function descripcionTmcd(rotulo) {
  const t = Buffer.from(rotulo, "utf8");
  return caja(
    "tmcd",
    Buffer.alloc(6),
    u16(1),
    u32(0),
    u32(0),
    u32(30000),
    u32(1001),
    Buffer.from([30, 0]),
    caja("name", u16(t.length), u16(0x15c7), t),
  );
}

/** Un texto internacional de `udta` (`©xyz` y compañía): tamaño, idioma y el texto. */
const textoDeUsuario = (codigo, valor) => {
  const t = Buffer.from(valor, "utf8");
  return caja(`©${codigo}`, u16(t.length), u16(0x15c7), t);
};

/**
 * Genera una secuencia (`heic` o `avif`) o el `.mov` de una Live Photo (`mov`, con flujo HEVC).
 *
 * `conTimecode` (solo el `.mov`) suma una pista de código de tiempo como la de una cámara: la hora
 * del día en que empezó a grabar y un rótulo de carrete. Sin él, los bytes son los de siempre.
 *
 * @param {{ semilla: number, formato: "heic" | "avif" | "mov", conFoto?: boolean, conTimecode?: boolean }} opciones
 */
export function generarSecuencia({
  semilla,
  formato,
  conFoto = false,
  conTimecode = false,
}) {
  if (conFoto && formato === "mov")
    throw new Error("un .mov no lleva foto fija");
  if (conTimecode && formato !== "mov")
    throw new Error("solo el .mov lleva código de tiempo");
  const codecDe = formato === "avif" ? "avif" : "heic";
  const codec = CODECS[codecDe];
  const { propiedades, hevc } = leerBase(codecDe);
  const ficha = crearFicha(semilla);
  const registro = crearRegistro();
  const fecha = segundos1904(ficha.fechas.crudas.captura);
  const uuidDePareja = ficha.ids.original.toUpperCase();

  const ubicacion = registro.agregar(
    `${ficha.gps.latitud >= 0 ? "+" : ""}${ficha.gps.latitud}${ficha.gps.longitud}+${ficha.gps.altitud}.000/`,
  );
  const fabricante = registro.agregar(`${ficha.fabricante} Ficticio`);
  const modelo = registro.agregar(ficha.modelo);
  const programa = registro.agregar(ficha.software);
  const creada = registro.agregar(ficha.fechas.captura.iso);
  const compresor = registro.agregar(`ENC-${ficha.serie}`);
  const nombreDePista = registro.agregar(`Pista de ${ficha.autor.completo}`);
  const nombreDeMeta = registro.agregar(`Etiquetas ${ficha.expediente}`);
  const libre = registro.agregar(ficha.notaDeFabricante);
  const desconocida = registro.agregar(`CAJA-DESCONOCIDA-${ficha.serie}`);
  const sinUso = registro.agregar(`MDAT-SIN-USO-${ficha.serie}`);
  const resto = registro.agregar(ficha.resto);
  const rotuloDeCarrete = conTimecode
    ? registro.agregar(`CARRETE-${ficha.serie}`)
    : "";

  // `mdat`: dos cuadros, la ubicación, el instante de la foto, los bytes sin dueño y, con la foto
  // fija, su Exif.
  const cuadros = [hevc, hevc];
  const muestraUbicacion = muestraMebx(Buffer.from(ubicacion, "utf8"));
  const muestraInstante = muestraMebx(Buffer.from([0xff]));
  const exif = conFoto
    ? Buffer.concat([
        u32(6),
        latin1("Exif\0\0"),
        construirExif(ficha, registro, { completo: false }),
      ])
    : Buffer.alloc(0);
  const huerfanos = Buffer.from(`${sinUso}\n`, "latin1");
  // El código de tiempo: el cuadro 1 080 000 a 30 por segundo es las 10:00:00:00, la hora del día.
  const muestraTimecode = conTimecode ? u32(1_080_000) : Buffer.alloc(0);
  const partes = [
    ...cuadros,
    muestraUbicacion,
    muestraInstante,
    huerfanos,
    exif,
    muestraTimecode,
  ];

  const ftyp =
    formato === "mov"
      ? caja("ftyp", latin1("qt  "), u32(0), latin1("qt  "))
      : formato === "avif"
        ? caja("ftyp", latin1("avis"), u32(0), latin1("avismsf1miafavif"))
        : caja("ftyp", latin1("hevc"), u32(0), latin1("msf1hevcmif1heic"));
  const ancho = formato === "mov" ? [caja("wide")] : [];

  const metaDeFoto = (base) => {
    if (!conFoto) return Buffer.alloc(0);
    const nombreDelManejador = registro.agregar(
      `Foto de ${ficha.autor.completo}`,
    );
    const ipco = caja(
      "ipco",
      propiedades[codec.configuracion],
      propiedades.ispe,
      propiedades.colr,
    );
    const ipma = caja(
      "ipma",
      completa(0, 0),
      u32(1),
      Buffer.concat([u16(1), Buffer.from([3, 0x81, 0x02, 0x03])]),
    );
    const infe = (id, tipo) =>
      caja("infe", completa(2, 0), u16(id), u16(0), latin1(tipo), texto(""));
    const exifEn =
      base +
      cuadros[0].length * 2 +
      muestraUbicacion.length +
      muestraInstante.length +
      huerfanos.length;
    return caja(
      "meta",
      completa(0, 0),
      hdlr("pict", nombreDelManejador),
      dinf(),
      caja("pitm", completa(0, 0), u16(1)),
      caja(
        "iinf",
        completa(0, 0),
        u16(2),
        infe(1, codec.elemento),
        infe(2, "Exif"),
      ),
      caja("iref", completa(0, 0), caja("cdsc", u16(2), u16(1), u16(1))),
      caja("iprp", ipco, ipma),
      caja(
        "iloc",
        completa(0, 0),
        u16(0x4400),
        u16(2),
        Buffer.concat([
          u16(1),
          u16(0),
          u16(1),
          u32(base),
          u32(cuadros[0].length),
        ]),
        Buffer.concat([u16(2), u16(0), u16(1), u32(exifEn), u32(exif.length)]),
      ),
    );
  };

  const cajaLibre = caja("free", Buffer.from(libre, "latin1"));
  // La `meta` de la foto no cambia de tamaño con los desplazamientos: se mide con 0.
  const antes =
    ftyp.length +
    ancho.reduce((n, c) => n + c.length, 0) +
    metaDeFoto(0).length +
    cajaLibre.length;
  const inicio = antes + 8;
  const meta = metaDeFoto(inicio);
  const mdat = caja("mdat", ...partes);
  const enUbicacion = inicio + cuadros[0].length * 2;
  const enInstante = enUbicacion + muestraUbicacion.length;
  const enTimecode =
    enInstante + muestraInstante.length + huerfanos.length + exif.length;

  const pistaDeVideo = caja(
    "trak",
    tkhd(fecha, 1, 64, 48),
    caja(
      "mdia",
      mdhd(fecha),
      hdlr("vide", nombreDePista),
      caja(
        "minf",
        caja("vmhd", completa(0, 1), Buffer.alloc(8)),
        dinf(),
        caja(
          "stbl",
          ...tablas(
            descripcionDeVideo(
              codec.elemento,
              compresor,
              propiedades[codec.configuracion],
            ),
            cuadros.map((c) => c.length),
            inicio,
          ),
        ),
      ),
    ),
  );
  const pistaMebx = (id, clave, muestra, en) =>
    caja(
      "trak",
      tkhd(fecha, id, 0, 0),
      caja(
        "mdia",
        mdhd(fecha),
        hdlr("meta", ""),
        caja(
          "minf",
          caja("nmhd", completa(0, 0)),
          dinf(),
          caja("stbl", ...tablas(descripcionMebx(clave), [muestra.length], en)),
        ),
      ),
    );

  const pistaDeTimecode = conTimecode
    ? [
        caja(
          "trak",
          tkhd(fecha, 4, 0, 0),
          caja(
            "mdia",
            mdhd(fecha),
            hdlr("tmcd", ""),
            caja(
              "minf",
              caja("gmhd", caja("gmin", completa(0, 0), Buffer.alloc(12))),
              dinf(),
              caja(
                "stbl",
                ...tablas(
                  descripcionTmcd(rotuloDeCarrete),
                  [muestraTimecode.length],
                  enTimecode,
                ),
              ),
            ),
          ),
        ),
      ]
    : [];

  const moov = caja(
    "moov",
    mvhd(fecha),
    pistaDeVideo,
    pistaMebx(
      2,
      "com.apple.quicktime.location.ISO6709",
      muestraUbicacion,
      enUbicacion,
    ),
    pistaMebx(
      3,
      "com.apple.quicktime.still-image-time",
      muestraInstante,
      enInstante,
    ),
    ...pistaDeTimecode,
    caja("Xtra", Buffer.from(desconocida, "latin1")),
    metaQuickTime(nombreDeMeta, [
      ["com.apple.quicktime.location.ISO6709", ubicacion],
      ["com.apple.quicktime.make", fabricante],
      ["com.apple.quicktime.model", modelo],
      ["com.apple.quicktime.software", programa],
      ["com.apple.quicktime.creationdate", creada],
      ["com.apple.quicktime.content.identifier", uuidDePareja],
    ]),
    caja(
      "udta",
      textoDeUsuario("xyz", ubicacion),
      textoDeUsuario("swr", programa),
      textoDeUsuario("mak", fabricante),
    ),
  );
  const bytes = Buffer.concat([
    ftyp,
    ...ancho,
    meta,
    cajaLibre,
    mdat,
    moov,
    Buffer.from(`${resto}\n`, "latin1"),
  ]);

  return {
    bytes,
    centinelas: registro.lista,
    uuidDePareja,
    fecha,
    /** Dónde empieza cada cuadro de video en el archivo: la limpieza no puede moverlos. */
    cuadros: cuadros.map((c, i) => ({
      desde: inicio + i * c.length,
      largo: c.length,
    })),
    instante: { desde: enInstante, largo: muestraInstante.length },
    /** La muestra del código de tiempo (solo con `conTimecode`): 4 bytes, la hora del día. */
    timecode: { desde: enTimecode, largo: muestraTimecode.length },
    rotuloDeCarrete,
    ubicacion: { desde: enUbicacion, largo: muestraUbicacion.length },
    detalle: {
      latitud: ficha.gps.latitud,
      longitud: ficha.gps.longitud,
      fabricante,
      modelo,
      programa,
    },
  };
}
