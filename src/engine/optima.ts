// La generalización ÓPTIMA (S7) — OLA sobre las jerarquías de cada campo.
//
// El Emam, Dankar, Issa, Jonker, Amyot, Cogo, Corriveau, Walker, Chowdhury, Vaillancourt, Roffey y
// Bottomley, *A Globally Optimal k-Anonymity Method for the De-Identification of Health Data*, JAMIA
// 16(5), 2009. https://pmc.ncbi.nlm.nih.gov/articles/PMC2744718
//
// Mondrian (`mondrian.ts`) corta el espacio por la mediana, con cortes distintos en cada región: es
// rápido y local. Lo de aquí es lo contrario y lo complementa: cada campo sube por SU jerarquía hasta
// un nivel, el MISMO en todo el archivo (`edad` en quinquenios, `municipio` en departamentos), y de
// todas las combinaciones de niveles —la retícula— se elige la que cumple k (y la ℓ distinta, si la
// política la pide) perdiendo MENOS información. La pantalla enseña las dos y el usuario elige.
//
// Cómo se encuentra el óptimo sin revisar la retícula entera, y por qué no se pierde nada (ADR-013):
//
//   1. **Monotonía de la privacidad.** Las jerarquías son anidadas (`jerarquias/index.ts`): subir un
//      campo de nivel solo JUNTA clases. Si un nodo cumple k, todo nodo por encima cumple; si no
//      cumple, ninguno por debajo. Lo mismo vale para la ℓ distinta (la unión de dos clases tiene al
//      menos tantos valores sensibles distintos como cada una).
//   2. **Monotonía de la pérdida.** La pérdida es la «non-uniform entropy» del paper medida en bits por
//      campo: Σ (H(campo) − H(campo generalizado)). Generalizar es aplicar una función, y la entropía
//      de una función de X nunca supera la de X: la pérdida solo crece al subir. Es la misma entropía
//      que `utilidad.ts` ya reporta, así que la cifra que se minimiza es la que el usuario ve.
//   3. **OLA** recorre la retícula por sub-retículas con búsqueda binaria en la altura media y
//      etiquetado predictivo (1) y recoge los nodos k-MÍNIMOS. Por (2), el de menor pérdida entre
//      ellos es el de menor pérdida entre TODOS los que cumplen. Un test lo compara con la fuerza
//      bruta en tablas pequeñas.
//
// Determinismo (regla dura 3): los nodos de una altura se recorren en orden lexicográfico del vector
// de niveles (en el orden de las columnas de la tabla), y el empate se decide fijo: menor pérdida →
// menor suma de niveles → vector lexicográficamente menor.
//
// ⚠️ **Lo que este módulo promete y lo que NO.** Cumple k sobre las columnas del reparto, igual que
// Mondrian (el balance vuelve a medir con todos los cuasi-identificadores). Sin tope de supresión NO
// borra ninguna fila: Velo no borra registros de nadie por su cuenta; si ningún nodo cumple, se
// aplica el de arriba (todo `*`) y se dice.
//
// **El tope de supresión (S11)** lo pide el USUARIO en la política (`supresionMaxima`, % de filas),
// como lo admite OLA. Un nodo cumple si las filas de sus clases que no llegan al k (o a la ℓ) caben
// en el tope; esas filas salen del archivo de SALIDA, nunca del original, y el certificado dice
// cuántas y de qué tamaño de clase eran. La monotonía (1) sigue en pie: subir un nivel solo junta
// clases, así que las filas que fallan solo pueden bajar. La (2) NO: una fila borrada cuenta como
// pérdida TOTAL (−log₂ P(valor) en cada campo, lo que costaría llevarla a `*`), y subir puede salvar
// filas y bajar la pérdida. Por eso, con tope, el mínimo no se toma solo entre los nodos k-mínimos:
// se recorren los que cumplen en orden de su pérdida SIN supresión —un piso de la pérdida real— y
// se para cuando el piso ya pasa al mejor visto. Un test lo compara con la fuerza bruta.

import {
  quitarFilas,
  reconstruirColumna,
  type ColumnaColumnar,
  type TablaColumnar,
} from "./columnar";
import {
  nivelesDe,
  nombresDeNiveles,
  pasosDe,
  type Jerarquia,
} from "./jerarquias";
import {
  jerarquiaDe,
  type GeneralizacionOptima,
  type JerarquiaDeLaPolitica,
} from "./politica";
import { clasesDeEquivalencia } from "./riesgo";

/**
 * Tope de la retícula (producto de niveles). Medido en el ADR-013: por encima, la búsqueda deja de
 * caber en el presupuesto de la pantalla, y se dice en vez de colgar el worker.
 */
export const TOPE_DE_NODOS = 20_000;

export interface DiversidadPedida {
  readonly l: number;
  readonly columnas: readonly string[];
}

/**
 * Las columnas sobre las que SÍ se exige la ℓ: las que la política pide, que existen, no son del
 * reparto y no se suprimen. Una columna que la política suprime no viaja en el archivo: exigir su
 * diversidad no protege nada y, sin ella en la tabla, dejaba la ℓ imposible y subía todo a `*`
 * (M2 de la auditoría del S7). Se dice (`descartadas`) en vez de callarlo.
 *
 * La transformación y la comparación llaman a ESTA función: eran dos resoluciones distintas.
 */
export function resolverDiversidad(
  diversidad: DiversidadPedida | null,
  reparto: readonly string[],
  existentes: ReadonlySet<string>,
  suprimidas: ReadonlySet<string>,
): {
  readonly columnas: readonly string[];
  readonly descartadas: readonly string[];
} {
  const delReparto = new Set(reparto);
  const columnas: string[] = [];
  const descartadas: string[] = [];
  for (const nombre of diversidad?.columnas ?? []) {
    if (delReparto.has(nombre) || columnas.includes(nombre)) continue;
    if (descartadas.includes(nombre)) continue;
    if (suprimidas.has(nombre)) descartadas.push(nombre);
    else if (existentes.has(nombre)) columnas.push(nombre);
  }
  return { columnas, descartadas };
}

export type MotivoDeLaOptima =
  "sin-dimensiones" | "excede-tope" | "no-alcanzable";

/**
 * El tope de supresión tal como se aplicó (S11): conteos, nunca valores. `aplicada: false` cuando la
 * política lo pide y el archivo no lo admite (JSON: cada fila es un registro de una estructura que
 * Velo reescribe en su lugar, y quitarlo no es quitar una fila).
 */
export interface SupresionAplicada {
  /** El tope que pidió la política, en % de las filas. */
  readonly porcentaje: number;
  /** El tope en filas: ⌊filas × porcentaje / 100⌋. */
  readonly tope: number;
  /** Las filas que salieron del archivo de salida. */
  readonly filas: number;
  /** De qué tamaño de clase eran (en el nodo elegido), de menor a mayor. */
  readonly porTamano: readonly {
    readonly tamano: number;
    readonly filas: number;
  }[];
  readonly aplicada: boolean;
}

export interface ResultadoOptimo {
  /** La tabla de SALIDA: sin las filas que el tope de supresión quitó. */
  readonly tabla: TablaColumnar;
  /**
   * La misma tabla con TODAS las filas, en el orden del archivo: el alto volumen lee sus columnas por
   * posición absoluta. Sin supresión es `tabla`.
   */
  readonly alineada: TablaColumnar;
  /** 1 = la fila sale; null si no sale ninguna. */
  readonly fuera: Uint8Array | null;
  /** null si la política no pidió tope. */
  readonly supresion: SupresionAplicada | null;
  readonly kObjetivo: number;
  /** La ℓ que se exigió: null si no se pidió, o si no quedó ninguna columna sobre la que exigirla. */
  readonly lObjetivo: number | null;
  /** Las columnas sobre las que se exigió la ℓ (`resolverDiversidad`). */
  readonly columnasSensibles: readonly string[];
  /** Las que la política pedía y suprime: la ℓ no se exige sobre ellas, y se dice. */
  readonly lDescartadas: readonly string[];
  /** k REAL de las columnas del reparto en la tabla de salida. */
  readonly kAlcanzado: number;
  /** ℓ distinta REAL (la peor de las columnas sensibles pedidas), o null si no se pidió. */
  readonly lAlcanzado: number | null;
  readonly alcanzado: boolean;
  readonly motivo: MotivoDeLaOptima | null;
  /** Las columnas del reparto, en el orden de la tabla. */
  readonly dimensiones: readonly string[];
  /** El nodo elegido: el nivel de cada dimensión (0 = sin generalizar). */
  readonly niveles: readonly number[];
  /** El nivel más alto de cada dimensión (el de `*`). */
  readonly alturas: readonly number[];
  /** Bits de las dimensiones antes y después: lo que se minimizó. */
  readonly bitsAntes: number;
  readonly bitsDespues: number;
  readonly nodosRevisados: number;
  readonly nodosEnLaReticula: number;
}

/**
 * La generalización óptima tal como se aplicó (S7): lo que cruza a la página para el certificado.
 * Nombres de columna, escaleras, claves de nivel y cifras; ningún valor.
 */
export interface GeneralizacionAplicada {
  readonly kObjetivo: number;
  /** k REAL sobre las columnas del reparto. */
  readonly kAlcanzado: number;
  readonly lObjetivo: number | null;
  readonly lAlcanzado: number | null;
  /** Las columnas sensibles sobre las que se exigió la ℓ (vacía si no se pidió). */
  readonly columnasSensibles: readonly string[];
  /** Las que la política suprime: la ℓ no se exigió sobre ellas. */
  readonly lDescartadas: readonly string[];
  readonly columnas: readonly {
    readonly nombre: string;
    readonly jerarquia: JerarquiaDeLaPolitica;
    /** La clave del nivel elegido (`quinquenio`, `departamento`, `rango-10`, `suprimido`…). */
    readonly nivel: string;
  }[];
  readonly nodosRevisados: number;
  readonly nodosEnLaReticula: number;
  /** S11: solo si la política pidió tope de supresión (así el certificado de siempre no cambia). */
  readonly supresion?: SupresionAplicada;
}

/** Una dimensión, ya proyectada por niveles sobre su diccionario. */
interface Dimension {
  readonly columna: ColumnaColumnar;
  readonly niveles: readonly ((valor: string) => string)[];
  /** `mapa[j][codigoBase]` = código del valor en el nivel j. */
  readonly mapa: readonly Uint32Array[];
  /** Valores distintos en cada nivel (para la clave compuesta). */
  readonly cardinalidad: readonly number[];
  /** Entropía de la columna en cada nivel, en bits. */
  readonly bits: readonly number[];
  /**
   * `informacion[j][codigo]` = −log₂ P(valor del nivel j), sobre el archivo entero. La pérdida de una
   * fila en el nivel j es informacion[0] − informacion[j]; la de una fila borrada, informacion[0].
   */
  readonly informacion: readonly Float64Array[];
}

function proyectarDimension(
  columna: ColumnaColumnar,
  jerarquia: Jerarquia,
  filas: number,
): Dimension {
  const niveles = nivelesDe(jerarquia);
  const pasos = pasosDe(jerarquia);
  const frecuencia = new Float64Array(columna.valores.length);
  for (let f = 0; f < filas; f++) frecuencia[columna.codigos[f]]++;

  const mapa: Uint32Array[] = [];
  const cardinalidad: number[] = [];
  const bits: number[] = [];
  const informacion: Float64Array[] = [];
  // Cada nivel sale del anterior, como en `nivelesDe`: el paso se aplica una vez por ETIQUETA
  // distinta del nivel de abajo, no una vez por valor del diccionario.
  let etiquetas: readonly string[] = columna.valores;
  let deEtiqueta: Uint32Array = Uint32Array.from(columna.valores, (_, c) => c);
  for (let j = 0; j < niveles.length; j++) {
    const subidas = j === 0 ? etiquetas : etiquetas.map(pasos[j - 1]);
    const indice = new Map<string, number>();
    const deSubida = new Uint32Array(subidas.length);
    for (let e = 0; e < subidas.length; e++) {
      let codigo = indice.get(subidas[e]);
      if (codigo === undefined) {
        codigo = indice.size;
        indice.set(subidas[e], codigo);
      }
      deSubida[e] = codigo;
    }
    const codigos = new Uint32Array(columna.valores.length);
    for (let c = 0; c < codigos.length; c++)
      codigos[c] = deSubida[deEtiqueta[c]];
    etiquetas = [...indice.keys()];
    deEtiqueta = codigos;
    const cuenta = new Float64Array(indice.size);
    for (let c = 0; c < codigos.length; c++)
      cuenta[codigos[c]] += frecuencia[c];
    let h = 0;
    const info = new Float64Array(indice.size);
    for (let c = 0; c < cuenta.length; c++) {
      const n = cuenta[c];
      if (n === 0 || filas === 0) continue;
      const p = n / filas;
      h -= p * Math.log2(p);
      info[c] = -Math.log2(p);
    }
    mapa.push(codigos);
    cardinalidad.push(indice.size);
    bits.push(h);
    informacion.push(info);
  }
  return { columna, niveles, mapa, cardinalidad, bits, informacion };
}

/** Lo que se mide de un nodo: el k y la ℓ distinta (la peor de las columnas sensibles). */
interface Medida {
  readonly k: number;
  readonly l: number | null;
  /** S11: filas en clases que no llegan al k objetivo (o a la ℓ objetivo). */
  readonly fuera: number;
  /** El k y la ℓ de las clases que SÍ llegan: lo que queda si se quitan las otras. */
  readonly kQueda: number;
  readonly lQueda: number | null;
}

/** Las clases de un nodo: la de cada clase base, su tamaño y su peor ℓ. */
interface ClasesDelNodo {
  readonly de: Uint32Array;
  readonly tamano: Float64Array;
  readonly peorL: Float64Array | null;
}

/**
 * El evaluador de nodos. Las filas se agrupan UNA vez por su combinación de valores base (las clases
 * de equivalencia del nodo 0); cada nodo se mide agrupando esas clases —no las filas— por sus
 * códigos generalizados. Con 500.000 filas y 40.000 combinaciones, eso es 12 veces menos trabajo por
 * nodo, y el resultado es el mismo porque las jerarquías son funciones del valor.
 */
class Evaluador {
  private readonly clases: number;
  private readonly tamanos: Uint32Array;
  /** La clase base de cada fila. */
  private readonly ids: Uint32Array;
  /** `base[i][clase]` = código base de la dimensión i en esa clase. */
  private readonly base: Uint32Array[];
  /** Por columna sensible: los pares (clase base, código sensible) distintos. */
  private readonly pares: {
    clase: Uint32Array;
    valor: Uint32Array;
    cardinalidad: number;
  }[];

  constructor(
    private readonly dimensiones: readonly Dimension[],
    sensibles: readonly ColumnaColumnar[],
    private readonly filas: number,
    private readonly kObjetivo: number,
    private readonly lObjetivo: number | null,
  ) {
    const { ids, tamanos } = clasesDeEquivalencia(
      dimensiones.map((d) => d.columna),
      filas,
    );
    this.clases = tamanos.length;
    this.tamanos = tamanos;
    this.ids = ids;
    this.base = dimensiones.map(() => new Uint32Array(this.clases));
    const visto = new Uint8Array(this.clases);
    for (let f = 0; f < filas; f++) {
      const c = ids[f];
      if (visto[c]) continue;
      visto[c] = 1;
      dimensiones.forEach((d, i) => (this.base[i][c] = d.columna.codigos[f]));
    }
    this.pares = sensibles.map((s) => {
      const cardinalidad = s.valores.length;
      const vistos = new Set<number>();
      const clase: number[] = [];
      const valor: number[] = [];
      for (let f = 0; f < filas; f++) {
        const clave = ids[f] * cardinalidad + s.codigos[f];
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        clase.push(ids[f]);
        valor.push(s.codigos[f]);
      }
      return {
        clase: Uint32Array.from(clase),
        valor: Uint32Array.from(valor),
        cardinalidad,
      };
    });
  }

  /** La clase del nodo de cada clase base, y cuántas hay. */
  private agrupar(nodo: readonly number[]): {
    de: Uint32Array;
    cuantas: number;
  } {
    let de = new Uint32Array(this.clases);
    let cuantas = this.clases > 0 ? 1 : 0;
    this.dimensiones.forEach((d, i) => {
      const mapa = d.mapa[nodo[i]];
      const card = d.cardinalidad[nodo[i]];
      const base = this.base[i];
      const indice = new Map<number, number>();
      const siguiente = new Uint32Array(this.clases);
      for (let c = 0; c < this.clases; c++) {
        const clave = de[c] * card + mapa[base[c]];
        let id = indice.get(clave);
        if (id === undefined) {
          id = indice.size;
          indice.set(clave, id);
        }
        siguiente[c] = id;
      }
      de = siguiente;
      cuantas = indice.size;
    });
    return { de, cuantas };
  }

  private clasesDe(nodo: readonly number[]): ClasesDelNodo {
    const { de, cuantas } = this.agrupar(nodo);
    const tamano = new Float64Array(cuantas);
    for (let c = 0; c < this.clases; c++) tamano[de[c]] += this.tamanos[c];
    let peorL: Float64Array | null = null;
    for (const p of this.pares) {
      const distintos = new Uint32Array(cuantas);
      const vistos = new Set<number>();
      for (let i = 0; i < p.clase.length; i++) {
        const clave = de[p.clase[i]] * p.cardinalidad + p.valor[i];
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        distintos[de[p.clase[i]]]++;
      }
      if (peorL === null) peorL = Float64Array.from(distintos);
      else
        for (let c = 0; c < cuantas; c++)
          if (distintos[c] < peorL[c]) peorL[c] = distintos[c];
    }
    return { de, tamano, peorL };
  }

  /** ¿La clase `c` del nodo se queda corta del k o de la ℓ objetivo? */
  private falla(clases: ClasesDelNodo, c: number): boolean {
    return (
      clases.tamano[c] < this.kObjetivo ||
      (this.lObjetivo !== null &&
        clases.peorL !== null &&
        clases.peorL[c] < this.lObjetivo)
    );
  }

  medir(nodo: readonly number[]): Medida {
    if (this.clases === 0)
      return {
        k: 0,
        l: this.pares.length > 0 ? 0 : null,
        fuera: 0,
        kQueda: 0,
        lQueda: this.pares.length > 0 ? 0 : null,
      };
    const clases = this.clasesDe(nodo);
    const { tamano, peorL } = clases;
    let k = Number.POSITIVE_INFINITY;
    for (const t of tamano) if (t < k) k = t;
    let l: number | null = null;
    if (peorL !== null) {
      l = Number.POSITIVE_INFINITY;
      for (const n of peorL) if (n < l) l = n;
    }
    let fuera = 0;
    let kQueda = Number.POSITIVE_INFINITY;
    let lQueda = Number.POSITIVE_INFINITY;
    for (let c = 0; c < tamano.length; c++) {
      if (this.falla(clases, c)) fuera += tamano[c];
      else {
        if (tamano[c] < kQueda) kQueda = tamano[c];
        if (peorL !== null && peorL[c] < lQueda) lQueda = peorL[c];
      }
    }
    const nada = kQueda === Number.POSITIVE_INFINITY;
    return {
      k,
      l,
      fuera,
      kQueda: nada ? 0 : kQueda,
      lQueda: peorL === null ? null : nada ? 0 : lQueda,
    };
  }

  /**
   * S11: la pérdida del nodo, en bits por fila sumados por campo, con las filas que fallan BORRADAS:
   * una fila que queda pierde −log₂ P(x | g(x)) = info(x) − info(g(x)) en cada campo; una borrada
   * pierde info(x) entero. Sin filas borradas es H(X) − H(g(X)), la pérdida de siempre.
   */
  perdidaConSupresion(nodo: readonly number[]): number {
    if (this.clases === 0 || this.filas === 0) return 0;
    const clases = this.clasesDe(nodo);
    const fallaDe = new Uint8Array(clases.tamano.length);
    for (let c = 0; c < fallaDe.length; c++)
      fallaDe[c] = this.falla(clases, c) ? 1 : 0;
    let total = 0;
    for (let c = 0; c < this.clases; c++) {
      const borrada = fallaDe[clases.de[c]] === 1;
      let s = 0;
      this.dimensiones.forEach((d, i) => {
        const b = this.base[i][c];
        const base = d.informacion[0][d.mapa[0][b]];
        s += borrada ? base : base - d.informacion[nodo[i]][d.mapa[nodo[i]][b]];
      });
      total += this.tamanos[c] * s;
    }
    return total / this.filas;
  }

  /** S11: qué filas salen en el nodo, y de qué tamaño de clase eran. */
  filasFuera(nodo: readonly number[]): {
    fuera: Uint8Array;
    porTamano: { tamano: number; filas: number }[];
  } {
    const clases = this.clasesDe(nodo);
    const fallaDe = new Uint8Array(clases.tamano.length);
    const porTamano = new Map<number, number>();
    for (let c = 0; c < fallaDe.length; c++) {
      if (!this.falla(clases, c)) continue;
      fallaDe[c] = 1;
      const t = clases.tamano[c];
      porTamano.set(t, (porTamano.get(t) ?? 0) + t);
    }
    const fuera = new Uint8Array(this.filas);
    for (let f = 0; f < this.filas; f++)
      fuera[f] = fallaDe[clases.de[this.ids[f]]];
    return {
      fuera,
      porTamano: [...porTamano]
        .sort((a, b) => a[0] - b[0])
        .map(([tamano, filas]) => ({ tamano, filas })),
    };
  }
}

// ── La retícula ─────────────────────────────────────────────────────────────────────────────────

const suma = (v: readonly number[]) => v.reduce((a, b) => a + b, 0);

/** ¿a ≤ b en todas las dimensiones? (a es generalización de nadie que b no lo sea.) */
function bajoDe(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] > b[i]) return false;
  return true;
}

/** Los nodos entre `b` y `t` cuya suma de niveles es `altura`, en orden lexicográfico. */
function nodosAAltura(
  b: readonly number[],
  t: readonly number[],
  altura: number,
): number[][] {
  const salida: number[][] = [];
  const actual = [...b];
  const d = b.length;
  // Cota de lo que las dimensiones de la i en adelante pueden sumar todavía.
  const minimoDesde = new Array<number>(d + 1).fill(0);
  const maximoDesde = new Array<number>(d + 1).fill(0);
  for (let i = d - 1; i >= 0; i--) {
    minimoDesde[i] = minimoDesde[i + 1] + b[i];
    maximoDesde[i] = maximoDesde[i + 1] + t[i];
  }
  const recorrer = (i: number, resta: number) => {
    if (i === d) {
      if (resta === 0) salida.push([...actual]);
      return;
    }
    for (let v = b[i]; v <= t[i]; v++) {
      const queda = resta - v;
      if (queda < minimoDesde[i + 1] || queda > maximoDesde[i + 1]) continue;
      actual[i] = v;
      recorrer(i + 1, queda);
    }
  };
  recorrer(0, altura);
  return salida;
}

/**
 * Dos pérdidas a menos de esto son la MISMA: la pérdida es una suma de flotantes, y dos nodos con la
 * misma pérdida exacta pueden diferir en el último bit según el orden de la suma. Sin la tolerancia,
 * ese ruido de redondeo decidiría el empate en vez del desempate declarado.
 */
const EMPATE_EN_BITS = 1e-9;

/** Desempate fijo: menor pérdida → menor suma de niveles → vector lexicográficamente menor. */
export function compararNodos(
  a: { readonly perdida: number; readonly nodo: readonly number[] },
  b: { readonly perdida: number; readonly nodo: readonly number[] },
): number {
  if (Math.abs(a.perdida - b.perdida) > EMPATE_EN_BITS)
    return a.perdida < b.perdida ? -1 : 1;
  const sa = suma(a.nodo);
  const sb = suma(b.nodo);
  if (sa !== sb) return sa - sb;
  for (let i = 0; i < a.nodo.length; i++)
    if (a.nodo[i] !== b.nodo[i]) return a.nodo[i] - b.nodo[i];
  return 0;
}

interface Busqueda {
  readonly elegido: readonly number[];
  readonly medida: Medida;
  readonly nodosRevisados: number;
  /** S11: las filas que salen en el nodo elegido, o null si no sale ninguna. */
  readonly quitadas: {
    readonly fuera: Uint8Array;
    readonly porTamano: readonly { tamano: number; filas: number }[];
    readonly perdida: number;
  } | null;
}

/**
 * La búsqueda sobre la retícula, la parte cara de la óptima. Es una función pura de las columnas del
 * reparto, las sensibles, las escaleras, el k y la ℓ: la comparación y la transformación piden la
 * MISMA búsqueda con las mismas columnas (la transformación no toca las del reparto), así que la
 * segunda lee la respuesta de la primera en vez de recorrerla otra vez (S10). La llave es la
 * identidad de las columnas: si algo las cambió, no son las mismas y se busca de nuevo. Una
 * `WeakMap` no retiene la tabla cuando la sesión la suelta.
 */
const BUSQUEDAS = new WeakMap<
  object,
  { clave: string; columnas: readonly object[]; busqueda: Busqueda }[]
>();

/** Cuántas veces se recorrió la retícula de verdad (la prueba de que corre una sola vez). */
export const recorridos = { reticulas: 0 };

function buscarElNodo(
  dimensiones: readonly Dimension[],
  sensibles: readonly ColumnaColumnar[],
  filas: number,
  alturas: readonly number[],
  kObjetivo: number,
  lObjetivo: number | null,
  escaleras: string,
  tope: number,
): Busqueda {
  const columnas: readonly object[] = [
    ...dimensiones.map((d) => d.columna),
    ...sensibles,
  ];
  const clave = JSON.stringify([filas, kObjetivo, lObjetivo, escaleras, tope]);
  const guardadas = BUSQUEDAS.get(dimensiones[0].columna);
  const hallada = guardadas?.find(
    (g) =>
      g.clave === clave &&
      g.columnas.length === columnas.length &&
      g.columnas.every((c, i) => c === columnas[i]),
  );
  if (hallada) return hallada.busqueda;

  recorridos.reticulas++;
  const evaluador = new Evaluador(
    dimensiones,
    sensibles,
    filas,
    kObjetivo,
    lObjetivo,
  );
  const cache = new Map<string, Medida>();
  // Sin tope, la condición de siempre; con tope, que lo que falla quepa en él (con 0 es la misma).
  const cumple = (m: Medida) =>
    tope === 0
      ? m.k >= kObjetivo && (lObjetivo === null || (m.l ?? 0) >= lObjetivo)
      : m.fuera <= tope;
  const medir = (nodo: readonly number[]): Medida => {
    const clave = nodo.join(",");
    let m = cache.get(clave);
    if (m === undefined) {
      m = evaluador.medir(nodo);
      cache.set(clave, m);
    }
    return m;
  };

  // Etiquetado predictivo: lo que se revisó y su resultado alcanza para todo lo de arriba y de abajo.
  const cumplen: (readonly number[])[] = [];
  const noCumplen: (readonly number[])[] = [];
  const etiquetaDe = (n: readonly number[]): boolean | null => {
    if (cumplen.some((a) => bajoDe(a, n))) return true;
    if (noCumplen.some((x) => bajoDe(n, x))) return false;
    return null;
  };
  const revisar = (n: readonly number[]): boolean => {
    const ok = cumple(medir(n));
    (ok ? cumplen : noCumplen).push(n);
    return ok;
  };

  const minimos: (readonly number[])[] = [];
  const agregarMinimo = (n: readonly number[]) => {
    if (minimos.some((m) => bajoDe(m, n))) return;
    for (let i = minimos.length - 1; i >= 0; i--)
      if (bajoDe(n, minimos[i])) minimos.splice(i, 1);
    minimos.push(n);
  };

  // El paso recursivo de OLA (apéndice B del paper), con `t` siempre un nodo que cumple.
  const kMin = (b: readonly number[], t: readonly number[]): void => {
    const alto = suma(t) - suma(b);
    if (alto > 1) {
      const medio = suma(b) + Math.floor(alto / 2);
      for (const n of nodosAAltura(b, t, medio)) {
        const etiqueta = etiquetaDe(n);
        const ok = etiqueta ?? revisar(n);
        if (ok) kMin(b, n);
        else kMin(n, t);
      }
      return;
    }
    // Dos nodos, uno encima del otro. `b` nunca cumple aquí: es el fondo, que ya se revisó y no
    // cumplió, o un nodo de la altura media que no cumplió. Así que el mínimo de este tramo es `t`.
    agregarMinimo(t);
  };

  const perdida = (n: readonly number[]) =>
    dimensiones.reduce((s, d, i) => s + (d.bits[0] - d.bits[n[i]]), 0);

  /**
   * S11, con tope: el de menor pérdida REAL entre todos los que cumplen. La pérdida sin supresión
   * (`perdida`) es un piso de la real —una fila borrada pierde al menos lo que perdería quedándose—,
   * así que se recorren los nodos por ese piso y se para cuando pasa al mejor visto: lo que queda
   * por recorrer ya no puede ganar. Cumple todo nodo por encima de un mínimo (monotonía 1).
   */
  const elMejorConTope = (
    desde: readonly (readonly number[])[],
  ): readonly number[] => {
    const real = (nodo: readonly number[]) => {
      medir(nodo);
      return { nodo, perdida: evaluador.perdidaConSupresion(nodo) };
    };
    let mejor = desde.map(real).sort(compararNodos)[0];
    const candidatos: { nodo: readonly number[]; perdida: number }[] = [];
    for (let h = 0; h <= suma(alturas); h++)
      for (const nodo of nodosAAltura(abajo, arriba, h))
        candidatos.push({ nodo, perdida: perdida(nodo) });
    candidatos.sort(compararNodos);
    for (const c of candidatos) {
      if (c.perdida > mejor.perdida + EMPATE_EN_BITS) break;
      if (!desde.some((m) => bajoDe(m, c.nodo))) continue;
      const otro = real(c.nodo);
      if (compararNodos(otro, mejor) < 0) mejor = otro;
    }
    return mejor.nodo;
  };

  const abajo = alturas.map(() => 0);
  const arriba = [...alturas];
  let elegido: readonly number[];
  if (!revisar(arriba)) {
    // Ni todo en `*` cumple (menos filas que k, o una ℓ imposible): se aplica lo más que se puede.
    elegido = arriba;
  } else if (revisar(abajo)) {
    elegido = tope === 0 ? abajo : elMejorConTope([abajo]);
  } else {
    kMin(abajo, arriba);
    elegido =
      tope === 0
        ? minimos
            .map((nodo) => ({ nodo, perdida: perdida(nodo) }))
            .sort(compararNodos)[0].nodo
        : elMejorConTope(minimos);
  }

  const medida = medir(elegido);
  const quitadas =
    tope > 0 && cumple(medida) && medida.fuera > 0
      ? {
          ...evaluador.filasFuera(elegido),
          perdida: evaluador.perdidaConSupresion(elegido),
        }
      : null;
  const busqueda: Busqueda = {
    elegido,
    medida,
    nodosRevisados: cache.size,
    quitadas,
  };
  const lista = guardadas ?? [];
  lista.push({ clave, columnas, busqueda });
  BUSQUEDAS.set(dimensiones[0].columna, lista);
  return busqueda;
}

/**
 * Generaliza las `dimensiones` al nodo óptimo de su retícula: el que cumple `kObjetivo` (y la ℓ
 * pedida) perdiendo menos bits. Las columnas que no están en `jerarquias` suben por la jerarquía de
 * solo supresión (el valor o `*`): un reparto con una columna sin escalera sigue siendo un reparto.
 *
 * `supresion` (S11): el tope de la política, en % de filas, y si el archivo lo admite. Con él, las
 * filas de las clases que no llegan salen de `tabla` (no de `alineada`).
 */
export function generalizarOptimo(
  tabla: TablaColumnar,
  nombresDeDimension: readonly string[],
  jerarquias: Readonly<Record<string, Jerarquia>>,
  kObjetivo: number,
  diversidad: DiversidadPedida | null,
  suprimidas: ReadonlySet<string> = new Set(),
  supresion: {
    readonly porcentaje: number;
    readonly aplicada: boolean;
  } | null = null,
): ResultadoOptimo {
  const pedidas = new Set(nombresDeDimension);
  const columnas = tabla.columnas.filter((c) => pedidas.has(c.nombre));
  const dimensiones = columnas.map((c) =>
    proyectarDimension(c, jerarquiaDe(jerarquias, c.nombre), tabla.filas),
  );
  const alturas = dimensiones.map((d) => d.niveles.length - 1);
  const nodosEnLaReticula = alturas.reduce((p, h) => p * (h + 1), 1);
  const bitsAntes = dimensiones.reduce((s, d) => s + d.bits[0], 0);
  const resueltas = resolverDiversidad(
    diversidad,
    nombresDeDimension,
    new Set(tabla.columnas.map((c) => c.nombre)),
    suprimidas,
  );
  const sensibles = resueltas.columnas.map((n) =>
    tabla.columnas.find((c) => c.nombre === n)!,
  );
  // Sin ninguna columna sobre la que medirla, la ℓ no se exige: exigirla dejaba `cumple` en falso
  // para todo nodo y subía todo a `*`.
  const lObjetivo = sensibles.length > 0 ? (diversidad?.l ?? null) : null;

  // El tope en filas. Pedido y no admitido (JSON), es 0: no se quita nada, y se dice.
  const porcentaje = supresion?.porcentaje ?? 0;
  const tope =
    supresion?.aplicada === true
      ? Math.floor((tabla.filas * porcentaje) / 100)
      : 0;
  const supresionAplicada = (
    porTamano: readonly { tamano: number; filas: number }[],
  ): SupresionAplicada | null =>
    porcentaje > 0
      ? {
          porcentaje,
          tope,
          filas: porTamano.reduce((s, t) => s + t.filas, 0),
          porTamano,
          aplicada: supresion?.aplicada === true,
        }
      : null;

  const sinCambio = (motivo: MotivoDeLaOptima): ResultadoOptimo => ({
    tabla,
    alineada: tabla,
    fuera: null,
    supresion: supresionAplicada([]),
    kObjetivo,
    lObjetivo,
    columnasSensibles: resueltas.columnas,
    lDescartadas: resueltas.descartadas,
    kAlcanzado: 0,
    lAlcanzado: null,
    alcanzado: false,
    motivo,
    dimensiones: columnas.map((c) => c.nombre),
    niveles: alturas.map(() => 0),
    alturas,
    bitsAntes,
    bitsDespues: bitsAntes,
    nodosRevisados: 0,
    nodosEnLaReticula,
  });

  if (dimensiones.length === 0 || tabla.filas === 0)
    return sinCambio("sin-dimensiones");
  if (nodosEnLaReticula > TOPE_DE_NODOS) return sinCambio("excede-tope");

  const { elegido, medida, nodosRevisados, quitadas } = buscarElNodo(
    dimensiones,
    sensibles,
    tabla.filas,
    alturas,
    kObjetivo,
    lObjetivo,
    JSON.stringify(columnas.map((c) => jerarquiaDe(jerarquias, c.nombre))),
    tope,
  );
  const generalizadas = new Map(
    dimensiones.map((d, i) => [
      d.columna.nombre,
      reconstruirColumna(
        d.columna,
        d.columna.valores.map(d.niveles[elegido[i]]),
      ),
    ]),
  );
  const alineada: TablaColumnar = {
    columnas: tabla.columnas.map((c) => generalizadas.get(c.nombre) ?? c),
    filas: tabla.filas,
  };
  const alcanzado =
    tope === 0
      ? medida.k >= kObjetivo &&
        (lObjetivo === null || (medida.l ?? 0) >= lObjetivo)
      : medida.fuera <= tope;
  // Con filas quitadas, el k y la ℓ son los de lo que QUEDA, que es lo que lleva el archivo.
  const conQuitadas = quitadas !== null;
  return {
    tabla: conQuitadas ? quitarFilas(alineada, quitadas.fuera) : alineada,
    alineada,
    fuera: quitadas?.fuera ?? null,
    supresion: supresionAplicada(quitadas?.porTamano ?? []),
    kObjetivo,
    lObjetivo,
    columnasSensibles: resueltas.columnas,
    lDescartadas: resueltas.descartadas,
    kAlcanzado: conQuitadas ? medida.kQueda : medida.k,
    lAlcanzado: conQuitadas ? medida.lQueda : medida.l,
    alcanzado,
    motivo: alcanzado ? null : "no-alcanzable",
    dimensiones: columnas.map((c) => c.nombre),
    niveles: [...elegido],
    alturas,
    bitsAntes,
    bitsDespues: conQuitadas
      ? bitsAntes - quitadas.perdida
      : dimensiones.reduce((s, d, i) => s + d.bits[elegido[i]], 0),
    nodosRevisados,
    nodosEnLaReticula,
  };
}

/**
 * La óptima tal como se aplicó, para el certificado: cada columna con su escalera y el nivel
 * elegido. Las columnas sin escalera en la política subieron por la de solo supresión.
 */
export function generalizacionAplicada(
  optima: ResultadoOptimo,
  pedida: GeneralizacionOptima,
): GeneralizacionAplicada {
  return {
    kObjetivo: optima.kObjetivo,
    kAlcanzado: optima.kAlcanzado,
    lObjetivo: optima.lObjetivo,
    lAlcanzado: optima.lAlcanzado,
    columnasSensibles: optima.columnasSensibles,
    lDescartadas: optima.lDescartadas,
    columnas: optima.dimensiones.map((nombre, i) => {
      const jerarquia = jerarquiaDe(pedida.jerarquias, nombre);
      return {
        nombre,
        jerarquia,
        nivel: nombresDeNiveles(jerarquia)[optima.niveles[i]],
      };
    }),
    nodosRevisados: optima.nodosRevisados,
    nodosEnLaReticula: optima.nodosEnLaReticula,
    ...(optima.supresion ? { supresion: optima.supresion } : {}),
  };
}
