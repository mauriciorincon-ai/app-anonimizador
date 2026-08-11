// EL GATE DE COMPOSICIÓN — el patrón `la-composicion-de-verdades-puede-mentir`, en forma de test.
//
// Lo que se protege aquí no es una cifra: es dónde va la cifra. «Riesgo reducido 92 %» junto a una
// cédula intacta son dos afirmaciones verdaderas cuya suma dice algo falso — que el archivo está
// tratado. Ningún test de valor la ve, porque no hay ningún valor equivocado.
//
// Por eso estos tests miran ESTRUCTURA: que la salvedad exista, que vaya PRIMERA, y que la cifra
// deje de poder presentarse sola. La versión de esto en el documento exportado —el orden real de
// lectura— vive en `reporte.test.ts`.

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import {
  balanceDelTratamiento,
  type EntradasDelBalance,
} from "@/engine/balance";
import { clasificar } from "@/engine/clasificador";
import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import { medirDiversidad } from "@/engine/diversidad";
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

function delKit(perfil: string, filas: number): TablaColumnar {
  const [encabezado, ...datos] = [
    ...generarFilas({
      filas,
      seed: 42,
      perfil,
      tasaInvalida: 0.08,
      tasaVacia: 0.03,
    }),
  ];
  return tablaDe(encabezado as string[], datos as string[][]);
}

function politicaDe(
  reglas: Politica["reglas"],
  kObjetivo: number | null = null,
): Politica {
  return { version: 1, origen: "manual", kObjetivo, reglas };
}

/** El pipeline entero, tal como lo correrá la UI: transformar, medir, componer. */
async function balanceDe(
  tabla: TablaColumnar,
  politica: Politica,
  sensibles: readonly string[] = [],
) {
  const diagnostico = clasificar(tabla);
  const transformada = await aplicarPolitica(tabla, politica, null);
  const qis = diagnostico.columnas
    .filter((c) => c.categoria === "cuasi-identificador")
    .map((c) => c.nombre)
    .filter((n) => !transformada.suprimidas.includes(n));

  const entradas: EntradasDelBalance = {
    tablaOriginal: tabla,
    tablaTransformada: transformada.tabla,
    diagnostico,
    politica,
    suprimidas: transformada.suprimidas,
    colisiones: transformada.colisiones,
    pendientesDeMondrian: transformada.pendientesDeMondrian,
    mondrian: transformada.mondrian,
    diversidad: medirDiversidad(transformada.tabla, qis, sensibles),
  };
  return { ...balanceDelTratamiento(entradas), transformada, diagnostico };
}

// ── El caso prohibido, escrito como caso ──────────────────────────────────────────────────────

describe("«riesgo reducido 92 %» junto a una cédula intacta", () => {
  it("la cifra deja de poder presentarse sola, y la salvedad va PRIMERA", async () => {
    const tabla = delKit("clinico", 800);
    // Una política que trata de verdad los cuasi-identificadores… y no toca la cédula.
    const balance = await balanceDe(
      tabla,
      politicaDe(
        ["fecha_nacimiento", "latitud", "longitud", "ip_registro"].map(
          (columna) => ({ columna, tecnica: { tipo: "suprimir" as const } }),
        ),
      ),
    );

    // La reducción es real y grande —del 100 % al 13 % de únicos—: ese es justo el problema.
    expect(balance.reduccion).toBeGreaterThan(0.8);
    // Y aun así no puede ir de titular.
    expect(balance.esTitular).toBe(false);
    expect(balance.salvedades[0].tipo).toBe("identificadores-sin-tratar");
    expect(balance.salvedades[0].gravedad).toBe("descalifica");
  });

  it("nombra las columnas que quedaron intactas, no solo cuántas", async () => {
    const tabla = tablaDe(
      ["cedula_titular", "correo", "municipio", "estrato"],
      Array.from({ length: 60 }, (_, i) => [
        String(1_000_000_000 + i),
        `persona${i}@ejemplo.com`,
        ["Bogotá", "Cali", "Medellín"][i % 3],
        String((i % 6) + 1),
      ]),
    );
    const balance = await balanceDe(
      tabla,
      politicaDe([{ columna: "correo", tecnica: { tipo: "suprimir" } }]),
    );

    const salvedad = balance.salvedades.find(
      (s) => s.tipo === "identificadores-sin-tratar",
    );
    expect(salvedad).toBeDefined();
    if (salvedad?.tipo === "identificadores-sin-tratar") {
      expect(salvedad.columnas).toContain("cedula_titular");
    }
  });

  it("tratando TODOS los identificadores directos, la cifra sí puede ir de titular", async () => {
    // El complemento: sin él, un `esTitular` cableado a `false` pasaría el test anterior.
    const tabla = tablaDe(
      ["cedula_titular", "municipio", "estrato"],
      Array.from({ length: 120 }, (_, i) => [
        String(1_000_000_000 + i),
        `Municipio ${i % 40}`,
        String((i % 6) + 1),
      ]),
    );
    const balance = await balanceDe(
      tabla,
      politicaDe(
        [
          { columna: "cedula_titular", tecnica: { tipo: "suprimir" } },
          { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
          { columna: "estrato", tecnica: { tipo: "generalizar-automatico" } },
        ],
        5,
      ),
    );

    expect(
      balance.salvedades.filter((s) => s.gravedad === "descalifica"),
    ).toEqual([]);
    expect(balance.antes.unicos).toBeGreaterThan(0);
    expect(balance.despues.unicos).toBe(0);
    expect(balance.esTitular).toBe(true);
  });
});

// ── Cada salvedad, con el caso que la produce ─────────────────────────────────────────────────

describe("las salvedades salen de números medidos, no de heurísticas", () => {
  it("quedan registros solos después del tratamiento y se dicen con su cuenta", async () => {
    const tabla = tablaDe(
      ["municipio", "estrato"],
      [
        ...Array.from({ length: 40 }, (_, i) => [
          ["Bogotá", "Cali"][i % 2],
          String((i % 2) + 1),
        ]),
        ["Leticia", "6"], // el único: nadie más comparte su combinación
      ],
    );
    const balance = await balanceDe(tabla, politicaDe([]));

    const salvedad = balance.salvedades.find(
      (s) => s.tipo === "unicos-restantes",
    );
    expect(salvedad?.gravedad).toBe("descalifica");
    if (salvedad?.tipo === "unicos-restantes") {
      expect(salvedad.cuantos).toBe(1);
    }
  });

  it("el k del reparto NO es el del archivo, y eso es una salvedad", async () => {
    // El engaño que la Fase 3 dejó exhibido, aquí convertido en algo que la pantalla no puede
    // callar: Mondrian entrega k=5 sobre `estrato`, y `municipio` —cuasi-identificador que la
    // política conserva— parte esas clases.
    const tabla = tablaDe(
      ["estrato", "municipio"],
      Array.from({ length: 90 }, (_, i) => [
        String((i % 6) + 1),
        `Municipio ${i % 30}`,
      ]),
    );
    const balance = await balanceDe(
      tabla,
      politicaDe(
        [{ columna: "estrato", tecnica: { tipo: "generalizar-automatico" } }],
        5,
      ),
    );

    const salvedad = balance.salvedades.find(
      (s) => s.tipo === "k-del-reparto-no-es-el-del-archivo",
    );
    expect(salvedad?.gravedad).toBe("descalifica");
    if (salvedad?.tipo === "k-del-reparto-no-es-el-del-archivo") {
      expect(salvedad.kDelArchivo).toBeLessThan(salvedad.kDelReparto);
    }
  });

  it("un k que no se alcanzó se declara con los dos números", async () => {
    const tabla = tablaDe(
      ["estrato"],
      Array.from({ length: 4 }, (_, i) => [String(i)]),
    );
    const balance = await balanceDe(
      tabla,
      politicaDe(
        [{ columna: "estrato", tecnica: { tipo: "generalizar-automatico" } }],
        50,
      ),
    );

    const salvedad = balance.salvedades.find(
      (s) => s.tipo === "k-no-alcanzado",
    );
    expect(salvedad?.gravedad).toBe("descalifica");
    if (salvedad?.tipo === "k-no-alcanzado") {
      expect(salvedad.kObjetivo).toBe(50);
      expect(salvedad.kAlcanzado).toBe(4);
    }
  });

  it("las clases homogéneas MATIZAN: no desmienten la reducción, la acompañan", async () => {
    const tabla = tablaDe(
      ["municipio", "diagnostico"],
      [
        ...Array.from({ length: 20 }, () => ["Bogotá", "J45.9"]),
        ...Array.from({ length: 20 }, (_, i) => [
          "Cali",
          ["E11.9", "I10.X"][i % 2],
        ]),
      ],
    );
    const balance = await balanceDe(tabla, politicaDe([]), ["diagnostico"]);

    const salvedad = balance.salvedades.find(
      (s) => s.tipo === "clases-homogeneas",
    );
    expect(salvedad?.gravedad).toBe("matiza");
    if (salvedad?.tipo === "clases-homogeneas") {
      expect(salvedad.filas).toBe(20);
    }
  });

  it("las descalificantes van antes que las que solo matizan, siempre", async () => {
    const tabla = tablaDe(
      ["cedula_titular", "municipio", "diagnostico"],
      [
        ...Array.from({ length: 20 }, (_, i) => [
          String(1_000_000_000 + i),
          "Bogotá",
          "J45.9",
        ]),
        ...Array.from({ length: 20 }, (_, i) => [
          String(1_100_000_000 + i),
          "Cali",
          ["E11.9", "I10.X"][i % 2],
        ]),
      ],
    );
    const balance = await balanceDe(tabla, politicaDe([]), ["diagnostico"]);

    const gravedades = balance.salvedades.map((s) => s.gravedad);
    expect(gravedades).toContain("descalifica");
    expect(gravedades).toContain("matiza");
    expect(gravedades.lastIndexOf("descalifica")).toBeLessThan(
      gravedades.indexOf("matiza"),
    );
  });
});

describe("las colisiones de seudónimo llegan al balance", () => {
  it("se reportan por columna y solo MATIZAN la cifra", async () => {
    // Vienen del pipeline, no se recalculan aquí: el balance compone lo que las otras fases
    // midieron. Se inyectan directamente porque provocar una colisión real exige medio millón de
    // valores, y lo que este módulo decide es dónde va la salvedad, no cuántas hubo.
    const tabla = tablaDe(
      ["municipio", "estrato"],
      Array.from({ length: 40 }, (_, i) => [
        ["Bogotá", "Cali"][i % 2],
        String((i % 2) + 1),
      ]),
    );
    const diagnostico = clasificar(tabla);
    const politica = politicaDe([]);
    const balance = balanceDelTratamiento({
      tablaOriginal: tabla,
      tablaTransformada: tabla,
      diagnostico,
      politica,
      pendientesDeMondrian: [],
      suprimidas: [],
      colisiones: [{ columna: "nit_empresa", cuantas: 3 }],
      mondrian: null,
      diversidad: [],
    });

    const salvedad = balance.salvedades.find(
      (s) => s.tipo === "colisiones-de-seudonimo",
    );
    expect(salvedad?.gravedad).toBe("matiza");
    if (salvedad?.tipo === "colisiones-de-seudonimo") {
      expect(salvedad.columna).toBe("nit_empresa");
      expect(salvedad.cuantas).toBe(3);
    }
  });
});

// ── La cifra misma ────────────────────────────────────────────────────────────────────────────

describe("la reducción, cuando se puede afirmar", () => {
  it("sin únicos antes no hay reducción que medir: null, no 0 % ni 100 %", async () => {
    // 0/0 presentado como «0 %» alarma sin motivo y como «100 %» tranquiliza sin motivo. Las dos
    // serían cifras inventadas en direcciones opuestas.
    const tabla = tablaDe(
      ["municipio", "estrato"],
      Array.from({ length: 40 }, (_, i) => [
        ["Bogotá", "Cali"][i % 2],
        String((i % 2) + 1),
      ]),
    );
    const balance = await balanceDe(tabla, politicaDe([]));

    expect(balance.antes.unicos).toBe(0);
    expect(balance.reduccion).toBeNull();
    expect(balance.esTitular).toBe(false);
  });

  it("las dos medidas salen del mismo modelo, y las columnas de después lo dicen", async () => {
    // Si el riesgo de después se calculara con otro modelo que el de antes, la resta no
    // significaría nada. Y las columnas cruzadas de después son las de antes menos las suprimidas:
    // quien recibe el archivo no tiene esas columnas, así que descontarlas es legítimo — callarlo
    // no lo sería.
    const tabla = delKit("clinico", 500);
    const balance = await balanceDe(
      tabla,
      politicaDe([{ columna: "latitud", tecnica: { tipo: "suprimir" } }]),
    );

    expect(balance.antes.naturaleza).toBe("exacto");
    expect(balance.despues.naturaleza).toBe("exacto");
    expect(balance.antes.qis).toContain("latitud");
    expect(balance.despues.qis).not.toContain("latitud");
    expect(balance.despues.filas).toBe(balance.antes.filas);
  });

  it("una política que no toca nada da reducción 0, no un error", async () => {
    const tabla = delKit("clinico", 300);
    const balance = await balanceDe(tabla, politicaDe([]));
    expect(balance.reduccion).toBe(0);
    expect(balance.esTitular).toBe(false);
  });
});

describe("A1 — la política pide reparto automático y no fija un k", () => {
  // Auditoría del S2. El editor enseñaba un k que la política no tenía, el motor solo reparte con
  // un k declarado, y esas columnas salían INTACTAS sin que ninguna salvedad lo dijera. La única
  // que aparecía era «quedan únicos» — cierta, y muda sobre la causa.
  const CON_REPARTO = politicaDe(
    [
      { columna: "municipio", tecnica: { tipo: "generalizar-automatico" } },
      { columna: "estrato", tecnica: { tipo: "generalizar-automatico" } },
    ],
    null,
  );

  it("lo dice, nombra las columnas, y descalifica la cifra", async () => {
    const balance = await balanceDe(delKit("mediana-repetida", 400), CON_REPARTO);
    const salvedad = balance.salvedades.find((s) => s.tipo === "reparto-sin-k");

    expect(salvedad).toBeDefined();
    expect(salvedad).toMatchObject({
      gravedad: "descalifica",
      columnas: ["municipio", "estrato"],
    });
    expect(balance.esTitular).toBe(false);
  });

  it("y va ANTES que los únicos, porque explica de dónde salen", async () => {
    const balance = await balanceDe(delKit("mediana-repetida", 400), CON_REPARTO);
    const tipos = balance.salvedades.map((s) => s.tipo);
    expect(tipos.indexOf("reparto-sin-k")).toBeLessThan(
      tipos.indexOf("unicos-restantes"),
    );
  });

  it("con el k puesto, la salvedad desaparece — el gate no es una constante", async () => {
    const balance = await balanceDe(
      delKit("mediana-repetida", 400),
      politicaDe(CON_REPARTO.reglas, 5),
    );
    expect(
      balance.salvedades.some((s) => s.tipo === "reparto-sin-k"),
    ).toBe(false);
  });
});
