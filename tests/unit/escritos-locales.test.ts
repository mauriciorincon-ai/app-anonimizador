// Lo que Velo local deja en el disco cuando una corrida no termina (S10, deuda M1 y M3 del S9).
//
// Las frases se piden ANTES del primer byte: sin la frase de la bóveda, o con la de una bitácora que
// no abre, no queda un anonimizado ni un certificado en la carpeta. Y la bitácora se deshace: si algo
// falla después de anotar, vuelve a ser la que era (o desaparece, si la corrida la creó).

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EntradaDeBitacora } from "@/engine/bitacora";
import { exportarPolitica, type Politica } from "@/engine/politica";
import { abrirBitacora } from "@/lib/bitacora-archivo";

import { principal, type Consola } from "../../velo-local/cli";
import { abrirBitacoraPara } from "../../velo-local/comun";

const CSV =
  "id,correo\n1,ana@ejemplo.co\n2,beto@ejemplo.co\n3,caro@ejemplo.co\n";
const REVERSIBLE: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [
    {
      columna: "correo",
      tecnica: { tipo: "seudonimizar", longitud: 16, reversible: true },
    },
  ],
};
const FRASE = "la frase del proyecto de esta prueba";
const FRASE_DE_BITACORA = "la frase de la bitacora de esta prueba";
const SAL = "00112233445566778899aabbccddeeff";
const ENTRADA: EntradaDeBitacora = {
  fecha: "2026-11-08",
  archivo: "a.csv",
  hashDePolitica: "0".repeat(64),
  tecnicas: ["seudonimizar"],
  filas: 3,
  unicosAntes: 1,
  unicosDespues: 0,
  esTitular: false,
  huellaDeEntrada: "1".repeat(64),
  huellaDeSalida: "2".repeat(64),
};

let carpeta: string;
const registro: string[] = [];
const consola: Consola = {
  salida: (l) => void registro.push(l),
  aviso: (l) => void registro.push(l),
};

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), "velo-escritos-"));
  writeFileSync(join(carpeta, "a.csv"), CSV);
  writeFileSync(join(carpeta, "p.json"), exportarPolitica(REVERSIBLE));
  registro.length = 0;
});

afterEach(() => {
  rmSync(carpeta, { recursive: true, force: true });
  // `stubEnv` devuelve cada variable a lo que valía antes (también si el terminal ya la traía).
  vi.unstubAllEnvs();
});

const anonimizar = (...extra: string[]) =>
  principal(
    [
      "anonimizar",
      join(carpeta, "a.csv"),
      "--politica",
      join(carpeta, "p.json"),
    ]
      .concat(["--sal", SAL, "--salida", carpeta])
      .concat(extra),
    consola,
    () => new Date("2026-11-08T12:00:00Z"),
  );

describe("pnpm velo anonimizar, cuando falta una frase", () => {
  it("sin la frase de la bóveda (y sin consola) no escribe nada", async () => {
    vi.stubEnv("VELO_FRASE", FRASE);
    expect(await anonimizar()).toBe(1);
    expect(registro.join("\n")).toContain("VELO_FRASE_BOVEDA");
    expect(readdirSync(carpeta).sort()).toEqual(["a.csv", "p.json"]);
  });

  it("con la frase equivocada de una bitácora que ya existe, tampoco, y la bitácora queda igual", async () => {
    vi.stubEnv("VELO_FRASE", FRASE);
    vi.stubEnv("VELO_FRASE_BOVEDA", "la frase de la boveda de esta prueba");
    vi.stubEnv("VELO_FRASE_BITACORA", FRASE_DE_BITACORA);
    const ruta = join(carpeta, "b.velolog");
    expect(await anonimizar("--bitacora", ruta)).toBe(0);
    const antes = readFileSync(ruta);
    const archivos = readdirSync(carpeta).sort();
    for (const a of archivos)
      if (!["a.csv", "p.json", "b.velolog"].includes(a))
        rmSync(join(carpeta, a));

    vi.stubEnv("VELO_FRASE_BITACORA", "otra frase que no abre la bitacora");
    expect(await anonimizar("--bitacora", ruta)).toBe(1);
    expect(readdirSync(carpeta).sort()).toEqual([
      "a.csv",
      "b.velolog",
      "p.json",
    ]);
    expect(readFileSync(ruta).equals(antes)).toBe(true);
  });
});

describe("pnpm velo, con una carpeta de salida que no existe", () => {
  it("lo dice con palabras, antes de pedir la frase y sin escribir nada", async () => {
    const ausente = join(carpeta, "no-existe");
    const orden = [
      "anonimizar",
      join(carpeta, "a.csv"),
      "--politica",
      join(carpeta, "p.json"),
      "--salida",
      ausente,
    ];
    expect(await principal(orden, consola, () => new Date())).toBe(1);
    const dicho = registro.join("\n");
    expect(dicho).toContain("--salida");
    expect(dicho).not.toContain("velo: Error");
    expect(dicho).not.toContain("VELO_FRASE");
    expect(existsSync(ausente)).toBe(false);
  });
});

describe("la bitácora se deshace", () => {
  it("una bitácora nueva que se anota y se deshace desaparece", async () => {
    vi.stubEnv("VELO_FRASE_BITACORA", FRASE_DE_BITACORA);
    const ruta = join(carpeta, "nueva.velolog");
    const bitacora = await abrirBitacoraPara(ruta, "es");
    await bitacora.anotar(ENTRADA);
    expect(existsSync(ruta)).toBe(true);
    await bitacora.deshacer();
    expect(existsSync(ruta)).toBe(false);
  });

  it("una que ya existía vuelve a sus bytes de antes, y sigue abriendo", async () => {
    vi.stubEnv("VELO_FRASE_BITACORA", FRASE_DE_BITACORA);
    const ruta = join(carpeta, "vieja.velolog");
    const primera = await abrirBitacoraPara(ruta, "es");
    await primera.anotar(ENTRADA);
    const antes = readFileSync(ruta);

    const segunda = await abrirBitacoraPara(ruta, "es");
    await segunda.anotar(ENTRADA);
    expect(readFileSync(ruta).equals(antes)).toBe(false);
    await segunda.deshacer();
    expect(readFileSync(ruta).equals(antes)).toBe(true);
    const abierta = await abrirBitacora(
      new Uint8Array(readFileSync(ruta)),
      FRASE_DE_BITACORA,
    );
    expect(abierta.ok && abierta.bitacora.entradas.length).toBe(1);
    // Ningún temporal queda al lado.
    expect(readdirSync(carpeta).filter((a) => a.includes(".nueva"))).toEqual(
      [],
    );
  });

  it("deshacer sin haber anotado no toca nada", async () => {
    vi.stubEnv("VELO_FRASE_BITACORA", FRASE_DE_BITACORA);
    const ruta = join(carpeta, "intacta.velolog");
    const primera = await abrirBitacoraPara(ruta, "es");
    await primera.anotar(ENTRADA);
    const antes = readFileSync(ruta);
    await (await abrirBitacoraPara(ruta, "es")).deshacer();
    expect(readFileSync(ruta).equals(antes)).toBe(true);
  });
});
