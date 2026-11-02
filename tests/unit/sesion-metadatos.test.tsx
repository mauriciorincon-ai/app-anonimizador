// La sesión ante un PDF o una imagen (S6): la fase propia y el ciclo de la limpieza.
//
// Dos mitades. La pura: `siguienteEstado` ante `metadatos-listos`, que debe llevar a una fase que
// ninguna pantalla de tablas pueda recibir por accidente. Y la del cableado, con un worker de
// mentira: el asa opaca del archivo limpio (ADR-005), el fallo que no tumba el diagnóstico y la
// admisión por tope de bytes, que se decide sin abrir el archivo.

import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOPE_IMAGEN_BYTES,
  TOPE_PDF_BYTES,
  esDeMetadatos,
  formatoDeArchivo,
  motivoDelTope,
} from "@/lib/archivo";
import {
  analizar,
  descartar,
  limpiar,
  siguienteEstado,
  useSesion,
  useTaller,
  type EstadoDeSesion,
  type EstadoDelTaller,
} from "@/lib/sesion";
import type { MensajeAlWorker, MensajeDelWorker } from "@/workers/contrato";

import { INFORME_PDF, RESUMEN_PDF } from "./metadatos-informes";

const ANALIZANDO: EstadoDeSesion = {
  fase: "analizando",
  nombre: "informe.pdf",
  bytes: 1000,
  formato: "pdf",
  avisoDeTamano: false,
  etapa: "huella",
  filas: 0,
  bytesLeidos: 0,
  bytesTotales: 1000,
};

describe("siguienteEstado ante un PDF o una imagen", () => {
  it("metadatos-listos lleva a la fase «metadatos», con el informe entero", () => {
    const siguiente = siguienteEstado(
      ANALIZANDO,
      { tipo: "metadatos-listos", informe: INFORME_PDF },
      "informe.pdf",
    );
    expect(siguiente).toEqual({ fase: "metadatos", informe: INFORME_PDF });
    // Fase propia, no un «listo» con otro informe: así ninguna pantalla de tablas lo recibe.
    expect(siguiente.fase).not.toBe("listo");
  });

  it("el progreso de la lectura de metadatos avanza la etapa sin perder el archivo", () => {
    const siguiente = siguienteEstado(
      ANALIZANDO,
      {
        tipo: "progreso",
        etapa: "leyendo-metadatos",
        filas: 0,
        bytesLeidos: 0,
        bytesTotales: 1000,
      },
      "informe.pdf",
    );
    expect(siguiente).toMatchObject({
      fase: "analizando",
      nombre: "informe.pdf",
      formato: "pdf",
      etapa: "leyendo-metadatos",
    });
  });

  it("un progreso rezagado no resucita una sesión descartada, tampoco la de un PDF", () => {
    const vacio: EstadoDeSesion = { fase: "vacio" };
    expect(
      siguienteEstado(
        vacio,
        {
          tipo: "progreso",
          etapa: "leyendo-metadatos",
          filas: 0,
          bytesLeidos: 0,
          bytesTotales: 1000,
        },
        "informe.pdf",
      ),
    ).toBe(vacio);
  });

  it.each([
    "pdf-cifrado",
    "pdf-ilegible",
    "imagen-ilegible",
    "pdf-excede-tope",
    "imagen-excede-tope",
    "formato-no-coincide",
  ] as const)(
    "el error %s conserva el nombre del archivo y la clave",
    (motivo) => {
      expect(
        siguienteEstado(ANALIZANDO, { tipo: "error", motivo }, "informe.pdf"),
      ).toEqual({
        fase: "error",
        motivo,
        nombre: "informe.pdf",
        linea: undefined,
      });
    },
  );

  it("los mensajes de la limpieza no tocan la sesión: el diagnóstico sigue siendo el mismo", () => {
    const leido: EstadoDeSesion = { fase: "metadatos", informe: INFORME_PDF };
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    expect(
      siguienteEstado(
        leido,
        { tipo: "limpiado", resumen: RESUMEN_PDF, blob, nombre: "x.pdf" },
        "informe.pdf",
      ),
    ).toBe(leido);
  });
});

describe("la admisión de un PDF o una imagen", () => {
  it("la extensión solo abre la puerta: pdf e imagen, no tabla", () => {
    expect(formatoDeArchivo("a.pdf")).toBe("pdf");
    expect(formatoDeArchivo("A.PDF")).toBe("pdf");
    for (const nombre of ["a.jpg", "a.JPEG", "a.png", "a.webp"])
      expect(formatoDeArchivo(nombre)).toBe("imagen");
    expect(esDeMetadatos("pdf")).toBe(true);
    expect(esDeMetadatos("imagen")).toBe(true);
    expect(esDeMetadatos("csv")).toBe(false);
    expect(esDeMetadatos("json")).toBe(false);
  });

  it("cada tope se decide por el tamaño, sin abrir el archivo", () => {
    expect(motivoDelTope("pdf", TOPE_PDF_BYTES)).toBeNull();
    expect(motivoDelTope("pdf", TOPE_PDF_BYTES + 1)).toBe("pdf-excede-tope");
    expect(motivoDelTope("imagen", TOPE_IMAGEN_BYTES)).toBeNull();
    expect(motivoDelTope("imagen", TOPE_IMAGEN_BYTES + 1)).toBe(
      "imagen-excede-tope",
    );
    // El CSV sigue sin tope, por grande que sea.
    expect(motivoDelTope("csv", 2 * 1024 ** 3)).toBeNull();
  });
});

// ── El cableado, con un worker de mentira ─────────────────────────────────────────────────────

class WorkerDeMentira {
  static ultimo: WorkerDeMentira | null = null;

  readonly enviados: MensajeAlWorker[] = [];
  terminado = false;
  private readonly oyentes = new Map<string, ((evento: unknown) => void)[]>();

  constructor() {
    WorkerDeMentira.ultimo = this;
  }

  postMessage(mensaje: MensajeAlWorker): void {
    this.enviados.push(mensaje);
  }

  terminate(): void {
    this.terminado = true;
  }

  addEventListener(tipo: string, oyente: (evento: unknown) => void): void {
    const lista = this.oyentes.get(tipo) ?? [];
    lista.push(oyente);
    this.oyentes.set(tipo, lista);
  }

  responde(mensaje: MensajeDelWorker): void {
    act(() => {
      for (const oyente of this.oyentes.get("message") ?? [])
        oyente({ data: mensaje });
    });
  }
}

let creadas = 0;
let revocadas: string[] = [];
let taller: EstadoDelTaller;
let sesion: EstadoDeSesion;

function Sonda() {
  const tallerAhora = useTaller();
  const sesionAhora = useSesion();
  useEffect(() => {
    taller = tallerAhora;
    sesion = sesionAhora;
  });
  return null;
}

/** Un PDF ya leído, con el worker vivo — el punto de partida de la limpieza. */
function pdfLeido(): WorkerDeMentira {
  render(<Sonda />);
  act(() => analizar(new File(["%PDF-1.7\n"], "informe.pdf")));
  const worker = WorkerDeMentira.ultimo;
  if (!worker) throw new Error("no se creó el worker");
  worker.responde({ tipo: "metadatos-listos", informe: INFORME_PDF });
  return worker;
}

beforeEach(() => {
  creadas = 0;
  revocadas = [];
  WorkerDeMentira.ultimo = null;
  vi.stubGlobal("Worker", WorkerDeMentira);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => `blob:velo/${++creadas}`,
      revokeObjectURL: (url: string) => {
        revocadas.push(url);
      },
    }),
  );
});

afterEach(() => {
  act(() => descartar());
  vi.unstubAllGlobals();
});

describe("analizar un PDF", () => {
  it("abre el worker, entra en «analizando» como pdf y termina en «metadatos»", () => {
    render(<Sonda />);
    act(() => analizar(new File(["%PDF-1.7\n"], "informe.pdf")));
    expect(sesion).toMatchObject({
      fase: "analizando",
      formato: "pdf",
      nombre: "informe.pdf",
    });
    expect(WorkerDeMentira.ultimo!.enviados[0]).toMatchObject({
      tipo: "analizar",
    });

    WorkerDeMentira.ultimo!.responde({
      tipo: "metadatos-listos",
      informe: INFORME_PDF,
    });
    expect(sesion).toEqual({ fase: "metadatos", informe: INFORME_PDF });
  });

  it("un PDF por encima del tope se rechaza SIN crear el worker", () => {
    render(<Sonda />);
    const enorme = new File(["x"], "enorme.pdf");
    Object.defineProperty(enorme, "size", { value: TOPE_PDF_BYTES + 1 });
    act(() => analizar(enorme));
    expect(sesion).toMatchObject({
      fase: "error",
      motivo: "pdf-excede-tope",
      nombre: "enorme.pdf",
    });
    expect(WorkerDeMentira.ultimo).toBeNull();
  });

  it("una imagen por encima del tope tiene el suyo", () => {
    render(<Sonda />);
    const enorme = new File(["x"], "enorme.png");
    Object.defineProperty(enorme, "size", { value: TOPE_IMAGEN_BYTES + 1 });
    act(() => analizar(enorme));
    expect(sesion).toMatchObject({
      fase: "error",
      motivo: "imagen-excede-tope",
    });
    expect(WorkerDeMentira.ultimo).toBeNull();
  });
});

describe("la limpieza", () => {
  it("limpiar manda la orden sin opciones y publica «limpiando»", () => {
    const worker = pdfLeido();
    act(() => limpiar());
    expect(worker.enviados.at(-1)).toEqual({ tipo: "limpiar" });
    expect(taller.limpieza).toEqual({ fase: "limpiando" });
    expect(taller.etapa).toBe("limpiando");
  });

  it("la etapa en vivo sigue al worker mientras limpia", () => {
    const worker = pdfLeido();
    act(() => limpiar());
    worker.responde({
      tipo: "progreso",
      etapa: "comprobando",
      filas: 0,
      bytesLeidos: 0,
      bytesTotales: 1000,
    });
    expect(taller.etapa).toBe("comprobando");
  });

  it("el archivo limpio llega como asa opaca, junto a su resumen", () => {
    const worker = pdfLeido();
    act(() => limpiar());
    worker.responde({
      tipo: "limpiado",
      resumen: RESUMEN_PDF,
      blob: new Blob(["%PDF-"], { type: "application/pdf" }),
      nombre: "velo-limpio-aaaaaaaa.pdf",
    });

    expect(taller.limpieza.fase).toBe("hecha");
    if (taller.limpieza.fase !== "hecha") return;
    expect(taller.limpieza.resumen).toBe(RESUMEN_PDF);
    // Tres datos y ninguno es el archivo: no hay sobre qué llamar `.text()`.
    expect(Object.keys(taller.limpieza.archivo).sort()).toEqual([
      "bytes",
      "nombre",
      "url",
    ]);
    for (const valor of Object.values(taller.limpieza.archivo))
      expect(typeof valor === "string" || typeof valor === "number").toBe(true);
    expect(taller.limpieza.archivo).toMatchObject({
      nombre: "velo-limpio-aaaaaaaa.pdf",
      url: "blob:velo/1",
    });
    expect(taller.etapa).toBeNull();
    // El diagnóstico sigue ahí: limpiar no lo descarta.
    expect(sesion.fase).toBe("metadatos");
  });

  it("limpiar de nuevo suelta primero los bytes de la copia anterior", () => {
    const worker = pdfLeido();
    act(() => limpiar());
    worker.responde({
      tipo: "limpiado",
      resumen: RESUMEN_PDF,
      blob: new Blob(["%PDF-"]),
      nombre: "velo-limpio-aaaaaaaa.pdf",
    });
    act(() => limpiar());
    expect(revocadas).toEqual(["blob:velo/1"]);
    expect(taller.limpieza).toEqual({ fase: "limpiando" });
  });

  it("descartar el archivo suelta los bytes de la copia limpia y mata el worker", () => {
    const worker = pdfLeido();
    act(() => limpiar());
    worker.responde({
      tipo: "limpiado",
      resumen: RESUMEN_PDF,
      blob: new Blob(["%PDF-"]),
      nombre: "velo-limpio-aaaaaaaa.pdf",
    });
    act(() => descartar());
    expect(worker.terminado).toBe(true);
    expect(revocadas).toEqual(["blob:velo/1"]);
    expect(taller.limpieza).toEqual({ fase: "sin-hacer" });
    expect(sesion.fase).toBe("vacio");
  });

  it("un fallo limpiando no tumba el diagnóstico: queda el motivo, y el archivo sigue leído", () => {
    const worker = pdfLeido();
    act(() => limpiar());
    worker.responde({ tipo: "error", motivo: "limpieza-incompleta" });
    expect(taller.limpieza).toEqual({
      fase: "fallo",
      motivo: "limpieza-incompleta",
    });
    expect(taller.etapa).toBeNull();
    expect(sesion).toEqual({ fase: "metadatos", informe: INFORME_PDF });
  });

  it("sin worker, limpiar no hace nada", () => {
    render(<Sonda />);
    act(() => limpiar());
    expect(WorkerDeMentira.ultimo).toBeNull();
    expect(taller.limpieza).toEqual({ fase: "sin-hacer" });
  });
});
