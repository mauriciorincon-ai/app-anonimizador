// El seguro de «nunca igual a la entrada» (S8, ADR-016). Con 10⁻⁸ de probabilidad por valor, ningún
// sorteo real lo ejercita, y una garantía que nunca se ejecuta es una esperanza: aquí el constructor
// se sustituye para que el PRIMER candidato sea el propio dato, y se comprueba que el seudónimo se
// vuelve a sortear y sale distinto, sin dejar de depender solo del valor y la llave.

import { beforeAll, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  llamadas: 0,
  siempre: false,
  objetivo: null as string | null,
  /** Lo que devuelve el primer sorteo del objetivo; sin él, la entrada tal cual. */
  primerCandidato: null as string | null,
  vistos: new Set<string>(),
}));

/** Deja el simulacro como nuevo: sin cuenta, sin objetivo y sin valores ya vistos. */
function reiniciar(objetivo: string | null, siempre = false): void {
  control.llamadas = 0;
  control.siempre = siempre;
  control.objetivo = objetivo;
  control.primerCandidato = null;
  control.vistos = new Set();
}

vi.mock("@/engine/tecnicas/formato-europeo", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/engine/tecnicas/formato-europeo")>();
  return {
    ...real,
    construirEuropeo: (
      formato: Parameters<typeof real.construirEuropeo>[0],
      entrada: string,
      simbolos: Parameters<typeof real.construirEuropeo>[2],
    ) => {
      control.llamadas++;
      // El primer candidato del valor objetivo es el dato mismo; con `siempre`, todos lo son.
      const primero =
        entrada === control.objetivo && !control.vistos.has(entrada);
      control.vistos.add(entrada);
      if (control.siempre) return entrada;
      return primero
        ? (control.primerCandidato ?? entrada)
        : real.construirEuropeo(formato, entrada, simbolos);
    },
  };
});

import { seudonimizarConFormato } from "@/engine/tecnicas/seudonimo";
import { cumpleDni, sinSeparadores } from "@/engine/validadores/europeos";

let llave: CryptoKey;
beforeAll(async () => {
  llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("llave-del-proyecto-a".padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
});

describe("un seudónimo europeo que saldría igual a su entrada se sortea de nuevo", () => {
  it("el primer candidato igual al dato se descarta y el seudónimo sale distinto y válido", async () => {
    const entrada = "12345678Z";
    reiniciar(entrada);
    const r = await seudonimizarConFormato([entrada], llave, "dni");
    expect(control.llamadas).toBe(2);
    expect(r.valores[0]).not.toBe(entrada);
    expect(cumpleDni(r.valores[0])).toBe(true);
  });

  it("igual «sin contar separadores ni mayúsculas» también cuenta como igual", async () => {
    // La entrada trae puntos, guion y minúscula; el primer candidato es el mismo documento en su
    // forma compacta. Para quien lo lee sigue siendo el dato original.
    const entrada = "12.345.678-z";
    reiniciar(entrada);
    control.primerCandidato = "12345678Z";
    const r = await seudonimizarConFormato([entrada], llave, "dni");
    expect(control.llamadas).toBe(2);
    expect(sinSeparadores(r.valores[0])).not.toBe(sinSeparadores(entrada));
    expect(cumpleDni(r.valores[0])).toBe(true);
  });

  it("el segundo intento depende solo del valor: igual solo que entre otros", async () => {
    const entrada = "12345678Z";
    reiniciar(entrada);
    const solo = await seudonimizarConFormato([entrada], llave, "dni");
    reiniciar(entrada);
    const acompanado = await seudonimizarConFormato(
      ["otra-entrada", entrada, "y-otra-mas"],
      llave,
      "dni",
    );
    expect(acompanado.valores[1]).toBe(solo.valores[0]);
    expect(acompanado.valores[1]).not.toBe(entrada);
  });

  it("si todos los intentos coinciden con la entrada, falla fuerte en vez de entregar el dato", async () => {
    reiniciar(null, true);
    await expect(
      seudonimizarConFormato(["12345678Z"], llave, "dni"),
    ).rejects.toThrow(/coincidió con la entrada/);
    expect(control.llamadas).toBe(8);
    reiniciar(null);
  });
});
