// @vitest-environment node
//
// El formato por los bytes, no por el nombre.

import { describe, expect, it } from "vitest";

import {
  EXTENSION_DEL_FORMATO,
  extensionCoincide,
  formatoPorContenido,
  inicioDelPdf,
  MIME_DEL_FORMATO,
} from "@/engine/metadatos/deteccion";

const ascii = (texto: string) => new TextEncoder().encode(texto);

describe("formatoPorContenido", () => {
  it("reconoce las cuatro firmas", () => {
    expect(formatoPorContenido(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "jpeg",
    );
    expect(
      formatoPorContenido(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe("png");
    expect(formatoPorContenido(ascii("RIFF\x10\x00\x00\x00WEBPVP8L"))).toBe(
      "webp",
    );
    expect(formatoPorContenido(ascii("%PDF-1.7\n"))).toBe("pdf");
  });

  it("acepta basura antes de %PDF- dentro del primer kilobyte, y no más allá", () => {
    expect(inicioDelPdf(ascii(`${" ".repeat(500)}%PDF-1.4`))).toBe(500);
    expect(formatoPorContenido(ascii(`${" ".repeat(2_000)}%PDF-1.4`))).toBe(
      null,
    );
  });

  it("no confunde un RIFF que no es WebP, ni algo corto o vacío", () => {
    expect(formatoPorContenido(ascii("RIFF\x10\x00\x00\x00WAVEfmt "))).toBe(
      null,
    );
    expect(formatoPorContenido(new Uint8Array([0xff, 0xd8]))).toBe(null);
    expect(formatoPorContenido(new Uint8Array())).toBe(null);
    expect(formatoPorContenido(ascii("nombre,cedula\n"))).toBe(null);
  });
});

describe("extensionCoincide", () => {
  it("acepta las extensiones de cada formato, sin importar mayúsculas", () => {
    expect(extensionCoincide("foto.JPG", "jpeg")).toBe(true);
    expect(extensionCoincide("foto.jpeg", "jpeg")).toBe(true);
    expect(extensionCoincide("foto.jpe", "jpeg")).toBe(true);
    expect(extensionCoincide("dibujo.png", "png")).toBe(true);
    expect(extensionCoincide("doc.PDF", "pdf")).toBe(true);
    expect(extensionCoincide("x.webp", "webp")).toBe(true);
  });

  it("dice que no cuando la extensión miente o falta", () => {
    expect(extensionCoincide("foto.jpg", "png")).toBe(false);
    expect(extensionCoincide("sin-extension", "pdf")).toBe(false);
  });

  it("da la extensión y el tipo del archivo limpio por formato", () => {
    expect(EXTENSION_DEL_FORMATO.jpeg).toBe("jpg");
    expect(MIME_DEL_FORMATO.webp).toBe("image/webp");
  });
});
