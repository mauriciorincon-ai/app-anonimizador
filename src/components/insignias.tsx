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

import type { CategoriaLey1581, Certeza } from "@/engine/validadores/tipos";

const BASE =
  "inline-flex items-center gap-1.5 rounded-2 px-2 py-0.5 text-[0.75rem] font-medium whitespace-nowrap";

const CATEGORIAS: Record<
  CategoriaLey1581,
  { etiqueta: string; clase: string }
> = {
  "identificador-directo": {
    etiqueta: "Identificador directo",
    clase: "bg-alerta-tenue text-alerta",
  },
  "cuasi-identificador": {
    etiqueta: "Cuasi-identificador",
    clase: "bg-aviso-tenue text-aviso",
  },
  "dato-sensible": {
    etiqueta: "Dato sensible · art. 5",
    clase: "bg-sensible-tenue text-sensible",
  },
  "no-personal": {
    etiqueta: "No personal",
    clase: "bg-papel-hundido text-tinta-tenue",
  },
};

export function InsigniaDeCategoria({
  categoria,
}: {
  categoria: CategoriaLey1581;
}) {
  const { etiqueta, clase } = CATEGORIAS[categoria];
  return <span className={`${BASE} ${clase}`}>{etiqueta}</span>;
}

export type NivelDeCerteza = Certeza | "sin-confirmar";

/**
 * El eje de honestidad del producto, en tres niveles. La diferencia entre el primero y el tercero
 * es la diferencia entre "el algoritmo de la DIAN cuadra" y "la columna se llama así".
 */
const CERTEZAS: Record<
  NivelDeCerteza,
  { etiqueta: string; explicacion: string; clase: string }
> = {
  "algoritmo-oficial": {
    etiqueta: "Confirmado",
    explicacion:
      "El algoritmo oficial del dato (dígito de verificación) se recalculó y cuadra.",
    clase: "text-acento",
  },
  estructural: {
    etiqueta: "Por su forma",
    explicacion:
      "No existe un dígito de verificación público para este dato: solo se pudo comprobar la forma.",
    clase: "text-tinta-suave",
  },
  "sin-confirmar": {
    etiqueta: "Sin confirmar",
    explicacion:
      "La conclusión se apoya en el nombre de la columna, no en los valores. Ningún cálculo puede confirmarla.",
    clase: "text-tinta-tenue",
  },
};

export function InsigniaDeCerteza({ certeza }: { certeza: NivelDeCerteza }) {
  const { etiqueta, explicacion, clase } = CERTEZAS[certeza];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[0.75rem] font-medium ${clase}`}
      title={explicacion}
    >
      <span aria-hidden="true" className="text-[0.9em] opacity-70">
        {certeza === "algoritmo-oficial" ? "✓" : "·"}
      </span>
      {etiqueta}
      <span className="sr-only"> — {explicacion}</span>
    </span>
  );
}

export {
  CATEGORIAS as ETIQUETAS_DE_CATEGORIA,
  CERTEZAS as ETIQUETAS_DE_CERTEZA,
};
