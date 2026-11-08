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
    expect(TABLAS).toEqual(["ciiu.json", "ciiu5.json", "divipola.json"]);
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

describe("CIIU Rev. 5 dice lo que su fuente dice (S11)", () => {
  const ciiu5 = JSON.parse(
    readFileSync(join(CARPETA, "ciiu5.json"), "utf8"),
  ) as { secciones: [string, string, string][]; clases: string[] };
  const meta = leerMeta("ciiu5.json");

  it("22 secciones (A a V), 87 divisiones y 544 clases, los conteos del .meta.json", () => {
    expect(ciiu5.secciones.map(([s]) => s).join("")).toBe(
      "ABCDEFGHIJKLMNOPQRSTUV",
    );
    expect(ciiu5.clases).toHaveLength(544);
    expect(
      new Set(ciiu5.clases.map((c) => c.slice(0, 2))).size,
      "divisiones con clases",
    ).toBe(87);
    expect(meta.conteos).toEqual({
      secciones: 22,
      divisiones: 87,
      grupos: 266,
      clases: 544,
    });
  });

  it("toda clase cae en UNA sola sección por su división", () => {
    for (const clase of ciiu5.clases) {
      expect(clase).toMatch(/^\d{4}$/);
      const division = Number(clase.slice(0, 2));
      expect(
        ciiu5.secciones.filter(
          ([, desde, hasta]) =>
            division >= Number(desde) && division <= Number(hasta),
        ),
        clase,
      ).toHaveLength(1);
    }
  });

  it("la correlativa del DANE se cita y NO se usa: es de muchos a muchos", () => {
    const correlativa = meta.fuentes.find((f) =>
      f.url.includes("tablasCorrelativas"),
    );
    expect(correlativa).toBeDefined();
    expect(JSON.stringify(correlativa)).toMatch(/many-to-many/);
  });
});

describe("la revisión de una columna CIIU sale de sus códigos exclusivos (S11)", () => {
  it("cuenta los exclusivos de cada una y decide solo si los de una sola aparecen", async () => {
    const { detectarRevisionCiiu } =
      await import("@/engine/jerarquias/fabrica");
    // 4520 y 6201: solo Rev. 4 · 0330 y 2611: solo Rev. 5 · 0111 y 8610: de las dos.
    expect(detectarRevisionCiiu(["0111", "4520", "6201", "8610"])).toEqual({
      soloRev4: 2,
      soloRev5: 0,
      enAmbas: 2,
      revision: "ciiu",
    });
    expect(detectarRevisionCiiu(["0111", "0330", "2611", "", "abc"])).toEqual({
      soloRev4: 0,
      soloRev5: 2,
      enAmbas: 1,
      revision: "ciiu5",
    });
    // Solo comunes, o exclusivos de las dos: no se adivina.
    expect(detectarRevisionCiiu(["0111", "8610"]).revision).toBeNull();
    expect(detectarRevisionCiiu(["4520", "2611"]).revision).toBeNull();
    // Un 111 de hoja de cálculo es la clase 0111, y no cuenta dos veces junto a ella.
    expect(detectarRevisionCiiu(["111", "0111"]).enAmbas).toBe(1);
  });

  it("el diagnóstico la anota solo en las columnas de actividad económica, con conteos", async () => {
    const { conRevisionesCiiu } = await import("@/engine/jerarquias/fabrica");
    const columnas = conRevisionesCiiu(
      [{ nombre: "actividad_economica" }, { nombre: "codigo" }],
      () => ["0330", "0111"],
    );
    expect(columnas[0].revisionCiiu?.revision).toBe("ciiu5");
    expect(columnas[1].revisionCiiu).toBeUndefined();
    // Lo que viaja a la página son números y una clave, nunca los códigos.
    expect(JSON.stringify(columnas[0].revisionCiiu)).not.toMatch(/0330|0111/);
  });
});

describe("el kit usa códigos que existen en las tablas de fábrica", () => {
  // El perfil `jerarquias` del kit trae municipios y clases CIIU VÁLIDOS: si una tabla se
  // regenera y uno desaparece, el kit dejaría de probar el camino feliz sin que nadie lo note.
  it("cada municipio y cada clase del perfil `jerarquias` está en su tabla", async () => {
    const { MUNICIPIOS_DIVIPOLA, CLASES_CIIU } =
      await import("../../docs/kit-de-prueba/generador.mjs");
    const divipola = JSON.parse(
      readFileSync(join(CARPETA, "divipola.json"), "utf8"),
    ) as { municipios: [string, string, string][] };
    const ciiu = JSON.parse(
      readFileSync(join(CARPETA, "ciiu.json"), "utf8"),
    ) as {
      clases: string[];
    };
    const codigos = new Set(divipola.municipios.map(([c]) => c));
    for (const m of MUNICIPIOS_DIVIPOLA as string[])
      expect(codigos.has(m), m).toBe(true);
    for (const c of CLASES_CIIU as string[])
      expect(ciiu.clases, c).toContain(c);
    // S11: las de la Rev. 5 existen en su tabla, y las seis primeras SOLO en ella (la detección se
    // apoya en eso; un código común mal elegido hacía leer la columna como una mezcla).
    const { CLASES_CIIU5 } = await import("../../docs/kit-de-prueba/generador.mjs");
    const ciiu5 = JSON.parse(
      readFileSync(join(CARPETA, "ciiu5.json"), "utf8"),
    ) as { clases: string[] };
    for (const c of CLASES_CIIU5 as string[]) expect(ciiu5.clases, c).toContain(c);
    (CLASES_CIIU5 as string[]).forEach((c, i) =>
      expect(ciiu.clases.includes(c), `${c} en la Rev. 4`).toBe(i >= 6),
    );
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
      ["ciiu5.json", FUENTES.ciiu5],
    ] as const;
    for (const [tabla, fuente] of citadas) {
      const meta = leerMeta(tabla);
      const enElMeta = meta.fuentes.find((f) => f.url === fuente.url);
      expect(enElMeta, `${tabla}: ${fuente.url}`).toBeDefined();
      expect(enElMeta!.fecha_de_consulta).toBe(fuente.consultada);
    }
  });
});
