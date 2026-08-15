"use client";

// P9 — el riesgo estimado, en su propio panel y nunca dentro del balance.
//
// **La separación visual ES la regla, no una decisión de maquetación.** El balance de arriba es todo
// exacto: se contó registro por registro sobre el archivo. Esto habla de una POBLACIÓN que Velo no
// tiene delante, con un modelo y un supuesto que el usuario declaró. Son dos planos, y componerlos
// —un promedio, un «riesgo total», o simplemente la misma tipografía grande— produciría una tercera
// cifra que no es verdad.
//
// De ahí las tres cosas que esta pantalla hace y que no son adorno:
//
//   1. **El titular sigue siendo el exacto.** Aquí no hay número gigante. Las cifras estimadas se
//      pintan al tamaño del texto, con su etiqueta «Cifra estimada» encima.
//   2. **Modelo y supuesto van en la MISMA línea que la cifra**, no en un pie de página que nadie
//      lee. Una estimación sin su supuesto es una afirmación.
//   3. **Cuando no se puede estimar, se dice por qué** — con la razón entera, no con un guion. Es
//      el caso más frecuente: casi nadie sabe el tamaño de su población, y muchos archivos son una
//      fracción demasiado pequeña de la suya para que el segundo estimador sirva.
//
// El campo de población vive aquí y **no en la política**, decidido con el usuario: es contexto de
// una medición, no una decisión de tratamiento, y no puede tocar el hash de la política — dos
// tratamientos idénticos no dejan de serlo porque uno declare su población.

import { useId, useState } from "react";

import { Boton } from "@/components/boton";
import { IconoBarras, IconoEquis } from "@/components/iconos";
import { Panel } from "@/components/panel";
import type {
  CifraEstimada,
  Estimacion,
  RiesgoEstimado,
} from "@/engine/riesgo-estimado";
import { numero, porcentaje, unoEn } from "@/lib/formato";

export function RiesgoEstimadoEnPantalla({
  estimacion,
  poblacion,
  onDeclarar,
}: {
  estimacion: RiesgoEstimado | null;
  poblacion: number | null;
  onDeclarar: (poblacion: number | null) => void;
}) {
  const idDePoblacion = useId();
  const idDeAyuda = useId();
  const [texto, setTexto] = useState(
    poblacion === null ? "" : String(poblacion),
  );

  const escrito = texto.trim();
  const valor = escrito === "" ? null : Number(escrito.replace(/[.\s]/g, ""));
  const invalido = valor !== null && (!Number.isFinite(valor) || valor <= 0);

  return (
    <Panel
      etiqueta="Paso 5 · el riesgo estimado"
      titulo="Y en la población entera, ¿cuánto?"
      // La nota de `Panel` se pinta en el PIE, así que no puede decir «lo de arriba»: colocada
      // debajo de las cifras estimadas, esa frase parecería estar hablando de ellas y diría justo
      // lo contrario de lo que quiere decir. Se nombran los dos paneles por lo que son.
      nota={
        <>
          El balance es <strong className="font-medium">exacto</strong> y habla
          de tu archivo; esta sección es{" "}
          <strong className="font-medium">estimada</strong> y habla de la
          población de la que salió. No se suman ni se promedian entre sí.
        </>
      }
    >
      <div>
        <label
          htmlFor={idDePoblacion}
          className="text-tinta block text-[0.9375rem]"
        >
          ¿De cuántas personas salió este archivo? (opcional)
        </label>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <input
            id={idDePoblacion}
            type="text"
            inputMode="numeric"
            value={texto}
            aria-describedby={idDeAyuda}
            aria-invalid={invalido}
            placeholder="por ejemplo, 2400000"
            className="rounded-1 border-borde-control bg-superficie text-tinta w-full max-w-[16rem] border px-3 py-2 text-[0.9375rem] tabular-nums"
            onChange={(evento) => setTexto(evento.target.value)}
          />
          <Boton
            type="button"
            variante="discreto"
            disabled={invalido}
            onClick={() => onDeclarar(invalido ? null : valor)}
          >
            {valor === null ? <IconoEquis /> : <IconoBarras />}
            {valor === null ? "Quitar la estimación" : "Estimar"}
          </Boton>
        </div>
        <p
          id={idDeAyuda}
          className="text-tinta-tenue mt-2 text-[0.8125rem] leading-relaxed"
        >
          El total de personas del que este archivo es una muestra —los
          afiliados de la EPS, los habitantes del municipio, los empleados de la
          empresa—. Velo no puede saberlo, y{" "}
          <strong className="font-medium">no se lo inventa</strong>: sin este
          dato no hay estimador poblacional que valga.
        </p>
      </div>

      {estimacion ? (
        <div className="border-borde mt-6 space-y-6 border-t pt-5">
          <Estimador
            titulo="Si alguien intenta emparejar una fila con una persona"
            estimacion={estimacion.individual}
            cifra={(e) => (
              <>
                <Valor cifra={e.maximo} formato={(v) => unoEn(v)} />{" "}
                <span className="text-tinta-suave">
                  para el registro más expuesto
                  {e.claseMasPequena === 1
                    ? " (uno que está solo en el archivo)"
                    : `, que comparte valores con otros ${numero(e.claseMasPequena - 1)}`}
                  ; {unoEn(e.promedio.valor)} de media.
                </span>
              </>
            )}
          />
          <Estimador
            titulo="De tus registros únicos, cuántos lo serían en la población"
            estimacion={estimacion.poblacional}
            cifra={(e) => (
              <>
                <Valor cifra={e.proporcion} formato={porcentaje} />{" "}
                <span className="text-tinta-suave">
                  de las filas del archivo —unas{" "}
                  {numero(Math.round(e.registros.valor))} de{" "}
                  {numero(e.unicosEnLaMuestra)} únicos— seguirían siendo únicas
                  entre todas esas personas.
                </span>
              </>
            )}
          />
        </div>
      ) : null}
    </Panel>
  );
}

/** Un estimador: su cifra si la hay, o la razón entera de que no la haya. */
function Estimador<T>({
  titulo,
  estimacion,
  cifra,
}: {
  titulo: string;
  estimacion: Estimacion<T>;
  cifra: (datos: Estimacion<T> & { ok: true }) => React.ReactNode;
}) {
  return (
    <div>
      <p className="etiqueta">{titulo}</p>
      {estimacion.ok ? (
        <>
          <p className="text-tinta mt-2 text-[1.0625rem] leading-relaxed">
            {cifra(estimacion)}
          </p>
          {/* Modelo y supuesto pegados a la cifra: una estimación sin su supuesto es una
              afirmación, y ponerlos en un pie de página sería ponerlos donde no se leen. */}
          <p className="text-tinta-tenue mt-2 text-[0.8125rem] leading-relaxed">
            <strong className="text-tinta-suave font-medium">
              Cifra estimada
            </strong>{" "}
            · modelo: {estimacion.modelo} · supone que {estimacion.supuesto} ·{" "}
            {estimacion.fuente}
          </p>
        </>
      ) : (
        <p className="text-tinta-suave mt-2 text-[0.9375rem] leading-relaxed">
          <strong className="text-tinta font-medium">No calculable.</strong>{" "}
          {estimacion.explicacion}
        </p>
      )}
    </div>
  );
}

/** Una cifra estimada con su intervalo — o con la razón de que no tenga ninguno. */
function Valor({
  cifra,
  formato,
}: {
  cifra: CifraEstimada;
  formato: (valor: number) => string;
}) {
  const { intervalo } = cifra;
  return (
    <>
      <strong className="text-tinta font-semibold tabular-nums">
        {formato(cifra.valor)}
      </strong>
      {intervalo.tipo === "derivado" && intervalo.desde !== intervalo.hasta ? (
        // `desde` primero, siempre. Es el extremo de MENOS riesgo, y ponerlo delante deja el rango
        // ascendente con los dos formatos: «entre 2 % y 9 %» y «entre 1 en 36 y 1 en 1». Al revés
        // —como estaba— el de porcentajes salía descendente y se leía como una errata.
        <span className="text-tinta-tenue text-[0.875rem]">
          {" "}
          (el modelo lo sitúa entre {formato(intervalo.desde)} y{" "}
          {formato(intervalo.hasta)}, al {porcentaje(intervalo.confianza)})
        </span>
      ) : null}
    </>
  );
}
