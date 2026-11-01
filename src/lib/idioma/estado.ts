// El idioma elegido — en memoria y en la URL, y en ningún otro sitio.
//
// Mismo patrón que `src/lib/sesion.ts`: un almacén de módulo al que la interfaz se suscribe con
// `useSyncExternalStore`. Sobrevive a la navegación entre pantallas (el módulo no se descarga) y
// muere al recargar, igual que la sesión. Lo único que lo hace volver es el parámetro `?lang=` de
// la URL, que quien comparte un enlace puede escribir a propósito.
//
// NO usa `localStorage`, `sessionStorage` ni cookies: la regla dura nº2 los veta en todo `src/`
// (`tests/unit/privacidad.test.ts`), y un idioma «recordado» seria la primera cosa que Velo
// guarda sin que el usuario la pida.
//
// Primer pintado: el servidor (y la prerrenderización) siempre dice español; en el navegador,
// React compara ese primer pintado con `snapshot()` y, si el navegador pide inglés, repinta una
// vez. No hay error de hidratación: es el comportamiento previsto de `getServerSnapshot`.

import { useSyncExternalStore } from "react";

import { detectarIdioma, IDIOMA_POR_DEFECTO, type Idioma } from "./index";

/** `null` hasta que alguien pregunta por primera vez: leer el navegador en el módulo rompería el servidor. */
let actual: Idioma | null = null;
const oyentes = new Set<() => void>();

function leerDelNavegador(): Idioma {
  if (typeof window === "undefined") return IDIOMA_POR_DEFECTO;
  const parametro = new URLSearchParams(window.location.search).get("lang");
  const preferencias =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  return detectarIdioma(parametro, preferencias);
}

function snapshot(): Idioma {
  if (actual === null) actual = leerDelNavegador();
  return actual;
}

function snapshotDelServidor(): Idioma {
  return IDIOMA_POR_DEFECTO;
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** El idioma de ahora, fuera de React (los documentos que se arman al pulsar lo leen aquí). */
export function idiomaActual(): Idioma {
  return snapshot();
}

/** Cambia el idioma en memoria y avisa a la interfaz. No toca la URL: lo usan las pruebas. */
export function fijarIdioma(idioma: Idioma): void {
  if (actual === idioma) return;
  actual = idioma;
  for (const oyente of [...oyentes]) oyente();
}

/**
 * La elección del usuario: cambia el idioma Y lo escribe en `?lang=` para que el enlace que copie
 * abra igual. `replaceState` y no `pushState`: cambiar de idioma no es una página nueva, y el botón
 * «atrás» no debería pasar por cada vez que lo cambió.
 *
 * Se llama al `replaceState` NATIVO (el del prototipo) y no al de `window.history`: el App Router
 * de Next lo envuelve y, al ver una URL nueva, pide al servidor el payload de esa ruta
 * (`/?_rsc=…`). Son peticiones al propio origen y sin un solo dato, pero «cambiar de idioma no abre
 * ninguna conexión» es una frase que esta app puede decir entera, y `tests/e2e/idioma.spec.ts` la
 * vigila. A cambio, Next no se entera del parámetro: nadie en la app lo lee por esa vía.
 */
export function elegirIdioma(idioma: Idioma): void {
  fijarIdioma(idioma);
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("lang", idioma);
  History.prototype.replaceState.call(
    window.history,
    window.history.state,
    "",
    url,
  );
}

export function useIdioma(): Idioma {
  return useSyncExternalStore(suscribir, snapshot, snapshotDelServidor);
}
