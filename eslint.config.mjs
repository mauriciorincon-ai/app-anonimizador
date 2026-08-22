import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Salidas generadas (gitignored, pero eslint no lee .gitignore): el reporte HTML de cobertura
    // trae JS de terceros y los datasets sintéticos no son código de la app.
    "coverage/**",
    "tmp/**",
    // El andamiaje de /design-sync: la herramienta y el bundle que produce. Ninguno es código
    // de la app y el bundle trae React empaquetado, que solo por sí mismo dispara catorce
    // errores de reglas de hooks y deja `pnpm lint` inservible en local. En la CI no aparecía
    // porque están gitignorados y el runner arranca de un checkout limpio.
    ".ds-sync/**",
    "ds-bundle/**",
    // El brochure copiado a public/ es un artefacto de build; el canónico vive en docs/.
    "public/conoce.html",
  ]),
]);

export default eslintConfig;
