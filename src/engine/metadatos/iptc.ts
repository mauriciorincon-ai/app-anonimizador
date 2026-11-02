// IPTC — los campos de agencia de prensa (IPTC-IIM 4.2) que Photoshop guarda en el APP13 de un
// JPEG, envueltos en sus «Image Resource Blocks» (IRB): `Photoshop 3.0\0` y, detrás, recursos
// `8BIM` con un número; el 0x0404 es el IIM. Es donde viven el autor (`By-line`), la ciudad, el
// pie de foto y el aviso de copyright que un programa de edición escribe sin preguntar.
//
// Fuentes: IPTC-NAA Information Interchange Model 4.2 (registro 2, «Application Record»), y la
// especificación de formato de archivo de Adobe Photoshop (sección «Image Resource Blocks»).
//
// Igual que con el XMP, leer sirve para NOMBRAR: la limpieza quita el APP13 entero, se entienda o
// no. Por eso un bloque roto no es un error: se lee hasta donde se puede, se anota `incompleto` y lo
// que no se nombró se va igual.

import {
  type CampoNuevo,
  crearCampo,
  type LecturaDeCampos,
} from "./inventario";
import {
  ascii,
  Cursor,
  coincide,
  textoUtf8Laxo,
  textoUtf8OLatin1,
} from "./lector-binario";
import { ErrorDeMetadatos, type CampoCrudo, type Revela } from "./tipos";
import { LARGO_MAXIMO_DE_XMP, leerXmp } from "./xmp";

/** La cabecera de un APP13 de Photoshop (con el `\0`). */
export const CABECERA_PHOTOSHOP = ascii("Photoshop 3.0\0");

/** Cuántos datasets o recursos se leen como mucho de un bloque. Lo que pase no se nombra. */
export const MAXIMO_DE_REGISTROS = 8192;

/** Registro 2 de IIM: número de dataset → nombre del estándar y qué revela. */
const DATASETS: ReadonlyMap<number, readonly [string, Revela]> = new Map([
  [5, ["ObjectName", "descripcion"]],
  [25, ["Keywords", "descripcion"]],
  [55, ["DateCreated", "fecha"]],
  [60, ["TimeCreated", "fecha"]],
  [62, ["DigitalCreationDate", "fecha"]],
  [63, ["DigitalCreationTime", "fecha"]],
  [80, ["By-line", "autoria"]],
  [85, ["By-lineTitle", "autoria"]],
  [90, ["City", "ubicacion"]],
  [92, ["Sub-location", "ubicacion"]],
  [95, ["Province-State", "ubicacion"]],
  [100, ["Country-PrimaryLocationCode", "ubicacion"]],
  [101, ["Country-PrimaryLocationName", "ubicacion"]],
  [105, ["Headline", "descripcion"]],
  [110, ["Credit", "autoria"]],
  [115, ["Source", "autoria"]],
  [116, ["CopyrightNotice", "autoria"]],
  [118, ["Contact", "autoria"]],
  [120, ["Caption-Abstract", "descripcion"]],
  [122, ["Writer-Editor", "autoria"]],
]);

export interface LecturaDeIptc extends LecturaDeCampos {
  /** Datasets que no están en la lista cerrada (versión del registro, urgencia…): se cuentan. */
  readonly otrasEtiquetas: number;
  /** El bloque estaba roto en algún punto: lo leído vale, pero no es todo. */
  readonly incompleto: boolean;
}

export interface LecturaDeIrb extends LecturaDeIptc {
  /** Bytes de la miniatura que Photoshop guarda como recurso (0x0409 / 0x040C), 0 si no hay. */
  readonly miniatura: number;
}

/** Acumulador común: el IIM y el IRB suman en el mismo. */
class Acumulado {
  readonly campos: CampoCrudo[] = [];
  recortados = false;
  otrasEtiquetas = 0;
  incompleto = false;

  agregar(nuevo: CampoNuevo): void {
    this.recortados ||= nuevo.recortado;
    if (nuevo.campo) this.campos.push(nuevo.campo);
  }

  sumar(lectura: LecturaDeIptc): void {
    this.recortados ||= lectura.recortados;
    this.campos.push(...lectura.campos);
    this.otrasEtiquetas += lectura.otrasEtiquetas;
    this.incompleto ||= lectura.incompleto;
  }
}

/** Los datasets de un bloque IIM: `0x1C`, registro, dataset, largo (corto o extendido), valor. */
export function leerIptcIim(datos: Uint8Array): LecturaDeIptc {
  const total = new Acumulado();
  const c = new Cursor(datos);
  let leidos = 0;
  try {
    while (c.restantes > 0) {
      const marca = c.u8();
      if (marca !== 0x1c) {
        // El relleno de ceros al final es habitual; cualquier otra cosa es un bloque roto.
        if (marca !== 0 || datos.subarray(c.pos).some((b) => b !== 0))
          total.incompleto = true;
        break;
      }
      if (++leidos > MAXIMO_DE_REGISTROS) {
        total.incompleto = true;
        break;
      }
      const registro = c.u8();
      const dataset = c.u8();
      let largo = c.u16be();
      if (largo & 0x8000) {
        // Largo extendido: los 15 bits de abajo dicen cuántos bytes ocupa el largo de verdad.
        const ancho = largo & 0x7fff;
        if (ancho === 0 || ancho > 4) {
          total.incompleto = true;
          break;
        }
        largo = 0;
        for (let i = 0; i < ancho; i++) largo = largo * 256 + c.u8();
      }
      const valor = c.tramo(largo);
      const conocido = registro === 2 ? DATASETS.get(dataset) : undefined;
      if (!conocido) {
        total.otrasEtiquetas += 1;
        continue;
      }
      const texto = textoUtf8OLatin1(valor);
      total.agregar(
        crearCampo(
          conocido[0],
          "iptc",
          conocido[1],
          texto.texto,
          texto.cortado,
        ),
      );
    }
  } catch (error) {
    if (!(error instanceof ErrorDeMetadatos)) throw error;
    total.incompleto = true;
  }
  return total;
}

const FIRMAS_DE_RECURSO = ["8BIM", "MeSa", "PHUT", "AgHg", "DCSR"].map(ascii);

/**
 * Los recursos de un IRB (lo que sigue a `Photoshop 3.0\0`). Del 0x0404 salen los campos IPTC; del
 * 0x0424, un XMP; 0x0409 y 0x040C son miniaturas. Los demás (resolución, guías, capas…) se cuentan.
 */
export function leerIrb(datos: Uint8Array): LecturaDeIrb {
  const total = new Acumulado();
  let miniatura = 0;
  const c = new Cursor(datos);
  let leidos = 0;
  try {
    while (c.restantes > 0) {
      if (!FIRMAS_DE_RECURSO.some((f) => coincide(datos, f, c.pos))) {
        if (datos.subarray(c.pos).some((b) => b !== 0)) total.incompleto = true;
        break;
      }
      if (++leidos > MAXIMO_DE_REGISTROS) {
        total.incompleto = true;
        break;
      }
      c.saltar(4);
      const id = c.u16be();
      // Nombre en cadena Pascal, rellenado para que (largo + texto) ocupe un número par.
      const largoDelNombre = c.u8();
      c.saltar(largoDelNombre + ((largoDelNombre + 1) % 2));
      const tamano = c.u32be();
      const recurso = c.tramo(tamano);
      if (tamano % 2 === 1 && c.restantes > 0) c.saltar(1);

      if (id === 0x0404) total.sumar(leerIptcIim(recurso));
      else if (id === 0x0424) {
        const xmp = leerXmp(textoUtf8Laxo(recurso, LARGO_MAXIMO_DE_XMP), "xmp");
        total.recortados ||= xmp.recortados;
        total.campos.push(...xmp.campos);
      } else if (id === 0x0409 || id === 0x040c) miniatura += tamano;
      else total.otrasEtiquetas += 1;
    }
  } catch (error) {
    if (!(error instanceof ErrorDeMetadatos)) throw error;
    total.incompleto = true;
  }
  return {
    campos: total.campos,
    recortados: total.recortados,
    otrasEtiquetas: total.otrasEtiquetas,
    incompleto: total.incompleto,
    miniatura,
  };
}
