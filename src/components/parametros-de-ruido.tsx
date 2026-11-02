"use client";

// Los parámetros del ruido con garantía (S7), debajo del menú de la columna.
//
// Va DEBAJO del desplegable, como la casilla de vuelta, por la misma razón: en 412 px una tercera
// columna empujaba el menú fuera de la pantalla. Lo que se escribe aquí va a la política solo
// cuando es válido (un máximo menor que el mínimo, a medio teclear, no se guarda): el borrador vive
// en la pantalla y la política nunca queda en un estado que el motor rechazaría al transformar.
// Cada nota dice lo que la técnica promete y lo que no: ε y su alcance, o «sin garantía formal».

import { useState } from "react";

import { Rico, useT } from "@/components/texto";
import { tecnicaValida, type Tecnica } from "@/engine/politica";
import { epsilon, numero } from "@/lib/formato";
import { TRANSFORMAR } from "@/lib/idioma/textos/transformar";

const R = TRANSFORMAR.editor.ruido;

/** Los ε que la política admite (la misma lista que `src/engine/ruido/muestreo.ts`). */
const EPSILONES = [0.1, 0.5, 1, 2, 4, 8] as const;

type DeRuido = Extract<
  Tecnica,
  { tipo: "laplace" | "respuesta-aleatorizada" | "perturbar" }
>;

/** Lo que cada técnica promete y lo que no, en una nota bajo sus parámetros. */
const NOTA = {
  laplace: R.notaLaplace,
  "respuesta-aleatorizada": R.notaRespuesta,
  perturbar: R.notaPerturbar,
} as const;

function borradorDe(tecnica: DeRuido): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tecnica)
      .filter(([k]) => k !== "tipo")
      .map(([k, v]) => [k, String(v)]),
  );
}

const CAMPO =
  "rounded-1 border-borde-control bg-superficie text-tinta border px-2 py-1 text-[0.8125rem]";

export function ParametrosDeRuido({
  columna,
  tecnica,
  onCambio,
}: {
  columna: string;
  tecnica: Tecnica;
  onCambio: (columna: string, tecnica: Tecnica) => void;
}) {
  if (
    tecnica.tipo !== "laplace" &&
    tecnica.tipo !== "respuesta-aleatorizada" &&
    tecnica.tipo !== "perturbar"
  )
    return null;
  // La clave reinicia el borrador al cambiar de técnica; dentro de una misma, ver `Parametros`.
  return (
    <Parametros
      key={tecnica.tipo}
      columna={columna}
      tecnica={tecnica}
      onCambio={onCambio}
    />
  );
}

function Parametros({
  columna,
  tecnica,
  onCambio,
}: {
  columna: string;
  tecnica: DeRuido;
  onCambio: (columna: string, tecnica: Tecnica) => void;
}) {
  const { t, idioma } = useT();
  const [borrador, setBorrador] = useState(() => borradorDe(tecnica));
  const [invalido, setInvalido] = useState(false);
  // Lo que este campo guardó en la política, y la técnica que se vio por última vez. Si la técnica
  // cambia y no fue por lo que se tecleó aquí (se importó otra política), el borrador se rehace;
  // si fue por lo tecleado, se deja: rehacerlo movería el cursor a mitad de un número.
  const actual = JSON.stringify(tecnica);
  const [vista, setVista] = useState(actual);
  const [guardada, setGuardada] = useState(actual);
  if (actual !== vista) {
    setVista(actual);
    if (actual !== guardada) {
      setBorrador(borradorDe(tecnica));
      setInvalido(false);
    }
  }

  function cambiar(campo: string, valor: string): void {
    const siguiente = { ...borrador, [campo]: valor };
    setBorrador(siguiente);
    const candidata = {
      tipo: tecnica.tipo,
      ...Object.fromEntries(
        Object.entries(siguiente).map(([k, v]) => [k, v === "" ? NaN : Number(v)]),
      ),
    };
    const ok = tecnicaValida(candidata);
    setInvalido(!ok);
    if (ok) {
      setGuardada(JSON.stringify(candidata));
      onCambio(columna, candidata);
    }
  }

  const numeroDe = (campo: "minimo" | "maximo" | "decimales", paso: string) => (
    <label className="text-tinta-suave flex items-center gap-1 text-[0.8125rem]">
      {t(R.etiquetas[campo])}
      <input
        type="number"
        step={paso}
        value={borrador[campo] ?? ""}
        aria-label={t(R[campo], { columna })}
        className={`${CAMPO} w-24`}
        onChange={(e) => cambiar(campo, e.target.value)}
      />
    </label>
  );

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {tecnica.tipo === "perturbar" ? (
          <label className="text-tinta-suave flex items-center gap-1 text-[0.8125rem]">
            {t(R.etiquetas.porcentaje)}
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={borrador.porcentaje ?? ""}
              aria-label={t(R.porcentaje, { columna })}
              className={`${CAMPO} w-20`}
              onChange={(e) => cambiar("porcentaje", e.target.value)}
            />
          </label>
        ) : (
          <label className="text-tinta-suave flex items-center gap-1 text-[0.8125rem]">
            {t(R.etiquetas.epsilon)}
            <select
              value={borrador.epsilon}
              aria-label={t(R.epsilon, { columna })}
              className={CAMPO}
              onChange={(e) => cambiar("epsilon", e.target.value)}
            >
              {EPSILONES.map((e) => (
                <option key={e} value={String(e)}>
                  {epsilon(e, idioma)}
                </option>
              ))}
            </select>
          </label>
        )}
        {tecnica.tipo === "laplace" ? (
          <>
            {numeroDe("minimo", "any")}
            {numeroDe("maximo", "any")}
            {numeroDe("decimales", "1")}
          </>
        ) : null}
      </div>
      {invalido ? (
        <p role="alert" className="text-alerta text-[0.8125rem] leading-relaxed">
          <span aria-hidden="true" className="mr-1 font-semibold">
            ✗
          </span>
          {t(R.invalido)}
        </p>
      ) : null}
      <p className="text-tinta-tenue text-[0.8125rem] leading-relaxed">
        <Rico
          texto={NOTA[tecnica.tipo]}
          datos={
            tecnica.tipo === "perturbar"
              ? { porcentaje: numero(tecnica.porcentaje, idioma) }
              : { epsilon: epsilon(tecnica.epsilon, idioma) }
          }
        />
      </p>
    </div>
  );
}
