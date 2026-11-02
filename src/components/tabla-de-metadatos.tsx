"use client";

// Los campos con nombre de un PDF o una imagen, y los bloques que la limpieza quita o conserva.
//
// Hermana de `tabla-de-columnas.tsx` y con su mismo lenguaje: `<table>` de verdad con encabezados
// `scope`, la clave en mono, una región enfocable que se desplaza en móvil, y la evidencia al lado de
// la conclusión. Un campo no es una columna —es UN valor—, así que aquí no hay proporciones: el
// validador cuadra con ese valor o no cuadra.
//
// Es presentacional y solo recibe lo que cruza el worker: nombres de campo, valores YA enmascarados
// y conteos. El valor completo de un autor o de unas coordenadas no existe en esta pestaña.
//
// El color nunca va solo. Qué REVELA un campo lleva símbolo + texto en una insignia neutra (los
// colores de categoría son un sistema cerrado de `insignias.tsx` y aquí no se reasignan); la
// categoría jurídica de lo que un validador confirmó sí usa esos colores, con su texto.

import { useId } from "react";

import { InsigniaDeCategoria, InsigniaDeCerteza } from "@/components/insignias";
import { useT } from "@/components/texto";
import type {
  CampoDeMetadato,
  ClaseDeElemento,
  Deteccion,
  Elemento,
  OrigenDeCampo,
  Revela,
} from "@/engine/metadatos/tipos";
import { bytes as enBytes, numero } from "@/lib/formato";
import type { Texto } from "@/lib/idioma";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";
import { METADATOS } from "@/lib/idioma/textos/metadatos";

const M = METADATOS;

// Anotar el tipo es la comprobación de que no falta ninguna clave: añadir un valor a `Revela`,
// `OrigenDeCampo` o `ClaseDeElemento` rompe la compilación aquí, no en una celda vacía.
const REVELA: Record<Revela, Texto> = M.revela;
const ORIGEN: Record<OrigenDeCampo, Texto> = M.origen;
const CLASE: Record<ClaseDeElemento, Texto> = M.elementos.clase;

/** Una forma por cada cosa que un campo puede revelar: el texto la dice igual, el símbolo ayuda a leer. */
const SIMBOLO_DE_REVELA: Record<Revela, string> = {
  autoria: "●",
  ubicacion: "▲",
  dispositivo: "■",
  software: "◆",
  fecha: "○",
  identificador: "△",
  descripcion: "□",
  otro: "◇",
};

const INSIGNIA =
  "inline-flex items-center gap-1.5 rounded-2 px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap";

export function InsigniaDeRevela({ revela }: { revela: Revela }) {
  const { t } = useT();
  return (
    <span className={`${INSIGNIA} bg-papel-hundido text-tinta-suave`}>
      <span aria-hidden="true" className="font-mono">
        {SIMBOLO_DE_REVELA[revela]}
      </span>
      {t(REVELA[revela])}
    </span>
  );
}

// ── Los campos con nombre ───────────────────────────────────────────────────────────────────────

export function TablaDeMetadatos({
  campos,
}: {
  campos: readonly CampoDeMetadato[];
}) {
  const { t } = useT();
  const encabezados = M.campos.encabezados;

  return (
    <>
      <p className="text-tinta-tenue mb-3 text-[0.8125rem] sm:hidden">
        {t(DIAGNOSTICO.tabla.desplaza)}
      </p>
      <div
        tabIndex={0}
        role="region"
        aria-label={t(M.campos.detalle)}
        className="tabla-desplazable -mx-5 overflow-x-auto px-5"
      >
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <caption className="sr-only">{t(M.campos.descripcion)}</caption>
          <thead>
            <tr className="border-borde border-b">
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.campo)}
              </th>
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.donde)}
              </th>
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.revela)}
              </th>
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.muestra)}
              </th>
              <th
                scope="col"
                className="etiqueta pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.reconoce)}
              </th>
            </tr>
          </thead>
          <tbody>
            {campos.map((campo, i) => (
              // Un mismo campo puede aparecer más de una vez (una versión anterior del PDF repite
              // `Author`): la posición es lo único que lo distingue, y la lista no se reordena.
              <tr
                key={`${campo.origen}-${campo.clave}-${i}`}
                className="border-borde border-b align-top last:border-b-0"
              >
                <th
                  scope="row"
                  className="text-tinta max-w-[14rem] py-3 pr-4 font-mono text-[0.8125rem] font-normal break-words"
                >
                  {campo.clave}
                </th>
                <td className="text-tinta-suave max-w-[12rem] py-3 pr-4 text-[0.8125rem] leading-snug">
                  {t(ORIGEN[campo.origen])}
                </td>
                <td className="py-3 pr-4">
                  <InsigniaDeRevela revela={campo.revela} />
                </td>
                <td className="max-w-[16rem] py-3 pr-4">
                  {campo.muestra === "" ? (
                    <span className="text-tinta-tenue text-[0.8125rem]">
                      {t(M.campos.vacio)}
                    </span>
                  ) : (
                    <span className="text-tinta-suave font-mono text-[0.8125rem] break-all">
                      {campo.muestra}
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <Reconocido deteccion={campo.deteccion} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Lo que un validador confirmó de ESE valor, con la misma evidencia que una columna: el nombre del
 * tipo, qué tan firme es (algoritmo oficial o solo la forma) y su categoría jurídica.
 */
function Reconocido({ deteccion }: { deteccion: Deteccion | null }) {
  const { t, m } = useT();
  if (deteccion === null) {
    return (
      <span className="text-tinta-tenue text-[0.8125rem]">
        {t(M.campos.sinReconocer)}
      </span>
    );
  }
  const tipo = m(deteccion.etiqueta);
  return (
    <>
      <span className="text-tinta text-[0.875rem] font-medium">
        {/* «Contiene: …» cuando el validador lo vio en una parte del valor, no en el valor entero:
            «aquí dentro hay una cédula» no es lo mismo que «esto es una cédula». */}
        {deteccion.dentro ? t(M.campos.contiene, { tipo }) : tipo}
      </span>
      <span className="mt-1 block">
        <InsigniaDeCerteza certeza={deteccion.certeza} />
      </span>
      <span className="mt-1.5 block">
        <InsigniaDeCategoria categoria={deteccion.categoria} />
      </span>
    </>
  );
}

// ── Los bloques que se quitan o se conservan ────────────────────────────────────────────────────

/**
 * Una fila por clase de bloque, con su marcador técnico (`APP1`, `tEXt`, `/Info`: el mismo en los dos
 * idiomas, para quien quiera comprobarlo con otra herramienta), cuántos hay y cuánto pesan.
 *
 * `descripcion` es a la vez el nombre de la tabla y el de su región: en una misma pantalla hay una de
 * lo que se quita y otra de lo que se conserva, y dos regiones con el mismo nombre no se distinguen
 * al saltar de una a otra.
 */
export function TablaDeElementos({
  elementos,
  descripcion,
}: {
  elementos: readonly Elemento[];
  descripcion: Texto;
}) {
  const { t, idioma } = useT();
  const encabezados = M.elementos.encabezados;

  return (
    <>
      <p className="text-tinta-tenue mb-3 text-[0.8125rem] sm:hidden">
        {t(DIAGNOSTICO.tabla.desplaza)}
      </p>
      <div
        tabIndex={0}
        role="region"
        aria-label={t(descripcion)}
        className="tabla-desplazable -mx-5 overflow-x-auto px-5"
      >
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">{t(descripcion)}</caption>
          <thead>
            <tr className="border-borde border-b">
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.que)}
              </th>
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.marcador)}
              </th>
              <th
                scope="col"
                className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.cuantos)}
              </th>
              <th
                scope="col"
                className="etiqueta pb-2 align-bottom whitespace-nowrap"
              >
                {t(encabezados.tamano)}
              </th>
            </tr>
          </thead>
          <tbody>
            {elementos.map((elemento, i) => (
              <tr
                key={`${elemento.clase}-${elemento.marcador}-${i}`}
                className="border-borde border-b align-top last:border-b-0"
              >
                <th
                  scope="row"
                  className="text-tinta max-w-[18rem] py-3 pr-4 text-[0.875rem] leading-snug font-normal"
                >
                  {t(CLASE[elemento.clase])}
                </th>
                <td className="py-3 pr-4">
                  <code className="text-tinta-suave font-mono text-[0.8125rem] break-all">
                    {elemento.marcador}
                  </code>
                </td>
                <td className="cifra text-tinta-suave py-3 pr-4 text-[0.875rem]">
                  {numero(elemento.cuantos, idioma)}
                </td>
                <td className="cifra text-tinta-suave py-3 text-[0.875rem] whitespace-nowrap">
                  {elemento.bytes === null ? (
                    <span className="text-tinta-tenue text-[0.8125rem]">
                      {t(M.elementos.sinTamano)}
                    </span>
                  ) : (
                    enBytes(elemento.bytes, idioma)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Un título, y debajo la tabla de bloques o la frase que dice que no hay ninguno. Lo usan el
 * diagnóstico (lo que se quitará) y el resultado (lo que se quitó), que dicen lo mismo en dos tiempos.
 */
export function SeccionDeElementos({
  titulo,
  descripcion,
  ninguno,
  elementos,
}: {
  titulo: Texto;
  descripcion: Texto;
  ninguno: Texto;
  elementos: readonly Elemento[];
}) {
  const { t } = useT();
  const idDelTitulo = useId();
  return (
    <section aria-labelledby={idDelTitulo} className="flex flex-col gap-4">
      <h3 id={idDelTitulo} className="text-tinta text-base font-semibold">
        {t(titulo)}
      </h3>
      {elementos.length === 0 ? (
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          {t(ninguno)}
        </p>
      ) : (
        <TablaDeElementos elementos={elementos} descripcion={descripcion} />
      )}
    </section>
  );
}
