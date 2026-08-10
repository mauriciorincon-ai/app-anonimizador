// La huella del archivo tiene que ser LA huella del archivo.
//
// El reporte de Velo dice "este diagnóstico corresponde al archivo con este SHA-256". Esa frase
// solo vale si el usuario puede correr `sha256sum` sobre su archivo y ver el mismo texto. Por eso
// la implementación no se prueba contra sí misma: se confronta con `crypto.subtle.digest` —la del
// navegador, la que nadie discute— y con los vectores publicados en el propio FIPS 180-4.

import { describe, expect, it } from "vitest";

import { Sha256, sha256 } from "@/lib/sha256";

const utf8 = (texto: string) => new TextEncoder().encode(texto);

async function nativo(datos: Uint8Array): Promise<string> {
  const resumen = await crypto.subtle.digest("SHA-256", datos as BufferSource);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** PRNG con semilla: los datos de prueba también son reproducibles (regla del kit). */
function bytesSeeded(cantidad: number, semilla: number): Uint8Array {
  const salida = new Uint8Array(cantidad);
  let estado = semilla >>> 0;
  for (let i = 0; i < cantidad; i++) {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    salida[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
  }
  return salida;
}

describe("vectores publicados en FIPS 180-4", () => {
  it('"abc"', () => {
    expect(sha256(utf8("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("cadena vacía", () => {
    expect(sha256(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("dos bloques (448 bits de mensaje)", () => {
    expect(
      sha256(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });
});

describe("coincide con crypto.subtle.digest", () => {
  // Las fronteras del relleno de §5.1.1 son donde se rompen las implementaciones caseras: con 55
  // bytes la longitud cabe en el mismo bloque, con 56 ya no y hay que añadir uno entero.
  const FRONTERAS = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129];

  for (const tamano of FRONTERAS) {
    it(`${tamano} bytes`, async () => {
      const datos = bytesSeeded(tamano, 42 + tamano);
      expect(sha256(datos)).toBe(await nativo(datos));
    });
  }

  it("un archivo grande, de un solo golpe", async () => {
    const datos = bytesSeeded(300_000, 7);
    expect(sha256(datos)).toBe(await nativo(datos));
  });
});

describe("streaming: partir el archivo no cambia su huella", () => {
  // Es la propiedad de la que depende todo: Velo lee el archivo en trozos de megabytes y el
  // resultado tiene que ser idéntico al de `sha256sum`, que lo lee como quiera.
  const datos = bytesSeeded(100_000, 99);

  for (const trozo of [1, 7, 63, 64, 65, 1_000, 4_096, 99_999]) {
    it(`en trozos de ${trozo} bytes`, () => {
      const acumulador = new Sha256();
      for (let i = 0; i < datos.length; i += trozo) {
        acumulador.actualizar(datos.subarray(i, i + trozo));
      }
      expect(acumulador.terminar()).toBe(sha256(datos));
    });
  }

  it("un trozo vacío no altera nada", () => {
    const con = new Sha256()
      .actualizar(utf8("hola"))
      .actualizar(new Uint8Array(0))
      .actualizar(utf8(" mundo"))
      .terminar();
    expect(con).toBe(sha256(utf8("hola mundo")));
  });

  it("no se puede seguir escribiendo después de cerrar", () => {
    const acumulador = new Sha256();
    acumulador.terminar();
    expect(() => acumulador.actualizar(utf8("tarde"))).toThrow(/cerró/);
    expect(() => acumulador.terminar()).toThrow(/cerró/);
  });
});
