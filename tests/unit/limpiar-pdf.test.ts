// @vitest-environment node
//
// La limpieza de un PDF en el worker (ADR-010): analizar lo que dice de sí mismo, reescribirlo desde
// el catálogo sin `Info`, sin XMP, sin revisiones anteriores ni huérfanos, con un `/ID` nuevo que
// sale del contenido limpio — y que un PDF hostil termine en una CLAVE, rápido, nunca en otra cosa.
//
// Nota de la medición (`TOPE_PDF_BYTES`): ver el comentario de esa constante en
// `src/workers/limpiar-pdf.ts`.

import { deflateSync } from "node:zlib";

import { PDFDocument, PDFRawStream } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { escanearPdf } from "../../src/engine/metadatos/pdf-escaner";
import {
  ErrorDeMetadatos,
  type AnalisisDeMetadatos,
  type MotivoDeMetadatos,
} from "../../src/engine/metadatos/tipos";
import {
  TOPE_PDF_INFLADO,
  TOPE_PDF_OBJETOS,
  analizarPdf,
  limpiarPdf,
} from "../../src/workers/limpiar-pdf";
import {
  CEDULA,
  CENTINELAS,
  CONTENIDO_DE_PAGINA,
  EscritorDePdf,
  ID_ORIGINAL,
  autorDeLaRevision,
  comoTexto,
  cuenta,
  latin1,
  lcg,
  pdfDePrueba,
  pdfLinealizado,
  type OpcionesDePdf,
} from "./pdf-ayuda";

/** Todo lo que el documento de prueba sabe tener. */
const COMPLETO: OpcionesDePdf = {
  revisiones: 3,
  xmp: true,
  id: true,
  huerfano: true,
  piezas: true,
  anotacion: true,
  adjunto: true,
  javascript: true,
  firma: true,
};

async function motivo(
  promesa: Promise<unknown>,
): Promise<MotivoDeMetadatos | "ok"> {
  try {
    await promesa;
    return "ok";
  } catch (error) {
    if (error instanceof ErrorDeMetadatos) return error.motivo;
    throw error;
  }
}

function clases(analisis: AnalisisDeMetadatos) {
  return analisis.quitables.map((e) => [e.clase, e.marcador, e.cuantos]);
}

/** Los bytes del flujo de contenido de la primera página, como los ve un lector. */
async function contenidoDeLaPagina(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const contenido = doc.getPage(0).node.Contents();
  if (!(contenido instanceof PDFRawStream)) throw new Error("sin contenido");
  return contenido.contents;
}

// pdf-lib avisa por consola cada objeto que no puede leer (posición y número, nunca contenido).
// En los casos hostiles son miles de líneas: se callan para que la salida del test se pueda leer.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("analizarPdf: lo que el documento dice de sí mismo", () => {
  it("lista el Info vigente, su XMP, el /ID y los valores de revisiones anteriores", async () => {
    const analisis = await analizarPdf(pdfDePrueba(COMPLETO));
    expect(analisis.formato).toBe("pdf");
    expect(analisis.otrasEtiquetas).toBe(0);
    expect(analisis.conservables).toEqual([]);

    const de = (origen: string) =>
      analisis.campos
        .filter((c) => c.origen === origen)
        .map((c) => [c.clave, c.valor, c.revela]);
    expect(de("pdf-info")).toEqual([
      ["Author", autorDeLaRevision(3), "autoria"],
      ["Title", "Informe trimestral", "descripcion"],
      ["Producer", "Generador Sintetico 3", "software"],
      ["CreationDate", "D:20260101000000Z", "fecha"],
      ["ModDate", "D:20260203000000Z", "fecha"],
      ["ID", ID_ORIGINAL.toLowerCase(), "identificador"],
    ]);
    expect(de("pdf-xmp")).toEqual([
      ["xmp:CreatorTool", "Editor Sintetico 3", "software"],
      [
        "xmpMM:DocumentID",
        "uuid:0a0a0a0a-0000-4000-8000-000000000003",
        "identificador",
      ],
      [
        "xmpMM:InstanceID",
        "uuid:0b0b0b0b-0000-4000-8000-000000000003",
        "identificador",
      ],
    ]);
    const anteriores = analisis.campos.filter(
      (c) => c.origen === "pdf-revision-anterior",
    );
    expect(
      anteriores.filter((c) => c.clave === "Author").map((c) => c.valor),
    ).toEqual([autorDeLaRevision(1), autorDeLaRevision(2)]);
    expect(anteriores.some((c) => c.valor.includes(CEDULA))).toBe(true);
    expect(anteriores.some((c) => c.clave === "xmpMM:InstanceID")).toBe(true);
  });

  it("dice qué quitaría, con sus cuentas", async () => {
    const analisis = await analizarPdf(pdfDePrueba(COMPLETO));
    expect(clases(analisis)).toEqual([
      ["pdf-info", "/Info", 1],
      ["pdf-xmp", "/Metadata", 1],
      ["pdf-piece-info", "/PieceInfo", 1],
      ["pdf-miniatura", "/Thumb", 1],
      ["pdf-ultima-modificacion", "/LastModified", 1],
      ["pdf-revisiones", "%%EOF", 2],
      ["pdf-huerfanos", "obj", 1],
      ["pdf-id", "/ID", 1],
    ]);
    expect(analisis.quitables.every((e) => e.bytes === null)).toBe(true);
    expect(analisis.revisiones).toEqual({
      revisiones: 3,
      objetosRedefinidos: 2,
      conId: true,
    });
  });

  it("avisa de lo que NO limpia: firma, anotaciones con autor, adjuntos, formularios, JavaScript", async () => {
    const analisis = await analizarPdf(pdfDePrueba(COMPLETO));
    expect(analisis.avisos).toEqual([
      { clave: "pdf-firmado" },
      { clave: "pdf-anotaciones", n: 1 },
      { clave: "pdf-adjuntos", n: 1 },
      { clave: "pdf-formularios" },
      { clave: "pdf-javascript" },
    ]);
  });

  it("un PDF sin nada que contar no tiene quitables ni avisos", async () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    w.objeto(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>");
    w.cerrar("/Root 1 0 R");
    const analisis = await analizarPdf(w.resultado());
    expect(analisis.campos).toEqual([]);
    expect(analisis.quitables).toEqual([]);
    expect(analisis.avisos).toEqual([]);
  });

  it("un linealizado: su diccionario y su flujo de pistas no son huérfanos", async () => {
    const analisis = await analizarPdf(pdfLinealizado());
    expect(analisis.revisiones?.revisiones).toBe(1);
    expect(clases(analisis)).toEqual([
      ["pdf-info", "/Info", 1],
      ["pdf-id", "/ID", 1],
    ]);
  });

  it("si la última revisión guardó el Info comprimido, el de texto se lista como anterior", async () => {
    const analisis = await analizarPdf(
      pdfDePrueba({ revisiones: 3, comprimida: 3 }),
    );
    const autores = analisis.campos
      .filter((c) => c.clave === "Author")
      .map((c) => [c.origen, c.valor]);
    expect(autores).toEqual([
      ["pdf-info", autorDeLaRevision(3)],
      ["pdf-revision-anterior", autorDeLaRevision(1)],
      ["pdf-revision-anterior", autorDeLaRevision(2)],
    ]);
    expect(analisis.avisos).toEqual([]);
  });

  it("una revisión anterior en flujos de objetos se avisa", async () => {
    const analisis = await analizarPdf(
      pdfDePrueba({ revisiones: 3, comprimida: 2 }),
    );
    expect(analisis.avisos).toEqual([{ clave: "pdf-flujos-de-objetos" }]);
  });

  it("un valor enorme se recorta y se avisa, sin desbordar la pila", async () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.objeto(
      6,
      `<< /Title (${"t".repeat(2_000_000)}) /Subject <${"41".repeat(1_000_000)}> >>`,
    );
    w.cerrar("/Root 1 0 R /Info 6 0 R /ID [(literal) (literal)]");
    const analisis = await analizarPdf(w.resultado());
    const titulo = analisis.campos.find((c) => c.clave === "Title");
    expect(titulo?.valor).toHaveLength(512);
    expect(
      analisis.campos.find((c) => c.clave === "Subject")?.valor,
    ).toHaveLength(512);
    expect(analisis.campos.find((c) => c.clave === "ID")?.valor).toBe(
      "6c69746572616c",
    );
    expect(analisis.avisos).toContainEqual({ clave: "valores-recortados" });
  });

  it("un UTF-16 roto en el Info no se lista ni rompe nada", async () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.objeto(
      6,
      "<< /Author <FEFFD800> /Title (bien) /Rara#20Clave (x) /Numero 3 >>",
    );
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    const analisis = await analizarPdf(w.resultado());
    expect(analisis.campos.map((c) => c.clave)).toContain("Title");
    expect(analisis.campos.map((c) => c.clave)).toContain("Rara Clave");
    expect(analisis.campos.map((c) => c.clave)).not.toContain("Numero");
  });

  it("el XMP comprimido se lee hasta el tope: una bomba de compresión no pasa de ahí", async () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmpMM:DocumentID="uuid:bomba"/></rdf:RDF></x:xmpmeta>`;
    const bomba = deflateSync(
      Buffer.concat([Buffer.from(xmp), Buffer.alloc(256 * 1024 * 1024, 0x20)]),
    );
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.flujo(
      7,
      "/Type /Metadata /Subtype /XML /Filter /FlateDecode",
      new Uint8Array(bomba),
    );
    w.cerrar("/Root 1 0 R");
    const inicio = performance.now();
    const analisis = await analizarPdf(w.resultado());
    expect(performance.now() - inicio).toBeLessThan(2000);
    expect(analisis.campos).toEqual([
      {
        clave: "xmpMM:DocumentID",
        origen: "pdf-xmp",
        valor: "uuid:bomba",
        revela: "identificador",
      },
    ]);
  });

  it("un filtro desconocido en el XMP: se cuenta para quitar, sin listar", async () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R /Metadata 7 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.flujo(7, "/Type /Metadata /Subtype /XML /Filter /JBIG2Decode", "????");
    w.cerrar("/Root 1 0 R");
    const analisis = await analizarPdf(w.resultado());
    expect(analisis.campos).toEqual([]);
    expect(clases(analisis)).toEqual([["pdf-xmp", "/Metadata", 1]]);
  });

  it("el JavaScript también se ve por el árbol de nombres", async () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(
      1,
      "<< /Type /Catalog /Pages 2 0 R /Names << /JavaScript 8 0 R >> >>",
    );
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.objeto(8, "<< /Names [] >>");
    w.cerrar("/Root 1 0 R");
    expect((await analizarPdf(w.resultado())).avisos).toEqual([
      { clave: "pdf-javascript" },
    ]);
  });

  it("pasado `MAXIMO_DE_CAMPOS`, se avisa cuántos quedaron sin listar", async () => {
    const claves = Array.from({ length: 450 }, (_, i) => `/K${i} (v${i})`).join(
      " ",
    );
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.objeto(6, `<< ${claves} >>`);
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    const analisis = await analizarPdf(w.resultado());
    expect(analisis.campos).toHaveLength(400);
    expect(analisis.avisos).toContainEqual({ clave: "campos-de-mas", n: 50 });
  });
});

describe("lo que no se abre", () => {
  it("un PDF cifrado es `pdf-cifrado` en las dos funciones", async () => {
    const cifrado = pdfDePrueba({ cifrado: true, revisiones: 2 });
    expect(await motivo(analizarPdf(cifrado))).toBe("pdf-cifrado");
    expect(await motivo(limpiarPdf(cifrado))).toBe("pdf-cifrado");
  });

  it("lo rechaza el escáner, antes de pdf-lib: aunque `/Encrypt` no apunte a nada", async () => {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.cerrar("/Root 1 0 R /Encrypt 99 0 R");
    expect(await motivo(analizarPdf(w.resultado()))).toBe("pdf-cifrado");
  });

  it("lo que no es un PDF, o no tiene catálogo, es `pdf-ilegible`", async () => {
    for (const bytes of [
      latin1("no soy un pdf"),
      new Uint8Array(0),
      latin1(
        "%PDF-1.7\n1 0 obj\n42\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
      ),
      latin1(
        "%PDF-1.7\n1 0 obj\n<< /A 1 >>\nendobj\ntrailer\n<< /Size 2 >>\n%%EOF",
      ),
      latin1("%PDF-1.7\n"),
    ]) {
      expect(await motivo(analizarPdf(bytes))).toBe("pdf-ilegible");
      expect(await motivo(limpiarPdf(bytes))).toBe("pdf-ilegible");
    }
  });
});

describe("limpiarPdf: reescribir sin lo que el documento decía de sí mismo", () => {
  it("una sola sección, sin Info, sin XMP, sin piezas, sin centinelas, con las páginas intactas", async () => {
    const entrada = pdfDePrueba(COMPLETO);
    const { bytes, quitados, conservados, idNuevo } = await limpiarPdf(entrada);
    expect(cuenta(bytes, "%%EOF")).toBe(1);
    expect(cuenta(bytes, "startxref")).toBe(1);
    for (const prohibido of [
      "/Prev",
      "/Info",
      "/Metadata",
      "/PieceInfo",
      "/Thumb",
      "/LastModified",
      "/ModDate",
      "/Producer",
      "xmpmeta",
      "/ObjStm",
    ])
      expect(cuenta(bytes, prohibido), prohibido).toBe(0);
    for (const centinela of CENTINELAS)
      expect(cuenta(bytes, centinela), centinela).toBe(0);
    expect(cuenta(bytes, CONTENIDO_DE_PAGINA)).toBe(1);
    expect(await contenidoDeLaPagina(bytes)).toEqual(
      await contenidoDeLaPagina(entrada),
    );
    expect(conservados).toEqual([]);
    // Lo que se quitó es lo que el análisis dijo que se quitaría.
    expect(quitados).toEqual((await analizarPdf(entrada)).quitables);
    // El /ID nuevo: 32 hex, en los dos elementos, distinto del original.
    expect(idNuevo).toMatch(/^[0-9a-f]{32}$/);
    expect(comoTexto(bytes)).toContain(`/ID [ <${idNuevo}> <${idNuevo}> ]`);
    expect(idNuevo).not.toBe(ID_ORIGINAL.toLowerCase());
  });

  it("lo que se informa y no se limpia sigue ahí (y la reescritura no inventa un formulario)", async () => {
    const { bytes } = await limpiarPdf(pdfDePrueba(COMPLETO));
    expect(cuenta(bytes, "Revisora")).toBe(1);
    expect(cuenta(bytes, "/ByteRange")).toBe(1);
    expect(cuenta(bytes, "contenido adjunto sintetico")).toBe(1);
    const { bytes: sinFormulario } = await limpiarPdf(
      pdfDePrueba({ revisiones: 2 }),
    );
    expect(cuenta(sinFormulario, "/AcroForm")).toBe(0);
  });

  it("releída, la salida no tiene nada más que el /ID nuevo, ni revisiones de antes", async () => {
    const limpieza = await limpiarPdf(pdfDePrueba(COMPLETO));
    const despues = await analizarPdf(limpieza.bytes);
    expect(despues.campos).toEqual([
      {
        clave: "ID",
        origen: "pdf-info",
        valor: limpieza.idNuevo,
        revela: "identificador",
      },
    ]);
    expect(clases(despues)).toEqual([["pdf-id", "/ID", 1]]);
    expect(despues.revisiones).toEqual({
      revisiones: 1,
      objetosRedefinidos: 0,
      conId: true,
    });
    // Lo que solo se informa se sigue informando.
    expect(despues.avisos.map((a) => a.clave)).toEqual([
      "pdf-firmado",
      "pdf-anotaciones",
      "pdf-adjuntos",
      "pdf-formularios",
      "pdf-javascript",
    ]);
    const escaneo = escanearPdf(limpieza.bytes);
    expect(escaneo.camposAnteriores).toEqual([]);
    expect(escaneo.infoPresunto).toEqual([]);
    const doc = await PDFDocument.load(limpieza.bytes, {
      updateMetadata: false,
    });
    expect(doc.getPageCount()).toBe(1);
  });

  it("es determinista: los mismos bytes dan los mismos bytes", async () => {
    const entrada = pdfDePrueba(COMPLETO);
    const una = await limpiarPdf(entrada);
    const otra = await limpiarPdf(entrada.slice());
    expect(otra.bytes).toEqual(una.bytes);
    expect(otra.idNuevo).toBe(una.idNuevo);
  });

  it("es idempotente: limpiar lo limpio da exactamente lo mismo", async () => {
    for (const opciones of [COMPLETO, { revisiones: 3, comprimida: 2 }, {}]) {
      const una = await limpiarPdf(pdfDePrueba(opciones));
      const dos = await limpiarPdf(una.bytes);
      expect(dos.bytes).toEqual(una.bytes);
      expect(dos.idNuevo).toBe(una.idNuevo);
    }
  });

  it("un PDF firmado se avisa y se limpia igual", async () => {
    const firmado = pdfDePrueba({ firma: true, revisiones: 2, id: true });
    expect((await analizarPdf(firmado)).avisos).toContainEqual({
      clave: "pdf-firmado",
    });
    const { bytes } = await limpiarPdf(firmado);
    expect(cuenta(bytes, "%%EOF")).toBe(1);
    expect(cuenta(bytes, CEDULA)).toBe(0);
  });

  it("un linealizado sale como un PDF normal de una sección", async () => {
    const { bytes } = await limpiarPdf(pdfLinealizado(true));
    expect(cuenta(bytes, "%%EOF")).toBe(1);
    expect(cuenta(bytes, "/Linearized")).toBe(0);
    expect(cuenta(bytes, CEDULA)).toBe(0);
    expect(await contenidoDeLaPagina(bytes)).toEqual(
      latin1(CONTENIDO_DE_PAGINA),
    );
  });

  it("una revisión anterior comprimida también se va", async () => {
    const { bytes } = await limpiarPdf(
      pdfDePrueba({ revisiones: 3, comprimida: 2 }),
    );
    expect(cuenta(bytes, "Autora")).toBe(0);
    expect(cuenta(bytes, "/ObjStm")).toBe(0);
    expect(cuenta(bytes, "/XRef")).toBe(0);
  });
});

describe("topes medidos ANTES de pdf-lib (sin tumbar el worker)", () => {
  /** Un PDF mínimo con un flujo de objetos de este diccionario y estos datos. */
  function conFlujoDeObjetos(
    diccionario: string,
    datos: Uint8Array,
  ): Uint8Array {
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.flujo(9, `/Type /ObjStm ${diccionario}`, datos);
    w.cerrar("/Root 1 0 R");
    return w.resultado();
  }

  it("más objetos que `TOPE_PDF_OBJETOS` es `pdf-ilegible`, al instante", async () => {
    const denso = conFlujoDeObjetos(
      `/N ${TOPE_PDF_OBJETOS} /First 0`,
      latin1("x"),
    );
    const inicio = performance.now();
    expect(await motivo(analizarPdf(denso))).toBe("pdf-ilegible");
    expect(await motivo(limpiarPdf(denso))).toBe("pdf-ilegible");
    // 2 s y no 500 ms: con cobertura y la suite entera en paralelo en la CI un recorrido de 115 ms locales
    // tardó 621 ms (S7). El tope sigue separando un recorrido lineal de uno que trabaja de más.
    expect(performance.now() - inicio).toBeLessThan(2_000);
  });

  it("una bomba de compresión en un `/ObjStm` se mide inflándola por trozos y se rechaza", async () => {
    const plano = Buffer.alloc(TOPE_PDF_INFLADO + 1024 * 1024, 0x20);
    plano.write("3 0 ", 0);
    const bomba = conFlujoDeObjetos(
      "/N 1 /First 4 /Filter /FlateDecode",
      new Uint8Array(deflateSync(plano)),
    );
    expect(bomba.length).toBeLessThan(200_000);
    const inicio = performance.now();
    expect(await motivo(analizarPdf(bomba))).toBe("pdf-ilegible");
    expect(await motivo(limpiarPdf(bomba))).toBe("pdf-ilegible");
    expect(performance.now() - inicio).toBeLessThan(3000);
  });

  it("un `/ObjStm` comprimido de verdad, por debajo de los topes, se lee y se limpia", async () => {
    const cabeza = "6 0 ";
    const datos = deflateSync(
      Buffer.from(`${cabeza}<< /Author (Autora Comprimida ${CEDULA}) >>`),
    );
    const w = new EscritorDePdf().cabecera();
    w.objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    w.objeto(2, "<< /Type /Pages /Kids [] /Count 0 >>");
    w.flujo(
      9,
      `/Type /ObjStm /N 1 /First ${cabeza.length} /Filter /FlateDecode`,
      new Uint8Array(datos),
    );
    w.cerrar("/Root 1 0 R /Info 6 0 R");
    const analisis = await analizarPdf(w.resultado());
    expect(analisis.campos.find((c) => c.clave === "Author")?.valor).toBe(
      `Autora Comprimida ${CEDULA}`,
    );
    const { bytes } = await limpiarPdf(w.resultado());
    expect(cuenta(bytes, CEDULA)).toBe(0);
  });

  it("un `/ObjStm` con datos que no inflan no rompe nada", async () => {
    const roto = conFlujoDeObjetos(
      "/N 1 /First 4 /Filter /FlateDecode",
      latin1("esto no es zlib"),
    );
    expect(["ok", "pdf-ilegible"]).toContain(await motivo(analizarPdf(roto)));
    const otro = conFlujoDeObjetos(
      "/N 1 /First 4 /Filter /ASCIIHexDecode",
      latin1("33203020 3c3c3e3e>"),
    );
    expect(["ok", "pdf-ilegible"]).toContain(await motivo(analizarPdf(otro)));
  });

  it("`Error.stackTraceLimit` vuelve a su valor, se lea o no el archivo", async () => {
    const antes = Error.stackTraceLimit;
    await analizarPdf(pdfDePrueba());
    expect(Error.stackTraceLimit).toBe(antes);
    await motivo(
      analizarPdf(
        latin1("%PDF-1.7\n1 0 obj\n42\nendobj\ntrailer\n<< /Root 1 0 R >>"),
      ),
    );
    expect(Error.stackTraceLimit).toBe(antes);
  });
});

describe("entradas hostiles: un resultado o `ErrorDeMetadatos`, y rápido", () => {
  const base = pdfDePrueba({ ...COMPLETO, revisiones: 2 });
  const TOPE_POR_CORRIDA_MS = 1500;

  interface Cuenta {
    peor: number;
    resultados: number;
    claves: number;
  }

  /** Corre las dos funciones; cualquier cosa que no sea un resultado o `ErrorDeMetadatos` falla. */
  async function sobrevive(bytes: Uint8Array, cuenta: Cuenta): Promise<void> {
    const inicio = performance.now();
    for (const funcion of [analizarPdf, limpiarPdf]) {
      try {
        await funcion(bytes);
        cuenta.resultados++;
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorDeMetadatos);
        cuenta.claves++;
      }
    }
    cuenta.peor = Math.max(cuenta.peor, performance.now() - inicio);
  }

  it("truncado en cada byte de los primeros y últimos 512, y a saltos en medio", async () => {
    const cortes = new Set<number>();
    for (let i = 0; i <= 512; i++) {
      cortes.add(i);
      cortes.add(base.length - i);
    }
    for (let i = 512; i < base.length - 512; i += 7) cortes.add(i);
    const total: Cuenta = { peor: 0, resultados: 0, claves: 0 };
    for (const corte of cortes) await sobrevive(base.subarray(0, corte), total);
    expect(cortes.size).toBeGreaterThan(1000);
    // Los dos desenlaces ocurren: el recorrido de verdad llegó a pdf-lib.
    expect(total.resultados).toBeGreaterThan(100);
    expect(total.claves).toBeGreaterThan(100);
    expect(total.peor).toBeLessThan(TOPE_POR_CORRIDA_MS);
  });

  it("bytes cambiados al azar (sembrado): nunca otra cosa que un resultado o una clave", async () => {
    const azar = lcg(20261102);
    const total: Cuenta = { peor: 0, resultados: 0, claves: 0 };
    for (let ronda = 0; ronda < 400; ronda++) {
      const mutado = base.slice();
      const cambios = 1 + Math.floor(azar() * 8);
      for (let c = 0; c < cambios; c++)
        mutado[Math.floor(azar() * mutado.length)] = Math.floor(azar() * 256);
      await sobrevive(mutado, total);
    }
    expect(total.resultados + total.claves).toBe(800);
    expect(total.resultados).toBeGreaterThan(0);
    expect(total.peor).toBeLessThan(TOPE_POR_CORRIDA_MS);
  });
});
