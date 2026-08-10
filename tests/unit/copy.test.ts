// GATE DE HONESTIDAD MEDIDA — la regla dura nº4 del producto, en forma de test.
//
// Velo reduce el riesgo de reidentificación y lo MIDE; no promete magia. k-anonimato es atacable
// incluso sin información auxiliar (arXiv:2509.03350) y se degrada con la dimensionalidad, así que
// una sola frase de más en un microcopy —"100 % seguro", "anonimato garantizado"— convierte un
// instrumento honesto en publicidad falsa.
//
// Igual que el gate de determinismo, este mira el CÓDIGO FUENTE y no la salida: una frase
// prohibida escondida en un estado que ningún test recorre haría el mismo daño, y no la cazaría
// ninguna aserción de comportamiento.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAICES = ["src", "docs/MANUAL-DE-USO.md"];

/** Las tres del CLAUDE.md, más las variantes con las que se cuelan en la práctica. */
const PROHIBIDAS: readonly { patron: RegExp; porque: string }[] = [
  {
    patron: /anonimato\s+garantizad/i,
    porque: "ningún método garantiza el anonimato: k-anonimato es atacable",
  },
  {
    patron: /garantiza\w*\s+(el\s+)?anonimato/i,
    porque: "ningún método garantiza el anonimato: k-anonimato es atacable",
  },
  {
    patron: /100\s*%?\s*segur/i,
    porque: "no existe el 100 % seguro; existe el riesgo medido",
  },
  {
    patron: /imposible\s+de\s+reidentificar/i,
    porque: "la reidentificación se hace menos probable, nunca imposible",
  },
  {
    patron: /(totalmente|completamente|100\s*%)\s+an[oó]nim/i,
    porque: "el anonimato absoluto no es una propiedad que Velo pueda afirmar",
  },
  {
    patron: /riesgo\s+cero/i,
    porque: "ninguna técnica lleva el riesgo a cero; decirlo sería falso",
  },
];

function archivos(ruta: string): string[] {
  if (!statSync(ruta).isDirectory()) return [ruta];
  return readdirSync(ruta).flatMap((entrada) => archivos(join(ruta, entrada)));
}

/** Se quitan los comentarios: este archivo NOMBRA las frases prohibidas para poder vetarlas. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("ninguna pantalla promete lo que Velo no puede cumplir", () => {
  const rutas = RAICES.flatMap((raiz) => archivos(join(process.cwd(), raiz)))
    .filter((ruta) => /\.(tsx?|md)$/.test(ruta))
    .filter((ruta) => !ruta.endsWith(".d.ts"));

  it("encuentra el código de la interfaz donde debe estar", () => {
    expect(rutas.length).toBeGreaterThan(10);
  });

  for (const { patron, porque } of PROHIBIDAS) {
    it(`no dice ${patron.source} — ${porque}`, () => {
      const culpables = rutas.filter((ruta) =>
        patron.test(sinComentarios(readFileSync(ruta, "utf8"))),
      );
      expect(culpables.map((r) => r.slice(process.cwd().length + 1))).toEqual(
        [],
      );
    });
  }
});
