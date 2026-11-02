// @vitest-environment node
//
// JPEG: lo que se nombra, lo que se quita (todo lo que no está en la lista blanca), lo que se
// conserva y se declara, y la promesa central — los datos de la imagen salen byte por byte iguales,
// y en la copia limpia no queda ni un `CENTINELA`.

import { describe, expect, it } from "vitest";

import { exifMinimo } from "../../src/engine/metadatos/exif";
import { analizarJpeg, limpiarJpeg } from "../../src/engine/metadatos/jpeg";
import type { CampoCrudo } from "../../src/engine/metadatos/tipos";
import {
  app13,
  app1Exif,
  app1Xmp,
  app1XmpExtendido,
  app2Icc,
  com,
  contiene,
  CUERPO_JPEG,
  CUERPO_PROGRESIVO,
  EOI,
  esperarError,
  iim,
  jfif,
  jpeg,
  paqueteXmp,
  recurso8bim,
  segmento,
  SOI,
  T,
  texto,
  tiff,
  tiffCompleto,
  unir,
} from "./metadatos-ayuda";

const ICC_1 = app2Icc(1, 2, [1, 2, 3, 4]);
const ICC_2 = app2Icc(2, 2, [5, 6, 7]);
const ADOBE = segmento(0xee, unir(texto("Adobe"), [0, 100, 0, 0, 0, 0, 1]));

const XMP = paqueteXmp(
  "<xmpMM:DocumentID>xmp.did:CENTINELA-DOC</xmpMM:DocumentID>" +
    "<dc:creator><rdf:Seq><rdf:li>CENTINELA Autora XMP</rdf:li></rdf:Seq></dc:creator>",
);
const EXTENDIDO = texto(
  paqueteXmp("<photoshop:History>CENTINELA historia</photoshop:History>"),
);
const MITAD = Math.floor(EXTENDIDO.length / 2);

/** Una foto con TODO lo que una cámara, un editor y un teléfono pueden dejar dentro. */
function jpegCompleto(orientacion?: number): Uint8Array {
  return jpeg(
    [
      jfif(2, 1),
      app1Exif(tiffCompleto({ orientacion })),
      app1Xmp(XMP),
      // El XMP extendido llega en desorden: se arma por desplazamiento.
      app1XmpExtendido(EXTENDIDO.subarray(MITAD), EXTENDIDO.length, MITAD),
      app1XmpExtendido(EXTENDIDO.subarray(0, MITAD), EXTENDIDO.length, 0),
      ICC_1,
      ICC_2,
      segmento(0xe2, unir(texto("MPF\0"), texto("MM\0*CENTINELA-MPF"))),
      app13([
        recurso8bim(
          0x0404,
          iim([
            [2, 80, "CENTINELA By-line"],
            [2, 90, "CENTINELA Ciudad"],
          ]),
        ),
        recurso8bim(0x040c, texto("CENTINELA-MINIATURA-PS")),
      ]),
      segmento(0xeb, unir(texto("JP"), texto("\0\0CENTINELA-C2PA"))),
      ADOBE,
      segmento(0xe0, unir(texto("JFXX\0"), [0x10], texto("CENTINELA-JFXX"))),
      segmento(0xe5, texto("CENTINELA-APP5")),
      com("CENTINELA comentario COM"),
    ],
    { cola: texto("CENTINELA-COLA-DESPUES-DEL-EOI") },
  );
}

function valores(campos: readonly CampoCrudo[], clave: string): string[] {
  return campos.filter((c) => c.clave === clave).map((c) => c.valor);
}

describe("lo que se nombra", () => {
  const a = analizarJpeg(jpegCompleto(6));

  it("EXIF, GPS, XMP (también el extendido), IPTC y el comentario", () => {
    expect(a.formato).toBe("jpeg");
    expect(valores(a.campos, "Artist")).toEqual(["CENTINELA Ana Perez"]);
    expect(valores(a.campos, "BodySerialNumber")).toEqual([
      "CENTINELA-SERIE-0042",
    ]);
    expect(valores(a.campos, "GPSLatitude")).toEqual(["4.609710"]);
    expect(valores(a.campos, "GPSLongitude")).toEqual(["-74.081750"]);
    expect(valores(a.campos, "DateTimeOriginal")).toEqual([
      "2026:03:14 15:09:26",
    ]);
    expect(valores(a.campos, "xmpMM:DocumentID")).toEqual([
      "xmp.did:CENTINELA-DOC",
    ]);
    expect(valores(a.campos, "dc:creator")).toEqual(["CENTINELA Autora XMP"]);
    expect(valores(a.campos, "photoshop:History")).toEqual([
      "CENTINELA historia",
    ]);
    expect(valores(a.campos, "By-line")).toEqual(["CENTINELA By-line"]);
    expect(valores(a.campos, "City")).toEqual(["CENTINELA Ciudad"]);
    expect(a.campos.find((c) => c.clave === "COM")).toEqual({
      clave: "COM",
      origen: "comentario",
      revela: "descripcion",
      valor: "CENTINELA comentario COM",
    });
    expect(a.otrasEtiquetas).toBe(5);
    expect(a.revisiones).toBeNull();
  });

  it("lo que se quita, agrupado por clase y marcador, en orden de aparición", () => {
    expect(a.quitables.map((e) => [e.clase, e.marcador, e.cuantos])).toEqual([
      ["miniatura", "APP0", 2],
      ["exif", "APP1", 1],
      ["miniatura", "IFD1", 1],
      ["fabricante", "MakerNote", 1],
      ["xmp", "APP1", 1],
      ["xmp-extendido", "APP1", 2],
      ["imagenes-adicionales", "APP2", 1],
      ["iptc", "APP13", 1],
      ["miniatura", "8BIM", 1],
      ["procedencia", "APP11", 1],
      ["aplicacion", "APP5", 1],
      ["comentario", "COM", 1],
      ["bytes-sobrantes", "EOI", 1],
    ]);
    const porClase = new Map(
      a.quitables.map((e) => [`${e.clase} ${e.marcador}`, e]),
    );
    // La miniatura del JFIF (2×1 RGB = 6 bytes) y el JFXX entero (4 + 5 + 1 + 14 = 24).
    expect(porClase.get("miniatura APP0")?.bytes).toBe(6 + 24);
    expect(porClase.get("bytes-sobrantes EOI")?.bytes).toBe(
      "CENTINELA-COLA-DESPUES-DEL-EOI".length,
    );
    expect(porClase.get("comentario COM")?.bytes).toBe(
      4 + "CENTINELA comentario COM".length,
    );
  });

  it("lo que se conserva y se declara, y los avisos", () => {
    expect(a.conservables).toEqual([
      { clase: "jfif", marcador: "APP0", bytes: 18, cuantos: 1 },
      {
        clase: "perfil-de-color",
        marcador: "APP2",
        bytes: ICC_1.length + ICC_2.length,
        cuantos: 2,
      },
      { clase: "adobe", marcador: "APP14", bytes: ADOBE.length, cuantos: 1 },
      { clase: "orientacion", marcador: "APP1", bytes: 36, cuantos: 1 },
    ]);
    expect(a.avisos).toEqual([
      { clave: "imagenes-adicionales" },
      { clave: "orientacion-conservada" },
    ]);
  });
});

describe("la copia limpia", () => {
  for (const orientacion of [undefined, 1, 6]) {
    describe(`con orientación ${orientacion ?? "ausente"}`, () => {
      const original = jpegCompleto(orientacion);
      const limpia = limpiarJpeg(original);
      const b = limpia.bytes;

      it("no conserva ni un centinela", () => {
        expect(contiene(original, "CENTINELA")).toBe(true);
        expect(contiene(b, "CENTINELA")).toBe(false);
      });

      it("copia la imagen byte por byte y lo que conserva tal cual", () => {
        expect(contiene(b, CUERPO_JPEG)).toBe(true);
        expect(contiene(b, unir(ICC_1, ICC_2, ADOBE))).toBe(true);
        expect([...b.subarray(0, 2)]).toEqual(SOI);
        expect([...b.subarray(b.length - 2)]).toEqual(EOI);
      });

      it("el JFIF va primero, sin su miniatura", () => {
        expect([...b.subarray(2, 20)]).toEqual([...jfif(0, 0)]);
      });

      it("la orientación se conserva solo si no es 1, justo después del JFIF", () => {
        const minimo = app1Exif(exifMinimo(6));
        if (orientacion === 6) {
          expect([...b.subarray(20, 20 + minimo.length)]).toEqual([...minimo]);
          expect(limpia.conservados.at(-1)).toEqual({
            clase: "orientacion",
            marcador: "APP1",
            bytes: 36,
            cuantos: 1,
          });
        } else {
          expect(contiene(b, texto("Exif"))).toBe(false);
          expect(
            limpia.conservados.some((e) => e.clase === "orientacion"),
          ).toBe(false);
        }
        expect(b.length).toBe(
          2 +
            18 +
            (orientacion === 6 ? 36 : 0) +
            ICC_1.length +
            ICC_2.length +
            ADOBE.length +
            CUERPO_JPEG.length +
            2,
        );
      });

      it("vuelta a analizar: ni un campo, nada que quitar, lo mismo conservado", () => {
        const despues = analizarJpeg(b);
        expect(despues.campos).toEqual([]);
        expect(despues.quitables).toEqual([]);
        expect(despues.conservables).toEqual(limpia.conservados);
        expect(despues.otrasEtiquetas).toBe(0);
      });

      it("limpiar dos veces es limpiar una; dos corridas dan los mismos bytes", () => {
        expect(limpiarJpeg(b).bytes).toEqual(b);
        expect(limpiarJpeg(original).bytes).toEqual(b);
      });

      it("lo quitado y lo conservado son los del análisis", () => {
        const a = analizarJpeg(original);
        expect(limpia.quitados).toEqual(a.quitables);
        expect(limpia.conservados).toEqual(a.conservables);
        expect(limpia.idNuevo).toBeNull();
      });
    });
  }

  it("sin JFIF, la orientación va justo después del SOI y es lo único conservado", () => {
    const original = jpeg([
      app1Exif(
        tiff({
          ifd0: [
            [T.Orientation, { short: [8] }],
            [T.Artist, { ascii: "CENTINELA" }],
          ],
        }),
      ),
    ]);
    const limpia = limpiarJpeg(original);
    expect(limpia.bytes).toEqual(
      unir(SOI, app1Exif(exifMinimo(8)), CUERPO_JPEG, EOI),
    );
    const despues = analizarJpeg(limpia.bytes);
    expect(despues.campos).toEqual([]);
    expect(despues.quitables).toEqual([]);
    expect(despues.conservables).toEqual([
      { clase: "orientacion", marcador: "APP1", bytes: 36, cuantos: 1 },
    ]);
    expect(despues.avisos).toEqual([{ clave: "orientacion-conservada" }]);
  });

  it("una imagen progresiva conserva sus escaneos y la tabla entre ellos", () => {
    const original = jpeg([com("CENTINELA")], { cuerpo: CUERPO_PROGRESIVO });
    const b = limpiarJpeg(original).bytes;
    expect(b).toEqual(unir(SOI, CUERPO_PROGRESIVO, EOI));
  });

  it("un JFIF sin miniatura sale idéntico", () => {
    const original = jpeg([jfif()]);
    expect(limpiarJpeg(original).bytes).toEqual(original);
    expect(analizarJpeg(original).quitables).toEqual([]);
  });

  it("el relleno de FF antes de un marcador y los marcadores sin largo", () => {
    const original = unir(
      SOI,
      [0xff, 0xff, 0xff],
      com("CENTINELA"),
      [0xff, 0x01],
      [0xff, 0xd3],
      CUERPO_JPEG,
      [0xff, 0xff],
      EOI,
    );
    const limpia = limpiarJpeg(original);
    expect(limpia.bytes).toEqual(
      unir(SOI, [0xff, 0x01], [0xff, 0xd3], CUERPO_JPEG, EOI),
    );
  });

  it("un marcador reservado se conserva y se declara", () => {
    const raro = segmento(0xf7, [1, 2, 3]);
    const original = jpeg([raro]);
    const limpia = limpiarJpeg(original);
    expect(limpia.bytes).toEqual(original);
    expect(limpia.conservados).toEqual([
      { clase: "auxiliar", marcador: "FFF7", bytes: 7, cuantos: 1 },
    ]);
  });
});

describe("variantes de los segmentos de aplicación", () => {
  it("un EXIF ilegible se quita igual y se avisa", () => {
    const a = analizarJpeg(jpeg([segmento(0xe1, texto("Exif\0\0basura"))]));
    expect(a.quitables.map((e) => e.clase)).toEqual(["exif"]);
    expect(a.avisos).toEqual([{ clave: "exif-ilegible" }]);
    const incompleto = analizarJpeg(
      jpeg([
        app1Exif(Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 9])),
      ]),
    );
    expect(incompleto.avisos).toEqual([{ clave: "exif-ilegible" }]);
    // Dos bloques ilegibles: un solo aviso, dos elementos quitados.
    const dos = analizarJpeg(
      jpeg([
        segmento(0xe1, texto("Exif\0\0uno")),
        segmento(0xe1, texto("Exif\0\0dos")),
      ]),
    );
    expect(dos.avisos).toEqual([{ clave: "exif-ilegible" }]);
    expect(dos.quitables[0].cuantos).toBe(2);
  });

  it("`Exif\\0\\xFF` también es EXIF; dos EXIF nombran lo suyo y manda la primera orientación", () => {
    const primero = segmento(
      0xe1,
      unir(
        texto("Exif\0"),
        [0xff],
        tiff({
          ifd0: [
            [T.Orientation, { short: [3] }],
            [T.Artist, { ascii: "Uno" }],
          ],
        }),
      ),
    );
    const segundo = app1Exif(
      tiff({
        ifd0: [
          [T.Orientation, { short: [6] }],
          [T.Artist, { ascii: "Dos" }],
        ],
      }),
    );
    const limpia = limpiarJpeg(jpeg([primero, segundo]));
    expect(
      analizarJpeg(jpeg([primero, segundo])).campos.map((c) => c.valor),
    ).toEqual(["Uno", "Dos"]);
    expect(limpia.bytes).toEqual(
      unir(SOI, app1Exif(exifMinimo(3)), CUERPO_JPEG, EOI),
    );
  });

  it("el EXIF mínimo de Velo en la entrada manda sobre uno completo que venga después", () => {
    const original = jpeg([
      app1Exif(exifMinimo(5)),
      app1Exif(tiff({ ifd0: [[T.Orientation, { short: [7] }]] })),
    ]);
    expect(limpiarJpeg(original).bytes).toEqual(
      unir(SOI, app1Exif(exifMinimo(5)), CUERPO_JPEG, EOI),
    );
  });

  it("APPn que no se reconocen se quitan como `aplicacion` con su marcador", () => {
    const a = analizarJpeg(
      jpeg([
        segmento(0xe0, texto("JFIF\0\x01")), // JFIF demasiado corto
        segmento(0xe1, texto("otra cosa")),
        segmento(0xe2, texto("FPXR\0")),
        segmento(0xeb, texto("XX")),
        segmento(0xee, texto("NoAdobe")),
        segmento(0xed, texto("no es photoshop")),
      ]),
    );
    expect(a.quitables.map((e) => [e.clase, e.marcador])).toEqual([
      ["aplicacion", "APP0"],
      ["aplicacion", "APP1"],
      ["aplicacion", "APP2"],
      ["aplicacion", "APP11"],
      ["aplicacion", "APP14"],
      ["iptc", "APP13"],
    ]);
    expect(a.campos).toEqual([]);
  });

  it("un trozo de XMP extendido sin datos no rompe nada", () => {
    const a = analizarJpeg(
      jpeg([
        segmento(0xe1, texto("http://ns.adobe.com/xmp/extension/\0corto")),
      ]),
    );
    expect(a.quitables.map((e) => e.clase)).toEqual(["xmp-extendido"]);
    expect(a.campos).toEqual([]);
  });

  it("un JFIF que declara miniatura sin traerla se reescribe a 0×0", () => {
    const declarado = segmento(0xe0, [
      ...texto("JFIF\0"),
      1,
      2,
      1,
      0,
      72,
      0,
      72,
      4,
      4,
    ]);
    const limpia = limpiarJpeg(jpeg([declarado]));
    expect(limpia.bytes).toEqual(jpeg([jfif()]));
    expect(limpia.quitados).toEqual([]);
  });
});

describe("contenedores rotos: imagen-ilegible", () => {
  const casos: [string, Uint8Array][] = [
    ["vacío", new Uint8Array(0)],
    ["sin SOI", unir([0xff, 0xd9])],
    ["sin EOI", unir(SOI, CUERPO_JPEG)],
    ["solo SOI", unir(SOI)],
    ["un largo que pasa del final", unir(SOI, [0xff, 0xe1, 0x40, 0x00, 1, 2])],
    [
      "un largo menor que 2",
      unir(SOI, [0xff, 0xe1, 0x00, 0x01], CUERPO_JPEG, EOI),
    ],
    ["basura entre segmentos", unir(SOI, [0x00], CUERPO_JPEG, EOI)],
    ["FF 00 fuera de un escaneo", unir(SOI, [0xff, 0x00], CUERPO_JPEG, EOI)],
    ["un segundo SOI", unir(SOI, SOI, CUERPO_JPEG, EOI)],
    ["EOI sin escaneo", unir(SOI, com("x"), EOI)],
    [
      "escaneo antes del cuadro",
      unir(SOI, segmento(0xda, [1, 1, 0, 0, 63, 0]), [1, 2], EOI),
    ],
    ["datos comprimidos sin final", unir(SOI, CUERPO_JPEG, [0xff])],
    ["relleno sin marcador", unir(SOI, CUERPO_JPEG, [0xff, 0xff, 0xff])],
  ];
  for (const [nombre, bytes] of casos) {
    it(nombre, () => {
      esperarError(() => analizarJpeg(bytes));
      esperarError(() => limpiarJpeg(bytes));
    });
  }
});
