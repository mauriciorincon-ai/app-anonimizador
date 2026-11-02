"use client";

// Insignias de categoría y de certeza.
//
// Dos reglas que no son de estilo:
//
//   1. **Color Y texto, siempre los dos.** La categoría jurídica de una columna no puede depender
//      de distinguir un tono de otro (WCAG 1.4.1). El color acelera la lectura; el texto la
//      sostiene.
//   2. **Los cuatro colores de categoría son un sistema cerrado** y no se reasignan nunca. Si
//      mañana el aviso ámbar significara otra cosa en otra pantalla, la tabla dejaría de ser
//      legible de un vistazo, que es su única razón de existir.

import { useT } from "@/components/texto";
import type { CategoriaLey1581, Certeza } from "@/engine/validadores/tipos";
import type { Texto } from "@/lib/idioma";
import { DIAGNOSTICO } from "@/lib/idioma/textos/diagnostico";

const BASE =
  "inline-flex items-center gap-1.5 rounded-2 px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap";

const CATEGORIAS: Record<CategoriaLey1581, { etiqueta: Texto; clase: string }> =
  {
    "identificador-directo": {
      etiqueta: DIAGNOSTICO.insignias.categoria.identificadorDirecto,
      clase: "bg-alerta-tenue text-alerta",
    },
    "cuasi-identificador": {
      etiqueta: DIAGNOSTICO.insignias.categoria.cuasiIdentificador,
      clase: "bg-aviso-tenue text-aviso",
    },
    "dato-sensible": {
      etiqueta: DIAGNOSTICO.insignias.categoria.datoSensible,
      clase: "bg-sensible-tenue text-sensible",
    },
    "no-personal": {
      etiqueta: DIAGNOSTICO.insignias.categoria.noPersonal,
      clase: "bg-papel-hundido text-tinta-tenue",
    },
  };

export function InsigniaDeCategoria({
  categoria,
}: {
  categoria: CategoriaLey1581;
}) {
  const { t } = useT();
  const { etiqueta, clase } = CATEGORIAS[categoria];
  return <span className={`${BASE} ${clase}`}>{t(etiqueta)}</span>;
}

export type NivelDeCerteza = Certeza | "sin-confirmar";

/**
 * El eje de honestidad del producto, en tres niveles. La diferencia entre el primero y el tercero
 * es la diferencia entre "el algoritmo de la DIAN cuadra" y "la columna se llama así".
 */
const CERTEZAS: Record<
  NivelDeCerteza,
  { etiqueta: Texto; explicacion: Texto; clase: string }
> = {
  "algoritmo-oficial": {
    ...DIAGNOSTICO.insignias.certeza.confirmado,
    clase: "text-acento",
  },
  estructural: {
    ...DIAGNOSTICO.insignias.certeza.porSuForma,
    clase: "text-tinta-suave",
  },
  "sin-confirmar": {
    ...DIAGNOSTICO.insignias.certeza.sinConfirmar,
    clase: "text-tinta-tenue",
  },
};

export function InsigniaDeCerteza({ certeza }: { certeza: NivelDeCerteza }) {
  const { t } = useT();
  const { etiqueta, clase } = CERTEZAS[certeza];
  const explicacion = t(CERTEZAS[certeza].explicacion);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[0.75rem] font-medium ${clase}`}
      title={explicacion}
    >
      <span aria-hidden="true" className="text-[0.9em] opacity-70">
        {certeza === "algoritmo-oficial" ? "✓" : "·"}
      </span>
      {t(etiqueta)}
      <span className="sr-only"> — {explicacion}</span>
    </span>
  );
}

export {
  CATEGORIAS as ETIQUETAS_DE_CATEGORIA,
  CERTEZAS as ETIQUETAS_DE_CERTEZA,
};
