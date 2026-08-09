import { describe, expect, it } from "vitest";

import {
  CODIGO_VACIO,
  ConstructorColumnar,
  cardinalidad,
  valorEn,
} from "../../src/engine/columnar";

function construir(
  nombres: string[],
  filas: string[][],
  filasEstimadas?: number,
) {
  const constructor = new ConstructorColumnar(nombres, filasEstimadas);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

describe("ConstructorColumnar", () => {
  it("guarda cada valor una vez y referencia por código", () => {
    const tabla = construir(
      ["municipio"],
      [["Bogotá"], ["Cali"], ["Bogotá"], ["Bogotá"]],
    );

    expect(tabla.filas).toBe(4);
    expect(tabla.columnas[0].valores).toEqual(["", "Bogotá", "Cali"]);
    expect([...tabla.columnas[0].codigos]).toEqual([1, 2, 1, 1]);
  });

  it("asigna los códigos en orden de PRIMERA APARICIÓN — de ahí sale el determinismo", () => {
    // Si los códigos dependieran de un orden alfabético, de un hash o del recorrido de un Set,
    // dos corridas podrían diferir y el diagnóstico dejaría de ser byte-idéntico.
    const a = construir(["c"], [["zeta"], ["alfa"], ["zeta"], ["media"]]);
    const b = construir(["c"], [["zeta"], ["alfa"], ["zeta"], ["media"]]);

    expect(a.columnas[0].valores).toEqual(["", "zeta", "alfa", "media"]);
    expect([...a.columnas[0].codigos]).toEqual([...b.columnas[0].codigos]);
  });

  it("reserva el código 0 para la celda vacía en todas las columnas", () => {
    const tabla = construir(
      ["a", "b"],
      [
        ["x", ""],
        ["", "y"],
      ],
    );

    expect(tabla.columnas[0].codigos[1]).toBe(CODIGO_VACIO);
    expect(tabla.columnas[1].codigos[0]).toBe(CODIGO_VACIO);
    expect(tabla.columnas[0].valores[CODIGO_VACIO]).toBe("");
  });

  it("cuenta los no-vacíos sin contar la celda vacía como un valor más", () => {
    // El % de aciertos de un validador se calcula sobre no-vacíos: si el vacío contara, toda
    // columna con huecos parecería peor de lo que es.
    const tabla = construir(["c"], [["a"], [""], ["b"], [""], ["a"]]);

    expect(tabla.columnas[0].noVacios).toBe(3);
    expect(cardinalidad(tabla.columnas[0])).toBe(2);
  });

  it("completa las filas cortas y trunca las largas sin cambiar el esquema", () => {
    // Un CSV real trae filas irregulares. Ni caerse ni inventar columnas a mitad de archivo:
    // el esquema lo fija el encabezado y no se mueve.
    const tabla = construir(
      ["a", "b", "c"],
      [
        ["1", "2"],
        ["1", "2", "3", "4"],
      ],
    );

    expect(tabla.columnas).toHaveLength(3);
    expect(valorEn(tabla.columnas[2], 0)).toBe("");
    expect(valorEn(tabla.columnas[2], 1)).toBe("3");
  });

  it("nombra las columnas sin encabezado por su posición", () => {
    const tabla = construir(["", "b"], [["1", "2"]]);
    expect(tabla.columnas[0].nombre).toBe("columna_1");
  });

  it("crece más allá de la capacidad estimada sin perder ni desordenar filas", () => {
    // El total de filas de un CSV en streaming no se conoce hasta el final: la estimación
    // siempre puede quedarse corta.
    const filas = Array.from({ length: 5000 }, (_, i) => [`v${i % 97}`]);
    const tabla = construir(["c"], filas, 8);

    expect(tabla.filas).toBe(5000);
    expect(cardinalidad(tabla.columnas[0])).toBe(97);
    expect(valorEn(tabla.columnas[0], 4999)).toBe(`v${4999 % 97}`);
  });

  it("recorta el buffer cuando sobra capacidad y lo comparte cuando no", () => {
    // Con mucha sobra se copia (liberar el buffer duplicado); con poca se comparte (evitar la
    // copia). Lo que NUNCA cambia es la longitud observable.
    const filas = Array.from({ length: 2000 }, (_, i) => [`v${i}`]);

    const conSobra = construir(["c"], filas, 65_536); // capacidad ≫ filas ⇒ se copia
    const ajustado = construir(["c"], filas, 2000); // capacidad = filas ⇒ vista compartida

    // Copiado: el buffer resultante mide exactamente lo usado (los 63.536 códigos sobrantes
    // quedaron libres). Compartido: el buffer ya venía justo, así que también mide lo usado.
    expect(conSobra.columnas[0].codigos.buffer.byteLength).toBe(2000 * 4);
    expect(ajustado.columnas[0].codigos.buffer.byteLength).toBe(2000 * 4);
    expect([...conSobra.columnas[0].codigos]).toEqual([
      ...ajustado.columnas[0].codigos,
    ]);
    expect(valorEn(conSobra.columnas[0], 1999)).toBe("v1999");
  });

  it("tolera una tabla sin filas", () => {
    const tabla = construir(["a"], []);

    expect(tabla.filas).toBe(0);
    expect(tabla.columnas[0].codigos).toHaveLength(0);
    expect(cardinalidad(tabla.columnas[0])).toBe(0);
  });
});
