// Tests del motor de riesgo.
//
// El caso central es una tabla de 12 filas cuyo resultado está calculado A MANO en el propio test.
// Es deliberado: un motor de riesgo verificado solo contra fixtures grandes produce números
// plausibles que nadie ha comprobado nunca. Aquí cualquiera puede seguir la aritmética con un
// lápiz y decidir si el motor tiene razón.

import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { clasificar } from "../../src/engine/clasificador";
import {
  ConstructorColumnar,
  type TablaColumnar,
} from "../../src/engine/columnar";
import {
  aconsejarQis,
  clasesDeEquivalencia,
  evaluarRiesgo,
  riesgoProsecutor,
} from "../../src/engine/riesgo";
import { serializarCanonico } from "../../src/engine/serializacion";

function construir(nombres: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(nombres, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

// ── La tabla de 12 filas, con su resultado calculado a mano ───────────────────────────────────
//
//   sexo · municipio        filas    riesgo por registro
//   ──────────────────────  ─────    ───────────────────
//   F · Bogotá                4          1/4
//   M · Bogotá                3          1/3
//   F · Cali                  2          1/2
//   M · Cali                  2          1/2
//   F · Neiva                 1          1/1   ← esta persona está sola: señalable con el dedo
//                            ──
//                            12  filas en 5 clases de equivalencia
//
//   k mínimo        = 1           (la clase más pequeña tiene una sola fila)
//   riesgo máximo   = 1/1 = 1
//   riesgo promedio = [4×(1/4) + 3×(1/3) + 2×(1/2) + 2×(1/2) + 1×(1/1)] / 12
//                   = (1 + 1 + 1 + 1 + 1) / 12 = 5/12 = 0,41666…
//   únicos          = 1  →  1/12 = 8,33%
const FILAS_A_MANO: string[][] = [
  ["F", "Bogotá"],
  ["F", "Bogotá"],
  ["F", "Bogotá"],
  ["F", "Bogotá"],
  ["M", "Bogotá"],
  ["M", "Bogotá"],
  ["M", "Bogotá"],
  ["F", "Cali"],
  ["F", "Cali"],
  ["M", "Cali"],
  ["M", "Cali"],
  ["F", "Neiva"],
];

const tablaAMano = construir(["sexo", "municipio"], FILAS_A_MANO);

describe("riesgo prosecutor exacto — contra una tabla calculada a mano", () => {
  const clases = clasesDeEquivalencia(tablaAMano.columnas, tablaAMano.filas);
  const riesgo = riesgoProsecutor(
    clases,
    ["sexo", "municipio"],
    tablaAMano.filas,
  );

  it("agrupa las 12 filas en las 5 clases esperadas", () => {
    expect(riesgo.clases).toBe(5);
    expect([...clases.tamanos].sort((a, b) => b - a)).toEqual([4, 3, 2, 2, 1]);
  });

  it("calcula k mínimo, riesgo máximo, promedio y únicos como el cálculo a mano", () => {
    expect(riesgo.kMinimo).toBe(1);
    expect(riesgo.riesgoMaximo).toBe(1);
    expect(riesgo.riesgoPromedio).toBeCloseTo(5 / 12, 12);
    expect(riesgo.unicos).toBe(1);
    expect(riesgo.proporcionUnicos).toBeCloseTo(1 / 12, 12);
  });

  it("la forma cerrada del promedio coincide con la suma registro a registro", () => {
    // El motor calcula el promedio como clases/filas en vez de sumar 500.000 términos de 1/k
    // (que acumularía error de punto flotante en un número que se presenta como EXACTO). Este
    // test confronta las dos formas para que la igualdad no quede en la palabra de un comentario.
    let suma = 0;
    for (let f = 0; f < tablaAMano.filas; f++) {
      suma += 1 / clases.tamanos[clases.ids[f]];
    }
    expect(riesgo.riesgoPromedio).toBeCloseTo(suma / tablaAMano.filas, 12);
  });

  it("se declara EXACTO, no estimado", () => {
    // Los estimadores poblacionales llegan en el S2 y tendrán que ir etiquetados "estimado". La
    // marca existe para que la UI nunca pueda confundir los dos planos.
    expect(riesgo.naturaleza).toBe("exacto");
    expect(riesgo.qis).toEqual(["sexo", "municipio"]);
  });
});

describe("clases de equivalencia — casos límite", () => {
  it("sin QIs, todas las filas caen en una sola clase", () => {
    // Sin nada que distinga a nadie, k = número de filas: el riesgo es el mínimo posible.
    const clases = clasesDeEquivalencia([], tablaAMano.filas);
    const riesgo = riesgoProsecutor(clases, [], tablaAMano.filas);

    expect(riesgo.clases).toBe(1);
    expect(riesgo.kMinimo).toBe(12);
    expect(riesgo.riesgoMaximo).toBeCloseTo(1 / 12, 12);
    expect(riesgo.unicos).toBe(0);
  });

  it("con todas las filas distintas, todo el mundo es único", () => {
    const tabla = construir(
      ["id"],
      Array.from({ length: 25 }, (_, i) => [`v${i}`]),
    );
    const riesgo = riesgoProsecutor(
      clasesDeEquivalencia(tabla.columnas, tabla.filas),
      ["id"],
      tabla.filas,
    );

    expect(riesgo.clases).toBe(25);
    expect(riesgo.kMinimo).toBe(1);
    expect(riesgo.proporcionUnicos).toBe(1);
    expect(riesgo.riesgoPromedio).toBe(1);
  });

  it("con todas las filas iguales, nadie es distinguible", () => {
    const tabla = construir(
      ["c"],
      Array.from({ length: 30 }, () => ["igual"]),
    );
    const riesgo = riesgoProsecutor(
      clasesDeEquivalencia(tabla.columnas, tabla.filas),
      ["c"],
      tabla.filas,
    );

    expect(riesgo.clases).toBe(1);
    expect(riesgo.kMinimo).toBe(30);
    expect(riesgo.unicos).toBe(0);
  });

  it("la celda vacía es un valor más, no una fila que se ignora", () => {
    // Un archivo real trae huecos. Si las filas con vacío se descartaran, el riesgo se calcularía
    // sobre menos gente de la que hay y saldría más bajo de lo que es.
    const tabla = construir(["c"], [["a"], [""], [""], ["a"], ["b"]]);
    const riesgo = riesgoProsecutor(
      clasesDeEquivalencia(tabla.columnas, tabla.filas),
      ["c"],
      tabla.filas,
    );

    expect(riesgo.filas).toBe(5);
    expect(riesgo.clases).toBe(3); // "a", "" y "b"
    expect(riesgo.unicos).toBe(1); // solo "b" queda solo
  });

  it("no se cae con una tabla sin filas", () => {
    const tabla = construir(["a"], []);
    const riesgo = riesgoProsecutor(
      clasesDeEquivalencia(tabla.columnas, 0),
      ["a"],
      0,
    );

    expect(riesgo.clases).toBe(0);
    expect(riesgo.kMinimo).toBe(0);
    expect(riesgo.riesgoMaximo).toBe(0);
    expect(riesgo.proporcionUnicos).toBe(0);
  });

  it("asigna los ids de clase por orden de PRIMERA APARICIÓN", () => {
    // De aquí sale que dos corridas den exactamente la misma partición.
    const tabla = construir(["c"], [["zeta"], ["alfa"], ["zeta"], ["media"]]);
    const clases = clasesDeEquivalencia(tabla.columnas, tabla.filas);

    expect([...clases.ids]).toEqual([0, 1, 0, 2]);
    expect([...clases.tamanos]).toEqual([2, 1, 1]);
  });
});

// ── QI advisor ────────────────────────────────────────────────────────────────────────────────

const OPCIONES_DEL_KIT = {
  filas: 3_000,
  seed: 42,
  perfil: "clinico",
  tasaInvalida: 0.08,
  tasaVacia: 0.03,
} as const;

function tablaDelKit(): TablaColumnar {
  const filas = [...generarFilas(OPCIONES_DEL_KIT)];
  const [encabezado, ...datos] = filas;
  const constructor = new ConstructorColumnar(encabezado, datos.length);
  for (const fila of datos) constructor.agregarFila(fila);
  return constructor.finalizar();
}

describe("QI advisor", () => {
  const tabla = tablaDelKit();
  const diagnostico = clasificar(tabla);
  const advisor = aconsejarQis(tabla, diagnostico);
  const excluidasPorNombre = new Map(
    advisor.excluidas.map((e) => [e.nombre, e.motivo]),
  );

  it("calcula el k REAL de una combinación, verificado a mano", () => {
    // Sobre la tabla de 12 filas: sexo+municipio da las 5 clases de arriba, con k = 1.
    const diagnosticoAMano = clasificar(tablaAMano);
    const consejo = aconsejarQis(tablaAMano, diagnosticoAMano);
    const sexoMunicipio = consejo.combinaciones.find(
      (c) =>
        c.columnas.length === 2 &&
        c.columnas.includes("sexo") &&
        c.columnas.includes("municipio"),
    );

    expect(sexoMunicipio).toBeDefined();
    expect(sexoMunicipio?.k).toBe(1);
    expect(sexoMunicipio?.clases).toBe(5);
    expect(sexoMunicipio?.unicos).toBe(1);
  });

  it("excluye los identificadores directos DICIENDO por qué", () => {
    // Un identificador directo no necesita consejo: identifica solo. Pero el usuario tiene que
    // saber que no se le olvidó, sino que se dejó fuera a propósito.
    expect(excluidasPorNombre.get("cedula_titular")).toMatch(
      /identificador directo/,
    );
    expect(excluidasPorNombre.get("correo")).toMatch(/identificador directo/);
  });

  it("excluye los datos sensibles porque son el OBJETIVO, no la llave", () => {
    // En k-anonimato el atributo sensible es lo que el atacante quiere averiguar; los QIs son
    // aquello por lo que enlaza. Meter el diagnóstico como QI sería confundir los dos papeles.
    expect(excluidasPorNombre.get("diagnostico")).toMatch(/art\. 5/);
    expect(excluidasPorNombre.get("grupo_etnico")).toMatch(/art\. 5/);
  });

  it("REPORTA las columnas que ya identifican solas en vez de esconderlas", () => {
    // Que una columna delate sola suele ser el hallazgo MÁS importante del archivo. Un advisor
    // que la descartara por "demasiado única" y se callara estaría escondiendo justo eso.
    const solas = new Map(advisor.identificanSolas.map((c) => [c.nombre, c]));

    for (const nombre of ["ip_registro", "latitud", "longitud", "monto"]) {
      expect(solas.has(nombre)).toBe(true);
      expect(solas.get(nombre)!.proporcionUnicos).toBeGreaterThanOrEqual(0.9);
      expect(solas.get(nombre)!.unicos).toBeGreaterThan(0);
    }

    // Y salen del recorrido de combinaciones: cualquier combinación que las incluyera heredaría
    // su unicidad y no diría nada nuevo.
    for (const combinacion of advisor.combinaciones) {
      expect(combinacion.columnas).not.toContain("ip_registro");
    }
  });

  it("el umbral se mide sobre el EFECTO, no sobre la cardinalidad", () => {
    // Tabla construida a mano para separar los dos criterios: 100 filas, 80 valores que aparecen
    // UNA vez y 10 que aparecen DOS. Son 90 valores distintos en 100 filas —el 90%—, así que un
    // umbral por cardinalidad la habría descartado. Pero solo deja solos a 80 registros (80%),
    // por debajo del umbral: la columna sí sirve de llave y tiene que entrar a las combinaciones.
    const filas: string[][] = [];
    for (let i = 0; i < 80; i++) filas.push([`u${i}`]);
    for (let i = 0; i < 10; i++) filas.push([`d${i}`], [`d${i}`]);
    const tablaMixta = construir(["codigo_zona"], filas);
    const consejo = aconsejarQis(tablaMixta, clasificar(tablaMixta));

    expect(tablaMixta.filas).toBe(100);
    expect(tablaMixta.columnas[0].valores.length - 1).toBe(90); // 90% de cardinalidad
    expect(consejo.identificanSolas).toEqual([]); // pero solo 80% de únicos
    expect(consejo.candidatos.map((c) => c.nombre)).toEqual(["codigo_zona"]);
  });

  it("propone las columnas que de verdad sirven de llave", () => {
    const nombres = advisor.candidatos.map((c) => c.nombre);
    expect(nombres).toEqual(
      expect.arrayContaining(["municipio", "estrato", "sexo"]),
    );
    expect(nombres).not.toContain("cedula_titular");
    expect(nombres).not.toContain("diagnostico");
  });

  it("declara su tope en vez de recortar en silencio", () => {
    // Regla del plan: un tope callado se lee como "revisé todo". El advisor publica cuántas
    // candidatas mira, hasta qué tamaño combina y cuántas combinaciones evaluó.
    expect(advisor.tope).toEqual({ candidatosMaximos: 6, tamanoMaximo: 4 });

    // Con c candidatas, las combinaciones de tamaño 2..4 son C(c,2)+C(c,3)+C(c,4).
    const c = advisor.candidatos.length;
    const combinatoria = (n: number, k: number) =>
      k > n
        ? 0
        : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce(
            (a, b) => a * b,
            1,
          );
    const esperadas = Math.round(
      combinatoria(c, 2) + combinatoria(c, 3) + combinatoria(c, 4),
    );

    expect(advisor.combinacionesEvaluadas).toBe(esperadas);
    expect(advisor.combinaciones).toHaveLength(esperadas);
  });

  it("solo propone combinaciones de 2 a 4 columnas", () => {
    for (const combinacion of advisor.combinaciones) {
      expect(combinacion.columnas.length).toBeGreaterThanOrEqual(2);
      expect(combinacion.columnas.length).toBeLessThanOrEqual(4);
    }
  });

  it("ordena por poder identificador, y a igualdad prefiere la combinación más corta", () => {
    for (let i = 1; i < advisor.combinaciones.length; i++) {
      const anterior = advisor.combinaciones[i - 1];
      const actual = advisor.combinaciones[i];
      expect(anterior.proporcionUnicos).toBeGreaterThanOrEqual(
        actual.proporcionUnicos,
      );
      if (anterior.proporcionUnicos === actual.proporcionUnicos) {
        expect(anterior.columnas.length).toBeLessThanOrEqual(
          actual.columnas.length,
        );
      }
    }
  });

  it("añadir una columna nunca puede bajar el poder identificador", () => {
    // Propiedad matemática del retículo: refinar una partición no puede unir clases. Si el
    // recorrido incremental estuviera mal, esto se rompería sin que ningún otro test lo notara.
    const porClave = new Map(
      advisor.combinaciones.map((c) => [[...c.columnas].sort().join("|"), c]),
    );
    for (const combinacion of advisor.combinaciones) {
      if (combinacion.columnas.length < 3) continue;
      for (const quitada of combinacion.columnas) {
        const padre = porClave.get(
          combinacion.columnas
            .filter((c) => c !== quitada)
            .sort()
            .join("|"),
        );
        if (!padre) continue;
        expect(combinacion.clases).toBeGreaterThanOrEqual(padre.clases);
        expect(combinacion.unicos).toBeGreaterThanOrEqual(padre.unicos);
      }
    }
  });

  it("descarta la columna constante, que no distingue a nadie", () => {
    // Una columna con el mismo valor en todas las filas no aporta ni un bit de discriminación:
    // meterla a las combinaciones solo gastaría presupuesto sin cambiar ningún resultado.
    const constante = construir(
      ["zona", "sucursal"],
      Array.from({ length: 20 }, (_, i) => ["única", `s${i % 4}`]),
    );
    const consejo = aconsejarQis(constante, clasificar(constante));

    expect(consejo.excluidas).toContainEqual({
      nombre: "zona",
      motivo: "un solo valor distinto: no distingue a nadie",
    });
    expect(consejo.candidatos.map((c) => c.nombre)).toEqual(["sucursal"]);
  });

  it("no se cae con una tabla sin filas", () => {
    const vacia = construir(["sexo", "municipio"], []);
    const consejo = aconsejarQis(vacia, clasificar(vacia));

    expect(consejo.combinaciones).toEqual([]);
    expect(consejo.identificanSolas).toEqual([]);
    expect(consejo.combinacionesEvaluadas).toBe(0);
  });

  it("respeta un tope distinto cuando se le pide", () => {
    const acotado = aconsejarQis(tabla, diagnostico, {
      candidatosMaximos: 3,
      tamanoMaximo: 2,
    });
    expect(acotado.combinacionesEvaluadas).toBe(3); // C(3,2)
    expect(acotado.tope).toEqual({ candidatosMaximos: 3, tamanoMaximo: 2 });
    // Las candidatas que quedaron fuera del tope también se declaran.
    expect(
      acotado.excluidas.some((e) => /fuera de las 3 candidatas/.test(e.motivo)),
    ).toBe(true);
  });
});

describe("evaluarRiesgo — el paquete que consume la UI", () => {
  const tabla = tablaDelKit();
  const diagnostico = clasificar(tabla);

  it("calcula el riesgo sobre los cuasi-identificadores detectados", () => {
    const { riesgo } = evaluarRiesgo(tabla, diagnostico);

    expect(riesgo.naturaleza).toBe("exacto");
    expect(riesgo.filas).toBe(3_000);
    expect(riesgo.qis.length).toBeGreaterThan(0);
    expect(riesgo.kMinimo).toBeGreaterThanOrEqual(1);
    expect(riesgo.riesgoMaximo).toBeLessThanOrEqual(1);
    expect(riesgo.riesgoPromedio).toBeGreaterThan(0);
    expect(riesgo.proporcionUnicos).toBeGreaterThanOrEqual(0);
    expect(riesgo.proporcionUnicos).toBeLessThanOrEqual(1);
  });

  it("es determinista: dos evaluaciones dan exactamente lo mismo", () => {
    const primera = serializarCanonico(evaluarRiesgo(tabla, diagnostico));
    const otraTabla = tablaDelKit();
    const segunda = serializarCanonico(
      evaluarRiesgo(otraTabla, clasificar(otraTabla)),
    );

    expect(segunda).toBe(primera);
  });

  it("un archivo sin nada personal reporta el riesgo mínimo", () => {
    const filas = [
      ...generarFilas({ ...OPCIONES_DEL_KIT, perfil: "limpio", filas: 400 }),
    ];
    const [encabezado, ...datos] = filas;
    const constructor = new ConstructorColumnar(encabezado, datos.length);
    for (const fila of datos) constructor.agregarFila(fila);
    const limpia = constructor.finalizar();

    const { riesgo } = evaluarRiesgo(limpia, clasificar(limpia));

    // "Limpio" quiere decir sin identificadores directos ni datos sensibles — no sin riesgo. El
    // estrato sigue siendo un atributo demográfico, así que entra como cuasi-identificador y el
    // riesgo se calcula sobre él. Decir "riesgo cero" aquí sería la clase de promesa que Velo no
    // hace.
    expect(riesgo.qis).toEqual(["estrato"]);
    expect(riesgo.clases).toBe(7); // los 6 estratos + la celda vacía, que es un valor más
    expect(riesgo.kMinimo).toBeGreaterThan(10);
    expect(riesgo.unicos).toBe(0);
  });
});
