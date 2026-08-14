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

import { Boton } from "@/components/boton";
import { Panel } from "@/components/panel";
import {
  construirReporte,
  nombreDelCertificado,
  nombreDelReporte,
  type DatosDelTratamiento,
} from "@/engine/reporte";
import type { AsaDeArchivo } from "@/lib/sesion";
import type { Informe } from "@/workers/contrato";

const FORMATO_DE_FECHA = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
});

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
      fecha: FORMATO_DE_FECHA.format(new Date()),
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
      ? nombreDelCertificado(informe.archivo.nombre)
      : nombreDelReporte(informe.archivo.nombre);
    enlace.click();
    URL.revokeObjectURL(url);
  }

  // El estado que el S4 estrena: hay tratamiento, pero todavía no hay archivo. **No se enseña un
  // botón muerto ni un certificado a medias**: se dice qué falta y por qué, que es una frase corta
  // y evita la pregunta «¿por qué no puedo descargarlo?».
  if (tratamiento !== undefined && !puedeCertificar) {
    return (
      <Panel
        etiqueta="Paso 6 · el certificado"
        titulo="Primero el archivo, después su certificado"
      >
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          El certificado lleva la huella{" "}
          <strong className="text-tinta font-medium">SHA-256</strong> del
          archivo tratado, y esa huella no existe hasta que el archivo existe.
          Genera el archivo en el paso de arriba y el certificado aparece aquí.
        </p>
        <p className="text-tinta-tenue mt-3 text-[0.875rem] leading-relaxed">
          Es la diferencia entre un papel que <em>describe</em> un tratamiento y
          uno que se puede <strong className="font-medium">comprobar</strong>
          contra el archivo que tienes en la mano.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      etiqueta={esCertificado ? "Paso 6 · el certificado" : "Reporte"}
      titulo={
        esCertificado
          ? "Llévate el certificado del tratamiento"
          : "Llévate el diagnóstico"
      }
      nota={
        esCertificado ? (
          <>
            Lleva las <strong className="font-medium">dos huellas</strong>: la
            del archivo que entró y la del que te llevas. Quien lo reciba puede
            recalcular la segunda y comprobar que este documento habla de{" "}
            <strong className="font-medium">esa copia exacta</strong> — el
            documento le explica cómo, con el comando de su sistema.
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
          {esCertificado ? (
            <>
              {" "}
              — y, porque transformaste, <strong>qué se le hizo</strong>: el
              balance con sus salvedades, la utilidad que se perdió, el hash de
              la política aplicada y{" "}
              <strong>la huella del archivo que sale</strong>
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
          {esCertificado ? "Descargar el certificado" : "Descargar el reporte"}
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
          title={
            esCertificado
              ? "Vista previa del certificado"
              : "Vista previa del reporte"
          }
          sandbox=""
          srcDoc={vistaPrevia}
          className="rounded-2 border-borde mt-5 h-[28rem] w-full border bg-white"
        />
      ) : null}
    </Panel>
  );
}
