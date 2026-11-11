// S13 — la sal pegada en la web. Una sal que el usuario trae de otro mes tiene que dar la MISMA
// llave que la de Velo local con `--sal`: mismo validador, misma derivación, misma huella.

import { describe, expect, it } from "vitest";

import {
  derivarLlave,
  generarSal,
  normalizarSal,
  SAL_VALIDA,
} from "@/lib/llave";

import { llaveDelProyecto } from "../../velo-local/nucleo";

const FRASE = "dos toros y una brújula";
const SAL = "00112233445566778899aabbccddeeff";

describe("la forma de una sal", () => {
  it("acepta 32 hexadecimales en minúscula, y la que genera Velo lo cumple", () => {
    expect(SAL_VALIDA.test(SAL)).toBe(true);
    for (let i = 0; i < 20; i++)
      expect(SAL_VALIDA.test(generarSal())).toBe(true);
  });

  it.each([
    ["vacía", ""],
    ["31 caracteres", SAL.slice(1)],
    ["33 caracteres", `${SAL}0`],
    ["no hexadecimal", `${SAL.slice(0, 31)}g`],
    ["con espacio en medio", `${SAL.slice(0, 10)} ${SAL.slice(10)}`],
    ["con prefijo 0x", `0x${SAL.slice(2)}`],
    ["con salto de línea en medio", `${SAL.slice(0, 16)}\n${SAL.slice(16)}`],
  ])("rechaza una sal %s", (_, mala) => {
    expect(SAL_VALIDA.test(normalizarSal(mala))).toBe(false);
  });

  it("normaliza espacios de los extremos y mayúsculas, y nada más", () => {
    expect(normalizarSal(`\n ${SAL.toUpperCase()}\t`)).toBe(SAL);
    expect(SAL_VALIDA.test(normalizarSal(` ${SAL.toUpperCase()} `))).toBe(true);
  });
});

describe("misma frase + misma sal ⇒ la misma llave", () => {
  it("la huella se repite con la misma sal y cambia con otra", async () => {
    const [a, b, otra] = await Promise.all([
      derivarLlave(FRASE, SAL),
      derivarLlave(FRASE, SAL),
      derivarLlave(FRASE, "ffeeddccbbaa99887766554433221100"),
    ]);
    expect(a.huella).toBe(b.huella);
    expect(a.sal).toBe(SAL);
    expect(otra.huella).not.toBe(a.huella);
    // Y otra frase con la misma sal tampoco coincide: la sal sola no es la llave.
    const deOtraFrase = await derivarLlave("otra frase igual de larga", SAL);
    expect(deOtraFrase.huella).not.toBe(a.huella);
  });

  it("Velo local con --sal da la misma huella que la web con la sal pegada", async () => {
    const web = await derivarLlave(FRASE, SAL);
    const local = await llaveDelProyecto(FRASE, SAL);
    expect(local.huella).toBe(web.huella);
    // Con la sal en mayúscula y con espacios, igual: el mismo validador y la misma normalización.
    const sucia = await llaveDelProyecto(FRASE, ` ${SAL.toUpperCase()} `);
    expect(sucia.huella).toBe(web.huella);
  });

  it("Velo local rechaza la misma sal mala que la web", async () => {
    for (const mala of ["", SAL.slice(1), `${SAL}0`, `${SAL.slice(0, 31)}g`])
      await expect(llaveDelProyecto(FRASE, mala)).rejects.toMatchObject({
        clave: "salInvalida",
      });
  });
});
