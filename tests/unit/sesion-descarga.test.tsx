// `prepararArchivo` (S11): cómo sale un archivo de alto volumen cuando no hay selector del sistema.
//
// Hay tres salidas y cada una es un mensaje distinto al worker:
//   · con `destino` (Chromium): el asa del archivo que el usuario eligió, sin abrir nada;
//   · sin `enFlujo`: el mensaje sale en el acto, como siempre (el worker junta un Blob);
//   · con `enFlujo`: antes se abre el canal al service worker de la descarga. Si atiende, el worker
//     recibe el puerto (transferido); si no (no existe, está bloqueado, falla), el worker recibe el
//     mismo mensaje sin puerto y corta el archivo en partes (`destino.test.ts` prueba ese corte).
// Este archivo prueba la orden que sale de la página, con el worker y el service worker de mentira.
// El e2e `descarga-en-flujo.spec.ts` prueba el camino entero en un navegador de verdad.

import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const abrir = vi.hoisted(() => vi.fn());

vi.mock("@/lib/descarga-en-flujo", () => ({
  abrirDescargaEnFlujo: abrir,
}));

import {
  analizar,
  descartar,
  prepararArchivo,
  useTaller,
  type EstadoDelTaller,
} from "@/lib/sesion";
import type { DescargaAbierta } from "@/lib/descarga-en-flujo";
import type { MensajeAlWorker } from "@/workers/contrato";

class WorkerDeMentira {
  static ultimo: WorkerDeMentira | null = null;
  readonly enviados: { mensaje: MensajeAlWorker; transferidos: unknown[] }[] =
    [];
  terminado = false;

  constructor() {
    WorkerDeMentira.ultimo = this;
  }
  postMessage(mensaje: MensajeAlWorker, transferidos: unknown[] = []): void {
    this.enviados.push({ mensaje, transferidos });
  }
  terminate(): void {
    this.terminado = true;
  }
  addEventListener(): void {}
  /** Lo que se le pidió al worker que construyera el archivo. */
  construcciones() {
    return this.enviados.filter((e) => e.mensaje.tipo === "construir-archivo");
  }
}

let taller: EstadoDelTaller;
// Se copia afuera en un efecto, no durante el render (`react-hooks/globals`).
function Sonda() {
  const tallerAhora = useTaller();
  useEffect(() => {
    taller = tallerAhora;
  });
  return null;
}

/** Una descarga abierta de mentira: anota el orden en que la página la corta y la cierra. */
function descargaDeMentira(bitacora: string[], nombre = "d"): DescargaAbierta {
  return {
    puerto: new MessageChannel().port1,
    cancelar: () => bitacora.push(`${nombre}:cancelar`),
    cerrar: () => bitacora.push(`${nombre}:cerrar`),
  };
}

function conArchivo(): WorkerDeMentira {
  render(<Sonda />);
  act(() => analizar(new File(["a,b\n1,2\n"], "tabla.csv")));
  const worker = WorkerDeMentira.ultimo;
  if (!worker) throw new Error("no se creó el worker");
  return worker;
}

/** Deja correr las promesas pendientes (`abrirDescargaEnFlujo(...).then(...)`). */
const asentar = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  abrir.mockReset();
  WorkerDeMentira.ultimo = null;
  vi.stubGlobal("Worker", WorkerDeMentira);
});

afterEach(() => {
  act(() => descartar());
  vi.unstubAllGlobals();
});

describe("prepararArchivo", () => {
  it("sin `enFlujo` el mensaje sale en el acto y no se abre ningún canal", () => {
    const worker = conArchivo();
    act(() => prepararArchivo());
    expect(abrir).not.toHaveBeenCalled();
    expect(worker.construcciones()).toEqual([
      { mensaje: { tipo: "construir-archivo" }, transferidos: [] },
    ]);
    expect(taller.etapa).toBe("escribiendo");
  });

  it("con el asa del selector, el worker recibe el asa y no se abre ningún canal", () => {
    const worker = conArchivo();
    const asa = { name: "salida.csv" } as unknown as FileSystemFileHandle;
    act(() => prepararArchivo(asa, { enFlujo: true }));
    expect(abrir).not.toHaveBeenCalled();
    expect(worker.construcciones()).toEqual([
      {
        mensaje: { tipo: "construir-archivo", destino: asa },
        transferidos: [],
      },
    ]);
  });

  it("con `enFlujo`, el worker no recibe nada hasta que el canal está abierto, y entonces recibe el puerto transferido", async () => {
    const worker = conArchivo();
    let abrirLaDescarga!: (d: DescargaAbierta | null) => void;
    abrir.mockReturnValue(
      new Promise<DescargaAbierta | null>((r) => (abrirLaDescarga = r)),
    );
    act(() => prepararArchivo(undefined, { enFlujo: true }));
    expect(taller.etapa).toBe("escribiendo");
    expect(worker.construcciones()).toHaveLength(0);

    const bitacora: string[] = [];
    const descarga = descargaDeMentira(bitacora);
    abrirLaDescarga(descarga);
    await asentar();

    expect(worker.construcciones()).toEqual([
      {
        mensaje: { tipo: "construir-archivo", flujo: descarga.puerto },
        transferidos: [descarga.puerto],
      },
    ]);
    expect(bitacora).toEqual([]);
  });

  it("si el service worker no atiende, el worker recibe el mensaje sin puerto: corta en partes", async () => {
    const worker = conArchivo();
    abrir.mockResolvedValue(null);
    act(() => prepararArchivo(undefined, { enFlujo: true }));
    await asentar();
    expect(worker.construcciones()).toEqual([
      { mensaje: { tipo: "construir-archivo" }, transferidos: [] },
    ]);
    expect("flujo" in worker.construcciones()[0].mensaje).toBe(false);
  });

  it("si se suelta el archivo mientras se abre el canal, se cierra y no se le pide nada a un worker que ya no existe", async () => {
    const worker = conArchivo();
    let abrirLaDescarga!: (d: DescargaAbierta | null) => void;
    abrir.mockReturnValue(
      new Promise<DescargaAbierta | null>((r) => (abrirLaDescarga = r)),
    );
    act(() => prepararArchivo(undefined, { enFlujo: true }));
    act(() => descartar());
    expect(worker.terminado).toBe(true);

    const bitacora: string[] = [];
    abrirLaDescarga(descargaDeMentira(bitacora));
    await asentar();
    expect(bitacora).toEqual(["d:cerrar"]);
    expect(worker.construcciones()).toHaveLength(0);
  });

  it("al soltar el archivo, la descarga abierta se corta (por si el worker murió a medias) y luego se cierra", async () => {
    conArchivo();
    const bitacora: string[] = [];
    abrir.mockResolvedValue(descargaDeMentira(bitacora));
    act(() => prepararArchivo(undefined, { enFlujo: true }));
    await asentar();
    expect(bitacora).toEqual([]);

    act(() => descartar());
    expect(bitacora).toEqual(["d:cancelar", "d:cerrar"]);
    // Una vez soltada, soltar de nuevo no vuelve a tocarla.
    act(() => descartar());
    expect(bitacora).toEqual(["d:cancelar", "d:cerrar"]);
  });

  it("pedir otro archivo suelta antes la descarga que seguía abierta", async () => {
    conArchivo();
    const bitacora: string[] = [];
    abrir
      .mockResolvedValueOnce(descargaDeMentira(bitacora, "primera"))
      .mockResolvedValueOnce(descargaDeMentira(bitacora, "segunda"));
    act(() => prepararArchivo(undefined, { enFlujo: true }));
    await asentar();
    act(() => prepararArchivo(undefined, { enFlujo: true }));
    await asentar();
    expect(bitacora).toEqual(["primera:cancelar", "primera:cerrar"]);
  });
});
