// El certificado de una limpieza de metadatos (S6) — un PDF o una imagen, no una tabla.
//
// Mismas tres reglas que el reporte de una tabla (`reporte.ts`, de donde vienen los estilos, el
// sello y el escapado): autocontenido, ningún contenido del archivo y determinista —mismo informe +
// misma limpieza + misma fecha + mismo idioma ⇒ mismo documento, byte por byte—.
//
// Lo que certifica es más ESTRECHO que un tratamiento, y por eso el documento empieza por ahí: se
// quitó lo que el archivo dice de sí mismo; lo que muestra sigue igual. Después vienen las dos
// huellas, lo que se quitó (con tamaños), lo que se conservó y por qué, lo que decía el original
// (enmascarado), la poscomprobación como cifra, los avisos —lo que NO se limpió— y cómo comprobarlo.

import { numero } from "@/lib/formato";
import { decir, LOCALE, plural, type Idioma, type Texto } from "@/lib/idioma";
import { decirMensaje } from "@/lib/idioma/mensajes";
import { DOCUMENTOS as D } from "@/lib/idioma/textos/documentos";

import type {
  Aviso,
  CampoDeMetadato,
  ClaseDeElemento,
  Elemento,
  FormatoBinario,
  OrigenDeCampo,
  Revela,
  RevisionesDePdf,
} from "./metadatos/tipos";
import {
  baseDelNombre,
  escapar,
  ESTILOS,
  h,
  megabytes,
  SELLO,
} from "./reporte";

const L = D.limpieza;

export interface DatosDelCertificadoDeLimpieza {
  readonly archivo: {
    readonly nombre: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly formato: FormatoBinario;
  };
  readonly campos: readonly CampoDeMetadato[];
  readonly otrasEtiquetas: number;
  readonly avisos: readonly Aviso[];
  readonly revisiones: RevisionesDePdf | null;
  readonly limpieza: {
    readonly quitados: readonly Elemento[];
    readonly conservados: readonly Elemento[];
    readonly revisionesQuitadas: number;
    readonly idNuevo: string | null;
    readonly poscomprobacion: {
      readonly campos: number;
      readonly revisiones: number | null;
    };
    readonly sha256: string;
    readonly bytes: number;
    /** El nombre del archivo limpio: va en el comando de verificación. */
    readonly nombre: string;
  };
  /** Fecha ya formateada por quien llama: el motor no mira el reloj. */
  readonly fecha: string;
  readonly idioma: Idioma;
}

const REVELA: Record<Revela, Texto> = L.revela;

const ORIGEN: Record<OrigenDeCampo, Texto> = {
  exif: L.origen.exif,
  gps: L.origen.gps,
  xmp: L.origen.xmp,
  iptc: L.origen.iptc,
  "png-texto": L.origen.pngTexto,
  comentario: L.origen.comentario,
  "pdf-info": L.origen.pdfInfo,
  "pdf-xmp": L.origen.pdfXmp,
  "pdf-revision-anterior": L.origen.pdfRevisionAnterior,
};

const CLASE: Record<ClaseDeElemento, Texto> = {
  exif: L.clases.exif,
  xmp: L.clases.xmp,
  "xmp-extendido": L.clases.xmpExtendido,
  iptc: L.clases.iptc,
  miniatura: L.clases.miniatura,
  fabricante: L.clases.fabricante,
  "imagenes-adicionales": L.clases.imagenesAdicionales,
  procedencia: L.clases.procedencia,
  comentario: L.clases.comentario,
  texto: L.clases.texto,
  "fecha-de-cambio": L.clases.fechaDeCambio,
  aplicacion: L.clases.aplicacion,
  auxiliar: L.clases.auxiliar,
  "bytes-sobrantes": L.clases.bytesSobrantes,
  "perfil-de-color": L.clases.perfilDeColor,
  orientacion: L.clases.orientacion,
  jfif: L.clases.jfif,
  adobe: L.clases.adobe,
  "pdf-info": L.clases.pdfInfo,
  "pdf-xmp": L.clases.pdfXmp,
  "pdf-piece-info": L.clases.pdfPieceInfo,
  "pdf-miniatura": L.clases.pdfMiniatura,
  "pdf-ultima-modificacion": L.clases.pdfUltimaModificacion,
  "pdf-revisiones": L.clases.pdfRevisiones,
  "pdf-huerfanos": L.clases.pdfHuerfanos,
  "pdf-id": L.clases.pdfId,
};

const A = L.avisosDeLimpieza;

/** Un aviso como frase. Los que son una cuenta eligen su forma con `plural()`. */
function textoDelAviso(aviso: Aviso): { texto: Texto; n: number } {
  const n = aviso.n ?? 0;
  switch (aviso.clave) {
    case "extension-distinta":
      return { texto: A.extensionDistinta, n };
    case "orientacion-conservada":
      return { texto: A.orientacionConservada, n };
    case "imagenes-adicionales":
      return { texto: A.imagenesAdicionales, n };
    case "texto-comprimido":
      return { texto: A.textoComprimido, n };
    case "exif-ilegible":
      return { texto: A.exifIlegible, n };
    case "valores-recortados":
      return { texto: A.valoresRecortados, n };
    case "campos-de-mas":
      return { texto: A.camposDeMas, n };
    case "pdf-firmado":
      return { texto: A.pdfFirmado, n };
    case "pdf-anotaciones":
      return {
        texto: plural(n, A.pdfAnotacionesUna, A.pdfAnotacionesVarias),
        n,
      };
    case "pdf-adjuntos":
      return { texto: plural(n, A.pdfAdjuntosUno, A.pdfAdjuntosVarios), n };
    case "pdf-formularios":
      return { texto: A.pdfFormularios, n };
    case "pdf-javascript":
      return { texto: A.pdfJavascript, n };
    case "pdf-flujos-de-objetos":
      return { texto: A.pdfFlujosDeObjetos, n };
  }
}

/** Una fila de «lo que se quitó / se conservó»: qué es, su marcador técnico y su tamaño. */
function itemDeElemento(elemento: Elemento, idioma: Idioma): string {
  const tamano =
    elemento.bytes === null
      ? h(L.sinTamano, idioma)
      : megabytes(elemento.bytes, idioma);
  const veces =
    elemento.cuantos > 1
      ? ` ${h(L.cuantos, idioma, { n: elemento.cuantos })}`
      : "";
  return `<li><span>${h(CLASE[elemento.clase], idioma)} <code>${escapar(elemento.marcador)}</code>${veces}</span><b>${tamano}</b></li>`;
}

function filaDeCampo(campo: CampoDeMetadato, idioma: Idioma): string {
  const deteccion = campo.deteccion
    ? `<p class="por-que">${
        campo.deteccion.dentro
          ? h(L.campos.contiene, idioma, {
              tipo: decirMensaje(campo.deteccion.etiqueta, idioma),
            })
          : escapar(decirMensaje(campo.deteccion.etiqueta, idioma))
      }</p>`
    : "";
  return `<tr><td class="col">${escapar(campo.clave)}</td><td>${h(ORIGEN[campo.origen], idioma)}</td><td>${h(REVELA[campo.revela], idioma)}${deteccion}</td><td><code>${escapar(campo.muestra)}</code></td></tr>`;
}

function seccionDeVerificacion(nombre: string, idioma: Idioma): string {
  const V = D.verificacion;
  const archivo = escapar(nombre);
  return `
<section>
<p class="etiqueta">${h(V.etiqueta, idioma)}</p>
<h2>${h(V.titulo, idioma)}</h2>
<p style="margin:0 0 10px">${h(L.verificacion.intro, idioma)}</p>
<table>
<thead><tr><th>${h(V.sistema, idioma)}</th><th>${h(V.comando, idioma)}</th></tr></thead>
<tbody>
<tr><td>macOS</td><td><code>shasum -a 256 ${archivo}</code></td></tr>
<tr><td>Linux</td><td><code>sha256sum ${archivo}</code></td></tr>
<tr><td>Windows</td><td><code>certutil -hashfile ${archivo} SHA256</code></td></tr>
</tbody>
</table>
<p style="margin:12px 0 0">${h(L.verificacion.coincide, idioma)}</p>
<p class="por-que">${h(L.verificacion.noCoincide, idioma)}</p>
<p class="por-que">${h(V.queNoDemuestra, idioma)}</p>
</section>`;
}

/**
 * Nombre del certificado. Distinto del de un tratamiento (`velo-certificado-…`) porque es otro
 * documento: dos en la misma carpeta no deben obligar a abrirlos para saber cuál es cuál.
 */
const PREFIJO: Record<Idioma, string> = {
  es: "velo-limpieza",
  en: "velo-cleaning",
};

export function nombreDelCertificadoDeLimpieza(
  nombreDelArchivo: string,
  idioma: Idioma,
): string {
  // Quien llama pasa el nombre de la copia LIMPIA (el del original puede ser lo más sensible del
  // archivo); su prefijo `velo-limpio-` sobra delante de `velo-limpieza-`.
  const base = nombreDelArchivo.replace(/^velo-limpio-/, "");
  return `${PREFIJO[idioma]}-${baseDelNombre(base, idioma)}.html`;
}

export function construirCertificadoDeLimpieza(
  datos: DatosDelCertificadoDeLimpieza,
): string {
  const { archivo, campos, avisos, limpieza, fecha, idioma } = datos;
  const I = D.identidad;
  const esPdf = archivo.formato === "pdf";
  const quitados = limpieza.quitados.map((e) => itemDeElemento(e, idioma));
  const conservados = limpieza.conservados.map((e) =>
    itemDeElemento(e, idioma),
  );

  return `<!doctype html>
<html lang="${LOCALE[idioma]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(L.titulo, idioma, { archivo: archivo.nombre })}</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">
<p class="sello">${SELLO}${h(D.comun.sello, idioma)}</p>
<p class="etiqueta" style="margin-top:18px">${h(L.encabezado, idioma)}</p>
<h1>${escapar(archivo.nombre)}</h1>
<p style="color:var(--tinta-suave);margin:4px 0 0">${h(L.linea, idioma, {
    formato: decir(L.formatos[archivo.formato], idioma),
    tamano: megabytes(archivo.bytes, idioma),
    fecha,
  })}</p>

<section class="sola">
<p class="etiqueta">${h(L.limite.etiqueta, idioma)}</p>
<h2>${h(L.limite.titulo, idioma)}</h2>
<p style="margin:0">${h(L.limite.cuerpo, idioma)}</p>
</section>

<section>
<p class="etiqueta">${h(I.etiqueta, idioma)}</p>
<h2>${h(I.tituloCertificado, idioma)}</h2>
<p style="margin:0 0 6px">${h(I.huellaDeEntrada, idioma)}</p>
<p class="huella">${escapar(archivo.sha256)}</p>
<p style="margin:14px 0 6px">${h(L.identidad.huellaDeSalida, idioma, { nombre: limpieza.nombre })}</p>
<p class="huella">${escapar(limpieza.sha256)}</p>
<p class="por-que">${h(I.dosArchivos, idioma)}</p>
</section>

<section>
<p class="etiqueta">${h(L.quitado.etiqueta, idioma)}</p>
<h2>${h(L.quitado.titulo, idioma)}</h2>
<p style="margin:0">${h(L.quitado.intro, idioma)}</p>
${quitados.length > 0 ? `<ul class="limpia">${quitados.join("")}</ul>` : `<p class="por-que">${h(L.quitado.nada, idioma)}</p>`}
${datos.otrasEtiquetas > 0 ? `<p class="por-que">${h(L.quitado.otrasEtiquetas, idioma, { n: datos.otrasEtiquetas })}</p>` : ""}
${limpieza.revisionesQuitadas > 0 ? `<p style="margin:12px 0 0">${h(L.quitado.revisiones, idioma, { n: limpieza.revisionesQuitadas })}</p>` : ""}
${limpieza.idNuevo ? `<p style="margin:8px 0 0">${h(L.quitado.idNuevo, idioma, { id: limpieza.idNuevo })}</p>` : ""}
</section>
${
  conservados.length > 0
    ? `
<section>
<p class="etiqueta">${h(L.conservado.etiqueta, idioma)}</p>
<h2>${h(L.conservado.titulo, idioma)}</h2>
<ul class="limpia">${conservados.join("")}</ul>
</section>`
    : ""
}

<section>
<p class="etiqueta">${h(L.campos.etiqueta, idioma)}</p>
<h2>${h(L.campos.titulo, idioma)}</h2>
${
  campos.length > 0
    ? `<p style="margin:0 0 10px">${h(L.campos.nota, idioma)}</p>
<table>
<thead><tr><th>${h(L.campos.campo, idioma)}</th><th>${h(L.campos.donde, idioma)}</th><th>${h(L.campos.revela, idioma)}</th><th>${h(L.campos.muestra, idioma)}</th></tr></thead>
<tbody>${campos.map((c) => filaDeCampo(c, idioma)).join("")}</tbody>
</table>`
    : `<p class="por-que">${h(L.campos.ninguno, idioma)}</p>`
}
</section>

<section>
<p class="etiqueta">${h(L.comprobacion.etiqueta, idioma)}</p>
<h2>${h(L.comprobacion.titulo, idioma)}</h2>
<p style="margin:0">${h(esPdf ? L.comprobacion.cuerpoPdf : L.comprobacion.cuerpoImagen, idioma, { campos: numero(limpieza.poscomprobacion.campos, idioma), revisiones: numero(limpieza.poscomprobacion.revisiones ?? 1, idioma) })}</p>
</section>
${
  avisos.length > 0
    ? `
<section>
<p class="etiqueta">${h(L.avisos.etiqueta, idioma)}</p>
<h2>${h(L.avisos.titulo, idioma)}</h2>
<ul class="limpia salvedades">${avisos
        .map((aviso) => {
          const { texto, n } = textoDelAviso(aviso);
          return `<li>${h(texto, idioma, { n })}</li>`;
        })
        .join("")}</ul>
</section>`
    : ""
}
${seccionDeVerificacion(limpieza.nombre, idioma)}

<footer>
<p>${h(L.pie.contenido, idioma)}</p>
<p>${h(L.pie.noAfirma, idioma)}</p>
<p>${h(L.pie.generado, idioma)}</p>
</footer>
</div>
</body>
</html>
`;
}
