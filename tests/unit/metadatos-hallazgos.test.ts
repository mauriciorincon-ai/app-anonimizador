// @vitest-environment node
//
// Del valor crudo a lo que cruza: enmascarado, y con lo que un validador confirmó.

import { describe, expect, it } from "vitest";

import { campoParaLaPagina, detectar } from "@/engine/metadatos/hallazgos";
import type { CampoCrudo } from "@/engine/metadatos/tipos";

const campo = (valor: string, clave = "Artist"): CampoCrudo => ({
  clave,
  origen: "exif",
  valor,
  revela: "autoria",
});

describe("detectar", () => {
  it("halla una cédula que ES el valor", () => {
    const d = detectar("1032456789", "Author");
    expect(d?.tipo).toBe("cedula");
    expect(d?.dentro).toBe(false);
    expect(d?.categoria).toBe("identificador-directo");
  });

  it("halla una cédula DENTRO de un autor escrito a mano", () => {
    const d = detectar("Ana Pérez · CC 1032456789", "Artist");
    expect(d?.tipo).toBe("cedula");
    expect(d?.dentro).toBe(true);
  });

  it("halla un correo y una coordenada", () => {
    expect(detectar("ana.perez@ejemplo.com", "dc:creator")?.tipo).toBe("email");
    expect(detectar("4.609710", "GPSLatitude")?.tipo).toBe("coordenada");
  });

  it("no reporta lo que no dice nada (un número, un texto suelto)", () => {
    expect(detectar("42", "ISO")).toBeNull();
    expect(detectar("Editor Sintetico", "Software")).toBeNull();
  });

  it("no busca nombres por partes: una palabra de un título no es una persona", () => {
    const d = detectar("Informe anual de Gómez y asociados", "Title");
    expect(d === null || d.tipo !== "nombre" || d.dentro === false).toBe(true);
  });
});

describe("campoParaLaPagina", () => {
  it("enmascara el valor y conserva el nombre, el origen y lo que revela", () => {
    const pagina = campoParaLaPagina(campo("Ana Pérez · CC 1032456789"));
    expect(pagina.clave).toBe("Artist");
    expect(pagina.origen).toBe("exif");
    expect(pagina.revela).toBe("autoria");
    expect(pagina.muestra).not.toContain("1032456789");
    expect(pagina.muestra).toContain("***");
    // Ningún campo del objeto que cruza lleva el valor crudo.
    expect(JSON.stringify(pagina)).not.toContain("1032456789");
  });

  it("un valor corto se tapa entero", () => {
    expect(campoParaLaPagina(campo("Canon", "Make")).muestra).toBe("***");
  });
});
