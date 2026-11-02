"use client";

// P7 — el balance: lo que cambió y lo que sigue igual.
//
// **El orden de este componente ES la regla del producto.** Las salvedades se pintan ANTES que la
// cifra de reducción, y la cifra solo recibe el tratamiento de titular cuando nada la descalifica.
// No hay que recordarlo al maquetar: el motor entrega `salvedades` ya ordenada y `esTitular` ya
// decidido (`src/engine/balance.ts`), y aquí solo se respeta.
//
// «Riesgo reducido 87 %» encima de «la cédula sigue intacta» son dos verdades cuya suma dice algo
// falso. `tests/unit/balance-en-pantalla.test.tsx` compara las posiciones en el DOM, igual que el
// test del reporte compara las posiciones en el documento: es un test de composición, no de cifra.

import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import type { BalanceDelTratamiento, Salvedad } from "@/engine/balance";
import { numero, porcentaje } from "@/lib/formato";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";

const B = TRANSFORMAR.balance;

/**
 * El texto de una salvedad. Las columnas que nombra son del usuario, así que se pintan aparte (en
 * su `<span>`) y nunca dentro de un texto del catálogo: un nombre con `**` o con comillas
 * invertidas no puede volverse énfasis.
 */
function TextoDeSalvedad({ salvedad }: { salvedad: Salvedad }) {
  const { idioma } = useT();
  switch (salvedad.tipo) {
    case "identificadores-sin-tratar":
      return (
        <>
          <Rico
            texto={
              salvedad.columnas.length === 1
                ? B.sinTratar.uno
                : B.sinTratar.varias
            }
            datos={{ n: salvedad.columnas.length }}
          />{" "}
          <span className="font-mono">{salvedad.columnas.join(" · ")}</span>
          <Rico texto={B.sinTratar.cierre} />
        </>
      );
    case "ruido-no-aplicado":
      return (
        <>
          <Rico
            texto={B.ruidoNoAplicado}
            datos={{
              n: salvedad.columnas.length,
              maximo: numero(salvedad.maximo, idioma),
            }}
          />{" "}
          <span className="font-mono">{salvedad.columnas.join(" · ")}</span>.
        </>
      );
    case "reticula-excede-tope":
      return (
        <>
          <Rico
            texto={B.reticulaExcedeTope}
            datos={{
              n: salvedad.columnas.length,
              nodos: numero(salvedad.nodos, idioma),
              tope: numero(salvedad.tope, idioma),
            }}
          />{" "}
          <span className="font-mono">{salvedad.columnas.join(" · ")}</span>.
        </>
      );
    case "reparto-sin-k":
      return (
        <>
          <Rico
            texto={
              salvedad.columnas.length === 1
                ? B.repartoSinK.uno
                : B.repartoSinK.varias
            }
            datos={{ n: salvedad.columnas.length }}
          />{" "}
          <span className="font-mono">{salvedad.columnas.join(" · ")}</span>.
        </>
      );
    case "unicos-restantes":
      return (
        <Rico
          texto={
            salvedad.cuantos === 1
              ? B.unicosRestantes.uno
              : B.unicosRestantes.varios
          }
          datos={{
            cuantos: salvedad.cuantos,
            proporcion: porcentaje(salvedad.proporcion, idioma),
          }}
        />
      );
    case "k-no-alcanzado":
      return (
        <Rico
          texto={B.kNoAlcanzado}
          datos={{
            kObjetivo: salvedad.kObjetivo,
            kAlcanzado: salvedad.kAlcanzado,
          }}
        />
      );
    case "k-del-reparto-no-es-el-del-archivo":
      return (
        <Rico
          texto={B.kDelReparto}
          datos={{
            kDelReparto: salvedad.kDelReparto,
            kDelArchivo: salvedad.kDelArchivo,
          }}
        />
      );
    case "clases-homogeneas":
      return (
        <>
          <Rico texto={B.homogeneas.antes} datos={{ filas: salvedad.filas }} />{" "}
          <span className="font-mono">{salvedad.atributo}</span>
          <Rico texto={B.homogeneas.despues} />
        </>
      );
    case "colisiones-de-seudonimo":
      return (
        <>
          <Rico texto={B.colisiones.antes} />{" "}
          <span className="font-mono">{salvedad.columna}</span>
          <Rico
            texto={
              salvedad.cuantas === 1 ? B.colisiones.uno : B.colisiones.varias
            }
            datos={{ cuantas: salvedad.cuantas }}
          />
        </>
      );
  }
}

export function BalanceEnPantalla({
  balance,
}: {
  balance: BalanceDelTratamiento;
}) {
  const { t, idioma } = useT();
  const { antes, despues, reduccion, salvedades, esTitular } = balance;

  return (
    <Panel
      etiqueta={t(B.panel.etiqueta)}
      titulo={t(B.panel.titulo)}
      nota={<Rico texto={B.panel.nota} />}
    >
      {/* PRIMERO las salvedades. Siempre. */}
      {salvedades.length > 0 ? (
        <ul data-testid="salvedades" className="space-y-2">
          {salvedades.map((salvedad, i) => (
            <li
              key={`${salvedad.tipo}-${i}`}
              className={`rounded-2 border-l-[3px] px-4 py-3 text-[0.875rem] leading-relaxed ${
                salvedad.gravedad === "descalifica"
                  ? "border-alerta bg-alerta-tenue text-tinta"
                  : "border-aviso bg-aviso-tenue text-tinta"
              }`}
            >
              <TextoDeSalvedad salvedad={salvedad} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tinta-suave text-[0.875rem] leading-relaxed">
          <Rico texto={B.sinSalvedades} />
        </p>
      )}

      {/* DESPUÉS la cifra, y solo de titular si nada la descalifica. */}
      <div className="mt-5">
        {reduccion === null ? (
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            <Rico texto={B.sinReduccion} />
          </p>
        ) : esTitular ? (
          <>
            <p className="font-display text-acento text-[clamp(2.5rem,8vw,3.5rem)] leading-none font-semibold tabular-nums">
              −
              <span data-testid="reduccion">
                {porcentaje(reduccion, idioma)}
              </span>
            </p>
            <p className="text-tinta-suave mt-2 text-[0.9375rem] leading-relaxed">
              <Rico
                texto={B.titular}
                datos={{
                  qis: antes.qis.length,
                  antes: antes.unicos,
                  despues: despues.unicos,
                  filas: antes.filas,
                }}
              />
            </p>
          </>
        ) : (
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            <Rico
              texto={B.noTitular.antes}
              datos={{
                antes: porcentaje(antes.proporcionUnicos, idioma),
                despues: porcentaje(despues.proporcionUnicos, idioma),
              }}
            />{" "}
            <span data-testid="reduccion" className="text-tinta font-medium">
              {porcentaje(reduccion, idioma)}
            </span>
            .{" "}
            <strong className="text-alerta font-medium">
              {t(B.noTitular.aviso)}
            </strong>{" "}
            <Rico texto={B.noTitular.despues} />
          </p>
        )}
      </div>

      <dl className="border-borde mt-5 grid gap-4 border-t pt-4 sm:grid-cols-4">
        <Cifra
          titulo={t(B.cifras.unicosAntes)}
          valor={numero(antes.unicos, idioma)}
        />
        <Cifra
          titulo={t(B.cifras.unicosDespues)}
          valor={numero(despues.unicos, idioma)}
          alerta={despues.unicos > 0}
        />
        <Cifra
          titulo={t(B.cifras.kAntes)}
          valor={numero(antes.kMinimo, idioma)}
        />
        <Cifra
          titulo={t(B.cifras.kDespues)}
          valor={numero(despues.kMinimo, idioma)}
        />
      </dl>
    </Panel>
  );
}

function Cifra({
  titulo,
  valor,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div>
      {/* Dos líneas reservadas: «Grupo mínimo, después» envuelve y las otras tres no, y sin esto
          su número caía un renglón más abajo y la fila de cuatro cifras dejaba de leerse como una
          fila. Se vio en la captura de escritorio; en móvil, a dos columnas, no pasaba. */}
      <dt className="etiqueta flex min-h-[2.4em] items-start">{titulo}</dt>
      <dd
        className={`mt-1 text-[1.125rem] font-semibold tabular-nums ${
          alerta ? "text-alerta" : "text-tinta"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
