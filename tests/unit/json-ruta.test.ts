// Las rutas de un JSON: el nombre de columna de un campo anidado, y su ida y vuelta.

import { describe, expect, it } from "vitest";

import {
  escaparSegmento,
  partirRuta,
  SUFIJO_DE_LISTA,
  unirRuta,
} from "../../src/engine/json/ruta";

describe("unirRuta / partirRuta", () => {
  it("une los niveles con un punto", () => {
    expect(unirRuta(["paciente", "contacto", "correo"])).toBe(
      "paciente.contacto.correo",
    );
    expect(partirRuta("paciente.contacto.correo")).toEqual([
      "paciente",
      "contacto",
      "correo",
    ]);
  });

  it("una clave con punto NO es lo mismo que dos niveles", () => {
    const literal = unirRuta(["a.b"]);
    const anidada = unirRuta(["a", "b"]);
    expect(literal).toBe("a\\.b");
    expect(anidada).toBe("a.b");
    expect(literal).not.toBe(anidada);
    expect(partirRuta(literal)).toEqual(["a.b"]);
    expect(partirRuta(anidada)).toEqual(["a", "b"]);
  });

  it("escapa la barra y los corchetes (el [] es de las listas)", () => {
    expect(escaparSegmento("a[0]")).toBe("a\\[0\\]");
    expect(escaparSegmento("a\\b")).toBe("a\\\\b");
    expect(unirRuta(["x[]"])).toBe("x\\[\\]");
    expect(partirRuta("x\\[\\]")).toEqual(["x[]"]);
    expect(SUFIJO_DE_LISTA).toBe("[]");
  });

  it("la clave vacía se escribe \\_ y no se confunde con una clave `_`", () => {
    expect(unirRuta([""])).toBe("\\_");
    expect(unirRuta(["a", "", "b"])).toBe("a.\\_.b");
    expect(unirRuta(["_"])).toBe("_");
    expect(partirRuta("\\_")).toEqual([""]);
    expect(partirRuta("a.\\_.b")).toEqual(["a", "", "b"]);
    expect(partirRuta("_")).toEqual(["_"]);
    // Una clave que ES barra + guion bajo no se confunde con la vacía.
    expect(unirRuta(["\\_"])).toBe("\\\\_");
    expect(partirRuta("\\\\_")).toEqual(["\\_"]);
  });

  it("la ruta vacía es la raíz: ningún segmento", () => {
    expect(partirRuta("")).toEqual([]);
    expect(unirRuta([])).toBe("");
  });

  it("es tolerante con lo que no produce: un \\_ dentro de otro texto es una `_`", () => {
    expect(partirRuta("a\\_b")).toEqual(["a_b"]);
    expect(partirRuta("a\\")).toEqual(["a"]);
  });

  it("ida y vuelta exacta para TODA clave de hasta 4 caracteres del alfabeto peligroso", () => {
    const alfabeto = ["a", ".", "[", "]", "\\", "_"];
    let claves = [""];
    const todas: string[] = [""];
    for (let largo = 1; largo <= 4; largo++) {
      claves = claves.flatMap((c) => alfabeto.map((x) => c + x));
      todas.push(...claves);
    }
    // Una a una…
    for (const clave of todas) {
      expect(partirRuta(unirRuta([clave]))).toEqual([clave]);
    }
    // …y en parejas, para que el separador también se ponga a prueba. Las parejas más cortas bastan.
    const cortas = todas.filter((c) => c.length <= 2);
    const vistas = new Set<string>();
    for (const a of cortas) {
      for (const b of cortas) {
        const ruta = unirRuta([a, b]);
        expect(partirRuta(ruta)).toEqual([a, b]);
        // Inyectiva: dos pares distintos jamás dan la misma ruta.
        expect(vistas.has(ruta)).toBe(false);
        vistas.add(ruta);
      }
    }
  });
});
