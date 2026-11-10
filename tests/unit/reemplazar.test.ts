// `reemplazar` (S12, hallazgo B-1 de la auditoría): si la escritura aparte se queda a medias y el
// temporal se borra después, lo que sube es la CAUSA, no el envoltorio `EscrituraAMedias` (que
// llegaría a la consola como «velo: EscrituraAMedias»). Si el temporal no se pudo borrar, el
// envoltorio sí sigue: avisa de un archivo que quedó en el disco.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const causa = new Error("disco lleno");

vi.mock("../../velo-local/archivos", async (original) => {
  const real = await original<typeof import("../../velo-local/archivos")>();
  return {
    ...real,
    escribirNuevo: vi.fn(async (ruta: string) => {
      throw new real.EscrituraAMedias(ruta, causa);
    }),
  };
});

import { EscrituraAMedias } from "../../velo-local/archivos";
import { reemplazar } from "../../velo-local/comun";

let carpeta: string;
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), "velo-reemplazar-"));
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

describe("reemplazar, cuando la escritura se queda a medias", () => {
  it("con el temporal ya borrado, relanza la causa y no el envoltorio", async () => {
    const error = await reemplazar(
      join(carpeta, "b.velolog"),
      new Uint8Array(1),
    )
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBe(causa);
    expect(error).not.toBeInstanceOf(EscrituraAMedias);
  });
});
