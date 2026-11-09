// @vitest-environment node
//
// La puerta única (`imagen.ts`) y las entradas hostiles. Un archivo de imagen que llega a Velo no es
// de fiar: cortado en cualquier byte, con bytes cambiados al azar, con directorios EXIF que se
// apuntan a sí mismos o cuentas de cuatro mil millones. La propiedad es una sola: o un resultado, o
// `ErrorDeMetadatos` — nunca otra excepción, nunca un cuelgue. Y lo que sale limpio, sale limpio
// del todo: limpiarlo otra vez no cambia un byte.

import { afterEach, describe, expect, it, vi } from "vitest";

import { contieneCentinela } from "../../docs/kit-de-prueba/binarios/comun.mjs";
import { generarSecuencia } from "../../docs/kit-de-prueba/binarios/secuencia.mjs";
import {
  analizarImagen,
  limpiarImagen,
} from "../../src/engine/metadatos/imagen";
import {
  ErrorDeMetadatos,
  type FormatoDeImagen,
  MAXIMO_DE_CAMPOS,
} from "../../src/engine/metadatos/tipos";
import {
  app13,
  app1Exif,
  app1Xmp,
  app2Icc,
  be16,
  be32,
  chunk,
  com,
  contiene,
  CUERPO_JPEG,
  EOI,
  esperarError,
  iim,
  jfif,
  jpeg,
  lcg,
  paqueteXmp,
  png,
  recurso8bim,
  riff,
  SOI,
  T,
  tEXt,
  texto,
  tiff,
  unir,
  VP8L,
  vp8x,
  webp,
} from "./metadatos-ayuda";

/** Un EXIF pequeño con lo esencial: autor, serie, GPS y orientación. */
const TIFF_PEQUENO = tiff({
  ifd0: [
    [T.Artist, { ascii: "CENTINELA Ana" }],
    [T.Orientation, { short: [6] }],
  ],
  exif: [[T.BodySerialNumber, { ascii: "CENTINELA-42" }]],
  gps: [
    [T.GPSLatitudeRef, { ascii: "N" }],
    [
      T.GPSLatitude,
      {
        racional: [
          [4, 1],
          [36, 1],
          [34956, 1000],
        ],
      },
    ],
  ],
});

const XMP_PEQUENO = paqueteXmp(
  "<xmpMM:DocumentID>CENTINELA-DOC</xmpMM:DocumentID>",
);

const FIXTURES: readonly (readonly [FormatoDeImagen, Uint8Array])[] = [
  [
    "jpeg",
    jpeg(
      [
        jfif(1, 1),
        app1Exif(TIFF_PEQUENO),
        app1Xmp(XMP_PEQUENO),
        app2Icc(1, 1, [1, 2, 3]),
        app13([recurso8bim(0x0404, iim([[2, 80, "CENTINELA"]]))]),
        com("CENTINELA"),
      ],
      { cola: texto("CENTINELA") },
    ),
  ],
  [
    "png",
    png({
      antes: [
        chunk("iCCP", [0x70, 0, 0, 1]),
        chunk("eXIf", TIFF_PEQUENO),
        tEXt("Author", "CENTINELA"),
        chunk("tIME", [7, 234, 1, 2, 3, 4, 5]),
      ],
      cola: texto("CENTINELA"),
    }),
  ],
  [
    "webp",
    webp(
      [
        vp8x(0x08 | 0x04),
        riff("ICCP", [1, 2, 3]),
        VP8L,
        riff("EXIF", TIFF_PEQUENO),
        riff("XMP ", texto(XMP_PEQUENO)),
      ],
      { cola: texto("CENTINELA") },
    ),
  ],
];

/** O un resultado, o `ErrorDeMetadatos` por imagen ilegible. Nada más. */
function resultadoOError(
  bytes: Uint8Array,
  formato: FormatoDeImagen,
): Uint8Array | null {
  try {
    analizarImagen(bytes, formato);
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorDeMetadatos);
    expect((error as ErrorDeMetadatos).motivo).toBe("imagen-ilegible");
    // Si no se puede analizar, tampoco se puede limpiar.
    esperarError(() => limpiarImagen(bytes, formato));
    return null;
  }
  const limpia = limpiarImagen(bytes, formato).bytes;
  // Lo que sale limpio sale limpio del todo: una segunda limpieza no cambia un byte.
  expect(limpiarImagen(limpia, formato).bytes).toEqual(limpia);
  return limpia;
}

describe("la puerta única", () => {
  for (const [formato, bytes] of FIXTURES) {
    it(`${formato}: analiza, limpia y comprueba la copia`, () => {
      const a = analizarImagen(bytes, formato);
      expect(a.formato).toBe(formato);
      expect(a.campos.length).toBeGreaterThan(0);
      expect(a.campos.some((c) => c.clave === "GPSLatitude")).toBe(true);
      const limpia = limpiarImagen(bytes, formato);
      expect(contiene(limpia.bytes, "CENTINELA")).toBe(false);
      expect(limpia.conservados.some((e) => e.clase === "orientacion")).toBe(
        true,
      );
      const despues = analizarImagen(limpia.bytes, formato);
      expect(despues.campos).toEqual([]);
      expect(despues.quitables).toEqual([]);
    });
  }

  it("los bytes de otro formato son una imagen ilegible", () => {
    const [, j] = FIXTURES[0];
    const [, p] = FIXTURES[1];
    esperarError(() => analizarImagen(j, "png"));
    esperarError(() => analizarImagen(p, "webp"));
    esperarError(() => limpiarImagen(p, "jpeg"));
  });

  it("el tope de campos: se listan MAXIMO_DE_CAMPOS y los demás se cuentan", () => {
    const palabras = Array.from(
      { length: MAXIMO_DE_CAMPOS + 50 },
      (_, i) => [2, 25, `clave-${i}`] as const,
    );
    const a = analizarImagen(
      jpeg([app13([recurso8bim(0x0404, iim(palabras))])]),
      "jpeg",
    );
    expect(a.campos).toHaveLength(MAXIMO_DE_CAMPOS);
    expect(a.campos.at(-1)?.valor).toBe(`clave-${MAXIMO_DE_CAMPOS - 1}`);
    expect(a.avisos).toEqual([{ clave: "campos-de-mas", n: 50 }]);
  });

  it("un valor recortado se avisa", () => {
    const a = analizarImagen(
      png({ antes: [tEXt("Comment", "x".repeat(600))] }),
      "png",
    );
    expect(a.avisos).toContainEqual({ clave: "valores-recortados" });
  });

  it("la misma entrada da los mismos bytes, corrida tras corrida", () => {
    for (const [formato, bytes] of FIXTURES) {
      const una = limpiarImagen(bytes, formato).bytes;
      const otra = limpiarImagen(bytes.slice(), formato).bytes;
      expect(otra).toEqual(una);
    }
  });
});

describe("la poscomprobación: si la copia no queda limpia, no se entrega", () => {
  /**
   * Tras `resetModules`, `imagen.ts` se vuelve a cargar con SU `tipos.ts`: el error se compara con
   * esa clase, que es la que importa el módulo recién cargado.
   */
  async function esperarIncompleta(f: () => unknown): Promise<void> {
    const tipos = await import("../../src/engine/metadatos/tipos");
    let error: unknown = null;
    try {
      f();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(tipos.ErrorDeMetadatos);
    expect((error as ErrorDeMetadatos).motivo).toBe("limpieza-incompleta");
  }

  afterEach(() => {
    vi.doUnmock("../../src/engine/metadatos/jpeg");
    vi.resetModules();
  });

  it("una copia que todavía trae campos es limpieza-incompleta", async () => {
    const [, sucio] = FIXTURES[0];
    vi.resetModules();
    vi.doMock("../../src/engine/metadatos/jpeg", async (original) => ({
      ...(await original<typeof import("../../src/engine/metadatos/jpeg")>()),
      limpiarJpeg: (bytes: Uint8Array) => ({
        bytes,
        quitados: [],
        conservados: [],
        idNuevo: null,
      }),
    }));
    const { limpiarImagen: conCopiaSucia } =
      await import("../../src/engine/metadatos/imagen");
    await esperarIncompleta(() => conCopiaSucia(sucio, "jpeg"));
  });

  it("una copia ilegible también es limpieza-incompleta", async () => {
    const [, j] = FIXTURES[0];
    vi.resetModules();
    vi.doMock("../../src/engine/metadatos/jpeg", async (original) => ({
      ...(await original<typeof import("../../src/engine/metadatos/jpeg")>()),
      limpiarJpeg: () => ({
        bytes: new Uint8Array([1, 2, 3]),
        quitados: [],
        conservados: [],
        idNuevo: null,
      }),
    }));
    const { limpiarImagen: conCopiaRota } =
      await import("../../src/engine/metadatos/imagen");
    await esperarIncompleta(() => conCopiaRota(j, "jpeg"));
  });

  it("un error que no es de metadatos no se disfraza", async () => {
    const [, j] = FIXTURES[0];
    vi.resetModules();
    vi.doMock("../../src/engine/metadatos/jpeg", async (original) => ({
      ...(await original<typeof import("../../src/engine/metadatos/jpeg")>()),
      analizarJpeg: () => {
        throw new TypeError("fallo de programa");
      },
    }));
    const { limpiarImagen: conFallo } =
      await import("../../src/engine/metadatos/imagen");
    expect(() => conFallo(j, "jpeg")).toThrow(TypeError);
  });
});

describe("archivos cortados en cada byte", () => {
  for (const [formato, bytes] of FIXTURES) {
    it(`${formato}: ${bytes.length} cortes, todos resultado o ErrorDeMetadatos`, () => {
      let resultados = 0;
      for (let corte = 0; corte <= bytes.length; corte++)
        if (resultadoOError(bytes.subarray(0, corte), formato)) resultados++;
      // Solo cortar dentro de la cola (después del final de la imagen) deja un archivo válido.
      expect(resultados).toBe("CENTINELA".length + 1);
    });
  }
});

describe("bytes cambiados al azar (semilla fija)", () => {
  for (const [formato, bytes] of FIXTURES) {
    it(`${formato}: 400 mutaciones, todas resultado o ErrorDeMetadatos`, () => {
      const azar = lcg(0x5e110 + bytes.length);
      for (let n = 0; n < 400; n++) {
        const mutado = bytes.slice();
        const cambios = 1 + (azar() % 4);
        for (let k = 0; k < cambios; k++)
          mutado[azar() % mutado.length] = azar() & 0xff;
        resultadoOError(mutado, formato);
      }
    });

    it(`${formato}: bytes 0xFF y 0x00 en cada posición`, () => {
      for (let i = 0; i < bytes.length; i++)
        for (const b of [0x00, 0xff]) {
          const mutado = bytes.slice();
          mutado[i] = b;
          resultadoOError(mutado, formato);
        }
    });
  }
});

describe("el video de una Live Photo, cambiado al azar (S11)", () => {
  // Limpiar EN SU LUGAR deja a la vista todo lo que no se reconoce: una caja agrandada, un tamaño
  // en 0 o una tabla que no cuadra no pueden colar nada. O un error con nombre, o una copia que
  // pasó su poscomprobación, no trae la ubicación y no cambia al limpiarla otra vez.
  const kit = generarSecuencia({ semilla: 11, formato: "mov" });
  const bytes = Uint8Array.from(kit.bytes);
  const [ubicacion] = kit.centinelas;

  it("400 mutaciones de 1 a 4 bytes: error con nombre o copia limpia y estable", () => {
    const azar = lcg(0x5e111 + bytes.length);
    let limpias = 0;
    for (let n = 0; n < 400; n++) {
      const mutado = bytes.slice();
      const cambios = 1 + (azar() % 4);
      for (let k = 0; k < cambios; k++)
        mutado[azar() % mutado.length] = azar() & 0xff;
      let limpia: Uint8Array;
      try {
        limpia = limpiarImagen(mutado, "mov").bytes;
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorDeMetadatos);
        expect(["imagen-ilegible", "imagen-no-soportada"]).toContain(
          (error as ErrorDeMetadatos).motivo,
        );
        continue;
      }
      limpias++;
      expect(contieneCentinela(limpia, ubicacion), `mutación ${n}`).toBe(false);
      expect(limpiarImagen(limpia, "mov").bytes).toEqual(limpia);
    }
    // Que la prueba mida algo: buena parte de las mutaciones caen en muestras y siguen limpiables.
    expect(limpias).toBeGreaterThan(50);
  });
});

describe("estructuras que buscan cuelgues", () => {
  it("un IFD que se apunta a sí mismo dentro de un JPEG termina enseguida", () => {
    const ciclo = Uint8Array.from([
      0x4d,
      0x4d,
      0,
      0x2a,
      0,
      0,
      0,
      8,
      0,
      2,
      ...be16(0x8769),
      ...be16(4),
      ...be32(1),
      ...be32(8),
      ...be16(0x8825),
      ...be16(13),
      ...be32(1),
      ...be32(8),
      ...be32(8),
    ]);
    const inicio = performance.now();
    const a = analizarImagen(jpeg([app1Exif(ciclo)]), "jpeg");
    expect(performance.now() - inicio).toBeLessThan(100);
    expect(a.avisos).toEqual([{ clave: "exif-ilegible" }]);
  });

  it("cuentas absurdas en un EXIF de PNG terminan enseguida", () => {
    const entradas: number[] = [];
    for (let k = 0; k < 5000; k++)
      entradas.push(
        ...be16(0x013b),
        ...be16(2),
        ...be32(0xffffffff),
        ...be32(0xfffffff0),
      );
    const absurdo = unir(
      [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8],
      be16(5000),
      entradas,
      be32(0),
    );
    const inicio = performance.now();
    const a = analizarImagen(png({ antes: [chunk("eXIf", absurdo)] }), "png");
    // 2 s y no 500 ms: con cobertura y la suite entera en paralelo en la CI un recorrido de 115 ms locales
    // tardó 621 ms (S7). El tope sigue separando un recorrido lineal de uno que trabaja de más.
    expect(performance.now() - inicio).toBeLessThan(2_000);
    expect(a.campos).toEqual([]);
    expect(a.avisos).toEqual([{ clave: "exif-ilegible" }]);
  });

  it("decenas de miles de segmentos diminutos: lineal, sin cuelgue", () => {
    const comentario = com("");
    const muchos = new Uint8Array(comentario.length * 50_000);
    for (let i = 0; i < 50_000; i++)
      muchos.set(comentario, i * comentario.length);
    const original = unir(SOI, muchos, CUERPO_JPEG, EOI);
    const inicio = performance.now();
    const limpia = limpiarImagen(original, "jpeg");
    expect(performance.now() - inicio).toBeLessThan(2000);
    expect(limpia.bytes).toEqual(unir(SOI, CUERPO_JPEG, EOI));
    expect(limpia.quitados).toEqual([
      {
        clase: "comentario",
        marcador: "COM",
        bytes: 4 * 50_000,
        cuantos: 50_000,
      },
    ]);
  });

  it("un largo declarado de 4 GB en PNG y en WebP no reserva memoria: falla", () => {
    esperarError(() =>
      analizarImagen(
        unir(
          [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
          be32(0xffffffff),
          texto("IHDR"),
        ),
        "png",
      ),
    );
    esperarError(() =>
      analizarImagen(
        webp([unir(texto("VP8L"), [0xff, 0xff, 0xff, 0xff])]),
        "webp",
      ),
    );
  });
});
