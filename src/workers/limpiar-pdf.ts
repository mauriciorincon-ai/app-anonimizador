// PDF dentro del worker — leer lo que el documento dice de sí mismo y reescribirlo sin ello.
//
// El modelo, las alternativas y lo que se midió están en `decisions/010-pdf-metadatos.md`. Lo que
// este archivo cumple de esa decisión:
//
//   · pdf-lib (1.17.1, versión fija) entra por un `import()` DINÁMICO: el trozo (~430 KB) solo se
//     descarga cuando alguien suelta un PDF, y solo dentro del worker. Se usa para tres cosas:
//     cargar, podar y guardar.
//   · `updateMetadata: false` es OBLIGATORIO. Sin esa opción pdf-lib escribe un `ModDate` con la
//     hora del reloj y un `Producer` suyo, y la salida dejaría de ser función pura de la entrada
//     (regla dura 3). Por la misma razón se guarda con `updateFieldAppearances: false`: con su
//     valor por omisión, pdf-lib CREA un `/AcroForm` en todo documento que no lo tenga y redibuja
//     los campos de los que sí, con una fuente que incrusta — eso ya no sería quitar, sería poner.
//   · Limpiar es REESCRIBIR, no editar: se recorre el grafo desde el `/Root` del tráiler, se borran
//     en el camino las claves `/Metadata`, `/PieceInfo`, `/Thumb` y `/LastModified` (la fecha de
//     edición de una página o un XObject, pareja de `/PieceInfo`), y se elimina TODO objeto al que
//     no se llega. Así se van de una vez el `Info` (cuelga del tráiler, no del catálogo), el XMP, las
//     revisiones anteriores (pdf-lib solo conserva la última definición de cada objeto) y los
//     objetos «liberados» que una edición dejó en los bytes. Se guarda sin flujos de objetos, en una
//     sola sección: un `%%EOF`, ningún `/Prev`.
//   · El `/ID` nuevo sale del CONTENIDO limpio, en dos pasos: se guarda sin `/ID`, se toman los
//     primeros 16 bytes del SHA-256 de esa salida, y se guarda otra vez con ellos en los dos
//     elementos. Ni azar ni reloj: el mismo archivo da el mismo `/ID`, y ya no es el del original.
//   · Las páginas y sus flujos de contenido se copian tal cual: ningún píxel, ninguna letra. Las
//     anotaciones con autor, los formularios, los adjuntos, el JavaScript y las firmas se INFORMAN
//     y no se tocan (ADR-010, punto 4).
//   · Un PDF hostil termina en una CLAVE (`pdf-ilegible`, `pdf-cifrado`), jamás en el mensaje de
//     pdf-lib, que puede citar contenido del archivo.
//
// Sin `self` ni DOM: este módulo se importa igual desde el worker y desde Vitest en Node.

import type {
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFRef,
} from "pdf-lib";

import { inicioDelPdf } from "@/engine/metadatos/deteccion";
import {
  escanearPdf,
  revelaDeInfo,
  type EscaneoDePdf,
} from "@/engine/metadatos/pdf-escaner";
import {
  ErrorDeMetadatos,
  LARGO_MAXIMO_DE_VALOR,
  MAXIMO_DE_CAMPOS,
  type AnalisisDeMetadatos,
  type Aviso,
  type CampoCrudo,
  type Elemento,
  type Limpieza,
} from "@/engine/metadatos/tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "@/engine/metadatos/xmp";
import { sha256 } from "@/lib/sha256";

type PdfLib = typeof import("pdf-lib");

/**
 * Los tres topes de un PDF. Un PDF no se puede reescribir por trozos: entra entero a la memoria del
 * worker, y pdf-lib arma encima su grafo de objetos y la salida completa (dos veces: la del `/ID`
 * y la final). Lo que cuesta memoria NO son los bytes sino los OBJETOS, y lo que pdf-lib infla al
 * cargar. Medido en Node 24 con PDF sintéticos (S6): tiempo · pico de RSS del proceso (incluye
 * Node y una copia de más de la entrada) · heap de V8 mínimo con el que termina.
 *
 *   | archivo                                 | analizar        | limpiar                   |
 *   | --------------------------------------- | --------------- | ------------------------- |
 *   | 10 MB, 10 imágenes                      | 0,03 s · 122 MB | 0,16 s · 152 MB · <48 MB  |
 *   | 50 MB, 50 imágenes                      | 0,13 s · 327 MB | 0,77 s · 422 MB · <48 MB  |
 *   | 100 MB, 100 imágenes                    | 0,26 s · 512 MB | 1,5 s · 626 MB · <48 MB   |
 *   | 11 MB, 17 000 páginas (34 000 obj.)     | 0,21 s · 290 MB | 0,44 s · 309 MB · ≤96 MB  |
 *   | 53 MB, 86 000 páginas (172 000 obj.)    | 0,95 s · 596 MB | 2,2 s · 735 MB · ≤256 MB  |
 *   | 107 MB, 172 000 páginas (343 000 obj.)  | 2,0 s · 992 MB  | 4,5 s · 1,26 GB · ≤512 MB |
 *   | 47 MB, 45 imágenes + 199 000 obj. comp. | 0,60 s · 565 MB | 1,2 s · 618 MB            |
 *   | 7 MB, 1 000 000 obj. en `/ObjStm`       | 1,1 s · 820 MB  | 1,3 s · 926 MB            |
 *   | 1 MB, un `/ObjStm` que se infla a 1 GB  | 1,7 s · 1,8 GB  | 1,6 s · 2,1 GB            |
 *
 * Por eso: 50 MB de archivo (el peor caso aceptado queda en ≈ 0,75 GB de pico) y, aparte, un tope
 * de objetos y uno de lo que se infla, que el escáner y `cabeEnMemoria` miden ANTES de entregarle
 * el archivo a pdf-lib. Con ellos, el de 107 MB, el del millón de objetos y la bomba se rechazan
 * en menos de medio segundo.
 * Un archivo que pasa de cualquiera es `pdf-ilegible` («una estructura que Velo no sabe leer»): un
 * mensaje, no una pestaña caída. El tope por bytes vive en `src/lib/archivo.ts`, porque la página
 * lo comprueba antes de crear el worker: una sola fuente para las dos orillas.
 */
export { TOPE_PDF_BYTES } from "@/lib/archivo";

/** Objetos que pdf-lib va a construir (≈ 1,5 KB de heap cada uno en la medición). */
export const TOPE_PDF_OBJETOS = 200_000;

/**
 * Bytes que pdf-lib inflaría al cargar (`/ObjStm` y `/XRef`, que descomprime enteros). Los flujos
 * de objetos guardan diccionarios, no páginas: 200 000 objetos de unos 100 bytes son 20 MB. Con
 * 256 MB, un archivo de 261 KB todavía pedía 600 MB; con 64 MB, una bomba cuesta eso como mucho.
 */
export const TOPE_PDF_INFLADO = 64 * 1024 * 1024;

/** Lo que se guarda: sin flujos de objetos, sin página de más, sin tocar formularios, sin pausas. */
const GUARDADO = {
  useObjectStreams: false,
  addDefaultPage: false,
  updateFieldAppearances: false,
  // El worker no comparte hilo con nadie: ceder el turno cada 50 objetos (lo de omisión) solo
  // agrega esperas de `setTimeout`, que el navegador estira a 4 ms tras unas cuantas seguidas.
  objectsPerTick: Number.POSITIVE_INFINITY,
} as const;

/** Las claves que la poda borra donde las encuentre, y lo que la pantalla nombra de cada una. */
const CLAVES_QUE_SE_QUITAN = [
  "Metadata",
  "PieceInfo",
  "Thumb",
  "LastModified",
] as const;

/** Anotaciones que NO son de marcado: su `/T` no es un autor (en un `Widget` es el nombre del campo). */
const SIN_AUTOR = ["Widget", "Link", "Popup"] as const;

/**
 * Caracteres crudos de una cadena que se decodifican como mucho: lo que cabe en un valor en el peor
 * caso (cuatro bytes por carácter). `decodeText` de pdf-lib arma el texto con un `fromCodePoint`
 * de un argumento por byte, que con una cadena de megas desborda la pila.
 */
const LARGO_CRUDO = 4 * LARGO_MAXIMO_DE_VALOR + 8;

interface Abierto {
  readonly lib: PdfLib;
  readonly doc: PDFDocument;
  readonly escaneo: EscaneoDePdf;
  readonly catalogo: PDFDict;
}

/** Cualquier fallo de pdf-lib es `pdf-ilegible`: su mensaje no cruza, puede citar el archivo. */
async function conClave<T>(trabajo: () => Promise<T>): Promise<T> {
  try {
    return await trabajo();
  } catch (error) {
    if (error instanceof ErrorDeMetadatos) throw error;
    throw new ErrorDeMetadatos("pdf-ilegible");
  }
}

/**
 * Cuánto da un flujo `/FlateDecode` al inflarlo, sin guardar lo inflado: `DecompressionStream` lo
 * entrega por trozos y aquí solo se suman. Se deja de leer en cuanto pasa de `tope`. Un flujo roto
 * cuenta lo que alcanzó a dar (pdf-lib tampoco infla más allá del daño).
 */
async function inflado(
  datos: Uint8Array<ArrayBuffer>,
  tope: number,
): Promise<number> {
  const lector = new Blob([datos])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > tope) {
        await lector.cancel();
        break;
      }
    }
  } catch {
    // Datos corruptos o basura tras el final: vale lo que se infló hasta ahí.
  }
  return total;
}

/**
 * ¿Cabe en la memoria del worker? Se mira ANTES de pdf-lib, que no tiene topes propios: construye
 * todos los objetos y descomprime enteros los `/ObjStm` y `/XRef` (una bomba de compresión de 1 MB
 * le pide 1 GB). Un filtro que no sea `/FlateDecode` no se mide aquí (límite declarado: es raro en
 * esos flujos, y pdf-lib lo inflaría igual).
 */
async function cabeEnMemoria(
  bytes: Uint8Array,
  escaneo: EscaneoDePdf,
): Promise<boolean> {
  if (escaneo.objetos > TOPE_PDF_OBJETOS || escaneo.flujosInternosDeMas)
    return false;
  let total = 0;
  for (const flujo of escaneo.flujosInternos) {
    if (flujo.filtro === "ninguno") total += flujo.fin - flujo.inicio;
    else if (flujo.filtro === "flate")
      total += await inflado(
        bytes.slice(flujo.inicio, flujo.fin),
        TOPE_PDF_INFLADO - total,
      );
    if (total > TOPE_PDF_INFLADO) return false;
  }
  return true;
}

/** Escáner primero; cifrado y topes, fuera ANTES de cargar nada; después pdf-lib. */
async function abrir(bytes: Uint8Array): Promise<Abierto> {
  // Sin cabecera en el primer kilobyte no es un PDF; pdf-lib la buscaría en el archivo entero.
  if (inicioDelPdf(bytes) < 0) throw new ErrorDeMetadatos("pdf-ilegible");
  const escaneo = escanearPdf(bytes);
  if (escaneo.cifrado) throw new ErrorDeMetadatos("pdf-cifrado");
  if (!(await cabeEnMemoria(bytes, escaneo)))
    throw new ErrorDeMetadatos("pdf-fuera-de-topes");
  const lib = await import("pdf-lib");
  let doc: PDFDocument;
  // Con un archivo dañado, pdf-lib avanza byte a byte lanzando y atrapando UNA excepción por
  // byte. Sin la pila (que V8 arma en cada `new Error`) eso cuesta de 5 a 8 veces menos: 20 MB de
  // basura pasan de 48 s a 10 s. Se restituye al terminar; el mensaje no se usa nunca.
  const pila = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    doc = await lib.PDFDocument.load(bytes, {
      updateMetadata: false,
      parseSpeed: lib.ParseSpeeds.Fastest,
    });
  } catch (error) {
    // El escáner lee `/Encrypt` en los tráileres que encuentra; pdf-lib, en el último que carga.
    if (error instanceof lib.EncryptedPDFError)
      throw new ErrorDeMetadatos("pdf-cifrado");
    throw new ErrorDeMetadatos("pdf-ilegible");
  } finally {
    Error.stackTraceLimit = pila;
  }
  const catalogo = doc.context.lookup(doc.context.trailerInfo.Root);
  if (!(catalogo instanceof lib.PDFDict))
    throw new ErrorDeMetadatos("pdf-ilegible");
  return { lib, doc, escaneo, catalogo };
}

// ── El recorrido desde el catálogo ────────────────────────────────────────────────────────────

/**
 * Para qué se recorre:
 *   · `inventario`: contar lo que se quitaría y lo que solo se informa, sin cambiar nada;
 *   · `poda`: lo mismo, BORRANDO las claves que se quitan (sus valores ya no se visitan);
 *   · `marca`: solo marcar qué objetos se alcanzan.
 * `inventario` y `poda` siguen exactamente el mismo camino, así que cuentan lo mismo.
 */
type Modo = "inventario" | "poda" | "marca";

interface Hallazgos {
  /** Anotaciones de marcado con `/T` (su autor). */
  anotaciones: number;
  /** Especificaciones de archivo con `/EF`: el archivo va DENTRO del PDF. */
  adjuntos: number;
  javascript: boolean;
  firmado: boolean;
}

interface Recorrido {
  /** Cuántos valores distintos colgaban de cada una de `CLAVES_QUE_SE_QUITAN`, en ese orden. */
  readonly porClave: readonly number[];
  /** Esos valores: lo que deja de alcanzarse si no cuelga también de otra parte. */
  readonly apartados: readonly PDFObject[];
  readonly hallazgos: Hallazgos;
}

/**
 * Recorrido iterativo (pila propia: un árbol de páginas hostil de mil niveles no desborda nada),
 * con conjunto de visitados por referencia (los `PDFRef` de pdf-lib son únicos por número y
 * generación, así que la identidad basta). Un objeto directo pertenece a un solo padre y se visita
 * una vez con él; los ciclos solo pasan por referencias, y esas se visitan una vez.
 */
function recorrer(
  lib: PdfLib,
  contexto: PDFContext,
  raices: readonly (PDFObject | undefined)[],
  alcanzados: Set<PDFRef>,
  modo: Modo,
): Recorrido {
  const {
    PDFArray,
    PDFDict,
    PDFHexString,
    PDFName,
    PDFRef,
    PDFStream,
    PDFString,
  } = lib;
  const claves = CLAVES_QUE_SE_QUITAN.map((clave) => PDFName.of(clave));
  const distintos = claves.map(() => new Set<PDFObject>());
  const apartados: PDFObject[] = [];
  const hallazgos: Hallazgos = {
    anotaciones: 0,
    adjuntos: 0,
    javascript: false,
    firmado: false,
  };
  const n = {
    T: PDFName.of("T"),
    Rect: PDFName.of("Rect"),
    Subtype: PDFName.of("Subtype"),
    Type: PDFName.of("Type"),
    Sig: PDFName.of("Sig"),
    EF: PDFName.of("EF"),
    JS: PDFName.of("JS"),
    ByteRange: PDFName.of("ByteRange"),
  };
  const sinAutor = new Set<PDFName>(SIN_AUTOR.map((s) => PDFName.of(s)));

  const examinar = (d: PDFDict) => {
    if (d.has(n.JS)) hallazgos.javascript = true;
    if (d.has(n.ByteRange) || d.lookup(n.Type) === n.Sig)
      hallazgos.firmado = true;
    if (d.lookup(n.EF) instanceof PDFDict) hallazgos.adjuntos++;
    const subtipo = d.lookup(n.Subtype);
    const autor = d.lookup(n.T);
    if (
      d.has(n.Rect) &&
      subtipo instanceof PDFName &&
      !sinAutor.has(subtipo) &&
      (autor instanceof PDFString || autor instanceof PDFHexString)
    )
      hallazgos.anotaciones++;
  };

  const pila: PDFObject[] = raices.filter(
    (raiz): raiz is PDFObject => raiz !== undefined,
  );
  for (let o = pila.pop(); o !== undefined; o = pila.pop()) {
    if (o instanceof PDFRef) {
      if (alcanzados.has(o)) continue;
      alcanzados.add(o);
      const destino = contexto.lookup(o);
      if (destino !== undefined) pila.push(destino);
      continue;
    }
    const dict =
      o instanceof PDFDict ? o : o instanceof PDFStream ? o.dict : null;
    if (dict !== null) {
      if (modo !== "marca") {
        claves.forEach((clave, i) => {
          const valor = dict.get(clave);
          if (valor === undefined) return;
          distintos[i].add(valor);
          apartados.push(valor);
          if (modo === "poda") dict.delete(clave);
        });
        if (modo === "inventario") examinar(dict);
      }
      for (const [clave, valor] of dict.entries())
        if (modo === "marca" || !claves.includes(clave)) pila.push(valor);
    } else if (o instanceof PDFArray) {
      for (const valor of o.asArray()) pila.push(valor);
    }
  }
  return {
    porClave: distintos.map((d) => d.size),
    apartados,
    hallazgos,
  };
}

interface Inventario {
  readonly recorrido: Recorrido;
  readonly huerfanos: number;
  readonly conInfo: boolean;
  readonly conId: boolean;
}

/**
 * Lo que la limpieza quitaría, sin quitar nada. Un huérfano es un objeto al que no se llega ni
 * desde el catálogo, ni desde el `Info`, ni desde lo que cuelga de las claves que se quitan (eso ya
 * se cuenta con su clave), y que no es de la linealización (se lee por posición, no por referencia).
 */
function inventariar({ lib, doc, escaneo }: Abierto): Inventario {
  const contexto = doc.context;
  const alcanzados = new Set<PDFRef>();
  const recorrido = recorrer(
    lib,
    contexto,
    [contexto.trailerInfo.Root],
    alcanzados,
    "inventario",
  );
  recorrer(
    lib,
    contexto,
    [contexto.trailerInfo.Info, ...recorrido.apartados],
    alcanzados,
    "marca",
  );
  const linealizacion = new Set(escaneo.objetosDeLinealizacion);
  let huerfanos = 0;
  for (const [ref] of contexto.enumerateIndirectObjects())
    if (!alcanzados.has(ref) && !linealizacion.has(ref.objectNumber))
      huerfanos++;
  return {
    recorrido,
    huerfanos,
    conInfo: contexto.trailerInfo.Info !== undefined,
    conId: contexto.trailerInfo.ID !== undefined,
  };
}

/** La lista de lo que se quita, en el orden en que la pantalla lo nombra. */
function elementos(
  inventario: Inventario,
  porClave: readonly number[],
  revisiones: number,
): Elemento[] {
  const lista: Elemento[] = [];
  const poner = (
    clase: Elemento["clase"],
    marcador: string,
    cuantos: number,
  ) => {
    if (cuantos > 0) lista.push({ clase, marcador, bytes: null, cuantos });
  };
  poner("pdf-info", "/Info", inventario.conInfo ? 1 : 0);
  poner("pdf-xmp", "/Metadata", porClave[0]);
  poner("pdf-piece-info", "/PieceInfo", porClave[1]);
  poner("pdf-miniatura", "/Thumb", porClave[2]);
  poner("pdf-ultima-modificacion", "/LastModified", porClave[3]);
  poner("pdf-revisiones", "%%EOF", revisiones - 1);
  poner("pdf-huerfanos", "obj", inventario.huerfanos);
  poner("pdf-id", "/ID", inventario.conId ? 1 : 0);
  return lista;
}

// ── Los campos con nombre ─────────────────────────────────────────────────────────────────────

interface Texto {
  readonly texto: string;
  readonly cortado: boolean;
}

/** El texto de una cadena de PDF con el decodificador de pdf-lib, acotado. `null` si no es cadena. */
function textoDe(lib: PdfLib, valor: PDFObject | undefined): Texto | null {
  try {
    if (valor instanceof lib.PDFString) {
      const crudo = valor.asString();
      const cortado = crudo.length > LARGO_CRUDO;
      const cadena = cortado
        ? lib.PDFString.of(crudo.slice(0, LARGO_CRUDO))
        : valor;
      return { texto: cadena.decodeText(), cortado };
    }
    if (valor instanceof lib.PDFHexString) {
      const crudo = valor.asString();
      const cortado = crudo.length > 2 * LARGO_CRUDO;
      const cadena = cortado
        ? lib.PDFHexString.of(crudo.slice(0, 2 * LARGO_CRUDO))
        : valor;
      return { texto: cadena.decodeText(), cortado };
    }
  } catch {
    // UTF-16 roto u otra rareza: no se lista (el `Info` se quita entero igual).
  }
  return null;
}

/** El primer elemento del `/ID`, en hexadecimal minúscula. */
function hexDelId(lib: PdfLib, valor: PDFObject | undefined): Texto | null {
  if (valor instanceof lib.PDFHexString) {
    let hex = valor
      .asString()
      .replace(/[^0-9A-Fa-f]/g, "")
      .toLowerCase();
    if (hex.length % 2 === 1) hex += "0";
    return { texto: hex, cortado: false };
  }
  if (valor instanceof lib.PDFString) {
    const crudo = valor.asString().slice(0, LARGO_CRUDO);
    const bytes = lib.PDFString.of(crudo).asBytes();
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return { texto: hex, cortado: valor.asString().length > LARGO_CRUDO };
  }
  return null;
}

/** El nombre de una clave sin la barra (y acotado: un nombre de megas no es una clave). */
function nombreDe(clave: PDFName): string {
  return clave
    .asString()
    .slice(1, 129)
    .replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

interface Campos {
  readonly campos: readonly CampoCrudo[];
  readonly omitidos: number;
  readonly recortados: boolean;
}

function camposDelDocumento({ lib, doc, escaneo, catalogo }: Abierto): Campos {
  const contexto = doc.context;
  const todos: CampoCrudo[] = [];
  let recortados = escaneo.recortados;
  const poner = (
    clave: string,
    origen: CampoCrudo["origen"],
    texto: Texto,
    revela: CampoCrudo["revela"],
  ) => {
    if (texto.texto.trim() === "") return;
    const largo = texto.texto.length > LARGO_MAXIMO_DE_VALOR;
    recortados ||= largo || texto.cortado;
    todos.push({
      clave,
      origen,
      valor: largo ? texto.texto.slice(0, LARGO_MAXIMO_DE_VALOR) : texto.texto,
      revela,
    });
  };

  // 1. El `Info` vigente, tal como lo lee pdf-lib (la última definición de cada objeto).
  const info = contexto.lookup(contexto.trailerInfo.Info);
  if (info instanceof lib.PDFDict)
    for (const [clave, valor] of info.entries()) {
      const texto = textoDe(lib, contexto.lookup(valor));
      const nombre = nombreDe(clave);
      if (texto) poner(nombre, "pdf-info", texto, revelaDeInfo(nombre));
    }
  const vigentes = todos.slice();

  // 2. El XMP del catálogo. Se lee hasta `LARGO_MAXIMO_DE_XMP` bytes DECODIFICADOS: `getBytes`
  //    con tope para de inflar ahí, así que una bomba de compresión no pasa de ese tamaño. Un filtro
  //    que pdf-lib no conoce no impide quitarlo; solo impide nombrar lo que decía.
  const flujo = catalogo.lookup(lib.PDFName.of("Metadata"));
  if (flujo instanceof lib.PDFRawStream) {
    try {
      const crudos = lib
        .decodePDFRawStream(flujo)
        .getBytes(LARGO_MAXIMO_DE_XMP);
      const lectura = leerXmp(
        new TextDecoder("utf-8").decode(crudos),
        "pdf-xmp",
      );
      recortados ||= lectura.recortados;
      todos.push(...lectura.campos);
    } catch {
      // Filtro no soportado o flujo roto: el elemento se quita igual, sin listar.
    }
  }

  // 3. El `/ID`: el primer elemento es el que sobrevive a cada edición y ata la copia al original.
  const id = contexto.lookup(contexto.trailerInfo.ID);
  if (id instanceof lib.PDFArray && id.size() > 0) {
    const hex = hexDelId(lib, contexto.lookup(id.get(0)));
    if (hex) poner("ID", "pdf-info", hex, "identificador");
  }

  // 4. Lo de revisiones anteriores que el escáner leyó en los bytes. El `Info` que él PRESUME
  //    vigente se compara con el que leyó pdf-lib: lo que no coincide es de antes (la revisión
  //    vigente guardó el suyo comprimido).
  todos.push(...escaneo.camposAnteriores);
  for (const campo of escaneo.infoPresunto)
    if (
      !vigentes.some((v) => v.clave === campo.clave && v.valor === campo.valor)
    )
      todos.push(campo);

  const omitidos =
    Math.max(0, todos.length - MAXIMO_DE_CAMPOS) + escaneo.camposOmitidos;
  return { campos: todos.slice(0, MAXIMO_DE_CAMPOS), omitidos, recortados };
}

// ── Lo que se exporta ─────────────────────────────────────────────────────────────────────────

/** Qué dice el PDF de sí mismo, qué se quitaría y qué se informa sin tocar. Nada cambia. */
export async function analizarPdf(
  bytes: Uint8Array,
): Promise<AnalisisDeMetadatos> {
  return conClave(async () => {
    const abierto = await abrir(bytes);
    const { lib, escaneo, catalogo } = abierto;
    const inventario = inventariar(abierto);
    const { campos, omitidos, recortados } = camposDelDocumento(abierto);
    const { hallazgos } = inventario.recorrido;

    const formulario = catalogo.lookup(lib.PDFName.of("AcroForm"));
    const camposDeFormulario =
      formulario instanceof lib.PDFDict
        ? formulario.lookup(lib.PDFName.of("Fields"))
        : undefined;
    const nombres = catalogo.lookup(lib.PDFName.of("Names"));
    const javascript =
      hallazgos.javascript ||
      (nombres instanceof lib.PDFDict &&
        nombres.has(lib.PDFName.of("JavaScript")));

    const avisos: Aviso[] = [];
    if (escaneo.firmado || hallazgos.firmado)
      avisos.push({ clave: "pdf-firmado" });
    if (hallazgos.anotaciones > 0)
      avisos.push({ clave: "pdf-anotaciones", n: hallazgos.anotaciones });
    if (hallazgos.adjuntos > 0)
      avisos.push({ clave: "pdf-adjuntos", n: hallazgos.adjuntos });
    if (
      camposDeFormulario instanceof lib.PDFArray &&
      camposDeFormulario.size() > 0
    )
      avisos.push({ clave: "pdf-formularios" });
    if (javascript) avisos.push({ clave: "pdf-javascript" });
    if (escaneo.flujosDeObjetos)
      avisos.push({ clave: "pdf-flujos-de-objetos" });
    if (recortados) avisos.push({ clave: "valores-recortados" });
    if (omitidos > 0) avisos.push({ clave: "campos-de-mas", n: omitidos });

    return {
      formato: "pdf",
      campos,
      otrasEtiquetas: 0,
      quitables: elementos(
        inventario,
        inventario.recorrido.porClave,
        escaneo.revisiones.revisiones,
      ),
      conservables: [],
      avisos,
      revisiones: escaneo.revisiones,
    };
  });
}

/**
 * El PDF reescrito desde el catálogo: sin `Info`, sin XMP, sin `PieceInfo` ni `LastModified`, sin miniaturas, sin
 * revisiones anteriores ni objetos huérfanos, con un `/ID` derivado del contenido limpio. Las
 * páginas no se tocan. Determinista: los mismos bytes dan los mismos bytes.
 */
export async function limpiarPdf(bytes: Uint8Array): Promise<Limpieza> {
  return conClave(async () => {
    const abierto = await abrir(bytes);
    const { lib, doc, escaneo } = abierto;
    const contexto = doc.context;
    const inventario = inventariar(abierto);

    const alcanzados = new Set<PDFRef>();
    const poda = recorrer(
      lib,
      contexto,
      [contexto.trailerInfo.Root],
      alcanzados,
      "poda",
    );
    let mayor = 0;
    for (const [ref] of contexto.enumerateIndirectObjects()) {
      if (!alcanzados.has(ref)) contexto.delete(ref);
      else mayor = Math.max(mayor, ref.objectNumber);
    }
    // `/Size` sale del número de objeto más alto. Si quedara el del original (el de un huérfano ya
    // borrado), limpiar dos veces no daría los mismos bytes que limpiar una.
    contexto.largestObjectNumber = mayor;
    delete contexto.trailerInfo.Info;
    delete contexto.trailerInfo.ID;

    // La primera salida solo se usa para su huella: sin nombre que la retenga, deja de existir
    // antes de la segunda (dos copias del PDF a la vez costarían su tamaño de más en el pico).
    const idNuevo = sha256(await doc.save(GUARDADO)).slice(0, 32);
    contexto.trailerInfo.ID = contexto.obj([
      lib.PDFHexString.of(idNuevo),
      lib.PDFHexString.of(idNuevo),
    ]);
    const limpio = await doc.save(GUARDADO);

    return {
      bytes: limpio,
      quitados: elementos(
        inventario,
        poda.porClave,
        escaneo.revisiones.revisiones,
      ),
      conservados: [],
      idNuevo,
    };
  });
}
