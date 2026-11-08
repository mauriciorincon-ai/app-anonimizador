// La generalización óptima (S7) promete UNA cosa difícil de ver a ojo: que de todas las
// combinaciones de niveles elige la que cumple k (y la ℓ distinta pedida) perdiendo menos bits, sin
// revisarlas todas. Aquí se le cree solo contra una referencia que SÍ las revisa todas: una fuerza
// bruta escrita aparte, sin nada de OLA, sobre tablas pequeñas sembradas. Si la poda de OLA perdiera
// un nodo, o el desempate dependiera del orden de la búsqueda, la fuerza bruta lo vería.

import { describe, expect, it } from "vitest";

import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { nivelesDe, SUPRIMIDO, type Jerarquia } from "@/engine/jerarquias";
import {
  compararNodos,
  generalizacionAplicada,
  generalizarOptimo,
  resolverDiversidad,
  TOPE_DE_NODOS,
  type DiversidadPedida,
} from "@/engine/optima";
import type { Politica } from "@/engine/politica";
import { aplicarPolitica } from "@/engine/tecnicas";

function tablaDe(
  encabezado: readonly string[],
  filas: readonly string[][],
): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length || 1);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

/** mulberry32: un PRNG sembrado, para que cada caso salga igual en cada corrida. */
function sembrado(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entropia(valores: readonly string[]): number {
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let h = 0;
  for (const n of cuenta.values()) {
    const p = n / valores.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * La referencia: TODOS los nodos de la retícula, medidos uno por uno sobre las filas, y el mejor por
 * el desempate declarado. Si ninguno cumple, el de arriba.
 */
function fuerzaBruta(
  encabezado: readonly string[],
  filas: readonly string[][],
  dimensiones: readonly string[],
  jerarquias: Readonly<Record<string, Jerarquia>>,
  k: number,
  diversidad: DiversidadPedida | null,
): { nodo: number[]; k: number; l: number | null; cumple: boolean } {
  const indices = dimensiones.map((d) => encabezado.indexOf(d));
  const sensibles = (diversidad?.columnas ?? []).map((c) =>
    encabezado.indexOf(c),
  );
  const niveles = dimensiones.map((d) =>
    nivelesDe(jerarquias[d] ?? { tipo: "supresion" }),
  );
  const alturas = niveles.map((n) => n.length - 1);
  const originales = indices.map((i) => filas.map((f) => f[i] ?? ""));

  const medir = (nodo: readonly number[]) => {
    const generalizadas = niveles.map((n, i) => originales[i].map(n[nodo[i]]));
    const clases = new Map<string, { n: number; sensibles: Set<string>[] }>();
    filas.forEach((fila, r) => {
      const clave = JSON.stringify(generalizadas.map((g) => g[r]));
      let clase = clases.get(clave);
      if (!clase) {
        clase = { n: 0, sensibles: sensibles.map(() => new Set()) };
        clases.set(clave, clase);
      }
      clase.n++;
      sensibles.forEach((s, j) => clase!.sensibles[j].add(fila[s] ?? ""));
    });
    const tamanos = [...clases.values()];
    const kNodo = Math.min(...tamanos.map((c) => c.n));
    const lNodo =
      sensibles.length === 0
        ? null
        : Math.min(...tamanos.flatMap((c) => c.sensibles.map((s) => s.size)));
    const perdida = generalizadas.reduce(
      (s, g, i) => s + entropia(originales[i]) - entropia(g),
      0,
    );
    return { k: kNodo, l: lNodo, perdida };
  };

  const nodos: number[][] = [];
  const recorrer = (i: number, actual: number[]) => {
    if (i === alturas.length) return void nodos.push([...actual]);
    for (let v = 0; v <= alturas[i]; v++) recorrer(i + 1, [...actual, v]);
  };
  recorrer(0, []);

  let mejor: {
    nodo: number[];
    perdida: number;
    k: number;
    l: number | null;
  } | null = null;
  for (const nodo of nodos) {
    const m = medir(nodo);
    const cumple =
      m.k >= k && (diversidad === null || (m.l ?? 0) >= diversidad.l);
    if (!cumple) continue;
    const candidato = { nodo, perdida: m.perdida, k: m.k, l: m.l };
    if (mejor === null || compararNodos(candidato, mejor) < 0)
      mejor = candidato;
  }
  if (mejor) return { nodo: mejor.nodo, k: mejor.k, l: mejor.l, cumple: true };
  const arriba = medir(alturas);
  return { nodo: alturas, k: arriba.k, l: arriba.l, cumple: false };
}

// ── Las tablas sembradas ────────────────────────────────────────────────────────────────────────

const ESCALERAS: Record<string, Jerarquia> = {
  edad: { tipo: "edad-dane" },
  nacimiento: { tipo: "fecha" },
  municipio: { tipo: "divipola" },
  actividad: { tipo: "ciiu" },
  ingreso: { tipo: "rango", amplitudes: [5, 10, 20] },
  codigo: { tipo: "prefijo", largos: [3, 1] },
  // `sexo` no tiene escalera: sube por la de solo supresión.
};

const MUNICIPIOS = [
  "05001",
  "05002",
  "08001",
  "11001",
  "76001",
  "76054",
  "99999",
  "Argelia",
  "Medellín",
  "",
];
const ACTIVIDADES = ["0111", "0112", "1410", "141", "4711", "8610", "9999", ""];

function celda(columna: string, azar: () => number): string {
  const elegir = <T>(lista: readonly T[]) =>
    lista[Math.floor(azar() * lista.length)];
  switch (columna) {
    case "edad":
      return azar() < 0.08
        ? elegir(["", "abc", "130"])
        : String(Math.floor(azar() * 96));
    case "nacimiento": {
      const anio = 1950 + Math.floor(azar() * 4);
      const mes = String(1 + Math.floor(azar() * 12)).padStart(2, "0");
      return `${anio}-${mes}-${String(1 + Math.floor(azar() * 28)).padStart(2, "0")}`;
    }
    case "municipio":
      return elegir(MUNICIPIOS);
    case "actividad":
      return elegir(ACTIVIDADES);
    case "ingreso":
      return String(Math.floor(azar() * 60));
    case "codigo":
      return elegir(["ABC1", "ABD2", "AXY3", "BQQ4", "B"]);
    case "sexo":
      return elegir(["F", "M"]);
    default:
      return elegir(["gripe", "asma", "diabetes", "migraña"]);
  }
}

const COLUMNAS = [
  "edad",
  "nacimiento",
  "municipio",
  "actividad",
  "ingreso",
  "codigo",
  "sexo",
];

interface Caso {
  readonly semilla: number;
  readonly encabezado: string[];
  readonly filas: string[][];
  readonly dimensiones: string[];
  readonly k: number;
  readonly diversidad: DiversidadPedida | null;
}

function caso(semilla: number, conL: boolean): Caso {
  const azar = sembrado(semilla);
  const cuantas = 2 + Math.floor(azar() * 2);
  const disponibles = [...COLUMNAS];
  const dimensiones: string[] = [];
  for (let i = 0; i < cuantas; i++)
    dimensiones.push(
      disponibles.splice(Math.floor(azar() * disponibles.length), 1)[0],
    );
  const encabezado = [...dimensiones, "diagnostico"];
  const filas = Array.from({ length: 8 + Math.floor(azar() * 25) }, () =>
    encabezado.map((c) => celda(c, azar)),
  );
  return {
    semilla,
    encabezado,
    filas,
    dimensiones,
    k: 2 + Math.floor(azar() * 3),
    diversidad: conL ? { l: 2, columnas: ["diagnostico"] } : null,
  };
}

describe("el óptimo de OLA es el de la fuerza bruta", () => {
  for (const conL of [false, true]) {
    it(`en 60 tablas sembradas ${conL ? "con ℓ = 2" : "sin ℓ"}: mismo nodo, mismo k, misma ℓ`, () => {
      let podadas = 0;
      let interiores = 0;
      for (let semilla = 1; semilla <= 60; semilla++) {
        const c = caso(semilla + (conL ? 1000 : 0), conL);
        const tabla = tablaDe(c.encabezado, c.filas);
        const ola = generalizarOptimo(
          tabla,
          c.dimensiones,
          ESCALERAS,
          c.k,
          c.diversidad,
        );
        const referencia = fuerzaBruta(
          c.encabezado,
          c.filas,
          c.dimensiones,
          ESCALERAS,
          c.k,
          c.diversidad,
        );
        const donde = `semilla ${c.semilla}: ${c.dimensiones.join(",")} k=${c.k}`;
        // OLA ordena las dimensiones como la tabla; aquí también, porque el encabezado las pone primero.
        expect(ola.dimensiones, donde).toEqual(c.dimensiones);
        expect(ola.niveles, donde).toEqual(referencia.nodo);
        expect(ola.alcanzado, donde).toBe(referencia.cumple);
        expect(ola.kAlcanzado, donde).toBe(referencia.k);
        expect(ola.lAlcanzado, donde).toBe(referencia.l);
        if (ola.nodosRevisados < ola.nodosEnLaReticula) podadas++;
        // Un nodo que no es ni el de abajo ni el de arriba: donde la poda se podría equivocar.
        if (
          ola.niveles.some((n) => n > 0) &&
          ola.niveles.some((n, i) => n < ola.alturas[i])
        )
          interiores++;
      }
      // Y no las revisó todas: la poda existe, no es una fuerza bruta disfrazada.
      expect(podadas).toBeGreaterThan(30);
      // Y la mayoría de los casos exigió buscar de verdad.
      expect(interiores).toBeGreaterThan(30);
    });
  }

  it("la tabla de salida es la de su nodo: cada celda, en el nivel elegido de su escalera", () => {
    const c = caso(7, false);
    const tabla = tablaDe(c.encabezado, c.filas);
    const ola = generalizarOptimo(tabla, c.dimensiones, ESCALERAS, c.k, null);
    c.dimensiones.forEach((d, i) => {
      const nivel = nivelesDe(ESCALERAS[d] ?? { tipo: "supresion" })[
        ola.niveles[i]
      ];
      const columna = ola.tabla.columnas.find((x) => x.nombre === d)!;
      c.filas.forEach((fila, r) =>
        expect(columna.valores[columna.codigos[r]]).toBe(
          nivel(fila[c.encabezado.indexOf(d)]),
        ),
      );
    });
    // La columna que no es dimensión sale intacta.
    const diagnostico = ola.tabla.columnas.find(
      (x) => x.nombre === "diagnostico",
    )!;
    expect(diagnostico).toBe(
      tabla.columnas.find((x) => x.nombre === "diagnostico"),
    );
  });
});

describe("los bordes, dichos", () => {
  const FILAS = [
    ["34", "05001"],
    ["36", "05002"],
    ["52", "76001"],
    ["58", "76054"],
  ];

  it("si el nodo de abajo ya cumple, no generaliza nada", () => {
    const tabla = tablaDe(["edad", "municipio"], [...FILAS, ...FILAS]);
    const r = generalizarOptimo(
      tabla,
      ["edad", "municipio"],
      ESCALERAS,
      2,
      null,
    );
    expect(r.niveles).toEqual([0, 0]);
    expect(r.alcanzado).toBe(true);
    expect(r.bitsDespues).toBe(r.bitsAntes);
  });

  it("menos filas que k: aplica lo más que se puede (todo `*`) y dice «no alcanzado»", () => {
    const tabla = tablaDe(["edad", "municipio"], FILAS);
    const r = generalizarOptimo(
      tabla,
      ["edad", "municipio"],
      ESCALERAS,
      5,
      null,
    );
    expect(r.alcanzado).toBe(false);
    expect(r.motivo).toBe("no-alcanzable");
    expect(r.niveles).toEqual(r.alturas);
    expect(r.kAlcanzado).toBe(4);
    expect(
      r.tabla.columnas[0].valores.filter((v, i) =>
        r.tabla.columnas[0].codigos.includes(i),
      ),
    ).toEqual([SUPRIMIDO]);
  });

  it("una ℓ imposible (un solo diagnóstico) tampoco se alcanza, y se dice", () => {
    const tabla = tablaDe(
      ["edad", "municipio", "diagnostico"],
      FILAS.map((f) => [...f, "asma"]),
    );
    const r = generalizarOptimo(tabla, ["edad", "municipio"], ESCALERAS, 2, {
      l: 2,
      columnas: ["diagnostico"],
    });
    expect(r.alcanzado).toBe(false);
    expect(r.lAlcanzado).toBe(1);
  });

  it("sin dimensiones o sin filas, no hace nada y lo nombra", () => {
    const tabla = tablaDe(
      ["edad"],
      FILAS.map((f) => [f[0]]),
    );
    expect(generalizarOptimo(tabla, [], ESCALERAS, 2, null).motivo).toBe(
      "sin-dimensiones",
    );
    expect(
      generalizarOptimo(tablaDe(["edad"], []), ["edad"], ESCALERAS, 2, null)
        .motivo,
    ).toBe("sin-dimensiones");
  });

  it("S10: columnas llamadas como lo que hereda un objeto (constructor, toString) suben por supresión", () => {
    const nombres = ["constructor", "toString", "__proto__"];
    const tabla = tablaDe(nombres, [
      ["a", "x", "1"],
      ["a", "y", "1"],
      ["b", "x", "2"],
      ["b", "y", "2"],
    ]);
    const r = generalizarOptimo(tabla, nombres, {}, 2, null);
    expect(r.motivo).toBeNull();
    expect(r.kAlcanzado).toBeGreaterThanOrEqual(2);
    const aplicada = generalizacionAplicada(r, {
      algoritmo: "optima",
      jerarquias: {},
    });
    expect(aplicada.columnas.map((c) => c.jerarquia.tipo)).toEqual(
      r.dimensiones.map(() => "supresion"),
    );
  });

  it(`una retícula de más de ${TOPE_DE_NODOS} nodos no se recorre: tabla intacta y «excede-tope»`, () => {
    const larga: Jerarquia = {
      tipo: "rango",
      amplitudes: [1, 2, 4, 8, 16, 32],
    };
    const nombres = ["a", "b", "c", "d", "e"];
    const tabla = tablaDe(nombres, [["1", "2", "3", "4", "5"]]);
    const r = generalizarOptimo(
      tabla,
      nombres,
      Object.fromEntries(nombres.map((n) => [n, larga])),
      2,
      null,
    );
    expect(r.nodosEnLaReticula).toBe(8 ** 5);
    expect(r.motivo).toBe("excede-tope");
    expect(r.nodosRevisados).toBe(0);
    expect(r.tabla).toBe(tabla);
  });
});

describe("determinismo (regla dura 3)", () => {
  it("dos corridas dan el mismo nodo, la misma tabla y la misma cuenta de nodos", () => {
    const c = caso(42, true);
    const una = generalizarOptimo(
      tablaDe(c.encabezado, c.filas),
      c.dimensiones,
      ESCALERAS,
      c.k,
      c.diversidad,
    );
    const otra = generalizarOptimo(
      tablaDe(c.encabezado, c.filas),
      c.dimensiones,
      ESCALERAS,
      c.k,
      c.diversidad,
    );
    expect(otra.niveles).toEqual(una.niveles);
    expect(otra.nodosRevisados).toBe(una.nodosRevisados);
    for (let i = 0; i < una.tabla.columnas.length; i++) {
      const a = una.tabla.columnas[i];
      const b = otra.tabla.columnas[i];
      expect(Array.from(b.codigos, (x) => b.valores[x])).toEqual(
        Array.from(a.codigos, (x) => a.valores[x]),
      );
    }
  });

  it("el desempate es fijo: menor pérdida → menor suma de niveles → vector menor", () => {
    const a = { perdida: 1, nodo: [1, 0] };
    expect(compararNodos(a, { perdida: 2, nodo: [0, 0] })).toBeLessThan(0);
    expect(compararNodos(a, { perdida: 1, nodo: [1, 1] })).toBeLessThan(0);
    expect(compararNodos(a, { perdida: 1, nodo: [0, 1] })).toBeGreaterThan(0);
    // Una diferencia de redondeo no es una diferencia de información.
    expect(
      compararNodos(a, { perdida: 1 + 1e-12, nodo: [0, 1] }),
    ).toBeGreaterThan(0);
  });
});

// M2 de la auditoría del S7: con la ℓ pedida sobre una columna sensible que la política SUPRIME, la
// transformación la buscaba en una tabla donde ya no estaba, no encontraba con qué medir la ℓ, y
// subía todo a `*` («no alcanzable») mientras la comparación —que sí la veía— mostraba un nodo
// normal. Ahora las dos pasan por `resolverDiversidad`: lo suprimido se descarta y se dice.
describe("la ℓ y las columnas sensibles que la política suprime", () => {
  // 20 edades distintas, una vez cada una: el k = 3 se cumple en el nivel de 5 años, sin subir a `*`.
  const filas = Array.from({ length: 20 }, (_, i) => [
    String(20 + i),
    ["gripe", "asma", "diabetes"][i % 3],
  ]);
  const original = tablaDe(["edad", "dx"], filas);
  const escaleras: Record<string, Jerarquia> = {
    edad: { tipo: "rango", amplitudes: [5, 10, 20] },
  };
  const politica: Politica = {
    version: 1,
    origen: "manual",
    kObjetivo: 3,
    reglas: [
      { columna: "edad", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "dx", tecnica: { tipo: "suprimir" } },
    ],
    generalizacion: {
      algoritmo: "optima",
      jerarquias: { edad: { tipo: "rango", amplitudes: [5, 10, 20] } },
      diversidad: { l: 2, columnas: ["dx"] },
    },
  };

  it("resolverDiversidad: lo suprimido se descarta, lo del reparto y lo que no existe se ignoran", () => {
    const pedida = { l: 2, columnas: ["dx", "edad", "fantasma", "sexo", "dx"] };
    const existentes = new Set(["edad", "dx", "sexo"]);
    expect(
      resolverDiversidad(pedida, ["edad"], existentes, new Set(["dx"])),
    ).toEqual({
      columnas: ["sexo"],
      descartadas: ["dx"],
    });
    expect(resolverDiversidad(pedida, ["edad"], existentes, new Set())).toEqual(
      {
        columnas: ["dx", "sexo"],
        descartadas: [],
      },
    );
    expect(resolverDiversidad(null, ["edad"], existentes, new Set())).toEqual({
      columnas: [],
      descartadas: [],
    });
  });

  it("sin ninguna sensible sobre la que medirla, la ℓ no se exige y no sube todo a `*`", () => {
    const sinL = generalizarOptimo(original, ["edad"], escaleras, 3, null);
    const conL = generalizarOptimo(
      original,
      ["edad"],
      escaleras,
      3,
      { l: 2, columnas: ["dx"] },
      new Set(["dx"]),
    );
    expect(conL.lObjetivo).toBeNull();
    expect(conL.lDescartadas).toEqual(["dx"]);
    expect(conL.columnasSensibles).toEqual([]);
    expect(conL.alcanzado).toBe(true);
    expect(conL.niveles).toEqual(sinL.niveles);
    // Nivel de 5 años, no la cima: la cima habría sido el síntoma.
    expect(conL.niveles[0]).toBeLessThan(conL.alturas[0]);
  });

  it("la transformación y la comparación eligen el mismo nodo", async () => {
    const transformada = await aplicarPolitica(original, politica, null, "es");
    // Lo que hace la comparación del worker: la tabla ORIGINAL (con `dx`) y el mismo conjunto de
    // suprimidas que sale de la política.
    const comparada = generalizarOptimo(
      original,
      ["edad"],
      escaleras,
      3,
      politica.generalizacion!.diversidad!,
      new Set(["dx"]),
    );
    expect(transformada.optima).not.toBeNull();
    expect(transformada.optima!.niveles).toEqual(comparada.niveles);
    expect(transformada.optima!.alcanzado).toBe(true);
    expect(transformada.optima!.lDescartadas).toEqual(["dx"]);
    expect(transformada.optima!.niveles[0]).toBeLessThan(
      transformada.optima!.alturas[0],
    );
    expect(transformada.suprimidas).toEqual(["dx"]);
  });

  it("si la sensible NO se suprime, la ℓ se sigue exigiendo", () => {
    const conservada = generalizarOptimo(original, ["edad"], escaleras, 3, {
      l: 2,
      columnas: ["dx"],
    });
    expect(conservada.lObjetivo).toBe(2);
    expect(conservada.columnasSensibles).toEqual(["dx"]);
    expect(conservada.lDescartadas).toEqual([]);
    expect(conservada.lAlcanzado).toBeGreaterThanOrEqual(2);
  });
});
