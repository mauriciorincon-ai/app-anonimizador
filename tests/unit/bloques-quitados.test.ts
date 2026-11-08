// @vitest-environment node
//
// «Bloques quitados»: la cuenta que ve la persona y que va a la bitácora no cuenta dos veces lo que
// vive dentro de otro bloque (la miniatura y la nota del fabricante van dentro del EXIF).

import { describe, expect, it } from "vitest";

import { bloquesQuitados } from "../../src/engine/metadatos/inventario";
import type { Elemento } from "../../src/engine/metadatos/tipos";

const el = (
  clase: Elemento["clase"],
  marcador: string,
  cuantos = 1,
): Elemento => ({
  clase,
  marcador,
  bytes: 10,
  cuantos,
});

describe("bloquesQuitados", () => {
  it("suma los bloques uno a uno", () => {
    expect(
      bloquesQuitados([el("exif", "APP1"), el("comentario", "COM", 2)]),
    ).toBe(3);
  });

  it("no suma otra vez la miniatura ni la nota del fabricante de un EXIF, ni la miniatura de Photoshop", () => {
    expect(
      bloquesQuitados([
        el("exif", "APP1"),
        el("miniatura", "IFD1"),
        el("fabricante", "MakerNote"),
        el("iptc", "APP13"),
        el("miniatura", "8BIM"),
      ]),
    ).toBe(2);
  });

  it("una miniatura que es un segmento propio sí es un bloque", () => {
    expect(bloquesQuitados([el("miniatura", "APP0")])).toBe(1);
  });

  it("sin nada quitado, cero", () => {
    expect(bloquesQuitados([])).toBe(0);
  });
});
