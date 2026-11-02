// @vitest-environment node
//
// Tests de los generadores de binarios del kit (JPEG, PNG, WebP y PDF con metadatos falsos).
//
// Estos archivos son la materia prima de la limpieza de metadatos (S6): si el kit miente sobre lo
// que escondió, el test del limpiador mide contra una mentira. Por eso aquí se comprueba lo que el
// kit PROMETE, con lectores escritos aparte de los escritores (un recorrido de marcadores JPEG, un
// lector de trozos PNG con CRC bit a bit, un lector RIFF, un lector de IFD de TIFF y un lector de
// xref de PDF):
//   · misma semilla ⇒ mismos bytes; otra semilla ⇒ otros bytes y otros centinelas;
//   · cada archivo es ESTRUCTURALMENTE válido (la prueba de que un navegador lo decodifica de verdad
//     se corrió una vez, a mano, con Chromium, `sips`, `pdf-lib` y `pdfinfo`; ver el informe del S6);
//   · cada centinela está de verdad en los bytes —salvo el del `zTXt`, que está comprimido— y NINGUNO
//     está en el contenido visible (los píxeles, la línea de texto de la página);
//   · la CLI valida: un formato o un perfil desconocido es un error, jamás un archivo en silencio.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generar } from "../../docs/kit-de-prueba/generador.mjs";
import { contieneCentinela } from "../../docs/kit-de-prueba/binarios/comun.mjs";
import { generarJpeg } from "../../docs/kit-de-prueba/binarios/jpeg.mjs";
import {
  PERFILES_PDF,
  TEXTO_DEL_PDF,
  generarPdf,
} from "../../docs/kit-de-prueba/binarios/pdf.mjs";
import { generarPng } from "../../docs/kit-de-prueba/binarios/png.mjs";
import { generarWebp } from "../../docs/kit-de-prueba/binarios/webp.mjs";

const GENERADOR = join(process.cwd(), "docs", "kit-de-prueba", "generador.mjs");
const SEMILLAS = Array.from({ length: 30 }, (_, i) => i + 1);
const PERFILES = ["simple", "con-revisiones", "cifrado", "firmado"] as const;
type PerfilPdf = (typeof PERFILES)[number];

let carpeta = "";

beforeAll(() => {
  // `tmp/` está en .gitignore: aquí nunca queda nada que pueda commitearse.
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  carpeta = mkdtempSync(join(process.cwd(), "tmp", "generador-binarios-"));
});

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

// ── Lectores independientes de los escritores ──────────────────────────────────────────────────

/** CRC-32 bit a bit: sin tabla, para no medir el escritor con su propia herramienta. */
function crc32Lento(bytes: Uint8Array): number {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

interface EntradaTiff {
  tag: number;
  tipo: number;
  cuenta: number;
  datos: Buffer;
}

const TAMANO_DE_TIPO: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  10: 8,
};

function leerIfd(tiff: Buffer, inicio: number) {
  expect(inicio % 2, "los IFD empiezan en posición par").toBe(0);
  const cuenta = tiff.readUInt16LE(inicio);
  const entradas = new Map<number, EntradaTiff>();
  let tagAnterior = -1;
  for (let i = 0; i < cuenta; i++) {
    const en = inicio + 2 + 12 * i;
    const tag = tiff.readUInt16LE(en);
    expect(
      tag,
      "las entradas van en orden ascendente de etiqueta",
    ).toBeGreaterThan(tagAnterior);
    tagAnterior = tag;
    const tipo = tiff.readUInt16LE(en + 2);
    const n = tiff.readUInt32LE(en + 4);
    const bytes = n * TAMANO_DE_TIPO[tipo];
    let datos: Buffer;
    if (bytes <= 4) {
      datos = tiff.subarray(en + 8, en + 8 + bytes);
    } else {
      const donde = tiff.readUInt32LE(en + 8);
      expect(
        donde % 2,
        "los valores fuera de la entrada van en posición par",
      ).toBe(0);
      expect(donde + bytes).toBeLessThanOrEqual(tiff.length);
      datos = tiff.subarray(donde, donde + bytes);
    }
    entradas.set(tag, { tag, tipo, cuenta: n, datos });
  }
  return {
    entradas,
    siguiente: tiff.readUInt32LE(inicio + 2 + 12 * cuenta),
  };
}

function textoDe(entradas: Map<number, EntradaTiff>, tag: number): string {
  const entrada = entradas.get(tag);
  if (!entrada) throw new Error(`falta la etiqueta 0x${tag.toString(16)}`);
  expect(entrada.tipo).toBe(2);
  expect(entrada.datos[entrada.datos.length - 1], "ASCII termina en NUL").toBe(
    0,
  );
  return entrada.datos.subarray(0, -1).toString("utf8");
}

/** Los tres racionales de G/M/S de GPS, como decimal con seis cifras. */
function gradosDecimales(entrada: EntradaTiff | undefined): number {
  if (!entrada) throw new Error("falta una coordenada");
  expect(entrada.tipo).toBe(5);
  expect(entrada.cuenta).toBe(3);
  const [g, m, s] = [0, 1, 2].map(
    (i) =>
      entrada.datos.readUInt32LE(8 * i) / entrada.datos.readUInt32LE(8 * i + 4),
  );
  return g + m / 60 + s / 3600;
}

/** Valida un TIFF de EXIF y comprueba que autoría y GPS dicen lo que el generador declaró. */
function revisarTiff(
  tiff: Buffer,
  detalle: {
    autor: string;
    cedula: string;
    latitud: string;
    longitud: string;
    serie: string;
  },
) {
  expect(tiff.subarray(0, 4)).toEqual(Buffer.from([0x49, 0x49, 0x2a, 0x00]));
  const ifd0 = leerIfd(tiff, tiff.readUInt32LE(4));
  expect(textoDe(ifd0.entradas, 0x013b)).toBe(
    `${detalle.autor} · CC ${detalle.cedula}`,
  );

  const exif = leerIfd(tiff, ifd0.entradas.get(0x8769)!.datos.readUInt32LE(0));
  expect(textoDe(exif.entradas, 0xa431)).toBe(detalle.serie);

  const gps = leerIfd(tiff, ifd0.entradas.get(0x8825)!.datos.readUInt32LE(0));
  expect(textoDe(gps.entradas, 0x0001)).toBe("N");
  expect(textoDe(gps.entradas, 0x0003)).toBe("W");
  expect(gradosDecimales(gps.entradas.get(0x0002)).toFixed(6)).toBe(
    detalle.latitud,
  );
  expect((-gradosDecimales(gps.entradas.get(0x0004))).toFixed(6)).toBe(
    detalle.longitud,
  );
  // Segundos con milésimas: el GPS «con segundos» que pide la limpieza.
  expect(gps.entradas.get(0x0002)!.datos.readUInt32LE(20)).toBe(1000);
  return { ifd0, exif, gps };
}

interface RecorridoJpeg {
  marcadores: number[];
  segmentos: { marcador: number; contenido: Buffer }[];
  /** Los bytes entrópicos del escaneo (lo que SÍ es imagen). */
  datos: Buffer;
  sobrante: Buffer;
}

/** Recorre SOI … SOS … datos … EOI y deja constancia de cada marcador. */
function recorrerJpeg(bytes: Buffer): RecorridoJpeg {
  expect(bytes.readUInt16BE(0)).toBe(0xffd8);
  const marcadores = [0xd8];
  const segmentos: RecorridoJpeg["segmentos"] = [];
  let i = 2;
  for (;;) {
    expect(bytes[i], `un marcador en ${i}`).toBe(0xff);
    const marcador = bytes[i + 1];
    marcadores.push(marcador);
    const largo = bytes.readUInt16BE(i + 2);
    segmentos.push({
      marcador,
      contenido: bytes.subarray(i + 4, i + 2 + largo),
    });
    i += 2 + largo;
    if (marcador !== 0xda) continue;

    // Datos entrópicos: todo 0xFF va seguido de 0x00 hasta el EOI (no hay marcadores de reinicio).
    let j = i;
    while (!(bytes[j] === 0xff && bytes[j + 1] === 0xd9)) {
      if (bytes[j] === 0xff) {
        expect(bytes[j + 1], `0xFF de datos sin relleno en ${j}`).toBe(0x00);
        j += 2;
      } else {
        j++;
      }
    }
    marcadores.push(0xd9);
    return {
      marcadores,
      segmentos,
      datos: bytes.subarray(i, j),
      sobrante: bytes.subarray(j + 2),
    };
  }
}

interface TrozoPng {
  tipo: string;
  datos: Buffer;
}

function leerTrozosPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const trozos: TrozoPng[] = [];
  let i = 8;
  for (;;) {
    const largo = bytes.readUInt32BE(i);
    const tipo = bytes.toString("latin1", i + 4, i + 8);
    const datos = bytes.subarray(i + 8, i + 8 + largo);
    const crc = bytes.readUInt32BE(i + 8 + largo);
    expect(crc, `CRC de ${tipo}`).toBe(
      crc32Lento(bytes.subarray(i + 4, i + 8 + largo)),
    );
    trozos.push({ tipo, datos });
    i += 12 + largo;
    if (tipo === "IEND") return { trozos, sobrante: bytes.subarray(i) };
  }
}

function leerTrozosRiff(bytes: Buffer) {
  expect(bytes.toString("latin1", 0, 4)).toBe("RIFF");
  expect(bytes.toString("latin1", 8, 12)).toBe("WEBP");
  const finDelRiff = 8 + bytes.readUInt32LE(4);
  const trozos: { tipo: string; datos: Buffer }[] = [];
  let i = 12;
  while (i < finDelRiff) {
    const tipo = bytes.toString("latin1", i, i + 4);
    const largo = bytes.readUInt32LE(i + 4);
    trozos.push({ tipo, datos: bytes.subarray(i + 8, i + 8 + largo) });
    i += 8 + largo + (largo & 1);
  }
  expect(i, "los trozos llenan el RIFF exactamente").toBe(finDelRiff);
  return { trozos, finDelRiff, sobrante: bytes.subarray(finDelRiff) };
}

interface EntradaXref {
  numero: number;
  generacion: number;
  libre: boolean;
  campo: number;
}

/** Lee la tabla xref que empieza en `desplazamiento` y la comprueba entrada por entrada. */
function leerXref(texto: string, desplazamiento: number) {
  expect(texto.startsWith("xref\n", desplazamiento)).toBe(true);
  let posicion = desplazamiento + 5;
  const entradas: EntradaXref[] = [];
  while (!texto.startsWith("trailer", posicion)) {
    const subseccion = /^(\d+) (\d+)\n/.exec(
      texto.slice(posicion, posicion + 32),
    );
    if (!subseccion) throw new Error(`subsección xref ilegible en ${posicion}`);
    const inicio = Number(subseccion[1]);
    const cuenta = Number(subseccion[2]);
    posicion += subseccion[0].length;
    for (let i = 0; i < cuenta; i++) {
      const linea = texto.slice(posicion, posicion + 20);
      expect(linea, "20 bytes exactos por entrada").toMatch(
        /^\d{10} \d{5} [nf] \n$/,
      );
      entradas.push({
        numero: inicio + i,
        campo: Number(linea.slice(0, 10)),
        generacion: Number(linea.slice(11, 16)),
        libre: linea[17] === "f",
      });
      posicion += 20;
    }
  }
  const trailer = /^trailer\n(<<[^\n]*>>)\nstartxref\n(\d+)\n%%EOF\n/.exec(
    texto.slice(posicion),
  );
  if (!trailer) throw new Error("trailer ilegible");
  return { entradas, diccionario: trailer[1], startxref: Number(trailer[2]) };
}

/** Cada entrada en uso apunta a «N G obj»: la prueba de que los desplazamientos son exactos. */
function comprobarDesplazamientos(texto: string, entradas: EntradaXref[]) {
  for (const e of entradas.filter((x) => !x.libre)) {
    expect(
      texto.startsWith(`${e.numero} ${e.generacion} obj\n`, e.campo),
      `el objeto ${e.numero} está en ${e.campo}`,
    ).toBe(true);
  }
}

// ── Comprobaciones compartidas ─────────────────────────────────────────────────────────────────

function revisarCentinelas(centinelas: string[], minimo = 15) {
  expect(centinelas.length).toBeGreaterThanOrEqual(minimo);
  expect(new Set(centinelas).size, "sin repetidos").toBe(centinelas.length);
  for (const c of centinelas) expect(c.length, c).toBeGreaterThanOrEqual(6);
}

function noEstaEn(contenido: Buffer, centinelas: string[]) {
  for (const c of centinelas) {
    expect(
      contieneCentinela(contenido, c),
      `«${c}» no debe estar en el contenido`,
    ).toBe(false);
  }
}

function sha256DeBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

// ── JPEG ───────────────────────────────────────────────────────────────────────────────────────

describe("JPEG", () => {
  const { bytes, centinelas, detalle } = generarJpeg({ semilla: 42 });

  it("misma semilla ⇒ mismos bytes y mismos centinelas; otra semilla ⇒ otros", () => {
    const otra = generarJpeg({ semilla: 42 });
    expect(otra.bytes.equals(bytes)).toBe(true);
    expect(otra.centinelas).toEqual(centinelas);
    const distinta = generarJpeg({ semilla: 43 });
    expect(distinta.bytes.equals(bytes)).toBe(false);
    expect(distinta.centinelas).not.toEqual(centinelas);
    // Los identificadores no se repiten entre semillas.
    const uuids = (lista: string[]) =>
      lista.filter((c) => c.startsWith("uuid:"));
    expect(uuids(distinta.centinelas)).not.toEqual(uuids(centinelas));
  });

  it("es un JPEG de línea base completo: SOI, JFIF, EXIF, XMP, IPTC, COM, DQT, SOF0, DHT, SOS, EOI", () => {
    const r = recorrerJpeg(bytes);
    expect(r.marcadores).toEqual([
      0xd8, 0xe0, 0xe1, 0xe1, 0xed, 0xfe, 0xdb, 0xc0, 0xc4, 0xda, 0xd9,
    ]);
    const sof = r.segmentos.find((s) => s.marcador === 0xc0)!.contenido;
    expect(sof[0]).toBe(8);
    expect(sof.readUInt16BE(1)).toBe(48); // alto
    expect(sof.readUInt16BE(3)).toBe(64); // ancho
    expect(sof[5]).toBe(3);
    // 4 tablas de Huffman: DC/AC de luminancia y de crominancia.
    const dht = r.segmentos.find((s) => s.marcador === 0xc4)!.contenido;
    expect([...dht.subarray(0, 1)]).toEqual([0x00]);
    expect(r.datos.length).toBeGreaterThan(0);
    expect(r.segmentos[0].contenido.toString("latin1", 0, 5)).toBe("JFIF\0");
  });

  it("deja sobrante después del EOI, con la marca reconocible", () => {
    const r = recorrerJpeg(bytes);
    expect(r.sobrante.toString("latin1")).toMatch(
      /^RESTO-DE-EDICION-[0-9a-f]{8}\n$/,
    );
  });

  it("el EXIF es un TIFF válido con autoría, serie, GPS con segundos y una miniatura JPEG", () => {
    const r = recorrerJpeg(bytes);
    const app1 = r.segmentos.find(
      (s) =>
        s.marcador === 0xe1 &&
        s.contenido.toString("latin1", 0, 6) === "Exif\0\0",
    )!;
    const tiff = app1.contenido.subarray(6);
    const { ifd0 } = revisarTiff(tiff, detalle);
    expect(ifd0.entradas.get(0x0112)!.datos.readUInt16LE(0)).toBe(6);
    expect(textoDe(ifd0.entradas, 0x010e)).toBe(
      `Punto de control ${detalle.latitud},${detalle.longitud}`,
    );
    // IFD1: la miniatura, un JPEG completo (SOI … EOI) que el recorrido también acepta.
    const ifd1 = leerIfd(tiff, ifd0.siguiente);
    const inicio = ifd1.entradas.get(0x0201)!.datos.readUInt32LE(0);
    const largo = ifd1.entradas.get(0x0202)!.datos.readUInt32LE(0);
    const miniatura = tiff.subarray(inicio, inicio + largo);
    expect(inicio + largo).toBe(tiff.length);
    expect(recorrerJpeg(miniatura).marcadores).toEqual([
      0xd8, 0xdb, 0xc0, 0xc4, 0xda, 0xd9,
    ]);
    expect(miniatura.readUInt16BE(miniatura.length - 2)).toBe(0xffd9);
  });

  it("el XMP y el IPTC llevan la autoría y la ubicación", () => {
    const r = recorrerJpeg(bytes);
    const xmp = r.segmentos
      .find(
        (s) =>
          s.marcador === 0xe1 &&
          s.contenido.toString("latin1", 0, 28) ===
            "http://ns.adobe.com/xap/1.0/",
      )!
      .contenido.toString("utf8");
    expect(xmp).toContain("<dc:creator>");
    expect(xmp).toMatch(/xmpMM:DocumentID="uuid:[0-9a-f-]{36}"/);
    expect(xmp).toContain("<photoshop:City>");
    expect(xmp).toContain("<exif:GPSLatitude>");

    const app13 = r.segmentos.find((s) => s.marcador === 0xed)!.contenido;
    expect(app13.toString("latin1", 0, 14)).toBe("Photoshop 3.0\0");
    expect(app13.toString("latin1", 14, 18)).toBe("8BIM");
    expect(app13.readUInt16BE(18)).toBe(0x0404);
    expect(app13.toString("utf8")).toContain(detalle.autor); // By-line (2:80)
  });

  it("los centinelas están en los bytes y NINGUNO en los datos de la imagen", () => {
    revisarCentinelas(centinelas);
    for (const c of centinelas) {
      expect(contieneCentinela(bytes, c), `«${c}» está en los bytes`).toBe(
        true,
      );
    }
    noEstaEn(recorrerJpeg(bytes).datos, centinelas);
  });

  it("incluye coordenadas decimales con seis cifras y la cédula entre los centinelas", () => {
    expect(centinelas).toContain(detalle.latitud);
    expect(centinelas).toContain(detalle.longitud);
    expect(detalle.latitud).toMatch(/^\d+\.\d{6}$/);
    expect(detalle.longitud).toMatch(/^-\d+\.\d{6}$/);
    expect(centinelas).toContain(detalle.cedula);
    expect(centinelas).toContain(`${detalle.autor} · CC ${detalle.cedula}`);
  });

  it("las coordenadas caen dentro de Colombia en 30 semillas", () => {
    for (const semilla of SEMILLAS) {
      const { latitud, longitud } = generarJpeg({ semilla }).detalle;
      expect(Number(latitud)).toBeGreaterThan(-4.3);
      expect(Number(latitud)).toBeLessThan(13.5);
      expect(Number(longitud)).toBeGreaterThan(-79.1);
      expect(Number(longitud)).toBeLessThan(-66.8);
    }
  });

  it("30 semillas y tamaños que no son múltiplo de 8: siempre estructura válida y centinelas limpios", () => {
    for (const semilla of SEMILLAS) {
      const ancho = 8 + (semilla % 7) * 5;
      const alto = 8 + (semilla % 5) * 7;
      const r = generarJpeg({ semilla, ancho, alto, orientacion: 1 });
      const recorrido = recorrerJpeg(r.bytes);
      const sof = recorrido.segmentos.find(
        (s) => s.marcador === 0xc0,
      )!.contenido;
      expect([sof.readUInt16BE(3), sof.readUInt16BE(1)]).toEqual([ancho, alto]);
      revisarCentinelas(r.centinelas);
      for (const c of r.centinelas)
        expect(contieneCentinela(r.bytes, c)).toBe(true);
      noEstaEn(recorrido.datos, r.centinelas);
    }
  });

  it("rechaza dimensiones imposibles", () => {
    expect(() => generarJpeg({ semilla: 1, ancho: 0 })).toThrow(/dimensiones/);
    expect(() => generarJpeg({ semilla: 1, alto: 5000 })).toThrow(
      /dimensiones/,
    );
  });
});

// ── PNG ────────────────────────────────────────────────────────────────────────────────────────

describe("PNG", () => {
  const { bytes, centinelas, detalle } = generarPng({ semilla: 42 });

  it("misma semilla ⇒ mismos bytes y mismos centinelas; otra semilla ⇒ otros", () => {
    expect(generarPng({ semilla: 42 }).bytes.equals(bytes)).toBe(true);
    expect(generarPng({ semilla: 42 }).centinelas).toEqual(centinelas);
    const distinta = generarPng({ semilla: 43 });
    expect(distinta.bytes.equals(bytes)).toBe(false);
    expect(distinta.centinelas).not.toEqual(centinelas);
  });

  it("tiene los trozos de la imagen y los de metadatos, en orden, con el CRC correcto", () => {
    const { trozos } = leerTrozosPng(bytes);
    expect(trozos.map((t) => t.tipo)).toEqual([
      "IHDR",
      "pHYs",
      "tIME",
      "eXIf",
      "tEXt",
      "tEXt",
      "tEXt",
      "tEXt",
      "iTXt",
      "zTXt",
      "IDAT",
      "IEND",
    ]);
    const ihdr = trozos[0].datos;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([64, 48]);
    expect([...ihdr.subarray(8)]).toEqual([8, 2, 0, 0, 0]);
    expect(trozos.at(-1)!.datos.length).toBe(0);
  });

  it("el IDAT se infla a (1 + 3·ancho)·alto bytes, con filtro 0 en cada fila", () => {
    const { trozos } = leerTrozosPng(bytes);
    const crudo = inflateSync(trozos.find((t) => t.tipo === "IDAT")!.datos);
    expect(crudo.length).toBe((1 + 3 * 64) * 48);
    for (let fila = 0; fila < 48; fila++)
      expect(crudo[fila * (1 + 3 * 64)]).toBe(0);
    // Cuatro bandas distintas: el primer píxel de cada fila de bloques.
    const colores = new Set<string>();
    for (let fila = 0; fila < 48; fila += 8) {
      colores.add(
        crudo.subarray(fila * 193 + 1, fila * 193 + 4).toString("hex"),
      );
    }
    expect(colores.size).toBe(4);
  });

  it("deja sobrante después de IEND, con la marca reconocible", () => {
    const { sobrante } = leerTrozosPng(bytes);
    expect(sobrante.toString("latin1")).toMatch(
      /^RESTO-DE-EDICION-[0-9a-f]{8}\n$/,
    );
  });

  it("el eXIf es un TIFF válido con autoría y GPS", () => {
    const { trozos } = leerTrozosPng(bytes);
    revisarTiff(trozos.find((t) => t.tipo === "eXIf")!.datos, detalle);
  });

  it("los centinelas están en los bytes (el del zTXt, tras inflarlo) y NINGUNO en los píxeles", () => {
    revisarCentinelas(centinelas);
    const { trozos } = leerTrozosPng(bytes);
    // zTXt: clave, NUL, método, flujo zlib.
    const z = trozos.find((t) => t.tipo === "zTXt")!.datos;
    const clave = z.indexOf(0);
    expect(z.toString("latin1", 0, clave)).toBe("Description");
    expect(z[clave + 1]).toBe(0);
    const descomprimido = inflateSync(z.subarray(clave + 2));

    const enClaro = centinelas.filter((c) => contieneCentinela(bytes, c));
    const ocultos = centinelas.filter((c) => !contieneCentinela(bytes, c));
    expect(ocultos, "solo el del zTXt está comprimido").toHaveLength(1);
    expect(contieneCentinela(descomprimido, ocultos[0])).toBe(true);
    expect(enClaro.length + ocultos.length).toBe(centinelas.length);

    const idat = trozos.find((t) => t.tipo === "IDAT")!.datos;
    noEstaEn(idat, centinelas);
    noEstaEn(inflateSync(idat), centinelas);
  });

  it("el tEXt lleva Author y Comment, y el iTXt el paquete XMP", () => {
    const { trozos } = leerTrozosPng(bytes);
    const claves = trozos
      .filter((t) => t.tipo === "tEXt")
      .map((t) => t.datos.toString("latin1", 0, t.datos.indexOf(0)));
    expect(claves).toEqual(["Author", "Comment", "Software", "Creation Time"]);
    const itxt = trozos.find((t) => t.tipo === "iTXt")!.datos;
    expect(itxt.toString("latin1", 0, 17)).toBe("XML:com.adobe.xmp");
    expect(itxt.toString("utf8")).toContain("<dc:creator>");
    expect(centinelas).toContain(detalle.autor);
  });

  it("30 semillas y tamaños que no son múltiplo de 8: siempre estructura válida y centinelas limpios", () => {
    for (const semilla of SEMILLAS) {
      const ancho = 5 + (semilla % 9) * 6;
      const alto = 9 + (semilla % 4) * 11;
      const r = generarPng({ semilla, ancho, alto });
      const { trozos } = leerTrozosPng(r.bytes);
      const idat = trozos.find((t) => t.tipo === "IDAT")!.datos;
      expect(inflateSync(idat).length).toBe((1 + 3 * ancho) * alto);
      revisarCentinelas(r.centinelas);
      noEstaEn(idat, r.centinelas);
      noEstaEn(inflateSync(idat), r.centinelas);
    }
  });
});

// ── WebP ───────────────────────────────────────────────────────────────────────────────────────

describe("WebP", () => {
  const { bytes, centinelas, detalle } = generarWebp({ semilla: 42 });

  it("misma semilla ⇒ mismos bytes y mismos centinelas; otra semilla ⇒ otros", () => {
    expect(generarWebp({ semilla: 42 }).bytes.equals(bytes)).toBe(true);
    expect(generarWebp({ semilla: 42 }).centinelas).toEqual(centinelas);
    const distinta = generarWebp({ semilla: 43 });
    expect(distinta.bytes.equals(bytes)).toBe(false);
    expect(distinta.centinelas).not.toEqual(centinelas);
  });

  it("el tamaño del RIFF es exacto y los trozos van VP8X, VP8L, EXIF, XMP con relleno par", () => {
    const { trozos, finDelRiff, sobrante } = leerTrozosRiff(bytes);
    expect(trozos.map((t) => t.tipo)).toEqual(["VP8X", "VP8L", "EXIF", "XMP "]);
    expect(finDelRiff + sobrante.length).toBe(bytes.length);
    expect(finDelRiff % 2, "el RIFF termina en posición par").toBe(0);
    expect(sobrante.toString("latin1")).toMatch(
      /^RESTO-DE-EDICION-[0-9a-f]{8}\n$/,
    );
  });

  it("VP8X anuncia EXIF y XMP y el lienzo; VP8L trae su cabecera con las mismas dimensiones", () => {
    const { trozos } = leerTrozosRiff(bytes);
    const vp8x = trozos[0].datos;
    expect(vp8x[0]).toBe(0x08 | 0x04);
    expect(vp8x.readUIntLE(4, 3) + 1).toBe(64);
    expect(vp8x.readUIntLE(7, 3) + 1).toBe(48);

    const vp8l = trozos[1].datos;
    expect(vp8l[0], "firma de VP8L").toBe(0x2f);
    const cabecera = vp8l.readUInt32LE(1);
    expect((cabecera & 0x3fff) + 1).toBe(64);
    expect(((cabecera >>> 14) & 0x3fff) + 1).toBe(48);
    expect((cabecera >>> 28) & 1, "alpha_is_used").toBe(0);
    expect(cabecera >>> 29, "versión").toBe(0);
    // Sin transformación, sin caché de color, sin meta-prefijos y cinco códigos de un símbolo:
    // 3 + 4·11 + 4 = 51 bits ⇒ 7 bytes tras la cabecera de 4.
    expect(vp8l.length).toBe(1 + 4 + 7);
  });

  it("el EXIF es un TIFF válido con autoría y GPS", () => {
    const { trozos } = leerTrozosRiff(bytes);
    revisarTiff(trozos.find((t) => t.tipo === "EXIF")!.datos, detalle);
  });

  it("los centinelas están en los bytes y NINGUNO en los datos de la imagen", () => {
    revisarCentinelas(centinelas);
    for (const c of centinelas) {
      expect(contieneCentinela(bytes, c), `«${c}» está en los bytes`).toBe(
        true,
      );
    }
    const { trozos } = leerTrozosRiff(bytes);
    noEstaEn(trozos.find((t) => t.tipo === "VP8L")!.datos, centinelas);
  });

  it("30 semillas y tamaños: el RIFF siempre cuadra y los centinelas están", () => {
    for (const semilla of SEMILLAS) {
      const r = generarWebp({
        semilla,
        ancho: 1 + semilla * 3,
        alto: 1 + semilla * 2,
      });
      const { trozos, finDelRiff, sobrante } = leerTrozosRiff(r.bytes);
      expect(finDelRiff + sobrante.length).toBe(r.bytes.length);
      revisarCentinelas(r.centinelas);
      for (const c of r.centinelas)
        expect(contieneCentinela(r.bytes, c)).toBe(true);
      noEstaEn(trozos.find((t) => t.tipo === "VP8L")!.datos, r.centinelas);
    }
  });

  it("rechaza dimensiones que VP8L no puede escribir", () => {
    expect(() => generarWebp({ semilla: 1, ancho: 16385 })).toThrow(
      /dimensiones/,
    );
  });
});

// ── PDF ────────────────────────────────────────────────────────────────────────────────────────

describe("PDF", () => {
  it("expone los perfiles que la CLI acepta", () => {
    expect([...PERFILES_PDF]).toEqual([...PERFILES]);
  });

  it.each(PERFILES)(
    "%s: misma semilla ⇒ mismos bytes; otra semilla ⇒ otros bytes y centinelas",
    (perfil) => {
      const a = generarPdf({ semilla: 42, perfil });
      expect(generarPdf({ semilla: 42, perfil }).bytes.equals(a.bytes)).toBe(
        true,
      );
      expect(generarPdf({ semilla: 42, perfil }).centinelas).toEqual(
        a.centinelas,
      );
      const b = generarPdf({ semilla: 43, perfil });
      expect(b.bytes.equals(a.bytes)).toBe(false);
      expect(b.centinelas).not.toEqual(a.centinelas);
    },
  );

  it("el perfil por omisión es con-revisiones y uno desconocido es un error", () => {
    expect(
      generarPdf({ semilla: 5 }).bytes.equals(
        generarPdf({ semilla: 5, perfil: "con-revisiones" }).bytes,
      ),
    ).toBe(true);
    expect(() =>
      generarPdf({ semilla: 5, perfil: "otro" as PerfilPdf }),
    ).toThrow(/perfil desconocido/);
  });

  it.each([
    ["simple", 1],
    ["con-revisiones", 2],
    ["cifrado", 1],
    ["firmado", 1],
  ] as const)(
    "%s: %i marca(s) %%%%EOF y una página con el texto visible",
    (perfil, marcas) => {
      const { bytes } = generarPdf({ semilla: 42, perfil });
      const texto = bytes.toString("latin1");
      expect(texto.startsWith("%PDF-1.7\n%")).toBe(true);
      expect(texto.split("%%EOF").length - 1).toBe(marcas);
      expect(texto.endsWith("%%EOF\n")).toBe(true);
      expect(texto).toContain(`(${TEXTO_DEL_PDF}) Tj`);
    },
  );

  it("simple: una tabla xref con desplazamientos exactos y solo Info", () => {
    const { bytes } = generarPdf({ semilla: 42, perfil: "simple" });
    const texto = bytes.toString("latin1");
    const inicio = Number(/startxref\n(\d+)\n/.exec(texto)![1]);
    const xref = leerXref(texto, inicio);
    expect(xref.startxref).toBe(inicio);
    expect(xref.entradas.map((e) => e.numero)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(xref.entradas[0]).toMatchObject({ libre: true, generacion: 65535 });
    comprobarDesplazamientos(texto, xref.entradas);
    expect(xref.diccionario).not.toContain("/Prev");
    expect(xref.diccionario).toContain("/Size 7");
    expect(texto).not.toContain("/Metadata");
    expect(texto).toContain("/Author (");
  });

  it("con-revisiones: dos xref exactas encadenadas con /Prev, un objeto liberado y /ID [<A> <B>]", () => {
    const { bytes, detalle } = generarPdf({
      semilla: 42,
      perfil: "con-revisiones",
    });
    const texto = bytes.toString("latin1");

    // La última startxref apunta a la tabla de la revisión 2…
    const todas = [...texto.matchAll(/startxref\n(\d+)\n%%EOF\n/g)].map((m) =>
      Number(m[1]),
    );
    expect(todas).toHaveLength(2);
    const rev2 = leerXref(texto, todas[1]);
    // …cuyo /Prev apunta a la tabla de la revisión 1.
    const prev = Number(/\/Prev (\d+)/.exec(rev2.diccionario)![1]);
    expect(prev).toBe(todas[0]);
    const rev1 = leerXref(texto, prev);
    expect(rev1.diccionario).not.toContain("/Prev");

    comprobarDesplazamientos(texto, rev1.entradas);
    comprobarDesplazamientos(texto, rev2.entradas);
    expect(rev1.entradas.map((e) => e.numero)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    // La revisión 2 reescribe el Catálogo (1), el Info (6) y el XMP (7), y libera el 9.
    const enUso = rev2.entradas.filter((e) => !e.libre).map((e) => e.numero);
    expect(enUso).toEqual([1, 6, 7]);
    expect(rev2.entradas.filter((e) => e.libre)).toEqual([
      { numero: 0, campo: 9, generacion: 65535, libre: true },
      { numero: 9, campo: 0, generacion: 1, libre: true },
    ]);
    // Los objetos nuevos viven DESPUÉS de la primera revisión.
    for (const e of rev2.entradas.filter((x) => !x.libre))
      expect(e.campo).toBeGreaterThan(todas[0]);

    const ids = (d: string) =>
      /\/ID \[<([0-9a-f]{32})> <([0-9a-f]{32})>\]/.exec(d)!.slice(1);
    const [a1, b1] = ids(rev1.diccionario);
    const [a2, b2] = ids(rev2.diccionario);
    expect(a1).toBe(b1);
    expect(a2).toBe(a1);
    expect(b2).not.toBe(a2);

    // El Author de la revisión 1 SIGUE en los bytes aunque la 2 lo reemplace.
    const autor1 = `${detalle.autor} - CC ${detalle.cedula}`;
    expect(texto).toContain(`/Author (${autor1})`);
    expect(texto.indexOf(autor1)).toBeLessThan(todas[0]);
    expect(detalle.autorDeLaRevisionDos).toBeTruthy();
    expect(
      texto.lastIndexOf(`/Author (${detalle.autorDeLaRevisionDos}`),
    ).toBeGreaterThan(todas[0]);
  });

  it("con-revisiones: Info, XMP, PieceInfo, Thumb, anotación y comentario retirado", () => {
    const texto = generarPdf({
      semilla: 42,
      perfil: "con-revisiones",
    }).bytes.toString("latin1");
    for (const parte of [
      "/Type /Metadata /Subtype /XML",
      "<dc:creator>",
      "xmpMM:DocumentID=",
      "/PieceInfo <<",
      "/Thumb 10 0 R",
      "/Subtype /Text",
      "/Contents (Comentario retirado ",
      "/Producer (",
    ]) {
      expect(texto, parte).toContain(parte);
    }
    // /Length de cada flujo es exacto.
    for (const m of texto.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const inicio = m.index! + m[0].length;
      expect(texto.startsWith("\nendstream", inicio + Number(m[1]))).toBe(true);
    }
  });

  it("cifrado: el trailer apunta a un diccionario /Encrypt que existe", () => {
    const { bytes } = generarPdf({ semilla: 42, perfil: "cifrado" });
    const texto = bytes.toString("latin1");
    const xref = leerXref(texto, Number(/startxref\n(\d+)\n/.exec(texto)![1]));
    comprobarDesplazamientos(texto, xref.entradas);
    const numero = Number(/\/Encrypt (\d+) 0 R/.exec(xref.diccionario)![1]);
    const objeto = xref.entradas.find((e) => e.numero === numero)!;
    expect(
      texto.startsWith(
        `${numero} 0 obj\n<< /Filter /Standard /V 2 /R 3`,
        objeto.campo,
      ),
    ).toBe(true);
    expect(xref.diccionario).toMatch(/\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/);
  });

  it("firmado: campo /FT /Sig, /V con ByteRange exacto y /Contents de ceros", () => {
    const { bytes } = generarPdf({ semilla: 42, perfil: "firmado" });
    const texto = bytes.toString("latin1");
    const xref = leerXref(texto, Number(/startxref\n(\d+)\n/.exec(texto)![1]));
    comprobarDesplazamientos(texto, xref.entradas);

    expect(texto).toContain("/AcroForm << /Fields [7 0 R] /SigFlags 3 >>");
    expect(texto).toMatch(/\/FT \/Sig [^>]*\/V 8 0 R/);
    expect(texto).toMatch(/8 0 obj\n<< \/Type \/Sig /);

    const rango = /\/ByteRange \[0 (\d+) +(\d+) +(\d+) +\]/.exec(texto);
    if (!rango) throw new Error("falta el ByteRange");
    const [, primero, segundoInicio, segundoLargo] = rango.map(Number);
    // El primer rango termina justo antes del «<» de /Contents; el segundo empieza justo después del «>»…
    expect(texto[primero]).toBe("<");
    expect(texto.slice(0, primero).endsWith("/Contents ")).toBe(true);
    const cierre = texto.indexOf(">", primero);
    expect(segundoInicio).toBe(cierre + 1);
    // …y llega hasta el último byte del archivo.
    expect(segundoInicio + segundoLargo).toBe(bytes.length);
    // Lo que queda entre los dos rangos es el valor de /Contents: solo ceros hexadecimales.
    expect(texto.slice(primero + 1, cierre)).toMatch(/^0{4096}$/);
  });

  it("los centinelas están en los bytes y NINGUNO en el contenido de la página, en todos los perfiles", () => {
    for (const perfil of PERFILES) {
      for (const semilla of SEMILLAS) {
        const { bytes, centinelas } = generarPdf({ semilla, perfil });
        revisarCentinelas(centinelas, perfil === "con-revisiones" ? 20 : 8);
        for (const c of centinelas) {
          expect(
            contieneCentinela(bytes, c),
            `«${c}» (${perfil} s${semilla}) está en los bytes`,
          ).toBe(true);
        }
        noEstaEn(Buffer.from(TEXTO_DEL_PDF, "latin1"), centinelas);
      }
    }
  });

  it("los centinelas son lo que HAY: ninguno de otro perfil se cuela", () => {
    const simple = generarPdf({ semilla: 42, perfil: "simple" }).centinelas;
    const revisiones = generarPdf({
      semilla: 42,
      perfil: "con-revisiones",
    }).centinelas;
    // La ruta de origen y el comentario retirado solo existen en con-revisiones.
    expect(simple.some((c) => c.startsWith("/Users/"))).toBe(false);
    expect(revisiones.some((c) => c.startsWith("/Users/"))).toBe(true);
    expect(revisiones.some((c) => c.startsWith("Comentario retirado"))).toBe(
      true,
    );
    expect(simple.some((c) => c.startsWith("Comentario retirado"))).toBe(false);
  });
});

// ── La CLI ─────────────────────────────────────────────────────────────────────────────────────

describe("la CLI", () => {
  function correr(argumentos: string[], cwd = process.cwd()) {
    return spawnSync(process.execPath, [GENERADOR, ...argumentos], {
      cwd,
      encoding: "utf8",
    });
  }

  it.each([
    ["jpeg", () => generarJpeg({ semilla: 42 })],
    ["png", () => generarPng({ semilla: 42 })],
    ["webp", () => generarWebp({ semilla: 42 })],
    ["pdf", () => generarPdf({ semilla: 42 })],
  ] as const)(
    "--formato %s escribe el mismo archivo que la función, su sha-256 y los centinelas",
    (formato, referencia) => {
      const salida = join(carpeta, `cli.${formato}`);
      const centinelas = join(carpeta, `cli.${formato}.centinelas.json`);
      const resultado = correr([
        "--formato",
        formato,
        "--seed",
        "42",
        "--salida",
        salida,
        "--centinelas",
        centinelas,
      ]);
      expect(resultado.status, resultado.stderr).toBe(0);

      const esperado = referencia();
      const escrito = readFileSync(salida);
      expect(escrito.equals(esperado.bytes)).toBe(true);
      expect(/sha-256 : ([0-9a-f]{64})/.exec(resultado.stdout)?.[1]).toBe(
        sha256DeBytes(escrito),
      );
      expect(JSON.parse(readFileSync(centinelas, "utf8"))).toEqual(
        esperado.centinelas,
      );
      expect(resultado.stdout).toContain(
        `${esperado.centinelas.length} cadenas`,
      );
    },
  );

  it("la API generar() despacha los binarios y devuelve el contrato de siempre", async () => {
    const salida = join(carpeta, "api.jpg");
    const { sha256, columnas, centinelas } = await generar({
      formato: "jpeg",
      seed: 7,
      salida,
    });
    expect(columnas).toEqual([]);
    expect(sha256).toBe(sha256DeBytes(readFileSync(salida)));
    expect(centinelas).toEqual(generarJpeg({ semilla: 7 }).centinelas);
  });

  it("--perfil elige el perfil del PDF", () => {
    for (const perfil of PERFILES) {
      const salida = join(carpeta, `perfil-${perfil}.pdf`);
      const resultado = correr([
        "--formato",
        "pdf",
        "--perfil",
        perfil,
        "--seed",
        "3",
        "--salida",
        salida,
      ]);
      expect(resultado.status, resultado.stderr).toBe(0);
      expect(resultado.stdout).toContain(`perfil ${perfil}`);
      expect(
        readFileSync(salida).equals(generarPdf({ semilla: 3, perfil }).bytes),
      ).toBe(true);
    }
  });

  it("sin --salida escribe bajo tmp/kit-de-prueba/ del directorio de trabajo, con extensión propia", () => {
    const resultado = correr(["--formato", "jpeg", "--seed", "5"], carpeta);
    expect(resultado.status, resultado.stderr).toBe(0);
    expect(
      existsSync(join(carpeta, "tmp", "kit-de-prueba", "foto-s5.jpg")),
    ).toBe(true);
    const pdf = correr(["--formato", "pdf", "--seed", "5"], carpeta);
    expect(pdf.status, pdf.stderr).toBe(0);
    expect(
      existsSync(
        join(
          carpeta,
          "tmp",
          "kit-de-prueba",
          "documento-con-revisiones-s5.pdf",
        ),
      ),
    ).toBe(true);
  });

  it("un `--` suelto delante (pnpm kit:generar -- …) no descuadra los argumentos", () => {
    const salida = join(carpeta, "con-guion.png");
    const resultado = correr([
      "--",
      "--formato",
      "png",
      "--seed",
      "42",
      "--salida",
      salida,
    ]);
    expect(resultado.status, resultado.stderr).toBe(0);
    expect(readFileSync(salida).equals(generarPng({ semilla: 42 }).bytes)).toBe(
      true,
    );
  });

  it("un perfil de PDF desconocido termina con código 1, lo dice y no escribe nada", () => {
    const salida = join(carpeta, "perfil-malo.pdf");
    const resultado = correr([
      "--formato",
      "pdf",
      "--perfil",
      "inventado",
      "--salida",
      salida,
    ]);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("perfil desconocido");
    expect(resultado.stderr).toContain("con-revisiones");
    expect(existsSync(salida)).toBe(false);
  });

  it("un perfil tabular pedido para un PDF o una imagen termina con código 1", () => {
    const pdf = correr([
      "--formato",
      "pdf",
      "--perfil",
      "clinico",
      "--salida",
      join(carpeta, "clinico.pdf"),
    ]);
    expect(pdf.status).toBe(1);
    expect(pdf.stderr).toContain("perfil desconocido");

    const imagen = join(carpeta, "con-perfil.png");
    const resultado = correr([
      "--formato",
      "png",
      "--perfil",
      "simple",
      "--salida",
      imagen,
    ]);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("no tiene perfiles");
    expect(existsSync(imagen)).toBe(false);
  });

  it("un formato desconocido sigue siendo un error y ahora nombra también los binarios", () => {
    const salida = join(carpeta, "yaml.out");
    const resultado = correr(["--formato", "tiff", "--salida", salida]);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("formato desconocido");
    expect(resultado.stderr).toMatch(/pdf, jpeg, png, webp/);
    expect(existsSync(salida)).toBe(false);
  });

  it("--centinelas con un formato tabular termina con código 1", () => {
    const salida = join(carpeta, "tabla.csv");
    const resultado = correr([
      "--formato",
      "csv",
      "--filas",
      "5",
      "--salida",
      salida,
      "--centinelas",
      join(carpeta, "x.json"),
    ]);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("--centinelas solo aplica");
    expect(existsSync(salida)).toBe(false);
  });
});
