import { describe, expect, it } from "vitest";

import {
  bytes,
  deCada,
  milisegundos,
  numero,
  porcentaje,
  unoEn,
} from "@/lib/formato";

describe("números en convención colombiana", () => {
  it("usa el punto para los miles", () => {
    expect(numero(1_234_567)).toBe("1.234.567");
    expect(numero(0)).toBe("0");
  });

  it("no deja que un riesgo pequeño se redondee a cero", () => {
    // Un 0,04 % redondeado a "0 %" convertiría un riesgo real en un cero tranquilizador. Por
    // debajo del 10 % el porcentaje conserva un decimal justamente para que eso no pase.
    expect(porcentaje(0.0004)).toBe("0,0 %");
    expect(porcentaje(0.042)).toBe("4,2 %");
    expect(porcentaje(0.5)).toBe("50 %");
    expect(porcentaje(1)).toBe("100 %");
  });

  it("pega el denominador a la cifra", () => {
    expect(deCada(412, 3000)).toBe("412 de 3.000");
  });

  it("dice el riesgo como una fracción legible", () => {
    expect(unoEn(1)).toBe("1 en 1");
    expect(unoEn(0.02)).toBe("1 en 50");
    expect(unoEn(0)).toBe("—");
  });

  it("escribe tamaños y tiempos en la escala que se lee de un vistazo", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(20 * 1024)).toBe("20 KB");
    expect(bytes(150 * 1024 * 1024)).toBe("150 MB");
    expect(milisegundos(940)).toBe("940 ms");
    expect(milisegundos(2680)).toBe("2,7 s");
  });
});
