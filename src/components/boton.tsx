// Botón canon de Velo. Dos variantes y ni una más: una sola acción principal por pantalla, y lo
// demás con borde. El acento se gasta con avaricia (design-system.md § 2.1).

import type { ButtonHTMLAttributes } from "react";

export type VarianteDeBoton = "principal" | "discreto";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-1 px-5 py-2.5 text-[0.9375rem] " +
  "font-medium transition-colors duration-[var(--mov-1)] ease-[var(--curva)] " +
  "disabled:cursor-not-allowed disabled:opacity-55";

const VARIANTES: Record<VarianteDeBoton, string> = {
  principal:
    "bg-acento text-papel hover:bg-acento/90 disabled:hover:bg-acento shadow-1",
  discreto:
    "border border-borde-control text-tinta hover:bg-papel-hundido disabled:hover:bg-transparent",
};

/** Clases del botón, para reutilizarlas en un enlace que debe verse como acción. */
export function clasesDeBoton(variante: VarianteDeBoton = "principal"): string {
  return `${BASE} ${VARIANTES[variante]}`;
}

export function Boton({
  variante = "principal",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteDeBoton }) {
  return (
    <button
      {...props}
      className={`${clasesDeBoton(variante)} ${className}`.trim()}
    />
  );
}
