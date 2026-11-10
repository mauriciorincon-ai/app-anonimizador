// @vitest-environment node
// La matriz de cobertura de la guía (S12): cada una de las 22 funcionalidades del inventario o tiene la parada que la prueba, o dice
// por qué no la tiene. Un test falla si una construida queda sin parada, si un id aparece en dos paradas o si el número de la matriz
// no es el lugar real de la parada. Sin esta prueba, una funcionalidad nueva se construye y la guía del ensayo no la camina.
// Modelo: `tests/unit/guia-cobertura.test.ts` de HackGuard; aquí la parada es una `<section>` (en Velo cada parada tiene varias
// pruebas) y los ids salen de `docs/brochure-export.json`, para que la guía no se separe del brochure.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

interface Fila {
  id: string;
  estado: string;
  parada: string | null;
  /** El N de «Parada N» que la matriz escribe en su enlace; `null` si el enlace no lo trae. */
  numero: number | null;
}
interface Parada {
  ancla: string;
  cubre: string[];
  /** El N de «Parada N de M» que la propia parada lleva escrito; `null` si no lo trae. */
  n: number | null;
  /** El M de ese mismo texto. */
  de: number | null;
  global: boolean;
  html: string;
}

/** Las filas de la matriz y las paradas de un texto de guía. Se usa también con guías rotas a propósito. */
function leerGuia(html: string): { filas: Fila[]; paradas: Parada[] } {
  const filas = [
    ...html.matchAll(
      /<tr data-id="([A-Z]\d+)" data-estado="([a-z]+)">([\s\S]*?)<\/tr>/g,
    ),
  ].map((m) => {
    const numero = m[3]!.match(/>Parada (\d+)</)?.[1];
    return {
      id: m[1]!,
      estado: m[2]!,
      parada: m[3]!.match(/href="#(p-[^"]+)"/)?.[1] ?? null,
      numero: numero === undefined ? null : Number(numero),
    };
  });
  const paradas = [
    ...html.matchAll(
      /<section class="bloque([^"]*)" id="(p-[^"]+)" data-cubre="([^"]*)">([\s\S]*?)<\/section>/g,
    ),
  ].map((m) => {
    const lugar = m[4]!.match(/Parada (\d+) de (\d+)/);
    return {
      ancla: m[2]!,
      cubre: m[3]!.split(",").filter((x) => x !== ""),
      n: lugar ? Number(lugar[1]) : null,
      de: lugar ? Number(lugar[2]) : null,
      global: m[1]!.includes("es-global"),
      html: m[4]!,
    };
  });
  return { filas, paradas };
}

/** Lo que está mal en una guía, en frases; vacío si la cobertura cuadra. */
function problemasDeCobertura(html: string): string[] {
  const { filas, paradas } = leerGuia(html);
  const problemas: string[] = [];
  const conocidos = new Set(filas.map((f) => f.id));
  for (const f of filas) {
    const quienes = paradas.filter((p) => p.cubre.includes(f.id));
    if (f.estado === "construida") {
      if (quienes.length === 0)
        problemas.push(`${f.id} está construida y ninguna parada la cubre`);
      if (quienes.length > 1)
        problemas.push(
          `${f.id} aparece en ${quienes.length} paradas: ${quienes.map((p) => p.ancla).join(", ")}`,
        );
      if (quienes.length === 1 && f.parada !== quienes[0]!.ancla)
        problemas.push(
          `${f.id}: la matriz apunta a ${f.parada ?? "nada"} y la parada es ${quienes[0]!.ancla}`,
        );
    } else if (quienes.length > 0) {
      problemas.push(
        `${f.id} está ${f.estado} y la parada ${quienes[0]!.ancla} dice cubrirla`,
      );
    }
  }
  for (const p of paradas)
    for (const id of p.cubre)
      if (!conocidos.has(id))
        problemas.push(`${p.ancla} cubre ${id}, que la matriz no conoce`);
  // El «Parada N» de la matriz es el de la parada a la que apunta, y ese es su lugar real en el recorrido.
  for (const f of filas) {
    if (f.numero === null || f.parada === null) continue;
    const lugar = paradas.findIndex((p) => p.ancla === f.parada);
    if (lugar === -1) {
      problemas.push(`${f.id}: la matriz apunta a ${f.parada}, que no existe`);
      continue;
    }
    if (f.numero !== lugar + 1)
      problemas.push(
        `${f.id}: la matriz dice «Parada ${f.numero}» y ${f.parada} es la parada ${lugar + 1} del recorrido`,
      );
    const escrito = paradas[lugar]!.n;
    if (escrito !== null && escrito !== lugar + 1)
      problemas.push(
        `${f.parada} dice «Parada ${escrito}» y es la parada ${lugar + 1} del recorrido`,
      );
  }
  return problemas;
}

/** El HTML formateado parte las frases en cualquier espacio: las comparaciones de texto lo aplanan. */
const plano = (html: string) => html.replace(/\s+/g, " ");

const guia = readFileSync(`${RAIZ}/docs/GUIA-DE-PRUEBA.html`, "utf8");
const { filas, paradas } = leerGuia(guia);
const exportado = JSON.parse(
  readFileSync(`${RAIZ}/docs/brochure-export.json`, "utf8"),
) as {
  funcionalidades: {
    descartadas: { id: string }[];
    grupos: { features: { id: string }[] }[];
  };
};
const idsDelExport = exportado.funcionalidades.grupos.flatMap((g) =>
  g.features.map((f) => f.id),
);

describe("la matriz de cobertura de la guía de prueba", () => {
  it("lista las 22 funcionalidades del brochure, una vez cada una y en su orden", () => {
    expect(idsDelExport).toHaveLength(22);
    expect(filas.map((f) => f.id)).toEqual(idsDelExport);
  });

  it("cada fila dice su estado con una de las tres palabras", () => {
    expect(
      filas.filter(
        (f) => !["construida", "pendiente", "descartada"].includes(f.estado),
      ),
    ).toEqual([]);
  });

  it("nada está descartado ni pendiente, y el brochure no descarta nada: coinciden", () => {
    expect(exportado.funcionalidades.descartadas).toEqual([]);
    expect(filas.filter((f) => f.estado !== "construida")).toEqual([]);
  });

  it("toda funcionalidad construida tiene exactamente una parada, y ningún id está en dos", () => {
    expect(problemasDeCobertura(guia)).toEqual([]);
  });

  it("cada construida enlaza a su parada con su número («Parada N»), y N es el lugar real de esa parada", () => {
    for (const f of filas.filter((x) => x.estado === "construida")) {
      expect(f.numero, `${f.id} sin «Parada N» en su enlace`).not.toBeNull();
      const lugar = paradas.findIndex((p) => p.ancla === f.parada);
      expect(f.numero, f.id).toBe(lugar + 1);
      expect(paradas[lugar]!.n, f.id).toBe(lugar + 1);
    }
  });

  it("las paradas se numeran de 1 a M sin saltos, y M es cuántas hay", () => {
    expect(paradas.length).toBeGreaterThan(0);
    paradas.forEach((p, i) => {
      expect(p.n, p.ancla).toBe(i + 1);
      expect(p.de, p.ancla).toBe(paradas.length);
    });
    expect(new Set(paradas.map((p) => p.ancla)).size).toBe(paradas.length);
  });
});

describe("la guía es UN recorrido", () => {
  const ultima = paradas.length - 1;
  const primeraGlobal = paradas.findIndex((p) => p.global);

  it("las paradas que cambian algo de tu equipo van juntas, al final, y cada una dice cómo volver", () => {
    expect(primeraGlobal).toBeGreaterThan(0);
    // Solo el juicio sobre el conjunto viene después de ellas.
    paradas.forEach((p, i) => {
      if (i < primeraGlobal) expect(p.global, p.ancla).toBe(false);
      else if (i < ultima) expect(p.global, p.ancla).toBe(true);
    });
    expect(paradas[ultima]!.global).toBe(false);
    for (const p of paradas.filter((x) => x.global)) {
      expect(p.html, `${p.ancla} sin «Cómo volver»`).toContain("Cómo volver");
      expect(p.html, `${p.ancla} sin su aviso`).toContain('class="global"');
    }
  });

  it("el inglés se ve conmutando el idioma a mitad del recorrido", () => {
    const i = paradas.findIndex((p) => p.ancla === "p-idiomas");
    expect(i).toBeGreaterThan(paradas.length * 0.25);
    expect(i).toBeLessThan(primeraGlobal);
    expect(paradas[i]!.global).toBe(false);
  });

  it("Safari real queda como parada, con la matriz de la regla 24 y sin pedir la contraseña", () => {
    const safari = paradas.find((p) => p.ancla === "p-safari");
    expect(safari?.global).toBe(true);
    for (const columna of [
      "Acción",
      "Para qué",
      "Qué aviso verás",
      "Cómo se deshace",
    ])
      expect(safari!.html).toContain(`<th>${columna}</th>`);
    expect(plano(safari!.html)).toContain("NO se hace aquí");
  });

  it("el cruce entre archivos (C9) se prueba con la sal fijada, que la web no deja fijar", () => {
    const local = paradas.find((p) => p.cubre.includes("C9"));
    expect(local?.ancla).toBe("p-local");
    expect(local!.html).toContain("--sal");
  });

  it("cada parada tiene título y pruebas, y cada casilla tiene su etiqueta y un id único", () => {
    const ids: string[] = [];
    for (const p of paradas) {
      expect(p.html, p.ancla).toMatch(/<h2>[^<]+<\/h2>/);
      const casillas = [
        ...p.html.matchAll(/<input type="checkbox" id="([^"]+)"/g),
      ];
      expect(casillas.length, `${p.ancla} sin pruebas`).toBeGreaterThan(0);
      for (const c of casillas) {
        ids.push(c[1]!);
        expect(p.html, `${c[1]} sin <label for>`).toContain(`for="${c[1]}"`);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no queda nada de lo que contradice a un solo recorrido ni frases caducas", () => {
    const caducas: [RegExp, string][] = [
      [/Sprint 008/, "el encabezado de la guía vieja"],
      [/204 pruebas/, "la cuenta de la guía vieja"],
      [
        /Gate m[ií]nimo|Gate corto/,
        "los dos gates, que el ensayo del H-2 reemplaza",
      ],
      [/data-minimo|data-esencial|data-filtro/, "los filtros ⭐"],
      [/reporte del tratamiento/, "el reporte del S2 es hoy el certificado"],
      [
        /\bbloques?\s+(?:<[a-z]+>)?[A-Z]{1,2}\b/,
        "una referencia a las letras de los bloques viejos",
      ],
      [
        /\bpaso\s+(?:<[a-z]+>)?[A-Z]\d\b/,
        "una referencia a un paso por su letra vieja",
      ],
    ];
    for (const [patron, porQue] of caducas) {
      // El historial del pie cuenta lo que se retiró y por qué: es el único sitio donde esas palabras viven.
      const sinHistorial = plano(
        guia.replace(/<details[\s\S]*?<\/details>/, ""),
      );
      expect(patron.test(sinHistorial), porQue).toBe(false);
    }
  });
});

// Un gate se demuestra fallando (regla 15): guías rotas a propósito, cada una debe nombrar su problema.
describe("el gate falla cuando la cobertura se rompe", () => {
  const fila = (
    id: string,
    estado: string,
    parada: string | null,
    n?: number,
  ) =>
    `<tr data-id="${id}" data-estado="${estado}"><td>${id}</td><td>x</td><td>x</td><td>${parada === null ? "—" : `<a href="#${parada}">${n === undefined ? "ir" : `Parada ${n}`}</a>`}</td></tr>`;
  const parada = (ancla: string, cubre: string, n: number) =>
    `<section class="bloque" id="${ancla}" data-cubre="${cubre}"><p class="parada">Parada ${n} de 3</p></section>`;

  it("una construida sin parada", () => {
    const html = fila("C1", "construida", null) + parada("p-a", "", 1);
    expect(problemasDeCobertura(html)).toEqual([
      "C1 está construida y ninguna parada la cubre",
    ]);
  });

  it("un id en dos paradas", () => {
    const html =
      fila("C1", "construida", "p-a") +
      parada("p-a", "C1", 1) +
      parada("p-b", "C1", 2);
    expect(problemasDeCobertura(html)[0]).toBe(
      "C1 aparece en 2 paradas: p-a, p-b",
    );
  });

  it("un «Parada N» de la matriz que no es el lugar real de su parada", () => {
    const html =
      fila("C1", "construida", "p-b", 1) +
      parada("p-a", "", 1) +
      parada("p-b", "C1", 2);
    expect(problemasDeCobertura(html)).toEqual([
      "C1: la matriz dice «Parada 1» y p-b es la parada 2 del recorrido",
    ]);
  });

  it("una parada que cubre algo pendiente, o un id que la matriz no conoce", () => {
    const html =
      fila("C19", "pendiente", null) +
      parada("p-a", "C19", 1) +
      parada("p-b", "Z9", 2);
    expect(problemasDeCobertura(html)).toEqual([
      "C19 está pendiente y la parada p-a dice cubrirla",
      "p-b cubre Z9, que la matriz no conoce",
    ]);
  });

  it("una parada que lleva escrito un número que no es el suyo", () => {
    const html =
      fila("C1", "construida", "p-b", 2) +
      parada("p-a", "", 1) +
      parada("p-b", "C1", 3);
    expect(problemasDeCobertura(html)).toEqual([
      "p-b dice «Parada 3» y es la parada 2 del recorrido",
    ]);
  });
});
