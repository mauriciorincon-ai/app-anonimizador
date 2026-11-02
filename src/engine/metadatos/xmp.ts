// XMP — el paquete de metadatos en XML que llevan las fotos y los PDF (ISO 16684-1).
//
// **No hay un parser de XML aquí, a propósito.** Un parser de XML sobre contenido hostil es una
// superficie entera (entidades, expansión, profundidad), y Velo no necesita entender el documento:
// necesita NOMBRAR lo que hay para decírselo al usuario, porque la limpieza quita el paquete entero
// sin leerlo. Se buscan por nombre las propiedades de una lista cerrada, en sus dos formas (atributo
// `xmpMM:DocumentID="…"` y elemento `<dc:creator>…</dc:creator>`, con sus `rdf:li`).
//
// Límite declarado: se buscan con los prefijos de siempre (`dc:`, `xmp:`, `xmpMM:`…). La norma deja
// que un archivo los llame de otra forma; si lo hace, esas propiedades no se listan, pero el paquete
// se quita igual — lo que no se nombra no se queda.

import type { CampoCrudo, OrigenDeCampo, Revela } from "./tipos";
import { LARGO_MAXIMO_DE_VALOR } from "./tipos";

/** Hasta dónde se lee un paquete. Lo que pase no se lista (el paquete se quita entero igual). */
export const LARGO_MAXIMO_DE_XMP = 1_048_576;

/** Las propiedades que se nombran, con lo que revelan. El orden es el de la lista en pantalla. */
const PROPIEDADES: readonly (readonly [string, Revela])[] = [
  ["dc:creator", "autoria"],
  ["tiff:Artist", "autoria"],
  ["photoshop:AuthorsPosition", "autoria"],
  ["photoshop:Credit", "autoria"],
  ["xmpRights:Owner", "autoria"],
  ["dc:rights", "autoria"],
  ["exifEX:CameraOwnerName", "autoria"],
  ["Iptc4xmpCore:CiEmailWork", "autoria"],
  ["Iptc4xmpCore:CiTelWork", "autoria"],
  ["Iptc4xmpCore:CiAdrExtadr", "ubicacion"],
  ["Iptc4xmpCore:CiAdrCity", "ubicacion"],
  ["Iptc4xmpCore:Location", "ubicacion"],
  ["photoshop:City", "ubicacion"],
  ["photoshop:State", "ubicacion"],
  ["photoshop:Country", "ubicacion"],
  ["exif:GPSLatitude", "ubicacion"],
  ["exif:GPSLongitude", "ubicacion"],
  ["exif:GPSAltitude", "ubicacion"],
  ["tiff:Make", "dispositivo"],
  ["tiff:Model", "dispositivo"],
  ["aux:SerialNumber", "dispositivo"],
  ["aux:Lens", "dispositivo"],
  ["exifEX:BodySerialNumber", "dispositivo"],
  ["exifEX:LensSerialNumber", "dispositivo"],
  ["xmp:CreatorTool", "software"],
  ["pdf:Producer", "software"],
  ["photoshop:History", "software"],
  ["xmp:CreateDate", "fecha"],
  ["xmp:ModifyDate", "fecha"],
  ["xmp:MetadataDate", "fecha"],
  ["exif:DateTimeOriginal", "fecha"],
  ["photoshop:DateCreated", "fecha"],
  ["xmpMM:DocumentID", "identificador"],
  ["xmpMM:InstanceID", "identificador"],
  ["xmpMM:OriginalDocumentID", "identificador"],
  ["stRef:documentID", "identificador"],
  ["stRef:instanceID", "identificador"],
  ["exif:ImageUniqueID", "identificador"],
  ["dc:title", "descripcion"],
  ["dc:description", "descripcion"],
  ["dc:subject", "descripcion"],
  ["pdf:Keywords", "descripcion"],
  ["photoshop:Headline", "descripcion"],
  ["exif:UserComment", "descripcion"],
];

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Las cinco entidades de XML y las numéricas. Nada más: no hay DTD que expandir. */
export function decodificarEntidades(texto: string): string {
  return texto.replace(
    /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/g,
    (entera, cuerpo: string) => {
      if (cuerpo.startsWith("#x"))
        return puntoDeCodigo(Number.parseInt(cuerpo.slice(2), 16), entera);
      if (cuerpo.startsWith("#"))
        return puntoDeCodigo(Number.parseInt(cuerpo.slice(1), 10), entera);
      return ENTIDADES[cuerpo] ?? entera;
    },
  );
}

function puntoDeCodigo(codigo: number, siNo: string): string {
  return codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : siNo;
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizar(valor: string): string {
  return decodificarEntidades(valor.replace(/\s+/g, " ").trim());
}

function recortar(valor: string): { valor: string; recortado: boolean } {
  return valor.length > LARGO_MAXIMO_DE_VALOR
    ? { valor: valor.slice(0, LARGO_MAXIMO_DE_VALOR), recortado: true }
    : { valor, recortado: false };
}

/**
 * Lo más largo que puede medir una etiqueta (con sus atributos) para contar como tal. Sin este
 * tope, mil `<dc:creator ` sin su `>` harían que cada intento recorriera el resto del paquete.
 */
const LARGO_MAXIMO_DE_ETIQUETA = 1024;

/**
 * El contenido de un elemento: sus `rdf:li` unidos con «; », o su texto sin etiquetas si no tiene.
 *
 * Un solo recorrido con `indexOf`, sin expresiones. Una etiqueta es un `<` con su primer `>` a no más
 * de `LARGO_MAXIMO_DE_ETIQUETA` caracteres, y ese `>` se recuerda: es el mismo para todos los `<` que
 * haya antes de él. Con `/<[^>]{0,1024}>/g`, un mega de `<` costaba 1024 pasos por cada uno, y las
 * propiedades anidadas lo pagaban una vez por propiedad: 10 s con siete (hallazgo M1 del S6).
 */
function textoDelElemento(contenido: string): string {
  const items: string[] = [];
  const trozos: string[] = [];
  let desde = 0;
  let cierre = -1;
  /** Dónde terminó un `<rdf:li…>` si es lo último que se vio antes del texto pendiente. */
  let item = -1;
  for (
    let i = contenido.indexOf("<");
    i >= 0;
    i = contenido.indexOf("<", i + 1)
  ) {
    if (cierre < i) {
      cierre = contenido.indexOf(">", i + 1);
      if (cierre < 0) break;
    }
    if (cierre - i - 1 > LARGO_MAXIMO_DE_ETIQUETA) continue;
    const etiqueta = contenido.slice(i, cierre + 1);
    const texto = contenido.slice(desde, i);
    if (item === desde && etiqueta === "</rdf:li>" && !texto.includes("<"))
      items.push(normalizar(texto));
    trozos.push(texto);
    desde = cierre + 1;
    item = /^<rdf:li\b/.test(etiqueta) ? desde : -1;
    i = cierre;
  }
  if (items.length > 0) return items.filter((i) => i !== "").join("; ");
  trozos.push(contenido.slice(desde));
  return normalizar(trozos.join(" "));
}

/**
 * Los valores en forma de atributo: `xmpMM:DocumentID="uuid:…"`, con comillas dobles o simples.
 *
 * El cierre se busca con `indexOf` y no con un `[^"]*` dentro de la expresión: si una comilla no
 * aparece después de un punto, no aparece después de ningún punto posterior, así que basta un
 * recorrido por tipo de comilla. Con la expresión, cada apertura sin cierre volvía a recorrer el
 * resto del paquete — cuadrático, y un paquete hostil lo aprovecha.
 */
function valoresDeAtributo(xmp: string, nombre: string): string[] {
  const valores: string[] = [];
  const sinCierre = new Set<string>();
  const apertura = new RegExp(
    `(?:^|[\\s<])${nombre}\\s{0,64}=\\s{0,64}(["'])`,
    "g",
  );
  for (let m = apertura.exec(xmp); m !== null; m = apertura.exec(xmp)) {
    const comilla = m[1];
    if (sinCierre.has(comilla)) continue;
    const desde = m.index + m[0].length;
    const hasta = xmp.indexOf(comilla, desde);
    if (hasta < 0) {
      sinCierre.add(comilla);
      continue;
    }
    valores.push(normalizar(xmp.slice(desde, hasta)));
    apertura.lastIndex = hasta + 1;
  }
  return valores;
}

/**
 * Los valores en forma de elemento: `<dc:creator>…</dc:creator>`. Misma razón para el `indexOf`: si
 * no queda ningún cierre, ninguna apertura posterior puede cerrar, y se deja de buscar.
 */
function valoresDeElemento(
  xmp: string,
  nombre: string,
  clave: string,
): string[] {
  const valores: string[] = [];
  const cierre = `</${clave}>`;
  const apertura = new RegExp(
    `<${nombre}(?:\\s[^>]{0,${LARGO_MAXIMO_DE_ETIQUETA}})?>`,
    "g",
  );
  for (let m = apertura.exec(xmp); m !== null; m = apertura.exec(xmp)) {
    const desde = m.index + m[0].length;
    const hasta = xmp.indexOf(cierre, desde);
    if (hasta < 0) break;
    valores.push(textoDelElemento(xmp.slice(desde, hasta)));
    apertura.lastIndex = hasta + cierre.length;
  }
  return valores;
}

export interface LecturaDeXmp {
  readonly campos: readonly CampoCrudo[];
  /** Algún valor pasó de `LARGO_MAXIMO_DE_VALOR` y se recortó. */
  readonly recortados: boolean;
}

/**
 * Las propiedades de la lista cerrada que el paquete trae, en el orden de la lista y, dentro de
 * una propiedad, en el orden del paquete. Un paquete sin ninguna no es un error: no hay nada que
 * nombrar, y la limpieza lo quita igual.
 */
export function leerXmp(texto: string, origen: OrigenDeCampo): LecturaDeXmp {
  const xmp =
    texto.length > LARGO_MAXIMO_DE_XMP
      ? texto.slice(0, LARGO_MAXIMO_DE_XMP)
      : texto;
  const campos: CampoCrudo[] = [];
  let recortados = false;

  for (const [clave, revela] of PROPIEDADES) {
    const nombre = escaparRegex(clave);
    const valores = [
      ...valoresDeAtributo(xmp, nombre),
      ...valoresDeElemento(xmp, nombre, clave),
    ];
    for (const valor of valores) {
      if (valor === "") continue;
      const corto = recortar(valor);
      recortados ||= corto.recortado;
      campos.push({ clave, origen, valor: corto.valor, revela });
    }
  }
  return { campos, recortados };
}

/** ¿El texto es un paquete XMP? Se mira la raíz, no la extensión ni el nombre del bloque. */
export function pareceXmp(texto: string): boolean {
  return /<x:xmpmeta\b|<rdf:RDF\b/.test(texto);
}
