// El motor de restauración. Lo que estos tests protegen no es que la función «ande»: es que el
// archivo que vuelve traiga los originales del usuario Y el trabajo del tercero intacto, y que lo
// que no se pudo devolver salga contado en vez de inventado.

import { describe, expect, it } from "vitest";

import { construirBoveda, type Boveda } from "@/engine/boveda";
import {
  ConstructorColumnar,
  valorEn,
  type TablaColumnar,
} from "@/engine/columnar";
import {
  restaurar,
  MINIMO_DE_COINCIDENCIAS,
  UMBRAL_DE_RECONOCIMIENTO,
} from "@/engine/restaurar";
import { serializarCanonico } from "@/engine/serializacion";

const IDENTIDAD = {
  huellaDeLlave: "a1b2c3d4e5f6",
  salDeLlave: "0".repeat(32),
  hashDePolitica: "0".repeat(64),
};

function tablaDe(encabezado: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

function columnaDe(tabla: TablaColumnar, nombre: string): string[] {
  const columna = tabla.columnas.find((c) => c.nombre === nombre)!;
  return Array.from({ length: columna.codigos.length }, (_, f) =>
    valorEn(columna, f),
  );
}

/** Cuatro pacientes: original → seudónimo, tal como los dejó la Fase 2. */
const PARES: readonly (readonly [string, string])[] = [
  ["1032456789", "1900000001"],
  ["1098765432", "1900000002"],
  ["1011223344", "1900000003"],
  ["1055667788", "1900000004"],
];

const BOVEDA = construirBoveda(IDENTIDAD, [
  {
    columna: "cedula",
    originales: PARES.map(([original]) => original),
    seudonimos: PARES.map(([, seudonimo]) => seudonimo),
  },
]);

describe("el archivo que devolvió el tercero", () => {
  // El caso completo, todo junto: filas reordenadas, una columna nueva del tercero, una columna
  // borrada por él, un valor cambiado a mano — y la columna renombrada, por si fuera poco.
  const DEVUELTO = tablaDe(
    ["ID_PACIENTE", "diagnostico", "resultado_estudio"],
    [
      ["1900000003", "J45.9", "positivo"],
      ["1900000001", "E11.9", "negativo"],
      ["9999999999", "I10", "positivo"],
      ["1900000004", "J45.9", "control"],
    ],
  );

  const RESTAURADA = restaurar(DEVUELTO, BOVEDA);

  it("devuelve los originales aunque el tercero reordenara las filas", () => {
    // Por VALOR, jamás por posición: en el archivo que salió de Velo el orden era otro.
    expect(columnaDe(RESTAURADA.tabla, "ID_PACIENTE")).toEqual([
      "1011223344",
      "1032456789",
      "9999999999", // el que el tercero cambió: no está en la bóveda, se respeta
      "1055667788",
    ]);
  });

  it("reconoce la columna aunque el tercero la RENOMBRARA", () => {
    // «cedula» salió de Velo y volvió como «ID_PACIENTE». El reconocimiento es por contenido.
    const informe = RESTAURADA.columnas.find(
      (c) => c.columna === "ID_PACIENTE",
    )!;
    expect(informe.deLaBoveda).toBe("cedula");
    expect(informe.proporcionReconocida).toBeCloseTo(3 / 4);
  });

  it("respeta el trabajo del tercero: su columna nueva sale intacta", () => {
    expect(columnaDe(RESTAURADA.tabla, "resultado_estudio")).toEqual([
      "positivo",
      "negativo",
      "positivo",
      "control",
    ]);
    expect(RESTAURADA.fueraDeAlcance).toEqual([
      "diagnostico",
      "resultado_estudio",
    ]);
  });

  it("cuenta cada celda en su categoría, y la que cambió el tercero no se inventa", () => {
    expect(RESTAURADA.totales).toEqual({
      restauradas: 3,
      ambiguas: 0,
      desconocidas: 1,
    });
  });

  it("una celda que el tercero dejó en blanco no cuenta como desconocida", () => {
    // Vacío no es «el tercero lo cambió»: es que no hay nada. Contarlo como desconocida inflaría
    // la cifra que la Fase 4 pone al lado del porcentaje, que es justo la que tiene que ser exacta.
    const conVacios = tablaDe(
      ["cedula"],
      [["1900000001"], [""], ["1900000002"], [""]],
    );
    const resultado = restaurar(conVacios, BOVEDA);
    expect(resultado.totales).toEqual({
      restauradas: 2,
      ambiguas: 0,
      desconocidas: 0,
    });
    expect(columnaDe(resultado.tabla, "cedula")).toEqual([
      "1032456789",
      "",
      "1098765432",
      "",
    ]);
  });

  it("dice qué columna de la bóveda no apareció", () => {
    const conDos = construirBoveda(IDENTIDAD, [
      ...BOVEDA.columnas.map((c) => ({
        columna: c.columna,
        originales: c.originales.map((o) => o[0]),
        seudonimos: [...c.seudonimos],
      })),
      {
        columna: "nit",
        originales: ["800123456-1", "811987654-3"],
        seudonimos: ["890000001-7", "890000002-4"],
      },
    ]);
    const parcial = restaurar(DEVUELTO, conDos);
    expect(parcial.reconocimiento).toBe("parcial");
    expect(parcial.sinAparecer).toEqual(["nit"]);
  });

  it("con todas las columnas presentes, el reconocimiento es completo", () => {
    expect(RESTAURADA.reconocimiento).toBe("completo");
  });
});

describe("una bóveda que no es de este archivo", () => {
  it("se reconoce y se dice — nunca una restauración a medias en silencio", () => {
    const otroArchivo = tablaDe(
      ["cedula", "ciudad"],
      [
        ["7000000001", "BOGOTA"],
        ["7000000002", "MEDELLIN"],
        ["7000000003", "CALI"],
      ],
    );
    const resultado = restaurar(otroArchivo, BOVEDA);

    expect(resultado.reconocimiento).toBe("ninguno");
    expect(resultado.sinAparecer).toEqual(["cedula"]);
    expect(resultado.totales).toEqual({
      restauradas: 0,
      ambiguas: 0,
      desconocidas: 0,
    });
    // Y el archivo sale exactamente como entró: no se tocó una sola celda.
    expect(columnaDe(resultado.tabla, "cedula")).toEqual([
      "7000000001",
      "7000000002",
      "7000000003",
    ]);
  });

  it("una bóveda vacía deja el archivo intacto y lo declara", () => {
    const vacia = construirBoveda(IDENTIDAD, []);
    const archivo = tablaDe(["cedula"], [["1900000001"], ["1900000002"]]);
    const resultado = restaurar(archivo, vacia);
    expect(resultado.reconocimiento).toBe("ninguno");
    expect(resultado.fueraDeAlcance).toEqual(["cedula"]);
    expect(columnaDe(resultado.tabla, "cedula")).toEqual([
      "1900000001",
      "1900000002",
    ]);
  });
});

describe("la celda ambigua no se resuelve eligiendo", () => {
  const CON_COLISION = construirBoveda(IDENTIDAD, [
    {
      columna: "nit",
      originales: ["800123456-1", "811987654-3", "830555111-9"],
      // Los dos primeros cayeron en el mismo seudónimo: eso es una colisión de formato.
      seudonimos: ["890000001-7", "890000001-7", "890000002-4"],
    },
  ]);

  it("deja el seudónimo, lo cuenta, y no escribe ninguno de los dos originales", () => {
    const devuelto = tablaDe(
      ["nit"],
      [["890000001-7"], ["890000002-4"], ["890000001-7"]],
    );
    const resultado = restaurar(devuelto, CON_COLISION);

    // Dos celdas ambiguas (el seudónimo colisionado aparece dos veces) y una restaurada.
    expect(resultado.totales).toEqual({
      restauradas: 1,
      ambiguas: 2,
      desconocidas: 0,
    });

    const salida = columnaDe(resultado.tabla, "nit");
    expect(salida[0]).toBe("890000001-7");
    expect(salida[2]).toBe("890000001-7");
    expect(salida[1]).toBe("830555111-9");
    // Ninguno de los dos candidatos aparece en el archivo: escribir uno sería devolverle a alguien
    // el dato de la otra empresa.
    expect(salida).not.toContain("800123456-1");
    expect(salida).not.toContain("811987654-3");
  });
});

describe("el umbral de reconocimiento, en su frontera", () => {
  it("está declarado con su valor, no escondido en una comparación", () => {
    expect(UMBRAL_DE_RECONOCIMIENTO).toBe(0.5);
    expect(MINIMO_DE_COINCIDENCIAS).toBe(2);
  });

  it("exactamente la mitad SÍ se reconoce; justo por debajo, no", () => {
    // Cuatro valores distintos, dos de la bóveda: 0,50 clavado.
    const enLaFrontera = tablaDe(
      ["col"],
      [["1900000001"], ["1900000002"], ["otro-a"], ["otro-b"]],
    );
    const justoDebajo = tablaDe(
      ["col"],
      [["1900000001"], ["1900000002"], ["otro-a"], ["otro-b"], ["otro-c"]],
    );

    const arriba = restaurar(enLaFrontera, BOVEDA);
    expect(arriba.columnas[0].deLaBoveda).toBe("cedula");
    expect(arriba.columnas[0].proporcionReconocida).toBe(0.5);

    const abajo = restaurar(justoDebajo, BOVEDA);
    expect(abajo.columnas[0].deLaBoveda).toBeNull();
    expect(abajo.columnas[0].proporcionReconocida).toBe(0.4);
  });

  it("la proporción viaja aunque NO se reconozca: «no la restauramos, va el 40 %»", () => {
    const casiNada = tablaDe(
      ["notas"],
      [["1900000001"], ["texto libre"], ["mas texto"], ["y mas"]],
    );
    const resultado = restaurar(casiNada, BOVEDA);
    expect(resultado.columnas[0].deLaBoveda).toBeNull();
    expect(resultado.columnas[0].proporcionReconocida).toBe(0.25);
    // Y la celda que coincidía NO se tocó: la columna no era de Velo.
    expect(columnaDe(resultado.tabla, "notas")[0]).toBe("1900000001");
  });

  it("una sola coincidencia no basta, aunque sea el 100 % — y se declara", () => {
    // Caso degenerado: una columna de un único valor distinto. Sale con proporción 1 y sin
    // restaurar, que es el precio declarado del piso de coincidencias.
    const unaSola = tablaDe(["col"], [["1900000001"], ["1900000001"]]);
    const resultado = restaurar(unaSola, BOVEDA);
    expect(resultado.columnas[0].proporcionReconocida).toBe(1);
    expect(resultado.columnas[0].deLaBoveda).toBeNull();
  });

  it("una columna entera vacía no se reconoce ni revienta", () => {
    const vacia = tablaDe(["col"], [[""], [""]]);
    const resultado = restaurar(vacia, BOVEDA);
    expect(resultado.columnas[0].proporcionReconocida).toBe(0);
    expect(resultado.columnas[0].deLaBoveda).toBeNull();
  });
});

describe("dos columnas de la bóveda no se contaminan entre sí", () => {
  it("cada columna se restaura con UNA sola correspondencia, la de mejor puntaje", () => {
    // El caso incómodo: un seudónimo que existe en las DOS correspondencias, con originales
    // distintos. Como se elige una correspondencia por columna, el compartido no puede colarse.
    const dos = construirBoveda(IDENTIDAD, [
      {
        columna: "cedula",
        originales: ["1032456789", "1098765432", "1011223344"],
        seudonimos: ["1900000001", "1900000002", "5555555555"],
      },
      {
        columna: "cedula_acudiente",
        originales: ["1077777777", "1088888888", "1099999999"],
        seudonimos: ["1900000009", "1900000008", "5555555555"],
      },
    ]);

    const devuelto = tablaDe(
      ["a", "b"],
      [
        ["1900000001", "1900000009"],
        ["1900000002", "1900000008"],
        ["5555555555", "5555555555"],
      ],
    );
    const resultado = restaurar(devuelto, dos);

    expect(resultado.columnas[0].deLaBoveda).toBe("cedula");
    expect(resultado.columnas[1].deLaBoveda).toBe("cedula_acudiente");
    // El seudónimo compartido devuelve el original de SU columna en cada una.
    expect(columnaDe(resultado.tabla, "a")[2]).toBe("1011223344");
    expect(columnaDe(resultado.tabla, "b")[2]).toBe("1099999999");
  });

  it("el desempate entre correspondencias iguales es por nombre, no por orden de llegada", () => {
    // Dos correspondencias que explican la columna exactamente igual. Sin un desempate fijado, la
    // salida dependería del orden en que se armó la bóveda — y dejaría de ser reproducible.
    const empate = construirBoveda(IDENTIDAD, [
      {
        columna: "zeta",
        originales: ["z-uno", "z-dos"],
        seudonimos: ["1900000001", "1900000002"],
      },
      {
        columna: "alfa",
        originales: ["a-uno", "a-dos"],
        seudonimos: ["1900000001", "1900000002"],
      },
    ]);
    const devuelto = tablaDe(["col"], [["1900000001"], ["1900000002"]]);
    const resultado = restaurar(devuelto, empate);
    expect(resultado.columnas[0].deLaBoveda).toBe("alfa");
    expect(columnaDe(resultado.tabla, "col")).toEqual(["a-uno", "a-dos"]);
  });
});

describe("la restauración es determinista", () => {
  const DEVUELTO = tablaDe(
    ["ID", "nota"],
    [
      ["1900000002", "b"],
      ["1900000001", "a"],
      ["1900000004", "c"],
      ["1900000003", "d"],
    ],
  );

  it("dos restauraciones del mismo par dan la MISMA salida, byte por byte", () => {
    const una = serializarCanonico(restaurar(DEVUELTO, BOVEDA).tabla);
    const otra = serializarCanonico(restaurar(DEVUELTO, BOVEDA).tabla);
    expect(otra).toBe(una);
    expect(una.length).toBeGreaterThan(100);
  });

  it("otra bóveda da otro resultado — el instrumento distingue", () => {
    const otraBoveda = construirBoveda(IDENTIDAD, [
      {
        columna: "cedula",
        originales: ["9000000001", "9000000002", "9000000003", "9000000004"],
        seudonimos: PARES.map(([, seudonimo]) => seudonimo),
      },
    ]);
    const conLaSuya = serializarCanonico(restaurar(DEVUELTO, BOVEDA).tabla);
    const conLaOtra = serializarCanonico(restaurar(DEVUELTO, otraBoveda).tabla);
    expect(conLaOtra).not.toBe(conLaSuya);
  });

  it("el diccionario se re-deduplica: una colisión SEPARA valores que estaban juntos", () => {
    // El camino inverso al del S2. Dos filas con el mismo seudónimo vuelven a dos originales
    // distintos, y la cardinalidad de la columna tiene que decirlo.
    const boveda: Boveda = construirBoveda(IDENTIDAD, [
      {
        columna: "cedula",
        originales: ["1032456789", "1098765432"],
        seudonimos: ["1900000001", "1900000002"],
      },
    ]);
    const devuelto = tablaDe(
      ["cedula"],
      [["1900000001"], ["1900000002"], ["1900000001"]],
    );
    const salida = restaurar(devuelto, boveda).tabla.columnas[0];
    // "" + dos originales distintos: el diccionario no arrastra entradas muertas.
    expect(salida.valores).toEqual(["", "1032456789", "1098765432"]);
    expect(salida.noVacios).toBe(3);
  });
});
