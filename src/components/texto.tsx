"use client";

// El texto de la interfaz, en el idioma que corresponde.
//
// Dos maneras de pedirlo, según lo que necesite quien lo pide:
//
//   · `<Rico texto={…} datos={…} />` — para un párrafo. Respeta el énfasis del catálogo
//     (`**negrita**` y `` `código` ``) y devuelve nodos de React.
//   · `const { t, m } = useT()` — para texto llano: atributos (`aria-label`, `title`), valores que
//     se concatenan, comparaciones. `t` toma un `Texto`; `m` toma un `Mensaje` que vino del motor.
//
// Ningún componente escribe una frase suya: las frases viven en `src/lib/idioma/textos/`.
// `tests/unit/idioma-barrido.test.ts` falla si aparece una.

import { Fragment, type ReactNode } from "react";

import {
  armar,
  decir,
  type Datos,
  type Idioma,
  type Texto,
  type Tramo,
} from "@/lib/idioma";
import { useIdioma } from "@/lib/idioma/estado";
import {
  armarMensaje,
  decirMensaje,
  type MensajeDeMotor,
} from "@/lib/idioma/mensajes";

/** El énfasis de un texto ya interpolado, como nodos. */
export function conEnfasis(tramos: readonly Tramo[]): ReactNode {
  return tramos.map((tramo, i) => {
    if (tramo.tipo === "negrita")
      return (
        <strong key={i} className="font-medium">
          {tramo.texto}
        </strong>
      );
    if (tramo.tipo === "alerta")
      return (
        <strong key={i} className="text-alerta font-medium">
          {tramo.texto}
        </strong>
      );
    if (tramo.tipo === "codigo")
      return (
        <code key={i} className="font-mono text-[0.8125rem]">
          {tramo.texto}
        </code>
      );
    return <Fragment key={i}>{tramo.texto}</Fragment>;
  });
}

export function Rico({ texto, datos }: { texto: Texto; datos?: Datos }) {
  const idioma = useIdioma();
  return <>{conEnfasis(armar(texto[idioma], idioma, datos))}</>;
}

/** Un mensaje que vino del motor o del worker, con su énfasis. */
export function RicoMensaje({ mensaje }: { mensaje: MensajeDeMotor }) {
  const idioma = useIdioma();
  return <>{conEnfasis(armarMensaje(mensaje, idioma))}</>;
}

export interface Dice {
  readonly idioma: Idioma;
  /** Texto llano (sin énfasis) de un `Texto` del catálogo. */
  t(texto: Texto, datos?: Datos): string;
  /** Texto llano de un `Mensaje` del motor. */
  m(mensaje: MensajeDeMotor): string;
}

export function useT(): Dice {
  const idioma = useIdioma();
  return {
    idioma,
    t: (texto, datos) => decir(texto, idioma, datos),
    m: (mensaje) => decirMensaje(mensaje, idioma),
  };
}
