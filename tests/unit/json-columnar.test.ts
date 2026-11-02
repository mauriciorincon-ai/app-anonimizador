// La construcción dispersa de la tabla columnar (JSON) y lo que no debe tocar: CSV y Excel.

import { describe, expect, it } from "vitest";

import {
  CODIGO_VACIO,
  ConstructorColumnar,
  ConstructorColumnarDisperso,
  reconstruirColumna,
  valorEn,
} from "../../src/engine/columnar";

describe("ConstructorColumnarDisperso", () => {
  it("una columna descubierta tarde se rellena hacia atrás con celdas vacías y clase 0", () => {
    const c = new ConstructorColumnarDisperso();
    const a = c.agregarColumna("a", ["a"]);
    c.poner(a, "uno", 1);
    c.cerrarFila();
    c.cerrarFila(); // un registro sin ninguna celda
    const b = c.agregarColumna("b.c", ["b", "c"]);
    c.poner(a, "dos", 1);
    c.poner(b, "7", 2);
    c.cerrarFila();

    const { tabla, clases } = c.finalizar();
    expect(tabla.filas).toBe(3);
    expect(tabla.columnas.map((x) => x.nombre)).toEqual(["a", "b.c"]);
    expect(tabla.columnas[1].ruta).toEqual(["b", "c"]);
    expect([...tabla.columnas[0].codigos]).toEqual([1, CODIGO_VACIO, 2]);
    expect([...tabla.columnas[1].codigos]).toEqual([0, 0, 1]);
    expect(tabla.columnas[0].valores).toEqual(["", "uno", "dos"]);
    expect(tabla.columnas[0].noVacios).toBe(2);
    expect(tabla.columnas[1].noVacios).toBe(1);
    expect([...clases[0]]).toEqual([1, 0, 1]);
    expect([...clases[1]]).toEqual([0, 0, 2]);
    expect(valorEn(tabla.columnas[1], 2)).toBe("7");
  });

  it("deduplica por columna, con los códigos en orden de primera aparición", () => {
    const c = new ConstructorColumnarDisperso();
    const a = c.agregarColumna("a", ["a"]);
    for (const v of ["z", "y", "z", "", "y"]) {
      c.poner(a, v, 1);
      c.cerrarFila();
    }
    const { tabla } = c.finalizar();
    expect(tabla.columnas[0].valores).toEqual(["", "z", "y"]);
    expect([...tabla.columnas[0].codigos]).toEqual([1, 2, 1, 0, 2]);
    expect(tabla.columnas[0].noVacios).toBe(4);
  });

  it("crece duplicando: miles de filas y una columna tardía, sin perder ni mover nada", () => {
    const c = new ConstructorColumnarDisperso();
    const a = c.agregarColumna("a", ["a"]);
    let b = -1;
    for (let i = 0; i < 5_000; i++) {
      c.poner(a, String(i % 10), 2);
      if (i === 3_000) b = c.agregarColumna("b", ["b"]);
      if (i >= 3_000) c.poner(b, "x", 1);
      c.cerrarFila();
    }
    expect(c.filasCerradas).toBe(5_000);
    expect(c.totalDeColumnas).toBe(2);
    const { tabla, clases } = c.finalizar();
    expect(tabla.filas).toBe(5_000);
    expect(tabla.columnas[0].codigos).toHaveLength(5_000);
    expect(valorEn(tabla.columnas[0], 4_999)).toBe("9");
    expect(clases[1][2_999]).toBe(0);
    expect(clases[1][3_000]).toBe(1);
    expect(tabla.columnas[1].noVacios).toBe(2_000);
  });

  it("con un tope de celdas, la capacidad reservada no se pasa de lo que el tope permite", () => {
    const c = new ConstructorColumnarDisperso(1_200);
    const a = c.agregarColumna("a", ["a"]);
    for (let i = 0; i < 1_100; i++) {
      c.poner(a, "v", 1);
      c.cerrarFila();
    }
    expect(c.filasCerradas).toBe(1_100);
    expect(c.finalizar().tabla.columnas[0].codigos).toHaveLength(1_100);
  });

  it("una tabla sin columnas conserva las filas", () => {
    const c = new ConstructorColumnarDisperso();
    c.cerrarFila();
    c.cerrarFila();
    const { tabla, clases } = c.finalizar();
    expect(tabla.filas).toBe(2);
    expect(tabla.columnas).toEqual([]);
    expect(clases).toEqual([]);
  });
});

describe("la ruta de la columna no toca a CSV ni a Excel", () => {
  it("una columna del constructor de siempre no tiene la propiedad `ruta`", () => {
    const c = new ConstructorColumnar(["a", "b"]);
    c.agregarFila(["1", "2"]);
    const tabla = c.finalizar();
    expect("ruta" in tabla.columnas[0]).toBe(false);
    expect(Object.keys(tabla.columnas[0]).sort()).toEqual(
      ["codigos", "nombre", "noVacios", "valores"].sort(),
    );
  });

  it("reconstruirColumna conserva la ruta de JSON y no inventa una para CSV", () => {
    const c = new ConstructorColumnarDisperso();
    const a = c.agregarColumna("p.q", ["p", "q"]);
    c.poner(a, "x", 1);
    c.cerrarFila();
    const { tabla } = c.finalizar();
    const rehecha = reconstruirColumna(tabla.columnas[0], ["", "NUEVO"]);
    expect(rehecha.ruta).toEqual(["p", "q"]);
    expect(rehecha.valores).toEqual(["", "NUEVO"]);

    const csv = new ConstructorColumnar(["a"]);
    csv.agregarFila(["1"]);
    const hecha = reconstruirColumna(csv.finalizar().columnas[0], ["", "2"]);
    expect("ruta" in hecha).toBe(false);
  });
});
