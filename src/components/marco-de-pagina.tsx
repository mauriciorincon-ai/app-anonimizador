"use client";

// Las piezas del marco de la página que dicen algo: el salto al contenido, el pie y el
// sincronizador del idioma con el documento. El encabezado y el `<html>` viven en `layout.tsx`
// (servidor); estas son las partes que necesitan saber en qué idioma se está leyendo.

import { useEffect } from "react";

import { decir, LOCALE } from "@/lib/idioma";
import { useIdioma } from "@/lib/idioma/estado";
import { COMUN } from "@/lib/idioma/textos/comun";

import { Rico, useT } from "./texto";

export function EnlaceDeSalto() {
  const { t } = useT();
  return (
    <a
      href="#contenido"
      className="bg-acento text-papel focus:rounded-1 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-20 focus:px-4 focus:py-2"
    >
      {t(COMUN.saltar)}
    </a>
  );
}

export function Pie() {
  return (
    <footer className="border-borde text-tinta-tenue mt-16 border-t">
      <div className="mx-auto w-full max-w-4xl px-6 py-6 text-[0.8125rem] leading-relaxed">
        <p className="text-tinta-suave font-medium">
          <Rico texto={COMUN.pie.lema} />
        </p>
        <p className="mt-1">
          <Rico texto={COMUN.pie.honestidad} />
        </p>
      </div>
    </footer>
  );
}

/**
 * Mantiene al día lo que el servidor escribió en español: el `lang` del `<html>`, el título de la
 * pestaña y la descripción. No dibuja nada. El `lang` sigue al idioma para que los lectores de
 * pantalla, el corrector del navegador y la traducción automática no contradigan lo que se lee.
 */
export function IdiomaDelDocumento() {
  const idioma = useIdioma();
  useEffect(() => {
    const titulo = decir(COMUN.documento.titulo, idioma);
    document.documentElement.lang = LOCALE[idioma];
    document.title = titulo;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", decir(COMUN.documento.descripcion, idioma));
    // Al navegar del lado del cliente, Next vuelve a escribir el título que el servidor dejó en
    // español, después de este efecto: se vigila el `<title>` y se repone el del idioma activo.
    const vigilante = new MutationObserver(() => {
      if (document.title !== titulo) document.title = titulo;
    });
    vigilante.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => vigilante.disconnect();
  }, [idioma]);

  return null;
}
