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
    patron: /\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon/,
    porque:
      "no hay una sola razón para que esta app abra una conexión: no tiene backend",
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
