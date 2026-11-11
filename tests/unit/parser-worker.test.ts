// @vitest-environment node
//
// El worker de verdad, con su protocolo de mensajes (S12, deuda del S10): hasta aquí ningún test
// importaba `parser.worker.ts`, así que lo que SOLO él decide —qué error da el regreso cuando falta
// una pieza, y que un número con ruido en un JSON siga siendo número— se probaba repitiendo su lógica
// en el test, que es probar la copia. Aquí se importa el módulo con un `self` de mentira que recoge lo
// que el worker publica y le entrega los mensajes que mandaría la página. El estado del worker vive
// en el módulo y pasa de un test al siguiente, como entre dos mensajes de la página: el orden importa.

import { File as ArchivoDeNode } from "node:buffer";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Politica } from "@/engine/politica";
import type { MensajeAlWorker, MensajeDelWorker } from "@/workers/contrato";

const publicados: MensajeDelWorker[] = [];
let entregar: ((evento: { data: MensajeAlWorker }) => void) | null = null;

beforeAll(async () => {
  vi.stubGlobal("self", {
    postMessage: (m: MensajeDelWorker) => void publicados.push(m),
    addEventListener: (_: string, f: typeof entregar) => {
      entregar = f;
    },
  });
  await import("@/workers/parser.worker");
  expect(entregar).not.toBeNull();
});

/** Entrega un mensaje al worker y espera el primero de `tipo` que publique DESPUÉS. */
async function mandar<T extends MensajeDelWorker["tipo"]>(
  mensaje: MensajeAlWorker,
  esperado: T,
): Promise<Extract<MensajeDelWorker, { tipo: T }>> {
  const desde = publicados.length;
  entregar!({ data: mensaje });
  const limite = Date.now() + 10_000;
  while (Date.now() < limite) {
    const hallado = publicados
      .slice(desde)
      .find((m) => m.tipo === esperado || m.tipo === "error");
    if (hallado) {
      if (hallado.tipo === "error" && esperado !== "error")
        throw new Error(`el worker publicó error: ${hallado.motivo}`);
      return hallado as Extract<MensajeDelWorker, { tipo: T }>;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`el worker no publicó «${esperado}»`);
}

const archivo = (texto: string, nombre: string) =>
  new ArchivoDeNode([texto], nombre) as unknown as File;

describe("el regreso, cuando falta una pieza", () => {
  it("sin archivo devuelto, ninguno de los tres pasos del regreso sigue: «sin-devuelto»", async () => {
    for (const mensaje of [
      { tipo: "restaurar" },
      { tipo: "construir-restaurado" },
      { tipo: "construir-informe-del-regreso", fecha: "hoy", idioma: "es" },
    ] as const) {
      const error = await mandar(mensaje, "error");
      expect(error.motivo, mensaje.tipo).toBe("sin-devuelto");
    }
  });

  it("con el devuelto cargado pero sin bóveda, lo que falta es la bóveda: «sin-boveda»", async () => {
    await mandar(
      {
        tipo: "analizar-devuelto",
        archivo: archivo("id,correo\n1,a@x.co\n2,b@x.co\n", "devuelto.csv"),
      },
      "devuelto-listo",
    );
    const error = await mandar({ tipo: "restaurar" }, "error");
    expect(error.motivo).toBe("sin-boveda");
  });
});

describe("un número con ruido en un JSON sigue siendo número, por el camino en memoria", () => {
  const JSON_ORIGINAL =
    '[{"id":"a1","edad":34},{"id":"a2","edad":51},{"id":"a3","edad":47},{"id":"a4","edad":29}]\n';
  const POLITICA: Politica = {
    version: 1,
    origen: "manual",
    kObjetivo: null,
    reglas: [
      {
        columna: "id",
        tecnica: { tipo: "seudonimizar", longitud: 12, reversible: true },
      },
      {
        columna: "edad",
        tecnica: {
          tipo: "laplace",
          epsilon: 1,
          minimo: 0,
          maximo: 120,
          decimales: 0,
        },
      },
    ],
  };

  it("la columna `edad` sale sin comillas, y `id` (texto) con ellas", async () => {
    await mandar(
      { tipo: "analizar", archivo: archivo(JSON_ORIGINAL, "datos.json") },
      "listo",
    );
    await mandar(
      {
        tipo: "derivar-llave",
        frase: "la frase del proyecto de esta prueba",
        sal: "00112233445566778899aabbccddeeff",
      },
      "llave-lista",
    );
    await mandar(
      { tipo: "transformar", politica: POLITICA, idioma: "es" },
      "transformado",
    );
    const salida = await mandar({ tipo: "construir-archivo" }, "archivo");
    const texto = await salida.blob!.text();
    expect(texto).toMatch(/"edad":\s*-?\d+(?:\.\d+)?\s*[,}]/);
    expect(texto).not.toMatch(/"edad":\s*"/);
    expect(texto).toMatch(/"id":\s*"/);
    // Y es un JSON que se lee de vuelta con los cuatro registros.
    expect(JSON.parse(texto)).toHaveLength(4);
  });
});
