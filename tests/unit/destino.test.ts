// El destino de la escritura por trozos (S10): un fallo al ESCRIBIR sale como «escritura-fallida» y
// no como «lectura-fallida», que tumbaba el informe con la política y la llave. Y lo escrito a medias
// se deshace (`abort`), para que no quede medio archivo en el equipo.

import { Blob as BlobDeNode } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import type { Politica } from "@/engine/politica";
import { sha256 } from "@/lib/sha256";
import {
  escribirCsv,
  pasadaDeDiagnostico,
  prepararTransformacion,
} from "@/workers/alto-volumen";
import { destinoDe, motivoDeLaEscritura } from "@/workers/destino";

const CSV = "id,ciudad\n1,Cali\n2,Pasto\n3,Neiva\n";
const codificar = (texto: string) => new TextEncoder().encode(texto);
const blobDe = (texto: string) =>
  new BlobDeNode([codificar(texto)]) as unknown as Blob;
const POLITICA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [],
};

async function planDe(texto: string) {
  const archivo = blobDe(texto);
  const huella = sha256(codificar(texto));
  const pasada = await pasadaDeDiagnostico(archivo, { huella });
  const plan = await prepararTransformacion(
    archivo,
    pasada,
    POLITICA,
    null,
    "es",
    huella,
  );
  return { archivo, plan };
}

/** Un archivo elegido con el selector cuyo disco se llena al primer trozo. */
function asaQueFalla() {
  const abort = vi.fn(async () => {});
  const asa = {
    createWritable: async () => ({
      write: async () => {
        throw new Error("QuotaExceededError: el disco está lleno");
      },
      close: async () => {},
      abort,
    }),
  } as unknown as FileSystemFileHandle;
  return { asa, abort };
}

describe("escribir por trozos", () => {
  it("un fallo del destino sale como escritura-fallida, y lo escrito se deshace", async () => {
    const { archivo, plan } = await planDe(CSV);
    const { asa, abort } = asaQueFalla();
    const salida = await destinoDe(asa);
    const error = await escribirCsv(archivo, plan, salida.destino).catch(
      (e: unknown) => e,
    );
    expect(motivoDeLaEscritura(error)).toBe("escritura-fallida");
    await salida.abortar();
    expect(abort).toHaveBeenCalledOnce();
  });

  it("un fallo al LEER (el archivo cambió en el disco) sigue siendo lectura-fallida", async () => {
    const { plan } = await planDe(CSV);
    const otro = blobDe(CSV.replace("Cali", "Lima"));
    const salida = await destinoDe(undefined);
    const error = await escribirCsv(otro, plan, salida.destino).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(motivoDeLaEscritura(error)).toBe("lectura-fallida");
  });

  it("sin selector, el Blob sale con los mismos bytes que se hashearon", async () => {
    const { archivo, plan } = await planDe(CSV);
    const salida = await destinoDe(undefined);
    await escribirCsv(archivo, plan, salida.destino);
    const cerrado = await salida.cerrar("text/csv");
    expect("blob" in cerrado).toBe(true);
    const bytes = new Uint8Array(
      await (cerrado as { blob: Blob }).blob.arrayBuffer(),
    );
    expect(sha256(bytes)).toBe(cerrado.sha256);
    expect(cerrado.bytes).toBe(bytes.length);
  });
});
