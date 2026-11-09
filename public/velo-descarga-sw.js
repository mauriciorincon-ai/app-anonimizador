// Velo · descarga en streaming (S11).
//
// Un service worker de UN solo oficio: dejar que el archivo anonimizado de un CSV de alto volumen
// salga hacia la carpeta de descargas MIENTRAS el worker lo escribe, sin juntarlo antes en un Blob.
//
// Lo que NO hace, y lo vigila `tests/unit/privacidad.test.ts` (que barre este archivo):
//   - no guarda nada: ni Cache API ni almacenamiento del navegador; los bytes pasan y se sueltan;
//   - no pide nada a la red: responde a /descarga/<id> con lo que le llega por un MessagePort;
//   - no importa otros scripts.
// Los bytes que ve son los de SALIDA, ya anonimizados: los mismos que llevaría el Blob (regla 7).
//
// El ámbito es /descarga/, no la raíz: no intercepta la navegación de ninguna pantalla de Velo.

"use strict";

/** id → { puerto }. Vive en memoria del service worker y se borra al servirse. */
const abiertas = new Map();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

// La página abre una descarga: el id y UN extremo del canal. El nombre y el tipo del archivo no los
// sabe la página (el worker los calcula): llegan por el canal, en el mensaje «adelante».
self.addEventListener("message", (evento) => {
  const datos = evento.data;
  // «latido»: la página lo manda cada pocos segundos para que el navegador no apague este service
  // worker a mitad de una descarga larga. Recibirlo es todo lo que hace falta.
  if (!datos || datos.tipo !== "abrir" || !evento.ports[0]) return;
  abiertas.set(String(datos.id), { puerto: evento.ports[0] });
});

/** El nombre en la cabecera: ASCII para los viejos y UTF-8 codificado (RFC 6266) para los demás. */
function disposicion(nombre) {
  const ascii = nombre.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);
  if (!url.pathname.startsWith("/descarga/")) return;
  const id = decodeURIComponent(url.pathname.slice("/descarga/".length));
  const abierta = abiertas.get(id);
  // Sin descarga abierta, no se responde: la petición sigue su camino (y el e2e de red la denuncia).
  if (!abierta) return;
  abiertas.delete(id);

  const { puerto } = abierta;
  let control = null;
  let adelante = false;
  let esperando = null;
  let responder = null;

  puerto.onmessage = (mensaje) => {
    const datos = mensaje.data;
    if (!datos) return;
    if (datos.tipo === "adelante") {
      // Con el nombre y el tipo ya se pueden escribir las cabeceras.
      responder(String(datos.nombre), String(datos.mime));
      adelante = true;
      if (esperando) puerto.postMessage({ tipo: "pide" });
    } else if (datos.tipo === "trozo") {
      control.enqueue(datos.bytes);
      if (esperando) esperando();
      esperando = null;
    } else if (datos.tipo === "fin") {
      control.close();
      puerto.close();
    } else if (datos.tipo === "abortar") {
      control.error(new Error("descarga abortada"));
      puerto.close();
    }
  };

  // Un trozo por vez: `pull` pide uno al worker, y el worker no escribe hasta que lo pide. Así la
  // memoria que ocupa el archivo en tránsito es un trozo, no el archivo.
  const flujo = new ReadableStream(
    {
      start(controlador) {
        control = controlador;
      },
      pull() {
        return new Promise((listo) => {
          esperando = listo;
          if (adelante) puerto.postMessage({ tipo: "pide" });
        });
      },
      cancel() {
        puerto.postMessage({ tipo: "cancelado" });
        puerto.close();
      },
    },
    new CountQueuingStrategy({ highWaterMark: 1 }),
  );

  evento.respondWith(
    new Promise((listo) => {
      responder = (nombre, tipo) =>
        listo(
          new Response(flujo, {
            headers: {
              "Content-Type": tipo,
              "Content-Disposition": disposicion(nombre),
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": "no-store",
            },
          }),
        );
    }),
  );
  // La página espera esta señal para saber que el service worker SÍ atendió la descarga.
  puerto.postMessage({ tipo: "servido" });
});
