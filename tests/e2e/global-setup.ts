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

import { anadirEntrada, bitacoraVacia } from "@/engine/bitacora";
import { sellarBitacora } from "@/lib/bitacora-archivo";

export const DIRECTORIO_DE_FIXTURES = join(process.cwd(), "tmp", "e2e");

/**
 * Cuántas entradas lleva la bitácora grande, y por qué esa cifra.
 *
 * Una entrada es un tratamiento. Alguien que anonimice a diario durante cuatro años llega a unas
 * mil; dos mil es el doble de un uso intenso sostenido, que es donde conviene medir. No es un
 * número redondo elegido por bonito: es «el doble del techo realista», declarado.
 */
export const ENTRADAS_DE_LA_BITACORA_GRANDE = 2_000;

export const FRASE_DE_LA_BITACORA_GRANDE = "una frase larga de medicion";

export const BITACORA_GRANDE = join(
  DIRECTORIO_DE_FIXTURES,
  "bitacora-grande.velolog",
);

/** Cada fixture con su semilla: el mismo archivo, byte por byte, en cada corrida y en cada máquina. */
const FIXTURES = [
  { perfil: "clinico", filas: 2_000, seed: 42, formato: "csv" },
  { perfil: "sin-personales", filas: 800, seed: 42, formato: "csv" },
  // Excel de verdad, para probar la otra vía de lectura de punta a punta.
  { perfil: "clinico", filas: 1_000, seed: 42, formato: "xlsx" },
  // El grande: 500.000 × 24 ≈ 130 MB. No se commitea (el repo es público y clonarlo no puede
  // costar eso); se regenera con su semilla en cada corrida, en unos dos segundos.
  { perfil: "clinico", filas: 500_000, seed: 42, formato: "csv" },
];

export function nombreDeFixture(
  perfil: string,
  filas: number,
  seed: number,
  formato = "csv",
) {
  return join(DIRECTORIO_DE_FIXTURES, `${perfil}-${filas}-s${seed}.${formato}`);
}

export default async function generarFixtures(): Promise<void> {
  mkdirSync(DIRECTORIO_DE_FIXTURES, { recursive: true });

  for (const { perfil, filas, seed, formato } of FIXTURES) {
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
        formato,
        "--salida",
        nombreDeFixture(perfil, filas, seed, formato),
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

  // La bitácora grande, para medir qué pasa cuando crece. Se SELLA con el mismo código del
  // producto —no con una imitación— porque lo que se mide es abrir un archivo real. Los nombres
  // son inventados y las cifras deterministas: aquí no entra un dato real, como en todo lo demás.
  let bitacora = bitacoraVacia();
  for (let i = 0; i < ENTRADAS_DE_LA_BITACORA_GRANDE; i++) {
    bitacora = anadirEntrada(bitacora, {
      fecha: `13 de agosto de 2026, ${String(i % 24).padStart(2, "0")}:00`,
      archivo: `estudio-${String(i).padStart(5, "0")}.csv`,
      hashDePolitica: (i % 7).toString(16).repeat(64).slice(0, 64),
      tecnicas: i % 2 === 0 ? ["enmascarar"] : ["seudonimizar", "suprimir"],
      filas: 1_000 + i,
      unicosAntes: 0.3,
      unicosDespues: 0.02,
      esTitular: i % 3 !== 0,
      huellaDeEntrada: (i % 9).toString(16).repeat(64).slice(0, 64),
      huellaDeSalida: (i % 11).toString(16).repeat(64).slice(0, 64),
    });
  }
  writeFileSync(
    BITACORA_GRANDE,
    await sellarBitacora(bitacora, FRASE_DE_LA_BITACORA_GRANDE),
  );
}
