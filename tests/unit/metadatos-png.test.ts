// @vitest-environment node
//
// PNG: texto libre (tEXt/iTXt/zTXt), EXIF, la fecha de modificación, procedencia; lo que se
// conserva para VER la imagen; la cola tras el IEND (aCropalypse); y la promesa central — IHDR e
// IDAT salen byte por byte iguales, y en la copia limpia no queda ni un `CENTINELA`.

import { describe, expect, it } from "vitest";

import { exifMinimo } from "../../src/engine/metadatos/exif";
import { analizarPng, crc32, limpiarPng } from "../../src/engine/metadatos/png";
import {
  be32,
  chunk,
  chunksDe,
  contiene,
  crcPng,
  esperarError,
  FIRMA_PNG,
  IDATS,
  IEND,
  IHDR,
  iTXt,
  latin1,
  paqueteXmp,
  png,
  T,
  tEXt,
  texto,
  tiff,
  tiffCompleto,
  unir,
} from "./metadatos-ayuda";

const ICCP = chunk("iCCP", unir(latin1("perfil"), [0, 0], [0x78, 0x9c, 1, 2]));
const GAMA = chunk("gAMA", be32(45455));
const PHYS = chunk("pHYs", [...be32(2835), ...be32(2835), 1]);
const CRITICO_RARO = chunk("ZZZZ", [9, 9]);

function pngCompleto(orientacion?: number): Uint8Array {
  return png({
    antes: [
      ICCP,
      GAMA,
      chunk("eXIf", tiffCompleto({ orientacion })),
      tEXt("Author", "CENTINELA Ana Perez"),
      tEXt("Software", "CENTINELA Editor"),
      tEXt("Creation Time", "2026-03-14T15:09:26"),
      tEXt("Comment", "CENTINELA comentario"),
      tEXt("Source", "CENTINELA Camara"),
      tEXt("Disclaimer", "CENTINELA aviso"),
      iTXt("Title", "Título CENTINELA"),
      iTXt(
        "XML:com.adobe.xmp",
        paqueteXmp(
          "<xmpMM:InstanceID>xmp.iid:CENTINELA-INST</xmpMM:InstanceID>",
        ),
      ),
      iTXt("Description", unir([0x78, 0x9c], texto("CENTINELA-Z")), true),
      chunk(
        "zTXt",
        unir(latin1("Raw profile type exif"), [0, 0], texto("CENTINELA-Z2")),
      ),
      chunk("tIME", [0x07, 0xea, 3, 14, 15, 9, 26]),
      chunk("caBX", texto("CENTINELA-C2PA")),
      chunk("prVt", texto("CENTINELA-PRIVADO")),
      PHYS,
      CRITICO_RARO,
    ],
    despues: [tEXt("Copyright", "CENTINELA (c)")],
    cola: unir(texto("CENTINELA-COLA-ACROPALYPSE"), IEND),
  });
}

describe("lo que se nombra", () => {
  const a = analizarPng(pngCompleto(6));
  const por = (clave: string) => a.campos.filter((c) => c.clave === clave);

  it("texto con lo que revela cada palabra clave, EXIF, XMP y la fecha", () => {
    expect(a.formato).toBe("png");
    expect(por("Author")[0]).toEqual({
      clave: "Author",
      origen: "png-texto",
      revela: "autoria",
      valor: "CENTINELA Ana Perez",
    });
    expect(por("Software")[0].revela).toBe("software");
    expect(por("Creation Time")[0].revela).toBe("fecha");
    expect(por("Comment")[0].revela).toBe("descripcion");
    expect(por("Source")[0].revela).toBe("dispositivo");
    expect(por("Disclaimer")[0].revela).toBe("otro");
    expect(por("Title")[0]).toMatchObject({
      revela: "descripcion",
      valor: "Título CENTINELA",
    });
    expect(por("Copyright")[0].revela).toBe("autoria");
    expect(por("xmpMM:InstanceID")[0]).toMatchObject({
      origen: "xmp",
      valor: "xmp.iid:CENTINELA-INST",
    });
    expect(por("tIME")[0]).toMatchObject({
      origen: "png-texto",
      revela: "fecha",
      valor: "2026-03-14 15:09:26",
    });
    expect(por("Artist")[0].valor).toBe("CENTINELA Ana Perez");
    expect(por("GPSLatitude")[0].valor).toBe("4.609710");
    expect(por("GPSLongitude")[0].valor).toBe("-74.081750");
    expect(a.otrasEtiquetas).toBe(5);
  });

  it("lo que se quita, lo que se conserva y los avisos", () => {
    expect(a.quitables.map((e) => [e.clase, e.marcador, e.cuantos])).toEqual([
      ["exif", "eXIf", 1],
      ["miniatura", "IFD1", 1],
      ["fabricante", "MakerNote", 1],
      ["texto", "tEXt", 7],
      ["texto", "iTXt", 2],
      ["xmp", "iTXt", 1],
      ["texto", "zTXt", 1],
      ["fecha-de-cambio", "tIME", 1],
      ["procedencia", "caBX", 1],
      ["auxiliar", "prVt", 1],
      ["bytes-sobrantes", "IEND", 1],
    ]);
    expect(a.conservables).toEqual([
      {
        clase: "perfil-de-color",
        marcador: "iCCP",
        bytes: ICCP.length,
        cuantos: 1,
      },
      {
        clase: "auxiliar",
        marcador: "ZZZZ",
        bytes: CRITICO_RARO.length,
        cuantos: 1,
      },
      { clase: "orientacion", marcador: "eXIf", bytes: 38, cuantos: 1 },
    ]);
    expect(a.avisos).toEqual([
      { clave: "texto-comprimido", n: 2 },
      { clave: "orientacion-conservada" },
    ]);
  });
});

describe("la copia limpia", () => {
  for (const orientacion of [undefined, 1, 6]) {
    describe(`con orientación ${orientacion ?? "ausente"}`, () => {
      const original = pngCompleto(orientacion);
      const limpia = limpiarPng(original);
      const b = limpia.bytes;
      const chunks = chunksDe(b);

      it("no conserva ni un centinela, ni la cola tras el IEND", () => {
        expect(contiene(original, "CENTINELA")).toBe(true);
        expect(contiene(b, "CENTINELA")).toBe(false);
        expect(chunks.at(-1)?.tipo).toBe("IEND");
        expect(chunks.reduce((n, c) => n + c.bytes.length, 8)).toBe(b.length);
      });

      it("IHDR y los IDAT (concatenados) salen idénticos; todos los CRC cuadran", () => {
        expect([...b.subarray(0, 8)]).toEqual(FIRMA_PNG);
        expect(chunks[0].bytes).toEqual(IHDR);
        const idat = unir(
          ...chunks.filter((c) => c.tipo === "IDAT").map((c) => c.bytes),
        );
        expect(idat).toEqual(unir(...IDATS));
        expect(chunks.every((c) => c.crcValido)).toBe(true);
      });

      it("conserva en su orden lo que hace falta para verla", () => {
        const tipos = chunks.map((c) => c.tipo);
        const esperado = ["IHDR", "iCCP", "gAMA", "pHYs", "ZZZZ"];
        if (orientacion === 6) esperado.push("eXIf");
        expect(tipos).toEqual([...esperado, "IDAT", "IDAT", "IEND"]);
        if (orientacion === 6)
          expect(chunks.find((c) => c.tipo === "eXIf")?.datos).toEqual(
            exifMinimo(6),
          );
      });

      it("vuelta a analizar: ni un campo, nada que quitar, lo mismo conservado", () => {
        const despues = analizarPng(b);
        expect(despues.campos).toEqual([]);
        expect(despues.quitables).toEqual([]);
        expect(despues.conservables).toEqual(limpia.conservados);
      });

      it("limpiar dos veces es limpiar una; dos corridas dan los mismos bytes", () => {
        expect(limpiarPng(b).bytes).toEqual(b);
        expect(limpiarPng(original).bytes).toEqual(b);
        const a = analizarPng(original);
        expect(limpia.quitados).toEqual(a.quitables);
        expect(limpia.conservados).toEqual(a.conservables);
        expect(limpia.idNuevo).toBeNull();
      });
    });
  }

  it("con solo la orientación, la orientación es lo único conservado", () => {
    const original = png({
      despues: [
        chunk(
          "eXIf",
          unir(
            texto("Exif\0\0"),
            tiff({ ifd0: [[T.Orientation, { short: [6] }]] }),
          ),
        ),
      ],
    });
    const limpia = limpiarPng(original);
    const despues = analizarPng(limpia.bytes);
    expect(despues.conservables).toEqual([
      { clase: "orientacion", marcador: "eXIf", bytes: 38, cuantos: 1 },
    ]);
    expect(despues.campos).toEqual([]);
    expect(despues.quitables).toEqual([]);
    expect(chunksDe(limpia.bytes).map((c) => c.tipo)).toEqual([
      "IHDR",
      "eXIf",
      "IDAT",
      "IDAT",
      "IEND",
    ]);
  });

  it("un PNG sin metadatos sale idéntico", () => {
    const original = png({ antes: [GAMA, PHYS] });
    expect(limpiarPng(original).bytes).toEqual(original);
  });
});

describe("variantes de los chunks de texto", () => {
  it("un EXIF ilegible se quita y se avisa", () => {
    const a = analizarPng(png({ antes: [chunk("eXIf", texto("basura"))] }));
    expect(a.quitables.map((e) => e.clase)).toEqual(["exif"]);
    expect(a.avisos).toEqual([{ clave: "exif-ilegible" }]);
  });

  it("texto mal formado: se quita sin nombrarse", () => {
    const a = analizarPng(
      png({
        antes: [
          chunk("tEXt", latin1("sin separador")),
          chunk("tEXt", unir([0], latin1("palabra vacia"))),
          chunk("tEXt", unir(latin1("x".repeat(90)), [0], latin1("larga"))),
          chunk("iTXt", unir(latin1("Title"), [0])),
          chunk("iTXt", unir(latin1("Title"), [0, 0, 0], latin1("es"))),
          chunk("iTXt", latin1("sin separador")),
          chunk("tIME", [1, 2, 3]),
          tEXt("Author", "   "),
        ],
      }),
    );
    expect(a.campos).toEqual([]);
    expect(a.quitables).toEqual([
      expect.objectContaining({ clase: "texto", marcador: "tEXt", cuantos: 4 }),
      expect.objectContaining({ clase: "texto", marcador: "iTXt", cuantos: 3 }),
      expect.objectContaining({ clase: "fecha-de-cambio", marcador: "tIME" }),
    ]);
  });

  it("palabras clave de fecha que escriben otros programas, y Latin-1 en tEXt", () => {
    const a = analizarPng(
      png({
        antes: [tEXt("date:create", "2026-01-01"), tEXt("Artist", "Pérez")],
      }),
    );
    expect(a.campos.map((c) => [c.clave, c.revela, c.valor])).toEqual([
      ["date:create", "fecha", "2026-01-01"],
      ["Artist", "autoria", "Pérez"],
    ]);
  });

  it("un valor larguísimo se recorta y se avisa", () => {
    const a = analizarPng(png({ antes: [tEXt("Comment", "A".repeat(5000))] }));
    expect(a.campos[0].valor).toHaveLength(512);
    expect(a.avisos).toEqual([{ clave: "valores-recortados" }]);
  });
});

describe("el CRC-32 de PNG", () => {
  it("coincide con el oráculo y con el valor conocido de IEND", () => {
    expect(crc32(latin1("IEND"))).toBe(0xae426082);
    const datos = texto("123456789");
    expect(crc32(datos)).toBe(crcPng(datos));
    expect(crc32(datos)).toBe(0xcbf43926);
  });
});

describe("contenedores rotos: imagen-ilegible", () => {
  const sinFirma = png().slice();
  sinFirma[1] = 0x51;
  const largoEnorme = unir(FIRMA_PNG, IHDR, [0x80, 0, 0, 0], latin1("IDAT"));
  const casos: [string, Uint8Array][] = [
    ["vacío", new Uint8Array(0)],
    ["firma mala", sinFirma],
    ["IHDR que no es el primero", unir(FIRMA_PNG, GAMA, IHDR, ...IDATS, IEND)],
    ["un segundo IHDR", unir(FIRMA_PNG, IHDR, IHDR, ...IDATS, IEND)],
    ["sin IEND", unir(FIRMA_PNG, IHDR, ...IDATS)],
    ["sin IDAT", unir(FIRMA_PNG, IHDR, IEND)],
    [
      "un chunk que pasa del final",
      unir(FIRMA_PNG, IHDR, chunk("IDAT", [1, 2, 3]).subarray(0, 10)),
    ],
    ["un largo de más de 2^31 − 1", largoEnorme],
    [
      "un tipo que no son letras",
      unir(FIRMA_PNG, IHDR, chunk("ab1d", [1]), ...IDATS, IEND),
    ],
  ];
  for (const [nombre, bytes] of casos) {
    it(nombre, () => {
      esperarError(() => analizarPng(bytes));
      esperarError(() => limpiarPng(bytes));
    });
  }
});
