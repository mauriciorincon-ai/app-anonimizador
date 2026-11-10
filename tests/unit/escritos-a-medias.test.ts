// Lo que Velo local dice cuando una corrida falla Y no puede borrar lo que escribió (S12, deuda del
// S10): un archivo a medias en el equipo del usuario, sin aviso, es una superficie que nadie mira
// (regla 17-bis). Aquí el borrado FALLA de verdad —el archivo vive en una carpeta de solo lectura y
// `rm` y `unlink` lanzan EACCES, sin mocks—, y se comprueba que cada una se nombra, que las demás sí
// se borran y que el error que se relanza es el original. El cableado en `cli.ts` y `orden.ts` (que
// llaman a `deshacerLaCorrida`) lo recorre `escritos-locales.test.ts`: su rollback pasa por ahí.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ArchivoNuevo, EscrituraAMedias } from "../../velo-local/archivos";
import type { Consola } from "../../velo-local/cli";
import { borrarEscritos, deshacerLaCorrida } from "../../velo-local/comun";

const soloRoot = process.getuid?.() === 0;
let carpeta: string;
const avisos: string[] = [];
const consola: Consola = {
  salida: () => {},
  aviso: (l) => void avisos.push(l),
};

const bloqueadas: string[] = [];
beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), "velo-a-medias-"));
  avisos.length = 0;
});
afterEach(() => {
  for (const c of bloqueadas.splice(0)) chmodSync(c, 0o700);
  rmSync(carpeta, { recursive: true, force: true });
});

const escribir = (nombre: string) => {
  const ruta = join(carpeta, nombre);
  writeFileSync(ruta, "x");
  return ruta;
};
/** Una carpeta de solo lectura con un archivo dentro: borrarlo falla con EACCES, de verdad. */
const imborrable = (nombre: string) => {
  const dentro = join(carpeta, `bloqueada-${nombre}`);
  mkdirSync(dentro);
  const ruta = join(dentro, nombre);
  writeFileSync(ruta, "x");
  chmodSync(dentro, 0o500);
  bloqueadas.push(dentro);
  return ruta;
};

describe.skipIf(soloRoot)("borrar lo que la corrida escribió", () => {
  it("intenta con TODOS y devuelve los que no pudo borrar", async () => {
    const a = escribir("a.csv");
    const b = imborrable("b.html");
    const c = escribir("c.velo");
    expect(await borrarEscritos([a, b, c])).toEqual([b]);
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(true);
    expect(existsSync(c)).toBe(false);
  });

  it("un archivo que no se puede borrar al abortar se dice con false, no se calla", async () => {
    const archivo = await ArchivoNuevo.crear(join(carpeta, "salida.csv"));
    chmodSync(carpeta, 0o500);
    bloqueadas.push(carpeta);
    expect(await archivo.abortar()).toBe(false);
    expect(existsSync(join(carpeta, "salida.csv"))).toBe(true);
  });

  it("y se dice true cuando sí lo borró", async () => {
    const ruta = join(carpeta, "otro.csv");
    const archivo = await ArchivoNuevo.crear(ruta);
    expect(await archivo.abortar()).toBe(true);
    expect(existsSync(ruta)).toBe(false);
  });
});

describe("deshacer la corrida avisa de lo que quedó", () => {
  it.skipIf(soloRoot)(
    "nombra cada archivo que no se borró, en cada idioma, y relanza la causa original",
    async () => {
      const ruta = imborrable("certificado.html");
      const causa = new Error("falló la bitácora");
      const lanzado = await deshacerLaCorrida(
        [ruta],
        null,
        causa,
        consola,
        "es",
      );
      expect(lanzado).toBe(causa);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toContain(ruta);
      expect(avisos[0]).toContain("Bórralo tú");

      avisos.length = 0;
      await deshacerLaCorrida([ruta], null, causa, consola, "en");
      expect(avisos[0]).toContain("Delete it yourself");
    },
  );

  it("una escritura a medias que no se pudo borrar se nombra y se relanza su causa", async () => {
    const ruta = join(carpeta, "bobeda.velo");
    const causa = new Error("disco lleno");
    const lanzado = await deshacerLaCorrida(
      [],
      undefined,
      new EscrituraAMedias(ruta, causa),
      consola,
      "es",
    );
    expect(lanzado).toBe(causa);
    expect(avisos[0]).toContain(ruta);
  });

  it("si todo se borró, no hay aviso", async () => {
    const ruta = escribir("a.csv");
    await deshacerLaCorrida([ruta], null, new Error("x"), consola, "es");
    expect(avisos).toEqual([]);
    expect(existsSync(ruta)).toBe(false);
  });
});
