// Metadatos de PDF e imágenes (S6) — los tipos que comparten los lectores, el worker y la interfaz.
//
// Lo que Velo limpia aquí NO es el contenido: es lo que el archivo dice DE SÍ MISMO sin que se vea
// (quién lo hizo, con qué, cuándo, dónde estaba la cámara, qué versiones tuvo antes). El texto de las
// páginas y lo que se ve en una foto no se tocan, y la interfaz y el certificado lo dicen.
//
// Dos planos, y la frontera entre ellos es la regla dura 7:
//   · `CampoCrudo` lleva el valor TAL CUAL. Vive solo en el worker.
//   · `CampoDeMetadato` es lo que cruza: el valor enmascarado (`mascara.ts`) y lo que un validador
//     confirmó de él. Ningún valor completo sale del worker.
//
// La limpieza es por LISTA BLANCA del contenedor (se conserva lo que hace falta para ver la imagen o
// abrir el documento; todo lo demás se quita), no por lista negra de etiquetas: una etiqueta que Velo
// no conoce se va igual. Las listas cerradas de etiquetas solo sirven para CONTAR y NOMBRAR lo que
// había. El modelo y sus límites: `decisions/010-pdf-metadatos.md` y `decisions/012-metadatos.md`.

import type { MensajeDeMotor } from "@/lib/idioma/mensajes";

import type {
  CategoriaLey1581,
  Certeza,
  TipoDetectado,
} from "../validadores/tipos";

/** El formato por CONTENIDO (bytes mágicos). La extensión es una pista y nada más. */
export type FormatoBinario = "pdf" | "jpeg" | "png" | "webp" | "heic";
export type FormatoDeImagen = Exclude<FormatoBinario, "pdf">;

/** Qué deja saber un campo. Decide el orden de lectura y la insignia en pantalla. */
export type Revela =
  | "autoria"
  | "ubicacion"
  | "dispositivo"
  | "software"
  | "fecha"
  | "identificador"
  | "descripcion"
  | "otro";

/** Dónde vive el campo, nombrado como lo nombra su estándar. */
export type OrigenDeCampo =
  | "exif"
  | "gps"
  | "xmp"
  | "iptc"
  | "png-texto"
  | "comentario"
  | "pdf-info"
  | "pdf-xmp"
  /** Un valor de una revisión ANTERIOR del PDF: el editor lo «reemplazó», pero sigue en los bytes. */
  | "pdf-revision-anterior";

/** Largo máximo con el que se guarda el valor de un campo. Lo que pase se recorta y se avisa. */
export const LARGO_MAXIMO_DE_VALOR = 512;

/** Cuántos campos se listan como mucho. Los demás se cuentan (`avisos: campos-de-mas`). */
export const MAXIMO_DE_CAMPOS = 400;

/** Un campo tal como lo leyó un lector. **El valor es crudo: no sale del worker.** */
export interface CampoCrudo {
  /** Nombre del estándar: `Artist`, `GPSLatitude`, `Author`, `xmpMM:DocumentID`, `By-line`… */
  readonly clave: string;
  readonly origen: OrigenDeCampo;
  /** Texto del valor, ya decodificado y recortado a `LARGO_MAXIMO_DE_VALOR`. */
  readonly valor: string;
  readonly revela: Revela;
}

/**
 * Algo del archivo que no es un campo: un segmento, un chunk, un diccionario, una miniatura, los
 * bytes que sobran tras el final. Es lo que la limpieza quita (o conserva), con su tamaño.
 */
export type ClaseDeElemento =
  // imágenes
  | "exif"
  | "xmp"
  | "xmp-extendido"
  | "iptc"
  | "miniatura"
  | "fabricante"
  | "imagenes-adicionales"
  | "procedencia"
  | "comentario"
  | "texto"
  | "fecha-de-cambio"
  | "aplicacion"
  | "auxiliar"
  | "bytes-sobrantes"
  /** Bytes dentro de la imagen que ningún elemento usa (lo que dejó una edición, por ejemplo). */
  | "datos-sin-uso"
  // lo que se conserva en una imagen
  | "perfil-de-color"
  | "orientacion"
  | "jfif"
  | "adobe"
  // PDF
  | "pdf-info"
  | "pdf-xmp"
  | "pdf-piece-info"
  | "pdf-miniatura"
  | "pdf-ultima-modificacion"
  | "pdf-revisiones"
  | "pdf-huerfanos"
  | "pdf-id";

export interface Elemento {
  readonly clase: ClaseDeElemento;
  /**
   * El nombre técnico, igual en los dos idiomas: `APP1`, `APP13`, `tEXt`, `EXIF`, `/Info`… Sirve a
   * quien quiera comprobarlo con otra herramienta.
   */
  readonly marcador: string;
  /** Tamaño en bytes, o `null` cuando no tiene uno propio (un diccionario dentro de un PDF). */
  readonly bytes: number | null;
  /** Cuántos hay de esta clase y marcador (dos `tEXt`, tres objetos huérfanos). */
  readonly cuantos: number;
}

/** Lo que la interfaz y el certificado tienen que decir aunque nadie lo pregunte. */
export type ClaveDeAviso =
  /** La extensión dice una cosa y los bytes otra: se trató por los bytes. */
  | "extension-distinta"
  /** Se conservó la orientación (un EXIF mínimo con solo esa etiqueta) para que la foto no se gire. */
  | "orientacion-conservada"
  /** Había imágenes adicionales (MPF: mapa de ganancia HDR, vistas): se quitan con lo demás. */
  | "imagenes-adicionales"
  /** Texto comprimido (zTXt, iTXt): se quita sin leerlo. */
  | "texto-comprimido"
  /**
   * Una foto HEIC trae imágenes auxiliares (mapa de profundidad, realce HDR): son píxeles y se
   * conservan, pero el XMP que las describe se va, así que el realce HDR puede perderse.
   */
  | "heic-auxiliares"
  /** Un bloque EXIF que no se pudo leer: se quita entero igual, pero no se sabe qué decía. */
  | "exif-ilegible"
  | "valores-recortados"
  | "campos-de-mas"
  /** Reescribir el PDF invalida su firma. */
  | "pdf-firmado"
  /** Anotaciones con autor (`/T`): Velo las enseña y NO las limpia. */
  | "pdf-anotaciones"
  | "pdf-adjuntos"
  | "pdf-formularios"
  | "pdf-javascript"
  /** Una revisión anterior guardada en flujos de objetos comprimidos: se quita, pero no se lista. */
  | "pdf-flujos-de-objetos";

export interface Aviso {
  readonly clave: ClaveDeAviso;
  /** Cuántos, cuando el aviso es una cuenta (anotaciones, adjuntos). */
  readonly n?: number;
}

/** Lo que el escáner de bytes sabe de la historia de un PDF. */
export interface RevisionesDePdf {
  /** Secciones `startxref … %%EOF`: 1 = el archivo nunca se editó con actualización incremental. */
  readonly revisiones: number;
  /** Objetos definidos más de una vez (`N G obj` repetido): lo que una edición «reemplazó». */
  readonly objetosRedefinidos: number;
  /** ¿Traía `/ID`? El primer elemento sobrevive a cada edición y ata la copia a su original. */
  readonly conId: boolean;
}

/** El análisis de un archivo, crudo. Vive en el worker. */
export interface AnalisisDeMetadatos {
  readonly formato: FormatoBinario;
  readonly campos: readonly CampoCrudo[];
  /** Etiquetas técnicas que no revelan nada por sí solas (exposición, ISO…): se quitan y se cuentan. */
  readonly otrasEtiquetas: number;
  /** Lo que la limpieza va a quitar. */
  readonly quitables: readonly Elemento[];
  /** Lo que la limpieza va a conservar, y que la pantalla declara. */
  readonly conservables: readonly Elemento[];
  readonly avisos: readonly Aviso[];
  /** Solo en un PDF. */
  readonly revisiones: RevisionesDePdf | null;
}

/** Un archivo limpio, todavía en el worker. */
export interface Limpieza {
  readonly bytes: Uint8Array;
  readonly quitados: readonly Elemento[];
  readonly conservados: readonly Elemento[];
  /** Solo en un PDF: el `/ID` nuevo, derivado del contenido limpio (32 hex). */
  readonly idNuevo: string | null;
}

/** Lo que un validador confirmó de un valor. Las mismas cuatro piezas que una columna. */
export interface Deteccion {
  readonly tipo: TipoDetectado;
  readonly etiqueta: MensajeDeMotor;
  readonly certeza: Certeza;
  readonly categoria: CategoriaLey1581;
  /** El validador lo vio en UNA PARTE del valor (`Ana Pérez · CC 1032456789`), no en el valor entero. */
  readonly dentro: boolean;
}

/** Lo que cruza a la página de un campo: el valor ENMASCARADO. */
export interface CampoDeMetadato {
  readonly clave: string;
  readonly origen: OrigenDeCampo;
  readonly revela: Revela;
  /** `mascara.ts`: nunca más de la mitad a la vista; menos de 6 caracteres, `***`. */
  readonly muestra: string;
  readonly deteccion: Deteccion | null;
}

/** Por qué un archivo binario no se puede limpiar. Son CLAVES: el error jamás cita contenido. */
export type MotivoDeMetadatos =
  | "pdf-cifrado"
  | "pdf-ilegible"
  | "imagen-ilegible"
  /**
   * La imagen usa una parte del formato que Velo no sabe reescribir sin romperla (una secuencia, una
   * Live Photo, un elemento protegido o una propiedad esencial que no conoce): no se toca.
   */
  | "imagen-no-soportada"
  /** La poscomprobación encontró campos en la salida: no se entrega un archivo que no quedó limpio. */
  | "limpieza-incompleta";

/** El único error que lanzan los lectores. `message` es la clave del motivo y nada más. */
export class ErrorDeMetadatos extends Error {
  readonly motivo: MotivoDeMetadatos;
  constructor(motivo: MotivoDeMetadatos) {
    super(motivo);
    this.name = "ErrorDeMetadatos";
    this.motivo = motivo;
  }
}
