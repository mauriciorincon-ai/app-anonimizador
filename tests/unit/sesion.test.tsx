// La sesión: qué entra a la aduana y qué se rechaza antes de tocar el archivo.
//
// Solo se prueban los caminos de rechazo, y no por comodidad: son exactamente los que ocurren
// ANTES de crear el worker. Un archivo válido instanciaría un `Worker`, que en jsdom no existe —
// ese camino lo cubre el e2e, que es donde tiene sentido probarlo.

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AVISO_EXCEL_BYTES,
  TOPE_EXCEL_BYTES,
  excedeElTope,
  excelGrande,
  formatoDeArchivo,
} from "@/lib/archivo";
import {
  analizar,
  descartar,
  siguienteEstado,
  useSesion,
  type EstadoDeSesion,
} from "@/lib/sesion";
import type { Informe } from "@/workers/contrato";

function Sonda() {
  const estado = useSesion();
  return (
    <output>{estado.fase === "error" ? estado.motivo : estado.fase}</output>
  );
}

function archivoDe(nombre: string, tamano = 1024): File {
  const archivo = new File(["encabezado\n"], nombre);
  Object.defineProperty(archivo, "size", { value: tamano });
  return archivo;
}

afterEach(() => descartar());

describe("admisión de archivos", () => {
  it("arranca vacía: no hay nada guardado de una sesión anterior", () => {
    render(<Sonda />);
    expect(screen.getByRole("status")).toHaveTextContent("vacio");
  });

  it("rechaza un formato que no sabe leer", () => {
    render(<Sonda />);
    act(() => analizar(archivoDe("notas.txt")));
    expect(screen.getByRole("status")).toHaveTextContent(
      "formato-no-soportado",
    );
  });

  it("rechaza un Excel por encima del tope SIN abrirlo", () => {
    // La decisión se toma con `file.size` a propósito: abrir un .xlsx enorme es justo la
    // operación que tumba la pestaña, así que no se puede tomar después de abrirlo.
    render(<Sonda />);
    act(() => analizar(archivoDe("enorme.xlsx", 200 * 1024 * 1024)));
    expect(screen.getByRole("status")).toHaveTextContent("excel-excede-tope");
  });

  it("no le pone tope al CSV, por grande que sea", () => {
    // Un CSV de 2 GB no es un error: se lee por chunks y nunca existe entero en memoria. Si el
    // rechazo por tamaño se aplicara a todo formato, este caso quedaría mal cerrado.
    render(<Sonda />);
    expect(() =>
      act(() => analizar(archivoDe("gigante.csv", 2 * 1024 * 1024 * 1024))),
    ).toThrow(/Worker/i); // llegó a crear el worker: no lo rechazó por tamaño
  });

  it("descartar devuelve la sesión a vacío", () => {
    render(<Sonda />);
    act(() => analizar(archivoDe("notas.txt")));
    act(() => descartar());
    expect(screen.getByRole("status")).toHaveTextContent("vacio");
  });
});

describe("transiciones ante los mensajes del worker", () => {
  const ANALIZANDO: EstadoDeSesion = {
    fase: "analizando",
    nombre: "tabla.csv",
    bytes: 1000,
    formato: "csv",
    avisoDeTamano: false,
    etapa: "leyendo",
    filas: 0,
    bytesLeidos: 0,
    bytesTotales: 1000,
  };

  it("el progreso avanza la etapa y el conteo sin perder el archivo", () => {
    const siguiente = siguienteEstado(
      ANALIZANDO,
      {
        tipo: "progreso",
        etapa: "clasificando",
        filas: 25_000,
        bytesLeidos: 900,
        bytesTotales: 1000,
      },
      "tabla.csv",
    );
    expect(siguiente).toMatchObject({
      fase: "analizando",
      nombre: "tabla.csv",
      etapa: "clasificando",
      filas: 25_000,
    });
  });

  it("un progreso rezagado NO resucita una sesión ya descartada", () => {
    // El worker encola sus mensajes antes de morir: si uno llega después de que el usuario
    // descartó, la pantalla volvería sola a "analizando" un archivo que ya no existe.
    const vacio: EstadoDeSesion = { fase: "vacio" };
    const siguiente = siguienteEstado(
      vacio,
      {
        tipo: "progreso",
        etapa: "leyendo",
        filas: 10,
        bytesLeidos: 10,
        bytesTotales: 1000,
      },
      "tabla.csv",
    );
    expect(siguiente).toBe(vacio);
  });

  it("el informe listo reemplaza el estado entero", () => {
    const informe = { archivo: { nombre: "tabla.csv" } } as unknown as Informe;
    expect(
      siguienteEstado(ANALIZANDO, { tipo: "listo", informe }, "tabla.csv"),
    ).toEqual({ fase: "listo", informe });
  });

  it("el error conserva el nombre del archivo para poder nombrarlo en pantalla", () => {
    expect(
      siguienteEstado(
        ANALIZANDO,
        { tipo: "error", motivo: "excel-excede-memoria" },
        "libro.xlsx",
      ),
    ).toEqual({
      fase: "error",
      motivo: "excel-excede-memoria",
      nombre: "libro.xlsx",
    });
  });
});

describe("reglas de admisión, en aislamiento", () => {
  it("reconoce los formatos que lee y rechaza el resto", () => {
    expect(formatoDeArchivo("datos.csv")).toBe("csv");
    expect(formatoDeArchivo("DATOS.CSV")).toBe("csv");
    expect(formatoDeArchivo("libro.xlsx")).toBe("excel");
    expect(formatoDeArchivo("libro.xls")).toBe("excel");
    expect(formatoDeArchivo("notas.txt")).toBeNull();
    expect(formatoDeArchivo("sin-extension")).toBeNull();
  });

  it("el aviso de Excel grande vive ENTRE el umbral y el tope", () => {
    expect(excelGrande("excel", AVISO_EXCEL_BYTES - 1)).toBe(false);
    expect(excelGrande("excel", AVISO_EXCEL_BYTES)).toBe(true);
    expect(excelGrande("excel", TOPE_EXCEL_BYTES)).toBe(true);
    expect(excelGrande("excel", TOPE_EXCEL_BYTES + 1)).toBe(false);
    // Un CSV gigante no lleva aviso: se lee por partes y no hay nada de qué avisar.
    expect(excelGrande("csv", TOPE_EXCEL_BYTES * 10)).toBe(false);
  });

  it("el tope solo se le aplica a Excel", () => {
    expect(excedeElTope("excel", TOPE_EXCEL_BYTES + 1)).toBe(true);
    expect(excedeElTope("excel", TOPE_EXCEL_BYTES)).toBe(false);
    expect(excedeElTope("csv", TOPE_EXCEL_BYTES * 100)).toBe(false);
  });
});
