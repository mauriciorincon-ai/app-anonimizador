// El ruido con garantía (S7) se cree solo con números. Estas pruebas son ESTADÍSTICAS pero
// SEMBRADAS: cada muestra sale de una semilla fija, así que pasan o fallan igual en cada corrida —
// nunca «a veces». Los márgenes son de 5 desviaciones estándar: holgados para no ser frágiles,
// estrechos para que un muestreo con otra distribución caiga.

import { beforeAll, describe, expect, it } from "vitest";

import { ConstructorColumnar, type ColumnaColumnar } from "@/engine/columnar";
import {
  aplicarRuido,
  aUnidades,
  deUnidades,
  DOMINIO_MAXIMO,
} from "@/engine/ruido";
import { AzarSembrado } from "@/engine/ruido/azar";
import {
  bernoulliExpNeg,
  COTAS_DE_E,
  DOS_A_LA_32,
  EPSILONES,
  epsilonEfectivo,
  laplaceDiscreto,
  pesoDelAzar,
  type ClaveDeEpsilon,
} from "@/engine/ruido/muestreo";
import { Sha256 } from "@/lib/sha256";

/** Una semilla fija por índice: 32 bytes del SHA-256 de `semilla-<i>`. */
function azarDe(i: number): AzarSembrado {
  const palabras = new Sha256()
    .actualizar(new TextEncoder().encode(`semilla-${i}`))
    .terminarEnPalabras();
  const bytes = new Uint8Array(32);
  const vista = new DataView(bytes.buffer);
  palabras.forEach((p, j) => vista.setUint32(j * 4, p, false));
  return new AzarSembrado(bytes);
}

const N = 20_000;
const CINCO_SIGMAS = (p: number, n: number) => 5 * Math.sqrt((p * (1 - p)) / n);

describe("el azar sembrado", () => {
  it("es determinista: la misma semilla da las mismas palabras, también más allá del primer bloque", () => {
    const a = azarDe(7);
    const b = azarDe(7);
    for (let i = 0; i < 40; i++) expect(b.palabra()).toBe(a.palabra());
    expect(azarDe(8).palabra()).not.toBe(azarDe(7).palabra());
  });

  it("uniforme(n) es uniforme: cada resto de 0 a 6 sale ~1/7 de las veces", () => {
    const cuenta = new Array<number>(7).fill(0);
    const azar = azarDe(1);
    for (let i = 0; i < N; i++) cuenta[azar.uniforme(7)]++;
    for (const c of cuenta)
      expect(Math.abs(c / N - 1 / 7)).toBeLessThan(CINCO_SIGMAS(1 / 7, N));
  });

  it("uniforme acepta hasta 2⁴⁰ y rechaza lo que no cuenta exacto", () => {
    expect(azarDe(2).uniforme(2 ** 40)).toBeLessThan(2 ** 40);
    expect(() => azarDe(2).uniforme(2 ** 40 + 1)).toThrow(RangeError);
    expect(() => azarDe(2).uniforme(0)).toThrow(RangeError);
  });
});

describe("Bernoulli(exp(−γ)) exacto (Canonne, Kamath y Steinke 2020, alg. 1)", () => {
  for (const [n, d] of [
    [0, 1],
    [3, 10],
    [1, 1],
    [5, 2],
  ] as const) {
    it(`γ = ${n}/${d}: la frecuencia es exp(−γ)`, () => {
      const p = Math.exp(-n / d);
      let unos = 0;
      for (let i = 0; i < N; i++) if (bernoulliExpNeg(azarDe(i), n, d)) unos++;
      expect(Math.abs(unos / N - p)).toBeLessThanOrEqual(
        CINCO_SIGMAS(p, N) + 1e-12,
      );
    });
  }
});

describe("Laplace discreto exacto (alg. 2)", () => {
  it("media 0 y la varianza 2p/(1−p)² de su parámetro p = exp(−s/t)", () => {
    const s = 1;
    const t = 4;
    const p = Math.exp(-s / t);
    const varianza = (2 * p) / (1 - p) ** 2;
    let suma = 0;
    let cuadrados = 0;
    for (let i = 0; i < N; i++) {
      const y = laplaceDiscreto(azarDe(i), s, t);
      suma += y;
      cuadrados += y * y;
    }
    const media = suma / N;
    expect(Math.abs(media)).toBeLessThan(5 * Math.sqrt(varianza / N));
    expect(Math.abs(cuadrados / N - varianza) / varianza).toBeLessThan(0.1);
  });

  it("P(y | x) / P(y | x′) ≤ e^ε en una rejilla chica: la privacidad diferencial, medida", () => {
    // Rango [0, 4] en enteros, ε = 1: sensibilidad 4, escala 4. Las dos entradas extremas.
    const salidaDe = (x: number, i: number) =>
      Math.min(4, Math.max(0, x + laplaceDiscreto(azarDe(i), 1, 4)));
    const histograma = (x: number, desde: number) => {
      const h = new Array<number>(5).fill(0);
      for (let i = 0; i < N; i++) h[salidaDe(x, desde + i)]++;
      return h.map((c) => c / N);
    };
    const desdeCero = histograma(0, 0);
    const desdeCuatro = histograma(4, N);
    for (let y = 0; y <= 4; y++) {
      const razon = Math.max(
        desdeCero[y] / desdeCuatro[y],
        desdeCuatro[y] / desdeCero[y],
      );
      // Con estas probabilidades (≥ 0,1) el margen muestral de la razón es menor que el 10 %.
      expect(razon, `y = ${y}`).toBeLessThan(Math.E * 1.1);
    }
  });
});

describe("respuesta aleatorizada: ε efectivo exacto, siempre ≤ ε", () => {
  it("las cotas racionales de e^ε son cotas INFERIORES, a menos de 10⁻⁸", () => {
    for (const clave of Object.keys(EPSILONES) as ClaveDeEpsilon[]) {
      const [num, den] = COTAS_DE_E[clave];
      const cota = Number(num) / Number(den);
      expect(cota).toBeLessThanOrEqual(Math.exp(Number(clave)));
      expect(Math.exp(Number(clave)) - cota).toBeLessThan(
        1e-8 * Math.exp(Number(clave)),
      );
    }
  });

  it(`para todo m ≤ ${DOMINIO_MAXIMO} y todo ε de la lista, el efectivo no pasa del pedido`, () => {
    for (const clave of Object.keys(EPSILONES) as ClaveDeEpsilon[])
      for (let m = 2; m <= DOMINIO_MAXIMO; m++) {
        const efectivo = epsilonEfectivo(m, pesoDelAzar(m, clave));
        expect(efectivo, `m=${m} ε=${clave}`).toBeLessThanOrEqual(
          Number(clave),
        );
        // Y casi lo agota: no se regala privacidad que el usuario no pidió (ni utilidad).
        expect(Number(clave) - efectivo, `m=${m} ε=${clave}`).toBeLessThan(
          1e-6,
        );
      }
  });

  it("con un solo valor no hay nada que aleatorizar: ε efectivo 0", () => {
    expect(pesoDelAzar(1, "1")).toBe(0);
    expect(epsilonEfectivo(1, 0)).toBe(0);
  });
});

// ── Sobre una columna, con llave ───────────────────────────────────────────────────────────────

function columnaDe(valores: readonly string[], nombre = "x"): ColumnaColumnar {
  const c = new ConstructorColumnar([nombre], valores.length || 1);
  for (const v of valores) c.agregarFila([v]);
  return c.finalizar().columnas[0];
}

const filas = (c: ColumnaColumnar) =>
  Array.from(c.codigos, (k) => c.valores[k]);

async function llaveDe(semilla: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(semilla.padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let llaveA: CryptoKey;
let llaveB: CryptoKey;
beforeAll(async () => {
  llaveA = await llaveDe("llave-del-ruido-a");
  llaveB = await llaveDe("llave-del-ruido-b");
});

const LAPLACE = {
  tipo: "laplace",
  epsilon: 1,
  minimo: 0,
  maximo: 100,
  decimales: 1,
} as const;

describe("las técnicas sobre una columna", () => {
  const EDADES = ["37", "41,5", "", "abc", "250", "-3", "37"];

  it("Laplace: vacío vacío, texto intacto y contado, fuera de rango recortado y contado, en sus decimales", async () => {
    const r = await aplicarRuido(columnaDe(EDADES), LAPLACE, llaveA, "huella");
    const salida = filas(r.columna);
    expect(salida[2]).toBe("");
    expect(salida[3]).toBe("abc");
    for (const i of [0, 1, 4, 5, 6]) {
      expect(salida[i]).toMatch(/^\d+\.\d$/);
      expect(Number(salida[i])).toBeGreaterThanOrEqual(0);
      expect(Number(salida[i])).toBeLessThanOrEqual(100);
    }
    expect(r.informe).toMatchObject({
      mecanismo: "laplace",
      epsilon: 1,
      epsilonEfectivo: 1,
      tratadas: 5,
      recortes: 2,
      noNumericas: 1,
      aplicado: true,
    });
  });

  it("el ruido es por celda: veinte celdas con el mismo valor no salen todas iguales", async () => {
    const r = await aplicarRuido(
      columnaDe(Array(20).fill("50")),
      { ...LAPLACE, epsilon: 8 },
      llaveA,
      "huella",
    );
    expect(new Set(filas(r.columna)).size).toBeGreaterThan(5);
  });

  it("misma llave + misma huella ⇒ el mismo ruido; otra llave u otra huella ⇒ otro", async () => {
    const valores = Array.from({ length: 30 }, (_, i) => String(i * 3));
    const columna = columnaDe(valores);
    const a = filas(
      (await aplicarRuido(columna, LAPLACE, llaveA, "h1")).columna,
    );
    expect(
      filas((await aplicarRuido(columna, LAPLACE, llaveA, "h1")).columna),
    ).toEqual(a);
    expect(
      filas((await aplicarRuido(columna, LAPLACE, llaveB, "h1")).columna),
    ).not.toEqual(a);
    // La huella del archivo entra a la semilla: dos archivos con las filas en el mismo orden no
    // comparten ruido (si no, quien conociera un valor de uno despejaría el otro).
    expect(
      filas((await aplicarRuido(columna, LAPLACE, llaveA, "h2")).columna),
    ).not.toEqual(a);
  });

  it("el mismo archivo con otro ε recibe otro azar: dos entregas no se restan para despejar el valor", async () => {
    // Si la técnica no entrara a la semilla, el ruido con ε = 2 sería el de ε = 1 a escala —mismo
    // signo en todas las celdas— y restar las dos entregas despejaría el valor original. Con el
    // valor en el centro del rango, el recorte no cambia el signo: el signo ES el del ruido.
    const columna = columnaDe(Array(400).fill("50"));
    const signos = async (epsilon: 1 | 2) =>
      filas(
        (
          await aplicarRuido(
            columna,
            { ...LAPLACE, epsilon, decimales: 0 },
            llaveA,
            "h1",
          )
        ).columna,
      ).map((y) => Math.sign(Number(y) - 50));
    const [uno, dos] = [await signos(1), await signos(2)];
    const ambos = uno.flatMap((s, i) =>
      s !== 0 && dos[i] !== 0 ? [s === dos[i]] : [],
    );
    const iguales = ambos.filter(Boolean).length / ambos.length;
    // Independientes: la mitad, con su margen; correlacionados: todos.
    expect(ambos.length).toBeGreaterThan(300);
    expect(Math.abs(iguales - 0.5)).toBeLessThan(
      CINCO_SIGMAS(0.5, ambos.length),
    );
  });

  it("respuesta aleatorizada: responde dentro del dominio y dice verdad a la tasa 1 − w + w/m", async () => {
    const dominio = ["A", "B", "C", "D"];
    const valores = Array.from({ length: 4000 }, (_, i) => dominio[i % 4]);
    const r = await aplicarRuido(
      columnaDe(valores),
      { tipo: "respuesta-aleatorizada", epsilon: 1 },
      llaveA,
      "huella",
    );
    const salida = filas(r.columna);
    expect(new Set(salida)).toEqual(new Set(dominio));
    const w = pesoDelAzar(4, "1") / DOS_A_LA_32;
    const p = 1 - w + w / 4;
    const verdad =
      salida.filter((y, i) => y === valores[i]).length / valores.length;
    expect(Math.abs(verdad - p)).toBeLessThan(CINCO_SIGMAS(p, valores.length));
    expect(r.informe.dominio).toBe(4);
    expect(r.informe.epsilonEfectivo).toBeLessThanOrEqual(1);
  });

  it(`respuesta aleatorizada con más de ${DOMINIO_MAXIMO} valores: NO se aplica y lo dice`, async () => {
    const valores = Array.from(
      { length: DOMINIO_MAXIMO + 1 },
      (_, i) => `v${i}`,
    );
    const columna = columnaDe(valores);
    const r = await aplicarRuido(
      columna,
      { tipo: "respuesta-aleatorizada", epsilon: 1 },
      llaveA,
      "huella",
    );
    expect(r.informe.aplicado).toBe(false);
    expect(r.informe.dominio).toBe(DOMINIO_MAXIMO + 1);
    expect(r.columna).toBe(columna);
  });

  it("perturbar: cada número se mueve a lo sumo ±p %, en los decimales con que vino", async () => {
    const valores = Array.from({ length: 200 }, (_, i) => `${1000 + i}.50`);
    const r = await aplicarRuido(
      columnaDe(valores),
      { tipo: "perturbar", porcentaje: 10 },
      llaveA,
      "huella",
    );
    filas(r.columna).forEach((y, i) => {
      expect(y).toMatch(/^\d+\.\d\d$/);
      const x = Number(valores[i]);
      expect(Math.abs(Number(y) - x)).toBeLessThanOrEqual(x * 0.1 + 0.01);
    });
    expect(r.informe.epsilon).toBeNull();
    expect(r.informe.epsilonEfectivo).toBeNull();
  });
});

describe("la rejilla decimal, exacta", () => {
  it("pasa a unidades redondeando la mitad hacia arriba sobre los dígitos, sin flotantes", () => {
    expect(aUnidades("37,25", 1)).toBe(373);
    expect(aUnidades("37.24", 1)).toBe(372);
    expect(aUnidades("-0.05", 1)).toBe(-1);
    expect(aUnidades("0.04", 1)).toBe(0);
    expect(aUnidades("12", 2)).toBe(1200);
    expect(aUnidades("1e5", 0)).toBeNull();
    expect(aUnidades("abc", 0)).toBeNull();
  });

  it("y vuelve a texto con punto y sus decimales", () => {
    expect(deUnidades(373, 1)).toBe("37.3");
    expect(deUnidades(-5, 2)).toBe("-0.05");
    expect(deUnidades(1200, 0)).toBe("1200");
  });
});
