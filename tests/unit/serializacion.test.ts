import { describe, expect, it } from "vitest";

import { huella, serializarCanonico } from "../../src/engine/serializacion";

describe("serializarCanonico", () => {
  it("da la MISMA cadena para objetos iguales construidos en distinto orden", () => {
    // El motivo de existir de este módulo: `JSON.stringify` conserva el orden de inserción, así
    // que dos diagnósticos idénticos armados por caminos distintos darían cadenas distintas y el
    // gate de determinismo mediría con una regla que se mueve.
    const a = { zeta: 1, alfa: { y: 2, x: 3 } };
    const b = { alfa: { x: 3, y: 2 }, zeta: 1 };

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(serializarCanonico(a)).toBe(serializarCanonico(b));
  });

  it("respeta el orden de los arreglos, que sí es significativo", () => {
    expect(serializarCanonico([1, 2, 3])).not.toBe(
      serializarCanonico([3, 2, 1]),
    );
  });

  it("ordena por punto de código y no por locale", () => {
    // `localeCompare` ordena distinto según el idioma del sistema: la salida dejaría de ser
    // reproducible entre máquinas.
    expect(serializarCanonico({ ñ: 1, n: 2, a: 3 })).toBe(
      '{"a":3,"n":2,"ñ":1}',
    );
  });

  it("serializa typed arrays como listas de números", () => {
    expect(serializarCanonico(new Uint32Array([1, 2, 3]))).toBe("[1,2,3]");
  });

  it("normaliza los casos que JSON deja ambiguos", () => {
    expect(serializarCanonico(-0)).toBe("0");
    expect(serializarCanonico(Number.NaN)).toBe('"NaN"');
    expect(serializarCanonico(Number.POSITIVE_INFINITY)).toBe('"Infinity"');
    expect(serializarCanonico(null)).toBe("null");
  });

  it("omite las claves undefined en vez de dejarlas al azar", () => {
    expect(serializarCanonico({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("huella", () => {
  it("es estable para el mismo contenido y distinta para contenido distinto", () => {
    expect(huella({ a: 1, b: 2 })).toBe(huella({ b: 2, a: 1 }));
    expect(huella({ a: 1 })).not.toBe(huella({ a: 2 }));
    expect(huella({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
  });
});
