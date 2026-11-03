"use client";

// P2 — el diagnóstico completo, en su forma presentacional.
//
// Recibe el informe y lo pinta. No sabe de workers, de rutas ni de sesión: así los estados de esta
// pantalla se prueban con un informe de mentira y sin levantar un navegador.
//
// El orden no es casual — cifra, evidencia, consejo:
//   1. **El riesgo**, porque es la única cosa de la pantalla que el usuario no podía saber solo.
//   2. **La tabla de columnas**, que es de dónde sale esa cifra.
//   3. **El consejero**, que es qué hacer con ella.

import { PanelDelAdvisor } from "@/components/advisor-de-qis";
import { DescargaDelCertificado } from "@/components/descarga-del-certificado";
import { EstructuraDelJson } from "@/components/estructura-del-json";
import { InsigniaDeCategoria } from "@/components/insignias";
import { Panel } from "@/components/panel";
import { PanelDeRiesgo } from "@/components/panel-de-riesgo";
import { TablaDeColumnas } from "@/components/tabla-de-columnas";
import { Rico, useT } from "@/components/texto";
import { MUESTRA_MAXIMA } from "@/engine/clasificador";
import type { CategoriaLey1581 } from "@/engine/validadores/tipos";
import {
  FILAS_PARA_CLASIFICAR_EN_ALTO_VOLUMEN,
  TOPE_DE_CELDAS_EN_MEMORIA,
} from "@/lib/archivo";
import { bytes, milisegundos, numero } from "@/lib/formato";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";
import type { Informe } from "@/workers/contrato";

/** Orden fijo de lectura: de lo que más pesa jurídicamente a lo que menos. */
const ORDEN_DE_CATEGORIAS: readonly CategoriaLey1581[] = [
  "identificador-directo",
  "dato-sensible",
  "cuasi-identificador",
  "no-personal",
];

export function InformeDeDiagnostico({ informe }: { informe: Informe }) {
  const { t, idioma } = useT();
  const { archivo, diagnostico, riesgo, advisor, medicion, estructura } =
    informe;
  const conDatosPersonales =
    diagnostico.resumen["identificador-directo"] +
      diagnostico.resumen["cuasi-identificador"] +
      diagnostico.resumen["dato-sensible"] >
    0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="etiqueta">{t(DIAGNOSTICO.informe.etiqueta)}</p>
        {/* El nombre del archivo va en mono, no en la display: es una cadena literal del usuario,
            y la mono lo dice sin necesidad de comillas. */}
        <h1 className="text-tinta mt-1.5 font-mono text-[clamp(1.375rem,4vw,1.875rem)] leading-tight font-semibold break-all">
          {archivo.nombre}
        </h1>
        <p className="cifra text-tinta-suave mt-2 text-[0.9375rem]">
          {t(
            estructura
              ? DIAGNOSTICO.informe.tamanoJson
              : DIAGNOSTICO.informe.tamano,
            {
              filas: diagnostico.filas,
              columnas: diagnostico.columnas.length,
              peso: bytes(archivo.bytes, idioma),
            },
          )}
        </p>
        <p className="cifra text-tinta-tenue mt-1 text-[0.75rem]">
          {medicion.heapMb !== null
            ? t(DIAGNOSTICO.informe.lecturaConMemoria, {
                lectura: milisegundos(medicion.msLectura, idioma),
                analisis: milisegundos(medicion.msDiagnostico, idioma),
                mb: numero(medicion.heapMb, idioma),
              })
            : t(DIAGNOSTICO.informe.lecturaSinMemoria, {
                lectura: milisegundos(medicion.msLectura, idioma),
                analisis: milisegundos(medicion.msDiagnostico, idioma),
              })}
        </p>
        {/* La huella se enseña aquí y no solo en el reporte: es lo que ata este diagnóstico a un
            archivo concreto, y el usuario puede compararla con la de su propio `sha256sum` sin
            tener que descargar nada. */}
        <p className="text-tinta-tenue mt-2 text-[0.6875rem]">
          <span className="etiqueta mr-1.5 text-[0.6875rem] tracking-[0.14em]">
            SHA-256
          </span>
          <code className="font-mono break-all">{archivo.sha256}</code>
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {ORDEN_DE_CATEGORIAS.filter(
            (categoria) => diagnostico.resumen[categoria] > 0,
          ).map((categoria) => (
            <li key={categoria} className="flex items-baseline gap-1.5">
              <span className="cifra text-tinta text-[0.8125rem] font-semibold">
                {numero(diagnostico.resumen[categoria], idioma)}
              </span>
              <InsigniaDeCategoria categoria={categoria} />
            </li>
          ))}
        </ul>
      </header>

      {/* S8: antes que cualquier cifra, que el archivo se leyó por pasadas y qué cambia por eso. */}
      {informe.modo === "alto-volumen" ? (
        <Panel
          etiqueta={t(DIAGNOSTICO.informe.altoVolumen.etiqueta)}
          titulo={t(DIAGNOSTICO.informe.altoVolumen.titulo)}
        >
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            <Rico
              texto={DIAGNOSTICO.informe.altoVolumen.texto}
              datos={{
                celdas: numero(TOPE_DE_CELDAS_EN_MEMORIA, idioma),
                filas: numero(FILAS_PARA_CLASIFICAR_EN_ALTO_VOLUMEN, idioma),
              }}
            />
          </p>
        </Panel>
      ) : null}

      {conDatosPersonales ? null : (
        <Panel
          etiqueta={t(DIAGNOSTICO.informe.sinHallazgos.etiqueta)}
          titulo={t(DIAGNOSTICO.informe.sinHallazgos.titulo)}
          nota={t(DIAGNOSTICO.informe.sinHallazgos.nota)}
        >
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            <Rico
              texto={DIAGNOSTICO.informe.sinHallazgos.detalle}
              datos={{ n: diagnostico.columnas.length }}
            />
          </p>
        </Panel>
      )}

      <PanelDeRiesgo
        riesgo={riesgo}
        identificadoresDirectos={diagnostico.resumen["identificador-directo"]}
      />

      {/* Solo en un JSON. Va antes de la tabla de columnas: lo que sale sin tratar (las listas)
          explica por qué la tabla de abajo no es todo el archivo. */}
      {estructura ? <EstructuraDelJson estructura={estructura} /> : null}

      <Panel
        etiqueta={t(DIAGNOSTICO.informe.columnas.etiqueta)}
        titulo={t(DIAGNOSTICO.informe.columnas.titulo)}
        nota={
          <Rico
            texto={DIAGNOSTICO.informe.columnas.nota}
            datos={{ n: MUESTRA_MAXIMA }}
          />
        }
      >
        <TablaDeColumnas columnas={diagnostico.columnas} />
      </Panel>

      <PanelDelAdvisor advisor={advisor} filas={diagnostico.filas} />

      <DescargaDelCertificado informe={informe} />
    </div>
  );
}
