"use client";

// P4 — el editor de política: qué se le hace a cada columna.
//
// Es una tabla con un `<select>` nativo por fila, y esa decisión tiene dos motivos que no son de
// gusto:
//
//   1. **El teclado ya funciona.** Un combobox propio hay que enseñarle a abrirse con Alt+↓, a
//      recorrer con las flechas, a cerrarse con Escape, a anunciarse con `aria-activedescendant` y
//      a funcionar en el lector de pantalla del móvil. Un `<select>` trae todo eso hecho y probado
//      por el navegador, y en un teléfono abre la rueda del sistema, que es lo que la gente espera.
//   2. **`contain: paint` recorta lo que se pinta dentro.** El S1 lo puso en `.tabla-desplazable`
//      para arreglar el shrink-to-fit del móvil, y cualquier menú propio dentro de esa caja
//      quedaría cortado por la mitad. El desplegable nativo se pinta en la capa superior del
//      navegador, fuera del flujo — no lo recorta nada. (Y por si acaso, este editor tiene su
//      propio contenedor, sin contención.)
//
// La política **no se guarda en ningún lado**: vive en el estado de esta pantalla y se exporta como
// archivo. Un `localStorage` «porque es cómodo» guardaría los nombres de columna del usuario, que
// son datos suyos, y el gate de privacidad lo caza con razón.

import { useId, useRef, useState } from "react";

import { Boton } from "@/components/boton";
import { Panel } from "@/components/panel";
import type { HallazgoDeColumna } from "@/engine/clasificador";
import {
  exportarPolitica,
  importarPolitica,
  tecnicaDe,
  type Politica,
  type Tecnica,
} from "@/engine/politica";
import {
  construirPolitica,
  POLITICAS_DE_FABRICA,
  resumenDeCobertura,
  type PoliticaDeFabrica,
} from "@/engine/politicas-de-fabrica";
import { numero } from "@/lib/formato";

/** Las opciones del desplegable, en el orden en que se ofrecen: de conservar a suprimir. */
const OPCIONES: readonly { valor: string; texto: string; tecnica: Tecnica }[] =
  [
    {
      valor: "conservar",
      texto: "Dejar como está",
      tecnica: { tipo: "conservar" },
    },
    {
      valor: "enmascarar",
      texto: "Enmascarar (103***89)",
      tecnica: { tipo: "enmascarar" },
    },
    {
      valor: "seudonimizar",
      texto: "Seudónimo irreversible",
      tecnica: { tipo: "seudonimizar", longitud: 16 },
    },
    {
      valor: "seudonimizar-cedula",
      texto: "Seudónimo con forma de cédula",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
    },
    {
      valor: "seudonimizar-nit",
      texto: "Seudónimo con forma de NIT",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "nit" },
    },
    {
      valor: "generalizar-anio",
      texto: "Fecha: dejar solo el año",
      tecnica: { tipo: "generalizar-fecha", precision: "anio" },
    },
    {
      valor: "generalizar-mes",
      texto: "Fecha: dejar año y mes",
      tecnica: { tipo: "generalizar-fecha", precision: "mes" },
    },
    {
      valor: "generalizar-rango-10",
      texto: "Número: agrupar de 10 en 10",
      tecnica: { tipo: "generalizar-rango", amplitud: 10 },
    },
    {
      valor: "generalizar-prefijo-2",
      texto: "Dejar los 2 primeros caracteres",
      tecnica: { tipo: "generalizar-prefijo", caracteres: 2 },
    },
    {
      valor: "generalizar-automatico",
      texto: "Generalizar hasta alcanzar el k",
      tecnica: { tipo: "generalizar-automatico" },
    },
    {
      valor: "suprimir",
      texto: "Quitar la columna",
      tecnica: { tipo: "suprimir" },
    },
  ];

/** De técnica a valor del desplegable. Los parámetros distinguen dos opciones del mismo tipo. */
function valorDe(tecnica: Tecnica): string {
  switch (tecnica.tipo) {
    case "seudonimizar-con-formato":
      return `seudonimizar-${tecnica.formato}`;
    case "generalizar-fecha":
      return tecnica.precision === "anio"
        ? "generalizar-anio"
        : "generalizar-mes";
    case "generalizar-rango":
      return "generalizar-rango-10";
    case "generalizar-prefijo":
      return "generalizar-prefijo-2";
    default:
      return tecnica.tipo;
  }
}

const ETIQUETA_DE_CATEGORIA: Record<string, string> = {
  "identificador-directo": "Identificador directo",
  "cuasi-identificador": "Cuasi-identificador",
  "dato-sensible": "Dato sensible",
  "no-personal": "No personal",
};

export function EditorDePolitica({
  columnas,
  politica,
  onCambio,
}: {
  columnas: readonly HallazgoDeColumna[];
  politica: Politica;
  onCambio: (politica: Politica) => void;
}) {
  const idDeK = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [errorAlImportar, setErrorAlImportar] = useState<string | null>(null);

  function cambiarColumna(nombre: string, valor: string): void {
    const opcion = OPCIONES.find((o) => o.valor === valor);
    if (!opcion) return;
    onCambio({
      ...politica,
      // Se marca `manual` en cuanto se toca una de fábrica: el reporte declara la procedencia, y
      // decir «Habeas Data» sobre algo que el usuario ya editó sería atribuirle a una guía oficial
      // una decisión que no es suya.
      origen: origenTrasEditar(politica.origen),
      reglas: [
        ...politica.reglas.filter((r) => r.columna !== nombre),
        { columna: nombre, tecnica: opcion.tecnica },
      ],
    });
  }

  function aplicarFabrica(fabrica: PoliticaDeFabrica): void {
    onCambio(
      construirPolitica(
        fabrica,
        columnas.map((c) => ({
          nombre: c.nombre,
          tipo: c.tipo,
          categoria: c.categoria,
        })),
      ),
    );
  }

  function exportar(): void {
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([exportarPolitica(politica)], {
        type: "application/json;charset=utf-8",
      }),
    );
    enlace.href = url;
    enlace.download = "velo-politica.json";
    enlace.click();
    URL.revokeObjectURL(url);
  }

  async function importar(archivo: File): Promise<void> {
    // `archivo.text()` sobre un JSON que el usuario eligió a mano no toca la frontera del ADR-005:
    // esto es la política, no el archivo de datos. Vive en el worker porque allá está la tabla, y
    // esto no es la tabla.
    const resultado = importarPolitica(await leerTexto(archivo));
    if (!resultado.ok) {
      setErrorAlImportar(resultado.detalle);
      return;
    }
    setErrorAlImportar(null);
    onCambio(resultado.politica);
  }

  const conMondrian = politica.reglas.some(
    (r) => r.tecnica.tipo === "generalizar-automatico",
  );

  return (
    <Panel
      etiqueta="Paso 1 · la política"
      titulo="Qué se le hace a cada columna"
      nota={
        <>
          La política no se guarda en ningún lado. Si la quieres para el mes que
          viene, <strong className="font-medium">expórtala como archivo</strong>{" "}
          — lleva los nombres de tus columnas, que son datos tuyos, y por eso no
          entra a la memoria de este navegador.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Solo el nombre. La cobertura («9 de 18») baja al aviso de origen, donde cabe decir de
            qué es ese 18 — puestas una al lado de la otra, dos coberturas con denominadores
            distintos se comparan solas y la comparación es falsa: la lista de HIPAA tiene 18
            identificadores enumerados y la de Habeas Data no es una lista de la misma clase. */}
        {POLITICAS_DE_FABRICA.map((fabrica) => (
          <Boton
            key={fabrica.id}
            type="button"
            variante="discreto"
            onClick={() => aplicarFabrica(fabrica)}
          >
            {fabrica.nombre}
          </Boton>
        ))}
        <Boton type="button" variante="discreto" onClick={exportar}>
          Exportar
        </Boton>
        <Boton
          type="button"
          variante="discreto"
          onClick={() => entrada.current?.click()}
        >
          Importar
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Importar una política desde un archivo"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            if (archivo) void importar(archivo);
            evento.target.value = "";
          }}
        />
      </div>

      {errorAlImportar ? (
        <p role="alert" className="text-alerta mt-3 text-[0.875rem]">
          No se pudo importar: {errorAlImportar}
        </p>
      ) : null}

      <AvisoDeOrigen origen={politica.origen} />

      {/* Contenedor propio, SIN `contain: paint`: el desplegable nativo se pinta fuera del flujo y
          la contención de `.tabla-desplazable` lo recortaría en móvil. */}
      {/* Dos columnas, no tres: en 412 px la tercera empujaba el desplegable fuera de la pantalla
          y quedaba cortado por el borde. La categoría baja bajo el nombre —donde se lee igual de
          bien— y así la tabla cabe sin desplazamiento horizontal en un teléfono. Encontrado en la
          pasada de capturas, no en un test: ningún axe ni ningún e2e ve un control recortado. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-[0.875rem]">
          <caption className="sr-only">
            Una fila por columna del archivo, con la técnica que se le aplica
          </caption>
          <thead>
            <tr className="border-borde border-b">
              <th scope="col" className="etiqueta py-2 pr-3 text-left">
                Columna
              </th>
              <th scope="col" className="etiqueta py-2 text-left">
                Qué se le hace
              </th>
            </tr>
          </thead>
          <tbody>
            {columnas.map((columna) => (
              <tr key={columna.nombre} className="border-borde border-b">
                <th
                  scope="row"
                  className="text-tinta py-2 pr-3 text-left font-mono text-[0.8125rem] font-normal break-words"
                >
                  {columna.nombre}
                  <span className="text-tinta-tenue block font-sans text-[0.75rem]">
                    {ETIQUETA_DE_CATEGORIA[columna.categoria] ??
                      columna.categoria}
                  </span>
                </th>
                <td className="py-2">
                  <select
                    className="rounded-1 border-borde-control bg-superficie text-tinta w-full max-w-[18rem] border px-2 py-1.5 text-[0.875rem]"
                    value={valorDe(tecnicaDe(politica, columna.nombre))}
                    aria-label={`Técnica para la columna ${columna.nombre}`}
                    onChange={(evento) =>
                      cambiarColumna(columna.nombre, evento.target.value)
                    }
                  >
                    {OPCIONES.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.texto}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {conMondrian ? (
        <div className="border-borde mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
          <label htmlFor={idDeK} className="text-tinta text-[0.875rem]">
            Grupo mínimo (k) para las columnas que se generalizan solas
          </label>
          <input
            id={idDeK}
            type="number"
            min={2}
            max={1000}
            step={1}
            value={politica.kObjetivo ?? 5}
            className="rounded-1 border-borde-control bg-superficie text-tinta w-24 border px-2 py-1.5 text-[0.875rem]"
            onChange={(evento) =>
              onCambio({
                ...politica,
                kObjetivo: Math.max(2, Number(evento.target.value) || 2),
              })
            }
          />
          <p className="text-tinta-tenue w-full text-[0.8125rem] leading-relaxed">
            Con k = {numero(politica.kObjetivo ?? 5)}, Velo generaliza esas
            columnas hasta que nadie quede en un grupo de menos de{" "}
            {numero(politica.kObjetivo ?? 5)} registros. Cuanto más alto el k,
            menos preciso queda el dato. Si no se puede alcanzar sin borrar
            filas, Velo lo dice y no borra nada.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

/** El estado «aplicada-y-editada»: la procedencia deja de ser la de fábrica en cuanto se toca. */
function origenTrasEditar(origen: Politica["origen"]): Politica["origen"] {
  if (origen === "habeas-data") return "habeas-data-editada";
  if (origen === "hipaa") return "hipaa-editada";
  return origen;
}

function AvisoDeOrigen({ origen }: { origen: Politica["origen"] }) {
  const deFabrica = POLITICAS_DE_FABRICA.find((f) => origen.startsWith(f.id));
  if (!deFabrica) return null;
  const editada = origen.endsWith("-editada");
  const cobertura = resumenDeCobertura(deFabrica);

  return (
    <div
      className={`rounded-2 mt-4 border px-4 py-3 text-[0.875rem] leading-relaxed ${
        editada
          ? "border-aviso/35 bg-aviso-tenue text-tinta"
          : "border-borde bg-papel-hundido text-tinta-suave"
      }`}
    >
      <p>
        {editada ? (
          <>
            <strong className="font-medium">
              Ya no es {deFabrica.nombre}.
            </strong>{" "}
            Partiste de esa plantilla y la cambiaste, así que el reporte va a
            decir que la política es tuya. Es lo correcto: la guía oficial no
            respalda una decisión que no tomó.
          </>
        ) : (
          <>
            <strong className="font-medium">{deFabrica.nombre}</strong> ·{" "}
            {deFabrica.fuente}
          </>
        )}
      </p>
      <p className="text-tinta-tenue mt-2">{deFabrica.advertencia}</p>
      {/* «De los N identificadores que enumera la fuente» era FALSO para Habeas Data: la Ley 1581
          no enumera identificadores — esos puntos son el resumen que hace Velo. HIPAA sí enumera
          18, y una frase escrita para ese caso se volvía mentira en el otro. Encontrado leyendo la
          captura, que es el único sitio donde las dos se ven con el mismo texto encima. */}
      <p className="text-tinta-tenue mt-2">
        Velo resume esa fuente en {numero(cobertura.total)} puntos:{" "}
        <strong className="font-medium">{numero(cobertura.automaticos)}</strong>{" "}
        los reconoce por el contenido de la columna,{" "}
        <strong className="font-medium">{numero(cobertura.porNombre)}</strong>{" "}
        solo por su nombre, y{" "}
        <strong className="font-medium">{numero(cobertura.manuales)}</strong> no
        los puede reconocer ningún programa que solo vea la tabla — esos los
        tienes que marcar tú, abajo.
      </p>
    </div>
  );
}

/**
 * Lee el JSON de la política. Es una función aparte y con nombre para que se vea que lo que se
 * abre aquí es la POLÍTICA y nunca el archivo de datos — ese vive en el worker y sale como Blob
 * sin que la página lo mire (ADR-005).
 */
function leerTexto(archivo: File): Promise<string> {
  return archivo.text();
}
