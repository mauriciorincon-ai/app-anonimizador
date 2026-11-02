// @vitest-environment node
//
// La base de los lectores de imágenes: cada lectura comprueba que cabe ANTES de leer y, si no,
// lanza `ErrorDeMetadatos` con la clave del motivo — nunca un `RangeError`, nunca un `undefined`
// que se cuela como 0. Y el texto se decodifica con tope.

import { describe, expect, it } from "vitest";

import {
  ascii,
  BYTES_DE_TEXTO,
  coincide,
  Cursor,
  Escritor,
  fallar,
  nombreTecnico,
  textoLatin1,
  textoUtf16,
  textoUtf8Laxo,
  textoUtf8OLatin1,
  tramo,
  u16,
  u16be,
  u16le,
  u32,
  u32be,
  u32le,
  u8,
} from "../../src/engine/metadatos/lector-binario";
import { esperarError, texto } from "./metadatos-ayuda";

const B = Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe, 0xfd, 0xfc]);

describe("lecturas de enteros", () => {
  it("leen en los dos órdenes de bytes", () => {
    expect(u8(B, 0)).toBe(1);
    expect(u16be(B, 0)).toBe(0x0102);
    expect(u16le(B, 0)).toBe(0x0201);
    expect(u32be(B, 0)).toBe(0x01020304);
    expect(u32le(B, 0)).toBe(0x04030201);
    expect(u16(B, 2, true)).toBe(0x0403);
    expect(u16(B, 2, false)).toBe(0x0304);
    expect(u32(B, 4, true)).toBe(0xfcfdfeff);
    expect(u32(B, 4, false)).toBe(0xfffefdfc);
  });

  it("un u32 con el bit alto encendido es positivo (no un entero con signo)", () => {
    expect(u32be(B, 4)).toBeGreaterThan(0);
    expect(u32le(B, 4)).toBeGreaterThan(0);
  });

  it("toda lectura fuera de rango lanza ErrorDeMetadatos con el motivo pedido", () => {
    esperarError(() => u8(B, 8));
    esperarError(() => u8(B, -1));
    esperarError(() => u16be(B, 7));
    esperarError(() => u16le(B, 7));
    esperarError(() => u32be(B, 5));
    esperarError(() => u32le(B, 5));
    esperarError(() => u8(B, Number.NaN));
    esperarError(() => u8(B, 99, "pdf-ilegible"), "pdf-ilegible");
    esperarError(() => fallar());
    esperarError(() => fallar("limpieza-incompleta"), "limpieza-incompleta");
  });
});

describe("tramos y firmas", () => {
  it("un tramo es una vista que tiene que caber entera", () => {
    expect([...tramo(B, 2, 3)]).toEqual([3, 4, 0xff]);
    expect(tramo(B, 8, 0).length).toBe(0);
    esperarError(() => tramo(B, 6, 3));
    esperarError(() => tramo(B, 0, -1));
  });

  it("coincide no lanza: lo que no cabe no coincide", () => {
    expect(coincide(B, [1, 2])).toBe(true);
    expect(coincide(B, [3, 4], 2)).toBe(true);
    expect(coincide(B, [3, 5], 2)).toBe(false);
    expect(coincide(B, [0xfc, 0], 7)).toBe(false);
    expect(coincide(B, [1], -1)).toBe(false);
  });

  it("ascii y nombreTecnico", () => {
    expect([...ascii("AB\0")]).toEqual([0x41, 0x42, 0]);
    expect(nombreTecnico(ascii("XMP "))).toBe("XMP");
    expect(nombreTecnico(Uint8Array.from([0x41, 0x00, 0xff, 0x42]))).toBe(
      "A??B",
    );
  });
});

describe("Cursor", () => {
  it("avanza al leer y no se mueve cuando falla", () => {
    const c = new Cursor(B);
    expect(c.u8()).toBe(1);
    expect(c.u16be()).toBe(0x0203);
    expect(c.restantes).toBe(5);
    expect([...c.tramo(2)]).toEqual([4, 0xff]);
    c.saltar(1);
    expect(c.pos).toBe(6);
    esperarError(() => c.u32be());
    expect(c.pos).toBe(6);
    esperarError(() => c.saltar(3));
    esperarError(() => c.tramo(3));
    expect(c.u16be()).toBe(0xfdfc);
    expect(c.restantes).toBe(0);
    esperarError(() => c.u8());
  });

  it("lleva el motivo que se le dio", () => {
    esperarError(() => new Cursor(B, 8, "pdf-ilegible").u8(), "pdf-ilegible");
  });
});

describe("Escritor", () => {
  it("escribe enteros, copia tramos y reescribe un tamaño al final", () => {
    const e = new Escritor(32);
    e.u8(0x1ff);
    e.u16be(0x0102);
    e.u32be(0x03040506);
    e.u32le(0x0a0b0c0d);
    e.copiar(B, 0, 2);
    e.escribir(Uint8Array.from([9]));
    e.fijarU32le(0, 0x11223344);
    expect(e.largo).toBe(14);
    expect([...e.resultado()]).toEqual([
      0x44, 0x33, 0x22, 0x11, 0x04, 0x05, 0x06, 0x0d, 0x0c, 0x0b, 0x0a, 1, 2, 9,
    ]);
  });

  it("el resultado es una copia exacta, no el búfer de trabajo", () => {
    const e = new Escritor(8);
    e.u8(1);
    const r = e.resultado();
    expect(r.length).toBe(1);
    expect(r.buffer.byteLength).toBe(1);
  });
});

describe("texto con tope", () => {
  it("UTF-8 válido se lee como UTF-8; lo inválido cae a Latin-1", () => {
    expect(textoUtf8OLatin1(texto("Ana Pérez")).texto).toBe("Ana Pérez");
    expect(textoUtf8OLatin1(Uint8Array.from([0x50, 0xe9, 0x72])).texto).toBe(
      "Pér",
    );
  });

  it("corta en el tope sin partir un carácter y avisa el corte", () => {
    const largo = texto("é".repeat(BYTES_DE_TEXTO));
    const r = textoUtf8OLatin1(largo);
    expect(r.cortado).toBe(true);
    // Se cortó en un borde de carácter: sigue siendo UTF-8, no cayó a Latin-1.
    expect(r.texto).toMatch(/^é+$/);
    expect(r.texto.length).toBeGreaterThan(512);
    expect(textoUtf8OLatin1(texto("corto")).cortado).toBe(false);
  });

  it("Latin-1 con tope", () => {
    expect(textoLatin1(Uint8Array.from([0x41, 0xf1]))).toEqual({
      texto: "Añ",
      cortado: false,
    });
    expect(textoLatin1(new Uint8Array(10).fill(0x41), 4)).toEqual({
      texto: "AAAA",
      cortado: true,
    });
  });

  it("UTF-8 laxo reemplaza lo inválido y respeta el tope", () => {
    expect(textoUtf8Laxo(Uint8Array.from([0x41, 0xff, 0x42]), 10)).toBe("A�B");
    expect(textoUtf8Laxo(texto("abcdef"), 3)).toBe("abc");
  });

  it("UTF-16 en los dos órdenes, con el byte suelto descartado", () => {
    expect(textoUtf16(Uint8Array.from([0x41, 0, 0xf1, 0, 0x42]), true)).toEqual(
      { texto: "Añ", cortado: false },
    );
    expect(textoUtf16(Uint8Array.from([0, 0x41, 0, 0x42]), false).texto).toBe(
      "AB",
    );
    expect(textoUtf16(new Uint8Array(10), true, 4).cortado).toBe(true);
  });
});
