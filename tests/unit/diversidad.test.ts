// l-diversity y t-closeness — lo que k-anonimato deja fuera.
//
// El caso que estas métricas existen para atrapar: una tabla puede tener k=5 impecable y aun así
// contar todo lo que importa, porque las 5 personas de la clase comparten el diagnóstico. Estos
// tests fijan que Velo lo VE y lo dice con un número, no que lo arregle: optimizar ℓ y t es
// NP-hard, verificarlas sobre una partición ya hecha es lineal, y el ADR-002 §4 dejó exactamente
// esa frontera escrita.

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { medirDiversidad } from "@/engine/diversidad";
import { anonimizarConMondrian } from "@/engine/mondrian";

function tablaDe(
  encabezado: readonly string[],
  filas: readonly string[][],
): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length || 1);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

describe("l-diversity — el ataque de homogeneidad", () => {
  it("una clase donde todos comparten el valor sensible da ℓ=1", () => {
    // k=2 impecable en las dos clases, y sin embargo saber en cuál estás te dice el diagnóstico.
    const tabla = tablaDe(
      ["zona", "diagnostico"],
      [
        ["norte", "J45.9"],
        ["norte", "J45.9"],
        ["sur", "E11.9"],
        ["sur", "E11.9"],
      ],
    );
    const [medida] = medirDiversidad(tabla, ["zona"], ["diagnostico"]);

    expect(medida.l).toBe(1);
    expect(medida.clasesHomogeneas).toBe(2);
    expect(medida.filasEnClasesHomogeneas).toBe(4);
  });

  it("ℓ es el de la clase MÁS POBRE, no el promedio", () => {
    // Un promedio diría «2,5, aceptable» mientras alguien queda completamente expuesto. El mínimo
    // es la única lectura honesta de una garantía.
    const tabla = tablaDe(
      ["zona", "diagnostico"],
      [
        ["norte", "J45.9"],
        ["norte", "E11.9"],
        ["norte", "I10.X"],
        ["norte", "F32.1"],
        ["sur", "K21.0"],
        ["sur", "K21.0"],
      ],
    );
    const [medida] = medirDiversidad(tabla, ["zona"], ["diagnostico"]);

    expect(medida.l).toBe(1);
    expect(medida.clases).toBe(2);
    expect(medida.filasEnClasesHomogeneas).toBe(2);
  });

  it("la celda vacía cuenta como un valor: una clase toda en blanco es homogénea", () => {
    // Tratar el vacío como «ausencia de dato» la dejaría pasar por diversa, y no lo es: todos los
    // de esa clase comparten exactamente la misma información.
    const tabla = tablaDe(
      ["zona", "diagnostico"],
      [
        ["norte", ""],
        ["norte", ""],
        ["sur", "E11.9"],
        ["sur", "J45.9"],
      ],
    );
    const [medida] = medirDiversidad(tabla, ["zona"], ["diagnostico"]);
    expect(medida.l).toBe(1);
    expect(medida.clasesHomogeneas).toBe(1);
  });
});

describe("t-closeness — lo que ℓ no ve", () => {
  it("clases que copian la distribución del archivo dan t=0", () => {
    const tabla = tablaDe(
      ["zona", "diagnostico"],
      [
        ["norte", "J45.9"],
        ["norte", "E11.9"],
        ["sur", "J45.9"],
        ["sur", "E11.9"],
      ],
    );
    const [medida] = medirDiversidad(tabla, ["zona"], ["diagnostico"]);

    expect(medida.l).toBe(2);
    expect(medida.t).toBeCloseTo(0, 10);
    expect(medida.metrica).toBe("variacion-total");
  });

  it("una clase concentrada en un valor da la distancia máxima", () => {
    // ½·Σ|p−q| con p=(1,0) y q=(0,5, 0,5) es 0,5.
    const tabla = tablaDe(
      ["zona", "diagnostico"],
      [
        ["norte", "J45.9"],
        ["norte", "J45.9"],
        ["sur", "E11.9"],
        ["sur", "E11.9"],
      ],
    );
    const [medida] = medirDiversidad(tabla, ["zona"], ["diagnostico"]);
    expect(medida.t).toBeCloseTo(0.5, 10);
  });

  it("ℓ puede aprobar donde t reprueba — que es la razón de medir las dos", () => {
    // La clase «norte» tiene 3 valores distintos (ℓ=3, aprobado) y aun así es 80 % de un
    // diagnóstico que en el archivo entero pesa mucho menos. ℓ no lo ve; t sí.
    const norte = [
      ...Array.from({ length: 8 }, () => ["norte", "B24.X"]),
      ["norte", "E11.9"],
      ["norte", "J45.9"],
    ];
    const sur = Array.from({ length: 30 }, (_, i) => [
      "sur",
      ["E11.9", "J45.9", "I10.X"][i % 3],
    ]);
    const tabla = tablaDe(["zona", "diagnostico"], [...norte, ...sur]);
    const [medida] = medirDiversidad(tabla, ["zona"], ["diagnostico"]);

    expect(medida.l).toBe(3);
    expect(medida.t).toBeGreaterThan(0.5);
  });

  it("la distancia cuenta los valores AUSENTES de la clase, no solo los presentes", () => {
    // El atajo de sumar solo sobre lo presente daría 0 para una clase de un único valor que en el
    // archivo es mayoritario. Es un dominio de 4 valores y la clase solo tiene uno: eso es lejano.
    const filas = [
      ...Array.from({ length: 6 }, () => ["a", "X"]),
      ...["P", "Q", "R"].flatMap((v) =>
        Array.from({ length: 6 }, () => ["b", v]),
      ),
    ];
    const [medida] = medirDiversidad(
      tablaDe(["zona", "s"], filas),
      ["zona"],
      ["s"],
    );
    expect(medida.t).toBeCloseTo(0.75, 10);
  });
});

describe("se mide, no se optimiza (ADR-002 §4)", () => {
  it("varios atributos sensibles se reportan por separado", () => {
    const tabla = tablaDe(
      ["zona", "diagnostico", "grupo_etnico"],
      [
        ["norte", "J45.9", "Ninguno"],
        ["norte", "J45.9", "Rrom"],
        ["sur", "E11.9", "Ninguno"],
        ["sur", "I10.X", "Ninguno"],
      ],
    );
    const medidas = medirDiversidad(
      tabla,
      ["zona"],
      ["diagnostico", "grupo_etnico"],
    );

    expect(medidas.map((m) => m.atributo)).toEqual([
      "diagnostico",
      "grupo_etnico",
    ]);
    expect(medidas[0].l).toBe(1);
    expect(medidas[1].l).toBe(1);
  });

  it("no toca la tabla: es una medición, no una transformación", () => {
    const tabla = tablaDe(
      ["zona", "diagnostico"],
      [
        ["norte", "J45.9"],
        ["norte", "J45.9"],
      ],
    );
    const antes = tabla.columnas.map((c) => [...c.codigos]);
    medirDiversidad(tabla, ["zona"], ["diagnostico"]);
    expect(tabla.columnas.map((c) => [...c.codigos])).toEqual(antes);
  });

  it("sin cuasi-identificadores hay una sola clase, y su distancia es cero", () => {
    const tabla = tablaDe(["diagnostico"], [["J45.9"], ["E11.9"], ["I10.X"]]);
    const [medida] = medirDiversidad(tabla, [], ["diagnostico"]);

    expect(medida.clases).toBe(1);
    expect(medida.l).toBe(3);
    expect(medida.t).toBeCloseTo(0, 10);
  });

  it("una tabla sin filas da ℓ=0, no infinito", () => {
    const [medida] = medirDiversidad(tablaDe(["s"], []), [], ["s"]);
    expect(medida.clases).toBe(0);
    expect(medida.l).toBe(0);
    expect(medida.t).toBe(0);
  });

  it("un atributo que no existe en la tabla no inventa una medida", () => {
    const tabla = tablaDe(["zona"], [["norte"], ["sur"]]);
    expect(medirDiversidad(tabla, ["zona"], ["no_existe"])).toEqual([]);
  });
});

describe("sobre una tabla ya repartida por Mondrian", () => {
  it("k≥5 alcanzado y aun así el diagnóstico puede quedar homogéneo — con el número a la vista", () => {
    // La composición completa del sprint: Mondrian entrega su k, y estas dos métricas dicen qué
    // queda expuesto DENTRO de ese k. Ninguna de las dos cifras contradice a la otra; juntas son la
    // verdad, y por separado cualquiera de ellas tranquiliza de más.
    const [encabezado, ...datos] = [
      ...generarFilas({
        filas: 3_000,
        seed: 42,
        perfil: "mediana-repetida",
        tasaInvalida: 0.08,
        tasaVacia: 0.03,
      }),
    ] as string[][];
    const tabla = tablaDe(encabezado, datos);

    const qis = ["edad_reportada", "puntaje_triage", "municipio", "estrato"];
    const { tabla: repartida, kAlcanzado } = anonimizarConMondrian(
      tabla,
      qis,
      5,
    );
    expect(kAlcanzado).toBeGreaterThanOrEqual(5);

    const [medida] = medirDiversidad(repartida, qis, ["diagnostico"]);
    expect(medida.clases).toBeGreaterThan(50);
    expect(medida.l).toBeGreaterThanOrEqual(1);
    expect(medida.t).toBeGreaterThan(0);
    expect(medida.t).toBeLessThanOrEqual(1);
    // El dato que la UI tiene que enseñar junto al k: cuánta gente vive en una clase homogénea.
    expect(medida.filasEnClasesHomogeneas).toBeLessThanOrEqual(tabla.filas);
  });
});
