// @vitest-environment node
//
// S11 · El service worker de la descarga (`public/velo-descarga-sw.js`), ejecutado de verdad en un
// contexto aislado con un `self` de mentira: la contrapresión (un trozo por vez), la cancelación del
// navegador, el aborto del worker, el corte que pide la página cuando el worker muere a medias, y
// que una petición sin descarga abierta no se responde.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const CODIGO = readFileSync(
  join(process.cwd(), "public", "velo-descarga-sw.js"),
  "utf8",
);

interface PuertoFalso {
  mandados: { tipo: string }[];
  cerrado: boolean;
  onmessage: ((m: { data: unknown }) => void) | null;
  postMessage(dato: { tipo: string }): void;
  close(): void;
}

function puertoFalso(): PuertoFalso {
  const p: PuertoFalso = {
    mandados: [],
    cerrado: false,
    onmessage: null,
    postMessage(dato) {
      p.mandados.push(dato);
    },
    close() {
      p.cerrado = true;
    },
  };
  return p;
}

function nuevoServiceWorker() {
  const oyentes: Record<string, ((e: unknown) => void)[]> = {};
  const self = {
    addEventListener(tipo: string, f: (e: unknown) => void) {
      (oyentes[tipo] ??= []).push(f);
    },
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  runInNewContext(CODIGO, {
    self,
    ReadableStream,
    CountQueuingStrategy,
    Response,
    URL,
    Map,
    Error,
    String,
    encodeURIComponent,
    decodeURIComponent,
  });
  const disparar = (tipo: string, evento: unknown) =>
    oyentes[tipo].forEach((f) => f(evento));
  return {
    abrir(id: string, puerto: PuertoFalso) {
      disparar("message", { data: { tipo: "abrir", id }, ports: [puerto] });
    },
    mensaje(datos: unknown) {
      disparar("message", { data: datos, ports: [] });
    },
    /** Devuelve la respuesta si el service worker la atiende, o `null` si deja pasar la petición. */
    async pedir(ruta: string): Promise<Response | null> {
      let promesa: Promise<Response> | null = null;
      disparar("fetch", {
        request: { url: `http://127.0.0.1:3300${ruta}` },
        respondWith(p: Promise<Response>) {
          promesa = p;
        },
      });
      return promesa ? await promesa : null;
    },
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 5));
const tipos = (p: PuertoFalso) => p.mandados.map((m) => m.tipo);
const trozo = (puerto: PuertoFalso, bytes: number[]) =>
  puerto.onmessage!({
    data: { tipo: "trozo", bytes: new Uint8Array(bytes) },
  });

/** Abre una descarga, la atiende y deja la respuesta lista para leerse. */
async function descargaLista(id = "abc", nombre = "velo-x.csv") {
  const sw = nuevoServiceWorker();
  const puerto = puertoFalso();
  sw.abrir(id, puerto);
  const pendiente = sw.pedir(`/descarga/${id}`);
  puerto.onmessage!({ data: { tipo: "adelante", nombre, mime: "text/csv" } });
  const respuesta = (await pendiente)!;
  return { sw, puerto, respuesta };
}

describe("el service worker de la descarga", () => {
  it("sin una descarga abierta para ese id deja pasar la petición", async () => {
    const sw = nuevoServiceWorker();
    expect(await sw.pedir("/descarga/nadie")).toBeNull();
    expect(await sw.pedir("/otra-ruta")).toBeNull();
  });

  it("responde con el nombre y el tipo que manda el worker, y avisa que atendió", async () => {
    const { puerto, respuesta } = await descargaLista("a1", "velo ñ's.csv");
    expect(tipos(puerto)).toContain("servido");
    expect(respuesta.headers.get("content-type")).toBe("text/csv");
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
    const disposicion = respuesta.headers.get("content-disposition")!;
    expect(disposicion).toContain("attachment");
    expect(disposicion).toContain('filename="velo _\'s.csv"');
    // RFC 5987: el apóstrofo también va escapado.
    expect(disposicion).toContain("filename*=UTF-8''velo%20%C3%B1%27s.csv");
  });

  it("pide un trozo por vez y entrega los bytes en orden hasta el fin", async () => {
    const { puerto, respuesta } = await descargaLista();
    const lector = respuesta.body!.getReader();
    const primero = lector.read();
    await esperar();
    // Con la lectura pendiente hay UN crédito, no más.
    expect(tipos(puerto).filter((t) => t === "pide")).toHaveLength(1);
    trozo(puerto, [1, 2]);
    expect((await primero).value).toEqual(new Uint8Array([1, 2]));

    const segundo = lector.read();
    await esperar();
    expect(tipos(puerto).filter((t) => t === "pide")).toHaveLength(2);
    trozo(puerto, [3]);
    expect((await segundo).value).toEqual(new Uint8Array([3]));

    const ultimo = lector.read();
    puerto.onmessage!({ data: { tipo: "fin" } });
    expect((await ultimo).done).toBe(true);
    expect(puerto.cerrado).toBe(true);
  });

  it("si el navegador cancela la descarga, se lo dice al worker", async () => {
    const { puerto, respuesta } = await descargaLista();
    const lector = respuesta.body!.getReader();
    void lector.read();
    await esperar();
    await lector.cancel();
    expect(tipos(puerto)).toContain("cancelado");
    expect(puerto.cerrado).toBe(true);
  });

  it("si el worker aborta, la lectura falla y no entrega un archivo a medias", async () => {
    const { puerto, respuesta } = await descargaLista();
    const lector = respuesta.body!.getReader();
    const lectura = lector.read();
    await esperar();
    puerto.onmessage!({ data: { tipo: "abortar" } });
    await expect(lectura).rejects.toThrow("descarga abortada");
  });

  it("si la página pide cortar con el worker muerto a medias, la lectura falla", async () => {
    const { sw, puerto, respuesta } = await descargaLista("m1");
    const lector = respuesta.body!.getReader();
    const lectura = lector.read();
    await esperar();
    sw.mensaje({ tipo: "cancelar", id: "m1" });
    await expect(lectura).rejects.toThrow("cancelada por la página");
    expect(puerto.cerrado).toBe(true);
  });

  it("pedir cortar un archivo que ya terminó de escribirse no lo toca", async () => {
    const { sw, puerto, respuesta } = await descargaLista("t1");
    await esperar();
    // El worker ya escribió todo, pero el navegador todavía no leyó nada: el trozo y el cierre
    // esperan en la cola del flujo. Cortar ahora los descartaría y dejaría el archivo truncado.
    trozo(puerto, [7, 8, 9]);
    puerto.onmessage!({ data: { tipo: "fin" } });
    sw.mensaje({ tipo: "cancelar", id: "t1" });
    const lector = respuesta.body!.getReader();
    expect((await lector.read()).value).toEqual(new Uint8Array([7, 8, 9]));
    expect((await lector.read()).done).toBe(true);
  });

  it("pedir cortar una descarga abierta que el navegador aún no pidió cierra su canal", async () => {
    const sw = nuevoServiceWorker();
    const puerto = puertoFalso();
    sw.abrir("sin-pedir", puerto);
    sw.mensaje({ tipo: "cancelar", id: "sin-pedir" });
    expect(puerto.cerrado).toBe(true);
    // Y ya no se sirve.
    expect(await sw.pedir("/descarga/sin-pedir")).toBeNull();
  });

  it("ignora los latidos y los mensajes que no conoce", () => {
    const sw = nuevoServiceWorker();
    expect(() => sw.mensaje({ tipo: "latido" })).not.toThrow();
    expect(() => sw.mensaje(null)).not.toThrow();
    expect(() => sw.mensaje({ tipo: "otra-cosa" })).not.toThrow();
  });
});
