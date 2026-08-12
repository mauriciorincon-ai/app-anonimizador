"use client";

// P3 — el reporte, con vista previa antes de descargar.
//
// La vista previa no está por cortesía: este es el único artefacto de Velo que sale del navegador,
// y quien lo descarga tiene derecho a ver exactamente qué va a mandar antes de mandarlo. Va dentro
// de un `<iframe sandbox srcdoc>` — sin `allow-scripts`, sin acceso al documento que lo contiene:
// el reporte se ve tal como lo verá quien lo reciba, y no puede tocar nada.
//
// La fecha se calcula AQUÍ y se le pasa al generador. El motor no puede mirar el reloj (hay un
// test que lo verifica leyendo el código fuente): si lo hiciera, el reporte dejaría de ser
// reproducible y con él se iría la promesa de determinismo.

import { useState } from "react";

import { Boton } from "@/components/boton";
import { Panel } from "@/components/panel";
import {
  construirReporte,
  nombreDelReporte,
  type DatosDelTratamiento,
} from "@/engine/reporte";
import type { Informe } from "@/workers/contrato";

const FORMATO_DE_FECHA = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
});

/**
 * El mismo componente en las dos pantallas, con y sin tratamiento.
 *
 * Sin `tratamiento` es el reporte del diagnóstico del S1. Con él, el documento declara qué se le
 * hizo al archivo — y esa diferencia no es un extra: **el reporte es lo único de Velo que se lee
 * fuera de la pantalla**. Un archivo anonimizado acompañado de un documento que solo describe el
 * original es la composición falsa de este sprint a nivel de artefacto: las dos piezas ciertas, el
 * par engañoso. Hallazgo A2 de la auditoría del S2, donde este camino existía, estaba probado y no
 * lo llamaba nadie.
 */
export function DescargaDelReporte({
  informe,
  tratamiento,
}: {
  informe: Informe;
  tratamiento?: DatosDelTratamiento;
}) {
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);

  function generar(): string {
    return construirReporte({
      archivo: informe.archivo,
      diagnostico: informe.diagnostico,
      riesgo: informe.riesgo,
      advisor: informe.advisor,
      fecha: FORMATO_DE_FECHA.format(new Date()),
      tratamiento,
    });
  }

  function descargar() {
    // Un Blob y un enlace: el archivo se arma en memoria y se guarda con el diálogo del sistema.
    // No hay servidor que lo genere, así que no hay servidor que lo vea.
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([generar()], { type: "text/html;charset=utf-8" }),
    );
    enlace.href = url;
    enlace.download = nombreDelReporte(informe.archivo.nombre);
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      etiqueta={tratamiento ? "Paso 6 · el documento" : "Reporte"}
      titulo={
        tratamiento
          ? "Llévate el reporte del tratamiento"
          : "Llévate el diagnóstico"
      }
      nota={
        tratamiento ? (
          <>
            La huella <strong className="font-medium">SHA-256</strong> que lleva
            es la del archivo que <strong className="font-medium">entró</strong>
            , no la del que descargas — el tratado es otro archivo y tiene otra
            huella. El documento lo dice con esas palabras, porque se va a leer
            sin esta pantalla al lado.
          </>
        ) : (
          <>
            El reporte lleva la huella{" "}
            <strong className="font-medium">SHA-256</strong> de tu archivo, así
            que quien lo reciba puede comprobar que habla de esa copia exacta y
            no de otra.
          </>
        )
      }
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        Un archivo HTML que se abre con doble clic en cualquier computador, sin
        internet y sin instalar nada.
      </p>

      <ul className="text-tinta-suave mt-4 space-y-1.5 text-[0.875rem]">
        <li>
          <strong className="text-tinta font-medium">Lleva:</strong> nombres de
          columna, qué se detectó y por qué, categorías de la Ley 1581, las
          cifras de riesgo, la huella del archivo y la fecha
          {tratamiento ? (
            <>
              {" "}
              — y, porque transformaste, <strong>qué se le hizo</strong>: el
              balance con sus salvedades, la utilidad que se perdió y el hash de
              la política aplicada
            </>
          ) : null}
          .
        </li>
        <li>
          <strong className="text-tinta font-medium">No lleva:</strong> ninguna
          fila de tu tabla. Las muestras van enmascaradas y las columnas
          sensibles no llevan ni muestra.
        </li>
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <Boton type="button" onClick={descargar}>
          Descargar el reporte
        </Boton>
        <Boton
          type="button"
          variante="discreto"
          aria-expanded={vistaPrevia !== null}
          onClick={() =>
            setVistaPrevia((actual) => (actual === null ? generar() : null))
          }
        >
          {vistaPrevia === null ? "Ver antes de descargar" : "Cerrar la vista"}
        </Boton>
      </div>

      {vistaPrevia !== null ? (
        <iframe
          title="Vista previa del reporte"
          sandbox=""
          srcDoc={vistaPrevia}
          className="rounded-2 border-borde mt-5 h-[28rem] w-full border bg-white"
        />
      ) : null}
    </Panel>
  );
}
