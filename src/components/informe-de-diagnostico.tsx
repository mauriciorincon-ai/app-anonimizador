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
import { DescargaDelReporte } from "@/components/descarga-del-reporte";
import { InsigniaDeCategoria } from "@/components/insignias";
import { Panel } from "@/components/panel";
import { PanelDeRiesgo } from "@/components/panel-de-riesgo";
import { TablaDeColumnas } from "@/components/tabla-de-columnas";
import { MUESTRA_MAXIMA } from "@/engine/clasificador";
import type { CategoriaLey1581 } from "@/engine/validadores/tipos";
import { bytes, milisegundos, numero } from "@/lib/formato";
import type { Informe } from "@/workers/contrato";

/** Orden fijo de lectura: de lo que más pesa jurídicamente a lo que menos. */
const ORDEN_DE_CATEGORIAS: readonly CategoriaLey1581[] = [
  "identificador-directo",
  "dato-sensible",
  "cuasi-identificador",
  "no-personal",
];

export function InformeDeDiagnostico({ informe }: { informe: Informe }) {
  const { archivo, diagnostico, riesgo, advisor, medicion } = informe;
  const conDatosPersonales =
    diagnostico.resumen["identificador-directo"] +
      diagnostico.resumen["cuasi-identificador"] +
      diagnostico.resumen["dato-sensible"] >
    0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="etiqueta">Diagnóstico</p>
        {/* El nombre del archivo va en mono, no en la display: es una cadena literal del usuario,
            y la mono lo dice sin necesidad de comillas. */}
        <h1 className="text-tinta mt-1.5 font-mono text-[clamp(1.375rem,4vw,1.875rem)] leading-tight font-semibold break-all">
          {archivo.nombre}
        </h1>
        <p className="cifra text-tinta-suave mt-2 text-[0.9375rem]">
          {numero(diagnostico.filas)} filas ·{" "}
          {numero(diagnostico.columnas.length)} columnas ·{" "}
          {bytes(archivo.bytes)}
        </p>
        <p className="cifra text-tinta-tenue mt-1 text-[0.75rem]">
          Leído en {milisegundos(medicion.msLectura)} y analizado en{" "}
          {milisegundos(medicion.msDiagnostico)}, dentro de esta pestaña
          {medicion.heapMb !== null
            ? ` · ${numero(medicion.heapMb)} MB de memoria`
            : ""}
          .
        </p>
        {/* La huella se enseña aquí y no solo en el reporte: es lo que ata este diagnóstico a un
            archivo concreto, y el usuario puede compararla con la de su propio `sha256sum` sin
            tener que descargar nada. */}
        <p className="text-tinta-tenue mt-2 text-[0.6875rem]">
          <span className="etiqueta mr-1.5 text-[0.6875rem] tracking-[0.14em]">
            sha-256
          </span>
          <code className="font-mono break-all">{archivo.sha256}</code>
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {ORDEN_DE_CATEGORIAS.filter(
            (categoria) => diagnostico.resumen[categoria] > 0,
          ).map((categoria) => (
            <li key={categoria} className="flex items-baseline gap-1.5">
              <span className="cifra text-tinta text-[0.8125rem] font-semibold">
                {numero(diagnostico.resumen[categoria])}
              </span>
              <InsigniaDeCategoria categoria={categoria} />
            </li>
          ))}
        </ul>
      </header>

      {conDatosPersonales ? null : (
        <Panel
          etiqueta="Sin hallazgos"
          titulo="Velo no reconoció datos personales aquí"
          nota="«No reconocimos datos personales» no es lo mismo que «este archivo es anónimo». Velo detecta lo que sabe detectar: documentos, contactos, ubicaciones y atributos demográficos. Un código interno de tu organización, un identificador de historia clínica o una combinación de columnas propia de tu dominio pueden seguir señalando a una persona sin que ningún algoritmo público lo note."
        >
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            Ninguna de las {numero(diagnostico.columnas.length)} columnas quedó
            clasificada como identificador directo, cuasi-identificador o dato
            sensible del artículo 5.
          </p>
        </Panel>
      )}

      <PanelDeRiesgo
        riesgo={riesgo}
        identificadoresDirectos={diagnostico.resumen["identificador-directo"]}
      />

      <Panel
        etiqueta="Columna por columna"
        titulo="Qué hay en tu tabla, y por qué lo creemos"
        nota={
          <>
            Se revisaron hasta {numero(MUESTRA_MAXIMA)} valores por columna,
            repartidos a zancada fija a lo largo de todo el archivo — no los
            primeros, que en una tabla ordenada por fecha o por región no
            representan al resto. Las muestras se enseñan enmascaradas.
          </>
        }
      >
        <TablaDeColumnas columnas={diagnostico.columnas} />
      </Panel>

      <PanelDelAdvisor advisor={advisor} filas={diagnostico.filas} />

      <DescargaDelReporte informe={informe} />
    </div>
  );
}
