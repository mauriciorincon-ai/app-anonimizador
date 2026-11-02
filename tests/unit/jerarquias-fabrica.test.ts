// GATE DE LAS JERARQUÍAS DE FÁBRICA (S7). Toda jerarquía de fábrica cita su fuente y su fecha: cada
// tabla de `src/engine/jerarquias/fabrica/` viaja con un `.meta.json` que dice de qué documento
// oficial salió, de dónde se bajó, cuándo, con qué SHA-256, y cómo se derivó. Este gate exige que la
// tabla del repo sea EXACTAMENTE la que el `.meta.json` describe: tocar un municipio a mano, o
// regenerar la tabla sin actualizar su procedencia, lo hace caer (demo en rojo en el cierre del S7).
//
// Y comprueba que las tablas digan lo que su fuente dice: 33 entidades departamentales, cada una en
// UNA región; toda clase CIIU dentro de UNA sección.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sha256 } from "@/lib/sha256";

const CARPETA = join(process.cwd(), "src/engine/jerarquias/fabrica");
const TABLAS = readdirSync(CARPETA)
  .filter((n) => n.endsWith(".json") && !n.endsWith(".meta.json"))
  .sort();

interface Fuente {
  readonly editor: string;
  readonly titulo: string;
  readonly url: string;
  readonly fecha_de_consulta: string;
  readonly sha256: string;
}

interface Meta {
  readonly jerarquia: string;
  readonly fuentes: readonly Fuente[];
  readonly derivado: {
    readonly archivo: string;
    readonly sha256: string;
    readonly como: string;
  };
  readonly conteos: Record<string, unknown>;
}

function leerMeta(tabla: string): Meta {
  return JSON.parse(
    readFileSync(join(CARPETA, tabla.replace(/\.json$/, ".meta.json")), "utf8"),
  ) as Meta;
}

describe("cada tabla de fábrica tiene su procedencia, y es la que dice", () => {
  it("hay tablas que revisar (un gate sobre nada no es un gate)", () => {
    expect(TABLAS).toEqual(["ciiu.json", "divipola.json"]);
  });

  for (const tabla of TABLAS) {
    it(`${tabla}: el .meta.json cita fuente, URL, fecha de consulta y SHA-256 de cada documento`, () => {
      const meta = leerMeta(tabla);
      expect(meta.fuentes.length).toBeGreaterThan(0);
      for (const f of meta.fuentes) {
        expect(f.editor.length, "editor").toBeGreaterThan(0);
        expect(f.titulo.length, "titulo").toBeGreaterThan(0);
        expect(f.url, "url").toMatch(/^https?:\/\/[^\s]+$/);
        expect(f.fecha_de_consulta, "fecha_de_consulta").toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(f.sha256, "sha256 de la fuente").toMatch(/^[0-9a-f]{64}$/);
      }
      expect(meta.derivado.archivo).toBe(tabla);
      expect(meta.derivado.como).toContain("scripts/jerarquias/derivar.mjs");
    });

    it(`${tabla}: su SHA-256 es el que el .meta.json declara`, () => {
      const bytes = new Uint8Array(readFileSync(join(CARPETA, tabla)));
      expect(sha256(bytes), `${tabla} cambió sin su .meta.json`).toBe(
        leerMeta(tabla).derivado.sha256,
      );
    });
  }
});

describe("DIVIPOLA dice lo que su fuente dice", () => {
  const divipola = JSON.parse(
    readFileSync(join(CARPETA, "divipola.json"), "utf8"),
  ) as {
    departamentos: [string, string, string][];
    municipios: [string, string, string][];
  };
  const meta = leerMeta("divipola.json");

  it("33 entidades departamentales y 1.122 municipios y áreas, los conteos del .meta.json", () => {
    expect(divipola.departamentos).toHaveLength(33);
    expect(divipola.municipios).toHaveLength(1122);
    expect(meta.conteos.departamentos).toBe(33);
    expect(meta.conteos.entradas_en_municipios_del_json).toBe(1122);
  });

  it("cada departamento en UNA de las seis regiones, y cada municipio en un departamento que existe", () => {
    const regiones = new Set(divipola.departamentos.map(([, , r]) => r));
    expect(regiones.size).toBe(6);
    const codigos = new Set(divipola.departamentos.map(([c]) => c));
    expect(codigos.size).toBe(33);
    for (const [codigo, , depto] of divipola.municipios) {
      expect(codigo).toMatch(/^\d{5}$/);
      expect(codigo.slice(0, 2)).toBe(depto);
      expect(codigos.has(depto), codigo).toBe(true);
    }
    expect(new Set(divipola.municipios.map(([c]) => c)).size).toBe(1122);
  });
});

describe("CIIU dice lo que su fuente dice", () => {
  const ciiu = JSON.parse(readFileSync(join(CARPETA, "ciiu.json"), "utf8")) as {
    secciones: [string, string, string][];
    clases: string[];
  };

  it("21 secciones (A a U) y 502 clases, los conteos del .meta.json", () => {
    expect(ciiu.secciones.map(([s]) => s).join("")).toBe(
      "ABCDEFGHIJKLMNOPQRSTU",
    );
    expect(ciiu.clases).toHaveLength(502);
    expect(leerMeta("ciiu.json").conteos.clases).toBe(502);
  });

  it("toda clase cae en UNA sola sección por su división", () => {
    for (const clase of ciiu.clases) {
      expect(clase).toMatch(/^\d{4}$/);
      const division = Number(clase.slice(0, 2));
      const en = ciiu.secciones.filter(
        ([, desde, hasta]) =>
          division >= Number(desde) && division <= Number(hasta),
      );
      expect(en, clase).toHaveLength(1);
    }
  });
});

describe("el kit usa códigos que existen en las tablas de fábrica", () => {
  // El perfil `jerarquias` del kit trae municipios y clases CIIU VÁLIDOS: si una tabla se
  // regenera y uno desaparece, el kit dejaría de probar el camino feliz sin que nadie lo note.
  it("cada municipio y cada clase del perfil `jerarquias` está en su tabla", async () => {
    const { MUNICIPIOS_DIVIPOLA, CLASES_CIIU } = await import(
      "../../docs/kit-de-prueba/generador.mjs"
    );
    const divipola = JSON.parse(
      readFileSync(join(CARPETA, "divipola.json"), "utf8"),
    ) as { municipios: [string, string, string][] };
    const ciiu = JSON.parse(readFileSync(join(CARPETA, "ciiu.json"), "utf8")) as {
      clases: string[];
    };
    const codigos = new Set(divipola.municipios.map(([c]) => c));
    for (const m of MUNICIPIOS_DIVIPOLA as string[]) expect(codigos.has(m), m).toBe(true);
    for (const c of CLASES_CIIU as string[]) expect(ciiu.clases, c).toContain(c);
    // Y los casos fuera de rango que el kit inyecta, de verdad fuera.
    expect(codigos.has("99999")).toBe(false);
    expect(ciiu.clases).not.toContain("9999");
  });
});

describe("lo que cita el certificado es lo que dice el .meta.json", () => {
  // El certificado se arma en la página y no lee los `.meta.json` (solo el worker los tiene): cita
  // las URL y fechas de `fuentes.ts`. Si una tabla se regenera con otra fuente, esto cae antes de
  // que un certificado cite la vieja.
  it("cada URL y fecha de consulta de `fuentes.ts` está en el .meta.json de su tabla", async () => {
    const { FUENTES } = await import("@/engine/jerarquias/fuentes");
    const citadas = [
      ["divipola.json", FUENTES.divipola],
      ["divipola.json", FUENTES.regiones],
      ["ciiu.json", FUENTES.ciiu],
    ] as const;
    for (const [tabla, fuente] of citadas) {
      const meta = leerMeta(tabla);
      const enElMeta = meta.fuentes.find((f) => f.url === fuente.url);
      expect(enElMeta, `${tabla}: ${fuente.url}`).toBeDefined();
      expect(enElMeta!.fecha_de_consulta).toBe(fuente.consultada);
    }
  });
});
