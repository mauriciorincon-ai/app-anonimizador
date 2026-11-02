"use client";

// «Cómo llegar al k» (S7) — Mondrian o la generalización óptima, y las dos lado a lado.
//
// Vive dentro del editor, debajo del k, y solo aparece cuando hay columnas en el reparto. Lo que el
// usuario elige se escribe en la POLÍTICA (`generalizacion`), así que cambia su hash y queda en el
// certificado; las escaleras que se tocan con Mondrian elegido se guardan aquí, como borrador, para
// no perderlas al ir y volver. La comparación la calcula el worker sobre las columnas del reparto:
// aquí solo llegan cifras, nombres de columna y claves de nivel.

import { useId, useState } from "react";

import { Boton } from "@/components/boton";
import { Rico, useT } from "@/components/texto";
import type { HallazgoDeColumna } from "@/engine/clasificador";
import {
  claveDeEscalera,
  escaleraSugerida,
  ESCALERAS,
  type ClaveDeEscalera,
} from "@/engine/jerarquias/sugerencia";
import type { JerarquiaDeLaPolitica, Politica } from "@/engine/politica";
import { numero, unoEn } from "@/lib/formato";
import type { Idioma } from "@/lib/idioma";
import { GENERALIZACION as G } from "@/lib/idioma/textos/generalizacion";
import {
  compararGeneralizacion,
  firmaDeComparacion,
  useTaller,
} from "@/lib/sesion";
import { nivelEnPalabras } from "@/lib/tecnicas-en-palabras";
import type { LadoDeLaComparacion } from "@/workers/contrato";

const CLAVES = Object.keys(ESCALERAS) as ClaveDeEscalera[];

/** Sí/No con símbolo: el color nunca va solo. */
function Veredicto({ ok }: { ok: boolean }) {
  const { t } = useT();
  return (
    <span className={ok ? "text-exito" : "text-alerta"}>
      <span aria-hidden="true" className="mr-1 font-semibold">
        {ok ? "✓" : "✗"}
      </span>
      {t(ok ? G.tabla.si : G.tabla.no)}
    </span>
  );
}

export function ComoLlegarAlK({
  columnas,
  politica,
  onCambio,
}: {
  columnas: readonly HallazgoDeColumna[];
  politica: Politica;
  onCambio: (politica: Politica) => void;
}) {
  const { t, idioma } = useT();
  const taller = useTaller();
  const idDeL = useId();
  const reparto = columnas.filter((c) =>
    politica.reglas.some(
      (r) =>
        r.columna === c.nombre && r.tecnica.tipo === "generalizar-automatico",
    ),
  );
  const sensibles = columnas.filter(
    (c) => c.categoria === "dato-sensible" && !reparto.includes(c),
  );
  const optima = politica.generalizacion?.algoritmo === "optima";

  // El borrador: lo que la política trae, y para lo que falte, la propuesta.
  const [borrador, setBorrador] = useState<
    Record<string, JerarquiaDeLaPolitica>
  >(() => ({ ...(politica.generalizacion?.jerarquias ?? {}) }));
  const [l, setL] = useState<number | null>(
    politica.generalizacion?.diversidad?.l ?? null,
  );
  const jerarquias: Record<string, JerarquiaDeLaPolitica> = {};
  for (const c of reparto)
    jerarquias[c.nombre] =
      (optima ? politica.generalizacion?.jerarquias[c.nombre] : undefined) ??
      borrador[c.nombre] ??
      ESCALERAS[escaleraSugerida(c)];

  /** La generalización óptima con lo que hay en pantalla. */
  function generalizacionCon(
    nuevas: Record<string, JerarquiaDeLaPolitica>,
    nuevaL: number | null,
  ): NonNullable<Politica["generalizacion"]> {
    return {
      algoritmo: "optima",
      jerarquias: nuevas,
      ...(nuevaL !== null && sensibles.length > 0
        ? {
            diversidad: { l: nuevaL, columnas: sensibles.map((c) => c.nombre) },
          }
        : {}),
    };
  }

  function elegir(algoritmo: "mondrian" | "optima"): void {
    if (algoritmo === "optima")
      onCambio({
        ...politica,
        generalizacion: generalizacionCon(jerarquias, l),
      });
    else {
      // Lo de la óptima no se pierde: queda en el borrador para volver a ella.
      setBorrador(jerarquias);
      const { generalizacion: _quitada, ...sinElla } = politica;
      void _quitada;
      onCambio(sinElla);
    }
  }

  function cambiarEscalera(
    columna: string,
    jerarquia: JerarquiaDeLaPolitica,
  ): void {
    const nuevas = { ...jerarquias, [columna]: jerarquia };
    setBorrador(nuevas);
    if (optima)
      onCambio({ ...politica, generalizacion: generalizacionCon(nuevas, l) });
  }

  function cambiarL(valor: number | null): void {
    setL(valor);
    if (optima)
      onCambio({
        ...politica,
        generalizacion: generalizacionCon(jerarquias, valor),
      });
  }

  // Lo que la pantalla compara AHORA. La comparación que llegue se enseña solo si firma igual: con
  // otro k, otra escalera u otra ℓ, sus cifras describirían otra cosa y se esconden.
  const pedida = { ...politica, generalizacion: generalizacionCon(jerarquias, l) };
  const firma = firmaDeComparacion(pedida, jerarquias);
  const vigente =
    taller.comparacion.fase !== "sin-hacer" && taller.comparacion.firma === firma
      ? taller.comparacion
      : null;

  function comparar(): void {
    compararGeneralizacion(pedida, jerarquias);
  }

  const comparacion = vigente?.fase === "hecha" ? vigente.comparacion : null;

  return (
    <section
      className="border-borde mt-4 border-t pt-4"
      aria-labelledby={`${idDeL}-titulo`}
    >
      <h3
        id={`${idDeL}-titulo`}
        className="text-tinta text-[0.9375rem] font-semibold"
      >
        {t(G.titulo)}
      </h3>
      <p className="text-tinta-suave mt-1 text-[0.875rem] leading-relaxed text-pretty">
        <Rico texto={G.explicacion} />
      </p>

      <fieldset className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <legend className="sr-only">{t(G.algoritmo.leyenda)}</legend>
        {(["mondrian", "optima"] as const).map((a) => (
          <label
            key={a}
            className="text-tinta flex items-center gap-2 text-[0.875rem]"
          >
            <input
              type="radio"
              name={`${idDeL}-algoritmo`}
              className="accent-acento size-4"
              checked={a === "optima" ? optima : !optima}
              onChange={() => elegir(a)}
            />
            {t(G.algoritmo[a])}
          </label>
        ))}
      </fieldset>

      <div className="mt-4">
        <p className="text-tinta text-[0.875rem] font-medium">
          {t(G.escaleras.titulo)}
        </p>
        <p className="text-tinta-tenue mt-0.5 text-[0.8125rem] leading-relaxed">
          {t(G.escaleras.nota)}
        </p>
        <ul className="mt-2 space-y-2">
          {reparto.map((c) => {
            const clave = claveDeEscalera(jerarquias[c.nombre]);
            return (
              <li
                key={c.nombre}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <code className="text-tinta min-w-[8rem] font-mono text-[0.8125rem] break-words">
                  {c.nombre}
                </code>
                <select
                  className="rounded-1 border-borde-control bg-superficie text-tinta w-full max-w-[22rem] border px-2 py-1.5 text-[0.875rem]"
                  aria-label={t(G.escaleras.aria, { columna: c.nombre })}
                  value={clave ?? "propia"}
                  onChange={(e) => {
                    const elegida = e.target.value as
                      ClaveDeEscalera | "propia";
                    if (elegida !== "propia")
                      cambiarEscalera(c.nombre, ESCALERAS[elegida]);
                  }}
                >
                  {clave === null ? (
                    <option value="propia">
                      {t(G.escaleras.opciones.propia)}
                    </option>
                  ) : null}
                  {CLAVES.map((k) => (
                    <option key={k} value={k}>
                      {t(G.escaleras.opciones[k])}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </div>

      {sensibles.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor={`${idDeL}-l`} className="text-tinta text-[0.875rem]">
            {t(G.diversidad.etiqueta, {
              columnas: sensibles.map((c) => c.nombre).join(" · "),
            })}
          </label>
          <input
            id={`${idDeL}-l`}
            type="number"
            min={2}
            max={100}
            step={1}
            value={l ?? ""}
            className="rounded-1 border-borde-control bg-superficie text-tinta w-20 border px-2 py-1.5 text-[0.875rem]"
            onChange={(e) =>
              cambiarL(
                e.target.value === ""
                  ? null
                  : Math.max(2, Number(e.target.value) || 2),
              )
            }
          />
          <p className="text-tinta-tenue w-full text-[0.8125rem] leading-relaxed">
            {t(G.diversidad.nota)}
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <Boton
          variante="discreto"
          type="button"
          disabled={
            taller.comparacion.fase === "comparando" ||
            politica.kObjetivo === null
          }
          onClick={comparar}
        >
          {t(
            taller.comparacion.fase === "comparando"
              ? G.comparando
              : G.comparar,
          )}
        </Boton>
      </div>

      {vigente?.fase === "fallo" ? (
        <p role="alert" className="text-alerta mt-3 text-[0.875rem]">
          {t(G.fallo)}
        </p>
      ) : null}

      {comparacion ? (
        <TablaComparada comparacion={comparacion} idioma={idioma} />
      ) : null}
    </section>
  );
}

function TablaComparada({
  comparacion,
  idioma,
}: {
  comparacion: NonNullable<
    Extract<
      ReturnType<typeof useTaller>["comparacion"],
      { fase: "hecha" }
    >["comparacion"]
  >;
  idioma: Idioma;
}) {
  const { t } = useT();
  const lados = [comparacion.mondrian, comparacion.optima] as const;
  const fila = (
    titulo: string,
    celda: (lado: LadoDeLaComparacion) => React.ReactNode,
  ) => (
    <tr className="border-borde border-b">
      <th
        scope="row"
        className="text-tinta-suave py-2 pr-3 text-left font-normal"
      >
        {titulo}
      </th>
      {lados.map((lado, i) => (
        <td key={i} className="text-tinta py-2 pr-3 tabular-nums">
          {lado.disponible
            ? celda(lado)
            : i === 1
              ? t(G.tabla.noDisponible)
              : "—"}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="mt-4" aria-live="polite">
      <p className="text-tinta text-[0.875rem] font-medium">
        {t(G.tabla.titulo)}
      </p>
      <p className="text-tinta-tenue mt-0.5 text-[0.8125rem] leading-relaxed">
        {t(G.tabla.alcance, { columnas: comparacion.dimensiones.join(" · ") })}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-[0.875rem]">
          <thead>
            <tr className="border-borde border-b">
              <th scope="col" className="etiqueta py-2 pr-3 text-left">
                {t(G.tabla.encabezados.medida)}
              </th>
              <th scope="col" className="etiqueta py-2 pr-3 text-left">
                {t(G.tabla.encabezados.mondrian)}
              </th>
              <th scope="col" className="etiqueta py-2 pr-3 text-left">
                {t(G.tabla.encabezados.optima)}
              </th>
            </tr>
          </thead>
          <tbody>
            {fila(
              t(G.tabla.filas.cumple, {
                k: numero(comparacion.kObjetivo, idioma),
              }),
              (lado) => (
                <Veredicto ok={lado.alcanzado} />
              ),
            )}
            {fila(t(G.tabla.filas.k), (lado) =>
              numero(lado.kAlcanzado, idioma),
            )}
            {comparacion.lObjetivo !== null
              ? fila(
                  t(G.tabla.filas.l, {
                    l: numero(comparacion.lObjetivo, idioma),
                  }),
                  (lado) =>
                    lado.lAlcanzado === null
                      ? "—"
                      : numero(lado.lAlcanzado, idioma),
                )
              : null}
            {fila(t(G.tabla.filas.clases), (lado) =>
              numero(lado.clases, idioma),
            )}
            {fila(t(G.tabla.filas.unicos), (lado) =>
              numero(lado.unicos, idioma),
            )}
            {fila(t(G.tabla.filas.riesgo), (lado) =>
              unoEn(lado.riesgoMaximo, idioma),
            )}
            {fila(t(G.tabla.filas.bits), (lado) =>
              t(G.tabla.deBits, {
                despues: numero(Math.round(lado.bitsDespues * 10) / 10, idioma),
                antes: numero(Math.round(lado.bitsAntes * 10) / 10, idioma),
              }),
            )}
            {comparacion.dimensiones.map((nombre, j) => (
              <tr key={nombre} className="border-borde border-b">
                <th
                  scope="row"
                  className="text-tinta-suave py-2 pr-3 text-left font-normal"
                >
                  {t(G.tabla.columna, { columna: nombre })}
                </th>
                {lados.map((lado, i) => (
                  <td key={i} className="text-tinta py-2 pr-3">
                    {lado.disponible ? (
                      <>
                        {nivelEnPalabras(
                          lado.columnas[j]?.nivel ?? null,
                          idioma,
                        )}
                        <span className="text-tinta-tenue block text-[0.75rem]">
                          {t(G.tabla.distintos, {
                            n: numero(lado.columnas[j]?.distintos ?? 0, idioma),
                          })}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {fila(t(G.tabla.filas.nodos), (lado) =>
              lado.nodosRevisados === null
                ? "—"
                : t(G.tabla.deCuantas, {
                    n: numero(lado.nodosRevisados, idioma),
                    total: numero(lado.nodosEnLaReticula ?? 0, idioma),
                  }),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
