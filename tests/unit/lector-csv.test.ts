// El lector CSV compartido (S8). Dos cosas se prueban aquí, y la segunda es un defecto que existía.
//
//   1. Lee EXACTAMENTE las mismas filas que PapaParse sobre el texto entero, con cualquier tamaño de
//      trozo: comillas con saltos de línea que cruzan la frontera, CRLF, BOM, filas cortas y largas.
//   2. Un carácter UTF-8 partido por la frontera de un trozo sale entero. Con el `File` entregado a
//      PapaParse —lo que hacía el worker hasta el S7— sale como «�»: en cualquier CSV de más de 10 MB
//      con tildes, alguna celda quedaba corrompida sin que nadie lo dijera.

import { Blob as BlobDeNode } from "node:buffer";

import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { generarFilas } from "../../docs/kit-de-prueba/generador.mjs";
import { escaparCampo } from "@/engine/csv";
import { CONFIGURACION_CSV, lotesDeCsv } from "@/workers/csv";
import { tablaDeCsv } from "@/workers/en-memoria";
import { ArchivoCambio } from "@/workers/json";
import { sha256 } from "@/lib/sha256";

const codificar = (texto: string) => new TextEncoder().encode(texto);
const blobDe = (texto: string) =>
  new BlobDeNode([codificar(texto)]) as unknown as Blob;

async function filasDe(
  archivo: Blob,
  opciones: Parameters<typeof lotesDeCsv>[1] = {},
): Promise<string[][]> {
  const filas: string[][] = [];
  for await (const lote of lotesDeCsv(archivo, opciones)) filas.push(...lote);
  return filas;
}

const referencia = (texto: string) =>
  Papa.parse<string[]>(texto, CONFIGURACION_CSV).data;

describe("el lector CSV compartido lee lo mismo que PapaParse sobre el texto entero", () => {
  const kit = [
    ...generarFilas({
      filas: 400,
      seed: 42,
      perfil: "clinico",
      tasaInvalida: 0.08,
      tasaVacia: 0.03,
    }),
  ]
    .map((fila) => `${fila.map(escaparCampo).join(",")}\n`)
    .join("");

  for (const trozo of [4_096, 10_007, 65_536, Infinity])
    it(`el CSV del kit, en trozos de ${trozo} bytes`, async () => {
      expect(
        await filasDe(blobDe(kit), {
          trozo: trozo === Infinity ? undefined : trozo,
        }),
      ).toEqual(referencia(kit));
    });

  it("comillas con saltos de línea que cruzan la frontera, CRLF, BOM, filas cortas y largas", async () => {
    const raro =
      "﻿nombre,nota,extra\r\n" +
      Array.from(
        { length: 300 },
        (_, i) =>
          `fila ${i},"una nota con ""comillas"",\r\ny un salto ${i}",x${i % 7 === 0 ? ",sobra" : ""}`,
      ).join("\r\n") +
      "\r\ncorta\r\n\r\n";
    for (const trozo of [37, 512, 4_093]) {
      const filas = await filasDe(blobDe(raro), { trozo });
      expect(filas, String(trozo)).toEqual(referencia(raro.slice(1)));
      expect(filas[0][0]).toBe("nombre");
    }
  });
});

describe("un carácter partido por la frontera de un trozo", () => {
  // Cada fila es «á» + un relleno que hace caer el siguiente «á» (2 bytes en UTF-8) partido entre dos
  // trozos de 4 096 bytes.
  const TROZO = 4_096;
  function partido(): string {
    let texto = "ciudad,codigo\n";
    while (codificar(texto).length < TROZO * 6) {
      const faltan = TROZO - (codificar(texto).length % TROZO);
      // Deja un byte antes de la frontera: el «á» queda la mitad a cada lado.
      const relleno = "x".repeat(Math.max(0, faltan - 1 - 3));
      texto += `${relleno},1\ná`;
    }
    return `${texto}rea,2\n`;
  }

  it("el lector compartido lo deja entero", async () => {
    const texto = partido();
    const filas = await filasDe(blobDe(texto), { trozo: TROZO });
    expect(filas).toEqual(referencia(texto));
    expect(filas.flat().join("")).not.toContain("�");
    expect(filas.flat().join("")).toContain("á");
  });

  it("el `File` entregado a PapaParse, como hacía el worker, lo corrompe (el defecto)", async () => {
    const texto = partido();
    const archivo = new File([codificar(texto)], "partido.csv");
    const filas = await new Promise<string[][]>((resolver, fallar) => {
      const todas: string[][] = [];
      Papa.parse<string[]>(archivo, {
        ...CONFIGURACION_CSV,
        chunkSize: TROZO,
        chunk: (r) => todas.push(...r.data),
        complete: () => resolver(todas),
        error: fallar,
      });
    });
    expect(filas.flat().join("")).toContain("�");
  });
});

describe("la huella del archivo", () => {
  it("si el archivo no es el que se diagnosticó, la lectura falla al terminar", async () => {
    const texto = "a,b\n1,2\n";
    const buena = sha256(codificar(texto));
    expect(
      await filasDe(blobDe(texto), { huellaEsperada: buena }),
    ).toHaveLength(2);
    await expect(
      filasDe(blobDe("a,b\n1,3\n"), { huellaEsperada: buena }),
    ).rejects.toBeInstanceOf(ArchivoCambio);
  });
});

describe("el tope de celdas mide el ancho del encabezado (S10)", () => {
  // Diez columnas y una fila entera; después, filas de un solo campo, cada una en su propio lote.
  // Con el ancho de la PRIMERA FILA DEL LOTE (1) el tope de 45 celdas no se alcanzaba hasta la fila
  // 46; con el del encabezado (10) se alcanza en la quinta.
  const encabezado = Array.from({ length: 10 }, (_, i) => `c${i}`).join(",");
  const entera = Array.from({ length: 10 }, (_, i) => i).join(",");
  const texto = `${encabezado}\n${entera}\n${"x\n".repeat(12)}`;

  it("un lote que empieza con una fila corta no esconde el alto volumen", async () => {
    const lectura = await tablaDeCsv(blobDe(texto), {
      trozo: 4,
      topeDeCeldas: 45,
    });
    expect(lectura).toBe("alto-volumen");
  });

  it("y sin pasar el tope, el archivo se lee entero", async () => {
    const lectura = await tablaDeCsv(blobDe(texto), { trozo: 4 });
    expect(typeof lectura).toBe("object");
    if (typeof lectura === "object") expect(lectura.filas).toBe(13);
  });
});
