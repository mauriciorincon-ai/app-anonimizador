// @vitest-environment node
// Regla 18 (kit v1.32.0): ningún paquete queda por debajo de `main`. Dos excepciones, las dos nombradas en la salida:
//  · una degradación DECLARADA en scripts/degradaciones-permitidas.json (kit v1.37.0, planlang S2);
//  · una BAJADA FORZADA (kit v1.39.0, Big-D PR #6): un paquete del PR fija exacta la versión más vieja; se acepta
//    solo si el registro lo confirma. Con un rango que admite la versión de main, sin dependiente o sin registro,
//    sigue en rojo. Cada `it` con rojo es la demo de la regla 15.
import { describe, expect, it } from "vitest";
import { dependientes, revisar } from "../../scripts/verificar-dependencias.mjs";

/** Un lockfile v9 mínimo: `vitest@<v>` usa `why-is-node-running@<w>`. */
const lock = (vitest: string, why: string) => `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      vitest:
        specifier: ${vitest}
        version: ${vitest}(@types/node@22.20.4)

packages:

  vitest@${vitest}:
    resolution: {integrity: sha512-x}

  why-is-node-running@${why}:
    resolution: {integrity: sha512-y}

snapshots:

  vitest@${vitest}(@types/node@22.20.4):
    dependencies:
      tinyglobby: 0.2.17
      why-is-node-running: ${why}

  why-is-node-running@${why}: {}
`;

const MAIN = lock("5.0.2", "3.2.2");
const PR = lock("5.0.3", "3.2.1");
const registro = (rango: string | null) => (dep: string, ver: string, nombre: string) =>
  dep === "vitest" && ver === "5.0.3" && nombre === "why-is-node-running" ? rango : null;
const nunca = () => {
  throw new Error("no debía consultar");
};

describe("regla 18 — ningún paquete por debajo de main", () => {
  it("encuentra quién usa la versión que bajó, sin el sufijo de pares", () => {
    expect(dependientes(PR, "why-is-node-running", "3.2.1")).toEqual([{ nombre: "vitest", version: "5.0.3" }]);
    expect(dependientes(PR, "why-is-node-running", "3.2.2")).toEqual([]);
  });
  it("acepta la bajada que un paquete del PR fija exacta, y dice cuál", () => {
    expect(revisar({ lockBase: MAIN, lockPR: PR, permitidas: [], consultar: registro("3.2.1") })).toMatchObject({
      degradados: [],
      forzados: ["why-is-node-running: 3.2.2 (origin/main) → 3.2.1, bajada forzada aceptada porque vitest@5.0.3 la fija exacta"],
    });
  });
  it("rojo: una bajada que el rango declarado admite es pnpm degradando", () => {
    expect(revisar({ lockBase: MAIN, lockPR: PR, permitidas: [], consultar: registro("^3.2.1") }).degradados).toEqual([
      "why-is-node-running: 3.2.2 (origin/main) → 3.2.1 (este árbol)",
    ]);
  });
  it("rojo: sin registro (la consulta falla) no hay prueba de la intención", () => {
    const falla = () => {
      throw new Error("sin red");
    };
    expect(revisar({ lockBase: MAIN, lockPR: PR, permitidas: [], consultar: falla }).degradados).toHaveLength(1);
  });
  it("una degradación declarada pasa sin consultar el registro, y una declarada sin uso falla", () => {
    const permitidas = [{ nombre: "why-is-node-running", de: "3.2.2", a: "3.2.1", razon: "seguir al Node de la CI" }];
    const r = revisar({ lockBase: MAIN, lockPR: PR, permitidas, consultar: nunca });
    expect(r).toMatchObject({ degradados: [], forzados: [], sinUso: [] });
    expect(r.aceptados[0]).toMatch(/degradado a propósito/);
    expect(revisar({ lockBase: MAIN, lockPR: lock("5.0.3", "3.2.2"), permitidas, consultar: nunca }).sinUso).toEqual([
      "why-is-node-running 3.2.2 → 3.2.1",
    ]);
  });
  it("sin bajada no consulta nada, y un paquete quitado no cuenta", () => {
    expect(revisar({ lockBase: MAIN, lockPR: lock("5.0.3", "3.2.2"), permitidas: [], consultar: nunca })).toMatchObject({
      degradados: [],
      forzados: [],
    });
    const sinWhy = lock("5.0.3", "3.2.2").replace(/why-is-node-running/g, "otro");
    expect(revisar({ lockBase: MAIN, lockPR: sinWhy, permitidas: [], consultar: nunca }).degradados).toEqual([]);
  });
});
