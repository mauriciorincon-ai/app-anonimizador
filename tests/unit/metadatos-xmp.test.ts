// @vitest-environment node
//
// XMP sin parser de XML: lo que se nombra, en sus dos formas, y lo que no se deja engañar.

import { describe, expect, it } from "vitest";

import {
  decodificarEntidades,
  LARGO_MAXIMO_DE_XMP,
  leerXmp,
  pareceXmp,
} from "@/engine/metadatos/xmp";
import { LARGO_MAXIMO_DE_VALOR } from "@/engine/metadatos/tipos";

const PAQUETE = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about=""
  xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
  xmlns:xmp="http://ns.adobe.com/xap/1.0/"
  xmpMM:DocumentID="uuid:11111111-2222-3333-4444-555555555555"
  xmpMM:InstanceID='uuid:99999999-8888-7777-6666-555555555555'
  xmp:CreatorTool="Editor Sintetico 3.1">
<dc:creator><rdf:Seq><rdf:li>Ana Pérez</rdf:li><rdf:li>Luis &amp; Co</rdf:li></rdf:Seq></dc:creator>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Informe &#x41;nual</rdf:li></rdf:Alt></dc:title>
<photoshop:City>Bogotá</photoshop:City>
<dc:description></dc:description>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

describe("leerXmp", () => {
  it("nombra las propiedades de la lista cerrada, en atributo y en elemento", () => {
    const { campos, recortados } = leerXmp(PAQUETE, "xmp");
    const porClave = Object.fromEntries(campos.map((c) => [c.clave, c]));

    expect(porClave["dc:creator"].valor).toBe("Ana Pérez; Luis & Co");
    expect(porClave["dc:creator"].revela).toBe("autoria");
    expect(porClave["xmpMM:DocumentID"].valor).toBe(
      "uuid:11111111-2222-3333-4444-555555555555",
    );
    expect(porClave["xmpMM:InstanceID"].valor).toBe(
      "uuid:99999999-8888-7777-6666-555555555555",
    );
    expect(porClave["xmp:CreatorTool"].revela).toBe("software");
    expect(porClave["dc:title"].valor).toBe("Informe Anual");
    expect(porClave["photoshop:City"].revela).toBe("ubicacion");
    // Un elemento vacío no es un campo: no hay nada que nombrar.
    expect(porClave["dc:description"]).toBeUndefined();
    expect(campos.every((c) => c.origen === "xmp")).toBe(true);
    expect(recortados).toBe(false);
  });

  it("respeta el origen que le pide quien llama", () => {
    const { campos } = leerXmp(PAQUETE, "pdf-revision-anterior");
    expect(campos.length).toBeGreaterThan(0);
    expect(campos.every((c) => c.origen === "pdf-revision-anterior")).toBe(
      true,
    );
  });

  it("no confunde un prefijo con otro ni una propiedad con su vecina", () => {
    const { campos } = leerXmp(
      '<x:xmpmeta><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creatorX="no" xdc:creator="tampoco"/></x:xmpmeta>',
      "xmp",
    );
    expect(campos).toEqual([]);
  });

  it("recorta un valor enorme y lo dice", () => {
    const largo = "a".repeat(LARGO_MAXIMO_DE_VALOR * 3);
    const { campos, recortados } = leerXmp(
      `<x:xmpmeta><dc:rights>${largo}</dc:rights></x:xmpmeta>`,
      "xmp",
    );
    expect(campos[0].valor).toHaveLength(LARGO_MAXIMO_DE_VALOR);
    expect(recortados).toBe(true);
  });

  it("no lee más allá del tope, y termina rápido con un paquete hostil", () => {
    const relleno = "<dc:creator>".repeat(50_000);
    const inicio = performance.now();
    const { campos } = leerXmp(
      `${relleno}${"x".repeat(LARGO_MAXIMO_DE_XMP)}<dc:creator>tarde</dc:creator>`,
      "xmp",
    );
    expect(performance.now() - inicio).toBeLessThan(2_000);
    expect(campos.find((c) => c.valor === "tarde")).toBeUndefined();
  });

  it("miles de atributos y etiquetas sin cerrar no lo vuelven cuadrático", () => {
    const bombas = [
      ' xmpMM:DocumentID="'.repeat(40_000),
      " xmpMM:DocumentID='".repeat(40_000),
      "<dc:title ".repeat(40_000),
      `<dc:creator>${"<rdf:li ".repeat(40_000)}</dc:creator>`,
      `<dc:subject>${"<".repeat(200_000)}</dc:subject>`,
    ];
    for (const bomba of bombas) {
      const inicio = performance.now();
      leerXmp(bomba, "xmp");
      expect(performance.now() - inicio).toBeLessThan(1_000);
    }
  });

  it("un mega de `<` dentro de varias propiedades anidadas se lee en un recorrido, no en uno por `<`", () => {
    // Cada propiedad recorre su rebanada entera; anidadas, la misma rebanada se recorre una vez por
    // propiedad. Con una expresión `<[^>]{0,1024}>` eran 1024 pasos por `<` y por propiedad
    // (hallazgo M1 de la auditoría del S6).
    const nombres = [
      "dc:creator",
      "dc:title",
      "dc:subject",
      "dc:description",
      "dc:rights",
      "photoshop:City",
      "xmp:CreatorTool",
    ];
    const anidar = (relleno: string) =>
      nombres.map((n) => `<${n}>`).join("") +
      relleno +
      [...nombres]
        .reverse()
        .map((n) => `</${n}>`)
        .join("");
    for (const relleno of [
      "<".repeat(LARGO_MAXIMO_DE_XMP - 1_000),
      "<rdf:li ".repeat((LARGO_MAXIMO_DE_XMP - 1_000) / 8),
    ]) {
      // 2 s y no 500 ms: en la CI, con cobertura y la suite entera en paralelo, un recorrido tardó
      // 621 ms (S7; 115–162 ms en local). La versión de 1024 pasos por `<` y por propiedad hacía
      // del orden de mil veces más trabajo: decenas de segundos. El tope sigue separando las dos.
      const inicio = performance.now();
      leerXmp(anidar(relleno), "xmp");
      expect(performance.now() - inicio).toBeLessThan(2_000);
    }
  });

  it("separa el texto de las etiquetas igual que antes: con `rdf:li`, sin ellos, y con un `<` suelto", () => {
    const leer = (cuerpo: string) =>
      leerXmp(`<dc:rights>${cuerpo}</dc:rights>`, "xmp").campos[0]?.valor;
    expect(
      leer(
        "<rdf:Alt><rdf:li xml:lang='es'>A</rdf:li> <rdf:li>B</rdf:li></rdf:Alt>",
      ),
    ).toBe("A; B");
    expect(leer("Uso <b>libre</b> con cita")).toBe("Uso libre con cita");
    expect(leer("menor < mayor")).toBe("menor < mayor");
    // Un `<` es etiqueta si su primer `>` está cerca; si no hay ninguno, es texto.
    expect(leer(`a <${"x".repeat(2_000)}> b`)).toContain("x");
    expect(leer("<<<")).toBe("<<<");
  });
});

describe("decodificarEntidades", () => {
  it("decodifica las cinco de XML y las numéricas, y nada más", () => {
    expect(decodificarEntidades("&lt;a&gt; &quot;b&quot; &apos;c&apos;")).toBe(
      "<a> \"b\" 'c'",
    );
    expect(decodificarEntidades("&#233;&#xE9;")).toBe("éé");
    // Sin DTD no hay entidades con nombre propio, ni puntos de código imposibles.
    expect(decodificarEntidades("&nbsp;&#x110000;&#0;")).toBe(
      "&nbsp;&#x110000;&#0;",
    );
  });
});

describe("pareceXmp", () => {
  it("mira la raíz, no el nombre", () => {
    expect(pareceXmp(PAQUETE)).toBe(true);
    expect(pareceXmp("<rdf:RDF>")).toBe(true);
    expect(pareceXmp("<html><body>no</body></html>")).toBe(false);
  });
});
