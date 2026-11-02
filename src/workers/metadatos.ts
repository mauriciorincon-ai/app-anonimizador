// PDF e imágenes dentro del worker (S6) — leer, limpiar y COMPROBAR.
//
// Los lectores de `src/engine/metadatos/` son puros y reciben bytes; este módulo es lo que los ata a
// un archivo y a la frontera:
//
//   · decide el formato por los BYTES (la extensión es una pista) y avisa si no coinciden;
//   · convierte lo leído en lo que puede cruzar: nombres de campo y valores ENMASCARADOS;
//   · limpia, y después vuelve a correr el lector sobre el archivo LIMPIO. Si encuentra un solo
//     campo con nombre, el archivo NO se entrega (`limpieza-incompleta`): una limpieza que no se
//     comprueba es una promesa, y Velo no entrega promesas.
//
// Lo que este módulo NO hace es mirar el contenido: el texto de las páginas y los píxeles pasan tal
// cual, y la interfaz y el certificado lo dicen.

import { campoParaLaPagina } from "@/engine/metadatos/hallazgos";
import {
  extensionCoincide,
  formatoPorContenido,
} from "@/engine/metadatos/deteccion";
import { analizarImagen, limpiarImagen } from "@/engine/metadatos/imagen";
import {
  ErrorDeMetadatos,
  type AnalisisDeMetadatos,
  type FormatoBinario,
  type Limpieza,
} from "@/engine/metadatos/tipos";

import type { DiagnosticoDeMetadatos } from "./contrato";
import { analizarPdf, limpiarPdf } from "./limpiar-pdf";

/** Los bytes no son ni PDF, ni JPEG, ni PNG, ni WebP, ni HEIC, aunque el nombre diga que sí. */
export class FormatoNoCoincide extends Error {
  constructor() {
    super("formato-no-coincide");
    this.name = "FormatoNoCoincide";
  }
}

export interface LecturaDeBinario {
  readonly formato: FormatoBinario;
  readonly analisis: AnalisisDeMetadatos;
  readonly diagnostico: DiagnosticoDeMetadatos;
}

async function analizarPorFormato(
  bytes: Uint8Array,
  formato: FormatoBinario,
): Promise<AnalisisDeMetadatos> {
  return formato === "pdf"
    ? await analizarPdf(bytes)
    : analizarImagen(bytes, formato);
}

/** Lo que el lector halló, en la forma que puede cruzar la frontera. */
function paraLaPagina(analisis: AnalisisDeMetadatos): DiagnosticoDeMetadatos {
  return {
    campos: analisis.campos.map(campoParaLaPagina),
    otrasEtiquetas: analisis.otrasEtiquetas,
    quitables: analisis.quitables,
    conservables: analisis.conservables,
    avisos: analisis.avisos,
    revisiones: analisis.revisiones,
  };
}

export async function leerBinario(
  bytes: Uint8Array,
  nombre: string,
): Promise<LecturaDeBinario> {
  const formato = formatoPorContenido(bytes);
  if (formato === null) throw new FormatoNoCoincide();
  const leido = await analizarPorFormato(bytes, formato);
  // La extensión no decide nada, pero si miente se dice: quien lo mandó así puede no saberlo.
  const analisis: AnalisisDeMetadatos = extensionCoincide(nombre, formato)
    ? leido
    : {
        ...leido,
        avisos: [{ clave: "extension-distinta" }, ...leido.avisos],
      };
  return { formato, analisis, diagnostico: paraLaPagina(analisis) };
}

export interface ResultadoDeLimpiar {
  readonly limpieza: Limpieza;
  readonly poscomprobacion: {
    readonly campos: number;
    readonly revisiones: number | null;
  };
}

/**
 * Lo que la poscomprobación NO cuenta en un PDF limpio: el `/ID` que la propia limpieza escribió.
 * Es nuevo, derivado del contenido limpio y declarado en el certificado; contarlo como «campo que
 * quedó» sería contar el arreglo como si fuera el defecto.
 */
function esElIdNuevo(
  formato: FormatoBinario,
  limpieza: Limpieza,
  clave: string,
): boolean {
  return formato === "pdf" && clave === "ID" && limpieza.idNuevo !== null;
}

export async function limpiarBinario(
  bytes: Uint8Array,
  formato: FormatoBinario,
): Promise<ResultadoDeLimpiar> {
  const limpieza =
    formato === "pdf" ? await limpiarPdf(bytes) : limpiarImagen(bytes, formato);

  // La prueba: el MISMO lector, sobre la salida.
  const despues = await analizarPorFormato(limpieza.bytes, formato);
  const campos = despues.campos.filter(
    (c) => !esElIdNuevo(formato, limpieza, c.clave),
  ).length;
  const quedan = despues.quitables.filter(
    (e) => !(e.clase === "pdf-id" && limpieza.idNuevo !== null),
  ).length;
  const revisiones = despues.revisiones?.revisiones ?? null;
  if (campos > 0 || quedan > 0 || (revisiones !== null && revisiones > 1))
    throw new ErrorDeMetadatos("limpieza-incompleta");

  return { limpieza, poscomprobacion: { campos, revisiones } };
}
