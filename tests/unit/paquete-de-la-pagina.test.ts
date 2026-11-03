// Lo que corre dentro del worker no se importa desde la página (S8).
//
// El presupuesto de JavaScript de `/diagnostico` es de 350 KB y el S8 lo pasó por 0,6 KB: la pantalla
// del informe importaba `MUESTRA_MAXIMA` de `engine/clasificador.ts`, y con esa sola constante
// arrastraba al paquete de la página el clasificador, todos los validadores —los siete europeos
// nuevos— y las listas de nombres en siete lenguas, código que solo corre en el worker. Lo cobró la
// medida de Lighthouse en local, no un test. Este lo cobra antes: ningún archivo de la página
// importa, como valor, esos módulos.
//
// Los `import type` están permitidos: se borran al compilar y no pesan.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Lo que solo corre dentro del worker y pesa lo bastante como para quitarle el margen a la página. */
const SOLO_DEL_WORKER = [
  "@/engine/clasificador",
  "@/engine/validadores",
  "@/engine/validadores/europeos",
  "@/engine/nombres-multilingues",
  "@/engine/diccionarios/nombres",
  "@/engine/tecnicas",
  "@/engine/tecnicas/seudonimo",
  "@/engine/tecnicas/formato-europeo",
];

/** La página: lo que Next empaqueta para el navegador. Los workers y el motor puro quedan fuera. */
const RAICES_DE_LA_PAGINA = ["src/app", "src/components", "src/lib"];

function archivos(ruta: string): string[] {
  if (!statSync(ruta).isDirectory()) return [ruta];
  return readdirSync(ruta).flatMap((entrada) => archivos(join(ruta, entrada)));
}

/** Las importaciones de VALOR de un archivo: las que no son `import type`. */
function importacionesDeValor(codigo: string): string[] {
  const sinComentarios = codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const encontradas: string[] = [];
  for (const m of sinComentarios.matchAll(
    /import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g,
  )) {
    const soloTipos = Boolean(m[1]);
    const conLlaves = m[2];
    // `import { type A, type B }` también se borra entero si todos son tipos.
    const todosTipos =
      /^\{[\s\S]*\}$/.test(conLlaves.trim()) &&
      conLlaves
        .trim()
        .slice(1, -1)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .every((p) => p.startsWith("type "));
    if (!soloTipos && !todosTipos) encontradas.push(m[3]);
  }
  return encontradas;
}

describe("la página no importa lo que solo corre en el worker", () => {
  const rutas = RAICES_DE_LA_PAGINA.flatMap((raiz) =>
    archivos(join(process.cwd(), raiz)),
  ).filter((ruta) => /\.tsx?$/.test(ruta) && !ruta.endsWith(".d.ts"));

  it("encuentra el código de la página donde debe estar", () => {
    expect(rutas.length).toBeGreaterThan(30);
  });

  it("ningún archivo de la página importa, como valor, el clasificador, los validadores o los seudónimos", () => {
    const culpables: string[] = [];
    for (const ruta of rutas) {
      for (const origen of importacionesDeValor(readFileSync(ruta, "utf8"))) {
        if (SOLO_DEL_WORKER.includes(origen)) {
          culpables.push(`${ruta.slice(process.cwd().length + 1)} → ${origen}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  it("el gate se prueba a sí mismo: ve un import de valor y deja pasar uno de tipo", () => {
    expect(
      importacionesDeValor(
        'import { MUESTRA_MAXIMA } from "@/engine/clasificador";',
      ),
    ).toEqual(["@/engine/clasificador"]);
    expect(
      importacionesDeValor(
        'import type { Diagnostico } from "@/engine/clasificador";',
      ),
    ).toEqual([]);
    expect(
      importacionesDeValor(
        'import { type Diagnostico, type Evidencia } from "@/engine/clasificador";',
      ),
    ).toEqual([]);
    expect(
      importacionesDeValor(
        'import { clasificar, type Diagnostico } from "@/engine/clasificador";',
      ),
    ).toEqual(["@/engine/clasificador"]);
    expect(
      importacionesDeValor('// import { x } from "@/engine/clasificador";'),
    ).toEqual([]);
  });
});
