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
  ]),
]);

export default eslintConfig;
