"use client";

// La estructura de un JSON — qué se trató, qué NO, y qué no está en todos los registros.
//
// Un JSON no es una tabla. Velo lo lee en el worker y vuelve columnas las RUTAS de cada valor
// (`paciente.contacto.correo`), pero lo que no cabe en una columna —las listas— no se aplana ni se
// trata: sale del archivo tal cual. Callarlo sería la mentira más cara de esta pantalla: la persona
// vería su política aplicada, entregaría el archivo y `contactos[].correo` iría en claro. Por eso
// este panel declara las listas con el mismo peso que las columnas tratadas, y lo hace con un
// aviso fuerte antes de la tabla, no en una nota al pie.
//
// Es presentacional: recibe `EstructuraJson` —conteos, rutas y nombres de campo; jamás valores— y
// lo pinta. El color nunca va solo: cada estado lleva símbolo, texto y color (WCAG 1.4.1).

import { useId } from "react";

import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import type {
  EstructuraJson,
  MotivoNoTratada,
  RutaHeterogenea,
  RutaNoTratada,
} from "@/engine/json/tipos";
import { numero } from "@/lib/formato";
import type { Texto } from "@/lib/idioma";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";

const E = DIAGNOSTICO.estructura;

const INSIGNIA =
  "inline-flex items-center gap-1.5 rounded-2 px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap";

/** El símbolo es una forma del dato (`[ ]` una lista, `[{ }]` una lista de objetos), no un adorno. */
const MOTIVOS: Record<MotivoNoTratada, { texto: Texto; simbolo: string }> = {
  lista: { texto: E.noTratadas.motivo.lista, simbolo: "[ ]" },
  "lista-de-objetos": {
    texto: E.noTratadas.motivo.listaDeObjetos,
    simbolo: "[{ }]",
  },
};

export function EstructuraDelJson({
  estructura,
}: {
  estructura: EstructuraJson;
}) {
  const { t, idioma } = useT();

  return (
    <Panel
      etiqueta={t(E.etiqueta)}
      titulo={t(E.titulo)}
      nota={<Rico texto={E.nota} />}
    >
      <div className="flex flex-col gap-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Cifra etiqueta={t(E.cifras.registros)}>
            {numero(estructura.registros, idioma)}
          </Cifra>
          <Cifra etiqueta={t(E.cifras.rutasTratadas)}>
            {numero(estructura.rutasTratadas, idioma)}
          </Cifra>
          <Cifra etiqueta={t(E.cifras.profundidad)}>
            {numero(estructura.profundidad, idioma)}
          </Cifra>
          <Cifra etiqueta={t(E.cifras.forma)} pequena>
            {t(E.forma[estructura.forma === "arreglo" ? "arreglo" : "lineas"])}
          </Cifra>
        </dl>

        <SeccionDeNoTratadas
          rutas={estructura.noTratadas}
          registros={estructura.registros}
        />
        <SeccionDeHeterogeneas
          rutas={estructura.heterogeneas}
          registros={estructura.registros}
        />
      </div>
    </Panel>
  );
}

function Cifra({
  etiqueta,
  pequena = false,
  children,
}: {
  etiqueta: string;
  pequena?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="etiqueta">{etiqueta}</dt>
      <dd
        className={`cifra text-tinta mt-1.5 font-semibold ${
          pequena ? "text-[0.9375rem] leading-snug" : "text-2xl"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

/** Una línea tranquila con su símbolo: lo bueno también se dice, porque su silencio se leería igual. */
function SinHallazgo({ texto }: { texto: Texto }) {
  const { t } = useT();
  return (
    <p className="text-tinta-suave flex items-baseline gap-2 text-[0.9375rem] leading-relaxed">
      <span aria-hidden="true" className="text-acento font-semibold">
        ✓
      </span>
      {t(texto)}
    </p>
  );
}

// ── Lo que NO se trata ──────────────────────────────────────────────────────────────────────────

function SeccionDeNoTratadas({
  rutas,
  registros,
}: {
  rutas: readonly RutaNoTratada[];
  registros: number;
}) {
  const { t } = useT();
  const idDelTitulo = useId();
  const idDelAviso = useId();
  const primera = rutas[0];
  // Un ejemplo con un nombre de campo real vale más que una advertencia general: es la frase que
  // la persona va a reconocer en SU archivo. Prefiere una pista (`contactos[].correo`) a la lista.
  const ejemplo = primera ? (primera.pistas[0] ?? primera.ruta) : "";

  return (
    <section aria-labelledby={idDelTitulo} className="flex flex-col gap-4">
      <h3 id={idDelTitulo} className="text-tinta text-base font-semibold">
        {t(E.noTratadas.titulo)}
      </h3>

      {primera === undefined ? (
        <SinHallazgo texto={E.noTratadas.ninguna} />
      ) : (
        <>
          {/* El aviso va ANTES de la tabla y con su propio símbolo: el color solo no basta, y una
              tabla sin aviso encima se lee como un inventario, no como una advertencia. */}
          <div
            role="note"
            aria-labelledby={idDelAviso}
            className="rounded-2 border-alerta/35 bg-alerta-tenue flex items-start gap-3 border px-4 py-3"
          >
            <span
              aria-hidden="true"
              className="border-alerta text-alerta mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border text-[0.875rem] font-semibold"
            >
              !
            </span>
            <div>
              <p
                id={idDelAviso}
                className="text-alerta text-[0.9375rem] font-semibold"
              >
                {t(E.noTratadas.avisoTitulo)}
              </p>
              <p className="text-tinta mt-1 text-[0.9375rem] leading-relaxed">
                <Rico texto={E.noTratadas.aviso} datos={{ ejemplo }} />
              </p>
            </div>
          </div>

          <p className="text-tinta-tenue text-[0.8125rem] sm:hidden">
            {t(DIAGNOSTICO.tabla.desplaza)}
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label={t(E.noTratadas.detalle)}
            className="tabla-desplazable -mx-5 overflow-x-auto px-5"
          >
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">
                {t(E.noTratadas.descripcion)}
              </caption>
              <thead>
                <tr className="border-borde border-b">
                  <th
                    scope="col"
                    className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.noTratadas.encabezados.ruta)}
                  </th>
                  <th
                    scope="col"
                    className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.noTratadas.encabezados.queEs)}
                  </th>
                  <th
                    scope="col"
                    className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.noTratadas.encabezados.registros)}
                  </th>
                  <th
                    scope="col"
                    className="etiqueta pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.noTratadas.encabezados.campos)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rutas.map((ruta) => (
                  <FilaDeNoTratada
                    key={ruta.ruta}
                    ruta={ruta}
                    registros={registros}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-tinta-tenue text-[0.8125rem] leading-relaxed">
            {t(E.noTratadas.nota)}
          </p>
        </>
      )}
    </section>
  );
}

function FilaDeNoTratada({
  ruta,
  registros,
}: {
  ruta: RutaNoTratada;
  registros: number;
}) {
  const { t } = useT();
  const motivo = MOTIVOS[ruta.motivo];
  return (
    <tr className="border-borde border-b align-top last:border-b-0">
      <th
        scope="row"
        className="text-tinta max-w-[16rem] py-3 pr-4 font-mono text-[0.8125rem] font-normal break-words"
      >
        {ruta.ruta}
      </th>
      <td className="py-3 pr-4">
        <span className={`${INSIGNIA} bg-alerta-tenue text-alerta`}>
          <span aria-hidden="true" className="font-mono">
            {motivo.simbolo}
          </span>
          {t(motivo.texto)}
        </span>
      </td>
      <td className="cifra text-tinta-suave py-3 pr-4 text-[0.875rem] whitespace-nowrap">
        {t(E.noTratadas.presencia, { n: ruta.registros, total: registros })}
      </td>
      <td className="py-3">
        {ruta.pistas.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {ruta.pistas.map((pista) => (
              <li key={pista}>
                <code className="text-tinta-suave font-mono text-[0.8125rem] break-all">
                  {pista}
                </code>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-tinta-tenue text-[0.8125rem]">
            {t(E.noTratadas.sinCampos)}
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Lo que no está en todos los registros, o cambia de tipo ─────────────────────────────────────

function SeccionDeHeterogeneas({
  rutas,
  registros,
}: {
  rutas: readonly RutaHeterogenea[];
  registros: number;
}) {
  const { t } = useT();
  const idDelTitulo = useId();

  return (
    <section aria-labelledby={idDelTitulo} className="flex flex-col gap-4">
      <h3 id={idDelTitulo} className="text-tinta text-base font-semibold">
        {t(E.heterogeneas.titulo)}
      </h3>

      {rutas.length === 0 ? (
        <SinHallazgo texto={E.heterogeneas.ninguna} />
      ) : (
        <>
          <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
            {t(E.heterogeneas.intro)}
          </p>
          <p className="text-tinta-tenue text-[0.8125rem] sm:hidden">
            {t(DIAGNOSTICO.tabla.desplaza)}
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label={t(E.heterogeneas.detalle)}
            className="tabla-desplazable -mx-5 overflow-x-auto px-5"
          >
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <caption className="sr-only">
                {t(E.heterogeneas.descripcion)}
              </caption>
              <thead>
                <tr className="border-borde border-b">
                  <th
                    scope="col"
                    className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.heterogeneas.encabezados.ruta)}
                  </th>
                  <th
                    scope="col"
                    className="etiqueta pr-4 pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.heterogeneas.encabezados.presencia)}
                  </th>
                  <th
                    scope="col"
                    className="etiqueta pb-2 align-bottom whitespace-nowrap"
                  >
                    {t(E.heterogeneas.encabezados.tipos)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rutas.map((ruta) => (
                  <tr
                    key={ruta.ruta}
                    className="border-borde border-b align-top last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="text-tinta max-w-[16rem] py-3 pr-4 font-mono text-[0.8125rem] font-normal break-words"
                    >
                      {ruta.ruta}
                    </th>
                    <td className="cifra text-tinta-suave py-3 pr-4 text-[0.875rem] whitespace-nowrap">
                      {t(E.heterogeneas.presencia, {
                        n: ruta.presencia,
                        total: registros,
                      })}
                    </td>
                    <td className="py-3">
                      <ul className="flex flex-wrap gap-1.5">
                        {ruta.tipos.map((tipo) => (
                          <li
                            key={tipo}
                            className={`${INSIGNIA} bg-papel-hundido text-tinta-suave`}
                          >
                            {t(E.heterogeneas.tipo[tipo])}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
