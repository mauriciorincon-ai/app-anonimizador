import { describe, expect, it } from "vitest";

import { enmascarar, muestraParaColumna } from "../../src/engine/mascara";

describe("enmascarar", () => {
  it("revela solo los extremos", () => {
    expect(enmascarar("1032456789")).toBe("103***89");
    expect(enmascarar("maria.herrera@ejemplo.com")).toBe("mar***om");
  });

  it("usa un número FIJO de asteriscos, no uno por carácter oculto", () => {
    // Si los asteriscos contaran los caracteres escondidos, la máscara filtraría la longitud del
    // valor — y en una columna de identificadores la longitud estrecha muchísimo el campo.
    const corto = enmascarar("12345678");
    const largo = enmascarar("123456789012345678901234567890");
    expect(corto).toBe("12***8");
    expect(largo).toBe("123***90");
    expect(corto.match(/\*/g)?.length).toBe(largo.match(/\*/g)?.length);
  });

  it("NUNCA revela más de la mitad del valor", () => {
    // El defecto que este test fija: con extremos fijos de 3+2, una placa —6 caracteres, e
    // identificador directo— salía como ABC***23 y dejaba UN carácter oculto. Diez candidatos no
    // son una máscara, y esa muestra viaja dentro del reporte que el usuario le manda a alguien.
    for (const valor of [
      "ABC123",
      "ABC12D",
      "1234567",
      "12345678",
      "123456789",
      "1032456789",
      "maria.herrera@ejemplo.com",
    ]) {
      const revelados = enmascarar(valor).replace("***", "").length;
      expect(revelados / valor.length).toBeLessThanOrEqual(0.5);
    }
  });

  it("una placa deja de ser reconocible carácter por carácter", () => {
    expect(enmascarar("ABC123")).toBe("AB***3");
    expect(enmascarar("1234567")).toBe("12***7");
  });

  it("no revela nada cuando el valor es demasiado corto para esconder algo", () => {
    expect(enmascarar("F")).toBe("***");
    expect(enmascarar("ABC12")).toBe("***");
  });

  it("es determinista y trata el vacío como vacío", () => {
    expect(enmascarar("1032456789")).toBe(enmascarar("1032456789"));
    expect(enmascarar("")).toBe("");
    expect(enmascarar("   ")).toBe("");
  });
});

describe("muestraParaColumna", () => {
  it("omite la muestra en columnas sensibles", () => {
    expect(muestraParaColumna("Indígena", true)).toEqual({
      texto: "",
      omitida: true,
    });
  });

  it("devuelve la máscara en columnas no sensibles", () => {
    expect(muestraParaColumna("1032456789", false)).toEqual({
      texto: "103***89",
      omitida: false,
    });
  });

  it("no inventa muestra cuando no hay valor", () => {
    expect(muestraParaColumna(null, false)).toBeNull();
    expect(muestraParaColumna("  ", false)).toBeNull();
  });
});
