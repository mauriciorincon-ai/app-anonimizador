// El destino de la escritura por trozos (S10): un fallo al ESCRIBIR sale como «escritura-fallida» y
// no como «lectura-fallida», que tumbaba el informe con la política y la llave. Y lo escrito a medias
// se deshace (`abort`), para que no quede medio archivo en el equipo.

import { Blob as BlobDeNode } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

import type { Politica } from "@/engine/politica";
import { sha256 } from "@/lib/sha256";
import {
  escribirCsv,
  pasadaDeDiagnostico,
  prepararTransformacion,
} from "@/workers/alto-volumen";
import {
  destinoDe,
  FalloAlEscribir,
  motivoDeLaEscritura,
  nombreDeParte,
} from "@/workers/destino";

const CSV = "id,ciudad\n1,Cali\n2,Pasto\n3,Neiva\n";
const codificar = (texto: string) => new TextEncoder().encode(texto);
const blobDe = (texto: string) =>
  new BlobDeNode([codificar(texto)]) as unknown as Blob;
const POLITICA: Politica = {
  version: 1,
  origen: "manual",
  kObjetivo: null,
  reglas: [],
};

async function planDe(texto: string) {
  const archivo = blobDe(texto);
  const huella = sha256(codificar(texto));
  const pasada = await pasadaDeDiagnostico(archivo, { huella });
  const plan = await prepararTransformacion(
    archivo,
    pasada,
    POLITICA,
    null,
    "es",
    huella,
  );
  return { archivo, plan };
}

/** Un archivo elegido con el selector cuyo disco se llena al primer trozo. */
function asaQueFalla() {
  const abort = vi.fn(async () => {});
  const asa = {
    createWritable: async () => ({
      write: async () => {
        throw new Error("QuotaExceededError: el disco está lleno");
      },
      close: async () => {},
      abort,
    }),
  } as unknown as FileSystemFileHandle;
  return { asa, abort };
}

describe("escribir por trozos", () => {
  it("un fallo del destino sale como escritura-fallida, y lo escrito se deshace", async () => {
    const { archivo, plan } = await planDe(CSV);
    const { asa, abort } = asaQueFalla();
    const salida = await destinoDe(asa);
    const error = await escribirCsv(archivo, plan, salida.destino).catch(
      (e: unknown) => e,
    );
    expect(motivoDeLaEscritura(error)).toBe("escritura-fallida");
    await salida.abortar();
    expect(abort).toHaveBeenCalledOnce();
  });

  it("un fallo al LEER (el archivo cambió en el disco) sigue siendo lectura-fallida", async () => {
    const { plan } = await planDe(CSV);
    const otro = blobDe(CSV.replace("Cali", "Lima"));
    const salida = await destinoDe(undefined);
    const error = await escribirCsv(otro, plan, salida.destino).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(motivoDeLaEscritura(error)).toBe("lectura-fallida");
  });

  it("sin selector, el Blob sale con los mismos bytes que se hashearon", async () => {
    const { archivo, plan } = await planDe(CSV);
    const salida = await destinoDe(undefined);
    await escribirCsv(archivo, plan, salida.destino);
    const cerrado = await salida.cerrar("text/csv");
    expect("blob" in cerrado).toBe(true);
    const bytes = new Uint8Array(
      await (cerrado as { blob: Blob }).blob.arrayBuffer(),
    );
    expect(sha256(bytes)).toBe(cerrado.sha256);
    expect(cerrado.bytes).toBe(bytes.length);
  });
});

/** Lo que `escribir` recibe de `escribirCsv`: el encabezado primero y después trozos de filas. */
const ENCABEZADO = "id,ciudad\n";
const TROZOS = [
  "1,Cali\n2,Pasto\n",
  "3,Neiva\n4,Quito\n",
  "5,Lima\n6,Bogotá\n",
  "7,Cusco\n8,Arica\n",
];
const ENTERO = ENCABEZADO + TROZOS.join("");

async function bytesDe(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("S11 · el respaldo por partes", () => {
  it("un archivo que cabe en una parte sale como siempre: un Blob, sin partes ni manifiesto", async () => {
    const salida = await destinoDe(undefined, {
      nombre: "velo-x.csv",
      partes: { limite: 1_000_000 },
    });
    await salida.destino.escribir(ENCABEZADO);
    for (const t of TROZOS) await salida.destino.escribir(t);
    const cerrado = await salida.cerrar("text/csv");
    expect("blob" in cerrado).toBe(true);
    expect("partes" in cerrado).toBe(false);
  });

  it("cortado en partes: pegadas dan EXACTAMENTE los bytes del archivo único, con su huella", async () => {
    const salida = await destinoDe(undefined, {
      nombre: "velo-x.csv",
      partes: { limite: 40 },
    });
    await salida.destino.escribir(ENCABEZADO);
    for (const t of TROZOS) await salida.destino.escribir(t);
    const cerrado = await salida.cerrar("text/csv");
    if (!cerrado.partes || !cerrado.manifiesto)
      throw new Error("debía salir en partes");

    expect(cerrado.partes.length).toBeGreaterThan(1);
    // El encabezado va solo en la primera parte, y ninguna parte termina a media fila.
    const textos = await Promise.all(
      cerrado.partes.map(async (p) =>
        new TextDecoder().decode(await bytesDe(p.blob)),
      ),
    );
    expect(textos[0].startsWith(ENCABEZADO)).toBe(true);
    expect(textos.slice(1).some((t) => t.includes("id,ciudad"))).toBe(false);
    for (const t of textos) expect(t.endsWith("\n")).toBe(true);
    // Las partes llevan al menos una fila, también la primera.
    expect(textos[0].length).toBeGreaterThan(ENCABEZADO.length);

    expect(textos.join("")).toBe(ENTERO);
    expect(cerrado.sha256).toBe(sha256(codificar(ENTERO)));
    expect(cerrado.bytes).toBe(codificar(ENTERO).length);
    for (const [i, parte] of cerrado.partes.entries()) {
      expect(parte.sha256).toBe(sha256(codificar(textos[i])));
      expect(parte.bytes).toBe(codificar(textos[i]).length);
      expect(parte.nombre).toBe(
        nombreDeParte("velo-x.csv", i + 1, cerrado.partes.length),
      );
    }

    const manifiesto = JSON.parse(
      new TextDecoder().decode(await bytesDe(cerrado.manifiesto)),
    ) as {
      archivo: string;
      sha256: string;
      unir: { es: string; en: string };
      partes: { nombre: string; sha256: string }[];
    };
    expect(manifiesto.archivo).toBe("velo-x.csv");
    expect(manifiesto.sha256).toBe(cerrado.sha256);
    expect(manifiesto.partes.map((p) => p.sha256)).toEqual(
      cerrado.partes.map((p) => p.sha256),
    );
    expect(manifiesto.unir.es.length).toBeGreaterThan(10);
    expect(manifiesto.unir.en.length).toBeGreaterThan(10);
  });

  it("sin pedir partes (JSON, regreso) el archivo sale en un solo Blob aunque sea grande", async () => {
    const salida = await destinoDe(undefined, { nombre: "velo-x.csv" });
    await salida.destino.escribir(ENCABEZADO);
    for (const t of TROZOS) await salida.destino.escribir(t);
    const cerrado = await salida.cerrar("text/csv");
    expect("blob" in cerrado).toBe(true);
  });

  it("el nombre de cada parte conserva la extensión", () => {
    expect(nombreDeParte("velo-anonimizado-ab12.csv", 2, 5)).toBe(
      "velo-anonimizado-ab12-parte-2-de-5.csv",
    );
    expect(nombreDeParte("sin-extension", 1, 2)).toBe(
      "sin-extension-parte-1-de-2",
    );
  });
});

/** Un service worker de mentira del otro lado del canal: pide un trozo por vez y los junta. */
function servidorDeMentira(opciones: { cancelarEn?: number } = {}) {
  const { port1, port2 } = new MessageChannel();
  const trozos: Uint8Array[] = [];
  const estado = {
    cabecera: null as { nombre: string; mime: string } | null,
    fin: false,
    abortado: false,
    enVuelo: 0,
    maximoEnVuelo: 0,
  };
  port2.onmessage = (mensaje: MessageEvent) => {
    const d = mensaje.data as {
      tipo: string;
      nombre?: string;
      mime?: string;
      bytes?: Uint8Array;
    };
    if (d.tipo === "adelante") {
      estado.cabecera = { nombre: d.nombre!, mime: d.mime! };
      estado.enVuelo += 1;
      port2.postMessage({ tipo: "pide" });
    } else if (d.tipo === "trozo") {
      trozos.push(d.bytes!);
      estado.maximoEnVuelo = Math.max(estado.maximoEnVuelo, estado.enVuelo);
      if (opciones.cancelarEn === trozos.length)
        port2.postMessage({ tipo: "cancelado" });
      else port2.postMessage({ tipo: "pide" });
    } else if (d.tipo === "fin") estado.fin = true;
    else if (d.tipo === "abortar") estado.abortado = true;
  };
  return { puerto: port1, servidor: port2, trozos, estado };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("S11 · la descarga en streaming (el canal al service worker)", () => {
  it("los bytes que llegan son los que se hashearon, con el nombre y el tipo para las cabeceras", async () => {
    const { puerto, servidor, trozos, estado } = servidorDeMentira();
    const salida = await destinoDe(undefined, {
      nombre: "velo-x.csv",
      mime: "text/csv;charset=utf-8",
      flujo: puerto,
    });
    await salida.destino.escribir(ENCABEZADO);
    for (const t of TROZOS) await salida.destino.escribir(t);
    const cerrado = await salida.cerrar("text/csv");
    await esperar(20);

    expect("enDescarga" in cerrado && cerrado.enDescarga).toBe(true);
    expect("blob" in cerrado).toBe(false);
    expect(estado.cabecera).toEqual({
      nombre: "velo-x.csv",
      mime: "text/csv;charset=utf-8",
    });
    expect(estado.fin).toBe(true);
    const llegado = new TextDecoder().decode(
      Uint8Array.from(trozos.flatMap((t) => [...t])),
    );
    expect(llegado).toBe(ENTERO);
    expect(cerrado.sha256).toBe(sha256(codificar(ENTERO)));
    servidor.close();
  });

  it("sin crédito no escribe: el worker espera a que el service worker pida cada trozo", async () => {
    const { port1, port2 } = new MessageChannel();
    const recibidos: string[] = [];
    port2.onmessage = (m: MessageEvent) => {
      recibidos.push((m.data as { tipo: string }).tipo);
    };
    const salida = await destinoDe(undefined, { flujo: port1 });
    let escrito = false;
    const escritura = salida.destino
      .escribir(ENCABEZADO)
      .then(() => (escrito = true));
    await esperar(30);
    // Solo llegó el «adelante»: ningún trozo salió porque nadie lo pidió.
    expect(recibidos).toEqual(["adelante"]);
    expect(escrito).toBe(false);
    port2.postMessage({ tipo: "pide" });
    await escritura;
    await esperar(20);
    expect(recibidos).toContain("trozo");
    port2.close();
  });

  it("si el usuario cancela la descarga, la escritura falla como escritura-fallida", async () => {
    const { puerto, servidor } = servidorDeMentira({ cancelarEn: 1 });
    const salida = await destinoDe(undefined, { flujo: puerto });
    await salida.destino.escribir(ENCABEZADO);
    await esperar(20);
    const error = await salida.destino
      .escribir(TROZOS[0])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalloAlEscribir);
    expect(motivoDeLaEscritura(error)).toBe("escritura-fallida");
    servidor.close();
  });

  it("abortar avisa al service worker para que la descarga del navegador falle y no quede completa", async () => {
    const { puerto, servidor, estado } = servidorDeMentira();
    const salida = await destinoDe(undefined, { flujo: puerto });
    await salida.destino.escribir(ENCABEZADO);
    await salida.abortar();
    await esperar(20);
    expect(estado.abortado).toBe(true);
    expect(estado.fin).toBe(false);
    servidor.close();
  });
});
