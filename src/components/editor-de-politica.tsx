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
  esReversible,
  exportarPolitica,
  importarPolitica,
  requiereBoveda,
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

/**
 * Las opciones del desplegable, en el orden en que se ofrecen: de conservar a suprimir.
 *
 * **Los textos son cortos por una razón encontrada en la pasada de capturas del S3, no por gusto.**
 * En 412 px la celda deja unos 19 caracteres visibles en un `<select>` cerrado, y las tres opciones
 * de seudónimo empezaban por la misma palabra: «Seudónimo con forma de cédula» y «Seudónimo con
 * forma de NIT» se truncaban las dos en «Seudónimo con forma…» y quedaban **indistinguibles**. El
 * usuario no podía saber cuál había elegido sin volver a abrir el menú. Ningún test lo ve: el DOM
 * tiene el texto completo, y axe no mide anchos.
 */
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
      // Ya no dice «irreversible»: desde el S3 la vuelta es una casilla aparte, y el nombre de la
      // técnica no puede prometer lo contrario de lo que la fila de al lado permite (§4).
      valor: "seudonimizar",
      texto: "Seudónimo (hex)",
      tecnica: { tipo: "seudonimizar", longitud: 16 },
    },
    {
      valor: "seudonimizar-cedula",
      texto: "Seudónimo de cédula",
      tecnica: { tipo: "seudonimizar-con-formato", formato: "cedula" },
    },
    {
      valor: "seudonimizar-nit",
      texto: "Seudónimo de NIT",
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

/** El k que se fija solo al pedir generalización automática. 5 es el mínimo de las dos de fábrica. */
const K_POR_DEFECTO = 5;

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
      // Elegir «generalizar hasta el k» FIJA el k en la política, no solo en la casilla.
      //
      // Antes la casilla pintaba `kObjetivo ?? 5` y la política guardaba `null`: la pantalla
      // prometía en futuro «Velo generaliza esas columnas hasta que nadie quede en un grupo de
      // menos de 5» y el motor, que solo reparte con un k declarado, las dejaba INTACTAS sin que
      // nada lo dijera. Hallazgo A1 de la auditoría del S2. Lo que se ve tiene que ser lo que hay.
      kObjetivo:
        opcion.tecnica.tipo === "generalizar-automatico" &&
        politica.kObjetivo === null
          ? K_POR_DEFECTO
          : politica.kObjetivo,
      reglas: [
        ...politica.reglas.filter((r) => r.columna !== nombre),
        { columna: nombre, tecnica: opcion.tecnica },
      ],
    });
  }

  /**
   * El eje reversible, columna por columna. Se guarda `true` o se quita: `reversible: false` y el
   * campo ausente son la misma política, y `normalizarPolitica` los unifica para que no tengan dos
   * hashes distintos.
   */
  function cambiarReversible(nombre: string, reversible: boolean): void {
    const tecnica = tecnicaDe(politica, nombre);
    if (
      tecnica.tipo !== "seudonimizar" &&
      tecnica.tipo !== "seudonimizar-con-formato"
    ) {
      return;
    }
    onCambio({
      ...politica,
      origen: origenTrasEditar(politica.origen),
      reglas: [
        ...politica.reglas.filter((r) => r.columna !== nombre),
        {
          columna: nombre,
          tecnica: { ...tecnica, reversible: reversible || undefined },
        },
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
  const conVuelta = requiereBoveda(politica);
  /**
   * Lo que NO va a poder volver, aunque se guarde la bóveda.
   *
   * Se dice aquí, en la pantalla donde se elige, y no solo en el informe del regreso — que llega
   * cuando ya no hay nada que decidir. Enmascarar y generalizar **destruyen**: `103***89` y `30-39`
   * no vuelven ni con bóveda ni con nada, porque los dígitos que faltan no existen en ningún sitio.
   */
  const sinVuelta = politica.reglas
    .filter(
      (r) =>
        r.tecnica.tipo === "enmascarar" ||
        r.tecnica.tipo === "suprimir" ||
        r.tecnica.tipo.startsWith("generalizar"),
    )
    .map((r) => r.columna);

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
                  <CasillaDeVuelta
                    columna={columna.nombre}
                    tecnica={tecnicaDe(politica, columna.nombre)}
                    onCambio={cambiarReversible}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {conVuelta ? (
        <div className="border-borde mt-4 border-t pt-4">
          <p className="text-tinta text-[0.875rem] leading-relaxed">
            Con al menos una columna reversible, al transformar vas a poder{" "}
            <strong className="font-medium">guardar una bóveda</strong>: un
            archivo cifrado con la correspondencia, para recuperar los
            originales cuando te devuelvan el trabajo.
          </p>
          {sinVuelta.length > 0 ? (
            <p className="text-tinta-tenue mt-2 text-[0.8125rem] leading-relaxed">
              Lo que <strong className="font-medium">no</strong> va a volver,
              tengas o no la bóveda:{" "}
              {sinVuelta.map((nombre, i) => (
                <span key={nombre}>
                  {i > 0 ? " · " : ""}
                  <code className="font-mono">{nombre}</code>
                </span>
              ))}
              . Enmascarar, generalizar y quitar una columna{" "}
              <strong className="font-medium">destruyen</strong> información: no
              hay tabla que lo deshaga porque los datos que faltan ya no existen
              en ninguna parte.
            </p>
          ) : null}
        </div>
      ) : null}

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
            // Vacía cuando la política no trae k, jamás con un 5 de adorno: una casilla que enseña
            // un número que la política no tiene es la mentira exacta del hallazgo A1.
            value={politica.kObjetivo ?? ""}
            className="rounded-1 border-borde-control bg-superficie text-tinta w-24 border px-2 py-1.5 text-[0.875rem]"
            onChange={(evento) =>
              onCambio({
                ...politica,
                kObjetivo: Math.max(2, Number(evento.target.value) || 2),
              })
            }
          />
          {politica.kObjetivo === null ? (
            // Solo lo alcanza una política importada: elegir la opción en esta pantalla ya fija el
            // k. Aun así se dice aquí y no solo en el balance — que llega después de transformar,
            // cuando el archivo ya salió intacto.
            <p className="text-alerta w-full text-[0.8125rem] leading-relaxed">
              Esta política pide generalización automática y{" "}
              <strong className="font-medium">no fija un k</strong>. Sin él no
              hay hasta dónde generalizar: esas columnas saldrían intactas.
              Escribe un número arriba.
            </p>
          ) : (
            <p className="text-tinta-tenue w-full text-[0.8125rem] leading-relaxed">
              Con k = {numero(politica.kObjetivo)}, Velo generaliza esas
              columnas hasta que nadie quede en un grupo de menos de{" "}
              {numero(politica.kObjetivo)} registros. Cuanto más alto el k,
              menos preciso queda el dato. Si no se puede alcanzar sin borrar
              filas, Velo lo dice y no borra nada.
            </p>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * La casilla de «poder deshacerlo», solo donde tiene sentido.
 *
 * Va DEBAJO del desplegable y no en una tercera columna: en 412 px la tercera columna ya empujaba
 * el desplegable fuera de la pantalla en el S2, y eso se encontró en la pasada de capturas, no en
 * un test. Aquí no aparece si la técnica no admite vuelta, así que no ocupa sitio de más.
 */
function CasillaDeVuelta({
  columna,
  tecnica,
  onCambio,
}: {
  columna: string;
  tecnica: Tecnica;
  onCambio: (columna: string, reversible: boolean) => void;
}) {
  const admiteVuelta =
    tecnica.tipo === "seudonimizar" ||
    tecnica.tipo === "seudonimizar-con-formato";
  if (!admiteVuelta) return null;
  return (
    <label className="text-tinta-suave mt-1.5 flex max-w-[18rem] items-start gap-2 text-[0.8125rem] leading-snug">
      <input
        type="checkbox"
        checked={esReversible(tecnica)}
        className="accent-acento mt-0.5 size-4 shrink-0"
        onChange={(evento) => onCambio(columna, evento.target.checked)}
      />
      <span>
        Poder deshacerlo con una bóveda
        <span className="text-tinta-tenue block">
          Guarda la correspondencia en un archivo cifrado. Sin la bóveda, el
          seudónimo sigue sin vuelta.
        </span>
      </span>
    </label>
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
