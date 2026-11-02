"use client";

// El conmutador de idioma — dos botones en el encabezado.
//
// Reglas de diseño (design-system.md): el color nunca va solo. El idioma activo se marca con tres
// señales a la vez: subrayado, peso de letra y `aria-pressed`. Cada botón lleva su propio `lang`,
// para que un lector de pantalla pronuncie «English» en inglés aunque la página esté en español.
// Se maneja con el teclado como cualquier botón (Tab, Enter, Espacio).

import { IDIOMAS, NOMBRE_PROPIO } from "@/lib/idioma";
import { elegirIdioma } from "@/lib/idioma/estado";
import { COMUN } from "@/lib/idioma/textos/comun";

import { useT } from "./texto";

export function ConmutadorDeIdioma() {
  const { idioma, t } = useT();

  return (
    <div
      role="group"
      aria-label={t(COMUN.conmutador.grupo)}
      className="flex items-center gap-1"
    >
      {IDIOMAS.map((candidato, i) => {
        const activo = candidato === idioma;
        return (
          <span key={candidato} className="flex items-center gap-1">
            {i > 0 ? (
              <span aria-hidden="true" className="text-tinta-tenue">
                ·
              </span>
            ) : null}
            <button
              type="button"
              lang={candidato}
              aria-pressed={activo}
              aria-label={NOMBRE_PROPIO[candidato]}
              onClick={() => elegirIdioma(candidato)}
              className={`rounded-1 focus-visible:outline-acento min-h-8 min-w-8 px-1.5 text-[0.8125rem] tracking-wide underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                activo
                  ? "text-tinta font-semibold underline decoration-2"
                  : "text-tinta-suave hover:text-tinta font-normal no-underline"
              }`}
            >
              {candidato.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}
