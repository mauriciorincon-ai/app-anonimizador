// GATE DE PRIVACIDAD — la regla dura nº2, vista desde el código fuente.
//
// «Los datos del usuario jamás salen del navegador» se demuestra por dos caminos, y hacen falta
// los dos. El e2e intercepta la red durante el flujo con un archivo cargado y falla si algo viaja:
// prueba lo que ocurre. Este test prueba lo que EXISTE — que en `src/` no hay una sola llamada
// capaz de sacar datos ni de guardarlos, aunque ningún camino la recorra hoy.
//
// La diferencia importa: una escritura a `localStorage` metida en una rama que el e2e no visita
// pasaría el test de comportamiento y rompería la promesa igual. Y al revés, este gate no
// sustituye al e2e: no ve lo que hace una dependencia.
//
// La ÚNICA excepción prevista es la bóveda cifrada del Sprint 003, con acción explícita del
// usuario y una llave que solo él tiene. Cuando llegue, se añade aquí con su ADR — no se borra
// el gate.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PROHIBIDOS: readonly { patron: RegExp; porque: string }[] = [
  {
    patron: /\blocalStorage\b/,
    porque: "persistiría datos entre sesiones sin que el usuario lo pidiera",
  },
  {
    patron: /\bsessionStorage\b/,
    porque: "sobrevive a una recarga: el estado vacío dejaría de ser cierto",
  },
  {
    patron: /\bindexedDB\b/i,
    porque: "la bóveda cifrada es del S3, con llave del usuario y su ADR",
  },
  {
    patron: /navigator\.storage|getDirectory\(/,
    porque: "OPFS escribe en disco; en S1 no se escribe nada",
  },
  {
    patron: /document\.cookie/,
    porque: "una cookie viaja al servidor en cada petición",
  },
  {
    // S11: la descarga en streaming pasa por un service worker, y la Cache API es justo lo que ese
    // tipo de worker suele usar. Lo que se descarga NO se guarda en el navegador: pasa y se suelta.
    patron: /\bcaches\b|CacheStorage/,
    porque:
      "la Cache API guardaría en el navegador, fuera del alcance del usuario, lo que debería solo pasar",
  },
  {
    patron: /\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon/,
    porque:
      "no hay una sola razón para que esta app abra una conexión: no tiene backend",
  },
];

/**
 * Lo que la PÁGINA no puede hacer, aunque el worker sí (ADR-005).
 *
 * Aquí NO se veta `.text()`, y la ausencia es deliberada: el importador de políticas lee un JSON
 * que el usuario eligió a mano, y una expresión regular no distingue ese archivo del de datos.
 * Un gate que no puede distinguir acaba con una lista de excepciones, y una lista de excepciones
 * es un gate muerto.
 *
 * Lo que impide de verdad que la página lea el archivo anonimizado es **estructural**: el `Blob`
 * queda capturado en una clausura (`asaDeArchivo` en `src/lib/sesion.ts`) y ningún componente
 * tiene jamás una referencia sobre la que llamar nada. El test de más abajo lo comprueba sobre el
 * objeto, no sobre el texto. Estas dos, en cambio, no le hacen falta a nadie fuera del worker.
 */
const PROHIBIDOS_FUERA_DEL_WORKER: readonly {
  patron: RegExp;
  porque: string;
}[] = [
  {
    patron: /\.arrayBuffer\(\)/,
    porque: "sacaría los bytes del archivo del asa opaca que los contiene",
  },
  {
    patron: /new FileReader/,
    porque: "el mismo agujero, por la puerta de atrás",
  },
  // S8: en alto volumen el worker escribe en el archivo que el usuario eligió. La página solo pasa
  // el asa que devuelve el selector; abrirla para escribir o para leer, o leer cualquier flujo, la
  // pondría a mirar lo que se escribe.
  {
    patron: /\.createWritable\(/,
    porque:
      "la página escribiría ella misma el archivo, con el contenido en la mano",
  },
  {
    patron: /\.getWriter\(|\.getReader\(/,
    porque: "un flujo abierto en la página es contenido que pasa por la página",
  },
  {
    patron: /\.getFile\(/,
    porque: "leería de vuelta lo que el worker escribió",
  },
];

function archivos(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(ruta) ? [ruta] : [];
  });
}

/** Sin comentarios: este archivo y varios del producto NOMBRAN las APIs para explicar por qué no. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("nada en `src/` puede sacar ni guardar los datos del usuario", () => {
  const rutas = archivos(join(process.cwd(), "src"));

  it("encuentra el código de la app donde debe estar", () => {
    expect(rutas.length).toBeGreaterThan(10);
  });

  describe("y la página tampoco puede LEER el archivo que descarga (ADR-005)", () => {
    const fueraDelWorker = rutas.filter(
      (ruta) => !ruta.includes(`${join("src", "workers")}`),
    );

    it("hay código fuera del worker que revisar", () => {
      expect(fueraDelWorker.length).toBeGreaterThan(10);
    });

    for (const ruta of fueraDelWorker) {
      const relativa = ruta.slice(process.cwd().length + 1);
      it(`${relativa} — no abre el Blob`, () => {
        const codigo = sinComentarios(readFileSync(ruta, "utf8"));
        for (const { patron, porque } of PROHIBIDOS_FUERA_DEL_WORKER) {
          expect(codigo, `${relativa}: ${porque}`).not.toMatch(patron);
        }
      });
    }
  });

  // S11: registrar un service worker deja un registro en el navegador. Hay UN solo oficio para eso
  // (la descarga en streaming) y UN solo archivo que lo hace; cualquier otro uso es una decisión.
  it("`serviceWorker` solo lo toca la descarga en streaming", () => {
    const culpables = rutas.filter(
      (ruta) =>
        /\bserviceWorker\b/.test(sinComentarios(readFileSync(ruta, "utf8"))) &&
        !ruta.endsWith(join("src", "lib", "descarga-en-flujo.ts")),
    );
    expect(culpables.map((r) => r.slice(process.cwd().length + 1))).toEqual([]);
  });

  for (const { patron, porque } of PROHIBIDOS) {
    it(`no usa ${patron.source} — ${porque}`, () => {
      const culpables = rutas.filter((ruta) =>
        patron.test(sinComentarios(readFileSync(ruta, "utf8"))),
      );
      expect(culpables.map((r) => r.slice(process.cwd().length + 1))).toEqual(
        [],
      );
    });
  }
});

// S11: el service worker de la descarga en streaming vive en `public/`, que el barrido de `src/` no
// ve. Tiene su propio gate: no guarda nada, no pide nada a la red y no importa otros scripts. Es un
// segundo contexto que ve los bytes de SALIDA (ya anonimizados, los mismos que llevaría el `Blob`).
describe("el service worker de la descarga no guarda ni pide nada", () => {
  const VETOS_DEL_SERVICE_WORKER: readonly {
    patron: RegExp;
    porque: string;
  }[] = [
    {
      patron: /\bcaches\b|CacheStorage/,
      porque: "la Cache API guardaría la salida",
    },
    { patron: /\bfetch\(/, porque: "pediría algo a la red" },
    { patron: /importScripts/, porque: "cargaría código que nadie revisó" },
    {
      patron: /XMLHttpRequest|new WebSocket|sendBeacon/,
      porque: "abriría una conexión",
    },
    {
      patron:
        /indexedDB|localStorage|sessionStorage|navigator\.storage|getDirectory\(/,
      porque: "guardaría en el navegador",
    },
  ];
  const RUTA = join(process.cwd(), "public", "velo-descarga-sw.js");
  const codigo = sinComentarios(readFileSync(RUTA, "utf8"));

  it("es el único script de `public/` (otro service worker no entraría sin pasar por aquí)", () => {
    const scripts = readdirSync(join(process.cwd(), "public")).filter((n) =>
      /\.m?js$/.test(n),
    );
    expect(scripts).toEqual(["velo-descarga-sw.js"]);
  });

  it("atiende solo /descarga/ y responde con lo que le llega por el canal", () => {
    expect(codigo).toContain('"/descarga/"');
    expect(codigo).toContain("respondWith");
  });

  for (const { patron, porque } of VETOS_DEL_SERVICE_WORKER) {
    it(`no usa ${patron.source} — ${porque}`, () => {
      expect(codigo).not.toMatch(patron);
    });
  }

  it("el gate muerde: una carnada con la Cache API y con fetch(…) cae", () => {
    const carnada = sinComentarios(
      'self.addEventListener("fetch", async (e) => { const c = await caches.open("x"); await fetch(e.request); });',
    );
    const caidos = VETOS_DEL_SERVICE_WORKER.filter(({ patron }) =>
      patron.test(carnada),
    );
    expect(caidos.length).toBe(2);
  });
});
