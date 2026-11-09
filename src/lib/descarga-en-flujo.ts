// S11 · La descarga en streaming, del lado de la página.
//
// Sin selector de archivo del sistema (Firefox, Safari), el archivo grande se juntaba en un Blob
// dentro del worker: en memoria, entero, antes de poder guardarse. Aquí la página abre un canal
// entre el worker y un service worker propio (`public/velo-descarga-sw.js`, ámbito `/descarga/`) y
// dispara la descarga del navegador hacia esa dirección: los trozos fluyen worker → service worker
// → carpeta de descargas, uno por vez.
//
// **La página no ve un solo byte.** Crea el canal, entrega un extremo al service worker y el otro
// al worker, y navega a `/descarga/<id>`; lo que corre por el canal ni pasa por ella (regla dura 7).
// Si el service worker no atiende —no existe, está bloqueado, falla—, devuelve `null` y la sesión
// cae a la salida por partes (`src/workers/destino.ts`).

/** Cuánto se espera a que el service worker diga que atendió la descarga. */
export const ESPERA_DEL_SERVICE_WORKER_MS = 5_000;

/**
 * Cada cuánto la página le manda un latido al service worker mientras dura la descarga. Firefox apaga
 * un service worker tras unos 30 s sin eventos, y los mensajes del canal con el worker no cuentan:
 * un archivo de ~400 MB, que tarda más que eso en salir, se quedaba a medias (medido en el S11). Un
 * mensaje al service worker sí es un evento y reinicia ese reloj.
 */
export const LATIDO_DEL_SERVICE_WORKER_MS = 10_000;

const SCRIPT = "/velo-descarga-sw.js";
const AMBITO = "/descarga/";

export interface DescargaAbierta {
  /** El extremo del canal que se le entrega al worker (transferible). */
  readonly puerto: MessagePort;
  /** Quita el marco de la descarga y detiene el latido. Se llama al soltar el archivo o al fallar. */
  cerrar(): void;
}

/** Espera a que el service worker de la página termine de activarse. */
async function activo(
  registro: ServiceWorkerRegistration,
): Promise<ServiceWorker | null> {
  const instalando = registro.installing ?? registro.waiting ?? registro.active;
  if (!instalando) return null;
  if (instalando.state === "activated") return instalando;
  return new Promise((resolver) => {
    instalando.addEventListener("statechange", () => {
      if (instalando.state === "activated") resolver(instalando);
      else if (instalando.state === "redundant") resolver(null);
    });
  });
}

/**
 * Abre una descarga en streaming, o devuelve `null` si este navegador (o este momento) no la
 * permite. `null` no es un error: es la señal de pasar al respaldo por partes.
 */
export async function abrirDescargaEnFlujo(
  esperaMs: number = ESPERA_DEL_SERVICE_WORKER_MS,
): Promise<DescargaAbierta | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return null;
  try {
    const registro = await navigator.serviceWorker.register(SCRIPT, {
      scope: AMBITO,
    });
    const servidor = await activo(registro);
    if (!servidor) return null;

    const canal = new MessageChannel();
    const id = crypto.randomUUID();
    servidor.postMessage({ tipo: "abrir", id }, [canal.port2]);

    // La navegación (y no un `<a download>`) es lo que atraviesa el service worker en Chromium y en
    // WebKit; un marco oculto, además, deja la pantalla donde está si algo sale mal.
    const marco = document.createElement("iframe");
    marco.hidden = true;
    marco.setAttribute("aria-hidden", "true");
    marco.tabIndex = -1;
    marco.src = `${AMBITO}${id}`;
    const latido = setInterval(
      () => servidor.postMessage({ tipo: "latido" }),
      LATIDO_DEL_SERVICE_WORKER_MS,
    );
    const cerrar = () => {
      clearInterval(latido);
      marco.remove();
    };
    document.body.append(marco);

    const servido = await new Promise<boolean>((resolver) => {
      const reloj = setTimeout(() => resolver(false), esperaMs);
      canal.port1.onmessage = (mensaje) => {
        if ((mensaje.data as { tipo?: string } | null)?.tipo === "servido") {
          clearTimeout(reloj);
          resolver(true);
        }
      };
    });
    canal.port1.onmessage = null;
    if (!servido) {
      canal.port1.close();
      cerrar();
      return null;
    }
    return { puerto: canal.port1, cerrar };
  } catch {
    return null;
  }
}
