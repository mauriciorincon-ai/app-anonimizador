// La bóveda — lo que estos tests protegen no es que la estructura «ande»: es que el archivo que el
// usuario guarda sea ilegible sin su frase, que la misma bóveda tenga siempre la misma identidad, y
// que una colisión no se resuelva eligiendo en silencio.

import { beforeAll, describe, expect, it } from "vitest";

import {
  colisionesDeBoveda,
  construirBoveda,
  deserializarBoveda,
  esDeLaMismaLlave,
  huellaDeBoveda,
  indiceDeColumna,
  paresDeBoveda,
  serializarBoveda,
  VERSION_DE_BOVEDA,
  type Boveda,
  type EntradaDeBoveda,
  type IdentidadDeBoveda,
} from "@/engine/boveda";
import { abrirBoveda, sellarBoveda } from "@/lib/boveda-archivo";
import { ITERACIONES_PBKDF2 } from "@/lib/llave";

const IDENTIDAD: IdentidadDeBoveda = {
  huellaDeLlave: "a1b2c3d4e5f6",
  salDeLlave: "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
  hashDePolitica: "9c1185a5c5e9fc54612808977ee8f548b2258d31",
};

/** `[original, seudónimo]` — el orden en que se leen, no el que la bóveda acaba guardando. */
function entrada(
  columna: string,
  pares: readonly (readonly [string, string])[],
): EntradaDeBoveda {
  return {
    columna,
    originales: pares.map(([original]) => original),
    seudonimos: pares.map(([, seudonimo]) => seudonimo),
  };
}

const CEDULAS = entrada("cedula_paciente", [
  ["1032456789", "1900000001"],
  ["1098765432", "1900000002"],
  ["1011223344", "1900000003"],
]);

const NOMBRES = entrada("nombre_completo", [
  ["MARIA CAMILA ROJAS", "3f2a1c9b7e4d"],
  ["JULIAN ANDRES OSPINA", "8b6d4f2a0c1e"],
]);

const BOVEDA = construirBoveda(IDENTIDAD, [CEDULAS, NOMBRES]);

const FRASE = "dos toros y una brújula";

describe("construir la bóveda", () => {
  it("guarda un par por valor DISTINTO, no uno por fila", () => {
    expect(paresDeBoveda(BOVEDA)).toBe(5);
    expect(colisionesDeBoveda(BOVEDA)).toBe(0);
  });

  it("el vacío no entra: no se seudonimiza, así que no hay nada que devolver", () => {
    const conVacios = construirBoveda(IDENTIDAD, [
      entrada("cedula", [
        ["1032456789", "1900000001"],
        ["", ""],
      ]),
    ]);
    expect(paresDeBoveda(conVacios)).toBe(1);
  });

  it("una colisión se guarda COMO colisión, con sus dos originales", () => {
    const chocan = construirBoveda(IDENTIDAD, [
      entrada("nit", [
        ["800123456-1", "890000001-7"],
        ["811987654-3", "890000001-7"],
        ["830555111-9", "890000002-4"],
      ]),
    ]);

    expect(colisionesDeBoveda(chocan)).toBe(1);
    // Dos originales distintos, no uno elegido: al restaurar, esa celda es ambigua y hay que decirlo.
    const indice = indiceDeColumna(chocan.columnas[0]);
    expect(indice.get("890000001-7")).toEqual(["800123456-1", "811987654-3"]);
    expect(indice.get("890000002-4")).toEqual(["830555111-9"]);
  });

  it("el mismo valor repetido en el diccionario no inventa una colisión", () => {
    const repetido = construirBoveda(IDENTIDAD, [
      entrada("ciudad", [
        ["BOGOTA", "aa11"],
        ["BOGOTA", "aa11"],
      ]),
    ]);
    expect(colisionesDeBoveda(repetido)).toBe(0);
  });

  it("rompe si los arreglos no van en paralelo, en vez de devolver el original de otro", () => {
    expect(() =>
      construirBoveda(IDENTIDAD, [
        { columna: "cedula", originales: ["a", "b"], seudonimos: ["x"] },
      ]),
    ).toThrow(/paralelo|originales|seudónimos/i);
  });

  it("lleva la sal DENTRO — la deuda M2 del S2, pagada", () => {
    expect(BOVEDA.salDeLlave).toBe(IDENTIDAD.salDeLlave);
    expect(BOVEDA.version).toBe(VERSION_DE_BOVEDA);
  });

  it("reconoce una bóveda de OTRA llave sin intentar restaurar nada", () => {
    expect(esDeLaMismaLlave(BOVEDA, "a1b2c3d4e5f6")).toBe(true);
    expect(esDeLaMismaLlave(BOVEDA, "000000000000")).toBe(false);
  });
});

describe("la identidad de la bóveda es byte-idéntica", () => {
  it("dos serializaciones de la misma bóveda dan exactamente los mismos bytes", () => {
    const otra = construirBoveda(IDENTIDAD, [CEDULAS, NOMBRES]);
    expect(serializarBoveda(otra)).toBe(serializarBoveda(BOVEDA));
    expect(huellaDeBoveda(otra)).toBe(huellaDeBoveda(BOVEDA));
    expect(serializarBoveda(BOVEDA).length).toBeGreaterThan(200);
  });

  it("el ORDEN en que llegan las columnas y los valores no cambia la identidad", () => {
    // El orden de las columnas depende de la política y el de los valores del diccionario depende
    // de en qué fila apareció cada uno primero. Ninguna de las dos cosas es una decisión del
    // usuario, así que ninguna puede cambiar la huella de su bóveda.
    const alReves = construirBoveda(IDENTIDAD, [
      NOMBRES,
      entrada("cedula_paciente", [
        ["1011223344", "1900000003"],
        ["1098765432", "1900000002"],
        ["1032456789", "1900000001"],
      ]),
    ]);
    expect(huellaDeBoveda(alReves)).toBe(huellaDeBoveda(BOVEDA));
  });

  it("una bóveda distinta SÍ cambia la huella — el instrumento distingue", () => {
    const otra = construirBoveda(IDENTIDAD, [CEDULAS]);
    expect(huellaDeBoveda(otra)).not.toBe(huellaDeBoveda(BOVEDA));
  });

  it("la huella es un SHA-256 de verdad, no un resumen corto", () => {
    expect(huellaDeBoveda(BOVEDA)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("la bóveda va y vuelve por texto", () => {
  it("serializar y deserializar devuelve la misma bóveda, con la misma huella", () => {
    const vuelta = deserializarBoveda(serializarBoveda(BOVEDA));
    expect(vuelta.ok).toBe(true);
    if (!vuelta.ok) return;
    expect(huellaDeBoveda(vuelta.boveda)).toBe(huellaDeBoveda(BOVEDA));
    expect(vuelta.boveda).toEqual(BOVEDA);
  });

  it("un JSON que no se puede leer dice QUÉ pasó", () => {
    const roto = deserializarBoveda("{esto no es json");
    expect(roto).toMatchObject({ ok: false, motivo: "json-invalido" });
  });

  it("una bóveda de otra versión se rechaza por versión, no por forma", () => {
    const otraVersion = deserializarBoveda(
      JSON.stringify({ ...BOVEDA, version: 99 }),
    );
    expect(otraVersion).toMatchObject({
      ok: false,
      motivo: "version-distinta",
    });
    if (otraVersion.ok) return;
    expect(otraVersion.detalle).toContain("99");
  });

  it("un JSON cualquiera no es una bóveda", () => {
    expect(deserializarBoveda('{"hola":1}')).toMatchObject({
      ok: false,
      motivo: "forma-invalida",
    });
    expect(deserializarBoveda("[]")).toMatchObject({
      ok: false,
      motivo: "forma-invalida",
    });
  });

  it("cada rechazo de forma dice cuál es, no «archivo inválido»", () => {
    const sinColumnas = deserializarBoveda(
      JSON.stringify({ ...IDENTIDAD, version: 1 }),
    );
    expect(sinColumnas).toMatchObject({ ok: false, motivo: "forma-invalida" });
    if (sinColumnas.ok) return;
    expect(sinColumnas.detalle).toContain("columnas");

    const columnaVacia = deserializarBoveda(
      JSON.stringify({ ...IDENTIDAD, version: 1, columnas: [{}] }),
    );
    expect(columnaVacia).toMatchObject({ ok: false, motivo: "forma-invalida" });
    if (columnaVacia.ok) return;
    expect(columnaVacia.detalle).toContain("incompleta");

    const sinHuella = deserializarBoveda(
      JSON.stringify({ salDeLlave: "a", hashDePolitica: "b", columnas: [] }),
    );
    expect(sinHuella).toMatchObject({ ok: false, motivo: "forma-invalida" });
    if (sinHuella.ok) return;
    expect(sinHuella.detalle).toContain("huellaDeLlave");
  });

  it("el paralelismo roto se rechaza ENTERO: restauraría el original de otro", () => {
    const manipulada = deserializarBoveda(
      JSON.stringify({
        ...BOVEDA,
        columnas: [
          { columna: "cedula", seudonimos: ["a", "b"], originales: [["x"]] },
        ],
      }),
    );
    expect(manipulada).toMatchObject({ ok: false, motivo: "forma-invalida" });
    if (manipulada.ok) return;
    expect(manipulada.detalle).toContain("cedula");
  });
});

/** Sellar cuesta dos derivaciones de PBKDF2-600k (~1 s cada una): se hace una vez y se reutiliza. */
describe("el archivo .velo", () => {
  let velo: Uint8Array;

  beforeAll(async () => {
    velo = await sellarBoveda(BOVEDA, FRASE);
  }, 60_000);

  /** Los bytes como texto crudo, para buscar en ellos sin interpretar nada. */
  function comoTexto(bytes: Uint8Array): string {
    let salida = "";
    for (const byte of bytes) salida += String.fromCharCode(byte);
    return salida;
  }

  it("no contiene UN SOLO valor original en claro, ni un nombre de columna", () => {
    const texto = comoTexto(velo);
    for (const original of [...CEDULAS.originales, ...NOMBRES.originales]) {
      expect(
        texto,
        `el original ${original} aparece en el .velo`,
      ).not.toContain(original);
    }
    // Los nombres de columna son datos del usuario igual que las celdas: `nombre_completo` cuenta
    // de qué va el archivo antes de que nadie lo abra.
    for (const columna of ["cedula_paciente", "nombre_completo"]) {
      expect(texto).not.toContain(columna);
    }
    // Ni los seudónimos: quien intercepte el .velo tampoco puede reconstruir el lado izquierdo.
    expect(texto).not.toContain("1900000001");
  });

  it("empieza por su magia y declara el costo con el que se selló", () => {
    expect(comoTexto(velo.slice(0, 4))).toBe("VELO");
    expect(velo[4]).toBe(1);
    // Las iteraciones viajan DENTRO: sin eso, endurecer el parámetro dejaría ilegible toda bóveda
    // sellada antes, que es la pérdida total que el producto existe para evitar.
    expect(new DataView(velo.buffer).getUint32(5, false)).toBe(
      ITERACIONES_PBKDF2,
    );
    expect(velo.length).toBeGreaterThan(37 + 16);
  });

  it("un costo absurdo se rechaza ANTES de derivar, no se obedece", async () => {
    // La cabecera va en claro: un `.velo` manipulado que pida cuatro mil millones de iteraciones
    // colgaría la pestaña un cuarto de hora sin que nada pareciera roto.
    const abusivo = velo.slice();
    new DataView(abusivo.buffer).setUint32(5, 4_000_000_000, false);
    const t0 = performance.now();
    expect(await abrirBoveda(abusivo, FRASE)).toMatchObject({
      ok: false,
      motivo: "costo-inaceptable",
    });
    expect(performance.now() - t0).toBeLessThan(1_000);
  });

  it("se abre con la frase correcta y devuelve la MISMA bóveda", async () => {
    const abierta = await abrirBoveda(velo, FRASE);
    expect(abierta.ok).toBe(true);
    if (!abierta.ok) return;
    expect(huellaDeBoveda(abierta.boveda)).toBe(huellaDeBoveda(BOVEDA));
    expect(abierta.boveda.salDeLlave).toBe(IDENTIDAD.salDeLlave);
    expect(indiceDeColumna(abierta.boveda.columnas[0]).size).toBeGreaterThan(0);
  }, 60_000);

  it("con otra frase no se abre, y lo dice sin dar pistas", async () => {
    const fallida = await abrirBoveda(velo, "otra frase cualquiera");
    expect(fallida).toMatchObject({ ok: false, motivo: "frase-incorrecta" });
  }, 60_000);

  it("un .velo alterado se rechaza: la cabecera va autenticada", async () => {
    // Cambiar un byte de la SAL —que va en claro— haría derivar otra llave. Sin AAD el error sería
    // el mismo, pero con AAD también se detecta cualquier retoque de la versión o la magia.
    const alterado = velo.slice();
    alterado[10] ^= 0xff;
    expect(await abrirBoveda(alterado, FRASE)).toMatchObject({
      ok: false,
      motivo: "frase-incorrecta",
    });
  }, 60_000);

  it("un archivo que no es una bóveda se reconoce SIN descifrar nada", async () => {
    const cualquiera = new TextEncoder().encode(
      "columna_a,columna_b\n1,2\n".padEnd(200, " "),
    );
    expect(await abrirBoveda(cualquiera, FRASE)).toMatchObject({
      ok: false,
      motivo: "no-es-una-boveda",
    });
    expect(await abrirBoveda(new Uint8Array(4), FRASE)).toMatchObject({
      ok: false,
      motivo: "no-es-una-boveda",
    });
  });

  it("un .velo de otra versión se rechaza por versión", async () => {
    const futuro = velo.slice();
    futuro[4] = 9;
    const resultado = await abrirBoveda(futuro, FRASE);
    expect(resultado).toMatchObject({ ok: false, motivo: "version-distinta" });
    if (resultado.ok) return;
    expect(resultado.detalle).toContain("9");
  });

  it("un contenido de otra versión se distingue de un contenido roto", async () => {
    // El `.velo` y la bóveda de adentro versionan por separado: una Velo futura puede cambiar la
    // forma de la correspondencia sin tocar el formato del archivo. Descifrar bien y no entender lo
    // de dentro es un desenlace distinto de «la frase no abre», y merece su propio mensaje.
    const deOtraVersion = await sellarBoveda({ ...BOVEDA, version: 99 }, FRASE);
    expect(await abrirBoveda(deOtraVersion, FRASE)).toMatchObject({
      ok: false,
      motivo: "version-distinta",
    });

    const rota = await sellarBoveda(
      {
        ...BOVEDA,
        columnas: [{ columna: "cedula", seudonimos: ["a"], originales: [] }],
      },
      FRASE,
    );
    expect(await abrirBoveda(rota, FRASE)).toMatchObject({
      ok: false,
      motivo: "contenido-invalido",
    });
  }, 120_000);

  it("dos sellados de la MISMA bóveda dan bytes distintos — y eso es correcto", async () => {
    // AES-GCM exige un IV único por cifrado: reusar el par (llave, IV) permite recuperar la llave
    // de autenticación. Así que el gate de determinismo NO puede aplicarse al .velo. Lo que sí es
    // byte-idéntico es la serialización en claro, y tiene su test más arriba.
    const otroSellado = await sellarBoveda(BOVEDA, FRASE);
    expect(comoTexto(otroSellado)).not.toBe(comoTexto(velo));
    // Pero las dos abren la misma bóveda: distinto envoltorio, mismo contenido.
    const abierta = await abrirBoveda(otroSellado, FRASE);
    expect(abierta.ok).toBe(true);
    if (!abierta.ok) return;
    expect(huellaDeBoveda(abierta.boveda)).toBe(huellaDeBoveda(BOVEDA));
  }, 120_000);
});

describe("una bóveda vacía es una bóveda", () => {
  it("sin columnas reversibles sigue siendo un archivo válido", async () => {
    const vacia: Boveda = construirBoveda(IDENTIDAD, []);
    expect(paresDeBoveda(vacia)).toBe(0);
    const vuelta = deserializarBoveda(serializarBoveda(vacia));
    expect(vuelta).toMatchObject({ ok: true });
  });
});
