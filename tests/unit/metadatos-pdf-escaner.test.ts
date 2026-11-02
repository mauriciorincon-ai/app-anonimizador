// @vitest-environment node
//
// El escáner de bytes de un PDF (ADR-010, punto 3): la historia que el archivo guarda y un lector
// no ve. Todo PDF de aquí se construye a mano en `pdf-ayuda.ts`, con datos inventados.

import { describe, expect, it } from "vitest";

import {
  decodificarTextoPdf,
  escanearPdf,
  revelaDeInfo,
  type EscaneoDePdf,
} from "../../src/engine/metadatos/pdf-escaner";
import {
  LARGO_MAXIMO_DE_VALOR,
  MAXIMO_DE_CAMPOS,
} from "../../src/engine/metadatos/tipos";
import {
  CEDULA,
  EscritorDePdf,
  autorDeLaRevision,
  comoTexto,
  latin1,
  pdfDePrueba,
  pdfLinealizado,
} from "./pdf-ayuda";

/** Un PDF de dos revisiones cuyo `Info` de la PRIMERA tiene este cuerpo. */
function conInfoAnterior(cuerpo: string): Uint8Array {
  const w = new EscritorDePdf().cabecera();
  w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
  w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
  w.objeto(6, cuerpo);
  w.cerrar("/Root 1 0 R /Info 6 0 R");
  w.objeto(6, "<< /Producer (Vigente) >>");
  w.cerrar("/Root 1 0 R /Info 6 0 R");
  return w.resultado();
}

function valores(escaneo: EscaneoDePdf, clave: string): string[] {
  return escaneo.camposAnteriores
    .filter((c) => c.clave === clave)
    .map((c) => c.valor);
}

describe("revisiones: secciones `startxref … %%EOF`", () => {
  it("un PDF que nunca se editó tiene una revisión y nada anterior", () => {
    const e = escanearPdf(pdfDePrueba());
    expect(e.revisiones).toEqual({
      revisiones: 1,
      objetosRedefinidos: 0,
      conId: false,
    });
    expect(e.cifrado).toBe(false);
    expect(e.firmado).toBe(false);
    expect(e.flujosDeObjetos).toBe(false);
    expect(e.linealizado).toBe(false);
    expect(e.camposAnteriores).toEqual([]);
    expect(e.camposOmitidos).toBe(0);
    expect(e.recortados).toBe(false);
    // La única definición del `Info` es la vigente: se presume, no se lista.
    expect(e.infoPresunto.map((c) => c.clave)).toEqual([
      "Author",
      "Title",
      "Producer",
      "CreationDate",
      "ModDate",
    ]);
  });

  it("cuenta las actualizaciones incrementales y los objetos redefinidos", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 3, id: true, xmp: true }));
    expect(e.revisiones).toEqual({
      revisiones: 3,
      objetosRedefinidos: 2,
      conId: true,
    });
  });

  it("un objeto liberado sigue en los bytes, pero no es una redefinición", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 2, huerfano: true }));
    expect(e.revisiones.revisiones).toBe(2);
    expect(e.revisiones.objetosRedefinidos).toBe(1);
  });

  it("un `%%EOF` sin `startxref` no abre sección; un `startxref` truncado sí cierra una", () => {
    const base = new EscritorDePdf().cabecera();
    base.objeto(1, "<< /Type /Catalog >>");
    base.texto("%%EOF\n");
    base.cerrar("/Root 1 0 R");
    base.objeto(1, "<< /Type /Catalog >>");
    base.texto(
      "xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n123\n",
    );
    expect(escanearPdf(base.resultado()).revisiones.revisiones).toBe(2);
  });

  it("sin ninguna sección (bytes sueltos) sigue diciendo una revisión y no lanza", () => {
    for (const bytes of [
      new Uint8Array(0),
      latin1("hola"),
      latin1("%PDF-1.7\n1 0 obj\n"),
    ])
      expect(escanearPdf(bytes).revisiones.revisiones).toBe(1);
  });

  it("un número de más de diez cifras no es una definición de objeto", () => {
    const w = new EscritorDePdf().cabecera();
    w.texto("12345678901 0 obj\n<< >>\nendobj\n");
    w.objeto(1, "<< /Type /Catalog >>");
    w.texto("12345678901 0 obj\n<< >>\nendobj\n");
    w.cerrar("/Root 1 0 R");
    expect(escanearPdf(w.resultado()).revisiones.objetosRedefinidos).toBe(0);
  });
});

describe("el `Info` de revisiones anteriores", () => {
  it("encuentra el autor de la primera revisión, con la cédula, aunque se haya reemplazado", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 3 }));
    expect(valores(e, "Author")).toEqual([
      autorDeLaRevision(1),
      autorDeLaRevision(2),
    ]);
    expect(valores(e, "Author")[0]).toContain(CEDULA);
    // La vigente (la tercera) no es «anterior»: la lee pdf-lib. El escáner solo la presume.
    expect(e.infoPresunto.find((c) => c.clave === "Author")?.valor).toBe(
      autorDeLaRevision(3),
    );
    for (const campo of e.camposAnteriores)
      expect(campo.origen).toBe("pdf-revision-anterior");
  });

  it("dice qué revela cada entrada", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 2 }));
    const revela = Object.fromEntries(
      e.camposAnteriores.map((c) => [c.clave, c.revela]),
    );
    expect(revela).toEqual({
      Author: "autoria",
      Title: "descripcion",
      Producer: "software",
      CreationDate: "fecha",
      ModDate: "fecha",
    });
  });

  it("un `Info` que el último tráiler ya no nombra es entero de antes", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog >>");
    w.objeto(6, "<< /Author (Autor Viejo) >>");
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    w.objeto(26, "<< /Author (Autor Nuevo) >>");
    w.cerrar("/Root 1 0 R /Info 26 0 R");
    const e = escanearPdf(w.resultado());
    expect(valores(e, "Author")).toEqual(["Autor Viejo"]);
    expect(e.infoPresunto.map((c) => c.valor)).toEqual(["Autor Nuevo"]);
  });

  it("si la última revisión guardó el `Info` comprimido, la última en texto queda como PRESUNTA", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 3, comprimida: 3 }));
    expect(valores(e, "Author")).toEqual([autorDeLaRevision(1)]);
    expect(e.infoPresunto.find((c) => c.clave === "Author")?.valor).toBe(
      autorDeLaRevision(2),
    );
    // Un flujo de objetos en la ÚLTIMA revisión no esconde nada de antes.
    expect(e.flujosDeObjetos).toBe(false);
  });

  it("una revisión anterior en flujos de objetos se avisa: lo de dentro no se puede listar", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 3, comprimida: 2 }));
    expect(e.flujosDeObjetos).toBe(true);
    expect(e.revisiones.revisiones).toBe(3);
    // La revisión 2 está comprimida: su autor no aparece. La 1 sí.
    expect(valores(e, "Author")).toEqual([autorDeLaRevision(1)]);
  });

  it("los valores que no son texto, vacíos o referencias no se listan", () => {
    const e = escanearPdf(
      conInfoAnterior(
        "<< /Trapped /False /Count 3 /Ref 5 0 R /Lista [(a) (b)] /Sub << /X (y) >> /Vacio () /Blanco (   ) /Author (Sí) >>",
      ),
    );
    expect(e.camposAnteriores.map((c) => c.clave)).toEqual(["Author"]);
  });

  it("un `Info` que no es un diccionario se ignora", () => {
    expect(
      escanearPdf(conInfoAnterior("(solo texto)")).camposAnteriores,
    ).toEqual([]);
  });

  it("las claves con escapes `#xx` se leen decodificadas", () => {
    const e = escanearPdf(conInfoAnterior("<< /Mi#20Clave (x) >>"));
    expect(e.camposAnteriores).toEqual([
      {
        clave: "Mi Clave",
        origen: "pdf-revision-anterior",
        valor: "x",
        revela: "otro",
      },
    ]);
  });

  it("la basura entre entradas se salta sin perder las que siguen", () => {
    const e = escanearPdf(
      conInfoAnterior(
        "<< /A (uno) basura ) > } 12 /B (dos) [ (a\\)b) <41> << /X [1 2] >> %comentario\n ] /C (tres) >>",
      ),
    );
    expect(e.camposAnteriores.map((c) => [c.clave, c.valor])).toEqual([
      ["A", "uno"],
      ["B", "dos"],
      ["C", "tres"],
    ]);
  });

  it("un diccionario sin cerrar se lee hasta donde llega", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(6, "<< /Author (Sin cierre)");
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    w.objeto(6, "<< /Author (Vigente) >>");
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    expect(valores(escanearPdf(w.resultado()), "Author")[0]).toContain(
      "Sin cierre",
    );
  });
});

describe("cadenas literales y hexadecimales (ISO 32000-1 § 7.3.4)", () => {
  const leer = (cuerpo: string) =>
    valores(escanearPdf(conInfoAnterior(`<< /V ${cuerpo} >>`)), "V")[0];

  it("escapes de una letra, octales, paréntesis anidados y barra + fin de línea", () => {
    expect(leer("(a\\nb\\rc\\td\\be\\ff)")).toBe("a\nb\rc\td\be\ff");
    expect(leer("(\\(x\\) \\\\ (anidado (doble)))")).toBe(
      "(x) \\ (anidado (doble))",
    );
    expect(leer("(\\101\\102\\7C)")).toBe("AB\x07C");
    expect(leer("(\\0601)")).toBe("01");
    expect(leer("(uno\\\ndos\\\r\ntres\\\rcuatro)")).toBe("unodostrescuatro");
    expect(leer("(\\q)")).toBe("q");
  });

  it("un fin de línea crudo dentro de la cadena se lee como LF", () => {
    expect(leer("(a\r\nb\rc\nd)")).toBe("a\nb\nc\nd");
  });

  it("hexadecimal con espacios y con un dígito impar al final", () => {
    expect(leer("<41 42\n43>")).toBe("ABC");
    expect(leer("<414>")).toBe("A@");
  });

  it("UTF-16BE con marca de orden, y también UTF-16LE y UTF-8 (PDF 2.0)", () => {
    expect(leer("<FEFF00C1006E0061>")).toBe("Ána");
    expect(leer("<FFFE4100>")).toBe("A");
    expect(leer("<EFBBBFC3A9>")).toBe("é");
  });

  it("PDFDocEncoding donde no coincide con latin1 (anexo D)", () => {
    expect(leer("<809296A0>")).toBe("•™Œ€");
    expect(leer("<7F9FAD>")).toBe("���");
    expect(leer("<E9>")).toBe("é");
  });

  it("un valor largo se recorta a `LARGO_MAXIMO_DE_VALOR` y se avisa", () => {
    const e = escanearPdf(
      conInfoAnterior(
        `<< /Title (${"x".repeat(5000)}) /Keywords <${"41".repeat(600)}> >>`,
      ),
    );
    expect(valores(e, "Title")[0]).toHaveLength(LARGO_MAXIMO_DE_VALOR);
    expect(valores(e, "Keywords")[0]).toHaveLength(LARGO_MAXIMO_DE_VALOR);
    expect(e.recortados).toBe(true);
  });

  it("una cadena hexadecimal enorme se corta al guardarla y se avisa igual", () => {
    const e = escanearPdf(
      conInfoAnterior(`<< /Subject <${"4".repeat(9001)}> >>`),
    );
    expect(valores(e, "Subject")[0]).toHaveLength(LARGO_MAXIMO_DE_VALOR);
    expect(e.recortados).toBe(true);
  });

  it("una cadena sin cerrar termina en el fin del diccionario, sin lanzar", () => {
    expect(() =>
      escanearPdf(conInfoAnterior("<< /V (abierta \\")),
    ).not.toThrow();
    expect(() => escanearPdf(conInfoAnterior("<< /V <41"))).not.toThrow();
  });
});

describe("decodificarTextoPdf y revelaDeInfo", () => {
  it("decodifica según la marca de orden", () => {
    expect(decodificarTextoPdf([0xfe, 0xff, 0x00, 0x41, 0x00])).toBe("A");
    expect(decodificarTextoPdf([0xef, 0xbb, 0xbf, 0x41])).toBe("A");
    expect(decodificarTextoPdf([0x18, 0x41])).toBe("˘A");
    expect(decodificarTextoPdf([])).toBe("");
  });

  it("todo lo que no es una entrada conocida revela «otro»", () => {
    expect(revelaDeInfo("Creator")).toBe("software");
    expect(revelaDeInfo("Subject")).toBe("descripcion");
    expect(revelaDeInfo("Keywords")).toBe("descripcion");
    expect(revelaDeInfo("Trapped")).toBe("otro");
  });
});

describe("XMP de revisiones anteriores", () => {
  it("lista los identificadores del paquete que una edición redefinió, no los del vigente", () => {
    const e = escanearPdf(pdfDePrueba({ revisiones: 2, xmp: true }));
    const xmp = e.camposAnteriores.filter((c) => c.clave.includes(":"));
    expect(xmp.map((c) => [c.clave, c.valor])).toEqual([
      ["xmp:CreatorTool", "Editor Sintetico 1"],
      ["xmpMM:DocumentID", "uuid:0a0a0a0a-0000-4000-8000-000000000001"],
      ["xmpMM:InstanceID", "uuid:0b0b0b0b-0000-4000-8000-000000000001"],
    ]);
    expect(xmp.every((c) => c.origen === "pdf-revision-anterior")).toBe(true);
  });

  it("un XMP comprimido no se lee (se quita igual con la reescritura)", () => {
    const w = new EscritorDePdf().cabecera();
    w.flujo(
      7,
      "/Type /Metadata /Subtype /XML /Filter /FlateDecode",
      "no es xmp",
    );
    w.cerrar("/Root 1 0 R");
    w.flujo(
      7,
      "/Type /Metadata /Subtype /XML",
      '<x:xmpmeta xmpMM:DocumentID="uuid:nuevo"/>',
    );
    w.cerrar("/Root 1 0 R");
    expect(escanearPdf(w.resultado()).camposAnteriores).toEqual([]);
  });
});

describe("flujos: el contenido se salta", () => {
  const SEÑUELO =
    "trailer\n<< /Info 6 0 R /Encrypt 9 0 R /ID [<00><00>] >>\nstartxref\n0\n%%EOF\n6 0 obj\n<< /Author (Falso) >>\nendobj\n/ByteRange [0 1 2 3]";

  it("con `/Length` directo, nada de lo que hay dentro cuenta", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog >>");
    w.flujo(4, "", SEÑUELO);
    w.cerrar("/Root 1 0 R");
    const e = escanearPdf(w.resultado());
    expect(e.revisiones).toEqual({
      revisiones: 1,
      objetosRedefinidos: 0,
      conId: false,
    });
    expect(e.cifrado).toBe(false);
    expect(e.firmado).toBe(false);
  });

  it("con `/Length` indirecto o mentiroso, se busca `endstream`", () => {
    for (const largo of ["30 0 R", "3", "999999"]) {
      const w = new EscritorDePdf().cabecera();
      w.objeto(1, "<< /Type /Catalog >>");
      w.flujo(4, "", SEÑUELO, largo);
      w.cerrar("/Root 1 0 R");
      const e = escanearPdf(w.resultado());
      expect(e.cifrado, largo).toBe(false);
      expect(e.revisiones.revisiones, largo).toBe(1);
    }
  });

  it("acepta `stream` seguido de CR o de CRLF, y un flujo sin `obj` delante", () => {
    for (const fin of ["\r", "\r\n"]) {
      const w = new EscritorDePdf().cabecera();
      w.texto(
        `4 0 obj\n<< /Length 5 >>\nstream${fin}%%EOF\nendstream\nendobj\n`,
      );
      w.texto(`<< /Length 9 >>\nstream\nstartxref\nendstream\n`);
      w.cerrar("/Root 1 0 R");
      expect(escanearPdf(w.resultado()).revisiones.revisiones).toBe(1);
    }
  });

  it("un flujo sin `endstream` llega hasta el final del archivo", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog >>");
    w.cerrar("/Root 1 0 R");
    w.texto(`4 0 obj\n<< /Length 30 0 R >>\nstream\n${SEÑUELO}`);
    const e = escanearPdf(w.resultado());
    expect(e.revisiones.revisiones).toBe(1);
    expect(e.cifrado).toBe(false);
  });
});

describe("cifrado, firma e identificador", () => {
  it("`/Encrypt` en el tráiler", () => {
    expect(escanearPdf(pdfDePrueba({ cifrado: true })).cifrado).toBe(true);
  });

  it("`/Encrypt` y `/ID` en el diccionario de un flujo `/XRef`", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog >>");
    w.cerrarConFlujo(3, "/Root 1 0 R /Encrypt 9 0 R /ID [<01> <01>]");
    const e = escanearPdf(w.resultado());
    expect(e.cifrado).toBe(true);
    expect(e.revisiones.conId).toBe(true);
  });

  it("un tráiler con comentarios se lee igual", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog >>");
    w.texto(
      "trailer\n<< % nota\n/Root 1 0 R /Encrypt 9 0 R >>\nstartxref\n0\n%%EOF\n",
    );
    expect(escanearPdf(w.resultado()).cifrado).toBe(true);
  });

  it("una firma se nota por `/ByteRange` o por `/Type /Sig`, pegado o separado", () => {
    expect(escanearPdf(pdfDePrueba({ firma: true })).firmado).toBe(true);
    for (const cuerpo of [
      "<< /Type/Sig >>",
      "<< /Type /Sig /Filter /X >>",
      "<< /ByteRange [0 1 2 3] >>",
    ]) {
      const w = new EscritorDePdf().cabecera();
      w.objeto(11, cuerpo);
      w.cerrar("/Root 1 0 R");
      expect(escanearPdf(w.resultado()).firmado, cuerpo).toBe(true);
    }
  });

  it("`/Type /SigFieldLock` no es una firma", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(11, "<< /Type /SigFieldLock /Action /All >>");
    w.cerrar("/Root 1 0 R");
    expect(escanearPdf(w.resultado()).firmado).toBe(false);
  });
});

describe("linealización (anexo F)", () => {
  it("la sección de la primera página no es una edición", () => {
    const e = escanearPdf(pdfLinealizado());
    expect(e.linealizado).toBe(true);
    expect(e.revisiones.revisiones).toBe(1);
    expect(e.objetosDeLinealizacion).toEqual([20, 23]);
    expect(e.camposAnteriores).toEqual([]);
  });

  it("una edición encima de un linealizado sí cuenta, y su `Info` de antes se lista", () => {
    const e = escanearPdf(pdfLinealizado(true));
    expect(e.revisiones.revisiones).toBe(2);
    expect(valores(e, "Author")).toEqual([autorDeLaRevision(1)]);
  });

  it("un `/H` que no apunta a un objeto deja solo el diccionario", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(20, "<< /Linearized 1 /H [ 3 12 999999 1 ] >>");
    w.objeto(1, "<< /Type /Catalog >>");
    w.cerrar("/Root 1 0 R");
    const e = escanearPdf(w.resultado());
    expect(e.linealizado).toBe(true);
    expect(e.objetosDeLinealizacion).toEqual([20]);
    expect(e.revisiones.revisiones).toBe(1);
  });
});

describe("lo que pdf-lib va a construir: objetos y flujos internos", () => {
  it("cuenta las definiciones en texto más el `/N` de cada flujo de objetos", () => {
    const sencillo = escanearPdf(pdfDePrueba());
    // Catálogo, páginas, página, contenido, fuente e `Info`.
    expect(sencillo.objetos).toBe(6);
    expect(sencillo.flujosInternos).toEqual([]);
    const comprimido = escanearPdf(
      pdfDePrueba({ revisiones: 2, comprimida: 2 }),
    );
    // Las 6 de la revisión 1 + el `/ObjStm` + el `/XRef` + 1 objeto dentro del `/ObjStm`.
    expect(comprimido.objetos).toBe(9);
    expect(comprimido.flujosInternos.map((f) => f.filtro)).toEqual([
      "ninguno",
      "ninguno",
    ]);
    expect(comprimido.flujosInternosDeMas).toBe(false);
  });

  it("clasifica el filtro: solo `/FlateDecode` se puede medir inflándolo", () => {
    const filtros = [
      ["/Filter /FlateDecode", "flate"],
      ["/Filter [/FlateDecode]", "flate"],
      ["/Filter []", "ninguno"],
      ["/Filter [/ASCII85Decode /FlateDecode]", "otro"],
      ["/Filter /LZWDecode", "otro"],
      ["/Filter 5 0 R", "otro"],
    ] as const;
    for (const [filtro, clase] of filtros) {
      const w = new EscritorDePdf().cabecera();
      w.flujo(9, `/Type /ObjStm /N 7 /First 0 ${filtro}`, "x");
      w.cerrar("/Root 1 0 R");
      const e = escanearPdf(w.resultado());
      expect(
        e.flujosInternos.map((f) => f.filtro),
        filtro,
      ).toEqual([clase]);
      expect(e.objetos, filtro).toBe(8);
    }
  });

  it("los datos de un flujo interno son exactamente su contenido", () => {
    const w = new EscritorDePdf().cabecera();
    w.flujo(9, "/Type /ObjStm /N 1 /First 4", "1 0 << >>");
    w.cerrar("/Root 1 0 R");
    const bytes = w.resultado();
    const [flujo] = escanearPdf(bytes).flujosInternos;
    expect(comoTexto(bytes.subarray(flujo.inicio, flujo.fin))).toBe(
      "1 0 << >>",
    );
  });

  it("un `/N` absurdo no desborda la suma", () => {
    const w = new EscritorDePdf().cabecera();
    w.flujo(9, "/Type /ObjStm /N 999999999999 /First 0", "x");
    w.cerrar("/Root 1 0 R");
    expect(escanearPdf(w.resultado()).objetos).toBe(10_000_001);
  });
});

describe("ventanas: leer por trozos da lo mismo que leer de una vez", () => {
  /** Documentos que tocan cada clase de ficha: revisiones, flujos, `/XRef`, XMP, firma, linealización. */
  const documentos = () => {
    const señuelo = new EscritorDePdf().cabecera();
    señuelo.objeto(1, "<< /Type /Catalog >>");
    señuelo.flujo(
      4,
      "",
      "trailer << /Encrypt 9 0 R >> startxref 0 %%EOF",
      "30 0 R",
    );
    señuelo.objeto(6, "<< /Author (Uno) /T <FEFF0041> >>");
    señuelo.cerrar("/Root 1 0 R /Info 6 0 R");
    señuelo.texto("trailer\n<< /Info 6 0 R >>\n");
    señuelo.objeto(6, "<< /Author (Dos) >>");
    señuelo.cerrar("/Root 1 0 R /Info 6 0 R");
    return [
      pdfDePrueba({
        revisiones: 3,
        xmp: true,
        id: true,
        firma: true,
        huerfano: true,
        comprimida: 2,
      }),
      pdfDePrueba({
        revisiones: 2,
        piezas: true,
        anotacion: true,
        adjunto: true,
        javascript: true,
      }),
      pdfLinealizado(true),
      señuelo.resultado(),
    ];
  };

  it("con núcleos de 1 byte a 4 KB, cada frontera cae en cada ficha", () => {
    for (const bytes of documentos()) {
      const entera = escanearPdf(bytes);
      for (const nucleo of [1, 2, 3, 5, 7, 11, 13, 64, 100, 257, 1000, 4096])
        expect(escanearPdf(bytes, nucleo), `núcleo ${nucleo}`).toEqual(entera);
    }
  });

  it("con el núcleo de verdad (8 MB), el documento cruzando la frontera en muchos puntos", () => {
    const NUCLEO = 8 * 1024 * 1024;
    const documento = pdfDePrueba({
      revisiones: 3,
      xmp: true,
      id: true,
      firma: true,
    });
    const esperado = escanearPdf(documento);
    const cabecera = "%PDF-1.4\n";
    const resto = documento.subarray(cabecera.length);
    const paso = Math.ceil(documento.length / 24);
    for (
      let corrimiento = -documento.length - 64;
      corrimiento <= 64;
      corrimiento += paso
    ) {
      // Un comentario de relleno empuja el documento para que la frontera caiga en otra ficha.
      const relleno = NUCLEO + corrimiento - cabecera.length - 2;
      const bytes = new Uint8Array(
        cabecera.length + relleno + 2 + resto.length,
      );
      bytes.set(latin1(cabecera), 0);
      bytes[cabecera.length] = 0x25;
      bytes.fill(0x61, cabecera.length + 1, cabecera.length + 1 + relleno);
      bytes[cabecera.length + 1 + relleno] = 0x0a;
      bytes.set(resto, cabecera.length + relleno + 2);
      expect(escanearPdf(bytes), `corrimiento ${corrimiento}`).toEqual(
        esperado,
      );
    }
  });

  it("un flujo que cruza varias ventanas, con largo indirecto, se salta igual", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(6, "<< /Author (Antes) >>");
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    w.flujo(4, "", new Uint8Array(20 * 1024 * 1024).fill(0x65), "30 0 R");
    w.objeto(6, "<< /Author (Despues) >>");
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    const e = escanearPdf(w.resultado());
    expect(e.revisiones.revisiones).toBe(2);
    expect(valores(e, "Author")).toEqual(["Antes"]);
  });
});

describe("topes", () => {
  it("pasado `MAXIMO_DE_CAMPOS`, los campos se cuentan en vez de listarse", () => {
    const claves = Array.from(
      { length: MAXIMO_DE_CAMPOS + 25 },
      (_, i) => `/K${i} (v${i})`,
    );
    const e = escanearPdf(conInfoAnterior(`<< ${claves.join(" ")} >>`));
    expect(e.camposAnteriores).toHaveLength(MAXIMO_DE_CAMPOS);
    expect(e.camposOmitidos).toBe(25);
  });

  it("es lineal: 16 MB de flujo y 40 000 objetos se recorren en poco tiempo", () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog >>");
    w.flujo(4, "", new Uint8Array(16 * 1024 * 1024).fill(0x31));
    for (let i = 0; i < 40_000; i++)
      w.objeto(100 + i, `<< /N ${i} /S (texto ${i}) >>`);
    w.cerrar("/Root 1 0 R");
    const bytes = w.resultado();
    const inicio = performance.now();
    const e = escanearPdf(bytes);
    expect(performance.now() - inicio).toBeLessThan(3000);
    expect(e.revisiones.revisiones).toBe(1);
  });

  it("entradas hostiles para la expresión regular terminan rápido", () => {
    const casos = [
      "1 ".repeat(1_000_000),
      `1${" ".repeat(2_000_000)}2${" ".repeat(2_000_000)}`,
      "9".repeat(3_000_000),
      "<<".repeat(500_000),
      "(".repeat(1_000_000),
      "trailer ".repeat(200_000),
      "trailer\n<<".repeat(200_000),
    ];
    for (const caso of casos) {
      const inicio = performance.now();
      escanearPdf(latin1(`%PDF-1.7\n${caso}`));
      expect(performance.now() - inicio, caso.slice(0, 12)).toBeLessThan(3000);
    }
  });
});
