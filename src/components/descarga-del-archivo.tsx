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
//
// S8, alto volumen: donde el navegador deja elegir un archivo de destino, el primer paso abre el
// selector del sistema y el worker escribe por trozos en el archivo elegido. La página solo le pasa
// el asa; no lee nada de lo escrito, y aquí llega el nombre y el tamaño para decir que ya está.

import { Boton } from "@/components/boton";
import { Panel } from "@/components/panel";
import { IconoDescargar, IconoDocumento } from "@/components/iconos";
import { Rico, useT } from "@/components/texto";
import { bytes as enBytes } from "@/lib/formato";
import type { Idioma } from "@/lib/idioma";
import { DOCUMENTOS } from "@/lib/idioma/textos/documentos";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import type { AsaDeArchivo } from "@/lib/sesion";

const E = TRANSFORMAR.entrega;

/** Lo que el worker escribe: un CSV o un Excel salen como CSV; un JSON, en su misma forma. */
export type SalidaDelArchivo = keyof typeof E.salida;

export function DescargaDelArchivo({
  archivo,
  preparando,
  salida,
  filas,
  suprimidas,
  hashDePolitica,
  idiomaDelTrabajo,
  onPreparar,
  altoVolumen = false,
  enDisco = null,
  onElegirDestino,
  escrituraFallida = false,
}: {
  archivo: AsaDeArchivo | null;
  preparando: boolean;
  salida: SalidaDelArchivo;
  filas: number;
  suprimidas: readonly string[];
  hashDePolitica: string;
  /** El idioma de la pantalla al pulsar «transformar»: el del archivo, aunque ahora haya otro. */
  idiomaDelTrabajo: Idioma;
  onPreparar: () => void;
  /** S8: el archivo es de alto volumen (se escribe por trozos). */
  altoVolumen?: boolean;
  /** S8: lo que el worker ya escribió en el archivo que el usuario eligió. */
  enDisco?: { readonly nombre: string; readonly bytes: number } | null;
  /** S8: abre el selector del sistema. Ausente donde el navegador no lo tiene. */
  onElegirDestino?: () => void;
  /** S10: el último intento de escribir falló; el botón sigue para reintentar. */
  escrituraFallida?: boolean;
}) {
  const { t, idioma } = useT();
  return (
    <Panel
      etiqueta={t(E.panel.etiqueta)}
      titulo={t(E.panel.titulo)}
      nota={<Rico texto={E.panel.nota} />}
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        <Rico texto={E.salida[salida].filas} datos={{ filas }} />
        {suprimidas.length > 0 ? (
          <>
            {" "}
            <Rico
              texto={suprimidas.length === 1 ? E.sinUna : E.sinVarias}
              datos={{ n: suprimidas.length }}
            />{" "}
            <span className="font-mono text-[0.875rem]">
              {suprimidas.join(" · ")}
            </span>
          </>
        ) : null}
        <Rico texto={E.salida[salida].formato} />
      </p>

      {/* Los 8 caracteres del nombre no son un número de serie: son el principio del SHA-256 de la
          política. Dos entregas con el mismo trozo recibieron el mismo trato, y el reporte lleva el
          hash completo. Estaba en el código y en ningún texto (hallazgo B1 de la auditoría). */}
      <p className="text-tinta-tenue mt-3 text-[0.875rem] leading-relaxed">
        <Rico texto={E.huella.antes} />
        <span className="text-tinta font-mono">
          {hashDePolitica.slice(0, 8)}
        </span>
        <Rico texto={E.huella.despues} />
      </p>

      {idiomaDelTrabajo !== idioma ? (
        <p className="text-tinta-suave mt-3 text-[0.875rem] leading-relaxed">
          <Rico
            texto={E.idiomaDelTrabajo}
            datos={{
              idioma: t(
                idiomaDelTrabajo === "es"
                  ? DOCUMENTOS.tratamiento.nombreDelIdioma.espanol
                  : DOCUMENTOS.tratamiento.nombreDelIdioma.ingles,
              ),
            }}
          />
        </p>
      ) : null}

      {altoVolumen && enDisco === null && archivo === null ? (
        <p className="text-tinta-suave mt-3 text-[0.875rem] leading-relaxed">
          <Rico
            texto={onElegirDestino ? E.elegirDestinoNota : E.enMemoriaNota}
          />
        </p>
      ) : null}

      {escrituraFallida && archivo === null && enDisco === null ? (
        // El símbolo, la palabra y el color juntos: el color nunca va solo.
        <p
          role="alert"
          className="text-alerta mt-3 text-[0.875rem] leading-relaxed"
        >
          <span aria-hidden="true" className="mr-1.5">
            ⚠
          </span>
          <Rico texto={E.escrituraFallida} />
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {enDisco !== null ? (
          // El símbolo, la palabra y el color juntos: el color nunca va solo.
          <p className="text-acento text-[0.9375rem] font-medium" role="status">
            <span aria-hidden="true" className="mr-1.5">
              ✓
            </span>
            <Rico
              texto={E.guardadoEnTuEquipo}
              datos={{
                nombre: enDisco.nombre,
                tamano: enBytes(enDisco.bytes, idioma),
              }}
            />
          </p>
        ) : archivo === null ? (
          <Boton
            type="button"
            disabled={preparando}
            onClick={onElegirDestino ?? onPreparar}
          >
            <IconoDocumento />
            {preparando
              ? t(E.preparando)
              : onElegirDestino
                ? t(E.elegirDestino)
                : t(E.preparar)}
          </Boton>
        ) : (
          <>
            <a
              href={archivo.url}
              download={archivo.nombre}
              className="rounded-1 bg-acento text-papel shadow-1 inline-flex items-center gap-2 px-5 py-2.5 text-[0.9375rem] font-medium"
            >
              <IconoDescargar />
              {t(E.guardar)} {archivo.nombre}
            </a>
            <p className="text-tinta-tenue text-[0.875rem]">
              <Rico
                texto={E.escribeTuNavegador}
                datos={{ tamano: enBytes(archivo.bytes, idioma) }}
              />
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
