// @vitest-environment node
//
// WebP: EXIF (con o sin el prefijo `Exif\0\0`), XMP, chunks desconocidos; las banderas del VP8X y el
// tamaño del RIFF reescritos; la orientación solo en el formato extendido; y la promesa central —
// VP8/VP8L/ALPH salen byte por byte iguales, y en la copia limpia no queda ni un `CENTINELA`.

import { describe, expect, it } from "vitest";

import { exifMinimo } from "../../src/engine/metadatos/exif";
import { analizarWebp, limpiarWebp } from "../../src/engine/metadatos/webp";
import {
  ALPH,
  chunksRiff,
  contiene,
  esperarError,
  latin1,
  le32,
  paqueteXmp,
  riff,
  T,
  texto,
  tiff,
  tiffCompleto,
  unir,
  VP8,
  VP8L,
  vp8x,
  webp,
} from "./metadatos-ayuda";

const ICCP = riff("ICCP", [1, 2, 3, 4, 5]);
const XMP = riff(
  "XMP ",
  texto(
    paqueteXmp(
      "<dc:creator><rdf:Seq><rdf:li>CENTINELA Autora</rdf:li></rdf:Seq></dc:creator>",
    ),
  ),
);

/** Extendido: perfil, alfa, imagen, EXIF (con prefijo), XMP y un chunk privado; cola tras el RIFF. */
function webpCompleto(orientacion?: number): Uint8Array {
  return webp(
    [
      vp8x(0x20 | 0x10 | 0x08 | 0x04),
      ICCP,
      ALPH,
      VP8,
      riff("EXIF", unir(texto("Exif\0\0"), tiffCompleto({ orientacion }))),
      XMP,
      riff("PRIV", texto("CENTINELA-PRIVADO")),
    ],
    { cola: texto("CENTINELA-COLA") },
  );
}

function banderasDe(bytes: Uint8Array): number {
  const v = chunksRiff(bytes).find((c) => c.codigo === "VP8X");
  return v ? v.bytes[8] : -1;
}

describe("lo que se nombra", () => {
  const a = analizarWebp(webpCompleto(6));

  it("EXIF (aunque traiga `Exif\\0\\0` delante), GPS y XMP", () => {
    expect(a.formato).toBe("webp");
    const valor = (k: string) => a.campos.find((c) => c.clave === k)?.valor;
    expect(valor("Artist")).toBe("CENTINELA Ana Perez");
    expect(valor("GPSLatitude")).toBe("4.609710");
    expect(valor("GPSLongitude")).toBe("-74.081750");
    expect(valor("dc:creator")).toBe("CENTINELA Autora");
    expect(a.otrasEtiquetas).toBe(5);
  });

  it("lo que se quita, lo que se conserva y los avisos", () => {
    expect(a.quitables.map((e) => [e.clase, e.marcador])).toEqual([
      ["exif", "EXIF"],
      ["miniatura", "IFD1"],
      ["fabricante", "MakerNote"],
      ["xmp", "XMP"],
      ["auxiliar", "PRIV"],
      ["bytes-sobrantes", "RIFF"],
    ]);
    expect(a.quitables.at(-1)?.bytes).toBe("CENTINELA-COLA".length);
    expect(a.conservables).toEqual([
      {
        clase: "perfil-de-color",
        marcador: "ICCP",
        bytes: ICCP.length,
        cuantos: 1,
      },
      { clase: "orientacion", marcador: "EXIF", bytes: 34, cuantos: 1 },
    ]);
    expect(a.avisos).toEqual([{ clave: "orientacion-conservada" }]);
  });
});

describe("la copia limpia", () => {
  for (const orientacion of [undefined, 1, 6]) {
    describe(`con orientación ${orientacion ?? "ausente"}`, () => {
      const original = webpCompleto(orientacion);
      const limpia = limpiarWebp(original);
      const b = limpia.bytes;
      const chunks = chunksRiff(b);

      it("no conserva ni un centinela, y el tamaño del RIFF es el de la copia", () => {
        expect(contiene(original, "CENTINELA")).toBe(true);
        expect(contiene(b, "CENTINELA")).toBe(false);
        expect([...b.subarray(4, 8)]).toEqual(le32(b.length - 8));
      });

      it("VP8, ALPH y el perfil salen idénticos y en su orden", () => {
        expect(chunks.map((c) => c.codigo)).toEqual(
          ["VP8X", "ICCP", "ALPH", "VP8 "].concat(
            orientacion === 6 ? ["EXIF"] : [],
          ),
        );
        expect(contiene(b, unir(ICCP, ALPH, VP8))).toBe(true);
      });

      it("las banderas: XMP apagada siempre; EXIF solo con la orientación", () => {
        const banderas = banderasDe(b);
        expect(banderas & 0x04).toBe(0);
        expect(banderas & 0x08).toBe(orientacion === 6 ? 0x08 : 0);
        expect(banderas & 0x30).toBe(0x30);
        if (orientacion === 6)
          expect(chunks.at(-1)?.bytes).toEqual(riff("EXIF", exifMinimo(6)));
      });

      it("vuelta a analizar: ni un campo, nada que quitar, lo mismo conservado", () => {
        const despues = analizarWebp(b);
        expect(despues.campos).toEqual([]);
        expect(despues.quitables).toEqual([]);
        expect(despues.conservables).toEqual(limpia.conservados);
      });

      it("limpiar dos veces es limpiar una; dos corridas dan los mismos bytes", () => {
        expect(limpiarWebp(b).bytes).toEqual(b);
        expect(limpiarWebp(original).bytes).toEqual(b);
        const a = analizarWebp(original);
        expect(limpia.quitados).toEqual(a.quitables);
        expect(limpia.conservados).toEqual(a.conservables);
        expect(limpia.idNuevo).toBeNull();
      });
    });
  }

  it("con solo la orientación, la orientación es lo único conservado", () => {
    const original = webp([
      vp8x(0x08),
      VP8L,
      riff("EXIF", tiff({ le: true, ifd0: [[T.Orientation, { short: [3] }]] })),
    ]);
    const limpia = limpiarWebp(original);
    expect(limpia.bytes).toEqual(
      webp([vp8x(0x08), VP8L, riff("EXIF", exifMinimo(3))]),
    );
    const despues = analizarWebp(limpia.bytes);
    expect(despues.conservables).toEqual([
      { clase: "orientacion", marcador: "EXIF", bytes: 34, cuantos: 1 },
    ]);
  });

  it("formato simple: un EXIF ahí no es válido, se quita sin conservar orientación", () => {
    const original = webp([
      VP8L,
      riff("EXIF", tiff({ ifd0: [[T.Orientation, { short: [6] }]] })),
    ]);
    const limpia = limpiarWebp(original);
    expect(limpia.bytes).toEqual(webp([VP8L]));
    expect(limpia.conservados).toEqual([]);
    expect(analizarWebp(original).avisos).toEqual([]);
  });

  it("animado: ANIM y ANMF se conservan tal cual", () => {
    const anim = riff("ANIM", [0, 0, 0, 0, 0, 0]);
    const anmf = riff("ANMF", unir(new Uint8Array(16), VP8));
    const original = webp([vp8x(0x02 | 0x04), anim, anmf, XMP]);
    expect(limpiarWebp(original).bytes).toEqual(webp([vp8x(0x02), anim, anmf]));
  });

  it("al último chunk le puede faltar el relleno: la copia lo escribe", () => {
    const sinRelleno = riff("VP8 ", [1, 2, 3], false);
    const original = webp([sinRelleno]);
    expect(limpiarWebp(original).bytes).toEqual(
      webp([riff("VP8 ", [1, 2, 3])]),
    );
  });

  it("un relleno que no es cero sale como cero", () => {
    const sucio = unir(riff("VP8 ", [1, 2, 3], false), [0x7f]);
    expect(limpiarWebp(webp([sucio])).bytes).toEqual(
      webp([riff("VP8 ", [1, 2, 3])]),
    );
  });

  it("un EXIF ilegible se quita y se avisa; un chunk con nombre ilegible se nombra con `?`", () => {
    const a = analizarWebp(
      webp([
        vp8x(0),
        VP8L,
        riff("EXIF", texto("basura")),
        unir([0x01, 0x41, 0x42, 0x43], le32(0)),
      ]),
    );
    expect(a.quitables.map((e) => [e.clase, e.marcador])).toEqual([
      ["exif", "EXIF"],
      ["auxiliar", "?ABC"],
    ]);
    expect(a.avisos).toEqual([{ clave: "exif-ilegible" }]);
  });
});

describe("contenedores rotos: imagen-ilegible", () => {
  const casos: [string, Uint8Array][] = [
    ["vacío", new Uint8Array(0)],
    ["sin RIFF", unir(latin1("RIFX"), le32(4), latin1("WEBP"))],
    ["sin WEBP", unir(latin1("RIFF"), le32(4), latin1("WAVE"))],
    [
      "tamaño de RIFF más allá del archivo",
      unir(latin1("RIFF"), le32(1000), latin1("WEBP"), VP8L),
    ],
    [
      "tamaño de RIFF menor que 4",
      unir(latin1("RIFF"), le32(2), latin1("WEBP"), VP8L),
    ],
    ["RIFF sin chunks", webp([])],
    [
      "un chunk que pasa del RIFF",
      webp([riff("VP8L", [1, 2, 3, 4]).subarray(0, 10)]),
    ],
    ["una cabecera de chunk cortada", webp([VP8L, latin1("EXI")])],
    ["primer chunk que no es imagen ni VP8X", webp([ICCP, VP8L])],
    ["sin imagen", webp([vp8x(0), ICCP])],
    ["VP8X corto", webp([riff("VP8X", [0, 0, 0, 0]), VP8L])],
  ];
  for (const [nombre, bytes] of casos) {
    it(nombre, () => {
      esperarError(() => analizarWebp(bytes));
      esperarError(() => limpiarWebp(bytes));
    });
  }
});
