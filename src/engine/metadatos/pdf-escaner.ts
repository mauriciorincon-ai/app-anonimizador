// Escáner de bytes de un PDF — la historia que el archivo guarda y no cuenta (ADR-010, punto 3).
//
// Un PDF que se «guarda» después de editarlo casi nunca se reescribe: el editor le AGREGA al final
// un cuerpo nuevo, una tabla de referencias nueva y un tráiler nuevo que apunta al anterior con
// `/Prev` (ISO 32000-1 § 7.5.6, actualización incremental). Lo «reemplazado» se queda en los
// bytes: el autor de antes, un objeto «liberado», el `/ID` que ata la copia a su original. Un lector
// de PDF —pdf-lib incluido— carga la ÚLTIMA definición de cada objeto y nunca ve las anteriores. Por
// eso este escáner no usa un lector: mira los bytes como texto latin1 y cuenta.
//
// Qué sabe decir:
//   · cuántas revisiones tiene el archivo (secciones `startxref … %%EOF`), cuántos objetos se
//     definieron más de una vez y si el archivo traía `/ID`, `/Encrypt` o una firma;
//   · los valores del `Info` de revisiones ANTERIORES, cuando esa revisión los dejó sin comprimir, y
//     los paquetes XMP sin comprimir que una revisión posterior redefinió.
// Qué NO sabe decir, y lo declara: lo que una revisión anterior guardó dentro de flujos de objetos
// comprimidos (`/ObjStm`). La reescritura lo quita igual; la pantalla dice que no lo pudo listar
// (`flujosDeObjetos` → aviso `pdf-flujos-de-objetos`).
//
// Es heurístico A PROPÓSITO y nunca lanza: un PDF hostil le saca, como mucho, una cuenta de menos.
// Lo que LIMPIA no es este archivo sino la reescritura (`src/workers/limpiar-pdf.ts`), que poda todo
// lo que no cuelga del catálogo sin necesitar que esta cuenta sea exacta. Este archivo informa.
//
// Lineal en el tamaño: una sola expresión regular, sin retroceso catastrófico (cada cuantificador
// está acotado o lo sigue un literal que lo corta), recorre el texto; el contenido de cada flujo se
// SALTA —por su `/Length` directo si cuadra con `endstream`, o buscando `endstream`—, así que un PDF
// de 100 MB que es casi todo imagen se recorre a saltos. Saltar los flujos también evita contar las
// «revisiones» de un PDF adjunto sin comprimir dentro de otro. El texto se arma por ventanas de
// 8 MB (ver `NUCLEO`): la memoria del escáner no crece con el archivo. Cada lectura de un
// diccionario está acotada, y las de tráileres y flujos no se SOLAPAN: un tráiler que cae dentro
// de lo que ya se leyó como diccionario no se vuelve a leer. Sin eso, mil `trailer <<` seguidos y
// sin cerrar costarían mil lecturas de 64 KB cada una.

import { inicioDelPdf } from "./deteccion";
import type { CampoCrudo, Revela, RevisionesDePdf } from "./tipos";
import { LARGO_MAXIMO_DE_VALOR, MAXIMO_DE_CAMPOS } from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

/**
 * Cuántas definiciones `N G obj` se anotan como mucho (≈ 32 MB entre número y posición). Pasado el
 * tope se siguen contando revisiones, tráileres y firmas, pero los redefinidos pueden quedar cortos:
 * un PDF de 100 MB con más de cuatro millones de objetos no es un documento, es un ataque.
 */
export const MAXIMO_DE_DEFINICIONES = 4_000_000;

/** Hasta dónde se lee un diccionario (tráiler, `Info`, el de un flujo). Uno legítimo mide cientos. */
const LARGO_MAXIMO_DE_DICCIONARIO = 65_536;

/** Entradas que se leen de un diccionario. El `Info` de un archivo real tiene una docena. */
const MAXIMO_DE_ENTRADAS = 4_096;

/** Números de `Info` distintos y paquetes XMP que se siguen. Ningún archivo real se acerca. */
const MAXIMO_DE_INFOS = 256;
const MAXIMO_DE_PAQUETES_XMP = 256;

/** Flujos internos que se anotan. Un PDF real tiene decenas; pasado el tope, el worker no lo abre. */
export const MAXIMO_DE_FLUJOS_INTERNOS = 65_536;

/** El `/N` de un flujo de objetos se cree hasta aquí (un número absurdo no desborda la suma). */
const MAXIMO_DE_N = 10_000_000;

/** Definiciones anteriores de `Info` que se leen (cada una, hasta 64 KB). Un archivo real: pocas. */
const MAXIMO_DE_INFOS_ANTERIORES = 1_024;

/**
 * Bytes de XMP de revisiones anteriores que se leen en total. Un archivo real trae uno o dos
 * paquetes de pocos KB; uno hostil podría traer cientos de un mega. Lo que pase del presupuesto no
 * se lista, y se quita igual con la reescritura.
 */
const PRESUPUESTO_DE_XMP = 4 * LARGO_MAXIMO_DE_XMP;

/** Hasta dónde se busca el `<<` después de `trailer` o de `N G obj` (espacios y comentarios). */
const ALCANCE_DEL_DICCIONARIO = 1_024;

/**
 * Bytes que se guardan de una cadena: lo que cabe en `LARGO_MAXIMO_DE_VALOR` caracteres en el peor
 * caso (UTF-8 de 4 bytes), más la marca de orden. Lo que pase se recorta y se avisa.
 */
const BYTES_POR_VALOR = 4 * LARGO_MAXIMO_DE_VALOR + 4;

/** Lo que el escáner sabe de un PDF. Nada de esto sale del worker tal cual: los campos son crudos. */
export interface EscaneoDePdf {
  readonly revisiones: RevisionesDePdf;
  /** Algún tráiler (o diccionario de flujo `/XRef`) trae `/Encrypt`: Velo no lo abre. */
  readonly cifrado: boolean;
  /** Hay un `/ByteRange` o un `/Type /Sig`: reescribir el archivo invalida su firma. */
  readonly firmado: boolean;
  /**
   * Un flujo de objetos (`/ObjStm`) o de referencias (`/XRef`) pertenece a una revisión que NO es la
   * última: lo que esa revisión guardó comprimido no se puede listar (sí se quita).
   */
  readonly flujosDeObjetos: boolean;
  /** Valores del `Info` y del XMP de revisiones anteriores, en el orden del archivo. */
  readonly camposAnteriores: readonly CampoCrudo[];
  /** Los que no cupieron en `MAXIMO_DE_CAMPOS`: se cuentan, no se listan. */
  readonly camposOmitidos: number;
  /**
   * Los campos de la última definición EN TEXTO del `Info` vigente. Casi siempre es la vigente y
   * no se lista como anterior; pero si la última revisión guardó su `Info` comprimido, esta es de
   * antes. Desde los bytes no se sabe: el worker la compara con lo que lee pdf-lib, y lo que no
   * coincide es de una revisión anterior (origen `pdf-revision-anterior`).
   */
  readonly infoPresunto: readonly CampoCrudo[];
  /** Algún valor pasó de `LARGO_MAXIMO_DE_VALOR` y se recortó. */
  readonly recortados: boolean;
  /** El primer objeto es un diccionario `/Linearized` («vista rápida en la web»). */
  readonly linealizado: boolean;
  /**
   * Números de objeto del diccionario de linealización y de sus flujos de pistas. Ningún objeto los
   * referencia (se leen por posición), pero no son restos de una edición: no cuentan como huérfanos.
   */
  readonly objetosDeLinealizacion: readonly number[];
  /**
   * Cuántos objetos va a construir un lector: las definiciones en texto más el `/N` de cada flujo
   * de objetos. Es lo que mide la memoria que pdf-lib necesita, no los bytes del archivo: siete
   * megas de flujos de objetos comprimidos pueden traer un millón de objetos.
   */
  readonly objetos: number;
  /**
   * Los flujos que pdf-lib descomprime ENTEROS al cargar (`/ObjStm`, `/XRef`), con su filtro. El
   * worker los mide antes de entregarle el archivo: uno de un mega puede inflarse a un giga.
   */
  readonly flujosInternos: readonly FlujoInterno[];
  /** Hubo más flujos internos de los que se anotan (`MAXIMO_DE_FLUJOS_INTERNOS`). */
  readonly flujosInternosDeMas: boolean;
}

/** Dónde están los datos de un flujo `/ObjStm` o `/XRef`, y con qué se comprimieron. */
export interface FlujoInterno {
  readonly inicio: number;
  readonly fin: number;
  /** `ninguno`: sin filtro · `flate`: solo `/FlateDecode` · `otro`: cualquier otra cosa. */
  readonly filtro: "ninguno" | "flate" | "otro";
}

// ── Caracteres ────────────────────────────────────────────────────────────────────────────────

/** Espacio en blanco de PDF (ISO 32000-1 § 7.2.2, tabla 1): NUL, HT, LF, FF, CR y espacio. */
function esEspacio(c: number): boolean {
  return (
    c === 0x20 ||
    c === 0x0a ||
    c === 0x0d ||
    c === 0x09 ||
    c === 0x0c ||
    c === 0x00
  );
}

/** Delimitadores (§ 7.2.2, tabla 2): ( ) < > [ ] { } / %. */
function esDelimitador(c: number): boolean {
  return (
    c === 0x28 ||
    c === 0x29 ||
    c === 0x3c ||
    c === 0x3e ||
    c === 0x5b ||
    c === 0x5d ||
    c === 0x7b ||
    c === 0x7d ||
    c === 0x2f ||
    c === 0x25
  );
}

function esDigito(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

function valorHex(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  if (c >= 0x61 && c <= 0x66) return c - 0x57;
  return -1;
}

/**
 * Los bytes de [desde, hasta) como texto latin1: un carácter por byte. Por trozos, porque
 * `String.fromCharCode` con un argumento por byte tiene un tope de argumentos. (`TextDecoder("latin1")`
 * no sirve: la norma WHATWG lo trata como windows-1252, y 0x80–0x9F dejan de ser un solo byte.)
 */
function aLatin1(bytes: Uint8Array, desde: number, hasta: number): string {
  const TROZO = 0x8000;
  const partes: string[] = [];
  for (let i = desde; i < hasta; i += TROZO)
    partes.push(
      String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + TROZO, hasta)) as unknown as number[],
      ),
    );
  return partes.join("");
}

/** Salta espacio en blanco y comentarios (`%` hasta el fin de línea). */
function saltarEspacios(t: string, i: number, fin: number): number {
  while (i < fin) {
    const c = t.charCodeAt(i);
    if (esEspacio(c)) i++;
    else if (c === 0x25) {
      while (i < fin && t.charCodeAt(i) !== 0x0a && t.charCodeAt(i) !== 0x0d)
        i++;
    } else break;
  }
  return i;
}

// ── Cadenas (§ 7.3.4) ─────────────────────────────────────────────────────────────────────────

interface Cadena {
  /** Los bytes de la cadena, hasta `BYTES_POR_VALOR`. */
  readonly bytes: number[];
  /** Tenía más bytes de los que se guardaron. */
  readonly cortada: boolean;
  /** Índice justo después de la cadena. */
  readonly fin: number;
}

/** Escapes de una sola letra de una cadena literal (§ 7.3.4.2, tabla 3). */
const ESCAPES: Record<string, number> = {
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  b: 0x08,
  f: 0x0c,
};

/**
 * Cadena literal `( … )`: paréntesis equilibrados, escapes de una letra, octales de 1 a 3 dígitos,
 * barra + fin de línea (la línea sigue) y fin de línea crudo normalizado a LF (§ 7.3.4.2).
 */
function leerLiteral(t: string, i: number, fin: number): Cadena {
  const bytes: number[] = [];
  let cortada = false;
  const poner = (b: number) => {
    if (bytes.length < BYTES_POR_VALOR) bytes.push(b & 0xff);
    else cortada = true;
  };
  let profundidad = 1;
  let j = i + 1;
  while (j < fin) {
    const c = t.charCodeAt(j);
    if (c === 0x5c) {
      const siguiente = t.charAt(j + 1);
      const s = t.charCodeAt(j + 1);
      if (siguiente in ESCAPES) {
        poner(ESCAPES[siguiente]);
        j += 2;
      } else if (s >= 0x30 && s <= 0x37) {
        let valor = 0;
        let k = j + 1;
        while (k < j + 4 && k < fin) {
          const d = t.charCodeAt(k);
          if (d < 0x30 || d > 0x37) break;
          valor = valor * 8 + (d - 0x30);
          k++;
        }
        poner(valor);
        j = k;
      } else if (s === 0x0d) {
        // Barra + fin de línea: la cadena sigue en la línea de abajo, sin el salto.
        j += t.charCodeAt(j + 2) === 0x0a ? 3 : 2;
      } else if (s === 0x0a) {
        j += 2;
      } else {
        // `\(`, `\)`, `\\` y cualquier otro: el carácter, sin la barra.
        if (j + 1 < fin) poner(s);
        j += 2;
      }
    } else if (c === 0x28) {
      profundidad++;
      poner(c);
      j++;
    } else if (c === 0x29) {
      profundidad--;
      j++;
      if (profundidad === 0) break;
      poner(c);
    } else if (c === 0x0d) {
      poner(0x0a);
      j += t.charCodeAt(j + 1) === 0x0a ? 2 : 1;
    } else {
      poner(c);
      j++;
    }
  }
  return { bytes, cortada, fin: Math.min(j, fin) };
}

/** Cadena hexadecimal `< … >`: se ignora el espacio; un dígito impar al final vale como `…0`. */
function leerHex(t: string, i: number, fin: number): Cadena {
  const bytes: number[] = [];
  let cortada = false;
  let alto = -1;
  let j = i + 1;
  for (; j < fin; j++) {
    const c = t.charCodeAt(j);
    if (c === 0x3e) {
      j++;
      break;
    }
    const v = valorHex(c);
    if (v < 0) continue;
    if (alto < 0) alto = v;
    else {
      if (bytes.length < BYTES_POR_VALOR) bytes.push(alto * 16 + v);
      else cortada = true;
      alto = -1;
    }
  }
  if (alto >= 0) {
    if (bytes.length < BYTES_POR_VALOR) bytes.push(alto * 16);
    else cortada = true;
  }
  return { bytes, cortada, fin: j };
}

/** Fin de una cadena literal sin guardar sus bytes: solo equilibrar paréntesis y saltar escapes. */
function finDeLiteral(t: string, i: number, fin: number): number {
  let profundidad = 1;
  let j = i + 1;
  while (j < fin) {
    const c = t.charCodeAt(j);
    if (c === 0x5c) j += 2;
    else {
      j++;
      if (c === 0x28) profundidad++;
      else if (c === 0x29 && --profundidad === 0) return j;
    }
  }
  return fin;
}

// ── Texto de una cadena (§ 7.9.2.2) ───────────────────────────────────────────────────────────

/**
 * PDFDocEncoding donde NO coincide con latin1 (ISO 32000-1, anexo D, tabla D.2). Los códigos sin
 * carácter asignado (0x7F, 0x9F, 0xAD) se leen como U+FFFD.
 */
const PDF_DOC: Record<number, number> = {
  0x18: 0x02d8,
  0x19: 0x02c7,
  0x1a: 0x02c6,
  0x1b: 0x02d9,
  0x1c: 0x02dd,
  0x1d: 0x02db,
  0x1e: 0x02da,
  0x1f: 0x02dc,
  0x7f: 0xfffd,
  0x80: 0x2022,
  0x81: 0x2020,
  0x82: 0x2021,
  0x83: 0x2026,
  0x84: 0x2014,
  0x85: 0x2013,
  0x86: 0x0192,
  0x87: 0x2044,
  0x88: 0x2039,
  0x89: 0x203a,
  0x8a: 0x2212,
  0x8b: 0x2030,
  0x8c: 0x201e,
  0x8d: 0x201c,
  0x8e: 0x201d,
  0x8f: 0x2018,
  0x90: 0x2019,
  0x91: 0x201a,
  0x92: 0x2122,
  0x93: 0xfb01,
  0x94: 0xfb02,
  0x95: 0x0141,
  0x96: 0x0152,
  0x97: 0x0160,
  0x98: 0x0178,
  0x99: 0x017d,
  0x9a: 0x0131,
  0x9b: 0x0142,
  0x9c: 0x0153,
  0x9d: 0x0161,
  0x9e: 0x017e,
  0x9f: 0xfffd,
  0xa0: 0x20ac,
  0xad: 0xfffd,
};

/**
 * El texto de una cadena de PDF: UTF-16BE si empieza con FE FF (también se acepta FF FE, que la
 * norma no permite pero hay quien escribe), UTF-8 si empieza con EF BB BF (PDF 2.0) y, si no,
 * PDFDocEncoding.
 */
export function decodificarTextoPdf(bytes: readonly number[]): string {
  if (
    bytes.length >= 2 &&
    ((bytes[0] === 0xfe && bytes[1] === 0xff) ||
      (bytes[0] === 0xff && bytes[1] === 0xfe))
  ) {
    const granEndian = bytes[0] === 0xfe;
    let texto = "";
    for (let i = 2; i + 1 < bytes.length; i += 2)
      texto += String.fromCharCode(
        granEndian
          ? (bytes[i] << 8) | bytes[i + 1]
          : (bytes[i + 1] << 8) | bytes[i],
      );
    return texto;
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  )
    return new TextDecoder("utf-8").decode(Uint8Array.from(bytes.slice(3)));
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(PDF_DOC[b] ?? b);
  return texto;
}

/** Qué revela cada entrada del diccionario `Info` (§ 14.3.3, tabla 317). */
export function revelaDeInfo(clave: string): Revela {
  switch (clave) {
    case "Author":
      return "autoria";
    case "Creator":
    case "Producer":
      return "software";
    case "Title":
    case "Subject":
    case "Keywords":
      return "descripcion";
    case "CreationDate":
    case "ModDate":
      return "fecha";
    default:
      return "otro";
  }
}

// ── Valores y diccionarios (§ 7.3) ────────────────────────────────────────────────────────────

/**
 * Índice justo después del valor que empieza en `i`: cadena, nombre, número, arreglo, diccionario
 * o palabra suelta. Arreglos y diccionarios se equilibran con UNA sola profundidad (un archivo
 * hostil que los cruza termina antes, nunca después de `fin`). Siempre avanza al menos un carácter.
 */
function saltarValor(t: string, i: number, fin: number): number {
  const c = t.charCodeAt(i);
  if (c === 0x28) return finDeLiteral(t, i, fin);
  const esDiccionario = c === 0x3c && t.charCodeAt(i + 1) === 0x3c;
  if (c === 0x3c && !esDiccionario) return leerHex(t, i, fin).fin;
  if (esDiccionario || c === 0x5b) {
    let profundidad = 0;
    let j = i;
    while (j < fin) {
      const d = t.charCodeAt(j);
      if (d === 0x28) j = finDeLiteral(t, j, fin);
      else if (d === 0x25) j = saltarEspacios(t, j, fin);
      else if (d === 0x3c && t.charCodeAt(j + 1) === 0x3c) {
        profundidad++;
        j += 2;
      } else if (d === 0x3c) j = leerHex(t, j, fin).fin;
      else if (d === 0x3e && t.charCodeAt(j + 1) === 0x3e) {
        j += 2;
        if (--profundidad === 0) return j;
      } else if (d === 0x5b) {
        profundidad++;
        j++;
      } else if (d === 0x5d) {
        j++;
        if (--profundidad === 0) return j;
      } else j++;
    }
    return fin;
  }
  // Nombre (`/Tipo`), número, `true`, `null`… hasta el próximo espacio o delimitador.
  let j = c === 0x2f ? i + 1 : i;
  while (
    j < fin &&
    !esEspacio(t.charCodeAt(j)) &&
    !esDelimitador(t.charCodeAt(j))
  )
    j++;
  return Math.max(j, i + 1);
}

type Valor =
  | { readonly tipo: "texto"; readonly cadena: Cadena }
  | { readonly tipo: "referencia"; readonly numero: number }
  | { readonly tipo: "otro" };

interface Entrada {
  readonly clave: string;
  readonly valor: Valor;
}

// Pegadas (`y`) y con el espacio ACOTADO: se prueban en una posición dada, y un espacio sin tope
// después de un número haría que varias lecturas de diccionario recorrieran el mismo hueco.
const REFERENCIA =
  /(\d{1,10})[\0\t\n\f\r ]{1,32}(\d{1,5})[\0\t\n\f\r ]{1,32}R(?![A-Za-z0-9])/y;

/** El nombre de una clave sin la barra, con sus escapes `#xx` resueltos (§ 7.3.5). */
function decodificarNombre(crudo: string): string {
  return crudo.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Las entradas del primer nivel del diccionario que empieza en `inicio` (en `<<`), en su orden.
 * Lo que no es una clave se salta; un diccionario sin cerrar se lee hasta `tope`.
 */
function entradasDe(
  t: string,
  inicio: number,
  tope: number,
): { entradas: Entrada[]; fin: number } {
  const fin = saltarValor(t, inicio, Math.min(tope, t.length));
  const entradas: Entrada[] = [];
  let i = inicio + 2;
  while (entradas.length < MAXIMO_DE_ENTRADAS) {
    i = saltarEspacios(t, i, fin);
    if (i >= fin || (t.charCodeAt(i) === 0x3e && t.charCodeAt(i + 1) === 0x3e))
      break;
    if (t.charCodeAt(i) !== 0x2f) {
      i = saltarValor(t, i, fin);
      continue;
    }
    const finDelNombre = saltarValor(t, i, fin);
    const clave = decodificarNombre(t.slice(i + 1, finDelNombre));
    i = saltarEspacios(t, finDelNombre, fin);
    if (i >= fin) break;
    const c = t.charCodeAt(i);
    if (c === 0x2f) {
      // Otro nombre: es el VALOR de esta clave (`/Type /Catalog`). Se consume como tal.
      entradas.push({ clave, valor: { tipo: "otro" } });
      i = saltarValor(t, i, fin);
    } else if (c === 0x28) {
      const cadena = leerLiteral(t, i, fin);
      entradas.push({ clave, valor: { tipo: "texto", cadena } });
      i = cadena.fin;
    } else if (c === 0x3c && t.charCodeAt(i + 1) !== 0x3c) {
      const cadena = leerHex(t, i, fin);
      entradas.push({ clave, valor: { tipo: "texto", cadena } });
      i = cadena.fin;
    } else {
      REFERENCIA.lastIndex = i;
      const ref = esDigito(c) ? REFERENCIA.exec(t) : null;
      if (ref && REFERENCIA.lastIndex <= fin) {
        entradas.push({
          clave,
          valor: { tipo: "referencia", numero: Number(ref[1]) },
        });
        i = REFERENCIA.lastIndex;
      } else {
        entradas.push({ clave, valor: { tipo: "otro" } });
        i = saltarValor(t, i, fin);
      }
    }
  }
  return { entradas, fin };
}

// ── Flujos (§ 7.3.8) ──────────────────────────────────────────────────────────────────────────

const TIPO_DE_FLUJO =
  /\/Type[\0\t\n\f\r ]*\/(ObjStm|XRef|Metadata)(?![A-Za-z0-9])/;
const SUBTIPO_XML = /\/Subtype[\0\t\n\f\r ]*\/XML(?![A-Za-z0-9])/;
const CON_FILTRO = /\/Filter(?![A-Za-z0-9])/;
const FILTRO =
  /\/Filter(?![A-Za-z0-9])[\0\t\n\f\r ]*(\/[A-Za-z0-9]+|\[[^\]]{0,256}\])/;
const CUANTOS_OBJETOS = /\/N(?![A-Za-z0-9])[\0\t\n\f\r ]*(\d{1,12})/;

/** Con qué se comprimió un flujo, por su diccionario. Un filtro indirecto o raro es `otro`. */
function claseDeFiltro(diccionario: string): FlujoInterno["filtro"] {
  const filtro = FILTRO.exec(diccionario);
  if (!filtro) return CON_FILTRO.test(diccionario) ? "otro" : "ninguno";
  const nombres = filtro[1].match(/\/[A-Za-z0-9]+/g) ?? [];
  if (nombres.length === 0) return "ninguno";
  return nombres.length === 1 && nombres[0] === "/FlateDecode"
    ? "flate"
    : "otro";
}
const LARGO_DEL_FLUJO =
  /\/Length(?![A-Za-z0-9])[\0\t\n\f\r ]*(\d{1,12})(?:[\0\t\n\f\r ]+(\d{1,5})[\0\t\n\f\r ]+R(?![A-Za-z0-9]))?/;

interface Contenido {
  /** Donde empiezan los datos del flujo (después de `stream` y su fin de línea). */
  readonly inicio: number;
  /** Donde terminan (antes de `endstream` o de su fin de línea). */
  readonly fin: number;
  /** Donde sigue el escaneo: después de `endstream`. */
  readonly siguiente: number;
}

const ENDSTREAM = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d];

function hayEndstream(bytes: Uint8Array, i: number): boolean {
  if (i + ENDSTREAM.length > bytes.length) return false;
  for (let k = 0; k < ENDSTREAM.length; k++)
    if (bytes[i + k] !== ENDSTREAM[k]) return false;
  return true;
}

/** La próxima `endstream` desde `desde`, sobre los BYTES (puede estar a megas de la ventana). */
function buscarEndstream(bytes: Uint8Array, desde: number): number {
  for (
    let i = bytes.indexOf(0x65, desde);
    i >= 0;
    i = bytes.indexOf(0x65, i + 1)
  )
    if (hayEndstream(bytes, i)) return i;
  return -1;
}

/**
 * Dónde termina el flujo cuya palabra `stream` está en `posicion` (absoluta). Primero se cree a un
 * `/Length` DIRECTO si en esa posición, tras espacio opcional, aparece `endstream`; si no (largo
 * indirecto, largo mentiroso), se busca `endstream`. Sin `endstream`, llega al final del archivo.
 */
function contenidoDelFlujo(
  bytes: Uint8Array,
  diccionario: string,
  posicion: number,
): Contenido {
  let inicio = posicion + 6;
  if (bytes[inicio] === 0x0d) inicio++;
  if (bytes[inicio] === 0x0a) inicio++;
  const largo = LARGO_DEL_FLUJO.exec(diccionario);
  if (largo && largo[2] === undefined) {
    const fin = inicio + Number(largo[1]);
    let k = fin;
    while (k < fin + 32 && k < bytes.length && esEspacio(bytes[k])) k++;
    if (hayEndstream(bytes, k)) return { inicio, fin, siguiente: k + 9 };
  }
  const k = buscarEndstream(bytes, inicio);
  if (k < 0) return { inicio, fin: bytes.length, siguiente: bytes.length };
  let fin = k;
  if (fin > inicio && bytes[fin - 1] === 0x0a) fin--;
  if (fin > inicio && bytes[fin - 1] === 0x0d) fin--;
  return { inicio, fin, siguiente: k + 9 };
}

// ── El recorrido ──────────────────────────────────────────────────────────────────────────────

/**
 * Lo único que el recorrido busca, en una sola expresión y en orden de aparición:
 *   1–2. una definición `N G obj` (número de hasta 10 cifras, generación de hasta 5);
 *   · `stream` seguido de fin de línea (el contenido se salta);
 *   · `startxref` y `%%EOF`, que cierran una sección;
 *   · `trailer`;
 *   · `/ByteRange` o `/Type /Sig`, que delatan una firma.
 * Todo cuantificador está acotado: ninguna ficha mide más de unos 600 caracteres, así que una ficha
 * que empieza en el núcleo de una ventana siempre cabe entera en ella.
 */
const FICHAS =
  /(\d{1,10})[\0\t\n\f\r ]{1,255}(\d{1,5})[\0\t\n\f\r ]{1,255}obj(?![A-Za-z0-9])|\bstream(?=[\r\n])|startxref|%%EOF|trailer(?![A-Za-z0-9])|\/ByteRange(?![A-Za-z0-9])|\/Type[\0\t\n\f\r ]{0,255}\/Sig(?![A-Za-z0-9])/g;

const DEFINICION =
  /(\d{1,10})[\0\t\n\f\r ]{1,32}(\d{1,5})[\0\t\n\f\r ]{1,32}obj(?![A-Za-z0-9])/y;

/**
 * El archivo se lee por VENTANAS: un núcleo de 8 MB donde se buscan fichas, con margen delante (el
 * diccionario de un flujo puede estar hasta 64 KB antes de su `stream`) y detrás (un tráiler se lee
 * hasta 64 KB después de su `trailer`). El texto latin1 del archivo entero nunca existe: la memoria
 * del escáner no crece con el tamaño del PDF, y el worker la necesita para pdf-lib.
 */
const NUCLEO = 8 * 1024 * 1024;
const MARGEN_DELANTE = LARGO_MAXIMO_DE_DICCIONARIO + ALCANCE_DEL_DICCIONARIO;
const MARGEN_DETRAS = 2 * LARGO_MAXIMO_DE_DICCIONARIO;

interface PaqueteXmp {
  readonly definicion: number;
  readonly numero: number;
  readonly inicio: number;
  readonly fin: number;
}

function recortar(valor: string): { valor: string; recortado: boolean } {
  return valor.length > LARGO_MAXIMO_DE_VALOR
    ? { valor: valor.slice(0, LARGO_MAXIMO_DE_VALOR), recortado: true }
    : { valor, recortado: false };
}

/**
 * La historia del PDF, leída de sus bytes. `nucleo` es el tamaño del núcleo de cada ventana: solo
 * los tests lo achican, para recorrer cada frontera entre ventanas en un archivo de pocos KB.
 */
export function escanearPdf(
  bytes: Uint8Array,
  nucleo: number = NUCLEO,
): EscaneoDePdf {
  const largo = bytes.length;
  /** El texto de `largoDeTexto` bytes desde `desde`: para leer UN diccionario fuera de la ventana. */
  const textoEn = (desde: number, largoDeTexto: number) =>
    aLatin1(bytes, desde, Math.min(largo, desde + largoDeTexto));

  // Definiciones `N G obj`: número y dónde empieza su cuerpo (posición absoluta), en orden.
  const numeros: number[] = [];
  const cuerpos: number[] = [];
  let ultimoCuerpo = -1;
  let ultimoNumero = -1;
  let ultimaDefinicion = -1;
  /** Hasta dónde llegó la última lectura de un diccionario de tráiler o de flujo. */
  let leidoHasta = 0;

  let secciones = 0;
  let pendiente = false;
  let cifrado = false;
  let firmado = false;
  let conId = false;
  /** El `Info` que nombra el último tráiler que trae uno, y todos los números que se nombraron. */
  let infoVigente = -1;
  const deInfo = new Set<number>();
  /** La sección en la que apareció cada `/ObjStm` o `/XRef` (= secciones cerradas antes). */
  const seccionesConFlujo: number[] = [];
  const paquetes: PaqueteXmp[] = [];
  /** Todas las definiciones en texto (sin tope) y los objetos que declaran los `/ObjStm`. */
  let definiciones = 0;
  let objetosComprimidos = 0;
  const flujosInternos: FlujoInterno[] = [];
  let flujosInternosDeMas = false;

  const registrarTrailer = (entradas: readonly Entrada[]) => {
    for (const { clave, valor } of entradas) {
      if (clave === "Encrypt") cifrado = true;
      else if (clave === "ID") conId = true;
      else if (clave === "Info" && valor.tipo === "referencia") {
        infoVigente = valor.numero;
        if (deInfo.size < MAXIMO_DE_INFOS) deInfo.add(valor.numero);
      }
    }
  };

  // La ventana: `t` es el texto de [base, base + t.length); las fichas se aceptan en [.., finDelNucleo).
  let base = 0;
  let finDelNucleo = 0;
  let t = "";
  const cargar = (desde: number) => {
    base = Math.max(0, desde - MARGEN_DELANTE);
    finDelNucleo = Math.min(largo, desde + Math.max(1, nucleo));
    t = aLatin1(bytes, base, Math.min(largo, finDelNucleo + MARGEN_DETRAS));
  };
  const fichas = new RegExp(FICHAS.source, "g");

  let posicion = 0;
  cargar(0);
  while (posicion < largo) {
    if (posicion >= finDelNucleo) cargar(posicion);
    fichas.lastIndex = posicion - base;
    const m = fichas.exec(t);
    const donde = m === null ? largo : base + m.index;
    if (m === null || donde >= finDelNucleo) {
      // Nada más en este núcleo: la siguiente ventana empieza en la ficha que se vio (si se vio una
      // en el margen) o donde termina el núcleo.
      if (finDelNucleo >= largo) break;
      posicion = Math.min(donde, finDelNucleo);
      cargar(posicion);
      continue;
    }
    const ficha = m[0];
    posicion = base + fichas.lastIndex;
    if (m[1] !== undefined) {
      // Un número de más de diez cifras no es un número de objeto: la coincidencia empezó a mitad.
      if (donde > 0 && esDigito(bytes[donde - 1])) continue;
      ultimoCuerpo = posicion;
      ultimoNumero = Number(m[1]);
      ultimaDefinicion = -1;
      definiciones++;
      if (numeros.length < MAXIMO_DE_DEFINICIONES) {
        numeros.push(ultimoNumero);
        cuerpos.push(ultimoCuerpo);
        ultimaDefinicion = numeros.length - 1;
      }
    } else if (ficha === "stream") {
      // El diccionario del flujo: desde el último `N G obj`, o los 64 KB de antes si no hay uno
      // cerca; nunca antes de donde terminó la lectura anterior. Siempre dentro de la ventana.
      const desde = Math.max(
        leidoHasta,
        base,
        ultimoCuerpo >= 0 && donde - ultimoCuerpo <= LARGO_MAXIMO_DE_DICCIONARIO
          ? ultimoCuerpo
          : donde - LARGO_MAXIMO_DE_DICCIONARIO,
      );
      const diccionario = t.slice(desde - base, donde - base);
      const contenido = contenidoDelFlujo(bytes, diccionario, donde);
      const tipo = TIPO_DE_FLUJO.exec(diccionario)?.[1];
      if (tipo === "ObjStm" || tipo === "XRef") {
        seccionesConFlujo.push(secciones);
        if (flujosInternos.length < MAXIMO_DE_FLUJOS_INTERNOS)
          flujosInternos.push({
            inicio: contenido.inicio,
            fin: contenido.fin,
            filtro: claseDeFiltro(diccionario),
          });
        else flujosInternosDeMas = true;
      }
      if (tipo === "ObjStm")
        objetosComprimidos += Math.min(
          MAXIMO_DE_N,
          Number(CUANTOS_OBJETOS.exec(diccionario)?.[1] ?? 0),
        );
      if (tipo === "XRef") {
        const abre = diccionario.indexOf("<<");
        if (abre >= 0)
          registrarTrailer(
            entradasDe(diccionario, abre, diccionario.length).entradas,
          );
      }
      if (
        (tipo === "Metadata" || SUBTIPO_XML.test(diccionario)) &&
        !CON_FILTRO.test(diccionario) &&
        paquetes.length < MAXIMO_DE_PAQUETES_XMP
      )
        paquetes.push({
          definicion: ultimaDefinicion,
          numero: ultimoNumero,
          inicio: contenido.inicio,
          fin: contenido.fin,
        });
      posicion = contenido.siguiente;
      leidoHasta = contenido.siguiente;
      ultimoCuerpo = -1;
      ultimaDefinicion = -1;
    } else if (ficha === "startxref") {
      pendiente = true;
    } else if (ficha === "%%EOF") {
      if (pendiente) secciones++;
      pendiente = false;
    } else if (ficha === "trailer") {
      // Un `trailer` dentro de lo que ya se leyó como diccionario no se vuelve a leer.
      if (donde < leidoHasta) continue;
      const despues = fichas.lastIndex;
      const k = saltarEspacios(
        t,
        despues,
        Math.min(t.length, despues + ALCANCE_DEL_DICCIONARIO),
      );
      if (!t.startsWith("<<", k)) continue;
      const leido = entradasDe(t, k, k + LARGO_MAXIMO_DE_DICCIONARIO);
      registrarTrailer(leido.entradas);
      leidoHasta = base + leido.fin;
    } else {
      firmado = true;
    }
  }
  // Un archivo truncado tras su último `startxref` sigue siendo una sección.
  if (pendiente) secciones++;
  t = "";

  /** El texto del diccionario de la definición cuyo cuerpo está en `cuerpo`, desde `<<`; o null. */
  const diccionarioEn = (cuerpo: number, tope: number): string | null => {
    const texto = textoEn(cuerpo, ALCANCE_DEL_DICCIONARIO + tope);
    const k = saltarEspacios(
      texto,
      0,
      Math.min(texto.length, ALCANCE_DEL_DICCIONARIO),
    );
    return texto.startsWith("<<", k) ? texto.slice(k) : null;
  };

  // ── Linealización (anexo F): una sección de más que no es una edición ──
  let linealizado = false;
  const objetosDeLinealizacion: number[] = [];
  const primero = numeros.length > 0 ? diccionarioEn(cuerpos[0], 4096) : null;
  if (primero !== null) {
    const diccionario = primero.slice(
      0,
      saltarValor(primero, 0, primero.length),
    );
    if (/\/Linearized(?![A-Za-z0-9])/.test(diccionario)) {
      linealizado = true;
      objetosDeLinealizacion.push(numeros[0]);
      // `/H [desplazamiento largo (desplazamiento largo)]`: dónde están los flujos de pistas.
      const pistas = /\/H[\0\t\n\f\r ]*\[([0-9\0\t\n\f\r ]{1,128})\]/.exec(
        diccionario,
      );
      const cifras = pistas
        ? pistas[1]
            .split(/[\0\t\n\f\r ]+/)
            .filter((cifra) => cifra !== "")
            .map(Number)
        : [];
      const origen = Math.max(0, inicioDelPdf(bytes));
      for (const indice of [0, 2]) {
        if (cifras[indice] === undefined) continue;
        DEFINICION.lastIndex = 0;
        const pista = DEFINICION.exec(textoEn(origen + cifras[indice], 128));
        if (pista) objetosDeLinealizacion.push(Number(pista[1]));
      }
    }
  }
  const revisiones =
    linealizado && secciones >= 2 ? secciones - 1 : Math.max(1, secciones);
  // En un archivo linealizado, la sección 0 (la de la primera página) y la 1 son la misma revisión.
  const revisionDe = (seccion: number) =>
    linealizado ? Math.max(0, seccion - 1) : seccion;
  const flujosDeObjetos = seccionesConFlujo.some(
    (seccion) => revisionDe(seccion) < revisiones - 1,
  );

  // ── Objetos definidos más de una vez ──
  const ordenados = Float64Array.from(numeros).sort();
  let objetosRedefinidos = 0;
  for (let i = 1; i < ordenados.length; i++)
    if (
      ordenados[i] === ordenados[i - 1] &&
      (i < 2 || ordenados[i - 2] !== ordenados[i])
    )
      objetosRedefinidos++;

  // ── Valores de revisiones anteriores ──
  const campos: CampoCrudo[] = [];
  let camposOmitidos = 0;
  let recortados = false;
  const agregar = (campo: CampoCrudo) => {
    if (campos.length < MAXIMO_DE_CAMPOS) campos.push(campo);
    else camposOmitidos++;
  };
  /** Los campos de texto del diccionario `Info` cuyo cuerpo empieza en `cuerpo`. */
  const camposDeInfo = (
    cuerpo: number,
    alLeer: (campo: CampoCrudo) => void,
  ) => {
    const diccionario = diccionarioEn(cuerpo, LARGO_MAXIMO_DE_DICCIONARIO);
    if (diccionario === null) return;
    for (const { clave, valor } of entradasDe(
      diccionario,
      0,
      diccionario.length,
    ).entradas) {
      if (valor.tipo !== "texto") continue;
      const texto = decodificarTextoPdf(valor.cadena.bytes);
      if (texto.trim() === "") continue;
      const corto = recortar(texto);
      recortados ||= corto.recortado || valor.cadena.cortada;
      alLeer({
        clave,
        origen: "pdf-revision-anterior",
        valor: corto.valor,
        revela: revelaDeInfo(clave),
      });
    }
  };

  // El `Info` vigente es, en principio, la ÚLTIMA definición del objeto que nombra el último
  // tráiler que trae `/Info` (lo mismo que ve un lector). Toda otra definición de un objeto `Info`
  // es de antes: la de ese mismo número que una edición redefinió, y la de un `Info` que un tráiler
  // anterior nombraba y el último ya no.
  const deXmp = new Set(paquetes.map((p) => p.numero));
  const definicionesDeInfo = new Map<number, number[]>();
  const ultimaDe = new Map<number, number>();
  for (let i = 0; i < numeros.length; i++) {
    const numero = numeros[i];
    if (deInfo.has(numero)) {
      const lista = definicionesDeInfo.get(numero) ?? [];
      lista.push(cuerpos[i]);
      definicionesDeInfo.set(numero, lista);
    }
    if (deXmp.has(numero)) ultimaDe.set(numero, i);
  }
  const anteriores: number[] = [];
  let presunto = -1;
  for (const [numero, lista] of definicionesDeInfo) {
    if (numero !== infoVigente) anteriores.push(...lista);
    else {
      anteriores.push(...lista.slice(0, -1));
      presunto = lista[lista.length - 1];
    }
  }
  anteriores.sort((a, b) => a - b);
  for (const cuerpo of anteriores.slice(0, MAXIMO_DE_INFOS_ANTERIORES))
    camposDeInfo(cuerpo, agregar);

  // «En principio», porque si la revisión vigente guardó su `Info` dentro de un flujo comprimido,
  // la última definición EN TEXTO es de una revisión anterior, y desde los bytes no se distingue.
  // El worker lo decide: compara estos campos con lo que pdf-lib lee como vigente.
  const infoPresunto: CampoCrudo[] = [];
  if (presunto >= 0)
    camposDeInfo(presunto, (campo) => {
      if (infoPresunto.length < MAXIMO_DE_CAMPOS) infoPresunto.push(campo);
    });

  // Un paquete XMP sin comprimir es «de antes» si su objeto se volvió a definir más adelante.
  // Límite declarado: un XMP que una edición dejó huérfano con OTRO número no se lista (se cuenta
  // entre los huérfanos y se quita).
  const decodificador = new TextDecoder("utf-8");
  let presupuesto = PRESUPUESTO_DE_XMP;
  for (const paquete of paquetes) {
    const ultima = ultimaDe.get(paquete.numero) ?? -1;
    if (paquete.definicion < 0 || ultima <= paquete.definicion) continue;
    const fin = Math.min(
      paquete.fin,
      paquete.inicio + LARGO_MAXIMO_DE_XMP,
      paquete.inicio + presupuesto,
    );
    if (fin <= paquete.inicio) break;
    presupuesto -= fin - paquete.inicio;
    const lectura = leerXmp(
      decodificador.decode(bytes.subarray(paquete.inicio, fin)),
      "pdf-revision-anterior",
    );
    recortados ||= lectura.recortados;
    for (const campo of lectura.campos) agregar(campo);
  }

  return {
    revisiones: { revisiones, objetosRedefinidos, conId },
    cifrado,
    firmado,
    flujosDeObjetos,
    camposAnteriores: campos,
    camposOmitidos,
    infoPresunto,
    recortados,
    linealizado,
    objetosDeLinealizacion,
    objetos: definiciones + objetosComprimidos,
    flujosInternos,
    flujosInternosDeMas,
  };
}
