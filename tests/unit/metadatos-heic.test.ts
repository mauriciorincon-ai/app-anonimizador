// @vitest-environment node
//
// HEIC (S7): el contenedor ISO BMFF se desarma y se vuelve a armar. Lo que se prueba:
//   · lo que se nombra: EXIF (con sus 4 bytes de desplazamiento), XMP en un elemento `mime`, la
//     descripción `udes`, los nombres de elemento y de `hdlr`, la caja `free`, los datos sin dueño
//     dentro de `mdat` y los bytes después de la última caja;
//   · la promesa central: los bytes HEVC (los píxeles) y sus propiedades salen IGUALES, `iloc` apunta
//     a ellos en la copia, en la copia no queda ni un centinela, y limpiar dos veces no cambia nada;
//   · lo que no se sabe reescribir se rechaza con su nombre en vez de romper la foto;
//   · cortado en cada byte, o un resultado o `ErrorDeMetadatos`.
//
// La foto completa sale del kit (`binarios/heic.mjs`, sobre el `base.heic` versionado); los casos
// raros se arman aquí, caja por caja, sin pasar por el código que se prueba.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contieneCentinela } from "../../docs/kit-de-prueba/binarios/comun.mjs";
import { generarHeic } from "../../docs/kit-de-prueba/binarios/heic.mjs";
import {
  extensionCoincide,
  formatoPorContenido,
} from "../../src/engine/metadatos/deteccion";
import { analizarHeic, limpiarHeic } from "../../src/engine/metadatos/heic";
import {
  analizarImagen,
  limpiarImagen,
} from "../../src/engine/metadatos/imagen";
import { ErrorDeMetadatos } from "../../src/engine/metadatos/tipos";
import {
  be16,
  be32,
  buscar,
  esperarError,
  texto,
  unir,
} from "./metadatos-ayuda";

const KIT = generarHeic({ semilla: 42 });
const FOTO = Uint8Array.from(KIT.bytes);

// ── Un lector aparte, escrito para la prueba ────────────────────────────────────────────────────

interface CajaLeida {
  tipo: string;
  desde: number;
  datos: number;
  hasta: number;
}

function leer32(b: Uint8Array, p: number): number {
  return ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
}

function cajasDe(b: Uint8Array, desde = 0, hasta = b.length): CajaLeida[] {
  const lista: CajaLeida[] = [];
  for (let p = desde; p < hasta;) {
    let tamano = leer32(b, p);
    let datos = p + 8;
    if (tamano === 1) {
      tamano = leer32(b, p + 12);
      datos = p + 16;
    }
    const tipo = String.fromCharCode(...b.subarray(p + 4, p + 8));
    lista.push({ tipo, desde: p, datos, hasta: p + tamano });
    p += tamano;
  }
  return lista;
}

/** Los tramos de `iloc` (versión 0 o 1, desplazamiento y largo de 4 bytes, sin base) por elemento. */
function ilocDe(
  b: Uint8Array,
): Map<number, { metodo: number; tramos: [number, number][] }> {
  const meta = cajasDe(b).find((c) => c.tipo === "meta")!;
  const iloc = cajasDe(b, meta.datos + 4, meta.hasta).find(
    (c) => c.tipo === "iloc",
  )!;
  const version = b[iloc.datos];
  expect((b[iloc.datos + 4] << 8) | b[iloc.datos + 5]).toBe(0x4400);
  let p = iloc.datos + 6;
  const cuenta = (b[p] << 8) | b[p + 1];
  p += 2;
  const mapa = new Map<
    number,
    { metodo: number; tramos: [number, number][] }
  >();
  for (let i = 0; i < cuenta; i++) {
    const id = (b[p] << 8) | b[p + 1];
    p += 2;
    let metodo = 0;
    if (version >= 1) {
      metodo = b[p + 1] & 0xf;
      p += 2;
    }
    p += 2; // referencia
    const n = (b[p] << 8) | b[p + 1];
    p += 2;
    const tramos: [number, number][] = [];
    for (let e = 0; e < n; e++) {
      tramos.push([leer32(b, p), leer32(b, p + 4)]);
      p += 8;
    }
    mapa.set(id, { metodo, tramos });
  }
  return mapa;
}

function sha(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

// ── Un HEIC armado a mano para los casos raros ─────────────────────────────────────────────────

const caja = (tipo: string, ...partes: (Uint8Array | readonly number[])[]) => {
  const cuerpo = unir(...partes);
  return unir(be32(8 + cuerpo.length), texto(tipo), cuerpo);
};
const completa = (v: number, f = 0) => [
  v,
  (f >> 16) & 255,
  (f >> 8) & 255,
  f & 255,
];
const nulo = (s: string) => unir(texto(s), [0]);

interface ElementoDePrueba {
  id: number;
  tipo: string;
  datos: Uint8Array;
  metodo?: 0 | 1 | 2;
  contenido?: string;
  protegido?: boolean;
}

/** La propiedad `hvcC` de la base: la que un decodificador necesita. Aquí basta con que viaje igual. */
const HVCC = caja(
  "hvcC",
  Array.from({ length: 23 }, (_, i) => i + 1),
);
const ISPE = caja("ispe", completa(0), be32(64), be32(48));
const IROT = caja("irot", [1]);
const HEVC = texto("PIXELES-HEVC-QUE-NO-SE-TOCAN");

function armar({
  elementos,
  primario = 1,
  propiedades = [HVCC, ISPE, IROT],
  asociaciones = [[1, [0x81, 0x02, 0x83]]] as [number, number[]][],
  referencias = [] as Uint8Array[],
  superiores = [] as Uint8Array[],
  cola = new Uint8Array(0),
}: {
  elementos: ElementoDePrueba[];
  primario?: number;
  propiedades?: Uint8Array[];
  asociaciones?: [number, number[]][];
  referencias?: Uint8Array[];
  superiores?: Uint8Array[];
  cola?: Uint8Array;
}): Uint8Array {
  const ftyp = caja("ftyp", texto("heic"), be32(0), texto("mif1heic"));
  const enIdat = elementos.filter((e) => e.metodo === 1);
  const enMdat = elementos.filter((e) => e.metodo !== 1);
  const idat = unir(...enIdat.map((e) => e.datos));
  const infes = elementos.map((e) =>
    caja(
      "infe",
      completa(2),
      be16(e.id),
      be16(e.protegido ? 1 : 0),
      texto(e.tipo),
      nulo(""),
      e.contenido ? nulo(e.contenido) : [],
    ),
  );
  const ipma = caja(
    "ipma",
    completa(0),
    be32(asociaciones.length),
    ...asociaciones.map(([id, a]) => unir(be16(id), [a.length, ...a])),
  );
  const metaCon = (base: number) => {
    let enArchivo = base;
    let dentro = 0;
    const entradas = elementos.map((e) => {
      const metodo = e.metodo ?? 0;
      const desplazamiento = metodo === 1 ? dentro : enArchivo;
      if (metodo === 1) dentro += e.datos.length;
      else enArchivo += e.datos.length;
      return unir(
        be16(e.id),
        be16(metodo),
        be16(0),
        be16(1),
        be32(desplazamiento),
        be32(e.datos.length),
      );
    });
    return caja(
      "meta",
      completa(0),
      caja(
        "hdlr",
        completa(0),
        be32(0),
        texto("pict"),
        new Uint8Array(12),
        [0],
      ),
      caja("pitm", completa(0), be16(primario)),
      caja("iinf", completa(0), be16(elementos.length), ...infes),
      referencias.length > 0 ? caja("iref", completa(0), ...referencias) : [],
      caja("iprp", caja("ipco", ...propiedades), ipma),
      enIdat.length > 0 ? caja("idat", idat) : [],
      caja(
        "iloc",
        completa(1),
        be16(0x4400),
        be16(elementos.length),
        ...entradas,
      ),
    );
  };
  const extra = unir(...superiores);
  const antes = ftyp.length + metaCon(0).length + extra.length + 8;
  return unir(
    ftyp,
    metaCon(antes),
    extra,
    caja("mdat", ...enMdat.map((e) => e.datos)),
    cola,
  );
}

const ref = (tipo: string, de: number, ...a: number[]) =>
  caja(tipo, be16(de), be16(a.length), ...a.map((x) => be16(x)));

// ── Lo que se nombra ────────────────────────────────────────────────────────────────────────────

describe("una foto HEIC del kit: lo que se nombra", () => {
  const a = analizarHeic(FOTO);
  const valor = (k: string) => a.campos.find((c) => c.clave === k)?.valor;

  it("se reconoce por sus bytes, y la extensión .heif también vale", () => {
    expect(formatoPorContenido(FOTO)).toBe("heic");
    expect(extensionCoincide("foto.HEIC", "heic")).toBe(true);
    expect(extensionCoincide("foto.heif", "heic")).toBe(true);
    expect(extensionCoincide("foto.jpg", "heic")).toBe(false);
    // Un HEIF con otra codificación (AVIF) no es HEIC: Velo no lo trata.
    const avif = caja("ftyp", texto("avif"), be32(0), texto("mif1avif"));
    expect(formatoPorContenido(avif)).toBeNull();
  });

  it("EXIF (tras sus 4 bytes de desplazamiento), GPS, XMP y la descripción `udes`", () => {
    expect(a.formato).toBe("heic");
    expect(valor("Artist")).toContain(KIT.detalle.cedula);
    expect(a.campos.some((c) => c.origen === "gps")).toBe(true);
    expect(valor("dc:creator")).toBe(KIT.detalle.autor);
    expect(valor("udes:name")).toContain("Copyright");
    expect(valor("udes:description")).toContain("Revisado por");
    expect(a.campos.length).toBeGreaterThan(10);
  });

  it("lo que se quita, con su marcador", () => {
    const quitados = a.quitables.map((e) => `${e.clase} ${e.marcador}`);
    expect(quitados).toEqual(
      expect.arrayContaining([
        "exif Exif",
        "xmp mime",
        "texto infe",
        "texto hdlr",
        "comentario udes",
        "auxiliar free",
        "datos-sin-uso mdat",
        "bytes-sobrantes BMFF",
      ]),
    );
  });

  it("lo que se conserva y se declara: la miniatura (son píxeles) y la orientación", () => {
    const conservados = a.conservables.map((e) => `${e.clase} ${e.marcador}`);
    expect(conservados).toEqual(
      expect.arrayContaining(["miniatura thmb", "orientacion irot"]),
    );
  });
});

// ── La copia limpia ─────────────────────────────────────────────────────────────────────────────

describe("una foto HEIC del kit: la copia limpia", () => {
  const limpia = limpiarImagen(FOTO, "heic").bytes;
  const base = readFileSync(
    join(__dirname, "../../docs/kit-de-prueba/binarios/base.heic"),
  );

  it("no queda ni un centinela, en ninguna codificación", () => {
    for (const centinela of KIT.centinelas)
      expect(contieneCentinela(limpia, centinela), centinela).toBe(false);
  });

  it("la poscomprobación: releída, no tiene campos ni nada que quitar", () => {
    const despues = analizarImagen(limpia, "heic");
    expect(despues.campos).toEqual([]);
    expect(despues.quitables).toEqual([]);
    expect(despues.otrasEtiquetas).toBe(0);
  });

  it("los píxeles y sus propiedades salen iguales, e `iloc` apunta a ellos", () => {
    const meta = cajasDe(base).find((c) => c.tipo === "meta")!;
    const ilocBase = ilocDe(base).get(1)!;
    const [desde, largo] = ilocBase.tramos[0];
    const hevc = base.subarray(desde, desde + largo);
    const iloc = ilocDe(limpia);
    expect([...iloc.keys()]).toEqual([1, 4]);
    for (const id of [1, 4]) {
      const [d, l] = iloc.get(id)!.tramos[0];
      expect(sha(limpia.subarray(d, d + l))).toBe(sha(hevc));
    }
    // `hvcC`, `ispe`, `colr`, `irot` y `pixi`, byte por byte.
    const ipcoBase = cajasDe(
      base,
      cajasDe(base, meta.datos + 4, meta.hasta).find((c) => c.tipo === "iprp")!
        .datos,
    )[0];
    for (const p of cajasDe(base, ipcoBase.datos, ipcoBase.hasta))
      if (p.tipo !== "clli")
        expect(
          buscar(limpia, base.subarray(p.desde, p.hasta)),
          p.tipo,
        ).toBeGreaterThan(0);
  });

  it("solo quedan ftyp, meta y mdat, y el mdat trae justo los bytes de los elementos", () => {
    const cajas = cajasDe(limpia);
    expect(cajas.map((c) => c.tipo)).toEqual(["ftyp", "meta", "mdat"]);
    expect(cajas.at(-1)!.hasta).toBe(limpia.length);
    const mdat = cajas[2];
    const iloc = ilocDe(limpia);
    const usados = [...iloc.values()]
      .flatMap((u) => u.tramos)
      .reduce((n, [, l]) => n + l, 0);
    expect(mdat.hasta - mdat.datos).toBe(usados);
  });

  it("determinista, y limpiar dos veces no cambia un byte", () => {
    expect(sha(limpiarHeic(FOTO).bytes)).toBe(sha(limpia));
    expect(sha(limpiarHeic(limpia).bytes)).toBe(sha(limpia));
  });
});

// ── Casos armados a mano ────────────────────────────────────────────────────────────────────────

describe("la estructura, caso por caso", () => {
  const exifConCentinela = unir(be32(0), texto("MM\0*CENTINELA-EXIF"));

  it("un elemento en `idat`: el `idat` se rehace sin los bytes del EXIF que vivía ahí", () => {
    const rejilla = texto("REJILLA");
    const bytes = armar({
      elementos: [
        { id: 1, tipo: "grid", datos: rejilla, metodo: 1 },
        { id: 2, tipo: "hvc1", datos: HEVC },
        { id: 3, tipo: "Exif", datos: exifConCentinela, metodo: 1 },
      ],
      asociaciones: [[2, [0x81, 0x02]]],
      referencias: [ref("dimg", 1, 2), ref("cdsc", 3, 1)],
    });
    const limpia = limpiarImagen(bytes, "heic").bytes;
    expect(buscar(limpia, "CENTINELA")).toBe(-1);
    const iloc = ilocDe(limpia);
    expect(iloc.get(1)!.metodo).toBe(1);
    expect([...iloc.keys()]).toEqual([1, 2]);
    const meta = cajasDe(limpia).find((c) => c.tipo === "meta")!;
    const idat = cajasDe(limpia, meta.datos + 4, meta.hasta).find(
      (c) => c.tipo === "idat",
    )!;
    expect(
      new TextDecoder().decode(limpia.subarray(idat.datos, idat.hasta)),
    ).toBe("REJILLA");
    const [d, l] = iloc.get(2)!.tramos[0];
    expect(sha(limpia.subarray(d, d + l))).toBe(sha(HEVC));
  });

  it("una propiedad desconocida NO esencial se quita y se nombra; las asociaciones se re-indexan", () => {
    const rara = caja("zzzz", texto("CENTINELA-PROPIEDAD"));
    const bytes = armar({
      elementos: [{ id: 1, tipo: "hvc1", datos: HEVC }],
      propiedades: [HVCC, rara, ISPE, IROT],
      asociaciones: [[1, [0x81, 0x02, 0x03, 0x84]]],
    });
    const a = analizarHeic(bytes);
    expect(a.quitables.map((e) => `${e.clase} ${e.marcador}`)).toEqual([
      "auxiliar zzzz",
    ]);
    const limpia = limpiarImagen(bytes, "heic").bytes;
    expect(buscar(limpia, "CENTINELA")).toBe(-1);
    // ipma: el elemento 1 queda con hvcC (1, esencial), ispe (2) e irot (3, esencial).
    expect(
      buscar(limpia, unir(be16(1), [3, 0x81, 0x02, 0x83])),
    ).toBeGreaterThan(0);
  });

  it("una propiedad desconocida ESENCIAL: no se toca la foto", () => {
    const bytes = armar({
      elementos: [{ id: 1, tipo: "hvc1", datos: HEVC }],
      propiedades: [HVCC, caja("zzzz", [1])],
      asociaciones: [[1, [0x81, 0x82]]],
    });
    esperarError(() => analizarHeic(bytes), "imagen-no-soportada");
  });

  it("una secuencia o una Live Photo (`moov`), un elemento protegido, uno construido desde otros: no", () => {
    const una = { id: 1, tipo: "hvc1", datos: HEVC };
    esperarError(
      () =>
        analizarHeic(
          armar({ elementos: [una], superiores: [caja("moov", [0])] }),
        ),
      "imagen-no-soportada",
    );
    esperarError(
      () => analizarHeic(armar({ elementos: [{ ...una, protegido: true }] })),
      "imagen-no-soportada",
    );
    esperarError(
      () => analizarHeic(armar({ elementos: [{ ...una, metodo: 2 }] })),
      "imagen-no-soportada",
    );
  });

  it("el elemento primario no puede ser un metadato, ni una imagen armada con uno", () => {
    esperarError(
      () =>
        analizarHeic(
          armar({
            elementos: [{ id: 1, tipo: "Exif", datos: exifConCentinela }],
          }),
        ),
      "imagen-no-soportada",
    );
    esperarError(
      () =>
        analizarHeic(
          armar({
            elementos: [
              { id: 1, tipo: "grid", datos: texto("R"), metodo: 1 },
              { id: 2, tipo: "Exif", datos: exifConCentinela },
            ],
            referencias: [ref("dimg", 1, 2)],
          }),
        ),
      "imagen-no-soportada",
    );
  });

  it("un XMP comprimido se quita sin leerlo, y lo dice", () => {
    const comprimido = caja(
      "infe",
      completa(2),
      be16(2),
      be16(0),
      texto("mime"),
      nulo(""),
      nulo("application/rdf+xml"),
      nulo("deflate"),
    );
    // Se arma a mano: `armar` no escribe content_encoding.
    const sinXmp = armar({
      elementos: [
        { id: 1, tipo: "hvc1", datos: HEVC },
        {
          id: 2,
          tipo: "mime",
          datos: texto("CENTINELA-XMP-COMPRIMIDO"),
          contenido: "application/rdf+xml",
        },
      ],
    });
    const viejo = unir(
      caja(
        "infe",
        completa(2),
        be16(2),
        be16(0),
        texto("mime"),
        nulo(""),
        nulo("application/rdf+xml"),
      ),
    );
    const i = buscar(sinXmp, viejo);
    expect(i).toBeGreaterThan(0);
    // Mismo largo no: hay que corregir los tamaños. Se rehace con el iinf entero.
    const bytes = armar({
      elementos: [
        { id: 1, tipo: "hvc1", datos: HEVC },
        {
          id: 2,
          tipo: "mime",
          datos: texto("CENTINELA-XMP-COMPRIMIDO"),
          contenido: "application/rdf+xml\0deflate",
        },
      ],
    });
    expect(comprimido.length).toBeGreaterThan(0);
    const a = analizarHeic(bytes);
    expect(a.avisos.map((v) => v.clave)).toContain("texto-comprimido");
    expect(a.campos).toEqual([]);
    expect(buscar(limpiarImagen(bytes, "heic").bytes, "CENTINELA")).toBe(-1);
  });
});

// ── Entradas hostiles ───────────────────────────────────────────────────────────────────────────

function resultadoOError(bytes: Uint8Array): boolean {
  try {
    limpiarImagen(bytes, "heic");
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorDeMetadatos);
    return false;
  }
}

/**
 * Un HEIC con el esqueleto de una foto y el `iloc` que se le pase. La auditoría del S7 halló que un
 * `iloc` con los tamaños en 0 y 65 535 extensiones por elemento agotaba la memoria con ~6 KB.
 */
function conIloc(iloc: Uint8Array): Uint8Array {
  return unir(
    caja("ftyp", texto("heic"), be32(0), texto("mif1heic")),
    caja(
      "meta",
      completa(0),
      caja(
        "hdlr",
        completa(0),
        be32(0),
        texto("pict"),
        new Uint8Array(12),
        [0],
      ),
      caja("pitm", completa(0), be16(1)),
      caja(
        "iinf",
        completa(0),
        be16(1),
        caja("infe", completa(2), be16(1), be16(0), texto("hvc1"), nulo("")),
      ),
      caja(
        "iprp",
        caja("ipco", HVCC, ISPE),
        caja("ipma", completa(0), be32(1), be16(1), [2, 0x81, 0x02]),
      ),
      iloc,
    ),
    caja("mdat", HEVC),
  );
}

describe("un `iloc` hostil se rechaza antes de reservar memoria", () => {
  const motivoDe = (bytes: Uint8Array) => {
    try {
      limpiarImagen(bytes, "heic");
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDeMetadatos);
      return (error as ErrorDeMetadatos).motivo;
    }
    return null;
  };

  it("mil elementos con los tamaños en 0 y 65 535 extensiones cada uno (el de la auditoría)", () => {
    // v0, tamaños 0/0/0: por elemento, id (2) + data_reference_index (2) + extension_count (2).
    const iloc = caja(
      "iloc",
      completa(0),
      be16(0x0000),
      be16(1_000),
      ...Array.from({ length: 1_000 }, (_, i) =>
        unir(be16(i + 1), be16(0), be16(0xffff)),
      ),
    );
    const bytes = conIloc(iloc);
    expect(bytes.length).toBeLessThan(16_000);
    const inicio = performance.now();
    expect(motivoDe(bytes)).toBe("imagen-no-soportada");
    // No se reservó nada: la prueba no se queda sin memoria ni espera. (Holgado a propósito.)
    expect(performance.now() - inicio).toBeLessThan(2_000);
  });

  it("más tramos que el tope en todo el archivo, aunque cada elemento sea decente", () => {
    // Tamaños 4/4/0 en v0 (desplazamiento y largo de 4 bytes): 8 bytes por tramo. Cinco elementos
    // de 1 000 tramos son 5 000 > 4 096.
    const tramos = unir(
      ...Array.from({ length: 1_000 }, () => unir(be32(0), be32(1))),
    );
    const iloc = caja(
      "iloc",
      completa(0),
      be16(0x4400),
      be16(5),
      ...Array.from({ length: 5 }, (_, i) =>
        unir(be16(i + 1), be16(0), be16(1_000), tramos),
      ),
    );
    expect(motivoDe(conIloc(iloc))).toBe("imagen-no-soportada");
  });

  it("una cuenta de extensiones que no cabe en la caja es un archivo cortado", () => {
    const iloc = caja(
      "iloc",
      completa(0),
      be16(0x4400),
      be16(1),
      unir(be16(1), be16(0), be16(500), be32(0), be32(1)),
    );
    expect(motivoDe(conIloc(iloc))).toBe("imagen-ilegible");
  });
});

describe("una foto HEIC hostil", () => {
  it(`cortada en cada uno de sus ${FOTO.length} bytes: o un resultado o ErrorDeMetadatos`, () => {
    let resultados = 0;
    for (let corte = 0; corte <= FOTO.length; corte++)
      if (resultadoOError(FOTO.subarray(0, corte))) resultados++;
    // Solo deja la foto entera un corte que cae DESPUÉS de los bytes del último elemento: en los
    // datos sin uso del final de `mdat` o en la cola. Lo demás corta algo que hace falta.
    const finDeLosDatos = Math.max(
      ...[...ilocDe(FOTO).values()].flatMap((u) =>
        u.tramos.map(([d, l]) => d + l),
      ),
    );
    expect(resultados).toBe(FOTO.length - finDeLosDatos + 1);
  });

  it("0x00 y 0xFF en cada posición: o un resultado o ErrorDeMetadatos", () => {
    for (let i = 0; i < FOTO.length; i++)
      for (const b of [0x00, 0xff]) {
        const mutado = FOTO.slice();
        mutado[i] = b;
        resultadoOError(mutado);
      }
  });
});
