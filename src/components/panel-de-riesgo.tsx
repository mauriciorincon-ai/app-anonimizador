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
import { deCada, numero, porcentaje, unoEn } from "@/lib/formato";
import type { RiesgoExacto } from "@/engine/riesgo";

/** Tono de la cifra. Nunca rojo de semáforo: el lacre de `--alerta` (design-system § 6). */
function tono(riesgo: RiesgoExacto): string {
  if (riesgo.proporcionUnicos >= 0.2) return "text-alerta";
  if (riesgo.unicos > 0) return "text-aviso";
  return "text-tinta";
}

export function PanelDeRiesgo({ riesgo }: { riesgo: RiesgoExacto }) {
  if (riesgo.qis.length === 0) {
    return (
      <Panel
        etiqueta="Riesgo de reidentificación"
        titulo="No hay ningún cruce que medir"
        nota="Que no haya cuasi-identificadores detectados no vuelve anónimo el archivo: quiere decir que Velo no reconoció columnas que se puedan cruzar entre sí. Un código propio de tu organización puede seguir señalando a una persona sin que ningún algoritmo público lo sepa."
      >
        <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
          Velo no clasificó ninguna columna como cuasi-identificador, así que no
          existe una combinación de columnas sobre la cual contar clases de
          equivalencia.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      etiqueta="Riesgo de reidentificación"
      titulo="Cuánta gente queda sola en tu tabla"
      nota={
        <>
          Modelo <strong className="font-medium">prosecutor</strong>: se supone
          que quien ataca ya sabe que la persona está en la tabla y solo busca
          cuál de las filas es. Es el escenario más adverso, y el único que se
          puede calcular exacto sobre tus datos.
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <p
            className={`cifra font-display text-[clamp(2.75rem,9vw,4rem)] leading-none font-semibold ${tono(riesgo)}`}
          >
            {porcentaje(riesgo.proporcionUnicos)}
          </p>
          <p className="text-tinta mt-2 text-[0.9375rem] leading-relaxed">
            de tus registros son <strong className="font-medium">únicos</strong>
            : nadie más en el archivo comparte su combinación de{" "}
            {riesgo.qis.length === 1
              ? "esa columna"
              : `esas ${numero(riesgo.qis.length)} columnas`}
            .
          </p>
          <p className="cifra text-tinta-tenue mt-1 text-[0.8125rem]">
            {deCada(riesgo.unicos, riesgo.filas)} registros.
          </p>
        </div>

        <dl className="border-borde grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-4">
          <Dato
            termino="Grupo más pequeño"
            valor={numero(riesgo.kMinimo)}
            unidad={riesgo.kMinimo === 1 ? "persona" : "personas"}
            explicacion="El k real del archivo: el tamaño de la clase de equivalencia más chica."
          />
          <Dato
            termino="Riesgo del más expuesto"
            valor={unoEn(riesgo.riesgoMaximo)}
            explicacion="Probabilidad de acertar quién es, para el registro peor protegido."
          />
          <Dato
            termino="Riesgo promedio"
            valor={unoEn(riesgo.riesgoPromedio)}
            explicacion="Promedio de 1/k sobre todos los registros."
          />
          <Dato
            termino="Grupos distintos"
            valor={numero(riesgo.clases)}
            explicacion="Cuántas combinaciones de valores diferentes hay entre esas columnas."
          />
        </dl>

        <div className="border-borde border-t pt-5">
          <p className="etiqueta">Columnas cruzadas</p>
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
            <strong className="text-acento font-medium">Cifra exacta.</strong>{" "}
            Se contó registro por registro sobre tus {numero(riesgo.filas)}{" "}
            filas. No hay modelo, ni muestreo, ni estimación de por medio.
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
