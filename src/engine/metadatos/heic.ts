// HEIC — las fotos del celular: leer lo que dicen de sí mismas y escribir una copia que ya no lo diga.
//
// Un HEIC es un HEIF (ISO/IEC 23008-12) con imágenes HEVC, y un HEIF es un contenedor ISO BMFF
// (ISO/IEC 14496-12): una sucesión de cajas, cada una con su tamaño (4 bytes, big endian; `1` = el
// tamaño real va en 8 bytes a continuación; `0` = hasta el final) y su código de cuatro caracteres.
// Lo que importa vive dentro de la caja `meta`:
//
//   · `iinf` lista los ELEMENTOS (`infe`): la imagen (`hvc1`), sus teselas, la cuadrícula que las
//     junta (`grid`), la miniatura, los mapas auxiliares… y los METADATOS, que en HEIF son elementos
//     como cualquier otro: `Exif` (un TIFF) y `mime` con `application/rdf+xml` (XMP).
//   · `iloc` dice dónde están los bytes de cada elemento: desplazamientos ABSOLUTOS en el archivo
//     (casi siempre dentro de `mdat`) o relativos a `idat`.
//   · `iref` los relaciona (`cdsc`: «este EXIF describe aquella imagen»; `thmb`, `dimg`, `auxl`).
//   · `iprp` guarda las propiedades (`ipco`) y a qué elemento va cada una (`ipma`).
//
// La limpieza es por LISTA BLANCA, igual que en JPEG, PNG y WebP: se conservan los elementos de
// imagen y las propiedades que hacen falta para decodificarla y verla bien —la orientación incluida,
// que en HEIF vive en `irot`/`imir` y no en el EXIF, así que aquí no hace falta un EXIF mínimo—, y
// todo lo demás se va, también lo que Velo no conoce. Como quitar un elemento cambia dónde quedan
// los demás, la copia se REESCRIBE: `ftyp` tal cual, una `meta` nueva y un `mdat` nuevo con solo los
// bytes de los elementos conservados, en su orden original, e `iloc` con los desplazamientos
// recalculados. Los bytes HEVC —los píxeles— se copian sin tocar; Velo no decodifica la imagen.
//
// Lo que Velo no sabe reescribir sin romperlo se RECHAZA con su nombre (`imagen-no-soportada`) en vez
// de entregar un archivo dañado: secuencias y Live Photos (`moov`), elementos protegidos, datos que
// viven fuera del archivo, elementos construidos a partir de otros (`construction_method` 2) y
// propiedades desconocidas que el archivo declara esenciales. El modelo y sus límites:
// `decisions/012-metadatos.md`.

import { MARCAS_HEIC } from "./deteccion";
import { anotarExif, sinPrefijoExif } from "./exif";
import { Inventario } from "./inventario";
import {
  ascii,
  fallar,
  nombreTecnico,
  textoUtf8Laxo,
  textoUtf8OLatin1,
  tramo,
  u16be,
  u32be,
  u8,
} from "./lector-binario";
import type {
  AnalisisDeMetadatos,
  ClaseDeElemento,
  Limpieza,
  MotivoDeMetadatos,
} from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

const NO_SOPORTADA: MotivoDeMetadatos = "imagen-no-soportada";

/** Elementos que SON la imagen (o la componen): se conservan con sus bytes. */
const ELEMENTOS_DE_IMAGEN = new Set([
  "hvc1",
  "hvt1",
  "grid",
  "iden",
  "iovl",
  "tmap",
  "jpeg",
]);

/** Propiedades que hacen falta para decodificar la imagen y verla como se tomó. */
const PROPIEDADES_QUE_SE_CONSERVAN = new Set([
  "hvcC",
  "ispe",
  "irot",
  "imir",
  "clap",
  "colr",
  "pixi",
  "auxC",
  "pasp",
  "rloc",
  "lsel",
  "clli",
  "mdcv",
  "cclv",
  "amve",
]);

/** Referencias por las que una imagen conservada NECESITA a otro elemento. */
const REFERENCIAS_DE_CONSTRUCCION = new Set(["dimg", "base"]);

/** Tope de cajas y de elementos. Una foto real trae decenas; esto corta un archivo hostil. */
const MAXIMO_DE_CAJAS = 100_000;

/**
 * Tope de tramos (extensiones de `iloc`) en TODO el archivo. Una foto de iPhone trae unas decenas
 * de elementos de un tramo; una cuadrícula de teselas de 512 px sobre 100 megapíxeles, unos cientos.
 * El mismo número que `MAXIMO_DE_ENTRADAS` del EXIF.
 */
const MAXIMO_DE_TRAMOS = 4_096;

/** Un paquete XMP se lee hasta este tope, como en los otros formatos. */
const MIME_XMP = "application/rdf+xml";

// ── Cajas ───────────────────────────────────────────────────────────────────────────────────────

interface Caja {
  readonly tipo: string;
  readonly desde: number;
  /** Donde empiezan sus datos: tras el tamaño, el código y, si lo hay, el tamaño largo. */
  readonly datos: number;
  readonly hasta: number;
}

function codigoEn(bytes: Uint8Array, pos: number): string {
  const c = tramo(bytes, pos, 4);
  return String.fromCharCode(c[0], c[1], c[2], c[3]);
}

/** Cuatro bytes ASCII imprimibles: lo que tiene que haber donde va el código de una caja. */
function pareceCodigo(bytes: Uint8Array, pos: number): boolean {
  if (pos + 4 > bytes.length) return false;
  for (let i = pos; i < pos + 4; i++)
    if (bytes[i] < 0x20 || bytes[i] > 0x7e) return false;
  return true;
}

function leerCaja(bytes: Uint8Array, pos: number, fin: number): Caja {
  const tamano = u32be(bytes, pos);
  const tipo = codigoEn(bytes, pos + 4);
  let datos = pos + 8;
  let hasta: number;
  if (tamano === 1) {
    // Tamaño de 64 bits. Por encima de 4 GiB no hay foto que Velo abra (el tope es de 100 MB).
    if (u32be(bytes, pos + 8) !== 0) fallar();
    datos = pos + 16;
    hasta = pos + u32be(bytes, pos + 12);
  } else if (tamano === 0) hasta = fin;
  else hasta = pos + tamano;
  if (!(hasta >= datos && hasta <= fin)) fallar();
  return { tipo, desde: pos, datos, hasta };
}

/** Las cajas que hay entre `desde` y `hasta`, que tienen que llenar el tramo exacto. */
function hijos(bytes: Uint8Array, desde: number, hasta: number): Caja[] {
  const lista: Caja[] = [];
  for (let pos = desde; pos < hasta;) {
    const caja = leerCaja(bytes, pos, hasta);
    lista.push(caja);
    pos = caja.hasta;
    if (lista.length > MAXIMO_DE_CAJAS) fallar(NO_SOPORTADA);
  }
  return lista;
}

/** Los datos de una caja, como vista: cada lectura de adentro queda acotada a la caja. */
function cuerpo(bytes: Uint8Array, caja: Caja): Uint8Array {
  return bytes.subarray(caja.datos, caja.hasta);
}

/** Un texto terminado en `\0` (o en el final de la caja, que algunos programas no cierran). */
function textoNulo(
  datos: Uint8Array,
  pos: number,
): { bytes: Uint8Array; fin: number } {
  let fin = pos;
  while (fin < datos.length && datos[fin] !== 0) fin++;
  return {
    bytes: datos.subarray(Math.min(pos, datos.length), fin),
    fin: Math.min(fin + 1, datos.length),
  };
}

/** Un número de 0, 4 u 8 bytes, como los declara `iloc`. */
function numero(datos: Uint8Array, pos: number, largo: number): number {
  if (largo === 0) return 0;
  if (largo === 4) return u32be(datos, pos);
  // 8 bytes: la mitad alta tiene que ser 0 (un desplazamiento de más de 4 GiB no cabe en una foto).
  if (u32be(datos, pos) !== 0) fallar();
  return u32be(datos, pos + 4);
}

// ── Lo que se lee de la caja `meta` ─────────────────────────────────────────────────────────────

interface ElementoHeif {
  readonly id: number;
  readonly version: number;
  readonly banderas: number;
  readonly tipo: string;
  readonly nombre: Uint8Array;
  readonly tipoDeContenido: string | null;
  readonly codificacion: string | null;
  readonly caja: Caja;
}

interface Tramo {
  readonly desplazamiento: number;
  readonly largo: number;
}

interface Ubicacion {
  readonly id: number;
  readonly metodo: number;
  readonly referencia: number;
  /** Desplazamientos ya sumados a la base: absolutos (método 0) o dentro de `idat` (método 1). */
  readonly tramos: readonly Tramo[];
}

interface Referencia {
  readonly tipo: string;
  readonly de: number;
  readonly a: readonly number[];
}

interface Asociacion {
  readonly indice: number;
  readonly esencial: boolean;
}

interface Ipma {
  readonly version: number;
  readonly banderas: number;
  readonly entradas: readonly {
    readonly id: number;
    readonly asociaciones: readonly Asociacion[];
  }[];
}

interface Heif {
  readonly ftyp: Caja;
  readonly superiores: readonly Caja[];
  /** Donde termina la última caja que se pudo leer. Lo que sigue son bytes sobrantes. */
  readonly fin: number;
  readonly hijosDeMeta: readonly Caja[];
  readonly hdlrNombre: number;
  readonly drefConTexto: number;
  readonly drefPropias: readonly boolean[];
  readonly primario: number;
  readonly iinfVersion: number;
  readonly elementos: readonly ElementoHeif[];
  readonly ilocVersion: number;
  readonly ubicaciones: readonly Ubicacion[];
  readonly irefVersion: number;
  readonly referencias: readonly Referencia[];
  readonly propiedades: readonly Caja[];
  readonly ipmas: readonly Ipma[];
  readonly idat: Caja | null;
}

function leerHdlr(bytes: Uint8Array, caja: Caja): number {
  const d = cuerpo(bytes, caja);
  // versión y banderas (4), pre_defined (4), handler_type (4), reservados (12), nombre.
  if (codigoEn(d, 8) !== "pict") fallar();
  if (d.length < 24) fallar();
  return textoNulo(d, 24).bytes.length;
}

/** Qué entradas de `dref` son «este mismo archivo» (`url ` con la bandera 1) y cuántos bytes de texto traen. */
function leerDinf(
  bytes: Uint8Array,
  caja: Caja,
): { propias: boolean[]; conTexto: number } {
  const propias: boolean[] = [];
  let conTexto = 0;
  for (const dref of hijos(bytes, caja.datos, caja.hasta)) {
    if (dref.tipo !== "dref") continue;
    for (const entrada of hijos(bytes, dref.datos + 8, dref.hasta)) {
      if (entrada.hasta - entrada.datos < 4) fallar();
      const banderas = u32be(bytes, entrada.datos) & 0xffffff;
      const propia = entrada.tipo === "url " && (banderas & 1) === 1;
      propias.push(propia);
      // Lo que sigue a versión y banderas es una URL o un URN: texto que la copia no lleva.
      conTexto += entrada.hasta - entrada.datos - 4;
    }
  }
  return { propias, conTexto };
}

function leerInfe(bytes: Uint8Array, caja: Caja): ElementoHeif {
  const d = cuerpo(bytes, caja);
  const version = u8(d, 0);
  // Las versiones 0 y 1 son de HEIF antiguo, sin código de tipo: ninguna foto actual las usa.
  if (version < 2 || version > 3) fallar(NO_SOPORTADA);
  const banderas = u32be(d, 0) & 0xffffff;
  let p = 4;
  const id = version === 2 ? u16be(d, p) : u32be(d, p);
  p += version === 2 ? 2 : 4;
  // Un elemento protegido (cifrado) no se puede reescribir sin la llave de quien lo protegió.
  if (u16be(d, p) !== 0) fallar(NO_SOPORTADA);
  p += 2;
  const tipo = codigoEn(d, p);
  p += 4;
  const nombre = textoNulo(d, p);
  let tipoDeContenido: string | null = null;
  let codificacion: string | null = null;
  if (tipo === "mime") {
    const contenido = textoNulo(d, nombre.fin);
    tipoDeContenido = textoUtf8Laxo(contenido.bytes, 256).trim();
    const cod = textoNulo(d, contenido.fin);
    codificacion = textoUtf8Laxo(cod.bytes, 64).trim();
  }
  return {
    id,
    version,
    banderas,
    tipo,
    nombre: nombre.bytes,
    tipoDeContenido,
    codificacion,
    caja,
  };
}

function leerIinf(
  bytes: Uint8Array,
  caja: Caja,
): { version: number; elementos: ElementoHeif[] } {
  const d = cuerpo(bytes, caja);
  const version = u8(d, 0);
  const cuenta = version === 0 ? u16be(d, 4) : u32be(d, 4);
  const inicio = caja.datos + (version === 0 ? 6 : 8);
  const elementos = hijos(bytes, inicio, caja.hasta)
    .filter((c) => c.tipo === "infe")
    .map((c) => leerInfe(bytes, c));
  if (elementos.length !== cuenta) fallar();
  return { version, elementos };
}

function leerIloc(
  bytes: Uint8Array,
  caja: Caja,
): { version: number; ubicaciones: Ubicacion[] } {
  const d = cuerpo(bytes, caja);
  const version = u8(d, 0);
  if (version > 2) fallar(NO_SOPORTADA);
  const tamanos = u16be(d, 4);
  const largoDeDesplazamiento = tamanos >> 12;
  const largoDeLargo = (tamanos >> 8) & 0xf;
  const largoDeBase = (tamanos >> 4) & 0xf;
  const largoDeIndice = version >= 1 ? tamanos & 0xf : 0;
  for (const largo of [
    largoDeDesplazamiento,
    largoDeLargo,
    largoDeBase,
    largoDeIndice,
  ])
    if (largo !== 0 && largo !== 4 && largo !== 8) fallar();

  let p = 6;
  const cuenta = version < 2 ? u16be(d, p) : u32be(d, p);
  p += version < 2 ? 2 : 4;
  if (cuenta > MAXIMO_DE_CAJAS) fallar(NO_SOPORTADA);

  // Lo que ocupa UN tramo en la caja. Con los tres tamaños en 0 no ocupa ni un byte.
  const bytesPorTramo = largoDeIndice + largoDeDesplazamiento + largoDeLargo;
  let totalDeTramos = 0;
  const ubicaciones: Ubicacion[] = [];
  for (let i = 0; i < cuenta; i++) {
    const id = version < 2 ? u16be(d, p) : u32be(d, p);
    p += version < 2 ? 2 : 4;
    let metodo = 0;
    if (version >= 1) {
      metodo = u16be(d, p) & 0xf;
      p += 2;
    }
    const referencia = u16be(d, p);
    p += 2;
    const base = numero(d, p, largoDeBase);
    p += largoDeBase;
    const extensiones = u16be(d, p);
    p += 2;
    // ANTES de reservar nada (M3 de la auditoría del S7). Con los tres tamaños en 0 la lectura de un
    // tramo no avanza el cursor y `extensiones` (hasta 65 535) llenaba la memoria del worker con un
    // archivo de 6 KB. Con tamaños de verdad, una cuenta que no cabe en lo que queda de la caja es
    // un archivo cortado, no algo que haya que reservar para descubrirlo.
    if (extensiones > 1 && bytesPorTramo === 0) fallar(NO_SOPORTADA);
    if (extensiones * bytesPorTramo > d.length - p) fallar();
    totalDeTramos += extensiones;
    if (totalDeTramos > MAXIMO_DE_TRAMOS) fallar(NO_SOPORTADA);
    const tramos: Tramo[] = [];
    for (let e = 0; e < extensiones; e++) {
      p += largoDeIndice;
      const desplazamiento = numero(d, p, largoDeDesplazamiento);
      p += largoDeDesplazamiento;
      const largo = numero(d, p, largoDeLargo);
      p += largoDeLargo;
      tramos.push({ desplazamiento: base + desplazamiento, largo });
    }
    ubicaciones.push({ id, metodo, referencia, tramos });
  }
  return { version, ubicaciones };
}

function leerIref(
  bytes: Uint8Array,
  caja: Caja,
): { version: number; referencias: Referencia[] } {
  const version = u8(bytes, caja.datos);
  const ancho = version === 0 ? 2 : 4;
  const leerId = (d: Uint8Array, p: number) =>
    ancho === 2 ? u16be(d, p) : u32be(d, p);
  const referencias = hijos(bytes, caja.datos + 4, caja.hasta).map((c) => {
    const d = cuerpo(bytes, c);
    const de = leerId(d, 0);
    const cuenta = u16be(d, ancho);
    const a: number[] = [];
    for (let i = 0; i < cuenta; i++) a.push(leerId(d, ancho + 2 + i * ancho));
    return { tipo: c.tipo, de, a };
  });
  return { version, referencias };
}

function leerIpma(bytes: Uint8Array, caja: Caja): Ipma {
  const d = cuerpo(bytes, caja);
  const version = u8(d, 0);
  const banderas = u32be(d, 0) & 0xffffff;
  const cuenta = u32be(d, 4);
  if (cuenta > MAXIMO_DE_CAJAS) fallar(NO_SOPORTADA);
  let p = 8;
  const entradas: Ipma["entradas"][number][] = [];
  for (let i = 0; i < cuenta; i++) {
    const id = version < 1 ? u16be(d, p) : u32be(d, p);
    p += version < 1 ? 2 : 4;
    const n = u8(d, p);
    p += 1;
    const asociaciones: Asociacion[] = [];
    for (let j = 0; j < n; j++) {
      if (banderas & 1) {
        const v = u16be(d, p);
        p += 2;
        asociaciones.push({ indice: v & 0x7fff, esencial: (v & 0x8000) !== 0 });
      } else {
        const v = u8(d, p);
        p += 1;
        asociaciones.push({ indice: v & 0x7f, esencial: (v & 0x80) !== 0 });
      }
    }
    entradas.push({ id, asociaciones });
  }
  return { version, banderas, entradas };
}

function leerFtyp(bytes: Uint8Array, caja: Caja): void {
  const d = cuerpo(bytes, caja);
  if (d.length < 8) fallar();
  const marcas = [codigoEn(d, 0)];
  for (let p = 8; p + 4 <= d.length; p += 4) marcas.push(codigoEn(d, p));
  if (!marcas.some((m) => MARCAS_HEIC.has(m))) fallar();
}

function leerHeif(bytes: Uint8Array): Heif {
  const superiores: Caja[] = [];
  let pos = 0;
  while (pos + 8 <= bytes.length && pareceCodigo(bytes, pos + 4)) {
    let caja: Caja;
    try {
      caja = leerCaja(bytes, pos, bytes.length);
    } catch {
      // Una cabecera que no cuadra después de la última caja buena: son bytes sobrantes.
      break;
    }
    superiores.push(caja);
    pos = caja.hasta;
    if (superiores.length > MAXIMO_DE_CAJAS) fallar(NO_SOPORTADA);
  }
  const fin = pos;

  const ftyp = superiores[0];
  if (!ftyp || ftyp.tipo !== "ftyp") fallar();
  leerFtyp(bytes, ftyp);
  // Una secuencia de imágenes o una Live Photo trae pistas (`moov`): eso no es una foto fija.
  if (superiores.some((c) => c.tipo === "moov")) fallar(NO_SOPORTADA);
  const metas = superiores.filter((c) => c.tipo === "meta");
  if (metas.length !== 1) fallar();
  const meta = metas[0];
  if (u8(bytes, meta.datos) !== 0) fallar();

  const hijosDeMeta = hijos(bytes, meta.datos + 4, meta.hasta);
  const unica = (tipo: string): Caja | null => {
    const encontradas = hijosDeMeta.filter((c) => c.tipo === tipo);
    if (encontradas.length > 1) fallar();
    return encontradas[0] ?? null;
  };

  const hdlr = unica("hdlr");
  const pitm = unica("pitm");
  const iinf = unica("iinf");
  const iloc = unica("iloc");
  if (!hdlr || !pitm || !iinf || !iloc) fallar();
  const iref = unica("iref");
  const iprp = unica("iprp");
  const dinf = unica("dinf");
  const idat = unica("idat");

  const dref = dinf ? leerDinf(bytes, dinf) : { propias: [], conTexto: 0 };
  const versionDePitm = u8(bytes, pitm.datos);
  const primario =
    versionDePitm === 0
      ? u16be(cuerpo(bytes, pitm), 4)
      : u32be(cuerpo(bytes, pitm), 4);

  const { version: iinfVersion, elementos } = leerIinf(bytes, iinf);
  const ids = new Set<number>();
  for (const e of elementos) {
    if (ids.has(e.id)) fallar();
    ids.add(e.id);
  }
  const { version: ilocVersion, ubicaciones } = leerIloc(bytes, iloc);
  const { version: irefVersion, referencias } = iref
    ? leerIref(bytes, iref)
    : { version: 0, referencias: [] };

  let propiedades: Caja[] = [];
  const ipmas: Ipma[] = [];
  if (iprp) {
    for (const c of hijos(bytes, iprp.datos, iprp.hasta)) {
      if (c.tipo === "ipco") propiedades = hijos(bytes, c.datos, c.hasta);
      else if (c.tipo === "ipma") ipmas.push(leerIpma(bytes, c));
    }
  }

  return {
    ftyp,
    superiores,
    fin,
    hijosDeMeta,
    hdlrNombre: leerHdlr(bytes, hdlr),
    drefConTexto: dref.conTexto,
    drefPropias: dref.propias,
    primario,
    iinfVersion,
    elementos,
    ilocVersion,
    ubicaciones,
    irefVersion,
    referencias,
    propiedades,
    ipmas,
    idat,
  };
}

// ── Qué se conserva ─────────────────────────────────────────────────────────────────────────────

interface Quitado {
  readonly clase: ClaseDeElemento;
  readonly marcador: string;
  readonly leer: "exif" | "xmp" | null;
}

/** Qué se hace con un elemento que no es de imagen. */
function destinoDeMetadato(e: ElementoHeif): Quitado {
  if (e.tipo === "Exif")
    return { clase: "exif", marcador: "Exif", leer: "exif" };
  if (e.tipo === "mime") {
    const xmp = e.tipoDeContenido === MIME_XMP;
    // Un XMP comprimido (`content_encoding`) se quita sin leerlo, como el texto comprimido de PNG.
    const comprimido = e.codificacion !== null && e.codificacion !== "";
    return {
      clase: xmp ? "xmp" : "auxiliar",
      marcador: "mime",
      leer: xmp && !comprimido ? "xmp" : null,
    };
  }
  return {
    clase: "auxiliar",
    marcador: nombreTecnico(ascii(e.tipo)),
    leer: null,
  };
}

interface Plan {
  readonly heif: Heif;
  /** Los elementos que se quedan, por id. */
  readonly conservados: ReadonlySet<number>;
  /** Las propiedades que se quedan: índice viejo (desde 1) → índice nuevo (desde 1). */
  readonly propiedadNueva: ReadonlyMap<number, number>;
  readonly analisis: AnalisisDeMetadatos;
}

/** Las referencias de `dref` que apuntan a ESTE archivo: 0 siempre; las demás, si son `url ` propias. */
function referenciaPropia(heif: Heif, referencia: number): boolean {
  return referencia === 0 || heif.drefPropias[referencia - 1] === true;
}

function bytesDeUbicacion(
  bytes: Uint8Array,
  heif: Heif,
  u: Ubicacion,
): Uint8Array | null {
  if (u.metodo === 2 || !referenciaPropia(heif, u.referencia)) return null;
  const base = u.metodo === 1 ? heif.idat : null;
  if (u.metodo === 1 && base === null) fallar();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (const t of u.tramos) {
    const parte =
      base === null
        ? tramo(bytes, t.desplazamiento, t.largo)
        : tramo(cuerpo(bytes, base), t.desplazamiento, t.largo);
    partes.push(parte);
    total += parte.length;
  }
  if (partes.length === 1) return partes[0];
  const junto = new Uint8Array(total);
  let p = 0;
  for (const parte of partes) {
    junto.set(parte, p);
    p += parte.length;
  }
  return junto;
}

function planear(bytes: Uint8Array): Plan {
  const heif = leerHeif(bytes);
  const inventario = new Inventario();
  const ubicacionDe = new Map(heif.ubicaciones.map((u) => [u.id, u]));

  // 1. Qué elementos se quedan: los de imagen, y solo si nada de lo que necesitan se va.
  const conservados = new Set<number>();
  for (const e of heif.elementos)
    if (ELEMENTOS_DE_IMAGEN.has(e.tipo)) conservados.add(e.id);
  if (!conservados.has(heif.primario)) fallar(NO_SOPORTADA);
  for (const r of heif.referencias) {
    if (!REFERENCIAS_DE_CONSTRUCCION.has(r.tipo) || !conservados.has(r.de))
      continue;
    // Una cuadrícula o una derivación que se arma con un elemento que no es imagen: quitarlo la
    // rompería. No se adivina.
    for (const a of r.a) if (!conservados.has(a)) fallar(NO_SOPORTADA);
  }

  // 2. Los bytes de cada elemento conservado tienen que estar en este archivo y caber.
  for (const id of conservados) {
    const u = ubicacionDe.get(id);
    if (!u) continue;
    if (u.metodo === 2 || !referenciaPropia(heif, u.referencia))
      fallar(NO_SOPORTADA);
    for (const t of u.tramos) if (t.largo === 0) fallar(NO_SOPORTADA);
    bytesDeUbicacion(bytes, heif, u);
  }

  // 3. Lo que se quita y lo que dice.
  for (const e of heif.elementos) {
    if (conservados.has(e.id)) {
      if (e.nombre.length > 0)
        inventario.quitar("texto", "infe", e.nombre.length);
      continue;
    }
    const destino = destinoDeMetadato(e);
    const u = ubicacionDe.get(e.id);
    const datos = u ? bytesDeUbicacion(bytes, heif, u) : null;
    inventario.quitar(destino.clase, destino.marcador, datos?.length ?? 0);
    if (destino.leer === null && e.tipo === "mime" && destino.clase === "xmp")
      inventario.avisar("texto-comprimido");
    if (datos === null) continue;
    if (destino.leer === "exif") {
      // El elemento `Exif` empieza con 4 bytes que dicen dónde empieza el TIFF (ISO/IEC 23008-12,
      // A.2.1); Apple pone ahí `Exif\0\0` delante, y otros no.
      const salto = datos.length >= 4 ? u32be(datos, 0) : datos.length;
      const tiff = datos.subarray(Math.min(datos.length, 4 + salto));
      anotarExif(inventario, sinPrefijoExif(tiff));
    } else if (destino.leer === "xmp") {
      inventario.agregarLectura(
        leerXmp(textoUtf8Laxo(datos, LARGO_MAXIMO_DE_XMP), "xmp"),
      );
    }
  }

  // 4. Las propiedades: la lista blanca; una desconocida esencial no se puede quitar sin romper.
  const esencialEnConservado = new Set<number>();
  for (const ipma of heif.ipmas)
    for (const entrada of ipma.entradas)
      if (conservados.has(entrada.id))
        for (const a of entrada.asociaciones)
          if (a.esencial) esencialEnConservado.add(a.indice);

  const propiedadNueva = new Map<number, number>();
  heif.propiedades.forEach((p, i) => {
    const indice = i + 1;
    const tamano = p.hasta - p.desde;
    if (PROPIEDADES_QUE_SE_CONSERVAN.has(p.tipo)) {
      propiedadNueva.set(indice, propiedadNueva.size + 1);
      if (p.tipo === "colr") {
        const tipoDeColor = codigoEn(bytes, p.datos);
        if (tipoDeColor === "prof" || tipoDeColor === "rICC")
          inventario.conservar("perfil-de-color", "colr", tamano);
      } else if (p.tipo === "irot" || p.tipo === "imir")
        inventario.conservar("orientacion", p.tipo, tamano);
      return;
    }
    if (esencialEnConservado.has(indice)) fallar(NO_SOPORTADA);
    const marcador = nombreTecnico(ascii(p.tipo));
    if (p.tipo === "udes") {
      inventario.quitar("comentario", marcador, tamano);
      leerUdes(inventario, cuerpo(bytes, p));
    } else inventario.quitar("auxiliar", marcador, tamano);
  });

  // 5. Lo que se conserva con nombre: miniaturas y mapas auxiliares (profundidad, realce HDR).
  for (const r of heif.referencias) {
    if (!conservados.has(r.de)) continue;
    const u = ubicacionDe.get(r.de);
    const largo = u ? (bytesDeUbicacion(bytes, heif, u)?.length ?? 0) : 0;
    if (r.tipo === "thmb") inventario.conservar("miniatura", "thmb", largo);
    else if (r.tipo === "auxl") {
      inventario.conservar("imagenes-adicionales", "auxl", largo);
      inventario.avisar("heic-auxiliares");
    }
  }

  // 6. Cajas: las de arriba que no son la foto, las de `meta` que no se reescriben, y el texto de
  // `hdlr` y de `dref`.
  let enMdat = 0;
  for (const c of heif.superiores) {
    if (c.tipo === "ftyp" || c.tipo === "meta") continue;
    if (c.tipo === "mdat") {
      enMdat += c.hasta - c.datos;
      continue;
    }
    inventario.quitar(
      "auxiliar",
      nombreTecnico(ascii(c.tipo)),
      c.hasta - c.desde,
    );
  }
  for (const c of heif.hijosDeMeta)
    if (!HIJOS_DE_META.has(c.tipo))
      inventario.quitar(
        "auxiliar",
        nombreTecnico(ascii(c.tipo)),
        c.hasta - c.desde,
      );
  if (heif.hdlrNombre > 0) inventario.quitar("texto", "hdlr", heif.hdlrNombre);
  if (heif.drefConTexto > 0)
    inventario.quitar("texto", "dref", heif.drefConTexto);

  // 7. Bytes que ningún elemento usa: dentro de `mdat` y de `idat` (lo que quedó de una edición,
  // por ejemplo), y después de la última caja.
  let usadosEnArchivo = 0;
  let usadosEnIdat = 0;
  for (const u of heif.ubicaciones)
    for (const t of u.tramos) {
      if (u.metodo === 0) usadosEnArchivo += t.largo;
      else if (u.metodo === 1) usadosEnIdat += t.largo;
    }
  if (enMdat > usadosEnArchivo)
    inventario.quitar("datos-sin-uso", "mdat", enMdat - usadosEnArchivo);
  const enIdat = heif.idat ? heif.idat.hasta - heif.idat.datos : 0;
  if (enIdat > usadosEnIdat)
    inventario.quitar("datos-sin-uso", "idat", enIdat - usadosEnIdat);
  if (heif.fin < bytes.length)
    inventario.quitar("bytes-sobrantes", "BMFF", bytes.length - heif.fin);

  return {
    heif,
    conservados,
    propiedadNueva,
    analisis: inventario.cerrar("heic"),
  };
}

/** Hijos de `meta` que la copia lleva (reescritos o tal cual). Los demás se quitan. */
const HIJOS_DE_META = new Set([
  "hdlr",
  "dinf",
  "pitm",
  "iinf",
  "iloc",
  "iref",
  "iprp",
  "idat",
  "grpl",
]);

/** `udes` (ISO/IEC 23008-12, 6.5.20): idioma, nombre, descripción y etiquetas, en texto libre. */
function leerUdes(inventario: Inventario, d: Uint8Array): void {
  let p = 4;
  const idioma = textoNulo(d, p);
  p = idioma.fin;
  for (const clave of ["name", "description", "tags"]) {
    const texto = textoNulo(d, p);
    p = texto.fin;
    const { texto: valor, cortado } = textoUtf8OLatin1(texto.bytes);
    inventario.campo(
      `udes:${clave}`,
      "comentario",
      "descripcion",
      valor,
      cortado,
    );
  }
}

// ── La copia limpia ─────────────────────────────────────────────────────────────────────────────

/** Bytes que crecen: la `meta` es pequeña (cientos de bytes, algunos KB con un perfil ICC). */
class Bytes {
  private readonly trozos: Uint8Array[] = [];
  private total = 0;

  get largo(): number {
    return this.total;
  }

  agregar(datos: Uint8Array): this {
    this.trozos.push(datos);
    this.total += datos.length;
    return this;
  }

  u8(v: number): this {
    return this.agregar(Uint8Array.of(v & 0xff));
  }

  u16(v: number): this {
    return this.agregar(Uint8Array.of((v >>> 8) & 0xff, v & 0xff));
  }

  u32(v: number): this {
    return this.agregar(
      Uint8Array.of(
        (v >>> 24) & 0xff,
        (v >>> 16) & 0xff,
        (v >>> 8) & 0xff,
        v & 0xff,
      ),
    );
  }

  /** Versión (1 byte) y banderas (3 bytes) de una caja completa. */
  completa(version: number, banderas: number): this {
    return this.u32(
      ((version & 0xff) * 0x1000000 + (banderas & 0xffffff)) >>> 0,
    );
  }

  resultado(): Uint8Array {
    const salida = new Uint8Array(this.total);
    let p = 0;
    for (const t of this.trozos) {
      salida.set(t, p);
      p += t.length;
    }
    return salida;
  }
}

function caja(tipo: string, contenido: Bytes): Uint8Array {
  return new Bytes()
    .u32(8 + contenido.largo)
    .agregar(ascii(tipo))
    .agregar(contenido.resultado())
    .resultado();
}

interface Ubicada {
  readonly id: number;
  readonly metodo: number;
  readonly tramos: readonly Tramo[];
}

/** La `meta` nueva. `ubicadas` trae ya los desplazamientos de la copia. */
function escribirMeta(
  bytes: Uint8Array,
  plan: Plan,
  ubicadas: readonly Ubicada[],
  idatNuevo: Uint8Array | null,
): Uint8Array {
  const { heif, conservados, propiedadNueva } = plan;
  const hijosNuevos = new Bytes();

  for (const c of heif.hijosDeMeta) {
    switch (c.tipo) {
      case "hdlr": {
        // Sin nombre: el campo es texto libre y la copia no lo necesita.
        const d = new Bytes().completa(0, 0).u32(0).agregar(ascii("pict"));
        d.u32(0).u32(0).u32(0).u8(0);
        hijosNuevos.agregar(caja("hdlr", d));
        break;
      }
      case "dinf": {
        // La forma canónica: una sola referencia, «este mismo archivo».
        const url = new Bytes().completa(0, 1);
        const dref = new Bytes()
          .completa(0, 0)
          .u32(1)
          .agregar(caja("url ", url));
        hijosNuevos.agregar(
          caja("dinf", new Bytes().agregar(caja("dref", dref))),
        );
        break;
      }
      case "pitm":
      case "grpl":
        hijosNuevos.agregar(bytes.subarray(c.desde, c.hasta));
        break;
      case "iinf": {
        const d = new Bytes().completa(heif.iinfVersion, 0);
        const vivos = heif.elementos.filter((e) => conservados.has(e.id));
        if (heif.iinfVersion === 0) d.u16(vivos.length);
        else d.u32(vivos.length);
        for (const e of vivos) {
          const infe = new Bytes().completa(e.version, e.banderas);
          if (e.version === 2) infe.u16(e.id);
          else infe.u32(e.id);
          infe.u16(0).agregar(ascii(e.tipo)).u8(0);
          d.agregar(caja("infe", infe));
        }
        hijosNuevos.agregar(caja("iinf", d));
        break;
      }
      case "iloc": {
        const v = heif.ilocVersion;
        // Desplazamientos y largos de 4 bytes, sin base ni índice.
        const d = new Bytes().completa(v, 0).u16(0x4400);
        if (v < 2) d.u16(ubicadas.length);
        else d.u32(ubicadas.length);
        for (const u of ubicadas) {
          if (v < 2) d.u16(u.id);
          else d.u32(u.id);
          if (v >= 1) d.u16(u.metodo);
          d.u16(0).u16(u.tramos.length);
          for (const t of u.tramos) d.u32(t.desplazamiento).u32(t.largo);
        }
        hijosNuevos.agregar(caja("iloc", d));
        break;
      }
      case "iref": {
        const vivas = heif.referencias
          .filter((r) => conservados.has(r.de))
          .map((r) => ({ ...r, a: r.a.filter((id) => conservados.has(id)) }))
          .filter((r) => r.a.length > 0);
        if (vivas.length === 0) break;
        const d = new Bytes().completa(heif.irefVersion, 0);
        const id = (b: Bytes, v: number) =>
          heif.irefVersion === 0 ? b.u16(v) : b.u32(v);
        for (const r of vivas) {
          const ref = new Bytes();
          id(ref, r.de).u16(r.a.length);
          for (const a of r.a) id(ref, a);
          d.agregar(caja(r.tipo, ref));
        }
        hijosNuevos.agregar(caja("iref", d));
        break;
      }
      case "iprp": {
        const ipco = new Bytes();
        heif.propiedades.forEach((p, i) => {
          if (propiedadNueva.has(i + 1))
            ipco.agregar(bytes.subarray(p.desde, p.hasta));
        });
        const iprp = new Bytes().agregar(caja("ipco", ipco));
        for (const ipma of heif.ipmas) {
          const vivas = ipma.entradas.filter((e) => conservados.has(e.id));
          const d = new Bytes()
            .completa(ipma.version, ipma.banderas)
            .u32(vivas.length);
          for (const e of vivas) {
            if (ipma.version < 1) d.u16(e.id);
            else d.u32(e.id);
            const asociaciones = e.asociaciones.filter((a) =>
              propiedadNueva.has(a.indice),
            );
            d.u8(asociaciones.length);
            for (const a of asociaciones) {
              const indice = propiedadNueva.get(a.indice)!;
              if (ipma.banderas & 1) d.u16((a.esencial ? 0x8000 : 0) | indice);
              else d.u8((a.esencial ? 0x80 : 0) | indice);
            }
          }
          iprp.agregar(caja("ipma", d));
        }
        hijosNuevos.agregar(caja("iprp", iprp));
        break;
      }
      case "idat":
        if (idatNuevo !== null)
          hijosNuevos.agregar(caja("idat", new Bytes().agregar(idatNuevo)));
        break;
    }
  }
  return caja(
    "meta",
    new Bytes().completa(0, 0).agregar(hijosNuevos.resultado()),
  );
}

function escribir(bytes: Uint8Array, plan: Plan): Uint8Array {
  const { heif, conservados } = plan;
  const vivas = heif.ubicaciones.filter((u) => conservados.has(u.id));

  // `idat` nuevo: solo los tramos de los elementos conservados, en su orden.
  let idatNuevo: Uint8Array | null = null;
  const enIdat = new Map<Ubicacion, Tramo[]>();
  if (vivas.some((u) => u.metodo === 1)) {
    const idat = new Bytes();
    const datosDeIdat = cuerpo(bytes, heif.idat!);
    for (const u of vivas) {
      if (u.metodo !== 1) continue;
      const nuevos: Tramo[] = [];
      for (const t of u.tramos) {
        nuevos.push({ desplazamiento: idat.largo, largo: t.largo });
        idat.agregar(tramo(datosDeIdat, t.desplazamiento, t.largo));
      }
      enIdat.set(u, nuevos);
    }
    idatNuevo = idat.resultado();
  }

  // `mdat` nuevo: los tramos en el ORDEN en que estaban en el archivo (desempate: orden de `iloc`).
  const enArchivo: { u: Ubicacion; e: number; t: Tramo; orden: number }[] = [];
  let orden = 0;
  for (const u of vivas)
    if (u.metodo === 0)
      u.tramos.forEach((t, e) => enArchivo.push({ u, e, t, orden: orden++ }));
  enArchivo.sort(
    (a, b) => a.t.desplazamiento - b.t.desplazamiento || a.orden - b.orden,
  );
  const relativo = new Map<Ubicacion, number[]>();
  let largoDelMdat = 0;
  for (const x of enArchivo) {
    const lista = relativo.get(x.u) ?? [];
    lista[x.e] = largoDelMdat;
    relativo.set(x.u, lista);
    largoDelMdat += x.t.largo;
  }

  const ubicadasCon = (base: number): Ubicada[] =>
    vivas.map((u) => ({
      id: u.id,
      metodo: u.metodo,
      tramos:
        u.metodo === 1
          ? enIdat.get(u)!
          : u.tramos.map((t, e) => ({
              desplazamiento: base + relativo.get(u)![e],
              largo: t.largo,
            })),
    }));

  // El tamaño de la `meta` no depende de los desplazamientos (todos de 4 bytes): se mide una vez
  // con ceros y se escribe de nuevo con los de verdad.
  const ftyp = bytes.subarray(heif.ftyp.desde, heif.ftyp.hasta);
  const medida = escribirMeta(bytes, plan, ubicadasCon(0), idatNuevo).length;
  const base = ftyp.length + medida + 8;
  const meta = escribirMeta(bytes, plan, ubicadasCon(base), idatNuevo);

  const salida = new Uint8Array(base + largoDelMdat);
  salida.set(ftyp, 0);
  salida.set(meta, ftyp.length);
  const cabecera = new Bytes().u32(8 + largoDelMdat).agregar(ascii("mdat"));
  salida.set(cabecera.resultado(), ftyp.length + meta.length);
  let p = base;
  for (const x of enArchivo) {
    salida.set(tramo(bytes, x.t.desplazamiento, x.t.largo), p);
    p += x.t.largo;
  }
  return salida;
}

export function analizarHeic(bytes: Uint8Array): AnalisisDeMetadatos {
  return planear(bytes).analisis;
}

export function limpiarHeic(bytes: Uint8Array): Limpieza {
  const plan = planear(bytes);
  return {
    bytes: escribir(bytes, plan),
    quitados: plan.analisis.quitables,
    conservados: plan.analisis.conservables,
    idNuevo: null,
  };
}
