// Setup global de Vitest (referenciado por vitest.config.ts).
// Matchers de Testing Library (toBeInTheDocument, toHaveAccessibleName, ...).
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { fijarIdioma } from "@/lib/idioma/estado";

// La limpieza automática de Testing Library solo se registra sola cuando Vitest corre con
// `globals: true`. Aquí no, así que se registra a mano: sin esto, cada test hereda el DOM del
// anterior y las consultas empiezan a encontrar dos de cada cosa.
afterEach(cleanup);

// Las pruebas leen el texto en español, que es el idioma en que nació la interfaz. Sin esto el
// idioma saldría del navegador de jsdom, que dice `en-US`, y cada prueba que busca una frase
// tendría que saber en qué idioma se levantó. Las pruebas del conmutador lo cambian a propósito.
beforeEach(() => {
  fijarIdioma("es");
});
