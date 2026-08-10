// Los archivos de prueba de los e2e se GENERAN, no se commitean.
//
// Dos razones y las dos son duras: el repo es público y aquí no entra un dato real ni sintético
// disfrazado (todo sale del kit seeded, que es la única fuente autorizada), y un fixture de medio
// millón de filas pesa 130 MB — clonar el repo no puede costar eso.
//
// El generador se invoca como proceso, no como import: es un módulo ESM y este archivo lo carga
// Playwright como CommonJS. Llamarlo por la CLI es además la forma en que lo usa una persona, así
// que el camino queda probado de paso.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DIRECTORIO_DE_FIXTURES = join(process.cwd(), "tmp", "e2e");

/** Cada fixture con su semilla: el mismo archivo, byte por byte, en cada corrida y en cada máquina. */
const FIXTURES = [
  { perfil: "clinico", filas: 2_000, seed: 42 },
  { perfil: "sin-personales", filas: 800, seed: 42 },
];

export function nombreDeFixture(perfil: string, filas: number, seed: number) {
  return join(DIRECTORIO_DE_FIXTURES, `${perfil}-${filas}-s${seed}.csv`);
}

export default function generarFixtures(): void {
  mkdirSync(DIRECTORIO_DE_FIXTURES, { recursive: true });

  for (const { perfil, filas, seed } of FIXTURES) {
    execFileSync(
      "node",
      [
        join(process.cwd(), "docs", "kit-de-prueba", "generador.mjs"),
        "--filas",
        String(filas),
        "--seed",
        String(seed),
        "--perfil",
        perfil,
        "--formato",
        "csv",
        "--salida",
        nombreDeFixture(perfil, filas, seed),
      ],
      { stdio: "ignore" },
    );
  }

  // Un archivo que Velo no lee, para el estado de error de formato.
  writeFileSync(
    join(DIRECTORIO_DE_FIXTURES, "notas.txt"),
    "Esto no es una tabla.\n",
    "utf8",
  );
}
