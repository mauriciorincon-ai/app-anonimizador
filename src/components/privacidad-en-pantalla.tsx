"use client";

// El ruido con garantía, después de transformar (S7): un panel APARTE del balance.
//
// Aparte a propósito, por la misma regla que separa el riesgo estimado del exacto: el balance mide
// el k y los únicos del archivo entero, y esto mide ε por valor de un campo. Son dos garantías
// distintas que no se suman, y dos cifras en el mismo panel se componen aunque nadie las sume. Cada
// fila dice su mecanismo y su ε efectivo; la perturbación simple dice «sin ε», con palabra, no con
// un hueco ni con un color.

import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import type { PrivacidadDeLaEntrada } from "@/engine/bitacora";
import type { InformeDePrivacidad } from "@/engine/ruido";
import { DOMINIO_MAXIMO } from "@/engine/ruido/limites";
import { epsilon, numero } from "@/lib/formato";
import { PRIVACIDAD as P } from "@/lib/idioma/textos/privacidad";

export function PrivacidadEnPantalla({
  privacidad,
}: {
  privacidad: InformeDePrivacidad | null;
}) {
  const { t, idioma } = useT();
  if (!privacidad) return null;
  const conEpsilon = privacidad.columnas.some(
    (c) => c.aplicado && c.epsilonEfectivo !== null,
  );

  return (
    <Panel
      etiqueta={t(P.etiqueta)}
      titulo={t(P.titulo)}
      nota={<Rico texto={P.fuente} />}
    >
      <p className="text-tinta-suave text-[0.875rem] leading-relaxed text-pretty">
        <Rico texto={P.intro} />
      </p>
      <p className="text-tinta mt-3 text-[0.9375rem]">
        {conEpsilon ? (
          <Rico
            texto={P.porFila}
            datos={{ epsilon: epsilon(privacidad.epsilonPorFila, idioma) }}
          />
        ) : (
          <Rico texto={P.sinEpsilon} />
        )}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-[0.875rem]">
          <thead>
            <tr className="border-borde border-b">
              {/* Tres columnas y las notas DEBAJO del mecanismo: en 412 px una cuarta columna
                  quedaba de dos letras de ancho. La ε va sin mayúsculas: la etiqueta pone todo en
                  mayúsculas, y «Ε» (épsilon mayúscula) se lee como una E latina. */}
              {(["columna", "mecanismo", "epsilon"] as const).map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="etiqueta py-2 pr-3 text-left"
                  // En línea y no `normal-case`: `.etiqueta` vive fuera de las capas de Tailwind
                  // y le gana a cualquier utilidad.
                  style={c === "epsilon" ? { textTransform: "none" } : undefined}
                >
                  {t(P.encabezados[c])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {privacidad.columnas.map((c) => {
              const notas: string[] = [];
              if (!c.aplicado)
                notas.push(
                  t(P.notas.noAplicada, {
                    n: numero(c.dominio ?? 0, idioma),
                    maximo: numero(DOMINIO_MAXIMO, idioma),
                  }),
                );
              else {
                if (c.dominio !== null)
                  notas.push(t(P.notas.dominio, { n: numero(c.dominio, idioma) }));
                if (c.recortes > 0)
                  notas.push(t(P.notas.recortes, { n: numero(c.recortes, idioma) }));
                if (c.noNumericas > 0)
                  notas.push(
                    t(P.notas.noNumericas, { n: numero(c.noNumericas, idioma) }),
                  );
              }
              return (
                <tr key={c.columna} className="border-borde border-b align-top">
                  <th
                    scope="row"
                    className="text-tinta py-2 pr-3 text-left font-mono text-[0.8125rem] font-normal break-words"
                  >
                    {c.columna}
                  </th>
                  <td className="text-tinta py-2 pr-3">
                    {t(P.mecanismos[c.mecanismo])}
                    {notas.length > 0 ? (
                      <span className="text-tinta-suave mt-1 block text-[0.8125rem] leading-relaxed">
                        {notas.join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-tinta py-2 pr-3 tabular-nums">
                    {!c.aplicado ? (
                      <span className="text-alerta">
                        <span aria-hidden="true" className="mr-1 font-semibold">
                          ✗
                        </span>
                        —
                      </span>
                    ) : c.epsilonEfectivo === null ? (
                      t(P.sinGarantia)
                    ) : (
                      t(P.efectivo, {
                        efectivo: epsilon(c.epsilonEfectivo, idioma),
                        pedido: epsilon(c.epsilon ?? 0, idioma),
                      })
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Lo que la bitácora guarda del ruido: el ε por fila y los mecanismos, sin nombres de columna. */
export function privacidadDeLaEntrada(
  privacidad: InformeDePrivacidad,
): PrivacidadDeLaEntrada {
  const aplicadas = privacidad.columnas.filter((c) => c.aplicado);
  return {
    epsilonPorFila: privacidad.epsilonPorFila,
    mecanismos: [
      ...new Set(
        aplicadas
          .map((c) => c.mecanismo)
          .filter(
            (m): m is "laplace" | "respuesta-aleatorizada" => m !== "perturbar",
          ),
      ),
    ],
    perturbadas: aplicadas.filter((c) => c.mecanismo === "perturbar").length,
  };
}
