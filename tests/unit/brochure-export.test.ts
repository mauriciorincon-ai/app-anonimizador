// GATE DEL CONTRATO `brochure-export` v1.0.0 — la ficha que la vitrina del portafolio consume.
//
// El export es lo único de esta app que otro sistema lee sin abrir el repositorio, así que sus
// cifras se sostienen solas o no se sostienen. Este test vigila la FORMA, que es lo único que un
// test puede vigilar: no sabe si «14 funcionalidades» sigue siendo cierto dentro de tres sprints,
// pero sí sabe que el total no cuadra con las features listadas, que una métrica llegó sin
// procedencia, o que el pie del brochure y el JSON se desincronizaron.
//
// La cuarta aserción es de otra familia: barre el brochure Y el export buscando URLs de
// producción o de preview. Es la regla 14 del CLAUDE.md —la producción se MUESTRA, jamás se
// ENTREGA— convertida en gate, para que la fuga que la fase 0 limpió no vuelva a entrar por el
// archivo más público del repositorio.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPORT = "docs/brochure-export.json";
const BROCHURE = "docs/BROCHURE.html";

type Feature = {
  readonly id: string;
  readonly nombre: string;
  readonly seccion_manual: string;
};
type Grupo = {
  readonly orden: number;
  readonly estrella: boolean;
  readonly nombre: string;
  readonly features: readonly Feature[];
};
type Metrica = {
  readonly clave: string;
  readonly valor: number;
  readonly fuente: string;
  readonly detalle: string;
};
type Export = {
  readonly schema_version: string;
  readonly app: { readonly estado: string; readonly sellado_en: string | null };
  readonly funcionalidades: {
    readonly total: number;
    readonly fuente_del_conteo: string;
    readonly grupos: readonly Grupo[];
  };
  readonly metricas: readonly Metrica[];
  readonly enlaces: {
    readonly produccion: string | null;
    readonly razon: string;
  };
  readonly _schema: Record<string, string>;
};

const ficha = JSON.parse(readFileSync(EXPORT, "utf8")) as Export;
const brochure = readFileSync(BROCHURE, "utf8");

/** Las cuatro del contrato. Una cifra sin una de estas no entra. */
const FUENTES = ["medido", "calculada", "declarado", "estimacion"];

describe("contrato brochure-export v1.0.0", () => {
  it("conserva el bloque _schema, que viaja con el archivo", () => {
    expect(ficha.schema_version).toBe("1.0.0");
    expect(ficha._schema._lee_esto_primero).toMatch(/documenta el formato/);
    expect(ficha._schema["metricas[].fuente"]).toBeTruthy();
  });

  it("el total de funcionalidades es la suma de las features de sus grupos", () => {
    const sumadas = ficha.funcionalidades.grupos.flatMap(
      (g) => g.features,
    ).length;
    expect(sumadas).toBe(ficha.funcionalidades.total);
  });

  it("ninguna feature se repite ni se queda sin su sección del manual", () => {
    const features = ficha.funcionalidades.grupos.flatMap((g) => g.features);
    const ids = features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of features) {
      expect(f.seccion_manual, `${f.id} sin sección del manual`).toBeTruthy();
    }
    expect(ficha.funcionalidades.fuente_del_conteo).toBe(
      "docs/MANUAL-DE-USO.md",
    );
  });

  it("hay exactamente un grupo estrella", () => {
    expect(ficha.funcionalidades.grupos.filter((g) => g.estrella)).toHaveLength(
      1,
    );
  });

  it("toda métrica declara una procedencia válida y su detalle", () => {
    expect(ficha.metricas.length).toBeGreaterThan(0);
    for (const m of ficha.metricas) {
      expect(FUENTES, `métrica «${m.clave}» con fuente inválida`).toContain(
        m.fuente,
      );
      expect(typeof m.valor, `métrica «${m.clave}» sin valor numérico`).toBe(
        "number",
      );
      expect(m.detalle, `métrica «${m.clave}» sin detalle`).toBeTruthy();
    }
  });

  it("el conteo del pie del brochure es el mismo del export", () => {
    // El pie lleva el número dos veces: el texto accesible y la cifra que se cuenta sola. Los
    // dos tienen que ser el total, o el brochure diría una cosa y su ficha otra.
    const accesible = brochure.match(
      /<span class="sr-only">(\d+) funcionalidades<\/span/,
    );
    const contador = brochure.match(/id="conteo"[^>]*>(\d+)</);
    expect(
      accesible?.[1],
      "no se encontró el conteo accesible en el pie",
    ).toBeTruthy();
    expect(Number(accesible?.[1])).toBe(ficha.funcionalidades.total);
    expect(Number(contador?.[1])).toBe(ficha.funcionalidades.total);
  });

  it("el estado inicial no lleva fecha de sellado", () => {
    expect(["inicial", "sellado"]).toContain(ficha.app.estado);
    if (ficha.app.estado === "inicial") expect(ficha.app.sellado_en).toBeNull();
    else expect(ficha.app.sellado_en).toBeTruthy();
  });

  it("no publica ninguna URL de producción ni de preview (regla 14)", () => {
    const FUGA = /https?:\/\/[^\s"'<>]*(vercel\.app|workers\.dev)/i;
    expect(
      FUGA.test(readFileSync(EXPORT, "utf8")),
      "el export publica una URL",
    ).toBe(false);
    expect(FUGA.test(brochure), "el brochure publica una URL").toBe(false);
    expect(ficha.enlaces.produccion).toBeNull();
    expect(ficha.enlaces.razon).toBeTruthy();
  });
});
