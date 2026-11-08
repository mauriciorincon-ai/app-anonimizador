import path from "node:path";
import { defineConfig } from "vitest/config";

// El job `puente` de la CI (S9, ADR-017): las mismas operaciones del puente contra PostgreSQL y SQL
// Server de verdad, en contenedor. Aparte de `vitest.config.ts` a propósito: estas pruebas necesitan
// servicios que `pnpm test` no tiene, y un `skipped` no es un verde (regla 15).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/puente/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
