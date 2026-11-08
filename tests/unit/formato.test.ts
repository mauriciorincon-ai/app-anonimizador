import { describe, expect, it } from "vitest";

import {
  bytes,
  deCada,
  milisegundos,
  numero,
  porcentaje,
  unoEn,
} from "@/lib/formato";

describe("números en convención colombiana (español)", () => {
  it("usa el punto para los miles", () => {
    expect(numero(1_234_567, "es")).toBe("1.234.567");
    expect(numero(0, "es")).toBe("0");
  });

  it("no deja que un riesgo pequeño se redondee a cero", () => {
    // Un 0,04 % redondeado a "0 %" convertiría un riesgo real en un cero tranquilizador. Por
    // debajo del 10 % el porcentaje conserva un decimal justamente para que eso no pase.
    expect(porcentaje(0.042, "es")).toBe("4,2 %");
    expect(porcentaje(0.5, "es")).toBe("50 %");
    expect(porcentaje(1, "es")).toBe("100 %");
  });

  it("no redondea a «100 %» lo que no es todos", () => {
    expect(porcentaje(0.9995, "es")).toBe("99,9 %");
    expect(porcentaje(0.9951, "es")).toBe("99,5 %");
    expect(porcentaje(0.99999, "es")).toBe("99,9 %");
    expect(porcentaje(0.9949, "es")).toBe("99 %");
    expect(porcentaje(0.9995, "en")).toBe("99.9%");
    expect(porcentaje(1, "es")).toBe("100 %");
  });

  it("dice con palabras lo que el decimal ya no alcanza a escribir", () => {
    // El decimal solo corre el problema un orden de magnitud: UNA persona sola en 3.000 filas es
    // 0,03 %, y en 500.000 es 0,0002 % — las dos se escribían "0,0 %", que es el mismo cero
    // tranquilizador que el decimal existía para evitar, y era la cifra grande del panel.
    expect(porcentaje(1 / 3000, "es")).toBe("menos de 0,1 %");
    expect(porcentaje(1 / 500_000, "es")).toBe("menos de 0,1 %");
    // El cero de verdad sigue siendo cero: nadie solo es nadie solo.
    expect(porcentaje(0, "es")).toBe("0 %");
  });

  it("pega el denominador a la cifra", () => {
    expect(deCada(412, 3000, "es")).toBe("412 de 3.000");
  });

  it("dice el riesgo como una fracción legible", () => {
    expect(unoEn(1, "es")).toBe("1 en 1");
    expect(unoEn(0.02, "es")).toBe("1 en 50");
    expect(unoEn(0, "es")).toBe("—");
  });

  it("escribe tamaños y tiempos en la escala que se lee de un vistazo", () => {
    expect(bytes(512, "es")).toBe("512 B");
    expect(bytes(20 * 1024, "es")).toBe("20 KB");
    expect(bytes(150 * 1024 * 1024, "es")).toBe("150 MB");
    expect(milisegundos(940, "es")).toBe("940 ms");
    expect(milisegundos(2680, "es")).toBe("2,7 s");
  });
});

describe("números en convención de inglés de EE. UU. (inglés)", () => {
  // Las mismas cinco reglas, con la otra convención: no basta con cambiar el separador, también
  // cambia el espacio antes del signo de porcentaje y las palabras que unen las cifras.
  it("usa la coma para los miles y el punto para los decimales", () => {
    expect(numero(1_234_567, "en")).toBe("1,234,567");
    expect(porcentaje(0.042, "en")).toBe("4.2%");
    expect(porcentaje(0.5, "en")).toBe("50%");
  });

  it("no deja que un riesgo pequeño se redondee a cero tampoco en inglés", () => {
    expect(porcentaje(1 / 500_000, "en")).toBe("under 0.1%");
    expect(porcentaje(0, "en")).toBe("0%");
  });

  it("pega el denominador a la cifra, con las palabras del idioma", () => {
    expect(deCada(412, 3000, "en")).toBe("412 of 3,000");
    expect(unoEn(0.02, "en")).toBe("1 in 50");
    expect(unoEn(0, "en")).toBe("—");
  });

  it("escribe tamaños y tiempos con el punto decimal", () => {
    expect(bytes(150 * 1024 * 1024, "en")).toBe("150 MB");
    expect(milisegundos(2680, "en")).toBe("2.7 s");
  });
});
