// La utilidad perdida es la mitad del trato que ninguna herramienta enseña. Estos tests fijan que
// las cifras signifiquen lo que dicen significar — una entropía mal calculada o una V de Cramér
// inflada no fallan ruidosamente: producen un número plausible que lleva a la decisión contraria.

import { describe, expect, it } from "vitest";

import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import {
  CARDINALIDAD_MAXIMA_DE_CORRELACION,
  COLUMNAS_MAXIMAS_DE_CORRELACION,
  entropiaEnBits,
  medirUtilidad,
  vDeCramer,
} from "@/engine/utilidad";

function tablaDe(
  encabezado: readonly string[],
  filas: readonly string[][],
): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length || 1);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

describe("entropía: cuánto distingue una columna", () => {
  it("un solo valor no distingue a nadie: 0 bits", () => {
    const tabla = tablaDe(
      ["x"],
      Array.from({ length: 8 }, () => ["igual"]),
    );
    expect(entropiaEnBits(tabla.columnas[0], 8)).toBe(0);
  });

  it("todos distintos entre n filas dan log₂(n) bits", () => {
    const tabla = tablaDe(
      ["x"],
      Array.from({ length: 8 }, (_, i) => [`v${i}`]),
    );
    expect(entropiaEnBits(tabla.columnas[0], 8)).toBeCloseTo(3, 10);
  });

  it("dos valores mitad y mitad dan exactamente 1 bit", () => {
    const tabla = tablaDe(
      ["x"],
      Array.from({ length: 10 }, (_, i) => [i % 2 ? "a" : "b"]),
    );
    expect(entropiaEnBits(tabla.columnas[0], 10)).toBeCloseTo(1, 10);
  });

  it("una tabla sin filas da 0, no NaN", () => {
    expect(entropiaEnBits(tablaDe(["x"], []).columnas[0], 0)).toBe(0);
  });
});

describe("V de Cramér: si la relación entre dos columnas sobrevivió", () => {
  it("una columna que determina la otra da 1", () => {
    const filas = Array.from({ length: 40 }, (_, i) => [
      ["a", "b", "c", "d"][i % 4],
      ["A", "B", "C", "D"][i % 4],
    ]);
    const tabla = tablaDe(["x", "y"], filas);
    expect(vDeCramer(tabla.columnas[0], tabla.columnas[1], 40)).toBeCloseTo(
      1,
      10,
    );
  });

  it("dos columnas independientes dan casi 0", () => {
    // Producto cartesiano completo: cada valor de `x` aparece con cada valor de `y` igual de veces.
    const filas: string[][] = [];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) filas.push([`x${i}`, `y${j}`]);
    }
    const tabla = tablaDe(["x", "y"], filas);
    expect(vDeCramer(tabla.columnas[0], tabla.columnas[1], filas.length)).toBe(
      0,
    );
  });

  it("una columna constante no tiene relación con nada: 0, no NaN", () => {
    const filas = Array.from({ length: 20 }, (_, i) => ["igual", `v${i % 4}`]);
    const tabla = tablaDe(["fija", "variable"], filas);
    expect(vDeCramer(tabla.columnas[0], tabla.columnas[1], 20)).toBe(0);
  });

  it("los valores del diccionario que ya nadie usa no inflan la cifra", () => {
    // Generalizar deja entradas huérfanas en el diccionario, y el vacío existe siempre aunque no
    // aparezca en ninguna fila. Contarlas como categorías encogería los grados de libertad y
    // subiría la V sin que la relación hubiera cambiado.
    const filas = Array.from({ length: 40 }, (_, i) => [
      i % 2 ? "a" : "b",
      i % 2 ? "A" : "B",
    ]);
    const normal = tablaDe(["x", "y"], filas);
    const conHuerfanos: TablaColumnar = {
      filas: 40,
      columnas: normal.columnas.map((columna) => ({
        ...columna,
        valores: [...columna.valores, "fantasma-1", "fantasma-2"],
      })),
    };
    expect(
      vDeCramer(conHuerfanos.columnas[0], conHuerfanos.columnas[1], 40),
    ).toBe(vDeCramer(normal.columnas[0], normal.columnas[1], 40));
  });
});

describe("el balance columna por columna", () => {
  const ANTES = tablaDe(
    ["edad", "municipio", "monto"],
    Array.from({ length: 40 }, (_, i) => [
      String(20 + i),
      ["Bogotá", "Cali"][i % 2],
      String(i * 100),
    ]),
  );

  it("una columna suprimida es pérdida total, y se cuenta como tal", () => {
    const despues = tablaDe(
      ["municipio", "monto"],
      Array.from({ length: 40 }, (_, i) => [
        ["Bogotá", "Cali"][i % 2],
        String(i * 100),
      ]),
    );
    const utilidad = medirUtilidad(ANTES, despues);
    const edad = utilidad.columnas.find((c) => c.nombre === "edad")!;

    expect(edad.estado).toBe("suprimida");
    expect(edad.bitsDespues).toBe(0);
    expect(edad.celdasCambiadas).toBe(1);
    expect(edad.bitsAntes).toBeCloseTo(Math.log2(40), 10);
  });

  it("una columna que no cambió sale como intacta, no como transformada", () => {
    const utilidad = medirUtilidad(ANTES, ANTES);
    expect(utilidad.columnas.every((c) => c.estado === "intacta")).toBe(true);
    expect(utilidad.bitsDespues).toBeCloseTo(utilidad.bitsAntes, 10);
  });

  it("generalizar baja los bits y los valores distintos a la vez", () => {
    const despues = tablaDe(
      ["edad", "municipio", "monto"],
      Array.from({ length: 40 }, (_, i) => [
        `${Math.floor((20 + i) / 10) * 10}-${Math.floor((20 + i) / 10) * 10 + 9}`,
        ["Bogotá", "Cali"][i % 2],
        String(i * 100),
      ]),
    );
    const edad = medirUtilidad(ANTES, despues).columnas.find(
      (c) => c.nombre === "edad",
    )!;

    expect(edad.estado).toBe("transformada");
    expect(edad.cardinalidadDespues).toBeLessThan(edad.cardinalidadAntes);
    expect(edad.bitsDespues).toBeLessThan(edad.bitsAntes);
    expect(edad.celdasCambiadas).toBe(1);
  });

  it("los bits totales de después NO cuentan las columnas suprimidas", () => {
    // Sumarlas diría que el archivo conserva información que ya no lleva.
    const despues = tablaDe(
      ["municipio", "monto"],
      Array.from({ length: 40 }, (_, i) => [
        ["Bogotá", "Cali"][i % 2],
        String(i * 100),
      ]),
    );
    const utilidad = medirUtilidad(ANTES, despues);
    expect(utilidad.bitsDespues).toBeLessThan(utilidad.bitsAntes);
    expect(utilidad.bitsDespues).toBeCloseTo(1 + Math.log2(40), 10);
  });
});

describe("las relaciones entre columnas", () => {
  it("una relación que se rompe aparece primera, y con sus dos cifras", () => {
    // `zona` y `barrio` se determinan mutuamente; generalizar `barrio` a una sola etiqueta por zona
    // conserva la relación, pero aplanarlo a un valor único la destruye.
    const antes = tablaDe(
      ["zona", "barrio", "sexo"],
      Array.from({ length: 60 }, (_, i) => [
        ["norte", "sur"][i % 2],
        ["norte", "sur"][i % 2] === "norte" ? "b1" : "b2",
        ["F", "M", "O"][i % 3],
      ]),
    );
    const despues = tablaDe(
      ["zona", "barrio", "sexo"],
      Array.from({ length: 60 }, (_, i) => [
        ["norte", "sur"][i % 2],
        "todos",
        ["F", "M", "O"][i % 3],
      ]),
    );
    const utilidad = medirUtilidad(antes, despues);
    const rota = utilidad.correlaciones[0];

    expect(rota.columnas).toEqual(["zona", "barrio"]);
    expect(rota.antes).toBeCloseTo(1, 10);
    expect(rota.despues).toBe(0);
  });

  it("una columna con demasiados valores distintos queda fuera, con su motivo", () => {
    const filas = Array.from({ length: 200 }, (_, i) => [
      `correo${i}@ejemplo.com`,
      ["F", "M"][i % 2],
    ]);
    const tabla = tablaDe(["correo", "sexo"], filas);
    const utilidad = medirUtilidad(tabla, tabla);

    const fuera = utilidad.fueraDelCruce.find((f) => f.nombre === "correo");
    expect(fuera).toBeDefined();
    expect(fuera!.motivo).toContain(String(CARDINALIDAD_MAXIMA_DE_CORRELACION));
    expect(utilidad.correlaciones).toEqual([]);
  });

  it("el tope de columnas se declara y las sobrantes se nombran", () => {
    const total = COLUMNAS_MAXIMAS_DE_CORRELACION + 3;
    const filas = Array.from({ length: 60 }, (_, fila) =>
      Array.from({ length: total }, (_, columna) =>
        String((fila + columna) % (columna + 2)),
      ),
    );
    const tabla = tablaDe(
      Array.from({ length: total }, (_, i) => `c${i}`),
      filas,
    );
    const utilidad = medirUtilidad(tabla, tabla);

    expect(utilidad.fueraDelCruce).toHaveLength(3);
    expect(utilidad.tope.columnasMaximas).toBe(COLUMNAS_MAXIMAS_DE_CORRELACION);
    // 8 columnas ⇒ 28 pares.
    expect(utilidad.correlaciones).toHaveLength(28);
  });

  it("una tabla sin filas no produce NaN en ninguna cifra", () => {
    const vacia = tablaDe(["a", "b"], []);
    const utilidad = medirUtilidad(vacia, vacia);
    expect(utilidad.bitsAntes).toBe(0);
    expect(utilidad.columnas.every((c) => c.celdasCambiadas === 0)).toBe(true);
    expect(utilidad.correlaciones.every((c) => c.antes === 0)).toBe(true);
  });

  it("dos corridas dan el mismo orden", () => {
    const filas = Array.from({ length: 80 }, (_, i) => [
      String(i % 3),
      String(i % 4),
      String(i % 5),
    ]);
    const tabla = tablaDe(["a", "b", "c"], filas);
    expect(medirUtilidad(tabla, tabla).correlaciones).toEqual(
      medirUtilidad(tabla, tabla).correlaciones,
    );
  });
});
