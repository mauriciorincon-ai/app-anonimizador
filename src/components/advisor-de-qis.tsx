"use client";

// El consejero de cuasi-identificadores: qué columnas, juntas, delatan.
//
// Es la lección de Sweeney (2000) y de su réplica de Golle (2006) vuelta herramienta. Ninguna de
// esas columnas identifica a nadie por separado —el municipio no, el sexo tampoco, la fecha de
// nacimiento tampoco— y las tres juntas señalan a buena parte de una población. El usuario no
// tiene por qué saber eso de antemano; el advisor se lo muestra sobre SUS datos, con el k real.
//
// Regla dura de esta pantalla: **nada de topes silenciosos**. El advisor mira un subconjunto de
// columnas y hasta cierto tamaño de combinación, y la interfaz dice cuántas miró, hasta dónde
// llegó y qué dejó fuera con su motivo. Un tope que no se declara se lee como "lo revisé todo".

import { Panel } from "@/components/panel";
import { Rico, RicoMensaje, useT } from "@/components/texto";
import type { AdvisorDeQis } from "@/engine/riesgo";
import { deCada, numero, porcentaje } from "@/lib/formato";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";

/** Cuántas combinaciones se enseñan. El número total evaluado se declara en la nota. */
const COMBINACIONES_VISIBLES = 6;

export function PanelDelAdvisor({
  advisor,
  filas,
}: {
  advisor: AdvisorDeQis;
  filas: number;
}) {
  const { t, idioma } = useT();
  const textos = DIAGNOSTICO.advisor;
  const visibles = advisor.combinaciones.slice(0, COMBINACIONES_VISIBLES);

  return (
    <Panel
      etiqueta={t(textos.etiqueta)}
      titulo={t(textos.titulo)}
      nota={<Alcance advisor={advisor} mostradas={visibles.length} />}
    >
      {advisor.identificanSolas.length > 0 ? (
        <section className="mb-6">
          <h3 className="text-tinta text-[0.9375rem] font-semibold">
            {t(textos.solasTitulo)}
          </h3>
          <p className="text-tinta-suave mt-1 text-[0.8125rem] leading-relaxed">
            <Rico texto={textos.solasExplicacion} />
          </p>
          <ul className="mt-3 space-y-2">
            {advisor.identificanSolas.map((columna) => (
              <li
                key={columna.nombre}
                className="rounded-2 border-alerta/25 bg-alerta-tenue flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border px-3 py-2"
              >
                <span className="text-tinta font-mono text-[0.8125rem]">
                  {columna.nombre}
                </span>
                <span className="cifra text-alerta text-[0.8125rem] font-medium">
                  {t(textos.solos, {
                    pct: porcentaje(columna.proporcionUnicos, idioma),
                  })}
                  <span className="text-tinta-tenue ml-2 font-normal">
                    {deCada(columna.unicos, filas, idioma)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visibles.length === 0 ? (
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          <Rico texto={textos.sinCombinaciones} />
        </p>
      ) : (
        <ol className="space-y-2">
          {visibles.map((combinacion) => (
            <li
              key={combinacion.columnas.join("+")}
              className="rounded-2 border-borde bg-papel-hundido flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border px-3 py-2.5"
            >
              <span className="flex flex-wrap items-baseline gap-1.5">
                {combinacion.columnas.map((columna, i) => (
                  <span key={columna} className="flex items-baseline gap-1.5">
                    {i > 0 ? (
                      <span
                        aria-hidden="true"
                        className="text-tinta-tenue text-[0.75rem]"
                      >
                        +
                      </span>
                    ) : null}
                    <span className="text-tinta font-mono text-[0.8125rem]">
                      {columna}
                    </span>
                  </span>
                ))}
              </span>
              <span className="cifra text-tinta-suave text-[0.8125rem]">
                <strong className="text-tinta font-semibold">
                  {porcentaje(combinacion.proporcionUnicos, idioma)}
                </strong>{" "}
                {t(textos.solosYGrupo, { k: numero(combinacion.k, idioma) })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/**
 * El alcance declarado: cuántas combinaciones se evaluaron, cuántas se enseñan, con qué tope y qué
 * columnas quedaron fuera con su motivo. Va en la nota al pie del panel, pegado al resultado.
 */
function Alcance({
  advisor,
  mostradas,
}: {
  advisor: AdvisorDeQis;
  mostradas: number;
}) {
  const { t, idioma } = useT();
  const textos = DIAGNOSTICO.advisor;
  return (
    <>
      {/* El alcance se cuenta con los números REALES de esta corrida, no con el tope teórico:
          decir "a partir de las 6 columnas con más valores distintos" en un archivo que solo tuvo
          3 candidatas es exagerar el trabajo hecho, que es la clase de imprecisión que este
          producto no se puede permitir justo en la frase donde declara sus límites. */}
      <p>
        {t(textos.alcanceInicio)}{" "}
        <strong className="cifra font-medium">
          {numero(advisor.combinacionesEvaluadas, idioma)}
        </strong>{" "}
        <Rico
          texto={
            advisor.candidatos.length === 1
              ? textos.alcanceCombinacionesUna
              : textos.alcanceCombinacionesVarias
          }
          datos={{ n: advisor.candidatos.length }}
        />
        {mostradas > 0 && mostradas < advisor.combinaciones.length ? (
          <>
            {" "}
            <Rico texto={textos.alcanceArriba} datos={{ n: mostradas }} />
          </>
        ) : null}
        <Rico
          texto={textos.alcanceTope}
          datos={{
            candidatos: advisor.tope.candidatosMaximos,
            tamano: advisor.tope.tamanoMaximo,
          }}
        />
      </p>
      {advisor.excluidas.length > 0 ? (
        <details className="mt-2">
          <summary className="text-tinta-suave cursor-pointer">
            <Rico
              texto={
                advisor.excluidas.length === 1
                  ? textos.fueraUna
                  : textos.fueraVarias
              }
              datos={{ n: advisor.excluidas.length }}
            />
          </summary>
          <ul className="mt-2 space-y-1">
            {advisor.excluidas.map((excluida) => (
              <li key={excluida.nombre}>
                <span className="text-tinta-suave font-mono">
                  {excluida.nombre}
                </span>{" "}
                — <RicoMensaje mensaje={excluida.motivo} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
