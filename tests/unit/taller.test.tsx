// El taller: la llave, la transformación y el archivo — con un worker de mentira.
//
// `tests/unit/sesion.test.tsx` declara que solo prueba los caminos de rechazo porque el resto
// «instanciaría un `Worker`, que en jsdom no existe». Eso era cierto cuando la sesión terminaba en
// el informe. La Fase 5 le añadió el taller entero, y con él lo que ADR-005 promete: que el `Blob`
// del archivo se convierte en URL y su referencia se pierde ahí mismo.
//
// **Esa promesa no la puede verificar el e2e.** `URL.revokeObjectURL` no deja rastro en la pantalla:
// un Velo que nunca revocara se vería exactamente igual y acumularía el archivo en memoria cada vez
// que el usuario toca la política. Así que aquí se dobla el worker —cuyo contrato son dos cosas,
// `postMessage` y eventos `message`— y se observa el ciclo de vida del recurso, que es la parte que
// no se ve.

import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  analizar,
  derivarLlaveDelProyecto,
  descartar,
  invalidarTransformacion,
  prepararArchivo,
  sellarLaBoveda,
  transformar,
  useSesion,
  useTaller,
  type EstadoDeSesion,
  type EstadoDelTaller,
} from "@/lib/sesion";
import type { Politica } from "@/engine/politica";
import type {
  MensajeAlWorker,
  MensajeDelWorker,
  ResultadoDeTransformacion,
} from "@/workers/contrato";

// ── El doble ──────────────────────────────────────────────────────────────────────────────────

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

  /** El worker contesta. Se envuelve en `act` porque de aquí salen renders. */
  responde(mensaje: MensajeDelWorker): void {
    act(() => {
      for (const oyente of this.oyentes.get("message") ?? [])
        oyente({ data: mensaje });
    });
  }

  /** El worker revienta por su cuenta (el chunk que no carga, la excepción que se escapa). */
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
  // jsdom no implementa el registro de URLs de objeto. Se dobla con un contador para poder
  // comprobar la única pregunta que importa aquí: cuál se creó y cuál se soltó.
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
  act(() => descartar());
  vi.unstubAllGlobals();
});

// ── La sonda ──────────────────────────────────────────────────────────────────────────────────
//
// El estado se copia afuera en un efecto, no durante el render: reasignar una variable de módulo
// mientras React renderiza es un efecto en sitio, y `react-hooks/globals` lo veta con razón. Se
// copia el OBJETO, no su JSON, porque una de las preguntas de abajo es justamente si dentro hay un
// `Blob` — y `JSON.stringify` de un `Blob` da `{}`, o sea que el serializador escondería lo único
// que este archivo existe para vigilar.

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

/** Sesión con archivo admitido y worker vivo — el punto de partida de todo lo de abajo. */
function conArchivo(): WorkerDeMentira {
  render(<Sonda />);
  act(() => analizar(new File(["a,b\n1,2\n"], "tabla.csv")));
  const worker = WorkerDeMentira.ultimo;
  if (!worker) throw new Error("no se creó el worker");
  return worker;
}

const POLITICA = {
  version: 1,
  origen: "manual",
  reglas: [],
  kObjetivo: null,
} as const satisfies Politica;

const RESULTADO = {
  hashDePolitica: "abc123",
  ms: 12,
} as unknown as ResultadoDeTransformacion;

function archivoListo(
  worker: WorkerDeMentira,
  nombre = "tabla-velo.csv",
): void {
  const blob = new Blob(["a,b\n1,2\n"], { type: "text/csv" });
  worker.responde({
    tipo: "archivo",
    blob,
    nombre,
    bytes: blob.size,
    proposito: "anonimizado",
  });
}

// ── Los tests ─────────────────────────────────────────────────────────────────────────────────

describe("el asa opaca (ADR-005)", () => {
  it("lo que llega a la interfaz son tres datos, y ninguno es el archivo", () => {
    const worker = conArchivo();
    archivoListo(worker);

    expect(Object.keys(taller.archivo!).sort()).toEqual([
      "bytes",
      "nombre",
      "url",
    ]);
    // No es una comprobación de forma: es la comprobación de que no hay nada sobre lo que se
    // pudiera llamar `.text()`. Un `Blob` guardado «por si acaso» aparecería aquí.
    for (const valor of Object.values(taller.archivo!)) {
      expect(typeof valor === "string" || typeof valor === "number").toBe(true);
    }
    expect(taller.archivo).toMatchObject({
      nombre: "tabla-velo.csv",
      url: "blob:velo/1",
    });
    expect(taller.archivo!.bytes).toBeGreaterThan(0);
  });

  it("tocar la política suelta los bytes del archivo anterior", () => {
    // Sin esto, cada edición de la política deja un archivo entero en memoria hasta que se cierra
    // la pestaña. No se ve en pantalla, y en 500k filas son cientos de MB.
    const worker = conArchivo();
    archivoListo(worker);
    act(() => invalidarTransformacion());

    expect(revocadas).toEqual(["blob:velo/1"]);
    expect(taller.archivo).toBeNull();
    expect(taller.transformacion.fase).toBe("sin-hacer");
  });

  it("y transformar de nuevo también, sin esperar a que alguien invalide", () => {
    const worker = conArchivo();
    archivoListo(worker);
    act(() => transformar(POLITICA));

    expect(revocadas).toEqual(["blob:velo/1"]);
    expect(taller.archivo).toBeNull();
    expect(taller.transformacion.fase).toBe("transformando");
  });

  it("descartar el archivo mata el worker y suelta los bytes", () => {
    const worker = conArchivo();
    archivoListo(worker);
    act(() => descartar());

    expect(worker.terminado).toBe(true);
    expect(revocadas).toEqual(["blob:velo/1"]);
    expect(taller.archivo).toBeNull();
    expect(sesion.fase).toBe("vacio");
  });

  it("invalidar con el taller ya limpio no revoca nada dos veces", () => {
    conArchivo();
    act(() => invalidarTransformacion());
    act(() => invalidarTransformacion());
    expect(revocadas).toEqual([]);
  });
});

describe("la llave", () => {
  it("la frase va al worker y no se queda en el estado", () => {
    const worker = conArchivo();
    act(() => derivarLlaveDelProyecto("dos toros y una brújula"));

    const enviado = worker.enviados.at(-1);
    expect(enviado).toMatchObject({
      tipo: "derivar-llave",
      frase: "dos toros y una brújula",
    });
    expect(taller.llave).toEqual({ fase: "derivando" });
    expect(taller.etapa).toBe("derivando-llave");
    // La frase no puede estar en ninguna parte del estado: lo que se publica se puede leer desde
    // React DevTools, y un estado se serializa en cuanto alguien lo registre.
    expect(JSON.stringify(taller)).not.toContain("brújula");
  });

  it("la huella llega con la sal que se usó, que es lo que permite repetirla", () => {
    const worker = conArchivo();
    act(() => derivarLlaveDelProyecto("frase"));
    const enviado = worker.enviados.at(-1) as { sal: string };
    worker.responde({ tipo: "llave-lista", huella: "a1b2c3d4e5f6" });

    expect(taller.llave).toEqual({
      fase: "lista",
      huella: "a1b2c3d4e5f6",
      sal: enviado.sal,
    });
    expect(enviado.sal).toMatch(/^[0-9a-f]{32}$/);
    expect(taller.etapa).toBeNull();
  });
});

describe("la transformación", () => {
  it("el resultado del worker es lo que la pantalla lee", () => {
    const worker = conArchivo();
    act(() => transformar(POLITICA));
    expect(worker.enviados.at(-1)).toEqual({
      tipo: "transformar",
      politica: POLITICA,
    });

    worker.responde({ tipo: "transformado", resultado: RESULTADO });
    expect(taller.transformacion).toEqual({
      fase: "hecha",
      resultado: RESULTADO,
    });
    expect(taller.etapa).toBeNull();
  });

  it("pedir el archivo nombra su etapa: escribir 500k filas tarda y se dice", () => {
    const worker = conArchivo();
    act(() => prepararArchivo());
    expect(taller.etapa).toBe("escribiendo");
    expect(worker.enviados.at(-1)).toEqual({ tipo: "construir-archivo" });
  });

  it.each(["sin-tabla", "sin-llave", "transformacion-fallida"] as const)(
    "un fallo transformando (%s) NO tumba el informe ya analizado",
    (motivo) => {
      const worker = conArchivo();
      worker.responde({
        tipo: "listo",
        informe: { archivo: { nombre: "tabla.csv" } } as never,
      });
      act(() => transformar(POLITICA));
      worker.responde({ tipo: "error", motivo });

      expect(taller.transformacion).toEqual({ fase: "fallo", motivo });
      // El archivo original sigue analizado: obligar a cargarlo otra vez por un fallo del
      // tratamiento sería cobrarle al usuario un error que no cometió.
      expect(sesion.fase).toBe("listo");
    },
  );

  it("un error de lectura SÍ tumba la sesión, y conserva el nombre", () => {
    const worker = conArchivo();
    worker.responde({ tipo: "error", motivo: "excel-excede-memoria" });
    expect(sesion).toEqual({
      fase: "error",
      motivo: "excel-excede-memoria",
      nombre: "tabla.csv",
    });
  });

  it("si el worker mismo revienta, la pantalla no se queda girando", () => {
    const worker = conArchivo();
    worker.revienta();
    expect(sesion).toMatchObject({ fase: "error", motivo: "lectura-fallida" });
  });
});

describe("el progreso, que es de dos dueños", () => {
  it("mientras se transforma, mueve la etiqueta del taller", () => {
    const worker = conArchivo();
    act(() => transformar(POLITICA));
    worker.responde({
      tipo: "progreso",
      etapa: "midiendo-el-despues",
      filas: 500_000,
      bytesLeidos: 0,
      bytesTotales: 0,
    });
    expect(taller.etapa).toBe("midiendo-el-despues");
  });

  it("mientras se analiza, mueve la sesión y deja el taller quieto", () => {
    const worker = conArchivo();
    worker.responde({
      tipo: "progreso",
      etapa: "clasificando",
      filas: 25_000,
      bytesLeidos: 900,
      bytesTotales: 1000,
    });
    expect(sesion).toMatchObject({ fase: "analizando", etapa: "clasificando" });
    expect(taller.etapa).toBeNull();
  });
});

describe("sin worker no hay taller", () => {
  it("las órdenes del taller no hacen nada antes de cargar un archivo", () => {
    // No es defensa contra un bug: es que las pantallas del taller comparten ruta con la aduana, y
    // una recarga de `/transformar` sin archivo llega aquí con el worker en null.
    render(<Sonda />);
    act(() => {
      derivarLlaveDelProyecto("frase");
      transformar(POLITICA);
      prepararArchivo();
      sellarLaBoveda("frase de la boveda");
    });
    expect(WorkerDeMentira.ultimo).toBeNull();
    // La forma COMPLETA, a propósito: un campo nuevo en el taller tiene que pasar por aquí y ser
    // mirado. Es lo que cazó la bóveda del S3 al añadir sus dos.
    expect(taller).toEqual({
      llave: { fase: "sin-llave" },
      transformacion: { fase: "sin-hacer" },
      etapa: null,
      archivo: null,
      boveda: { fase: "sin-sellar" },
      archivoDeBoveda: null,
    });
  });
});
