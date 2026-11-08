// @vitest-environment node
//
// Concordancia de los catálogos: ningún texto en español puede salir con un artículo plural delante
// de una cifra que, al sustituirse, vale 1 («las 1 columna»), ni nombrar un sprint al usuario.

import { describe, expect, it } from "vitest";

const modulos = import.meta.glob<Record<string, unknown>>(
  "../../src/lib/idioma/textos/*.ts",
  { eager: true },
);

function hojas(valor: unknown, ruta: string, salida: [string, string][]): void {
  if (typeof valor !== "object" || valor === null) return;
  const objeto = valor as Record<string, unknown>;
  if (typeof objeto.es === "string" && typeof objeto.en === "string") {
    salida.push([ruta, objeto.es]);
    return;
  }
  for (const [llave, hijo] of Object.entries(objeto)) {
    hojas(hijo, `${ruta}.${llave}`, salida);
  }
}

describe("textos en español", () => {
  const todos: [string, string][] = [];
  for (const [archivo, modulo] of Object.entries(modulos))
    hojas(modulo, archivo, todos);

  it("recorre los catálogos", () => {
    expect(todos.length).toBeGreaterThan(500);
  });

  it("no lleva un artículo plural delante de {n} en singular", () => {
    const mal = todos.filter(([, texto]) =>
      /\b(las|los) \{[a-zA-Z]+\} (columna|clase|regla|técnica|fila|campo|bloque|archivo)\b(?!s)/.test(
        texto,
      ),
    );
    expect(mal.map(([ruta]) => ruta)).toEqual([]);
  });

  it("no nombra un sprint al usuario", () => {
    const mal = todos.filter(([, texto]) =>
      /\b(en el|del|este) S\d{1,2}\b/.test(texto),
    );
    expect(mal.map(([ruta]) => ruta)).toEqual([]);
  });
});
