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

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Regreso } from "@/components/regreso";
import { fijarIdioma } from "@/lib/idioma/estado";
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

// Anotado y NO `as unknown as`: el cast era lo que dejaba al fixture declarar campos que el contrato
// ya no tiene —así llegaron `sinAparecer` y `fueraDeAlcance` a sobrevivir sin lector hasta la
// auditoría—. Con la anotación directa, TypeScript contextualiza `"completo"` como su literal Y
// rechaza cualquier campo de más.
const RESUMEN_DEL_REGRESO: ResumenDelRegreso = {
  columnas: [],
  reconocimiento: "completo",
  totales: { restauradas: 445_806, ambiguas: 200, desconocidas: 0 },
  proporcionRestaurada: 0.9995,
  salvedades: [],
  esTitular: false,
  filas: 446_006,
};

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

  // La misma guardia para el otro resumen, que es la que faltaba: la auditoría encontró
  // `sinAparecer` y `fueraDeAlcance` cruzando la frontera sin que nadie los leyera, y un campo sin
  // lector no lo caza el typecheck —compila perfectamente—. Lo caza esta lista. Cambiarla obliga a
  // mirar el campo nuevo y preguntarse quién lo consume, que es justo lo que §5 pide.
  it("del regreso solo vienen conteos, y cada campo tiene su lector", () => {
    conTodoCargado();
    act(() =>
      WorkerDeMentira.ultimo!.responde({
        tipo: "restaurado",
        resumen: RESUMEN_DEL_REGRESO,
      }),
    );
    expect(Object.keys(RESUMEN_DEL_REGRESO).sort()).toEqual([
      "columnas",
      "esTitular",
      "filas",
      "proporcionRestaurada",
      "reconocimiento",
      "salvedades",
      "totales",
    ]);
  });

  it("una bóveda rechazada trae su motivo y su detalle, no un «archivo inválido»", () => {
    render(<Sonda />);
    act(() => abrirLaBoveda(archivoDe("cualquiera.csv"), FRASE));
    WorkerDeMentira.ultimo!.responde({
      tipo: "boveda-rechazada",
      motivo: "frase-incorrecta",
      // El worker no manda frases: manda una clave del catálogo del motor.
      detalle: { clave: "cifrado.fraseNoAbre.boveda" },
    });
    expect(regreso.boveda).toMatchObject({
      fase: "rechazada",
      motivo: "frase-incorrecta",
      detalle: { clave: "cifrado.fraseNoAbre.boveda" },
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
      // Y el idioma también: el informe se escribe en el de la pantalla donde se pidió.
      idioma: "es",
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
      escrituraFallida: false,
    });
  });

  it("S10: un fallo al escribir el restaurado deja el devuelto y la restauración, y se reintenta", () => {
    render(<Sonda />);
    act(() => cargarDevuelto(archivoDe("devuelto.csv")));
    const devuelto = regreso.devuelto;
    act(() => prepararRestaurado());
    act(() =>
      WorkerDeMentira.ultimo!.responde({
        tipo: "error",
        motivo: "escritura-fallida",
      }),
    );
    expect(regreso.devuelto).toEqual(devuelto);
    expect(regreso.escrituraFallida).toBe(true);
    expect(regreso.etapa).toBeNull();
    act(() => prepararRestaurado());
    expect(regreso.escrituraFallida).toBe(false);
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

// ── En inglés ───────────────────────────────────────────────────────────────────────────────────
// La misma pantalla, con el mismo contrato de honestidad: el aviso de ambigüedad antes del botón, la
// cifra de restauración nunca sin lo que la matiza, y los números a la inglesa.

const RESUMEN_CON_SALVEDADES: ResumenDelRegreso = {
  columnas: [],
  reconocimiento: "parcial",
  totales: { restauradas: 900, ambiguas: 100, desconocidas: 0 },
  proporcionRestaurada: 0.9,
  salvedades: [
    {
      gravedad: "descalifica",
      tipo: "celdas-ambiguas",
      cuantas: 100,
      proporcion: 0.1,
    },
    {
      gravedad: "descalifica",
      tipo: "columnas-sin-aparecer",
      columnas: ["cedula", "nit"],
    },
  ],
  esTitular: false,
  filas: 1_000,
};

describe("el regreso en inglés", () => {
  it("avisa de lo que no va a volver ANTES de restaurar, con las cifras a la inglesa", () => {
    fijarIdioma("en");
    render(<Regreso />);
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

    expect(screen.getByText("446,006")).toBeInTheDocument();
    expect(screen.getByText(/446,006 rows · 3 columns\./)).toBeInTheDocument();
    const aviso = screen.getByText(
      "100 pseudonyms in this vault match more than one original value.",
    );
    const restaurar = screen.getByRole("button", {
      name: "Restore the original values",
    });
    // El aviso va antes del botón: contarle el precio cuando ya pagó es la composición engañosa.
    expect(
      aviso.compareDocumentPosition(restaurar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("la cifra de restauración nunca va sin lo que la matiza, y no promete de más", () => {
    fijarIdioma("en");
    render(<Regreso />);
    act(() => abrirLaBoveda(archivoDe("velo-boveda.velo"), FRASE));
    const worker = WorkerDeMentira.ultimo!;
    worker.responde({ tipo: "boveda-abierta", resumen: RESUMEN_DE_BOVEDA });
    act(() => cargarDevuelto(archivoDe("devuelto.csv")));
    worker.responde({
      tipo: "devuelto-listo",
      nombre: "devuelto.csv",
      bytes: 2048,
      filas: 1_000,
      columnas: 3,
      sha256: "c".repeat(64),
    });
    act(() => restaurarAhora());
    worker.responde({ tipo: "restaurado", resumen: RESUMEN_CON_SALVEDADES });

    expect(
      screen.getByRole("heading", {
        name: "Some of the vault's columns did not appear",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/100 cells came back unresolved/),
    ).toBeInTheDocument();
    // El nombre de las columnas del usuario va tal cual, sin pasar por el énfasis.
    expect(
      screen.getByText(
        /did not appear in the returned file: cedula · nit\. The percentage does not count them\./,
      ),
    ).toBeInTheDocument();
    // La cifra lleva su denominador y, pegado, el aviso de que no describe un archivo recuperado.
    expect(
      screen.getByText(/900 of 1,000 cells with content came back \(90%\)\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "That figure does not describe a file recovered in full",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /fully recovered|100% restored|completely restored/i,
    );
  });

  it("una bóveda rechazada se explica en inglés, y en español sigue igual", () => {
    fijarIdioma("en");
    render(<Regreso />);
    act(() => abrirLaBoveda(archivoDe("cualquiera.csv"), FRASE));
    WorkerDeMentira.ultimo!.responde({
      tipo: "boveda-rechazada",
      motivo: "frase-incorrecta",
      detalle: { clave: "cifrado.fraseNoAbre.boveda" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That passphrase does not open this vault. You also get this message if the file was damaged or has been modified.",
    );

    act(() => fijarIdioma("es"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La frase no abre esta bóveda. También sale este mensaje si el archivo se dañó o lo modificaron.",
    );
  });

  it("el informe se pide en el idioma de la pantalla, con la fecha a la inglesa", () => {
    fijarIdioma("en");
    render(<Regreso />);
    act(() => abrirLaBoveda(archivoDe("velo-boveda.velo"), FRASE));
    const worker = WorkerDeMentira.ultimo!;
    worker.responde({ tipo: "boveda-abierta", resumen: RESUMEN_DE_BOVEDA });
    act(() => cargarDevuelto(archivoDe("devuelto.csv")));
    worker.responde({
      tipo: "devuelto-listo",
      nombre: "devuelto.csv",
      bytes: 2048,
      filas: 1_000,
      columnas: 3,
      sha256: "c".repeat(64),
    });
    act(() => restaurarAhora());
    worker.responde({ tipo: "restaurado", resumen: RESUMEN_CON_SALVEDADES });

    fireEvent.click(screen.getByRole("button", { name: "Prepare the report" }));
    expect(worker.enviados.at(-1)).toMatchObject({
      tipo: "construir-informe-del-regreso",
      idioma: "en",
      fecha: expect.stringMatching(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/),
    });
  });
});
