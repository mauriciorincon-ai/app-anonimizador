// Tests de los estimadores poblacionales.
//
// Aquí no vale el instrumento habitual —«corre sobre el fixture y mira si el número es plausible»—
// por dos razones que conviene tener delante:
//
//   1. **Un número plausible es exactamente el defecto que buscamos.** Una fórmula mal copiada no
//      revienta: devuelve 0,198331 donde tocaba 0,198330. Cualquier aserción de «hay un número
//      entre 0 y 1» la deja pasar.
//   2. **Zayatz (1991) advierte que su método puede no funcionar sobre datos simulados** «with odd
//      equivalence class structures», y los fixtures de este repo son sintéticos POR REGLA DURA.
//      O sea: la fuente dice, con todas las letras, que no se puede verificar este estimador
//      comparándolo con la verdad de un fixture generado.
//
// Así que se verifica de otras cuatro maneras, todas independientes del fixture:
//
//   · contra una IMPLEMENTACIÓN INDEPENDIENTE escrita en este archivo (suma directa de la binomial
//     negativa y binomiales exactos), que no comparte una línea con el motor;
//   · contra los VALORES PUBLICADOS en la Tabla 4 del informe de Zayatz;
//   · contra los LÍMITES que el modelo obliga a cumplir (censo, fracción → 0, monotonía);
//   · contra las INVARIANTES que la propia derivación garantiza (θ ≤ 1, r_f ≤ 1/f).

import { describe, expect, it } from "vitest";

import {
  clasesDeEquivalencia,
  riesgoProsecutor,
} from "../../src/engine/riesgo";
import {
  estimarRiesgo,
  FRACCION_MINIMA_ZAYATZ,
  probabilidadDeUnicoEnMuestra,
  riesgoIndividualDeClase,
  riesgoIndividualEstimado,
  unicosPoblacionalesEstimados,
  type EntradasDeEstimacion,
} from "../../src/engine/riesgo-estimado";
import { serializarCanonico } from "../../src/engine/serializacion";

// ── Instrumentos independientes ───────────────────────────────────────────────────────────────

/**
 * r_f = E[1/F | f] por suma directa de la binomial negativa. La definición, sin atajos.
 *
 * No comparte nada con el motor a propósito: un test que verificara la serie del motor con la
 * serie del motor pasaría dijera lo que dijera.
 */
function riesgoPorSumaDirecta(f: number, p: number): number {
  const q = 1 - p;
  let peso = Math.pow(p, f); // P(F = f)
  let suma = peso / f;
  for (let j = 1; j < 20_000_000; j++) {
    const F = f + j;
    peso = (peso * q * (F - 1)) / (F - f); // C(F−1,f−1) p^f q^(F−f), por la razón entre términos
    const aporte = peso / F;
    suma += aporte;
    if (j > 50 && aporte < 1e-18 * suma) break;
  }
  return suma;
}

/** La recursión de los manuales, aquí SOLO para demostrar por qué el motor no la usa. */
function riesgoPorRecursionIngenua(f: number, p: number): number {
  const q = 1 - p;
  let r = (p / q) * Math.log(1 / p);
  for (let i = 2; i <= f; i++) r = (p / q) * (1 / (i - 1) - r);
  return r;
}

/** Prob(1_s|C_p) por la definición con binomiales, en logaritmos para que no desborde. */
function probUnicoPorBinomiales(C: number, N: number, n: number): number {
  const logFactorial = (x: number): number => {
    let s = 0;
    for (let i = 2; i <= x; i++) s += Math.log(i);
    return s;
  };
  const logC = (a: number, b: number): number =>
    b < 0 || b > a
      ? -Infinity
      : logFactorial(a) - logFactorial(b) - logFactorial(a - b);
  return Math.exp(logC(C, 1) + logC(N - C, n - 1) - logC(N, n));
}

/** Entradas a partir de una lista de tamaños de clase, sin pasar por una tabla. */
function conTamanos(
  tamanos: number[],
  poblacion: number | null,
): EntradasDeEstimacion {
  const filas = tamanos.reduce((a, b) => a + b, 0);
  return {
    clases: {
      ids: new Uint32Array(filas),
      tamanos: Uint32Array.from(tamanos),
    },
    filas,
    poblacion,
  };
}

// ── Benedetti–Franconi: contra la definición ──────────────────────────────────────────────────

describe("riesgo individual (Benedetti–Franconi 1998)", () => {
  const FRACCIONES = [
    0.001, 0.01, 0.1, 0.3, 0.4999, 0.5, 0.5001, 0.7, 0.9, 0.99,
  ];
  const TAMANOS = [1, 2, 3, 5, 10, 20, 50];

  it("coincide con la suma directa de la binomial negativa en todo el dominio", () => {
    for (const p of FRACCIONES) {
      for (const f of TAMANOS) {
        const esperado = riesgoPorSumaDirecta(f, p);
        const obtenido = riesgoIndividualDeClase(f, p);
        expect(
          Math.abs(obtenido - esperado) / esperado,
          `f=${f} p=${p}`,
        ).toBeLessThan(1e-12);
      }
    }
  });

  it("los dos métodos se dan la mano en la frontera p = 1/2", () => {
    // Justo por debajo va la recursión y justo por encima la serie. Si el corte estuviera mal, la
    // cifra daría un salto al mover la fracción una diezmilésima.
    for (const f of TAMANOS) {
      const antes = riesgoIndividualDeClase(f, 0.4999);
      const despues = riesgoIndividualDeClase(f, 0.5001);
      expect(Math.abs(despues - antes), `f=${f}`).toBeLessThan(1e-3);
      expect(despues).toBeGreaterThan(antes); // y sigue creciendo con p
    }
  });

  it("la recursión de los manuales SE ROMPE donde el motor acierta", () => {
    // Este test no protege un comportamiento: protege una DECISIÓN. Si alguien «simplifica» el
    // motor volviendo a la recursión, esto documenta lo que costaría.
    const sutil = riesgoPorRecursionIngenua(5, 0.99);
    const verdadero = riesgoPorSumaDirecta(5, 0.99);
    expect(Math.abs(sutil - verdadero)).toBeGreaterThan(1e-10); // se desvía…
    expect(Math.abs(sutil - verdadero)).toBeLessThan(1e-5); // …tan poco que parece bien
    expect(riesgoIndividualDeClase(5, 0.99)).toBeCloseTo(verdadero, 12);

    // Y con clases grandes deja de disimular.
    expect(riesgoPorRecursionIngenua(50, 0.9)).toBeLessThan(-1e30);
    expect(riesgoIndividualDeClase(50, 0.9)).toBeCloseTo(
      riesgoPorSumaDirecta(50, 0.9),
      12,
    );
  });

  it("cumple los límites que el modelo obliga", () => {
    // Censo: la fila comparte valores con F = f personas, ni una más. Riesgo exacto 1/f.
    for (const f of TAMANOS)
      expect(riesgoIndividualDeClase(f, 1)).toBeCloseTo(1 / f, 15);
    // Fracción → 1 por abajo: el riesgo del registro solo tiende a la certeza.
    expect(riesgoIndividualDeClase(1, 0.999999)).toBeGreaterThan(0.999);
    // Fracción → 0: en una población inmensa, un único de la muestra no delata a nadie.
    expect(riesgoIndividualDeClase(1, 1e-9)).toBeLessThan(1e-7);
    expect(riesgoIndividualDeClase(1, 1e-9)).toBeGreaterThan(0);
  });

  it("decrece con el tamaño de clase y crece con la fracción de muestreo", () => {
    for (const p of FRACCIONES) {
      for (let f = 1; f < 30; f++) {
        expect(riesgoIndividualDeClase(f + 1, p), `p=${p} f=${f}`).toBeLessThan(
          riesgoIndividualDeClase(f, p),
        );
      }
    }
    for (const f of TAMANOS) {
      for (let i = 1; i < FRACCIONES.length; i++) {
        expect(
          riesgoIndividualDeClase(f, FRACCIONES[i]),
          `f=${f}`,
        ).toBeGreaterThan(riesgoIndividualDeClase(f, FRACCIONES[i - 1]));
      }
    }
  });

  it("nunca se sale de [0, 1/f] — la cota que la propia definición impone", () => {
    // F ≥ f siempre, así que 1/F ≤ 1/f. Un valor por encima significaría que el modelo cree que
    // hay MENOS gente en la población que en el archivo.
    for (const p of FRACCIONES) {
      for (const f of TAMANOS) {
        const r = riesgoIndividualDeClase(f, p);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(1 / f);
      }
    }
  });
});

describe("riesgo individual sobre un archivo", () => {
  it("el máximo es el de la clase más pequeña y el promedio queda por debajo", () => {
    const estimacion = riesgoIndividualEstimado(conTamanos([1, 1, 4, 10], 320));
    if (!estimacion.ok) throw new Error(estimacion.explicacion);

    expect(estimacion.claseMasPequena).toBe(1);
    expect(estimacion.maximo.valor).toBeCloseTo(
      riesgoIndividualDeClase(1, 16 / 320),
      15,
    );
    expect(estimacion.promedio.valor).toBeLessThan(estimacion.maximo.valor);

    // El promedio ponderado, calculado a mano aquí mismo.
    const p = 16 / 320;
    const aMano =
      (2 * 1 * riesgoIndividualDeClase(1, p) +
        4 * riesgoIndividualDeClase(4, p) +
        10 * riesgoIndividualDeClase(10, p)) /
      16;
    expect(estimacion.promedio.valor).toBeCloseTo(aMano, 15);
  });

  it("en censo el estimado cae encima del exacto, sin componerse con él", () => {
    // La propiedad más bonita del módulo: si el usuario declara que su archivo ES la población,
    // el estimador deja de estimar. No porque se le haya programado una excepción, sino porque
    // con p = 1 la binomial negativa es degenerada y E[1/F] = 1/f.
    const tamanos = [1, 1, 1, 2, 3, 5];
    const filas = 13;
    const estimacion = riesgoIndividualEstimado(conTamanos(tamanos, filas));
    if (!estimacion.ok) throw new Error(estimacion.explicacion);

    const exacto = riesgoProsecutor(
      { ids: new Uint32Array(filas), tamanos: Uint32Array.from(tamanos) },
      ["cualquiera"],
      filas,
    );
    expect(estimacion.maximo.valor).toBeCloseTo(exacto.riesgoMaximo, 15);
    expect(estimacion.promedio.valor).toBeCloseTo(exacto.riesgoPromedio, 15);
    expect(estimacion.fraccionDeMuestreo).toBe(1);
  });

  it("el intervalo del máximo contiene la cifra, y en censo es un punto", () => {
    const conMuestra = riesgoIndividualEstimado(conTamanos([1, 2, 3], 60));
    if (!conMuestra.ok) throw new Error(conMuestra.explicacion);
    const intervalo = conMuestra.maximo.intervalo;
    if (intervalo.tipo !== "derivado") throw new Error("debería ser derivable");
    expect(intervalo.desde).toBeLessThanOrEqual(conMuestra.maximo.valor);
    expect(intervalo.hasta).toBeGreaterThanOrEqual(conMuestra.maximo.valor);
    expect(intervalo.confianza).toBe(0.95);
    expect(intervalo.cubre).toMatch(/NO recoge/);

    const censo = riesgoIndividualEstimado(conTamanos([1, 2, 3], 6));
    if (!censo.ok) throw new Error(censo.explicacion);
    const punto = censo.maximo.intervalo;
    if (punto.tipo !== "derivado") throw new Error("debería ser derivable");
    expect(punto.desde).toBe(punto.hasta);
    expect(punto.desde).toBe(1);
  });

  it("el promedio NO trae intervalo, y dice por qué", () => {
    // No es un hueco por rellenar: el promedio es la esperanza del modelo, no una cantidad
    // medida. Fijada la fracción, su valor es el que es; lo que puede fallar es el modelo, y el
    // error de un modelo no cabe en una banda de confianza. Inventarla sería el defecto que este
    // módulo persigue.
    const estimacion = riesgoIndividualEstimado(conTamanos([1, 2, 3], 60));
    if (!estimacion.ok) throw new Error(estimacion.explicacion);
    expect(estimacion.promedio.intervalo.tipo).toBe("no-derivable");
    if (estimacion.promedio.intervalo.tipo !== "no-derivable") return;
    expect(estimacion.promedio.intervalo.porque.length).toBeGreaterThan(40);
  });
});

describe("el intervalo del riesgo, en sus tres regímenes", () => {
  /** P(F ≤ tope) para la binomial negativa. Independiente, para juzgar los cuantiles del motor. */
  function acumuladaNegativa(f: number, p: number, tope: number): number {
    const q = 1 - p;
    let termino = Math.pow(p, f);
    let suma = termino;
    for (let j = 1; j <= tope - f; j++) {
      termino = (termino * q * (f - 1 + j)) / j;
      suma += termino;
    }
    return suma;
  }

  it("con clases pequeñas enumera la posterior y acierta los cuantiles", () => {
    // La clase más chica es 3, así que no entra por la forma cerrada de f = 1: se enumera.
    const e = riesgoIndividualEstimado(conTamanos([3, 4, 10], 85));
    if (!e.ok) throw new Error(e.explicacion);
    const intervalo = e.maximo.intervalo;
    if (intervalo.tipo !== "derivado") throw new Error("debería ser derivable");

    const p = 17 / 85;
    const inferior = Math.round(1 / intervalo.hasta);
    const superior = Math.round(1 / intervalo.desde);

    // `inferior` es el primer F cuya acumulada llega al 2,5 %; `superior`, al 97,5 %.
    expect(acumuladaNegativa(3, p, inferior)).toBeGreaterThanOrEqual(0.025);
    expect(acumuladaNegativa(3, p, inferior - 1)).toBeLessThan(0.025);
    expect(acumuladaNegativa(3, p, superior)).toBeGreaterThanOrEqual(0.975);
    expect(acumuladaNegativa(3, p, superior - 1)).toBeLessThan(0.975);

    expect(intervalo.desde).toBeLessThanOrEqual(e.maximo.valor);
    expect(intervalo.hasta).toBeGreaterThanOrEqual(e.maximo.valor);
  });

  it("con clases grandes y cola larga usa la campana, que ahí ya no miente", () => {
    // f = 60 y una fracción minúscula: la cola no cabe en la enumeración, pero la asimetría de la
    // binomial negativa cae con √f y a los 60 la normal es buena.
    const e = riesgoIndividualEstimado(conTamanos([60, 60], 12_000_000));
    if (!e.ok) throw new Error(e.explicacion);
    const intervalo = e.maximo.intervalo;
    if (intervalo.tipo !== "derivado") throw new Error("debería ser derivable");

    const p = 120 / 12_000_000;
    const media = 60 / p;
    const desviacion = Math.sqrt((60 * (1 - p)) / (p * p));
    expect(intervalo.desde).toBeCloseTo(
      1 / (media + 1.959963984540054 * desviacion),
      15,
    );
    expect(intervalo.hasta).toBeCloseTo(
      1 / (media - 1.959963984540054 * desviacion),
      15,
    );
  });

  it("con clase chica Y cola larguísima NO dibuja banda, y dice por qué", () => {
    // Ni enumerable ni acampanada. Aquí la respuesta honesta es que no hay intervalo: cualquiera
    // que Velo pintara sería más preciso que el conocimiento que lo sostiene.
    const e = riesgoIndividualEstimado(conTamanos([3, 4], 7_000_000));
    if (!e.ok) throw new Error(e.explicacion);
    expect(e.maximo.intervalo.tipo).toBe("no-derivable");
    if (e.maximo.intervalo.tipo !== "no-derivable") return;
    expect(e.maximo.intervalo.porque).toMatch(/cola/);
    // Pero la CIFRA sí existe: no tener banda no es no tener estimación.
    expect(e.maximo.valor).toBeGreaterThan(0);
  });
});

// ── Zayatz: contra los valores publicados ─────────────────────────────────────────────────────

describe("únicos poblacionales (Zayatz 1991, §III)", () => {
  // Los números del ejemplo trabajado del informe: población #9, 56.372 registros, muestra 9.383.
  const N = 56372;
  const n = 9383;

  it("reproduce los 20 valores de la Tabla 4 del informe", () => {
    // Tabla 4 · Prob(1_s | C_p) para C = 1..20 con N = 56.372 y n = 9.383. Transcritos del PDF
    // original (CENSUS/SRD/RR-91/08), que los publica con tres decimales.
    const TABLA_4 = [
      0.167, 0.278, 0.347, 0.386, 0.402, 0.402, 0.391, 0.372, 0.349, 0.323,
      0.296, 0.269, 0.243, 0.218, 0.195, 0.173, 0.153, 0.135, 0.119, 0.104,
    ];
    // La tolerancia es una unidad del último decimal IMPRESO, y no menos, porque el redondeo de la
    // tabla no es autoconsistente: C = 1 publica 0,167 para 0,16645 (redondea hacia arriba) y
    // C = 12 publica 0,269 para 0,26960 (hacia abajo). Son tablas calculadas a mano en 1991.
    // Coincidir con las 20 dentro de 0,001 es la afirmación más fuerte que la fuente permite.
    const calculadas = probabilidadDeUnicoEnMuestra(20, N, n);
    TABLA_4.forEach((publicada, i) => {
      expect(
        Math.abs(calculadas[i + 1] - publicada),
        `C=${i + 1}: calculado ${calculadas[i + 1]}, publicado ${publicada}`,
      ).toBeLessThanOrEqual(0.001);
    });
  });

  it("coincide con los binomiales exactos de la definición", () => {
    // Con N y n pequeños se puede calcular C(C,1)·C(N−C,n−1)/C(N,n) tal cual y comparar.
    const calculadas = probabilidadDeUnicoEnMuestra(8, 40, 12);
    for (let C = 1; C <= 8; C++) {
      expect(calculadas[C], `C=${C}`).toBeCloseTo(
        probUnicoPorBinomiales(C, 40, 12),
        14,
      );
    }
  });

  it("Prob(1_s | 1_p) es exactamente la fracción de muestreo", () => {
    // C(N−1,n−1)/C(N,n) = n/N. Sale de la fórmula, no se programa aparte.
    expect(probabilidadDeUnicoEnMuestra(1, N, n)[1]).toBeCloseTo(n / N, 15);
    expect(probabilidadDeUnicoEnMuestra(1, 1000, 250)[1]).toBe(0.25);
  });

  it("una clase que no cabe fuera de la muestra tiene probabilidad CERO, no una cifra residual", () => {
    // Población 20, muestra 18: solo quedan 2 personas fuera. Una clase poblacional de 5 no puede
    // asomar como única en la muestra, porque haría falta dejar 4 fuera y no hay sitio. La fórmula
    // lo dice sola —el factor (N−n−j+1) se hace cero— y aquí se fija para que nadie lo «arregle».
    const probabilidades = probabilidadDeUnicoEnMuestra(6, 20, 18);
    expect(probabilidades[1]).toBeCloseTo(0.9, 15);
    expect(probabilidades[3]).toBeGreaterThan(0);
    expect(probabilidades[4]).toBe(0);
    expect(probabilidades[5]).toBe(0);
    expect(probabilidades[6]).toBe(0);
    // Y coincide con los binomiales exactos, que son cero por la misma razón.
    expect(probUnicoPorBinomiales(5, 20, 18)).toBe(0);
  });

  it("reproduce el numerador de Bayes del ejemplo publicado", () => {
    // El informe: Prob(1_p) · Prob(1_s|1_p) = 0,838 · 0,167 = 0,140. Multiplica sus PROPIOS valores
    // ya redondeados; usando el exacto (0,16645) sale 0,13948. Misma tolerancia y misma razón.
    const probDeClaseUnitaria = 0.838;
    expect(
      Math.abs(
        probDeClaseUnitaria * probabilidadDeUnicoEnMuestra(1, N, n)[1] - 0.14,
      ),
    ).toBeLessThanOrEqual(0.001);
  });

  it("la fracción de únicos que sobrevive nunca pasa de 1", () => {
    // Invariante estructural: el término C = 1 del denominador ES el numerador, así que el
    // cociente está acotado por construcción. Si alguna vez pasara de 1, la fórmula estaría mal
    // transcrita y el producto estaría diciendo que hay más únicos poblacionales que muestrales.
    for (const poblacion of [100, 250, 1000, 5000]) {
      for (const tamanos of [
        [1, 1, 1, 2, 5],
        [1, 2, 2, 3],
        [1, 1, 1, 1, 1],
        [2, 3, 4],
      ]) {
        const e = unicosPoblacionalesEstimados(conTamanos(tamanos, poblacion));
        if (!e.ok) continue;
        expect(e.proporcionDeLosUnicosQueSobrevive).toBeGreaterThanOrEqual(0);
        expect(e.proporcionDeLosUnicosQueSobrevive).toBeLessThanOrEqual(1);
      }
    }
  });

  it("en censo todos los únicos del archivo son únicos de la población", () => {
    const tamanos = [1, 1, 1, 2, 3, 5];
    const filas = 13;
    const e = unicosPoblacionalesEstimados(conTamanos(tamanos, filas));
    if (!e.ok) throw new Error(e.explicacion);

    const exacto = riesgoProsecutor(
      { ids: new Uint32Array(filas), tamanos: Uint32Array.from(tamanos) },
      ["cualquiera"],
      filas,
    );
    expect(e.proporcionDeLosUnicosQueSobrevive).toBeCloseTo(1, 15);
    expect(e.proporcion.valor).toBeCloseTo(exacto.proporcionUnicos, 15);
    // Y sin incertidumbre que declarar: el intervalo es un punto.
    const intervalo = e.proporcion.intervalo;
    if (intervalo.tipo !== "derivado") throw new Error("debería ser derivable");
    expect(intervalo.desde).toBeCloseTo(intervalo.hasta, 15);
  });

  it("cuanto mayor es la fracción de muestreo, más únicos sobreviven", () => {
    const tamanos = [1, 1, 1, 1, 2, 2, 3, 5, 8];
    const filas = tamanos.reduce((a, b) => a + b, 0);
    let anterior = 0;
    for (const poblacion of [
      filas * 10,
      filas * 5,
      filas * 3,
      filas * 2,
      filas,
    ]) {
      const e = unicosPoblacionalesEstimados(conTamanos(tamanos, poblacion));
      if (!e.ok) continue;
      expect(e.proporcionDeLosUnicosQueSobrevive).toBeGreaterThan(anterior);
      anterior = e.proporcionDeLosUnicosQueSobrevive;
    }
    expect(anterior).toBeCloseTo(1, 12);
  });

  it("con únicos de sobra la banda es la de la binomial, y se estrecha al crecer el archivo", () => {
    // La aleatoriedad está en CUÁLES de los únicos del archivo lo son también en la población,
    // no en el parámetro: por eso la banda es la normal de una binomial de parámetro conocido y
    // no un Wilson, que sirve para el problema contrario.
    const muchosUnicos = [...Array(300).fill(1), ...Array(50).fill(2)];
    const e = unicosPoblacionalesEstimados(conTamanos(muchosUnicos, 800));
    if (!e.ok) throw new Error(e.explicacion);

    const intervalo = e.registros.intervalo;
    if (intervalo.tipo !== "derivado") throw new Error("debería ser derivable");
    const centro = e.unicosEnLaMuestra * e.proporcionDeLosUnicosQueSobrevive;
    const desviacion = Math.sqrt(
      e.unicosEnLaMuestra *
        e.proporcionDeLosUnicosQueSobrevive *
        (1 - e.proporcionDeLosUnicosQueSobrevive),
    );
    expect(intervalo.desde).toBeCloseTo(
      centro - 1.959963984540054 * desviacion,
      10,
    );
    expect(intervalo.hasta).toBeCloseTo(
      centro + 1.959963984540054 * desviacion,
      10,
    );
    expect(intervalo.cubre).toMatch(/SOBREESTIMA/);

    // Con pocos únicos no hay banda: la aproximación normal pide 10 de varianza y no llega.
    const pocos = unicosPoblacionalesEstimados(conTamanos([1, 1, 2, 6], 20));
    if (!pocos.ok) throw new Error(pocos.explicacion);
    expect(pocos.registros.intervalo.tipo).toBe("no-derivable");
  });

  it("un archivo sin únicos devuelve un cero EXACTO, no estimado", () => {
    const e = unicosPoblacionalesEstimados(conTamanos([2, 3, 5], 20));
    if (!e.ok) throw new Error(e.explicacion);
    expect(e.unicosEnLaMuestra).toBe(0);
    expect(e.proporcion.valor).toBe(0);
    expect(e.proporcion.intervalo.tipo).toBe("no-derivable");
    if (e.proporcion.intervalo.tipo !== "no-derivable") return;
    expect(e.proporcion.intervalo.porque).toMatch(/exacto, no estimado/);
  });
});

// ── Lo que el módulo se niega a hacer ─────────────────────────────────────────────────────────

describe("cuándo Velo NO da la cifra", () => {
  it("sin población declarada no estima, y explica que el exacto no depende de eso", () => {
    const { individual, poblacional } = estimarRiesgo(
      conTamanos([1, 1, 3], null),
    );
    for (const e of [individual, poblacional]) {
      expect(e.ok).toBe(false);
      if (e.ok) return;
      expect(e.motivo).toBe("sin-poblacion-declarada");
      expect(e.explicacion).toMatch(/el riesgo exacto no depende de este dato/);
    }
  });

  it("con una muestra demasiado pequeña, Zayatz se rechaza CITANDO su evaluación", () => {
    // La frontera no es un número a ojo: la Tabla 8 del informe, con fracción 1/100, llega a errar
    // por un factor de 10. Devolver ese número con una nota al pie sería devolver un número débil.
    const tamanos = [1, 1, 1, 2, 3];
    const filas = tamanos.reduce((a, b) => a + b, 0);
    const poblacion = Math.ceil(filas / (FRACCION_MINIMA_ZAYATZ / 2));

    const zayatz = unicosPoblacionalesEstimados(conTamanos(tamanos, poblacion));
    expect(zayatz.ok).toBe(false);
    if (zayatz.ok) return;
    expect(zayatz.motivo).toBe("muestra-demasiado-pequena");
    expect(zayatz.explicacion).toMatch(/Zayatz \(1991\)/);

    // Y Benedetti–Franconi SÍ contesta ahí: los dos modelos tienen dominios de validez distintos,
    // y esa asimetría es información, no un fallo que haya que uniformar.
    expect(riesgoIndividualEstimado(conTamanos(tamanos, poblacion)).ok).toBe(
      true,
    );
  });

  it("una población menor que el archivo se rechaza como lo que es: un error de captura", () => {
    const { individual, poblacional } = estimarRiesgo(conTamanos([1, 2, 3], 3));
    for (const e of [individual, poblacional]) {
      expect(e.ok).toBe(false);
      if (e.ok) return;
      expect(e.motivo).toBe("poblacion-menor-que-el-archivo");
    }
  });

  it("un archivo vacío no estima nada", () => {
    const vacio: EntradasDeEstimacion = {
      clases: { ids: new Uint32Array(0), tamanos: new Uint32Array(0) },
      filas: 0,
      poblacion: 1000,
    };
    expect(estimarRiesgo(vacio).individual.ok).toBe(false);
    expect(estimarRiesgo(vacio).poblacional.ok).toBe(false);
  });
});

// ── Honestidad medida ─────────────────────────────────────────────────────────────────────────

describe("el estimado no se compone con el exacto", () => {
  it("sumar una cifra estimada a una exacta no compila", () => {
    const estimacion = riesgoIndividualEstimado(conTamanos([1, 2, 3], 60));
    if (!estimacion.ok) throw new Error(estimacion.explicacion);
    const exacto = riesgoProsecutor(clasesDeEquivalencia([], 6), [], 6);

    // La regla vive en el TIPO, no en la revisión de código: `maximo` no es un `number`, es una
    // cifra con su intervalo, así que la suma es un error de compilación. Es el mismo instrumento
    // que la Fase 0 usó para el contrato del worker — una regla que un test puede ver.
    // @ts-expect-error el estimado jamás se suma al exacto
    const prohibido = exacto.riesgoPromedio + estimacion.maximo;
    expect(prohibido).toBeDefined();

    // Y la marca de naturaleza está en los dos lados, para que la pantalla no tenga que adivinar.
    expect(exacto.naturaleza).toBe("exacto");
    expect(estimacion.naturaleza).toBe("estimado");
  });

  it("toda estimación viaja con modelo, supuesto y fuente", () => {
    const { individual, poblacional } = estimarRiesgo(
      conTamanos([1, 1, 2, 6], 100),
    );
    for (const e of [individual, poblacional]) {
      if (!e.ok) throw new Error(e.explicacion);
      expect(e.modelo.length).toBeGreaterThan(20);
      expect(e.supuesto.length).toBeGreaterThan(40);
      // La fuente citada en el código, como los validadores del S1 citan a la DIAN.
      expect(e.fuente).toMatch(/199[18]/);
    }
  });

  it("prohibido prometer lo que Velo no puede cumplir", () => {
    const texto = serializarCanonico(
      estimarRiesgo(conTamanos([1, 1, 2, 6], 100)),
    );
    for (const prohibida of [
      /anonimato garantizado/i,
      /100\s*%\s*seguro/i,
      /imposible de reidentificar/i,
      /garantiza/i,
    ]) {
      expect(texto).not.toMatch(prohibida);
    }
  });

  it("dos corridas dan el mismo resultado, byte a byte", () => {
    const entradas = conTamanos([1, 1, 1, 2, 2, 3, 7, 11], 400);
    expect(serializarCanonico(estimarRiesgo(entradas))).toBe(
      serializarCanonico(estimarRiesgo(entradas)),
    );
  });
});
