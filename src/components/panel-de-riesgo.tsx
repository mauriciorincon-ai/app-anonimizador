"use client";

// El riesgo exacto, presentado como lo que es.
//
// Tres reglas del sistema de diseño se juegan enteras en este componente (§ 5):
//
//   1. **Lo exacto se presenta desnudo**: la cifra, y debajo qué se contó. Sin adjetivos, sin
//      medidores de colores que traduzcan un número a una emoción.
//   2. **Todo número enseña su denominador.** "412 registros únicos" sin "de 3.000" es alarma,
//      no información.
//   3. **La marca de naturaleza es visible.** `naturaleza: "exacto"` no es un campo interno: el
//      Sprint 002 traerá estimadores poblacionales y esta pantalla tendrá que poder decir, sin
//      ambigüedad, cuál de los dos planos está mirando el usuario.
//
// Y una que es de producto: aquí no se dice "seguro", ni "anonimizado", ni "protegido". k-anonimato
// es atacable y se degrada con la dimensionalidad; lo que Velo puede afirmar es cuánta gente queda
// sola en SU archivo, que es mucho, y es verdad.

import { Panel } from "@/components/panel";
import { Rico, useT } from "@/components/texto";
import { deCada, numero, porcentaje, unoEn } from "@/lib/formato";
import type { RiesgoExacto } from "@/engine/riesgo";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";

/** Tono de la cifra. Nunca rojo de semáforo: el lacre de `--alerta` (design-system § 6). */
function tono(riesgo: RiesgoExacto): string {
  if (riesgo.proporcionUnicos >= 0.2) return "text-alerta";
  if (riesgo.unicos > 0) return "text-aviso";
  return "text-tinta";
}

export function PanelDeRiesgo({
  riesgo,
  identificadoresDirectos,
}: {
  riesgo: RiesgoExacto;
  /** Cuántas columnas identifican sin ayuda de nadie. La cifra de este panel NO las cuenta. */
  identificadoresDirectos: number;
}) {
  const { t, idioma } = useT();
  const textos = DIAGNOSTICO.riesgo;

  if (riesgo.qis.length === 0) {
    return (
      <Panel
        etiqueta={t(textos.etiqueta)}
        titulo={t(textos.sinCruce.titulo)}
        nota={t(textos.sinCruce.nota)}
      >
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          <Rico texto={textos.sinCruce.detalle} />
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      etiqueta={t(textos.etiqueta)}
      titulo={t(textos.titulo)}
      nota={<Rico texto={textos.nota} />}
    >
      <div className="flex flex-col gap-6">
        <div>
          <p
            className={`cifra font-display text-[clamp(2.75rem,9vw,4rem)] leading-none font-semibold ${tono(riesgo)}`}
          >
            {porcentaje(riesgo.proporcionUnicos, idioma)}
          </p>
          <p className="text-tinta mt-2 text-[0.9375rem] leading-relaxed">
            <Rico
              texto={
                riesgo.qis.length === 1 ? textos.unicosUna : textos.unicosVarias
              }
              datos={{ n: riesgo.qis.length }}
            />
          </p>
          <p className="cifra text-tinta-tenue mt-1 text-[0.8125rem]">
            {t(textos.registros, {
              cifra: deCada(riesgo.unicos, riesgo.filas, idioma),
            })}
          </p>
          {/* Sin esta línea, un archivo con una cédula y dos columnas demográficas enseña "0,0 %"
              como titular y se lee como tranquilidad. La cifra es correcta y está bien acotada —
              pero la composición decía otra cosa, y aquí el titular importa tanto como el dato. */}
          {identificadoresDirectos > 0 ? (
            <p className="text-aviso mt-3 text-[0.8125rem] leading-relaxed">
              <Rico
                texto={
                  identificadoresDirectos === 1
                    ? textos.noCuentaUna
                    : textos.noCuentaVarias
                }
                datos={{ n: identificadoresDirectos }}
              />
            </p>
          ) : null}
        </div>

        <dl className="border-borde grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-4">
          <Dato
            termino={t(textos.grupoMasPequeno)}
            valor={numero(riesgo.kMinimo, idioma)}
            unidad={t(riesgo.kMinimo === 1 ? textos.persona : textos.personas)}
            explicacion={t(textos.grupoMasPequenoExplicacion)}
          />
          <Dato
            termino={t(textos.masExpuesto)}
            valor={unoEn(riesgo.riesgoMaximo, idioma)}
            explicacion={t(textos.masExpuestoExplicacion)}
          />
          <Dato
            termino={t(textos.promedio)}
            valor={unoEn(riesgo.riesgoPromedio, idioma)}
            explicacion={t(textos.promedioExplicacion)}
          />
          <Dato
            termino={t(textos.gruposDistintos)}
            valor={numero(riesgo.clases, idioma)}
            explicacion={t(textos.gruposDistintosExplicacion)}
          />
        </dl>

        <div className="border-borde border-t pt-5">
          <p className="etiqueta">{t(textos.columnasCruzadas)}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {riesgo.qis.map((qi) => (
              <li
                key={qi}
                className="rounded-2 bg-papel-hundido text-tinta-suave px-2 py-0.5 font-mono text-[0.75rem]"
              >
                {qi}
              </li>
            ))}
          </ul>
          <p className="text-tinta-tenue mt-3 text-[0.8125rem] leading-relaxed">
            <strong className="text-acento font-medium">
              {t(textos.cifraExacta)}
            </strong>{" "}
            <Rico
              texto={textos.cifraExactaDetalle}
              datos={{ n: riesgo.filas }}
            />
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Dato({
  termino,
  valor,
  unidad,
  explicacion,
}: {
  termino: string;
  valor: string;
  unidad?: string;
  explicacion: string;
}) {
  // Un `<dl>` solo admite <dt>, <dd> y <div> como hijos, y dentro del <div>, solo <dt> y <dd>.
  // La explicación va DENTRO del <dd>, no como un <p> hermano: si no, la lista de definiciones
  // deja de serlo para un lector de pantalla.
  return (
    <div>
      <dt className="text-tinta-tenue text-[0.75rem] leading-tight">
        {termino}
      </dt>
      <dd className="mt-1">
        <span className="cifra text-tinta text-lg leading-none font-semibold">
          {valor}
        </span>
        {unidad ? (
          <span className="text-tinta-suave ml-1 text-[0.8125rem]">
            {unidad}
          </span>
        ) : null}
        <span className="text-tinta-tenue mt-1.5 block text-[0.75rem] leading-snug">
          {explicacion}
        </span>
      </dd>
    </div>
  );
}
