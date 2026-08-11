"use client";

// P8 — la descarga: el archivo anonimizado sale de aquí.
//
// Dos pasos a propósito —preparar y guardar— y no es fricción de más: escribir 130 MB de CSV cuesta
// un momento, y Velo enseña su propio trabajo en vez de fingir que fue instantáneo.
//
// El segundo paso es un `<a download>` de verdad, no un `click()` sintético sobre un enlace
// inventado. Un enlace real está en el árbol de accesibilidad, se alcanza con Tab, se abre con
// Enter, y el navegador lo trata como lo que es. Y lo que hay detrás es una URL `blob:` — un origen
// opaco de este documento, sin petición de red, sin servidor y sin caché intermedia (ADR-005).
//
// La página nunca lee el archivo. No es una promesa: es que no tiene cómo. Lo que llega hasta aquí
// es una CADENA —la URL `blob:`—; el `Blob` se quedó en `src/lib/sesion.ts` y su referencia se
// perdió al crear la URL. No hay ningún objeto sobre el que se pudiera llamar `.text()`.

import { Boton } from "@/components/boton";
import { Panel } from "@/components/panel";
import { bytes as enBytes, numero } from "@/lib/formato";
import type { AsaDeArchivo } from "@/lib/sesion";

export function DescargaDelArchivo({
  archivo,
  preparando,
  filas,
  suprimidas,
  onPreparar,
}: {
  archivo: AsaDeArchivo | null;
  preparando: boolean;
  filas: number;
  suprimidas: readonly string[];
  onPreparar: () => void;
}) {
  return (
    <Panel
      etiqueta="Paso 5 · la entrega"
      titulo="Llévate el archivo"
      nota={
        <>
          El nombre no repite el del original: sale como{" "}
          <span className="font-mono">velo-anonimizado-…csv</span>. Un nombre
          como <span className="font-mono">pacientes-2026.csv</span> cuenta de
          qué va el contenido antes de que nadie lo abra, y ese nombre viaja en
          el asunto de un correo.
        </>
      }
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        Un CSV con {numero(filas)} filas
        {suprimidas.length > 0 ? (
          <>
            {" "}
            y sin{" "}
            {suprimidas.length === 1
              ? "la columna"
              : `las ${numero(suprimidas.length)} columnas`}{" "}
            <span className="font-mono text-[0.875rem]">
              {suprimidas.join(" · ")}
            </span>
          </>
        ) : null}
        . Separado por comas, terminado en salto de línea y sin BOM — si Excel
        en Windows te pregunta por la codificación, es UTF-8.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {archivo === null ? (
          <Boton type="button" disabled={preparando} onClick={onPreparar}>
            {preparando ? "Escribiendo el archivo…" : "Preparar el archivo"}
          </Boton>
        ) : (
          <>
            <a
              href={archivo.url}
              download={archivo.nombre}
              className="rounded-1 bg-acento text-papel shadow-1 inline-flex items-center gap-2 px-5 py-2.5 text-[0.9375rem] font-medium"
            >
              Guardar {archivo.nombre}
            </a>
            <p className="text-tinta-tenue text-[0.875rem]">
              {enBytes(archivo.bytes)} · lo escribe tu navegador, no un servidor
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
