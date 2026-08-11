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
import type { BalanceDelTratamiento, Salvedad } from "@/engine/balance";
import { numero, porcentaje } from "@/lib/formato";

function textoDeSalvedad(salvedad: Salvedad): React.ReactNode {
  switch (salvedad.tipo) {
    case "identificadores-sin-tratar":
      return (
        <>
          <strong className="font-medium">
            La política deja intactas{" "}
            {salvedad.columnas.length === 1
              ? "una columna que señala"
              : `${numero(salvedad.columnas.length)} columnas que señalan`}
          </strong>{" "}
          a la persona sin ayuda de ninguna otra:{" "}
          <span className="font-mono">{salvedad.columnas.join(" · ")}</span>.
          Mientras estén en el archivo, ninguna cifra de aquí abajo describe
          datos tratados.
        </>
      );
    case "reparto-sin-k":
      return (
        <>
          <strong className="font-medium">
            {salvedad.columnas.length === 1
              ? "Una columna salió intacta"
              : `${numero(salvedad.columnas.length)} columnas salieron intactas`}
          </strong>
          : las marcaste para que Velo decidiera cuánto generalizarlas y la
          política no fijó un grupo mínimo (k), así que no había hasta dónde
          generalizar.{" "}
          <span className="font-mono">{salvedad.columnas.join(" · ")}</span>.
        </>
      );
    case "unicos-restantes":
      return (
        <>
          <strong className="font-medium">
            {numero(salvedad.cuantos)} registros
          </strong>{" "}
          ({porcentaje(salvedad.proporcion)}) siguen <strong>solos</strong> en
          su combinación de valores: nadie más en la tabla comparte la suya.
        </>
      );
    case "k-no-alcanzado":
      return (
        <>
          Pediste grupos de al menos{" "}
          <strong className="font-medium">{numero(salvedad.kObjetivo)}</strong>{" "}
          y el reparto llegó a{" "}
          <strong className="font-medium">{numero(salvedad.kAlcanzado)}</strong>
          . El archivo no cumple el k que declara.
        </>
      );
    case "k-del-reparto-no-es-el-del-archivo":
      return (
        <>
          El reparto alcanzó k={numero(salvedad.kDelReparto)} sobre las columnas
          que generaliza, pero el archivo completo tiene grupos de{" "}
          <strong className="font-medium">
            {numero(salvedad.kDelArchivo)}
          </strong>
          : hay cuasi-identificadores fuera del reparto que los parten.{" "}
          <strong className="font-medium">
            El número que vale es el del archivo.
          </strong>
        </>
      );
    case "clases-homogeneas":
      return (
        <>
          <strong className="font-medium">{numero(salvedad.filas)}</strong>{" "}
          registros están en grupos donde todos comparten el mismo valor de{" "}
          <span className="font-mono">{salvedad.atributo}</span>. Dar con el
          grupo basta para saber el dato, aunque no se sepa cuál de las filas es
          la persona.
        </>
      );
    case "colisiones-de-seudonimo":
      return (
        <>
          En <span className="font-mono">{salvedad.columna}</span>,{" "}
          <strong className="font-medium">{numero(salvedad.cuantas)}</strong>{" "}
          {salvedad.cuantas === 1
            ? "par de valores distintos recibió"
            : "pares de valores distintos recibieron"}{" "}
          el mismo seudónimo. Conservar el formato reduce el espacio disponible
          y algunos chocan: dos entidades distintas se ven como una.
        </>
      );
  }
}

export function BalanceEnPantalla({
  balance,
}: {
  balance: BalanceDelTratamiento;
}) {
  const { antes, despues, reduccion, salvedades, esTitular } = balance;

  return (
    <Panel
      etiqueta="Paso 4 · el balance"
      titulo="Qué cambió, y qué sigue igual"
      nota={
        <>
          Las dos medidas salen del mismo cálculo, corrido sobre el archivo que
          entró y sobre el que vas a descargar. Se refieren solo al cruce de
          cuasi-identificadores: una columna que Velo no supo leer no entra a
          ninguna de las dos cuentas.
        </>
      }
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
              {textoDeSalvedad(salvedad)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tinta-suave text-[0.875rem] leading-relaxed">
          Velo no encontró salvedades que matizar sobre las columnas que revisó.
          Eso no vuelve anónimo el archivo: quiere decir que las comprobaciones
          que Velo sabe hacer salieron limpias.
        </p>
      )}

      {/* DESPUÉS la cifra, y solo de titular si nada la descalifica. */}
      <div className="mt-5">
        {reduccion === null ? (
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            Antes del tratamiento no había ningún registro único en las columnas
            cruzadas, así que no hay reducción que medir. La cifra que importa
            es la de abajo: cuántos hay <strong>ahora</strong>.
          </p>
        ) : esTitular ? (
          <>
            <p className="font-display text-acento text-[clamp(2.5rem,8vw,3.5rem)] leading-none font-semibold tabular-nums">
              −<span data-testid="reduccion">{porcentaje(reduccion)}</span>
            </p>
            <p className="text-tinta-suave mt-2 text-[0.9375rem] leading-relaxed">
              de registros únicos respecto del archivo original, sobre las{" "}
              {numero(antes.qis.length)} columnas cruzadas. Pasó de{" "}
              {numero(antes.unicos)} a {numero(despues.unicos)} de{" "}
              {numero(antes.filas)} registros.
            </p>
          </>
        ) : (
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            La proporción de registros únicos bajó de{" "}
            {porcentaje(antes.proporcionUnicos)} a{" "}
            {porcentaje(despues.proporcionUnicos)} — una reducción del{" "}
            <span data-testid="reduccion" className="text-tinta font-medium">
              {porcentaje(reduccion)}
            </span>
            .{" "}
            <strong className="text-alerta font-medium">
              Esa cifra no describe un archivo tratado
            </strong>{" "}
            mientras siga en pie lo de arriba: se refiere solo al cruce de
            cuasi-identificadores, y no cuenta nada de lo que quedó sin tocar.
          </p>
        )}
      </div>

      <dl className="border-borde mt-5 grid gap-4 border-t pt-4 sm:grid-cols-4">
        <Cifra titulo="Únicos, antes" valor={numero(antes.unicos)} />
        <Cifra
          titulo="Únicos, después"
          valor={numero(despues.unicos)}
          alerta={despues.unicos > 0}
        />
        <Cifra titulo="Grupo mínimo, antes" valor={numero(antes.kMinimo)} />
        <Cifra titulo="Grupo mínimo, después" valor={numero(despues.kMinimo)} />
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
