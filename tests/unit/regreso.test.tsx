// El regreso: la bóveda, el archivo devuelto y la restauración — con un worker de mentira.
//
// Lo que este archivo vigila es lo que **no se ve en pantalla**, que es donde viven las promesas
// duras del sprint:
//
//   · La **frase de paso de la bóveda** no puede existir en el estado publicado a la página. Es la
//     regresión de la frontera que el S2 construyó para la llave HMAC, y el e2e no la puede probar:
//     una frase guardada en un objeto se ve exactamente igual que una que no.
//   · El `Blob` del archivo restaurado se convierte en URL y su referencia se pierde ahí mismo
//     (ADR-005). `URL.revokeObjectURL` tampoco deja rastro en la pantalla.
//   · El regreso tiene **su propio worker**: descartar la sesión del taller no puede llevárselo, ni
//     al revés.

import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abrirLaBoveda,
  cargarDevuelto,
  descartarRegreso,
  prepararInformeDelRegreso,
  prepararRestaurado,
  restaurarAhora,
  useRegreso,
  type EstadoDelRegreso,
} from "@/lib/regreso";
import type {
  MensajeAlWorker,
  MensajeDelWorker,
  ResumenDeBoveda,
  ResumenDelRegreso,
} from "@/workers/contrato";

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

  revienta(): void {
    act(() => {
      for (const oyente of this.oyentes.get("error") ?? [])
        oyente({ preventDefault: () => {} });
    });
  }
}

let urlesCreadas = 0;
let revocadas: string[] = [];

beforeEach(() => {
  urlesCreadas = 0;
  revocadas = [];
  WorkerDeMentira.ultimo = null;
  vi.stubGlobal("Worker", WorkerDeMentira);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => `blob:velo/${++urlesCreadas}`,
      revokeObjectURL: (url: string) => {
        revocadas.push(url);
      },
    }),
  );
});

afterEach(() => {
  act(() => descartarRegreso());
  vi.unstubAllGlobals();
});

let regreso: EstadoDelRegreso;

/** Copia el estado en un efecto, no durante el render: `react-hooks/globals` veta lo segundo. */
function Sonda() {
  const ahora = useRegreso();
  useEffect(() => {
    regreso = ahora;
  });
  return null;
}

const FRASE = "dos toros y una brújula";

const RESUMEN_DE_BOVEDA: ResumenDeBoveda = {
  huella: "a".repeat(64),
  huellaDeLlave: "a1b2c3d4e5f6",
  hashDePolitica: "b".repeat(64),
  columnas: ["cedula"],
  pares: 446_006,
  colisiones: 100,
};

const RESUMEN_DEL_REGRESO = {
  columnas: [],
  reconocimiento: "completo",
  sinAparecer: [],
  fueraDeAlcance: [],
  totales: { restauradas: 445_806, ambiguas: 200, desconocidas: 0 },
  proporcionRestaurada: 0.9995,
  salvedades: [],
  esTitular: false,
  filas: 446_006,
} as unknown as ResumenDelRegreso;

function archivoDe(nombre: string): File {
  return new File(["contenido"], nombre, { type: "text/csv" });
}

/** Deja el regreso con bóveda abierta y archivo devuelto listo. */
function conTodoCargado(): WorkerDeMentira {
  render(<Sonda />);
  act(() => abrirLaBoveda(archivoDe("velo-boveda.velo"), FRASE));
  const worker = WorkerDeMentira.ultimo!;
  worker.responde({ tipo: "boveda-abierta", resumen: RESUMEN_DE_BOVEDA });
  act(() => cargarDevuelto(archivoDe("devuelto.csv")));
  worker.responde({
    tipo: "devuelto-listo",
    nombre: "devuelto.csv",
    bytes: 2048,
    filas: 446_006,
    columnas: 3,
    sha256: "c".repeat(64),
  });
  return worker;
}

describe("la frase de paso de la bóveda no existe en la página", () => {
  it("sale hacia el worker y NO queda en el estado publicado", () => {
    render(<Sonda />);
    act(() => abrirLaBoveda(archivoDe("velo-boveda.velo"), FRASE));
    const worker = WorkerDeMentira.ultimo!;

    // Salió, entera, en el mensaje: es lo único que la frase debe hacer.
    expect(worker.enviados[0]).toMatchObject({
      tipo: "abrir-boveda",
      frase: FRASE,
    });

    // Y no está en el estado, ni en una rama olvidada de él.
    expect(JSON.stringify(regreso)).not.toContain(FRASE);
    expect(JSON.stringify(regreso)).not.toContain("toros");
  });

  it("tampoco queda tras abrirse la bóveda", () => {
    const worker = conTodoCargado();
    expect(JSON.stringify(regreso)).not.toContain(FRASE);
    expect(worker.terminado).toBe(false);
  });
});

describe("lo que cruza del worker a la página", () => {
  it("de la bóveda solo vienen huellas y conteos, jamás una correspondencia", () => {
    conTodoCargado();
    expect(regreso.boveda).toEqual({
      fase: "abierta",
      resumen: RESUMEN_DE_BOVEDA,
    });
    // El resumen tiene seis campos y ninguno es un par: si algún día llega uno, este test lo ve.
    expect(Object.keys(RESUMEN_DE_BOVEDA).sort()).toEqual([
      "colisiones",
      "columnas",
      "hashDePolitica",
      "huella",
      "huellaDeLlave",
      "pares",
    ]);
  });

  it("una bóveda rechazada trae su motivo y su detalle, no un «archivo inválido»", () => {
    render(<Sonda />);
    act(() => abrirLaBoveda(archivoDe("cualquiera.csv"), FRASE));
    WorkerDeMentira.ultimo!.responde({
      tipo: "boveda-rechazada",
      motivo: "frase-incorrecta",
      detalle: "La frase no abre esta bóveda.",
    });
    expect(regreso.boveda).toMatchObject({
      fase: "rechazada",
      motivo: "frase-incorrecta",
    });
    expect(regreso.etapa).toBeNull();
  });
});

describe("el asa opaca del archivo restaurado (ADR-005)", () => {
  it("lo que llega a la interfaz son tres datos, y ninguno es el archivo", () => {
    const worker = conTodoCargado();
    act(() => restaurarAhora());
    worker.responde({ tipo: "restaurado", resumen: RESUMEN_DEL_REGRESO });
    act(() => prepararRestaurado());

    const blob = new Blob(["a,b\n1,2\n"], { type: "text/csv" });
    worker.responde({
      tipo: "archivo",
      blob,
      nombre: "velo-restaurado-abcdef12.csv",
      bytes: blob.size,
      proposito: "restaurado",
    });

    expect(Object.keys(regreso.archivo!).sort()).toEqual([
      "bytes",
      "nombre",
      "url",
    ]);
    expect(typeof regreso.archivo!.url).toBe("string");
    // Ni el `Blob` ni nada que se le parezca: la referencia murió dentro de `asaDeArchivo`.
    expect(Object.values(regreso.archivo!).some((v) => v instanceof Blob)).toBe(
      false,
    );
  });

  it("el informe y el archivo son asas distintas, cada una con su URL", () => {
    const worker = conTodoCargado();
    act(() => restaurarAhora());
    worker.responde({ tipo: "restaurado", resumen: RESUMEN_DEL_REGRESO });

    const csv = new Blob(["a\n1\n"]);
    worker.responde({
      tipo: "archivo",
      blob: csv,
      nombre: "velo-restaurado.csv",
      bytes: csv.size,
      proposito: "restaurado",
    });
    act(() => prepararInformeDelRegreso("12 de agosto de 2026"));
    const html = new Blob(["<html></html>"]);
    worker.responde({
      tipo: "archivo",
      blob: html,
      nombre: "velo-regreso-devuelto.html",
      bytes: html.size,
      proposito: "informe-del-regreso",
    });

    expect(regreso.archivo!.url).not.toBe(regreso.informe!.url);
    expect(regreso.informe!.nombre).toBe("velo-regreso-devuelto.html");
    // La fecha se inyecta desde afuera: es lo único que haría cambiar el documento por sí solo.
    expect(worker.enviados.at(-1)).toMatchObject({
      tipo: "construir-informe-del-regreso",
      fecha: "12 de agosto de 2026",
    });
  });

  it("volver a restaurar suelta los bytes anteriores en vez de acumularlos", () => {
    const worker = conTodoCargado();
    act(() => restaurarAhora());
    worker.responde({ tipo: "restaurado", resumen: RESUMEN_DEL_REGRESO });
    const blob = new Blob(["a\n1\n"]);
    worker.responde({
      tipo: "archivo",
      blob,
      nombre: "uno.csv",
      bytes: blob.size,
      proposito: "restaurado",
    });
    const primera = regreso.archivo!.url;

    act(() => restaurarAhora());
    expect(revocadas).toContain(primera);
    expect(regreso.archivo).toBeNull();
  });

  it("descartar el regreso suelta todo y mata su worker", () => {
    const worker = conTodoCargado();
    act(() => restaurarAhora());
    worker.responde({ tipo: "restaurado", resumen: RESUMEN_DEL_REGRESO });
    const blob = new Blob(["a\n1\n"]);
    worker.responde({
      tipo: "archivo",
      blob,
      nombre: "uno.csv",
      bytes: blob.size,
      proposito: "restaurado",
    });
    const url = regreso.archivo!.url;

    act(() => descartarRegreso());
    expect(revocadas).toContain(url);
    expect(worker.terminado).toBe(true);
    expect(regreso.boveda).toEqual({ fase: "sin-boveda" });
    expect(regreso.devuelto).toEqual({ fase: "sin-archivo" });
  });
});

describe("las órdenes del regreso antes de tener worker", () => {
  it("restaurar, preparar y pedir el informe no hacen nada", () => {
    render(<Sonda />);
    act(() => {
      restaurarAhora();
      prepararRestaurado();
      prepararInformeDelRegreso("hoy");
    });
    expect(WorkerDeMentira.ultimo).toBeNull();
    // La forma COMPLETA, a propósito: un campo nuevo tiene que pasar por aquí y ser mirado.
    expect(regreso).toEqual({
      boveda: { fase: "sin-boveda" },
      devuelto: { fase: "sin-archivo" },
      restauracion: { fase: "sin-hacer" },
      etapa: null,
      archivo: null,
      informe: null,
    });
  });

  it("un worker que revienta no deja la pantalla girando", () => {
    render(<Sonda />);
    act(() => cargarDevuelto(archivoDe("devuelto.csv")));
    WorkerDeMentira.ultimo!.revienta();
    expect(regreso.devuelto).toMatchObject({
      fase: "error",
      motivo: "lectura-fallida",
      nombre: "devuelto.csv",
    });
    expect(regreso.etapa).toBeNull();
  });

  it("un fallo restaurando no tumba la bóveda ni el archivo ya cargados", () => {
    const worker = conTodoCargado();
    act(() => restaurarAhora());
    worker.responde({ tipo: "error", motivo: "restauracion-fallida" });
    expect(regreso.restauracion).toMatchObject({ fase: "fallo" });
    expect(regreso.boveda.fase).toBe("abierta");
    expect(regreso.devuelto.fase).toBe("listo");
  });
});
