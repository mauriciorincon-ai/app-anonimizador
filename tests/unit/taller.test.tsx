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
  compararGeneralizacion,
  derivarLlaveDelProyecto,
  descartar,
  invalidarTransformacion,
  limpiar,
  pedirEstimacion,
  prepararArchivo,
  sellarLaBoveda,
  transformar,
  useSesion,
  useTaller,
  type EstadoDeSesion,
  type EstadoDelTaller,
} from "@/lib/sesion";
import type { Politica } from "@/engine/politica";
import { fijarIdioma } from "@/lib/idioma/estado";
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
  idioma: "es",
  ms: 12,
} as unknown as ResultadoDeTransformacion;

/**
 * La guardia de §5 sobre `ResultadoDeTransformacion`: **un campo del contrato nace con su lector o
 * no nace.**
 *
 * Es un `Record<keyof …, true>`, y esa forma es la gracia: TypeScript exige **todas** las claves y
 * **solo** esas, así que añadir un campo al contrato **rompe la compilación aquí** y borrarlo
 * también. No hace falta un fixture completo —construir un `BalanceDelTratamiento` de mentira para
 * esto sería pagar mucho por menos garantía—, y a diferencia de una lista de claves en tiempo de
 * ejecución, no hay `as unknown as` que la pueda esquivar. El fixture de arriba sí lleva el cast, y
 * ese cast es justamente lo que dejó vivir cuatro campos sin lector hasta el S4.
 *
 * Cuando esto falle, la pregunta no es «¿cómo lo arreglo?» sino **«¿quién lee el campo nuevo?»**.
 * Si la respuesta es «nadie todavía», el campo no cruza la frontera.
 */
const CLAVES_DEL_RESULTADO: Record<keyof ResultadoDeTransformacion, true> = {
  hashDePolitica: true,
  idioma: true,
  balance: true,
  utilidad: true,
  suprimidas: true,
  muestras: true,
  ms: true,
  // S7: lo lee el certificado (`seccionDeLaGeneralizacion`), que cuenta la óptima y sus fuentes.
  generalizacion: true,
  // S7: lo leen el panel de privacidad, el certificado y la bitácora (`privacidad?` de la entrada).
  privacidad: true,
};

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

describe("el contrato del tratamiento (§5 — deuda B2)", () => {
  it("cruzan nueve campos, y cada uno tiene su lector", () => {
    // Los nombres se escriben aquí para que un humano los lea, no porque el runtime los necesite:
    // la garantía fuerte la da el tipo de `CLAVES_DEL_RESULTADO`, que no compila si sobra o falta
    // uno. Esta lista obliga además a que el campo nuevo se vea en el diff del PR. `idioma` (el del
    // TRABAJO) lo lee el certificado, que declara en qué idioma quedaron escritos los rótulos del
    // archivo aunque el documento se descargue en otro.
    expect(Object.keys(CLAVES_DEL_RESULTADO).sort()).toEqual([
      "balance",
      "generalizacion",
      "hashDePolitica",
      "idioma",
      "ms",
      "muestras",
      "privacidad",
      "suprimidas",
      "utilidad",
    ]);
  });

  it("las cuatro estructuras crudas del reparto NO cruzan", () => {
    // El pago de B2, escrito como test y no solo como commit: `mondrian`, `diversidad`,
    // `colisiones` y `pendientesDeMondrian` las consume `balanceDelTratamiento` dentro del worker.
    // Lo que la pantalla recibe es la conclusión —`balance.salvedades`—, no la materia prima.
    for (const crudo of [
      "mondrian",
      "diversidad",
      "colisiones",
      "pendientesDeMondrian",
    ]) {
      expect(CLAVES_DEL_RESULTADO).not.toHaveProperty(crudo);
    }
  });
});

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

describe("la llave con la sal pegada", () => {
  const SAL = "00112233445566778899aabbccddeeff";

  it("con una sal pegada la llave se deriva con ESA sal y la pantalla la enseña", () => {
    const worker = conArchivo();
    act(() => derivarLlaveDelProyecto("dos toros y una brújula", SAL));
    const enviado = worker.enviados.at(-1) as { sal: string };
    expect(enviado.sal).toBe(SAL);
    worker.responde({ tipo: "llave-lista", huella: "a1b2c3d4e5f6" });
    expect(taller.llave).toEqual({
      fase: "lista",
      huella: "a1b2c3d4e5f6",
      sal: SAL,
    });
  });

  it("la sal se normaliza antes de viajar: sin espacios y en minúscula", () => {
    const worker = conArchivo();
    act(() => derivarLlaveDelProyecto("frase", ` ${SAL.toUpperCase()}\n`));
    expect((worker.enviados.at(-1) as { sal: string }).sal).toBe(SAL);
  });

  it("una sal mal formada no deriva nada: el segundo cerrojo", () => {
    const worker = conArchivo();
    const antes = worker.enviados.length;
    act(() => derivarLlaveDelProyecto("frase", "no-soy-una-sal"));
    expect(worker.enviados).toHaveLength(antes);
    expect(taller.llave).toEqual({ fase: "sin-llave" });
  });

  it("sin sal pegada, cada llave nueva estrena la suya", () => {
    const worker = conArchivo();
    act(() => derivarLlaveDelProyecto("frase"));
    const primera = (worker.enviados.at(-1) as { sal: string }).sal;
    act(() => derivarLlaveDelProyecto("frase"));
    const segunda = (worker.enviados.at(-1) as { sal: string }).sal;
    expect(primera).toMatch(/^[0-9a-f]{32}$/);
    expect(segunda).not.toBe(primera);
  });
});

describe("la transformación", () => {
  it("el resultado del worker es lo que la pantalla lee", () => {
    const worker = conArchivo();
    act(() => transformar(POLITICA));
    expect(worker.enviados.at(-1)).toEqual({
      tipo: "transformar",
      politica: POLITICA,
      idioma: "es",
    });

    worker.responde({ tipo: "transformado", resultado: RESULTADO });
    expect(taller.transformacion).toEqual({
      fase: "hecha",
      resultado: RESULTADO,
    });
    expect(taller.etapa).toBeNull();
  });

  it("el idioma del trabajo es el de la pantalla al pulsar, y construir el archivo no lleva ninguno", () => {
    const worker = conArchivo();
    act(() => fijarIdioma("en"));
    act(() => transformar(POLITICA));
    expect(worker.enviados.at(-1)).toEqual({
      tipo: "transformar",
      politica: POLITICA,
      idioma: "en",
    });

    // Cambiar de idioma DESPUÉS no reescribe el archivo ya transformado: construirlo no pregunta
    // por idioma alguno, la tabla guardada nació en el del trabajo.
    act(() => fijarIdioma("es"));
    act(() => prepararArchivo());
    expect(worker.enviados.at(-1)).toEqual({ tipo: "construir-archivo" });
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

  it("S10: un fallo al ESCRIBIR no tumba nada: informe, llave y transformación siguen, y se reintenta", () => {
    const worker = conArchivo();
    worker.responde({
      tipo: "listo",
      informe: { archivo: { nombre: "tabla.csv" } } as never,
    });
    act(() => derivarLlaveDelProyecto("frase"));
    worker.responde({ tipo: "llave-lista", huella: "a1b2c3d4e5f6" });
    const llave = taller.llave;
    act(() => transformar(POLITICA));
    const transformacion = taller.transformacion;
    act(() => prepararArchivo());
    worker.responde({ tipo: "error", motivo: "escritura-fallida" });

    expect(sesion.fase).toBe("listo");
    expect(taller.llave).toEqual(llave);
    expect(taller.transformacion).toEqual(transformacion);
    expect(taller.escrituraFallida).toBe(true);
    expect(taller.etapa).toBeNull();

    act(() => prepararArchivo());
    expect(taller.escrituraFallida).toBe(false);
    expect(worker.enviados.at(-1)).toEqual({ tipo: "construir-archivo" });
  });

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
      pedirEstimacion(1000);
      limpiar();
      compararGeneralizacion(POLITICA, {});
    });
    expect(WorkerDeMentira.ultimo).toBeNull();
    // La forma COMPLETA, a propósito: un campo nuevo en el taller tiene que pasar por aquí y ser
    // mirado. Cazó los dos de la bóveda en el S3, la huella de salida en el S4 y ahora los dos de
    // la estimación.
    expect(taller).toEqual({
      llave: { fase: "sin-llave" },
      transformacion: { fase: "sin-hacer" },
      etapa: null,
      archivo: null,
      archivoEnDisco: null,
      archivoEnPartes: null,
      huellaDeSalida: null,
      escrituraFallida: false,
      boveda: { fase: "sin-sellar" },
      archivoDeBoveda: null,
      estimacion: null,
      // Sin worker, `pedirEstimacion` sale antes de tocar el estado: si publicara la población
      // primero, la pantalla enseñaría un dato declarado que nadie va a poder usar.
      poblacionDeclarada: null,
      // Y la limpieza de metadatos (S6): sin worker, `limpiar` tampoco publica «limpiando».
      limpieza: { fase: "sin-hacer" },
      // Y la comparación de Mondrian con la óptima (S7): sin worker, no queda «comparando».
      comparacion: { fase: "sin-hacer" },
    });
  });
});
