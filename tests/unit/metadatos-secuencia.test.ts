// @vitest-environment node
//
// AVIF, secuencias HEIC y AVIF y el `.mov` de una Live Photo (S11). Lo que se prueba:
//   · el AVIF fijo es el mismo contenedor que el HEIC: se rearma por el mismo camino y su flujo AV1
//     sale idéntico;
//   · lo que trae pistas NO se rearma: la copia tiene el mismo largo (menos los bytes sobrantes del
//     final) y todo byte que no es un metadato queda idéntico Y EN EL MISMO DESPLAZAMIENTO; los
//     cuadros, el instante de la Live Photo y el UUID que la empareja con su foto, también;
//   · lo que identifica (ubicación, equipo, programa, fechas, textos) no sobrevive en ninguna
//     codificación, y la copia pasa su propia poscomprobación;
//   · lo que no se sabe limpiar sin romper (fragmentos, datos en otro archivo, tablas que no cuadran)
//     se rechaza con su nombre; cortado en cada byte, o un resultado o `ErrorDeMetadatos`.
//
// Los archivos salen del kit (`binarios/secuencia.mjs` y `heic.mjs`, sobre `base.heic` y
// `base.avif`, versionados con su `.meta.json`). La comprobación con decodificadores de verdad
// (`ffmpeg -f framemd5`, `sips`) se corrió aparte en macOS y está en el cierre del S11.

import { describe, expect, it } from "vitest";

import { contieneCentinela } from "../../docs/kit-de-prueba/binarios/comun.mjs";
import {
  generarAvif,
  leerBase,
} from "../../docs/kit-de-prueba/binarios/heic.mjs";
import { generarSecuencia } from "../../docs/kit-de-prueba/binarios/secuencia.mjs";
import {
  extensionCoincide,
  formatoPorContenido,
  MIME_DEL_FORMATO,
} from "../../src/engine/metadatos/deteccion";
import {
  analizarImagen,
  limpiarImagen,
} from "../../src/engine/metadatos/imagen";
import { tramosEnCeros } from "../../src/engine/metadatos/secuencia";
import {
  ErrorDeMetadatos,
  type FormatoBmff,
} from "../../src/engine/metadatos/tipos";
import { be32, buscar, esperarError, texto, unir } from "./metadatos-ayuda";

// ── Un lector aparte, escrito para la prueba ────────────────────────────────────────────────────

function leer32(b: Uint8Array, p: number): number {
  return ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
}

interface CajaLeida {
  tipo: string;
  desde: number;
  datos: number;
  hasta: number;
}

function cajasDe(b: Uint8Array, desde = 0, hasta = b.length): CajaLeida[] {
  const lista: CajaLeida[] = [];
  for (let p = desde; p + 8 <= hasta;) {
    const tamano = leer32(b, p);
    if (tamano < 8 || p + tamano > hasta) break;
    lista.push({
      tipo: String.fromCharCode(...b.subarray(p + 4, p + 8)),
      desde: p,
      datos: p + 8,
      hasta: p + tamano,
    });
    p += tamano;
  }
  return lista;
}

/** La primera caja con ese camino de tipos (`moov/trak/mdia/mdhd`), bajando por la primera de cada uno. */
function camino(b: Uint8Array, ...tipos: string[]): CajaLeida | null {
  let desde = 0;
  let hasta = b.length;
  let caja: CajaLeida | null = null;
  for (const tipo of tipos) {
    caja = cajasDe(b, desde, hasta).find((c) => c.tipo === tipo) ?? null;
    if (!caja) return null;
    desde = caja.datos;
    hasta = caja.hasta;
  }
  return caja;
}

/** Dónde termina la última caja de arriba: lo que sigue son bytes sobrantes. */
const finDeLasCajas = (b: Uint8Array) => cajasDe(b).at(-1)!.hasta;

const igual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const FREE = [0x66, 0x72, 0x65, 0x65];

/**
 * La copia contra el original, byte a byte: lo que cambió tiene que estar en un tramo en ceros (y
 * valer 0), ser el código de una caja que pasó a `free`, o caer en un tramo que se reescribe entero
 * (la `meta` de arriba). Devuelve cuántas cajas pasaron a `free`.
 */
function soloCambiaLoDeclarado(
  original: Uint8Array,
  limpio: Uint8Array,
  ceros: readonly [number, number][],
  reescritos: readonly [number, number][] = [],
): number {
  const dentro = (tramos: readonly [number, number][], i: number) =>
    tramos.some(([d, h]) => i >= d && i < h);
  const codigos = new Set<number>();
  for (let i = 4; i + 4 <= limpio.length; i++)
    if (
      FREE.every((x, j) => limpio[i + j] === x) &&
      !FREE.every((x, j) => original[i + j] === x)
    )
      for (let j = 0; j < 4; j++) codigos.add(i + j);
  for (let i = 0; i < limpio.length; i++) {
    if (limpio[i] === original[i] || codigos.has(i) || dentro(reescritos, i))
      continue;
    if (dentro(ceros, i)) {
      expect(limpio[i], `byte ${i}`).toBe(0);
      continue;
    }
    throw new Error(`el byte ${i} cambió y no es un metadato`);
  }
  return codigos.size / 4;
}

function limpiar(bytes: Uint8Array) {
  const formato = formatoPorContenido(bytes) as FormatoBmff;
  return { formato, ...limpiarImagen(bytes, formato) };
}

// ── El AVIF fijo ────────────────────────────────────────────────────────────────────────────────

describe("una foto AVIF del kit", () => {
  const kit = generarAvif({ semilla: 42 });
  const foto = Uint8Array.from(kit.bytes);
  const { hevc: av1 } = leerBase("avif");

  it("se reconoce por sus bytes y su extensión, con su tipo MIME", () => {
    expect(formatoPorContenido(foto)).toBe("avif");
    expect(extensionCoincide("foto.avif", "avif")).toBe(true);
    expect(extensionCoincide("foto.heic", "avif")).toBe(false);
    expect(MIME_DEL_FORMATO.avif).toBe("image/avif");
  });

  it("nombra lo mismo que un HEIC: EXIF con GPS, XMP, `udes`, `free`, datos sin uso y la cola", () => {
    const a = analizarImagen(foto, "avif");
    expect(a.formato).toBe("avif");
    const claves = a.campos.map((c) => c.clave);
    expect(claves).toEqual(
      expect.arrayContaining([
        "GPSLatitude",
        "Artist",
        "xmp:CreatorTool",
        "udes:name",
      ]),
    );
    expect(a.quitables.map((e) => e.clase)).toEqual(
      expect.arrayContaining([
        "exif",
        "xmp",
        "comentario",
        "auxiliar",
        "datos-sin-uso",
        "bytes-sobrantes",
      ]),
    );
  });

  it("la copia: sin centinelas, con el flujo AV1 intacto y su `av1C`, y estable", () => {
    const limpio = limpiarImagen(foto, "avif").bytes;
    for (const c of kit.centinelas)
      expect(contieneCentinela(limpio, c), c).toBe(false);
    expect(buscar(limpio, av1)).toBeGreaterThan(0);
    expect(buscar(limpio, "av1C")).toBeGreaterThan(0);
    expect(analizarImagen(limpio, "avif").campos).toHaveLength(0);
    expect(igual(limpiarImagen(limpio, "avif").bytes, limpio)).toBe(true);
  });

  it("un HEIC no se limpia como AVIF ni al revés: el `ftyp` tiene que decirlo", () => {
    esperarError(() => analizarImagen(foto, "heic"));
  });
});

// ── Lo que trae pistas ──────────────────────────────────────────────────────────────────────────

const CASOS = [
  {
    nombre: "una secuencia HEIC",
    opciones: { formato: "heic" as const },
    formato: "heic",
    extension: "heic",
  },
  {
    nombre: "una secuencia AVIF con su foto fija",
    opciones: { formato: "avif" as const, conFoto: true },
    formato: "avif",
    extension: "avif",
  },
  {
    nombre: "el .mov de una Live Photo",
    opciones: { formato: "mov" as const },
    formato: "mov",
    extension: "mov",
  },
] as const;

for (const caso of CASOS) {
  describe(`${caso.nombre} del kit`, () => {
    const kit = generarSecuencia({ semilla: 42, ...caso.opciones });
    const original = Uint8Array.from(kit.bytes);

    it("se reconoce por sus bytes", () => {
      expect(formatoPorContenido(original)).toBe(caso.formato);
      expect(extensionCoincide(`x.${caso.extension}`, caso.formato)).toBe(true);
    });

    it("nombra la ubicación (en `ilst`, en `udta` y en la pista `mebx`), el equipo, el programa y la fecha", () => {
      const a = analizarImagen(original, caso.formato);
      const ubicaciones = a.campos.filter((c) => c.revela === "ubicacion");
      expect(ubicaciones.map((c) => c.clave)).toEqual(
        expect.arrayContaining([
          "com.apple.quicktime.location.ISO6709",
          "©xyz",
        ]),
      );
      expect(
        ubicaciones
          .filter((c) => c.origen === "quicktime")
          .every((c) => c.valor.includes(kit.detalle.latitud)),
      ).toBe(true);
      const revela = new Set(a.campos.map((c) => c.revela));
      for (const r of ["dispositivo", "software", "fecha"])
        expect(revela.has(r as never), r).toBe(true);
      expect(
        a.campos.find((c) => c.clave === "mvhd:creation_time")?.valor,
      ).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(a.quitables.map((e) => e.clase)).toEqual(
        expect.arrayContaining([
          "fecha-de-creacion",
          "metadatos-de-video",
          "pista-de-metadatos",
          "auxiliar",
          "texto",
          "datos-sin-uso",
          "bytes-sobrantes",
        ]),
      );
    });

    it("conserva y declara el UUID de la pareja", () => {
      const a = analizarImagen(original, caso.formato);
      expect(a.conservables.map((e) => e.clase)).toContain(
        "identificador-de-pareja",
      );
      expect(a.avisos.map((x) => x.clave)).toContain(
        "live-photo-identificador",
      );
      expect(a.campos.some((c) => c.valor.includes(kit.uuidDePareja))).toBe(
        false,
      );
    });

    const limpieza = limpiar(original);
    const limpio = limpieza.bytes;

    it("no queda ni un centinela, en ninguna codificación; el UUID de la pareja sigue", () => {
      for (const c of kit.centinelas)
        expect(contieneCentinela(limpio, c), c).toBe(false);
      expect(buscar(limpio, kit.uuidDePareja)).toBeGreaterThan(0);
    });

    it("no se mueve un byte: mismo largo sin la cola, y solo cambia lo que va a ceros o a `free`", () => {
      expect(limpio.length).toBe(finDeLasCajas(original));
      expect(limpio.length).toBeLessThan(original.length);
      const ceros = tramosEnCeros(original, caso.formato);
      const meta = camino(original, "meta");
      const reescritos: [number, number][] = meta
        ? [[meta.desde, meta.hasta]]
        : [];
      expect(
        soloCambiaLoDeclarado(original, limpio, ceros, reescritos),
      ).toBeGreaterThanOrEqual(2);
      // Los cuadros y el instante de la foto, en el mismo desplazamiento y con los mismos bytes.
      for (const t of [...kit.cuadros, kit.instante])
        expect(
          igual(
            limpio.subarray(t.desde, t.desde + t.largo),
            original.subarray(t.desde, t.desde + t.largo),
          ),
        ).toBe(true);
      // La ubicación cuadro a cuadro, en ceros en su sitio.
      expect(
        limpio
          .subarray(
            kit.ubicacion.desde,
            kit.ubicacion.desde + kit.ubicacion.largo,
          )
          .every((x) => x === 0),
      ).toBe(true);
    });

    it("las fechas de `mvhd`, `tkhd` y `mdhd` quedan en 0", () => {
      for (const ruta of [
        ["moov", "mvhd"],
        ["moov", "trak", "tkhd"],
        ["moov", "trak", "mdia", "mdhd"],
      ]) {
        const c = camino(limpio, ...ruta)!;
        expect(leer32(limpio, c.datos + 4), ruta.join("/")).toBe(0);
        expect(leer32(limpio, c.datos + 8), ruta.join("/")).toBe(0);
        expect(leer32(original, c.datos + 4)).toBe(kit.fecha);
      }
    });

    it("`udta` y la caja desconocida pasan a `free` del mismo tamaño", () => {
      const moovOriginal = cajasDe(
        original,
        camino(original, "moov")!.datos,
        camino(original, "moov")!.hasta,
      );
      const moovLimpio = cajasDe(
        limpio,
        camino(limpio, "moov")!.datos,
        camino(limpio, "moov")!.hasta,
      );
      expect(moovLimpio.map((c) => c.hasta - c.desde)).toEqual(
        moovOriginal.map((c) => c.hasta - c.desde),
      );
      expect(moovOriginal.map((c) => c.tipo)).toEqual(
        expect.arrayContaining(["udta", "Xtra"]),
      );
      expect(moovLimpio.map((c) => c.tipo)).not.toContain("udta");
      expect(moovLimpio.map((c) => c.tipo)).not.toContain("Xtra");
    });

    it("la poscomprobación: releída, no tiene campos ni nada que quitar", () => {
      const despues = analizarImagen(limpio, caso.formato);
      expect(despues.campos).toHaveLength(0);
      expect(despues.quitables).toHaveLength(0);
      expect(despues.conservables.map((e) => e.clase)).toContain(
        "identificador-de-pareja",
      );
    });

    it("determinista, y limpiar dos veces no cambia un byte", () => {
      expect(igual(limpiarImagen(original, caso.formato).bytes, limpio)).toBe(
        true,
      );
      expect(igual(limpiarImagen(limpio, caso.formato).bytes, limpio)).toBe(
        true,
      );
    });
  });
}

describe("la secuencia AVIF con foto fija: la `meta` se reescribe en su sitio", () => {
  const kit = generarSecuencia({ semilla: 7, formato: "avif", conFoto: true });
  const original = Uint8Array.from(kit.bytes);
  const limpio = limpiarImagen(original, "avif").bytes;

  it("la `meta` limpia más un `free` ocupan lo mismo que la original, y el EXIF de la foto se va", () => {
    const meta = camino(original, "meta")!;
    const metaLimpia = cajasDe(limpio).find((c) => c.tipo === "meta")!;
    expect(metaLimpia.desde).toBe(meta.desde);
    const siguiente = cajasDe(limpio).find(
      (c) => c.desde === metaLimpia.hasta,
    )!;
    expect(siguiente.tipo).toBe("free");
    expect(siguiente.hasta).toBe(meta.hasta);
    expect(buscar(limpio, "Exif")).toBe(-1);
  });

  it("la foto fija sigue apuntando a su flujo, que no se movió", () => {
    const a = analizarImagen(limpio, "avif");
    expect(a.quitables).toHaveLength(0);
    const [cuadro] = kit.cuadros;
    expect(
      igual(
        limpio.subarray(cuadro.desde, cuadro.desde + cuadro.largo),
        original.subarray(cuadro.desde, cuadro.desde + cuadro.largo),
      ),
    ).toBe(true);
  });
});

// ── Lo que no se sabe limpiar sin romper ────────────────────────────────────────────────────────

describe("lo que no se limpia en su lugar se rechaza con su nombre", () => {
  const kit = generarSecuencia({ semilla: 42, formato: "mov" });
  const original = Uint8Array.from(kit.bytes);

  /** Cambia el código de la primera caja `de` por `a` (mismo tamaño). */
  const renombrar = (de: string, a: string) => {
    const copia = original.slice();
    const i = buscar(copia, de);
    copia.set(texto(a), i);
    return copia;
  };

  it("un video fragmentado (`mvex` dentro de `moov`, o `moof` arriba)", () => {
    esperarError(
      () => analizarImagen(renombrar("Xtra", "mvex"), "mov"),
      "imagen-no-soportada",
    );
    const fin = finDeLasCajas(original);
    const moof = unir(original.subarray(0, fin), be32(8), texto("moof"));
    esperarError(() => analizarImagen(moof, "mov"), "imagen-no-soportada");
  });

  it("datos que viven en otro archivo (`dref` sin la bandera de «este archivo»)", () => {
    const copia = original.slice();
    const i = buscar(copia, "url ");
    copia[i + 7] = 0;
    esperarError(() => analizarImagen(copia, "mov"), "imagen-no-soportada");
  });

  it("una tabla compacta de tamaños (`stz2`)", () => {
    esperarError(
      () => analizarImagen(renombrar("stsz", "stz2"), "mov"),
      "imagen-no-soportada",
    );
  });

  it("una tabla de bloques que no cuadra con la de tamaños es un archivo roto", () => {
    const copia = original.slice();
    const stsc = buscar(copia, "stsc");
    // samples_per_chunk de la primera corrida: 2 → 3 (la tabla de tamaños dice 2).
    copia[stsc + 4 + 4 + 4 + 4 + 3] = 3;
    esperarError(() => analizarImagen(copia, "mov"));
  });

  it("una muestra que apunta fuera de todo `mdat`", () => {
    const copia = original.slice();
    const stco = buscar(copia, "stco");
    copia.set(be32(2), stco + 4 + 4 + 4);
    esperarError(() => analizarImagen(copia, "mov"), "imagen-no-soportada");
  });

  it("un `.mov` sin `moov` no es nada que Velo sepa leer", () => {
    esperarError(() => analizarImagen(renombrar("moov", "Xoov"), "mov"));
  });
});

describe("un .mov hostil", () => {
  const kit = generarSecuencia({ semilla: 3, formato: "mov" });
  const original = Uint8Array.from(kit.bytes);

  const resultadoOError = (bytes: Uint8Array) => {
    try {
      limpiarImagen(bytes, "mov");
      return true;
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDeMetadatos);
      return false;
    }
  };

  it("un `mvhd` agrandado hasta el final de `moov` se traga a sus hermanas: lo que sobra va a ceros", () => {
    const copia = original.slice();
    const moov = camino(copia, "moov")!;
    const mvhd = camino(copia, "moov", "mvhd")!;
    copia.set(be32(moov.hasta - mvhd.desde), mvhd.desde);
    const a = analizarImagen(copia, "mov");
    expect(a.quitables.map((e) => e.clase)).toContain("datos-sin-uso");
    const limpio = limpiarImagen(copia, "mov").bytes;
    for (const c of kit.centinelas)
      expect(contieneCentinela(limpio, c), c).toBe(false);
    expect(limpio.subarray(mvhd.datos + 100, moov.hasta).every((x) => x === 0)).toBe(true);
  });

  it("una caja que Velo no conoce dentro de `stbl` se va como las de `moov`", () => {
    const copia = original.slice();
    copia.set(texto("Xtts"), buscar(copia, "stts"));
    const a = analizarImagen(copia, "mov");
    expect(a.quitables.some((e) => e.clase === "auxiliar" && e.marcador === "Xtts")).toBe(true);
    const limpio = limpiarImagen(copia, "mov").bytes;
    expect(buscar(limpio, "Xtts")).toBe(-1);
  });

  it("una caja de tamaño 0 dentro de otra es un archivo roto (solo vale arriba del todo)", () => {
    const copia = original.slice();
    copia.set(be32(0), camino(copia, "moov", "mvhd")!.desde);
    esperarError(() => analizarImagen(copia, "mov"));
  });

  it(`cortado en cada uno de sus ${original.length} bytes: o un resultado o ErrorDeMetadatos`, () => {
    for (let corte = 0; corte <= original.length; corte++)
      resultadoOError(original.subarray(0, corte));
  });

  it("0x00 y 0xFF en cada posición: o un resultado o ErrorDeMetadatos, y nunca un centinela fuera", () => {
    for (let i = 0; i < original.length; i++)
      for (const b of [0x00, 0xff]) {
        const mutado = original.slice();
        mutado[i] = b;
        try {
          const limpio = limpiarImagen(mutado, "mov").bytes;
          // Si la copia sale, pasó su poscomprobación: ninguna ubicación puede haber sobrevivido.
          expect(
            contieneCentinela(limpio, kit.centinelas[0]),
            `byte ${i} = ${b}`,
          ).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(ErrorDeMetadatos);
        }
      }
  });
});
