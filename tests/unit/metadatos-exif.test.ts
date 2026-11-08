// @vitest-environment node
//
// El lector de EXIF: nombra lo que la cámara escribió (lista cerrada), combina el GPS en grados
// decimales con 6 cifras, cuenta lo demás, y aguanta un bloque roto sin lanzar (marca `incompleto`)
// salvo cuando ni siquiera es TIFF.

import { describe, expect, it } from "vitest";

import {
  anotarExif,
  exifMinimo,
  LARGO_DEL_EXIF_MINIMO,
  leerExif,
  MAXIMO_DE_ENTRADAS,
  orientacionDelExifMinimo,
  orientacionQueSeConserva,
  sinPrefijoExif,
} from "../../src/engine/metadatos/exif";
import { Inventario } from "../../src/engine/metadatos/inventario";
import type { CampoCrudo } from "../../src/engine/metadatos/tipos";
import {
  be16,
  be32,
  esperarError,
  iim,
  paqueteXmp,
  T,
  texto,
  tiff,
  tiffCompleto,
  ucs2le,
  unir,
} from "./metadatos-ayuda";

function valor(campos: readonly CampoCrudo[], clave: string) {
  return campos.filter((c) => c.clave === clave).map((c) => c.valor);
}

describe("la lista cerrada", () => {
  for (const le of [false, true]) {
    it(`nombra autor, cámara, fechas, ids y GPS (${le ? "II" : "MM"})`, () => {
      const l = leerExif(tiffCompleto({ le, orientacion: 6 }));
      const c = l.campos;
      expect(valor(c, "Artist")).toEqual(["CENTINELA Ana Perez"]);
      expect(valor(c, "Copyright")).toEqual([
        "CENTINELA Foto; CENTINELA Edicion",
      ]);
      expect(valor(c, "XPAuthor")).toEqual(["CENTINELA Autor XP"]);
      expect(valor(c, "Make")).toEqual(["CENTINELA-Marca"]);
      expect(valor(c, "Model")).toEqual(["CENTINELA-Modelo X"]);
      expect(valor(c, "Software")).toEqual(["CENTINELA-Editor 1.0"]);
      expect(valor(c, "DateTime")).toEqual(["2026:03:14 15:09:26"]);
      expect(valor(c, "DateTimeOriginal")).toEqual(["2026:03:14 15:09:26"]);
      expect(valor(c, "OffsetTimeOriginal")).toEqual(["-05:00"]);
      expect(valor(c, "UserComment")).toEqual(["CENTINELA comentario"]);
      expect(valor(c, "ImageUniqueID")).toEqual([
        "CENTINELA0123456789abcdef0123456",
      ]);
      expect(valor(c, "CameraOwnerName")).toEqual(["CENTINELA Duena"]);
      expect(valor(c, "BodySerialNumber")).toEqual(["CENTINELA-SERIE-0042"]);
      expect(valor(c, "LensModel")).toEqual(["CENTINELA Lente 24mm"]);
      expect(valor(c, "ImageDescription")).toEqual(["CENTINELA descripcion"]);
      // GPS: grados decimales con signo y exactamente 6 cifras.
      expect(valor(c, "GPSLatitude")).toEqual(["4.609710"]);
      expect(valor(c, "GPSLongitude")).toEqual(["-74.081750"]);
      expect(valor(c, "GPSAltitude")).toEqual(["2640.50"]);
      expect(valor(c, "GPSDateStamp")).toEqual(["2026:03:14 20:09:26"]);

      const porClave = new Map(c.map((x) => [x.clave, x]));
      expect(porClave.get("Artist")?.revela).toBe("autoria");
      expect(porClave.get("BodySerialNumber")?.revela).toBe("dispositivo");
      expect(porClave.get("Software")?.revela).toBe("software");
      expect(porClave.get("ImageUniqueID")?.revela).toBe("identificador");
      expect(porClave.get("UserComment")?.revela).toBe("descripcion");
      expect(porClave.get("GPSLatitude")).toMatchObject({
        origen: "gps",
        revela: "ubicacion",
      });
      expect(porClave.get("GPSDateStamp")).toMatchObject({
        origen: "gps",
        revela: "fecha",
      });
      expect(porClave.get("Artist")?.origen).toBe("exif");

      // Lo técnico se cuenta (exposición, f, ISO, versión del GPS y la compresión de la miniatura
      // en el IFD1); la orientación no es un campo, y los punteros a otros IFD son estructura.
      expect(l.otrasEtiquetas).toBe(5);
      expect(c.some((x) => x.clave === "Orientation")).toBe(false);
      expect(l.orientacion).toBe(6);
      expect(l.miniatura).toBe(23);
      expect(l.fabricante).toBe(50);
      expect(l.incompleto).toBe(false);
      expect(l.recortados).toBe(false);
    });
  }

  it("las etiquetas XP de Windows van en UCS-2LE", () => {
    const l = leerExif(
      tiff({
        ifd0: [
          [T.XPTitle, { bytes: ucs2le("Título"), tipo: 1 }],
          [T.XPComment, { bytes: ucs2le("Comentario"), tipo: 1 }],
          [T.XPKeywords, { bytes: ucs2le("uno;dos"), tipo: 1 }],
          [T.XPSubject, { bytes: ucs2le("Asunto"), tipo: 1 }],
          // Un programa que la escribió como ASCII también se lee.
          [T.XPAuthor, { ascii: "Autor ascii" }],
        ],
      }),
    );
    expect(l.campos.map((c) => [c.clave, c.valor])).toEqual([
      ["XPTitle", "Título"],
      ["XPComment", "Comentario"],
      ["XPKeywords", "uno;dos"],
      ["XPSubject", "Asunto"],
      ["XPAuthor", "Autor ascii"],
    ]);
  });

  it("UserComment: UNICODE en el orden del bloque o con BOM, indefinido, vacío", () => {
    const comentario = (bytes: Uint8Array, le = false) =>
      valor(
        leerExif(tiff({ le, exif: [[T.UserComment, { bytes }]] })).campos,
        "UserComment",
      );
    const utf16be = (s: string) =>
      Uint8Array.from([...s].flatMap((ch) => be16(ch.charCodeAt(0))));
    expect(comentario(unir(texto("UNICODE\0"), utf16be("Hola")))).toEqual([
      "Hola",
    ]);
    expect(
      comentario(unir(texto("UNICODE\0"), ucs2le("Hola").subarray(0, 8)), true),
    ).toEqual(["Hola"]);
    expect(
      comentario(unir(texto("UNICODE\0"), [0xff, 0xfe], ucs2le("Bom"))),
    ).toEqual(["Bom"]);
    expect(
      comentario(unir(texto("UNICODE\0"), [0xfe, 0xff], utf16be("Bom"))),
    ).toEqual(["Bom"]);
    expect(
      comentario(unir(new Uint8Array(8), texto("sin juego declarado"))),
    ).toEqual(["sin juego declarado"]);
    expect(comentario(unir(texto("JIS\0\0\0\0\0"), texto("jis")))).toEqual([
      "jis",
    ]);
    // Las cámaras escriben 8 ceros y espacios: no hay comentario que nombrar.
    expect(comentario(unir(new Uint8Array(8), texto("      ")))).toEqual([]);
    expect(comentario(texto("corto"))).toEqual(["corto"]);
  });

  it("un número donde se espera texto se escribe como números", () => {
    const l = leerExif(
      tiff({
        ifd0: [
          [T.Artist, { short: [7, 8] }],
          [T.Make, { long: [70000] }],
          [
            T.Model,
            {
              racional: [
                [1, 2],
                [3, 0],
              ],
            },
          ],
          [T.Software, { sracional: [[-1, 4]] }],
          [
            T.HostComputer,
            { crudo: { tipo: 8, cuenta: 1, datos: be16(0xfffe) } },
          ],
          [
            T.ImageDescription,
            { crudo: { tipo: 9, cuenta: 1, datos: be32(0xffffffff) } },
          ],
          [T.DateTime, { crudo: { tipo: 6, cuenta: 2, datos: [0xff, 0x02] } }],
          // FLOAT: no se interpreta, no hay campo.
          [T.Copyright, { crudo: { tipo: 11, cuenta: 1, datos: be32(0) } }],
        ],
      }),
    );
    expect(l.campos.map((c) => [c.clave, c.valor])).toEqual([
      ["Artist", "7 8"],
      ["Make", "70000"],
      ["Model", "0.5"],
      ["Software", "-0.25"],
      ["HostComputer", "-2"],
      ["ImageDescription", "-1"],
      ["DateTime", "-1 2"],
    ]);
  });

  it("un valor más largo que el tope se recorta y se avisa", () => {
    const l = leerExif(
      tiff({ ifd0: [[T.Artist, { ascii: "A".repeat(5000) }]] }),
    );
    expect(l.recortados).toBe(true);
    expect(l.campos[0].valor).toHaveLength(512);
    // Muchos números también.
    const n = leerExif(
      tiff({ ifd0: [[T.Artist, { short: new Array(100).fill(1) }]] }),
    );
    expect(n.recortados).toBe(true);
  });

  it("un ASCII de un millón de ceros termina enseguida y no inventa un recorte", () => {
    const l = leerExif(
      tiff({
        ifd0: [
          [
            T.Artist,
            { asciiCrudo: unir(texto("Ana"), new Uint8Array(1_000_000)) },
          ],
        ],
      }),
    );
    expect(valor(l.campos, "Artist")).toEqual(["Ana"]);
    expect(l.recortados).toBe(false);
    const cola = leerExif(
      tiff({
        ifd0: [
          [
            T.Artist,
            {
              asciiCrudo: unir(texto("Ana"), new Uint8Array(5000), texto("X")),
            },
          ],
        ],
      }),
    );
    expect(cola.recortados).toBe(true);
  });

  it("XMP e IPTC escondidos dentro del TIFF también se nombran", () => {
    const l = leerExif(
      tiff({
        ifd0: [
          [
            T.XMP,
            {
              bytes: texto(
                paqueteXmp(
                  "<dc:creator><rdf:Seq><rdf:li>Autora XMP</rdf:li></rdf:Seq></dc:creator>",
                ),
              ),
              tipo: 1,
            },
          ],
          [
            T.IPTC,
            {
              bytes: iim([
                [2, 80, "Firma IPTC"],
                [2, 0, [0, 4]],
              ]),
            },
          ],
        ],
      }),
    );
    expect(l.campos.map((c) => [c.clave, c.origen, c.valor])).toEqual([
      ["dc:creator", "xmp", "Autora XMP"],
      ["By-line", "iptc", "Firma IPTC"],
    ]);
    expect(l.otrasEtiquetas).toBe(1);
  });
});

describe("GPS", () => {
  const gps = (entradas: Parameters<typeof tiff>[0]["gps"]) =>
    leerExif(tiff({ gps: entradas })).campos.map((c) => [c.clave, c.valor]);

  it("sur y oeste son negativos; sin referencia, positivo", () => {
    expect(
      gps([
        [T.GPSLatitudeRef, { ascii: "S" }],
        [
          T.GPSLatitude,
          {
            racional: [
              [33, 1],
              [27, 1],
              [0, 1],
            ],
          },
        ],
        [
          T.GPSLongitude,
          {
            racional: [
              [70, 1],
              [39, 1],
              [0, 1],
            ],
          },
        ],
      ]),
    ).toEqual([
      ["GPSLatitude", "-33.450000"],
      ["GPSLongitude", "70.650000"],
    ]);
  });

  it("grados decimales en un solo racional; cero sin signo", () => {
    expect(
      gps([
        [T.GPSLatitude, { racional: [[4609710, 1000000]] }],
        [T.GPSLongitudeRef, { ascii: "W" }],
        [T.GPSLongitude, { racional: [[0, 1]] }],
      ]),
    ).toEqual([
      ["GPSLatitude", "4.609710"],
      ["GPSLongitude", "0.000000"],
    ]);
  });

  it("un denominador 0 no es una coordenada", () => {
    expect(
      gps([
        [
          T.GPSLatitude,
          {
            racional: [
              [4, 1],
              [36, 0],
              [0, 1],
            ],
          },
        ],
      ]),
    ).toEqual([]);
  });

  it("altitud bajo el mar, hora sin fecha, dirección, destino y área", () => {
    expect(
      gps([
        [T.GPSAltitudeRef, { bytes: [1], tipo: 1 }],
        [T.GPSAltitude, { racional: [[45, 2]] }],
        [
          T.GPSTimeStamp,
          {
            racional: [
              [7, 1],
              [5, 1],
              [3125, 100],
            ],
          },
        ],
        [T.GPSImgDirectionRef, { ascii: "T" }],
        [T.GPSImgDirection, { racional: [[27050, 100]] }],
        [T.GPSDestLatitudeRef, { ascii: "N" }],
        [
          T.GPSDestLatitude,
          {
            racional: [
              [1, 1],
              [30, 1],
              [0, 1],
            ],
          },
        ],
        [T.GPSDestLongitudeRef, { ascii: "E" }],
        [
          T.GPSDestLongitude,
          {
            racional: [
              [2, 1],
              [15, 1],
              [0, 1],
            ],
          },
        ],
        [
          T.GPSAreaInformation,
          { bytes: unir(texto("ASCII\0\0\0"), texto("Barrio CENTINELA")) },
        ],
      ]),
    ).toEqual([
      ["GPSAltitude", "-22.50"],
      ["GPSTimeStamp", "07:05:31.25"],
      ["GPSImgDirection", "270.50"],
      ["GPSDestLatitude", "1.500000"],
      ["GPSDestLongitude", "2.250000"],
      ["GPSAreaInformation", "Barrio CENTINELA"],
    ]);
  });

  it("fecha sin hora, y área escrita como ASCII", () => {
    expect(
      gps([
        [T.GPSDateStamp, { ascii: "2026:01:02" }],
        [
          T.GPSTimeStamp,
          {
            racional: [
              [7, 1],
              [0, 0],
              [0, 1],
            ],
          },
        ],
        [T.GPSAreaInformation, { ascii: "Centro" }],
        [T.GPSAltitude, { racional: [[1, 0]] }],
        [T.GPSImgDirection, { racional: [[1, 0]] }],
      ]),
    ).toEqual([
      ["GPSDateStamp", "2026:01:02"],
      ["GPSAreaInformation", "Centro"],
    ]);
  });

  it("un valor del GPS que apunta fuera no se nombra y marca incompleto", () => {
    const l = leerExif(
      tiff({
        gps: [
          [
            T.GPSLatitudeRef,
            { crudo: { tipo: 2, cuenta: 8, desplazamiento: 60000 } },
          ],
          [
            T.GPSLatitude,
            { crudo: { tipo: 5, cuenta: 3, desplazamiento: 60000 } },
          ],
          [
            T.GPSDateStamp,
            { crudo: { tipo: 2, cuenta: 11, desplazamiento: 60000 } },
          ],
          [
            T.GPSAreaInformation,
            { crudo: { tipo: 7, cuenta: 20, desplazamiento: 60000 } },
          ],
        ],
      }),
    );
    expect(l.campos).toEqual([]);
    expect(l.incompleto).toBe(true);
  });
});

describe("orientación, miniatura y nota del fabricante", () => {
  it("una orientación inválida no cuenta; la primera válida gana", () => {
    expect(
      leerExif(tiff({ ifd0: [[T.Orientation, { short: [9] }]] })).orientacion,
    ).toBeNull();
    expect(
      leerExif(
        tiff({
          ifd0: [[T.Orientation, { short: [3] }]],
          exif: [[T.Orientation, { short: [6] }]],
        }),
      ).orientacion,
    ).toBe(3);
    expect(leerExif(tiff({ ifd0: [] })).orientacion).toBeNull();
  });

  it("una miniatura en tiras (IFD1 sin comprimir) se mide por sus StripByteCounts", () => {
    // En el IFD1 las tiras suman a la miniatura; en el IFD0 la misma etiqueta es técnica y se cuenta.
    const base = tiff({
      ifd0: [[0x0117, { long: [9] }]],
      miniatura: [1, 2, 3],
      ifd1: [[0x0117, { short: [100, 20] }]],
    });
    const l = leerExif(base);
    expect(l.miniatura).toBe(3 + 120);
    expect(l.otrasEtiquetas).toBe(2); // 0x0117 en el IFD0 y Compression en el IFD1
  });

  it("una orientación escrita como BYTE también se lee", () => {
    expect(
      leerExif(tiff({ ifd0: [[T.Orientation, { bytes: [6], tipo: 1 }]] }))
        .orientacion,
    ).toBe(6);
  });

  it("una miniatura que apunta fuera marca incompleto y no se mide", () => {
    const t = tiff({ miniatura: [1, 2, 3, 4] });
    const l = leerExif(t.subarray(0, t.length - 2));
    expect(l.miniatura).toBe(0);
    expect(l.incompleto).toBe(true);
  });
});

describe("bloques rotos u hostiles", () => {
  it("una cabecera que no es TIFF lanza imagen-ilegible", () => {
    esperarError(() => leerExif(new Uint8Array(0)));
    esperarError(() => leerExif(texto("XXXX\0\0\0\x08")));
    esperarError(() => leerExif(Uint8Array.from([0x4d, 0x4d, 0, 0x2a])));
    // IFD0 dentro de la cabecera o fuera del bloque.
    esperarError(() =>
      leerExif(Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 4])),
    );
    esperarError(() =>
      leerExif(Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8])),
    );
  });

  it("un IFD que se apunta a sí mismo termina y marca incompleto", () => {
    // IFD0 en 8 con un puntero Exif que vuelve al 8, y su «siguiente» también.
    const t = Uint8Array.from([
      0x4d,
      0x4d,
      0,
      0x2a,
      0,
      0,
      0,
      8,
      0,
      1,
      ...be16(0x8769),
      ...be16(4),
      ...be32(1),
      ...be32(8),
      ...be32(8),
    ]);
    const inicio = performance.now();
    const l = leerExif(t);
    expect(performance.now() - inicio).toBeLessThan(100);
    expect(l.incompleto).toBe(true);
  });

  it("cuentas absurdas: 65 535 entradas declaradas, 4 mil millones de valores", () => {
    const entradas = new Uint8Array(2 + 65535 * 12 + 4);
    entradas.set(be16(65535), 0);
    for (let k = 0; k < 65535; k++) {
      const p = 2 + k * 12;
      entradas.set(
        [...be16(0x0110), ...be16(2), ...be32(0xffffffff), ...be32(8)],
        p,
      );
    }
    const t = unir([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8], entradas);
    const inicio = performance.now();
    const l = leerExif(t);
    // 2 s y no 500 ms: con cobertura y la suite entera en paralelo en la CI un recorrido de 115 ms locales
    // tardó 621 ms (S7). El tope sigue separando un recorrido lineal de uno que trabaja de más.
    expect(performance.now() - inicio).toBeLessThan(2_000);
    expect(l.incompleto).toBe(true);
    expect(l.campos).toEqual([]);
    expect(MAXIMO_DE_ENTRADAS).toBe(4096);
  });

  it("una tabla de entradas que no cabe, un puntero roto y un tipo desconocido", () => {
    const tabla = leerExif(
      Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 9, 0, 0]),
    );
    expect(tabla.incompleto).toBe(true);
    const puntero = leerExif(
      tiff({
        ifd0: [
          [0x8769, { ascii: "no" }],
          [0x8825, { long: [100000] }],
        ],
      }),
    );
    expect(puntero.incompleto).toBe(true);
    const tipo = leerExif(
      tiff({
        ifd0: [[T.Artist, { crudo: { tipo: 99, cuenta: 1, datos: [1] } }]],
      }),
    );
    expect(tipo.incompleto).toBe(true);
    expect(tipo.otrasEtiquetas).toBe(1);
    // Un IFD0 sin el «siguiente» al final (archivo cortado justo ahí) no es un error.
    const sinSiguiente = tiff({ ifd0: [[T.Orientation, { short: [6] }]] });
    expect(
      leerExif(sinSiguiente.subarray(0, sinSiguiente.length - 4)),
    ).toMatchObject({
      orientacion: 6,
      incompleto: false,
    });
  });

  it("una nota del fabricante que apunta fuera no se mide", () => {
    const l = leerExif(
      tiff({
        exif: [
          [
            T.MakerNote,
            { crudo: { tipo: 7, cuenta: 100, desplazamiento: 9999 } },
          ],
        ],
      }),
    );
    expect(l.fabricante).toBe(0);
    expect(l.incompleto).toBe(true);
  });
});

describe("el EXIF mínimo que se conserva", () => {
  it("es un TIFF big endian con solo la orientación, y se reconoce a sí mismo", () => {
    const m = exifMinimo(6);
    expect(m).toHaveLength(LARGO_DEL_EXIF_MINIMO);
    const l = leerExif(m);
    expect(l).toMatchObject({
      campos: [],
      otrasEtiquetas: 0,
      orientacion: 6,
      incompleto: false,
    });
    expect(orientacionDelExifMinimo(m)).toBe(6);
    // Cualquier otra cosa no es «el mínimo de Velo», aunque diga lo mismo.
    expect(
      orientacionDelExifMinimo(
        tiff({ le: true, ifd0: [[T.Orientation, { short: [6] }]] }),
      ),
    ).toBeNull();
    expect(orientacionDelExifMinimo(exifMinimo(1))).toBeNull();
    expect(orientacionDelExifMinimo(m.subarray(0, 20))).toBeNull();
    const alterado = m.slice();
    alterado[0] = 0x49;
    expect(orientacionDelExifMinimo(alterado)).toBeNull();
  });

  it("se conservan 2 a 8; la 1 es «como está»", () => {
    expect(orientacionQueSeConserva(null)).toBe(false);
    expect(orientacionQueSeConserva(1)).toBe(false);
    expect(orientacionQueSeConserva(2)).toBe(true);
    expect(orientacionQueSeConserva(8)).toBe(true);
  });

  it("sinPrefijoExif acepta las dos formas", () => {
    const m = exifMinimo(3);
    expect(sinPrefijoExif(unir(texto("Exif\0\0"), m))).toEqual(m);
    expect(sinPrefijoExif(m)).toBe(m);
  });

  it("anotarExif lista miniatura y fabricante aparte, y avisa un bloque ilegible", () => {
    const inv = new Inventario();
    expect(anotarExif(inv, tiffCompleto({ orientacion: 8 }))).toBe(8);
    const a = inv.cerrar("jpeg");
    expect(a.quitables).toEqual([
      { clase: "miniatura", marcador: "IFD1", bytes: 23, cuantos: 1 },
      { clase: "fabricante", marcador: "MakerNote", bytes: 50, cuantos: 1 },
    ]);
    expect(a.avisos).toEqual([]);

    const roto = new Inventario();
    expect(anotarExif(roto, texto("basura"))).toBeNull();
    expect(roto.cerrar("png").avisos).toEqual([{ clave: "exif-ilegible" }]);

    const incompleto = new Inventario();
    anotarExif(
      incompleto,
      Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 9]),
    );
    expect(incompleto.cerrar("webp").avisos).toEqual([
      { clave: "exif-ilegible" },
    ]);
  });
});
