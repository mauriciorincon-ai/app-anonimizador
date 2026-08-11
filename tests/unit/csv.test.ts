// El CSV de salida es el archivo que otra persona va a recibir. Estos tests fijan las cinco
// decisiones que lo hacen byte-idéntico — cambiar cualquiera cambia el hash del archivo, y con él
// lo que el certificado del S3 afirma.

import { describe, expect, it } from "vitest";

import { ConstructorColumnar, type TablaColumnar } from "@/engine/columnar";
import {
  escaparCampo,
  filasDeCsv,
  nombreDelArchivoAnonimizado,
  serializarCsv,
} from "@/engine/csv";

function tablaDe(encabezado: string[], filas: string[][]): TablaColumnar {
  const constructor = new ConstructorColumnar(encabezado, filas.length);
  for (const fila of filas) constructor.agregarFila(fila);
  return constructor.finalizar();
}

describe("escapar campos (RFC 4180)", () => {
  it("no entrecomilla lo que no lo necesita", () => {
    expect(escaparCampo("1032456789")).toBe("1032456789");
    expect(escaparCampo("José Ñáñez")).toBe("José Ñáñez");
    expect(escaparCampo("")).toBe("");
  });

  it("entrecomilla cuando el valor lleva coma, comilla o salto de línea", () => {
    expect(escaparCampo("Bogotá, D.C.")).toBe('"Bogotá, D.C."');
    expect(escaparCampo("linea1\nlinea2")).toBe('"linea1\nlinea2"');
    expect(escaparCampo("con\rretorno")).toBe('"con\rretorno"');
  });

  it("duplica la comilla, no la escapa con barra: eso es JSON, no CSV", () => {
    expect(escaparCampo('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it("protege los espacios de los bordes, que se perderían al leer", () => {
    expect(escaparCampo(" con espacio")).toBe('" con espacio"');
    expect(escaparCampo("con espacio ")).toBe('"con espacio "');
    expect(escaparCampo("sin  problema")).toBe("sin  problema");
  });
});

describe("el archivo completo", () => {
  const TABLA = tablaDe(
    ["cedula", "ciudad", "nota"],
    [
      ["1032456789", "Bogotá, D.C.", 'dijo "sí"'],
      ["79123456", "Medellín", ""],
    ],
  );

  it("es exactamente el archivo que se espera, byte por byte", () => {
    expect(serializarCsv(TABLA)).toBe(
      'cedula,ciudad,nota\n1032456789,"Bogotá, D.C.","dijo ""sí"""\n79123456,Medellín,\n',
    );
  });

  it("termina las líneas con LF y no lleva BOM", () => {
    const texto = serializarCsv(TABLA);
    expect(texto).not.toContain("\r\n");
    expect(texto.charCodeAt(0)).not.toBe(0xfeff);
    expect(texto.endsWith("\n")).toBe(true);
  });

  it("la primera fila es el encabezado, en el orden de la tabla", () => {
    expect(serializarCsv(TABLA).split("\n")[0]).toBe("cedula,ciudad,nota");
  });

  it("una celda vacía es un campo vacío, no una comilla ni un espacio", () => {
    expect(serializarCsv(TABLA).trimEnd().split("\n").at(-1)).toBe(
      "79123456,Medellín,",
    );
  });

  it("generar por trozos da exactamente lo mismo que generar de una", () => {
    // El worker usa el generador para no tener 130 MB como una sola cadena. Si las dos formas
    // divergieran, el archivo descargado no sería el que los tests verifican.
    expect([...filasDeCsv(TABLA)].join("")).toBe(serializarCsv(TABLA));
  });

  it("una tabla sin filas conserva su encabezado", () => {
    expect(serializarCsv(tablaDe(["a", "b"], []))).toBe("a,b\n");
  });
});

describe("el nombre del archivo descargado", () => {
  it("no repite el nombre del original: ese nombre viaja y cuenta cosas", () => {
    // `pacientes-oncologia-2026-anon.csv` describe el contenido antes de que nadie lo abra, y ese
    // nombre acaba en el asunto de un correo y en una carpeta compartida.
    const nombre = nombreDelArchivoAnonimizado("a3f29c7e5b104d86f2a9c0b3");
    expect(nombre).toBe("velo-anonimizado-a3f29c7e.csv");
    expect(nombre).not.toContain("paciente");
  });

  it("dos entregas del mismo tratamiento se reconocen por el nombre", () => {
    const hash = "a3f29c7e5b104d86";
    expect(nombreDelArchivoAnonimizado(hash)).toBe(
      nombreDelArchivoAnonimizado(hash),
    );
  });
});
