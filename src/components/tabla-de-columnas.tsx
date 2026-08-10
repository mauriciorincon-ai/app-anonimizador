// Qué hay en cada columna, y POR QUÉ Velo lo cree.
//
// El "por qué" no es una nota de pie opcional: es la mitad del producto. Una herramienta que
// afirma "esto es una cédula" sin decir en qué se basa pide un acto de fe, y el argumento entero
// de Velo es que no hace falta ninguno. Por eso cada fila enseña la evidencia con su número
// (cuántos valores de la muestra cumplen) y su fuente oficial.
//
// La tabla es una tabla de verdad —`<table>`, `scope="col"`, encabezados reales— y no un grid de
// `<div>`: es lo que permite recorrerla con un lector de pantalla y entender qué celda pertenece a
// qué columna. En móvil se desplaza en horizontal dentro de una región enfocable con teclado.

import { InsigniaDeCategoria, InsigniaDeCerteza } from "@/components/insignias";
import type { Evidencia, HallazgoDeColumna } from "@/engine/clasificador";
import { numero, porcentaje } from "@/lib/formato";

function textoDeEvidencia(evidencia: Evidencia): {
  principal: string;
  fuente?: string;
} {
  if (evidencia.origen === "validador") {
    const proporcion =
      evidencia.muestreados > 0
        ? evidencia.aciertos / evidencia.muestreados
        : 0;
    return {
      principal: `${porcentaje(proporcion)} de los ${numero(
        evidencia.muestreados,
      )} valores revisados cumplen.`,
      fuente: evidencia.fuente,
    };
  }
  return { principal: evidencia.nota };
}

export function TablaDeColumnas({
  columnas,
}: {
  columnas: readonly HallazgoDeColumna[];
}) {
  return (
    <>
      <p className="text-tinta-tenue mb-3 text-[0.8125rem] sm:hidden">
        La tabla se desplaza en horizontal.
      </p>
      <div
        tabIndex={0}
        role="region"
        aria-label="Detalle de las columnas del archivo"
        className="tabla-desplazable -mx-5 overflow-x-auto px-5"
      >
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <thead>
            <tr className="border-borde border-b">
              <th
                scope="col"
                className="etiqueta pb-2 pr-4 whitespace-nowrap align-bottom"
              >
                Columna
              </th>
              <th
                scope="col"
                className="etiqueta pb-2 pr-4 whitespace-nowrap align-bottom"
              >
                Qué encontramos
              </th>
              <th
                scope="col"
                className="etiqueta pb-2 pr-4 whitespace-nowrap align-bottom"
              >
                Categoría
              </th>
              <th
                scope="col"
                className="etiqueta pb-2 whitespace-nowrap align-bottom"
              >
                Muestra
              </th>
            </tr>
          </thead>
          <tbody>
            {columnas.map((columna) => (
              <tr
                key={columna.nombre}
                className="border-borde border-b last:border-b-0 align-top"
              >
                <th
                  scope="row"
                  className="text-tinta max-w-[14rem] py-3 pr-4 font-mono text-[0.8125rem] font-normal break-words"
                >
                  {columna.nombre}
                  <span className="cifra text-tinta-tenue mt-1 block font-sans text-[0.75rem]">
                    {numero(columna.cardinalidad)}{" "}
                    {columna.cardinalidad === 1
                      ? "valor distinto"
                      : "valores distintos"}
                    {columna.filasNoVacias < columna.filas ? (
                      <>
                        {" · "}
                        {porcentaje(columna.filasNoVacias / columna.filas)} con
                        dato
                      </>
                    ) : null}
                  </span>
                </th>

                <td className="max-w-[22rem] py-3 pr-4">
                  <span className="text-tinta text-[0.875rem] font-medium">
                    {columna.etiqueta}
                  </span>
                  <span className="mt-1 block">
                    <InsigniaDeCerteza certeza={columna.certeza} />
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {columna.evidencia.map((evidencia, i) => {
                      const { principal, fuente } = textoDeEvidencia(evidencia);
                      return (
                        <li
                          key={i}
                          className="text-tinta-tenue text-[0.75rem] leading-snug"
                        >
                          {principal}
                          {/* Sin `opacity`: bajarle la opacidad a un texto para "atenuarlo"
                              mezcla su color con el fondo y tira el contraste por debajo del
                              mínimo (medido con axe: 3,58:1 en claro, 3,98:1 en oscuro). La
                              jerarquía la hacen la familia mono y el tamaño, que no cuestan
                              contraste. */}
                          {fuente ? (
                            <span className="mt-0.5 block font-mono">
                              {fuente}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </td>

                <td className="py-3 pr-4">
                  <InsigniaDeCategoria categoria={columna.categoria} />
                </td>

                <td className="py-3">
                  <Muestra muestra={columna.muestra} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Muestra({ muestra }: { muestra: HallazgoDeColumna["muestra"] }) {
  if (muestra === null) {
    return (
      <span className="text-tinta-tenue text-[0.8125rem]">columna vacía</span>
    );
  }
  if (muestra.omitida) {
    return (
      <span
        className="text-tinta-tenue text-[0.75rem] leading-snug"
        title="Los valores de una columna sensible son pocos y muy repetidos ('Indígena', 'J45.9'): ninguna máscara los protege de verdad."
      >
        sin muestra
        <span className="sr-only">
          {" "}
          — es una columna de datos sensibles y enmascararla no la protegería.
        </span>
      </span>
    );
  }
  return (
    <span className="text-tinta-suave font-mono text-[0.8125rem]">
      {muestra.texto}
    </span>
  );
}
