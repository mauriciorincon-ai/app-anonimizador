"use client";

// P3 · P6 — el documento que acompaña al archivo, con vista previa antes de descargar.
//
// El mismo componente sirve las dos pantallas, y la diferencia entre ellas es de autoridad:
//
//   · Sin `tratamiento`, en `/diagnostico`, es el **reporte del diagnóstico** del S1: describe lo
//     que Velo encontró en un archivo que sigue intacto. Lleva una huella porque solo hay un
//     archivo del que hablar.
//   · Con `tratamiento`, en el taller, es el **certificado** del S4: lleva **las dos huellas** —la
//     del archivo que entró y la del que sale— y por eso quien lo recibe puede COMPROBAR que habla
//     de la copia que tiene, en vez de creerlo.
//
// La vista previa no está por cortesía: este es el único artefacto de Velo que sale del navegador,
// y quien lo descarga tiene derecho a ver exactamente qué va a mandar antes de mandarlo. Va dentro
// de un `<iframe sandbox srcdoc>` — sin `allow-scripts`, sin acceso al documento que lo contiene.
//
// La fecha se calcula AQUÍ y se le pasa al generador. El motor no puede mirar el reloj (hay un test
// que lo verifica leyendo el código fuente): si lo hiciera, el documento dejaría de ser reproducible
// y con él se iría la promesa de determinismo.

import { useState } from "react";

import { IconoCertificado, IconoEquis, IconoOjo } from "@/components/iconos";
import { Boton } from "@/components/boton";
import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import {
  construirReporte,
  nombreDelCertificado,
  nombreDelReporte,
  type DatosDelTratamiento,
} from "@/engine/reporte";
import { LOCALE } from "@/lib/idioma";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";
import type { AsaDeArchivo } from "@/lib/sesion";
import type { Informe } from "@/workers/contrato";

const C = TRANSFORMAR.certificado;

/** Lo del tratamiento, menos las dos cosas que solo existen cuando el archivo ya se generó. */
type TratamientoSinSalida = Omit<
  DatosDelTratamiento,
  "sha256DeSalida" | "nombreDeSalida"
>;

export function DescargaDelCertificado({
  informe,
  tratamiento,
  archivo,
  huellaDeSalida,
}: {
  informe: Informe;
  tratamiento?: TratamientoSinSalida;
  /** El asa del archivo tratado. Solo su NOMBRE se usa aquí — los bytes no se tocan (ADR-005). */
  archivo?: AsaDeArchivo | null;
  huellaDeSalida?: string | null;
}) {
  const { t, idioma } = useT();
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);

  // El certificado existe cuando existen sus dos huellas, y la de salida no existe hasta que el
  // archivo se generó. Se comprueban las dos juntas para que el tipo de `generar()` no dependa de
  // una correspondencia que solo vive en la cabeza de quien lee.
  const puedeCertificar =
    tratamiento !== undefined &&
    archivo != null &&
    huellaDeSalida != null &&
    huellaDeSalida !== "";

  const esCertificado = puedeCertificar;

  function generar(): string {
    return construirReporte({
      archivo: informe.archivo,
      diagnostico: informe.diagnostico,
      riesgo: informe.riesgo,
      advisor: informe.advisor,
      // El idioma se lee AL GENERAR: el documento queda escrito en el que tenía la pantalla cuando
      // se pulsó, y la fecha con la convención de ese idioma. Los dos se inyectan; el motor no
      // mira ni el reloj ni la configuración regional.
      fecha: new Intl.DateTimeFormat(LOCALE[idioma], {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date()),
      idioma,
      tratamiento:
        puedeCertificar && tratamiento
          ? {
              ...tratamiento,
              sha256DeSalida: huellaDeSalida,
              nombreDeSalida: archivo.nombre,
            }
          : undefined,
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
    enlace.download = esCertificado
      ? nombreDelCertificado(informe.archivo.nombre, idioma)
      : nombreDelReporte(informe.archivo.nombre, idioma);
    enlace.click();
    URL.revokeObjectURL(url);
  }

  // El estado que el S4 estrena: hay tratamiento, pero todavía no hay archivo. **No se enseña un
  // botón muerto ni un certificado a medias**: se dice qué falta y por qué, que es una frase corta
  // y evita la pregunta «¿por qué no puedo descargarlo?».
  if (tratamiento !== undefined && !puedeCertificar) {
    return (
      <Panel etiqueta={t(C.pendiente.etiqueta)} titulo={t(C.pendiente.titulo)}>
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          <Rico texto={C.pendiente.antes} />{" "}
          <strong className="text-tinta font-medium">SHA-256</strong>{" "}
          <Rico texto={C.pendiente.despues} />
        </p>
        <p className="text-tinta-tenue mt-3 text-[0.875rem] leading-relaxed">
          <Rico texto={C.pendiente.diferencia.antes} />{" "}
          <em>{t(C.pendiente.diferencia.describe)}</em>{" "}
          <Rico texto={C.pendiente.diferencia.medio} />{" "}
          <strong className="font-medium">
            {t(C.pendiente.diferencia.comprobar)}
          </strong>{" "}
          <Rico texto={C.pendiente.diferencia.despues} />
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      etiqueta={
        esCertificado ? t(C.etiqueta.certificado) : t(C.etiqueta.reporte)
      }
      titulo={esCertificado ? t(C.titulo.certificado) : t(C.titulo.reporte)}
      nota={
        <Rico texto={esCertificado ? C.nota.certificado : C.nota.reporte} />
      }
    >
      <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
        <Rico texto={C.formato} />
      </p>

      <ul className="text-tinta-suave mt-4 space-y-1.5 text-[0.875rem]">
        <li>
          <strong className="text-tinta font-medium">
            {t(C.lleva.etiqueta)}
          </strong>{" "}
          <Rico texto={C.lleva.base} />
          {esCertificado ? (
            <>
              {" "}
              <Rico texto={C.lleva.tratamiento} />
            </>
          ) : null}
          .
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
          {esCertificado ? t(C.descargar.certificado) : t(C.descargar.reporte)}
        </Boton>
        <Boton
          type="button"
          variante="discreto"
          aria-expanded={vistaPrevia !== null}
          onClick={() =>
            setVistaPrevia((actual) => (actual === null ? generar() : null))
          }
        >
          {vistaPrevia === null ? <IconoOjo /> : <IconoEquis />}
          {vistaPrevia === null
            ? t(C.vistaPrevia.ver)
            : t(C.vistaPrevia.cerrar)}
        </Boton>
      </div>

      {vistaPrevia !== null ? (
        <iframe
          title={
            esCertificado
              ? t(C.vistaPrevia.tituloCertificado)
              : t(C.vistaPrevia.tituloReporte)
          }
          sandbox=""
          srcDoc={vistaPrevia}
          className="rounded-2 border-borde mt-5 h-[28rem] w-full border bg-white"
        />
      ) : null}
    </Panel>
  );
}
