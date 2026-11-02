// @vitest-environment node
//
// IPTC-IIM dentro de los recursos de Photoshop (APP13): nombra el autor (`By-line`), la ciudad, el
// pie de foto; cuenta lo demás; un bloque roto se lee hasta donde se puede y no lanza.

import { describe, expect, it } from "vitest";

import {
  CABECERA_PHOTOSHOP,
  leerIptcIim,
  leerIrb,
  MAXIMO_DE_REGISTROS,
} from "../../src/engine/metadatos/iptc";
import {
  be16,
  be32,
  iim,
  latin1,
  paqueteXmp,
  recurso8bim,
  texto,
  unir,
} from "./metadatos-ayuda";

describe("IIM", () => {
  it("nombra los datasets del registro 2 de la lista cerrada y cuenta los demás", () => {
    const l = leerIptcIim(
      iim([
        [1, 90, [0x1b, 0x25, 0x47]],
        [2, 0, [0, 4]],
        [2, 5, "CENTINELA Titulo"],
        [2, 25, "uno"],
        [2, 25, "dos"],
        [2, 55, "20260314"],
        [2, 80, "CENTINELA Ana Perez"],
        [2, 85, "Fotógrafa"],
        [2, 90, "Bogotá"],
        [2, 92, "Chapinero"],
        [2, 95, "Cundinamarca"],
        [2, 100, "COL"],
        [2, 101, "Colombia"],
        [2, 105, "Titular"],
        [2, 110, "Credito"],
        [2, 115, "Fuente"],
        [2, 116, "(c) CENTINELA"],
        [2, 118, "contacto@example.invalid"],
        [2, 120, "Pie de foto"],
        [2, 122, "Editora"],
        [2, 10, "5"],
      ]),
    );
    expect(l.campos.map((c) => [c.clave, c.valor, c.revela])).toEqual([
      ["ObjectName", "CENTINELA Titulo", "descripcion"],
      ["Keywords", "uno", "descripcion"],
      ["Keywords", "dos", "descripcion"],
      ["DateCreated", "20260314", "fecha"],
      ["By-line", "CENTINELA Ana Perez", "autoria"],
      ["By-lineTitle", "Fotógrafa", "autoria"],
      ["City", "Bogotá", "ubicacion"],
      ["Sub-location", "Chapinero", "ubicacion"],
      ["Province-State", "Cundinamarca", "ubicacion"],
      ["Country-PrimaryLocationCode", "COL", "ubicacion"],
      ["Country-PrimaryLocationName", "Colombia", "ubicacion"],
      ["Headline", "Titular", "descripcion"],
      ["Credit", "Credito", "autoria"],
      ["Source", "Fuente", "autoria"],
      ["CopyrightNotice", "(c) CENTINELA", "autoria"],
      ["Contact", "contacto@example.invalid", "autoria"],
      ["Caption-Abstract", "Pie de foto", "descripcion"],
      ["Writer-Editor", "Editora", "autoria"],
    ]);
    expect(l.campos.every((c) => c.origen === "iptc")).toBe(true);
    expect(l.otrasEtiquetas).toBe(3);
    expect(l.incompleto).toBe(false);
  });

  it("Latin-1 cuando el valor no es UTF-8", () => {
    const l = leerIptcIim(iim([[2, 90, latin1("Bogotá")]]));
    expect(l.campos[0].valor).toBe("Bogotá");
  });

  it("largo extendido, valor vacío y valor recortado", () => {
    const largo = texto("A".repeat(3000));
    const extendido = unir(
      [0x1c, 2, 120],
      be16(0x8004),
      be32(largo.length),
      largo,
    );
    const l = leerIptcIim(unir(extendido, iim([[2, 80, "   "]])));
    expect(l.campos).toHaveLength(1);
    expect(l.campos[0].valor).toHaveLength(512);
    expect(l.recortados).toBe(true);
  });

  it("relleno de ceros al final: no es un bloque roto", () => {
    const l = leerIptcIim(unir(iim([[2, 80, "Ana"]]), new Uint8Array(7)));
    expect(l).toMatchObject({ incompleto: false, otrasEtiquetas: 0 });
  });

  it("basura, un largo extendido imposible o un valor cortado: incompleto, sin lanzar", () => {
    expect(leerIptcIim(unir(iim([[2, 80, "Ana"]]), [0x42])).incompleto).toBe(
      true,
    );
    expect(leerIptcIim(Uint8Array.from([0, 0, 1])).incompleto).toBe(true);
    expect(leerIptcIim(unir([0x1c, 2, 80], be16(0x8000))).incompleto).toBe(
      true,
    );
    expect(leerIptcIim(unir([0x1c, 2, 80], be16(0x8005))).incompleto).toBe(
      true,
    );
    const cortado = leerIptcIim(
      unir(iim([[2, 80, "Ana"]]), [0x1c, 2, 90], be16(50), texto("Bog")),
    );
    expect(cortado.incompleto).toBe(true);
    expect(cortado.campos.map((c) => c.valor)).toEqual(["Ana"]);
  });

  it("deja de leer pasado el tope de registros", () => {
    const muchos = iim(
      Array.from(
        { length: MAXIMO_DE_REGISTROS + 5 },
        () => [2, 10, "1"] as const,
      ),
    );
    const l = leerIptcIim(muchos);
    expect(l.incompleto).toBe(true);
    expect(l.otrasEtiquetas).toBe(MAXIMO_DE_REGISTROS);
  });
});

describe("IRB (los recursos de Photoshop)", () => {
  it("lee el IIM del 0x0404, el XMP del 0x0424, mide la miniatura y cuenta los demás", () => {
    const xmp = paqueteXmp("<photoshop:City>Medellin</photoshop:City>");
    const l = leerIrb(
      unir(
        recurso8bim(0x03ed, new Uint8Array(16)),
        recurso8bim(0x0404, iim([[2, 80, "CENTINELA Firma"]]), "IPTC"),
        recurso8bim(0x0424, texto(xmp), "x"),
        recurso8bim(0x040c, new Uint8Array(41)),
        recurso8bim(0x0409, new Uint8Array(4)),
      ),
    );
    expect(l.campos.map((c) => [c.clave, c.origen, c.valor])).toEqual([
      ["By-line", "iptc", "CENTINELA Firma"],
      ["photoshop:City", "xmp", "Medellin"],
    ]);
    expect(l.miniatura).toBe(45);
    expect(l.otrasEtiquetas).toBe(1);
    expect(l.incompleto).toBe(false);
  });

  it("suma lo que el IIM no pudo leer", () => {
    const l = leerIrb(recurso8bim(0x0404, unir(iim([[2, 80, "A"]]), [0x42])));
    expect(l.incompleto).toBe(true);
  });

  it("acepta las otras firmas de recurso y el relleno de ceros al final", () => {
    const otra = unir(texto("MeSa"), recurso8bim(0x03ed, [1, 2]).subarray(4));
    const l = leerIrb(unir(otra, new Uint8Array(3)));
    expect(l).toMatchObject({ otrasEtiquetas: 1, incompleto: false });
  });

  it("una firma desconocida o un recurso cortado: incompleto, sin lanzar", () => {
    expect(leerIrb(texto("XXXX1234")).incompleto).toBe(true);
    const r = recurso8bim(0x0404, iim([[2, 80, "Ana"]]));
    expect(leerIrb(r.subarray(0, r.length - 4)).incompleto).toBe(true);
    // El relleno de un recurso impar puede faltar al final del bloque.
    const impar = recurso8bim(0x03ed, [1, 2, 3]);
    expect(leerIrb(impar.subarray(0, impar.length - 1)).incompleto).toBe(false);
  });

  it("deja de leer pasado el tope de recursos", () => {
    const uno = recurso8bim(0x03ed, []);
    const muchos = new Uint8Array(uno.length * (MAXIMO_DE_REGISTROS + 3));
    for (let i = 0; i < MAXIMO_DE_REGISTROS + 3; i++)
      muchos.set(uno, i * uno.length);
    const l = leerIrb(muchos);
    expect(l.incompleto).toBe(true);
    expect(l.otrasEtiquetas).toBe(MAXIMO_DE_REGISTROS);
  });

  it("la cabecera de un APP13 de Photoshop", () => {
    expect([...CABECERA_PHOTOSHOP]).toEqual([...latin1("Photoshop 3.0\0")]);
  });
});
