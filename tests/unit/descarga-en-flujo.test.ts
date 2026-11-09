// @vitest-environment jsdom
//
// S11 · La descarga en streaming, del lado de la página, contra un service worker de mentira: lo
// que se comprueba es el protocolo (registro, canal, marco oculto, señal «servido») y que cualquier
// falla cae a `null`, que es la señal de pasar al respaldo por partes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abrirDescargaEnFlujo,
  ESPERA_DEL_SERVICE_WORKER_MS,
  LATIDO_DEL_SERVICE_WORKER_MS,
} from "@/lib/descarga-en-flujo";

type Estado = "installing" | "installed" | "activated" | "redundant";

class ServiceWorkerFalso extends EventTarget {
  state: Estado;
  mensajes: { datos: unknown; puertos: MessagePort[] }[] = [];
  constructor(estado: Estado) {
    super();
    this.state = estado;
  }
  postMessage(datos: unknown, puertos: MessagePort[] = []) {
    this.mensajes.push({ datos, puertos });
  }
  cambiarA(estado: Estado) {
    this.state = estado;
    this.dispatchEvent(new Event("statechange"));
  }
}

function instalar(registro: unknown | (() => Promise<unknown>)) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(
        typeof registro === "function"
          ? (registro as () => Promise<unknown>)
          : async () => registro,
      ),
    },
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("abrirDescargaEnFlujo", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    // @ts-expect-error: se quita el falso para que el siguiente caso parta limpio
    delete navigator.serviceWorker;
    vi.restoreAllMocks();
  });

  it("sin service worker en el navegador devuelve null", async () => {
    expect(await abrirDescargaEnFlujo(50)).toBeNull();
  });

  it("registra con el ámbito /descarga/, abre un marco oculto y espera «servido»", async () => {
    const sw = new ServiceWorkerFalso("activated");
    instalar({ installing: null, waiting: null, active: sw });
    const promesa = abrirDescargaEnFlujo(2_000);
    await esperar(20);

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      "/velo-descarga-sw.js",
      { scope: "/descarga/" },
    );
    // El id y UN extremo del canal viajan al service worker.
    expect(sw.mensajes).toHaveLength(1);
    const { datos, puertos } = sw.mensajes[0];
    const { tipo, id } = datos as { tipo: string; id: string };
    expect(tipo).toBe("abrir");
    expect(puertos).toHaveLength(1);
    // La navegación del marco es lo que el service worker atiende.
    const marco = document.querySelector("iframe")!;
    expect(marco.hidden).toBe(true);
    expect(marco.getAttribute("aria-hidden")).toBe("true");
    expect(marco.tabIndex).toBe(-1);
    expect(marco.getAttribute("src")).toBe(`/descarga/${id}`);

    // El service worker atiende: lo dice por su extremo del canal.
    puertos[0].postMessage({ tipo: "servido" });
    const abierta = await promesa;
    expect(abierta).not.toBeNull();
    expect(abierta!.puerto).toBeInstanceOf(MessagePort);
    abierta!.cerrar();
    expect(document.querySelector("iframe")).toBeNull();
    abierta!.puerto.close();
    puertos[0].close();
  });

  it("le manda un latido al service worker mientras dura la descarga y lo detiene al cerrar", async () => {
    const sw = new ServiceWorkerFalso("activated");
    instalar({ installing: null, waiting: null, active: sw });
    const intervalos = vi.spyOn(globalThis, "setInterval");
    const limpiezas = vi.spyOn(globalThis, "clearInterval");
    const promesa = abrirDescargaEnFlujo(2_000);
    await esperar(20);
    sw.mensajes[0].puertos[0].postMessage({ tipo: "servido" });
    const abierta = await promesa;

    const llamada = intervalos.mock.calls.find(
      ([, ms]) => ms === LATIDO_DEL_SERVICE_WORKER_MS,
    );
    expect(llamada).toBeDefined();
    (llamada![0] as () => void)();
    expect(sw.mensajes.map((m) => m.datos)).toContainEqual({ tipo: "latido" });

    const antes = limpiezas.mock.calls.length;
    abierta!.cerrar();
    expect(limpiezas.mock.calls.length).toBeGreaterThan(antes);
    abierta!.puerto.close();
    sw.mensajes[0].puertos[0].close();
  });

  it("cancelar() le pide al service worker cortar esa descarga, por su id", async () => {
    const sw = new ServiceWorkerFalso("activated");
    instalar({ installing: null, waiting: null, active: sw });
    const promesa = abrirDescargaEnFlujo(2_000);
    await esperar(20);
    const { id } = sw.mensajes[0].datos as { id: string };
    sw.mensajes[0].puertos[0].postMessage({ tipo: "servido" });
    const abierta = await promesa;

    abierta!.cancelar();
    expect(sw.mensajes.map((m) => m.datos)).toContainEqual({
      tipo: "cancelar",
      id,
    });
    abierta!.cerrar();
    abierta!.puerto.close();
    sw.mensajes[0].puertos[0].close();
  });

  it("un service worker que se queda instalando no deja colgada la salida: devuelve null", async () => {
    const sw = new ServiceWorkerFalso("installing");
    instalar({ installing: sw, waiting: null, active: null });
    expect(await abrirDescargaEnFlujo(40)).toBeNull();
    expect(sw.mensajes).toHaveLength(0);
  });

  it("espera a que el service worker termine de activarse", async () => {
    const sw = new ServiceWorkerFalso("installing");
    instalar({ installing: sw, waiting: null, active: null });
    const promesa = abrirDescargaEnFlujo(2_000);
    await esperar(20);
    expect(sw.mensajes).toHaveLength(0);

    sw.cambiarA("installed");
    await esperar(5);
    expect(sw.mensajes).toHaveLength(0);
    sw.cambiarA("activated");
    await esperar(20);
    expect(sw.mensajes).toHaveLength(1);

    sw.mensajes[0].puertos[0].postMessage({ tipo: "servido" });
    const abierta = await promesa;
    expect(abierta).not.toBeNull();
    abierta!.cerrar();
    abierta!.puerto.close();
    sw.mensajes[0].puertos[0].close();
  });

  it("si el service worker queda redundante, devuelve null", async () => {
    const sw = new ServiceWorkerFalso("installing");
    instalar({ installing: sw, waiting: null, active: null });
    const promesa = abrirDescargaEnFlujo(2_000);
    await esperar(10);
    sw.cambiarA("redundant");
    expect(await promesa).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("si el registro no trae ningún service worker, devuelve null", async () => {
    instalar({ installing: null, waiting: null, active: null });
    expect(await abrirDescargaEnFlujo(50)).toBeNull();
  });

  it("si el registro falla, devuelve null", async () => {
    instalar(async () => {
      throw new Error("bloqueado");
    });
    expect(await abrirDescargaEnFlujo(50)).toBeNull();
  });

  it("si nadie dice «servido» a tiempo, quita el marco y devuelve null", async () => {
    const sw = new ServiceWorkerFalso("activated");
    instalar({ installing: null, waiting: null, active: sw });
    expect(await abrirDescargaEnFlujo(40)).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    sw.mensajes[0]?.puertos[0].close();
  });

  it("la espera por defecto es de unos segundos, no de minutos", () => {
    expect(ESPERA_DEL_SERVICE_WORKER_MS).toBeGreaterThanOrEqual(1_000);
    expect(ESPERA_DEL_SERVICE_WORKER_MS).toBeLessThanOrEqual(10_000);
  });
});
