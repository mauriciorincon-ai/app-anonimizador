"use client";

// El certificado de una limpieza de metadatos, con vista previa antes de descargar.
//
// Hermano de `descarga-del-certificado.tsx` y con las mismas dos propiedades que importan:
//
//   · **Lleva las dos huellas** —la del archivo que entró y la de la copia limpia—, así que quien lo
//     reciba puede recalcular la segunda y comprobar que el documento habla de ESA copia y no de otra.
//   · **Dice lo que la limpieza no tocó** con el mismo peso que lo que quitó. Eso lo escribe el motor
//     (`reporte-metadatos.ts`); esta pantalla solo lo enseña antes de que salga del navegador.
//
// La vista previa va dentro de un `<iframe sandbox srcdoc>` —sin `allow-scripts`, sin acceso a la
// página que lo contiene—: es el único artefacto que sale de aquí aparte del archivo limpio, y quien
// lo descarga tiene derecho a ver exactamente qué va a mandar.
//
// La fecha se calcula AQUÍ y se le pasa al generador. El motor no mira el reloj (hay un test que lo
// verifica leyendo el código fuente): si lo hiciera, el documento dejaría de ser reproducible.

import { useCallback, useMemo, useState } from "react";

import { Boton } from "@/components/boton";
import { IconoCertificado, IconoEquis, IconoOjo } from "@/components/iconos";
import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import {
  construirCertificadoDeLimpieza,
  nombreDelCertificadoDeLimpieza,
} from "@/engine/reporte-metadatos";
import { LOCALE } from "@/lib/idioma";
import { METADATOS } from "@/lib/idioma/textos/metadatos";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import type { AsaDeArchivo } from "@/lib/sesion";
import type { InformeDeMetadatos, ResumenDeLimpieza } from "@/workers/contrato";

const C = METADATOS.certificado;
const COMUN = TRANSFORMAR.certificado;

export function DescargaDelCertificadoDeLimpieza({
  informe,
  resumen,
  archivo,
}: {
  informe: InformeDeMetadatos;
  resumen: ResumenDeLimpieza;
  /** El asa del archivo limpio. Solo su NOMBRE se usa aquí — los bytes no se tocan (ADR-005). */
  archivo: AsaDeArchivo;
}) {
  const { t, idioma } = useT();
  // Se guarda SI la vista previa está abierta, no el documento: el documento se deriva del idioma.
  // Guardar el HTML ya generado dejaba la vista previa en el idioma viejo tras cambiar de idioma
  // mientras «Descargar» —que genera al pulsar— sí salía en el nuevo.
  const [abierta, setAbierta] = useState(false);

  const generar = useCallback((): string => {
    const { archivo: original, metadatos } = informe;
    return construirCertificadoDeLimpieza({
      archivo: {
        nombre: original.nombre,
        bytes: original.bytes,
        sha256: original.sha256,
        formato: original.formato,
      },
      campos: metadatos.campos,
      otrasEtiquetas: metadatos.otrasEtiquetas,
      avisos: metadatos.avisos,
      revisiones: metadatos.revisiones,
      limpieza: {
        quitados: resumen.quitados,
        conservados: resumen.conservados,
        revisionesQuitadas: resumen.revisionesQuitadas,
        idNuevo: resumen.idNuevo,
        poscomprobacion: resumen.poscomprobacion,
        sha256: resumen.sha256,
        bytes: resumen.bytes,
        nombre: archivo.nombre,
      },
      // El idioma se lee AL GENERAR: el documento queda escrito en el que tenía la pantalla cuando
      // se pulsó, y la fecha con la convención de ese idioma. Los dos se inyectan; el motor no mira
      // ni el reloj ni la configuración regional.
      fecha: new Intl.DateTimeFormat(LOCALE[idioma], {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date()),
      idioma,
    });
  }, [informe, resumen, archivo.nombre, idioma]);

  // La vista previa enseña lo que se va a mandar, así que se regenera cuando cambia lo que la
  // determina —el idioma incluido—.
  const vistaPrevia = useMemo(
    () => (abierta ? generar() : null),
    [abierta, generar],
  );

  function descargar() {
    // Un Blob y un enlace: el documento se arma en memoria y se guarda con el diálogo del sistema.
    // No hay servidor que lo genere, así que no hay servidor que lo vea.
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([generar()], { type: "text/html;charset=utf-8" }),
    );
    enlace.href = url;
    // El nombre sale del archivo LIMPIO (derivado de la huella del original), no del original: un
    // nombre de archivo ya cuenta de qué trata, y este documento viaja junto a la copia limpia.
    enlace.download = nombreDelCertificadoDeLimpieza(archivo.nombre, idioma);
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      etiqueta={t(C.etiqueta)}
      titulo={t(C.titulo)}
      nota={<Rico texto={C.nota} />}
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        <Rico texto={COMUN.formato} />
      </p>

      <ul className="text-tinta-suave mt-4 space-y-1.5 text-[0.875rem]">
        <li>
          <strong className="text-tinta font-medium">
            {t(C.lleva.etiqueta)}
          </strong>{" "}
          <Rico texto={C.lleva.cuerpo} />
        </li>
        <li>
          <strong className="text-tinta font-medium">
            {t(C.noLleva.etiqueta)}
          </strong>{" "}
          <Rico texto={C.noLleva.cuerpo} />
        </li>
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <Boton type="button" onClick={descargar}>
          <IconoCertificado />
          {t(COMUN.descargar.certificado)}
        </Boton>
        <Boton
          type="button"
          variante="discreto"
          aria-expanded={abierta}
          onClick={() => setAbierta((actual) => !actual)}
        >
          {abierta ? <IconoEquis /> : <IconoOjo />}
          {abierta ? t(COMUN.vistaPrevia.cerrar) : t(COMUN.vistaPrevia.ver)}
        </Boton>
      </div>

      {vistaPrevia !== null ? (
        <iframe
          title={t(COMUN.vistaPrevia.tituloCertificado)}
          sandbox=""
          srcDoc={vistaPrevia}
          className="rounded-2 border-borde mt-5 h-[28rem] w-full border bg-white"
        />
      ) : null}
    </Panel>
  );
}
