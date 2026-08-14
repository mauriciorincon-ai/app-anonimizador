"use client";

// P6 — la vista previa: antes y después, columna por columna.
//
// Es la única pantalla cuyo trabajo es responder «¿qué va a recibir la otra persona?», y de ahí sale
// su regla de exposición, decidida en el worker (`MuestraDeTransformacion`):
//
//   · **El lado «antes» va SIEMPRE enmascarado.** Es el dato crudo del usuario, y la regla del S1
//     —nunca más de la mitad a la vista— no se relaja porque ahora estemos transformando.
//   · **El lado «después» va completo solo si cambió.** Un seudónimo o un intervalo no son el dato
//     de nadie; enmascararlos volvería inútil la pantalla. Si la técnica fue «dejar como está», el
//     después ES el antes, y entonces se enmascara igual y se dice que está enmascarado.
//   · **Una columna sensible que no cambió no se enseña.** Su «después» es su «antes», y sacar un
//     dato del artículo 5 a una pantalla que no lo necesita no tiene defensa.

import { Panel } from "@/components/panel";
import { numero } from "@/lib/formato";
import { nombreDeTecnica } from "@/lib/tecnicas-en-palabras";
import type { MuestraDeTransformacion } from "@/workers/contrato";

export function VistaPrevia({
  muestras,
  filas,
}: {
  muestras: readonly MuestraDeTransformacion[];
  filas: number;
}) {
  const tocadas = muestras.filter(
    (m) => m.suprimida || (!m.despuesEnmascarado && !m.omitida),
  );

  return (
    <Panel
      etiqueta="Paso 3 · la vista previa"
      titulo="Qué va a recibir la otra persona"
      nota={
        <>
          {numero(tocadas.length)} de {numero(muestras.length)} columnas
          cambian. Los valores de la izquierda van enmascarados porque siguen
          siendo tus datos; los de la derecha van completos cuando ya no lo son.
        </>
      }
    >
      {/* Una caja que se desplaza y no tiene dentro nada enfocable deja fuera a quien navega con
          teclado: no hay forma de llegar a ella para moverla. `tabIndex` y un nombre la vuelven
          una región alcanzable — el mismo patrón que la tabla del diagnóstico del S1. (La del
          editor no lo necesita: sus `<select>` ya son enfocables.) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Comparación antes y después, columna por columna"
        className="overflow-x-auto"
      >
        <table className="w-full min-w-[36rem] border-collapse text-[0.875rem]">
          <caption className="sr-only">
            Muestra de {numero(Math.min(filas, 6))} filas repartidas por todo el
            archivo, antes y después del tratamiento
          </caption>
          <thead>
            <tr className="border-borde border-b">
              <th scope="col" className="etiqueta py-2 pr-3 text-left">
                Columna
              </th>
              <th scope="col" className="etiqueta py-2 pr-3 text-left">
                Antes
              </th>
              <th scope="col" className="etiqueta py-2 text-left">
                Después
              </th>
            </tr>
          </thead>
          <tbody>
            {muestras.map((muestra) => (
              <tr
                key={muestra.nombre}
                className="border-borde align-top border-b"
              >
                <th
                  scope="row"
                  className="text-tinta py-2 pr-3 text-left font-mono text-[0.8125rem] font-normal break-words"
                >
                  {muestra.nombre}
                  <span className="text-tinta-tenue block font-sans text-[0.75rem]">
                    {nombreDeTecnica(muestra.tecnica)}
                  </span>
                </th>
                <td className="py-2 pr-3">
                  <Valores
                    filas={muestra.filas.map((f) => f.antes)}
                    vacia={muestra.suprimida || muestra.omitida}
                  />
                </td>
                <td className="py-2">
                  {muestra.suprimida ? (
                    <p className="text-alerta text-[0.8125rem]">
                      la columna no va en el archivo
                    </p>
                  ) : muestra.omitida ? (
                    <p className="text-tinta-tenue text-[0.8125rem]">
                      dato sensible sin cambios: no se muestra
                    </p>
                  ) : (
                    <Valores
                      filas={muestra.filas.map((f) => f.despues)}
                      vacia={false}
                      destacado={!muestra.despuesEnmascarado}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Valores({
  filas,
  vacia,
  destacado = false,
}: {
  filas: readonly string[];
  vacia: boolean;
  destacado?: boolean;
}) {
  if (vacia || filas.length === 0) {
    return <p className="text-tinta-tenue text-[0.8125rem]">—</p>;
  }
  return (
    <ul
      className={`space-y-0.5 font-mono text-[0.8125rem] ${
        destacado ? "text-acento" : "text-tinta-suave"
      }`}
    >
      {filas.map((valor, i) => (
        <li key={i}>{valor === "" ? "(vacío)" : valor}</li>
      ))}
    </ul>
  );
}
