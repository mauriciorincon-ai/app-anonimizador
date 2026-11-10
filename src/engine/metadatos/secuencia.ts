// Secuencias HEIF y el video de una Live Photo (S11) — limpiar sin mover un byte de lugar.
//
// Una secuencia de imágenes HEIC o AVIF (ISO/IEC 23008-12, 7) y un `.mov` de QuickTime son la misma
// familia de cajas que una foto HEIF, pero con PISTAS: una caja `moov` con un `trak` por pista, y en
// cada pista unas tablas (`stco`/`co64`, `stsc`, `stsz`) que dicen en qué desplazamiento ABSOLUTO del
// archivo empieza cada muestra. Rearmar la copia como se rearma una foto fija obligaría a reescribir
// todas esas tablas, y una tabla mal reescrita es un video que no abre. Por eso aquí no se mueve un
// byte de lugar: la copia tiene el MISMO largo (salvo los bytes sobrantes del final, que no apuntan
// a nada) y cada byte que no es un metadato queda idéntico y en el mismo desplazamiento.
//
// Lo que se quita se sobrescribe en su sitio:
//   · una caja que se va (`udta`, un elemento de `ilst`, una caja que Velo no conoce) pasa a `free`
//     —el código que la norma reserva para «aquí no hay nada»—, con su tamaño de siempre y su
//     contenido en ceros;
//   · las fechas de `mvhd`, `tkhd` y `mdhd` pasan a 0 (la norma lo permite: «sin fecha»);
//   · el nombre de cada `hdlr`, y el fabricante y el nombre del compresor de cada pista de video o
//     de sonido, pasan a ceros;
//   · una pista de metadatos con tiempo (`mebx`, la que guarda la ubicación cuadro a cuadro, o
//     cualquier pista que no sea imagen ni sonido) conserva su estructura y sus muestras quedan en
//     ceros; las de la Live Photo que hacen falta para que funcione (el instante de la foto) se
//     quedan;
//   · la pista de código de tiempo (`tmcd`) también: su muestra es el número del primer cuadro, que
//     en una cámara es la hora del día en que empezó a grabar, y su descripción puede traer un
//     rótulo de carrete (`name`, texto libre). Ninguno hace falta para reproducir: el código de
//     tiempo pasa a cero y el rótulo se va;
//   · los bytes del `mdat` que no son de ninguna muestra ni de ningún elemento se ponen en ceros;
//   · si además hay una foto fija (una caja `meta` arriba, como la que escribe ffmpeg en un AVIF
//     animado), su `meta` se reescribe del MISMO tamaño, con relleno `free`, y los desplazamientos de
//     `iloc` siguen apuntando a los mismos bytes.
//
// Se conserva, y el certificado lo dice, `com.apple.quicktime.content.identifier`: el número al azar
// (un UUID, no un dato personal) con el que Fotos empareja el video con su foto. La lista blanca y el
// rechazo de lo que no se sabe limpiar sin romper son los de la foto fija (`heic.ts`): un video
// fragmentado (`moof`), datos que viven en otro archivo o una tabla de muestras que no cuadra se
// rechazan con su nombre (`imagen-no-soportada`). Las normas: ISO/IEC 14496-12 (8.2 a 8.7: `mvhd`,
// `tkhd`, `mdhd`, `hdlr`, `stbl`; 8.1.2: `free`), y Apple, «QuickTime File Format» («Metadata»:
// `keys`, `ilst`, `mebx`; «User Data Atoms»: `udta` y sus `©xyz`).

import {
  anotarCajasDeMeta,
  type Caja,
  codigoEn,
  cuerpo,
  hijos,
  leerFtyp,
  leerMeta,
  leerSuperiores,
  metaEnSuSitio,
  NO_SOPORTADA,
  planearMeta,
  type Tramo,
  tramosEnElArchivo,
} from "./heic";
import { Inventario } from "./inventario";
import {
  ascii,
  fallar,
  nombreTecnico,
  textoUtf8Laxo,
  u16be,
  u32be,
  u8,
} from "./lector-binario";
import type {
  AnalisisDeMetadatos,
  FormatoBmff,
  Limpieza,
  Revela,
} from "./tipos";

/** El tope de muestras de TODO el archivo: un video de 100 MB trae decenas de miles. */
const MAXIMO_DE_MUESTRAS = 1_000_000;

/** Pistas que son la imagen o el sonido: se conservan con sus muestras. */
const PISTAS_QUE_SE_CONSERVAN = new Set(["vide", "soun", "pict", "auxv"]);

/** Pistas con fondo de video o de sonido: su descripción trae fabricante y, la de video, compresor. */
const PISTAS_CON_FABRICANTE = new Set(["vide", "soun", "pict", "auxv"]);

/**
 * Claves de una pista de metadatos de la Live Photo que hacen falta para que funcione: el instante
 * de la foto dentro del video y los datos de estabilización. No dicen nada de quién, dónde ni con qué.
 */
const CLAVES_DE_PISTA_QUE_SE_CONSERVAN = new Set([
  "com.apple.quicktime.still-image-time",
  "com.apple.quicktime.live-photo-info",
]);

/**
 * El largo que la norma le da al cuerpo de una caja que se conserva (ISO/IEC 14496-12 § 8 y QuickTime
 * File Format), o `null` si no tiene uno fijo. Lo que sobra después no lo lee ningún reproductor y en
 * él cabe cualquier cosa, incluso cajas hermanas que una caja agrandada se tragó: va a ceros.
 */
function largoDelCuerpo(b: Uint8Array, caja: Caja): number | null {
  const largo = caja.hasta - caja.datos;
  if (largo < 4) fallar();
  const version = u8(b, caja.datos);
  const cuenta = (p: number) => {
    if (p + 4 > largo) fallar();
    return u32be(b, caja.datos + p);
  };
  switch (caja.tipo) {
    case "mvhd":
      return version === 1 ? 112 : 100;
    case "tkhd":
      return version === 1 ? 96 : 84;
    case "mdhd":
      return version === 1 ? 36 : 24;
    case "vmhd":
      return 12;
    case "smhd":
      return 8;
    case "nmhd":
    case "sthd":
      return 4;
    case "hmhd":
      return 20;
    case "cslg":
      return version === 1 ? 44 : 24;
    case "stts":
    case "ctts":
    case "co64":
      return 8 + 8 * cuenta(4);
    case "stss":
    case "stps":
    case "stco":
      return 8 + 4 * cuenta(4);
    case "stsc":
      return 8 + 12 * cuenta(4);
    case "stsz":
      return cuenta(4) === 0 ? 12 + 4 * cuenta(8) : 12;
    default:
      return null;
  }
}

/** La única clave de `ilst` que se queda: el UUID que empareja el video con su foto. */
const CLAVE_DE_PAREJA = "com.apple.quicktime.content.identifier";

/** Cajas que Velo reconoce y conserva tal cual dentro de `moov` (sin bajar a sus hijos). */
const CAJAS_QUE_SE_CONSERVAN = new Set([
  "iods",
  "edts",
  "tref",
  "tapt",
  "load",
  "elng",
  "vmhd",
  "smhd",
  "gmhd",
  "nmhd",
  "sthd",
  "hmhd",
  "stts",
  "ctts",
  "cslg",
  "stss",
  "stps",
  "sdtp",
  "stsc",
  "stsz",
  "stco",
  "co64",
  "sgpd",
  "sbgp",
  "subs",
  "saiz",
  "saio",
  "stsh",
  "stdp",
  "padb",
  "stsd",
]);

/** Lo que significa un video fragmentado: las muestras viven en `moof`, y eso no se limpia aquí. */
const CAJAS_DE_FRAGMENTOS = new Set(["moof", "mfra", "mvex", "sidx", "ssix"]);

/** Relleno, por la norma (ISO/IEC 14496-12, 8.1.2) y por QuickTime (`wide`). */
const CAJAS_DE_RELLENO = new Set(["free", "skip", "wide"]);

// ── Lo que se cambia en la copia ────────────────────────────────────────────────────────────────

/** Los cambios, todos en su sitio. La copia los aplica sobre los bytes de la entrada. */
interface Parches {
  /** Tramos `[desde, hasta)` que quedan en ceros. */
  readonly ceros: [number, number][];
  /** Posiciones de cajas que pasan a `free` (se cambia su código; el tamaño se queda). */
  readonly libres: number[];
  /** Bytes que se escriben encima, del mismo largo (la `meta` de la foto fija). */
  readonly encima: { pos: number; bytes: Uint8Array }[];
  /** El largo de la copia: el de la entrada sin los bytes sobrantes del final. */
  largo: number;
}

function hayAlgo(bytes: Uint8Array, desde: number, hasta: number): boolean {
  for (let i = desde; i < hasta; i++) if (bytes[i] !== 0) return true;
  return false;
}

/** Un marcador legible para un código de QuickTime: `©xyz` lleva el byte 0xA9 delante. */
function marcadorDe(bytes: Uint8Array, caja: Caja): string {
  if (bytes[caja.desde + 4] === 0xa9)
    return `©${codigoEn(bytes, caja.desde + 4).slice(1)}`;
  return nombreTecnico(bytes.subarray(caja.desde + 4, caja.desde + 8));
}

/** Qué revela una clave de QuickTime, por su nombre. Lo que no se reconoce es «otro». */
function revelaDe(clave: string): Revela {
  const k = clave.toLowerCase();
  if (k.includes("location") || k === "©xyz") return "ubicacion";
  if (/\b(make|model)\b|©mak|©mod|camera|lens|device/.test(k))
    return "dispositivo";
  if (/software|©swr|©too|encoder/.test(k)) return "software";
  if (/date|©day/.test(k)) return "fecha";
  if (/author|artist|©art|©aut|owner|copyright|©cpy/.test(k)) return "autoria";
  if (/identifier|uuid/.test(k)) return "identificador";
  if (/title|description|comment|keyword|©nam|©des|©cmt|©inf/.test(k))
    return "descripcion";
  return "otro";
}

// ── Fechas ──────────────────────────────────────────────────────────────────────────────────────

/** Segundos entre el 1904-01-01 de QuickTime y el 1970-01-01 de Unix. */
const DE_1904_A_1970 = 2_082_844_800;

/** Una fecha de `mvhd` (segundos desde 1904, UTC) como ISO 8601, sin pasar por el reloj del sistema. */
function fechaIso(segundos1904: number): string {
  const s = segundos1904 - DE_1904_A_1970;
  const dias = Math.floor(s / 86_400);
  const resto = s - dias * 86_400;
  // Días → fecha civil (H. Hinnant, «chrono-compatible low-level date algorithms»).
  const z = dias + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36_524) -
      Math.floor(doe / 146_096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const dos = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(resto / 3600);
  const mi = Math.floor((resto % 3600) / 60);
  return `${y}-${dos(m)}-${dos(d)}T${dos(h)}:${dos(mi)}:${dos(resto % 60)}Z`;
}

// ── El recorrido ────────────────────────────────────────────────────────────────────────────────

/** Una pista leída: su tipo y dónde están sus muestras (un tramo por bloque de muestras). */
interface Pista {
  manejador: string;
  bloques: Tramo[];
  /** La primera muestra, para leer lo que dice una pista de metadatos. */
  primera: Tramo | null;
  /** Las claves de su descripción `mebx` (vacío si no es una pista de metadatos de QuickTime). */
  claves: string[];
  /** Fabricante y compresor de su descripción: tramos que se ponen en ceros si traen algo. */
  rotulos: Tramo[];
}

class Recorrido {
  readonly inventario = new Inventario();
  readonly parches: Parches = { ceros: [], libres: [], encima: [], largo: 0 };
  readonly pistas: Pista[] = [];
  private muestras = 0;

  constructor(private readonly bytes: Uint8Array) {}

  private ceros(desde: number, hasta: number): void {
    if (hasta > desde) this.parches.ceros.push([desde, hasta]);
  }

  /** La caja se va: pasa a `free` del mismo tamaño, con el contenido en ceros. */
  liberar(caja: Caja): void {
    this.parches.libres.push(caja.desde);
    this.ceros(caja.datos, caja.hasta);
  }

  /** Una caja que Velo no conoce dentro de `moov`: se va, con su nombre técnico. */
  desconocida(caja: Caja): void {
    this.inventario.quitar(
      "auxiliar",
      marcadorDe(this.bytes, caja),
      caja.hasta - caja.desde,
    );
    this.liberar(caja);
  }

  /** `free`, `skip`, `wide`: su contenido no lo usa nadie; si trae algo, se pone en ceros. */
  relleno(caja: Caja): void {
    if (!hayAlgo(this.bytes, caja.datos, caja.hasta)) return;
    this.inventario.quitar(
      "datos-sin-uso",
      codigoEn(this.bytes, caja.desde + 4),
      caja.hasta - caja.datos,
    );
    this.ceros(caja.datos, caja.hasta);
  }

  /** Una caja de largo fijo: más corta es un archivo roto; lo que le sobra va a ceros. */
  sobrante(caja: Caja): void {
    const largo = largoDelCuerpo(this.bytes, caja);
    if (largo === null) return;
    const fin = caja.datos + largo;
    if (fin > caja.hasta) fallar();
    if (!hayAlgo(this.bytes, fin, caja.hasta)) return;
    this.inventario.quitar(
      "datos-sin-uso",
      codigoEn(this.bytes, caja.desde + 4),
      caja.hasta - fin,
    );
    this.ceros(fin, caja.hasta);
  }

  /** `mvhd`, `tkhd`, `mdhd`: las fechas de creación y de cambio (versión 0: 4 bytes; 1: 8). */
  fechas(caja: Caja, marcador: string, leerComoCampo: boolean): void {
    this.sobrante(caja);
    const version = u8(this.bytes, caja.datos);
    const desde = caja.datos + 4;
    const hasta = desde + (version === 1 ? 16 : 8);
    if (hasta > caja.hasta) fallar();
    if (!hayAlgo(this.bytes, desde, hasta)) return;
    this.inventario.quitar("fecha-de-creacion", marcador, hasta - desde);
    if (leerComoCampo) {
      // Con la versión 1 la mitad alta tiene que ser 0: una fecha más allá del año 2040 no se lee.
      const segundos =
        version === 1
          ? u32be(this.bytes, desde) === 0
            ? u32be(this.bytes, desde + 4)
            : 0
          : u32be(this.bytes, desde);
      if (segundos > 0)
        this.inventario.campo(
          `${marcador}:creation_time`,
          "quicktime",
          "fecha",
          fechaIso(segundos),
        );
    }
    this.ceros(desde, hasta);
  }

  /** `hdlr`: el tipo de manejador se queda; el nombre (texto libre) pasa a ceros. */
  manejador(caja: Caja): string {
    const d = cuerpo(this.bytes, caja);
    if (d.length < 24) fallar();
    const tipo = codigoEn(d, 8);
    if (hayAlgo(this.bytes, caja.datos + 24, caja.hasta)) {
      this.inventario.quitar("texto", "hdlr", caja.hasta - caja.datos - 24);
      this.ceros(caja.datos + 24, caja.hasta);
    }
    return tipo;
  }

  /** `dinf`/`dref`: solo «este mismo archivo». Un dato que vive en otro archivo no se limpia aquí. */
  referencias(caja: Caja): void {
    for (const dref of hijos(this.bytes, caja.datos, caja.hasta)) {
      if (dref.tipo !== "dref") continue;
      for (const entrada of hijos(this.bytes, dref.datos + 8, dref.hasta)) {
        if (entrada.hasta - entrada.datos < 4) fallar();
        const banderas = u32be(this.bytes, entrada.datos) & 0xffffff;
        if ((banderas & 1) !== 1) fallar(NO_SOPORTADA);
        if (hayAlgo(this.bytes, entrada.datos + 4, entrada.hasta)) {
          this.inventario.quitar(
            "texto",
            "dref",
            entrada.hasta - entrada.datos - 4,
          );
          this.ceros(entrada.datos + 4, entrada.hasta);
        }
      }
    }
  }

  // ── `udta` y `meta` de QuickTime ──────────────────────────────────────────────────────────────

  /** Un texto de `©xyz` y compañía: tamaño (2), idioma (2) y el texto. */
  private textoInternacional(caja: Caja): string {
    const d = cuerpo(this.bytes, caja);
    if (d.length < 4) return "";
    const largo = Math.min(u16be(d, 0), d.length - 4);
    return textoUtf8Laxo(d.subarray(4, 4 + largo), 1024);
  }

  /** Lo que dice el valor de un elemento de `ilst`: su caja `data`, si es texto UTF-8 (tipo 1). */
  private valorDeIlst(item: Caja): string {
    for (const data of hijos(this.bytes, item.datos, item.hasta)) {
      if (data.tipo !== "data" || data.hasta - data.datos < 8) continue;
      if ((u32be(this.bytes, data.datos) & 0xffffff) !== 1) return "";
      return textoUtf8Laxo(
        this.bytes.subarray(data.datos + 8, data.hasta),
        1024,
      );
    }
    return "";
  }

  /** `udta`: entera se va. Antes se lee lo que dice, para el certificado. */
  datosDeUsuario(caja: Caja): void {
    if (!hayAlgo(this.bytes, caja.datos, caja.hasta)) {
      this.parches.libres.push(caja.desde);
      return;
    }
    this.inventario.quitar(
      "metadatos-de-video",
      "udta",
      caja.hasta - caja.desde,
    );
    for (const c of hijos(this.bytes, caja.datos, caja.hasta)) {
      if (this.bytes[c.desde + 4] === 0xa9) {
        const clave = marcadorDe(this.bytes, c);
        this.inventario.campo(
          clave,
          "quicktime",
          revelaDe(clave),
          this.textoInternacional(c),
        );
      } else if (c.tipo === "meta") {
        // La `meta` dentro de `udta`: la de iTunes (`mdir`, elementos con código) o la de QuickTime
        // (`mdta`, elementos con el número de su clave en `keys`), que es la que escribe ffmpeg.
        for (const { clave, item } of this.elementosDeIlst(c))
          this.inventario.campo(clave, "quicktime", revelaDe(clave), this.valorDeIlst(item));
      }
    }
    this.liberar(caja);
  }

  /** Los hijos de una `meta`: la de QuickTime no trae versión ni banderas; la ISO, sí. */
  private hijosDeMetaQuickTime(meta: Caja): Caja[] {
    if (
      meta.hasta - meta.datos >= 8 &&
      codigoEn(this.bytes, meta.datos + 4) === "hdlr"
    )
      return hijos(this.bytes, meta.datos, meta.hasta);
    if (
      meta.hasta - meta.datos >= 12 &&
      codigoEn(this.bytes, meta.datos + 8) === "hdlr"
    )
      return hijos(this.bytes, meta.datos + 4, meta.hasta);
    return [];
  }

  /** Los nombres de `keys` (QuickTime): versión y banderas, cuántas, y cada una con su espacio. */
  private claves(keys: Caja): string[] {
    const d = cuerpo(this.bytes, keys);
    const cuenta = u32be(d, 4);
    const lista: string[] = [];
    let p = 8;
    for (let i = 0; i < cuenta; i++) {
      const largo = u32be(d, p);
      if (largo < 8 || p + largo > d.length) fallar();
      lista.push(textoUtf8Laxo(d.subarray(p + 8, p + largo), 256));
      p += largo;
    }
    return lista;
  }

  /** Cómo se llama un elemento de `ilst`: por su clave de `keys` (QuickTime) o por su código (iTunes). */
  private clavesDeIlst(hijosDeMeta: readonly Caja[]): (item: Caja) => string {
    const keys = hijosDeMeta.find((c) => c.tipo === "keys");
    const nombres = keys ? this.claves(keys) : [];
    return (item) =>
      nombres[u32be(this.bytes, item.desde + 4) - 1] ?? marcadorDe(this.bytes, item);
  }

  private elementosDeIlst(meta: Caja): { clave: string; item: Caja }[] {
    const hijosDeMeta = this.hijosDeMetaQuickTime(meta);
    const ilst = hijosDeMeta.find((h) => h.tipo === "ilst");
    if (!ilst) return [];
    const claveDe = this.clavesDeIlst(hijosDeMeta);
    return hijos(this.bytes, ilst.datos, ilst.hasta)
      .filter((item) => !CAJAS_DE_RELLENO.has(item.tipo))
      .map((item) => ({ clave: claveDe(item), item }));
  }

  /**
   * Una `meta` dentro de `moov` o de una pista: `hdlr` + `keys` + `ilst`. Cada elemento de `ilst`
   * se llama por el número de su clave; todos se van a `free` menos el UUID de la pareja.
   */
  metaQuickTime(meta: Caja): void {
    const hijosDeMeta = this.hijosDeMetaQuickTime(meta);
    if (hijosDeMeta.length === 0) {
      this.desconocida(meta);
      return;
    }
    const claveDe = this.clavesDeIlst(hijosDeMeta);
    for (const c of hijosDeMeta) {
      if (c.tipo === "hdlr") this.manejador(c);
      else if (c.tipo === "keys") continue;
      else if (CAJAS_DE_RELLENO.has(c.tipo)) this.relleno(c);
      else if (c.tipo === "ilst") {
        for (const item of hijos(this.bytes, c.datos, c.hasta)) {
          if (CAJAS_DE_RELLENO.has(item.tipo)) {
            this.relleno(item);
            continue;
          }
          const clave = claveDe(item);
          const tamano = item.hasta - item.desde;
          if (clave === CLAVE_DE_PAREJA) {
            this.inventario.conservar(
              "identificador-de-pareja",
              "ilst",
              tamano,
            );
            this.inventario.avisar("live-photo-identificador");
            continue;
          }
          this.inventario.quitar("metadatos-de-video", "ilst", tamano);
          this.inventario.campo(
            clave,
            "quicktime",
            revelaDe(clave),
            this.valorDeIlst(item),
          );
          this.liberar(item);
        }
      } else this.desconocida(c);
    }
  }

  // ── Las pistas ────────────────────────────────────────────────────────────────────────────────

  /** `stsd`: las claves de una descripción `mebx` y los rótulos de una de video o de sonido. */
  private descripciones(stsd: Caja, pista: Pista): void {
    const entradas = hijos(this.bytes, stsd.datos + 8, stsd.hasta);
    for (const e of entradas) {
      if (e.tipo === "mebx") {
        // 6 reservados + 2 de referencia, y luego cajas: `keys` con una caja por clave local.
        for (const c of hijos(this.bytes, e.datos + 8, e.hasta)) {
          if (c.tipo !== "keys") continue;
          for (const local of hijos(this.bytes, c.datos, c.hasta))
            for (const keyd of hijos(this.bytes, local.datos, local.hasta))
              if (keyd.tipo === "keyd" && keyd.hasta - keyd.datos >= 4)
                pista.claves.push(
                  textoUtf8Laxo(
                    this.bytes.subarray(keyd.datos + 4, keyd.hasta),
                    256,
                  ),
                );
        }
      } else if (pista.manejador === "tmcd") {
        // 6 reservados + 2 de referencia + 18 de la descripción del código de tiempo, y luego cajas
        // opcionales: `name` es el rótulo del carrete, texto libre.
        const desde = e.datos + 26;
        if (desde < e.hasta)
          for (const c of hijos(this.bytes, desde, e.hasta)) this.comun(c);
      } else if (PISTAS_CON_FABRICANTE.has(pista.manejador)) {
        // Fabricante (4 bytes en +12); en video, además, el nombre del compresor (32 en +42).
        if (e.datos + 16 <= e.hasta)
          pista.rotulos.push({ desplazamiento: e.datos + 12, largo: 4 });
        if (pista.manejador !== "soun" && e.datos + 74 <= e.hasta)
          pista.rotulos.push({ desplazamiento: e.datos + 42, largo: 32 });
      }
    }
  }

  /** `stbl`: dónde está cada bloque de muestras (`stco`/`co64` + `stsc` + `stsz`). */
  private muestrasDe(stbl: Caja, pista: Pista): void {
    const cajas = hijos(this.bytes, stbl.datos, stbl.hasta);
    const una = (tipo: string) => cajas.find((c) => c.tipo === tipo) ?? null;
    if (una("stz2")) fallar(NO_SOPORTADA);
    for (const c of cajas)
      if (c.tipo === "stsd") this.descripciones(c, pista);
      else this.comun(c);
    const stsd = una("stsd");
    if (!stsd) fallar();
    const stsc = una("stsc");
    const stsz = una("stsz");
    const stco = una("stco") ?? una("co64");
    if (!stsc || !stsz || !stco) return;

    const b = this.bytes;
    const ancho = stco.tipo === "co64" ? 8 : 4;
    const bloques = u32be(b, stco.datos + 4);
    if (bloques * ancho > stco.hasta - stco.datos - 8) fallar();
    const inicioDe = (i: number) => {
      const p = stco.datos + 8 + i * ancho;
      if (ancho === 4) return u32be(b, p);
      if (u32be(b, p) !== 0) fallar();
      return u32be(b, p + 4);
    };

    const tamanoFijo = u32be(b, stsz.datos + 4);
    const cuenta = u32be(b, stsz.datos + 8);
    if (tamanoFijo === 0 && cuenta * 4 > stsz.hasta - stsz.datos - 12) fallar();
    this.muestras += cuenta;
    if (this.muestras > MAXIMO_DE_MUESTRAS) fallar(NO_SOPORTADA);
    const tamanoDe = (i: number) =>
      tamanoFijo !== 0 ? tamanoFijo : u32be(b, stsz.datos + 12 + i * 4);

    const corridas = u32be(b, stsc.datos + 4);
    if (corridas * 12 > stsc.hasta - stsc.datos - 8) fallar();
    let muestra = 0;
    for (let r = 0; r < corridas; r++) {
      const p = stsc.datos + 8 + r * 12;
      const primero = u32be(b, p);
      const porBloque = u32be(b, p + 4);
      const siguiente = r + 1 < corridas ? u32be(b, p + 12) : bloques + 1;
      if (primero < 1 || siguiente < primero || siguiente > bloques + 1)
        fallar();
      for (let c = primero; c < siguiente; c++) {
        const desde = inicioDe(c - 1);
        let largo = 0;
        for (let k = 0; k < porBloque; k++) {
          if (muestra >= cuenta) fallar();
          const t = tamanoDe(muestra);
          if (muestra === 0)
            pista.primera = { desplazamiento: desde, largo: t };
          largo += t;
          muestra++;
        }
        if (largo > 0) pista.bloques.push({ desplazamiento: desde, largo });
      }
    }
    if (muestra !== cuenta) fallar();
  }

  private informacion(minf: Caja, pista: Pista): void {
    for (const c of hijos(this.bytes, minf.datos, minf.hasta)) {
      if (c.tipo === "stbl") this.muestrasDe(c, pista);
      else if (c.tipo === "dinf") this.referencias(c);
      else if (c.tipo === "hdlr") this.manejador(c);
      else this.comun(c);
    }
  }

  private medio(mdia: Caja, pista: Pista): void {
    for (const c of hijos(this.bytes, mdia.datos, mdia.hasta)) {
      if (c.tipo === "mdhd") this.fechas(c, "mdhd", false);
      else if (c.tipo === "hdlr") pista.manejador = this.manejador(c);
      else if (c.tipo === "minf") this.informacion(c, pista);
      else this.comun(c);
    }
  }

  pista(trak: Caja): void {
    const pista: Pista = {
      manejador: "",
      bloques: [],
      primera: null,
      claves: [],
      rotulos: [],
    };
    // `mdia` primero: el tipo de pista lo dice su `hdlr`, y la descripción depende de él.
    const cajas = hijos(this.bytes, trak.datos, trak.hasta);
    for (const c of cajas) if (c.tipo === "mdia") this.medio(c, pista);
    for (const c of cajas) {
      if (c.tipo === "mdia") continue;
      if (c.tipo === "tkhd") this.fechas(c, "tkhd", false);
      else this.comun(c);
    }
    this.pistas.push(pista);
  }

  /** Lo que puede aparecer en cualquier nivel de `moov`. */
  comun(c: Caja): void {
    if (c.tipo === "udta") this.datosDeUsuario(c);
    else if (c.tipo === "meta") this.metaQuickTime(c);
    else if (CAJAS_DE_RELLENO.has(c.tipo)) this.relleno(c);
    else if (CAJAS_DE_FRAGMENTOS.has(c.tipo)) fallar(NO_SOPORTADA);
    else if (CAJAS_QUE_SE_CONSERVAN.has(c.tipo)) this.sobrante(c);
    else this.desconocida(c);
  }

  pelicula(moov: Caja): void {
    for (const c of hijos(this.bytes, moov.datos, moov.hasta)) {
      if (c.tipo === "mvhd") this.fechas(c, "mvhd", true);
      else if (c.tipo === "trak") this.pista(c);
      else this.comun(c);
    }
  }

  /**
   * Lo que se hace con las muestras de cada pista. Devuelve los tramos que SE QUEDAN; los de las
   * pistas de metadatos que se van quedan fuera, y el recorrido del `mdat` los pone en ceros.
   */
  decidirPistas(): { quedan: Tramo[]; todos: Tramo[] } {
    const quedan: Tramo[] = [];
    const todos: Tramo[] = [];
    for (const pista of this.pistas) {
      todos.push(...pista.bloques);
      for (const r of pista.rotulos)
        if (hayAlgo(this.bytes, r.desplazamiento, r.desplazamiento + r.largo)) {
          this.inventario.quitar("texto", "stsd", r.largo);
          this.ceros(r.desplazamiento, r.desplazamiento + r.largo);
        }
      const seQueda =
        PISTAS_QUE_SE_CONSERVAN.has(pista.manejador) ||
        (pista.claves.length > 0 &&
          pista.claves.every((k) => CLAVES_DE_PISTA_QUE_SE_CONSERVAN.has(k)));
      if (seQueda) {
        quedan.push(...pista.bloques);
        continue;
      }
      const conAlgo = pista.bloques.filter((t) =>
        hayAlgo(this.bytes, t.desplazamiento, t.desplazamiento + t.largo),
      );
      if (conAlgo.length === 0) continue;
      const bytesDeLaPista = pista.bloques.reduce((n, t) => n + t.largo, 0);
      const marcador =
        pista.claves.length > 0
          ? "mebx"
          : nombreTecnico(ascii(pista.manejador));
      this.inventario.quitar("pista-de-metadatos", marcador, bytesDeLaPista);
      // Lo que decía, si es una ubicación en texto: la primera muestra es `[largo][clave][valor]`.
      const ubicacion = pista.claves.findIndex((k) => k.includes("location"));
      if (ubicacion >= 0 && pista.primera) {
        const m = pista.primera;
        if (m.largo >= 8 && m.desplazamiento + m.largo <= this.bytes.length) {
          const valor = this.bytes.subarray(
            m.desplazamiento + 8,
            m.desplazamiento + m.largo,
          );
          this.inventario.campo(
            pista.claves[ubicacion],
            "quicktime",
            "ubicacion",
            textoUtf8Laxo(valor, 1024),
          );
        }
      }
    }
    return { quedan, todos };
  }
}

// ── El plan y la copia ──────────────────────────────────────────────────────────────────────────

/** Une tramos solapados o contiguos, en orden. */
function unir(tramos: readonly Tramo[]): [number, number][] {
  const orden = tramos
    .filter((t) => t.largo > 0)
    .map((t): [number, number] => [
      t.desplazamiento,
      t.desplazamiento + t.largo,
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lista: [number, number][] = [];
  for (const [d, h] of orden) {
    const ultimo = lista[lista.length - 1];
    if (ultimo && d <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], h);
    else lista.push([d, h]);
  }
  return lista;
}

/** Los huecos de `[desde, hasta)` que no cubre ningún tramo de `ocupados` (ya unidos). */
function huecos(
  desde: number,
  hasta: number,
  ocupados: readonly [number, number][],
): [number, number][] {
  const lista: [number, number][] = [];
  let p = desde;
  for (const [d, h] of ocupados) {
    if (h <= p || d >= hasta) continue;
    if (d > p) lista.push([p, d]);
    p = Math.max(p, h);
  }
  if (p < hasta) lista.push([p, hasta]);
  return lista;
}

interface PlanDeSecuencia {
  readonly analisis: AnalisisDeMetadatos;
  readonly parches: Parches;
}

function planear(bytes: Uint8Array, formato: FormatoBmff): PlanDeSecuencia {
  const { superiores, fin } = leerSuperiores(bytes);
  const ftyp = superiores[0];
  if (!ftyp || ftyp.tipo !== "ftyp") fallar();
  leerFtyp(bytes, ftyp, formato);
  const moovs = superiores.filter((c) => c.tipo === "moov");
  if (moovs.length !== 1) fallar();

  const recorrido = new Recorrido(bytes);
  const { inventario, parches } = recorrido;
  const mdats: Caja[] = [];
  const quedan: Tramo[] = [];
  const todos: Tramo[] = [];

  // La foto fija que viaja con la secuencia, si la hay: su `meta` se reescribe del mismo tamaño.
  const metas = superiores.filter((c) => c.tipo === "meta");
  if (metas.length > 1) fallar();

  for (const c of superiores) {
    if (c.tipo === "ftyp") continue;
    if (c.tipo === "mdat") mdats.push(c);
    else if (c.tipo === "moov") recorrido.pelicula(c);
    else if (c.tipo === "meta") {
      const meta = leerMeta(bytes, c);
      const plan = planearMeta(bytes, meta, inventario);
      anotarCajasDeMeta(meta, inventario);
      parches.encima.push({
        pos: c.desde,
        bytes: metaEnSuSitio(bytes, plan, c.hasta - c.desde),
      });
      quedan.push(...tramosEnElArchivo(plan, true));
      todos.push(...tramosEnElArchivo(plan, false));
    } else if (CAJAS_DE_RELLENO.has(c.tipo)) recorrido.relleno(c);
    else if (CAJAS_DE_FRAGMENTOS.has(c.tipo)) fallar(NO_SOPORTADA);
    else recorrido.desconocida(c);
  }

  const pistas = recorrido.decidirPistas();
  quedan.push(...pistas.quedan);
  todos.push(...pistas.todos);

  // Cada muestra y cada elemento tiene que vivir dentro de un `mdat` de este archivo.
  const dentro = (t: Tramo) =>
    mdats.some(
      (m) =>
        t.desplazamiento >= m.datos && t.desplazamiento + t.largo <= m.hasta,
    );
  for (const t of todos) if (t.largo > 0 && !dentro(t)) fallar(NO_SOPORTADA);

  // El `mdat`: lo que no se queda va a ceros; lo que no era de nadie se nombra, si traía algo.
  const quedanUnidos = unir(quedan);
  const todosUnidos = unir(todos);
  let sinUso = 0;
  for (const m of mdats) {
    for (const [d, h] of huecos(m.datos, m.hasta, todosUnidos))
      if (hayAlgo(bytes, d, h)) sinUso += h - d;
    for (const [d, h] of huecos(m.datos, m.hasta, quedanUnidos))
      parches.ceros.push([d, h]);
  }
  if (sinUso > 0) inventario.quitar("datos-sin-uso", "mdat", sinUso);

  // Los bytes después de la última caja no son de nadie: la copia termina donde termina la caja.
  parches.largo = fin;
  if (fin < bytes.length)
    inventario.quitar("bytes-sobrantes", "BMFF", bytes.length - fin);

  return { analisis: inventario.cerrar(formato), parches };
}

const FREE = ascii("free");

function escribir(bytes: Uint8Array, parches: Parches): Uint8Array {
  const salida = bytes.slice(0, parches.largo);
  for (const e of parches.encima) salida.set(e.bytes, e.pos);
  for (const [d, h] of parches.ceros)
    salida.fill(0, d, Math.min(h, salida.length));
  for (const pos of parches.libres) salida.set(FREE, pos + 4);
  return salida;
}

export function analizarSecuencia(
  bytes: Uint8Array,
  formato: FormatoBmff,
): AnalisisDeMetadatos {
  return planear(bytes, formato).analisis;
}

export function limpiarSecuencia(
  bytes: Uint8Array,
  formato: FormatoBmff,
): Limpieza {
  const plan = planear(bytes, formato);
  return {
    bytes: escribir(bytes, plan.parches),
    quitados: plan.analisis.quitables,
    conservados: plan.analisis.conservables,
    idNuevo: null,
  };
}

/** Para las pruebas: los tramos que la copia pone en ceros, ya unidos. */
export function tramosEnCeros(
  bytes: Uint8Array,
  formato: FormatoBmff,
): [number, number][] {
  return unir(
    planear(bytes, formato).parches.ceros.map(([d, h]) => ({
      desplazamiento: d,
      largo: h - d,
    })),
  );
}

