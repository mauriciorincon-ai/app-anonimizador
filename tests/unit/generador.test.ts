// Tests de regresión del generador del kit en sus formatos de siempre (CSV y Excel).
//
// Añadir JSON al generador (S6) tocó un archivo del que cuelgan todos los fixtures de Velo. Estos
// hashes se calcularon ANTES del cambio, con el generador del S5: si algún byte de un CSV cambia
// para las mismas banderas, cambian también los fixtures de los e2e y el determinismo de medio
// repositorio, y este test lo dice con el nombre del perfil que se movió.
//
// Si un cambio de producto exige a propósito un CSV distinto, se recalculan aquí los hashes y el
// cierre del sprint lo declara: nunca se ajustan para «que pase».

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  generar,
  generarCsv,
  generarFilas,
  generarXlsx,
} from "../../docs/kit-de-prueba/generador.mjs";

const BASE = { seed: 42, tasaInvalida: 0.08, tasaVacia: 0.03 } as const;

/** sha-256 del CSV, 300 filas, semilla 42, tasas por omisión — tomados con el generador del S5. */
const CSV_DE_ORO: Record<string, string> = {
  clinico: "81ac4d43106c4ffbf1e74cb44238c1e73b339d9b40d3ff8221584be80d11028d",
  limpio: "c97daf7be5d795decb90131104939b296e92a2cfcae0f3754893d6d6a269c916",
  trampas: "0de191861c1d383a611a451efc9ca6eb404979a099f6d17fee7d10ae50f4b380",
  "mediana-repetida":
    "2309d4e7d1bb1244e7d3769e99ef95e449384741cbc02f07bb3aa23dee636070",
  "colisiones-de-formato":
    "0294353378a1268f04f47636a33267040cab1aa0d089973d87fe915bfcc98d77",
  "sin-personales":
    "98c83321587efdd5826a4d3196e5a2847e6dbf12891056e45ea6db376c33981c",
};

/** Otra semilla y otras tasas: protege el camino de los tres sorteos por celda. */
const CSV_DE_ORO_OTRA_SEMILLA =
  "fe98fb2d95e1e6502cb806455ecda6d4cbb39de2ed7ea966b478aab9b17cea6d";

let carpeta = "";
let contador = 0;

beforeAll(() => {
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  carpeta = mkdtempSync(join(process.cwd(), "tmp", "generador-"));
});

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

const archivo = (extension: string) =>
  join(carpeta, `kit-${contador++}.${extension}`);

describe.each(Object.entries(CSV_DE_ORO))(
  "el CSV del perfil %s",
  (perfil, esperado) => {
    it("sigue siendo byte-idéntico al del S5 para las mismas banderas", async () => {
      const salida = archivo("csv");
      const { sha256 } = await generarCsv({
        ...BASE,
        perfil,
        filas: 300,
        salida,
      });
      expect(sha256).toBe(esperado);
      expect(
        createHash("sha256").update(readFileSync(salida)).digest("hex"),
      ).toBe(esperado);
    });

    it("la puerta única (`generar`) escribe exactamente lo mismo que `generarCsv`", async () => {
      const { sha256 } = await generar({
        ...BASE,
        perfil,
        filas: 300,
        formato: "csv",
        salida: archivo("csv"),
      });
      expect(sha256).toBe(esperado);
    });
  },
);

describe("el CSV con otra semilla y otras tasas", () => {
  it("sigue siendo byte-idéntico al del S5", async () => {
    const { sha256 } = await generarCsv({
      seed: 7,
      tasaInvalida: 0.2,
      tasaVacia: 0.1,
      perfil: "clinico",
      filas: 300,
      salida: archivo("csv"),
    });
    expect(sha256).toBe(CSV_DE_ORO_OTRA_SEMILLA);
  });
});

describe("el Excel", () => {
  it("lleva las mismas filas que `generarFilas`, celda por celda", async () => {
    const opciones = { ...BASE, perfil: "clinico", filas: 100 };
    const salida = archivo("xlsx");
    const { sha256, columnas } = await generarXlsx({ ...opciones, salida });
    expect(sha256).toBeNull();
    const esperado = [...generarFilas(opciones)] as string[][];
    expect(columnas).toEqual(esperado[0]);

    const libro = XLSX.read(readFileSync(salida));
    expect(libro.SheetNames).toEqual(["datos"]);
    const leido = XLSX.utils.sheet_to_json<string[]>(libro.Sheets.datos, {
      header: 1,
      raw: true,
      defval: "",
    });
    expect(leido).toEqual(esperado);
  });

  it("la puerta única reparte a Excel por el formato", async () => {
    const salida = archivo("xlsx");
    const { columnas } = await generar({
      ...BASE,
      perfil: "limpio",
      filas: 20,
      formato: "xlsx",
      salida,
    });
    expect(columnas).toEqual([
      "sucursal",
      "monto",
      "fecha_atencion",
      "estrato",
    ]);
    const libro = XLSX.read(readFileSync(salida));
    expect(
      XLSX.utils.sheet_to_json(libro.Sheets.datos, { header: 1 }),
    ).toHaveLength(21);
  });
});
