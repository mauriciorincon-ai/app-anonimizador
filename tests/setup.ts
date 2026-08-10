// Setup global de Vitest (referenciado por vitest.config.ts).
// Matchers de Testing Library (toBeInTheDocument, toHaveAccessibleName, ...).
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// La limpieza automática de Testing Library solo se registra sola cuando Vitest corre con
// `globals: true`. Aquí no, así que se registra a mano: sin esto, cada test hereda el DOM del
// anterior y las consultas empiezan a encontrar dos de cada cosa.
afterEach(cleanup);
