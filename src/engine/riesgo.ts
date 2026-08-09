// Motor de riesgo de reidentificación — la mitad EXACTA del asunto.
//
// Todo lo que sale de este archivo se calcula sobre el archivo que el usuario cargó, contando
// registros de verdad. No hay estimación, no hay modelo, no hay supuesto poblacional: es un
// group-by. Por eso cada resultado viaja marcado `naturaleza: "exacto"` — el Sprint 002 añadirá
// los estimadores de unicidad poblacional (Pitman/Zayatz), que dependen del modelo y de la
// fracción de muestreo declarada, y esos tendrán que ir etiquetados "estimado" en la UI. Mezclar
// los dos planos es exactamente lo que la regla de honestidad medida prohíbe.
//
// Modelo de atacante: PROSECUTOR — el atacante sabe que la persona está en la tabla y busca cuál
// de las filas es. Es el escenario más adverso de los tres de ARX (prosecutor / journalist /
// marketer) y el único que se puede calcular exacto sobre la muestra. Riesgo por registro =
// 1/|clase de equivalencia|.
//
// Lo que este motor NO promete: k-anonimato no es una garantía. Es atacable incluso sin
// información auxiliar (arXiv:2509.03350) y se degrada con la dimensionalidad. Velo mide riesgo y
// lo muestra; nunca dice "anonimizado".

import { type ColumnaColumnar, type TablaColumnar } from "./columnar";
import type { Diagnostico } from "./clasificador";

/** Clases de equivalencia: filas que son indistinguibles entre sí mirando solo los QIs. */
export interface ClasesDeEquivalencia {
  /** Id de clase por fila. Los ids se asignan por ORDEN DE PRIMERA APARICIÓN (determinismo). */
  readonly ids: Uint32Array;
  /** Tamaño de cada clase, indexado por id. */
  readonly tamanos: Uint32Array;
}

export interface RiesgoExacto {
  /** Marca de plano. En S1 solo existe "exacto"; los estimadores llegan etiquetados en S2. */
  readonly naturaleza: "exacto";
  readonly qis: readonly string[];
  readonly filas: number;
  readonly clases: number;
  /** Tamaño de la clase más pequeña: el k real del archivo. */
  readonly kMinimo: number;
  /** Riesgo del registro más expuesto = 1/kMinimo. */
  readonly riesgoMaximo: number;
  /** Riesgo medio por registro. */
  readonly riesgoPromedio: number;
  /** Registros que están SOLOS en su clase: señalables con el dedo. */
  readonly unicos: number;
  readonly proporcionUnicos: number;
}

export interface CombinacionQi {
  readonly columnas: readonly string[];
  /** k REAL de esta combinación: el tamaño de su clase más pequeña. */
  readonly k: number;
  readonly clases: number;
  readonly unicos: number;
  readonly proporcionUnicos: number;
}

export interface ColumnaExcluida {
  readonly nombre: string;
  readonly motivo: string;
}

/** Columna que, ella sola, ya deja solo a casi todo el mundo. */
export interface ColumnaQueIdentificaSola {
  readonly nombre: string;
  readonly cardinalidad: number;
  readonly unicos: number;
  readonly proporcionUnicos: number;
}

export interface AdvisorDeQis {
  readonly candidatos: readonly { nombre: string; cardinalidad: number }[];
  /**
   * Columnas que no necesitan compañía: por sí solas dejan único a casi todo el registro. Se
   * reportan APARTE en vez de esconderse, porque suelen ser el hallazgo más importante del
   * archivo; salen del recorrido de combinaciones porque cualquier combinación que las incluya
   * heredaría su unicidad y no diría nada nuevo.
   */
  readonly identificanSolas: readonly ColumnaQueIdentificaSola[];
  /** Qué quedó fuera y POR QUÉ. Un tope silencioso se lee como "lo revisé todo". */
  readonly excluidas: readonly ColumnaExcluida[];
  readonly combinaciones: readonly CombinacionQi[];
  readonly combinacionesEvaluadas: number;
  readonly tope: {
    readonly candidatosMaximos: number;
    readonly tamanoMaximo: number;
  };
}

export interface EvaluacionDeRiesgo {
  readonly riesgo: RiesgoExacto;
  readonly advisor: AdvisorDeQis;
}

/** Cuántas columnas candidatas entran al advisor. Con 6 salen 50 combinaciones de tamaño 2–4. */
export const CANDIDATOS_MAXIMOS = 6;
/** Tamaño máximo de combinación que el advisor evalúa. */
export const TAMANO_MAXIMO_DE_COMBINACION = 4;
/**
 * Proporción de registros únicos a partir de la cual se considera que una columna identifica sola.
 *
 * El umbral se mide sobre el RESULTADO (cuánta gente queda sola), no sobre un proxy como
 * "muchos valores distintos". La diferencia no es cosmética: una fecha de nacimiento tiene ~24.000
 * valores posibles, así que en un archivo de 3.000 filas es casi única y en uno de 500.000 no lo
 * es ni de lejos. Medir el efecto real deja que el mismo umbral se comporte bien en los dos casos.
 */
export const UMBRAL_IDENTIFICA_SOLA = 0.9;

// ── Clases de equivalencia ────────────────────────────────────────────────────────────────────

/**
 * Combina las clases ya calculadas con una columna más. Es un pase O(n) sobre enteros: de ahí sale
 * que el advisor pueda evaluar 50 combinaciones sin recalcular nada desde cero.
 *
 * La clave compuesta es `idPrevio × cardinalidad + código`. Cota: `idPrevio < filas` y
 * `código ≤ filas`, así que el producto es < filas². Con el tope declarado del producto (500.000
 * filas) eso son 2,5×10¹¹, cuatro órdenes de magnitud por debajo del entero seguro de JS
 * (9,007×10¹⁵, que se alcanzaría hacia los 94 millones de filas).
 */
function combinar(
  idsPrevios: Uint32Array,
  columna: ColumnaColumnar,
): { ids: Uint32Array; clases: number } {
  const filas = idsPrevios.length;
  const cardinalidad = columna.valores.length;
  const ids = new Uint32Array(filas);
  const indice = new Map<number, number>();
  let clases = 0;

  for (let f = 0; f < filas; f++) {
    const clave = idsPrevios[f] * cardinalidad + columna.codigos[f];
    let id = indice.get(clave);
    if (id === undefined) {
      // Orden de primera aparición: recorriendo las filas 0..n−1 siempre da los mismos ids.
      id = clases++;
      indice.set(clave, id);
    }
    ids[f] = id;
  }
  return { ids, clases };
}

/** Agrupa las filas por su combinación de valores en las columnas dadas. */
export function clasesDeEquivalencia(
  columnas: readonly ColumnaColumnar[],
  filas: number,
): ClasesDeEquivalencia {
  // Sin QIs no hay nada que distinga a nadie: todas las filas caen en una sola clase.
  // La anotación explícita no es adorno: `new Uint32Array(n)` se infiere como
  // `Uint32Array<ArrayBuffer>`, mientras que las vistas que devuelve el módulo columnar son
  // `Uint32Array<ArrayBufferLike>` (comparten buffer). Sin ella, la reasignación no compila.
  let ids: Uint32Array = new Uint32Array(filas);
  let clases = filas > 0 ? 1 : 0;

  for (const columna of columnas) {
    const combinado = combinar(ids, columna);
    ids = combinado.ids;
    clases = combinado.clases;
  }

  const tamanos = new Uint32Array(clases);
  for (let f = 0; f < filas; f++) tamanos[ids[f]]++;
  return { ids, tamanos };
}

// ── Riesgo prosecutor exacto ──────────────────────────────────────────────────────────────────

export function riesgoProsecutor(
  clases: ClasesDeEquivalencia,
  qis: readonly string[],
  filas: number,
): RiesgoExacto {
  const { tamanos } = clases;

  if (filas === 0 || tamanos.length === 0) {
    return {
      naturaleza: "exacto",
      qis: [...qis],
      filas,
      clases: 0,
      kMinimo: 0,
      riesgoMaximo: 0,
      riesgoPromedio: 0,
      unicos: 0,
      proporcionUnicos: 0,
    };
  }

  let kMinimo = Number.POSITIVE_INFINITY;
  let unicos = 0;
  for (const tamano of tamanos) {
    if (tamano < kMinimo) kMinimo = tamano;
    if (tamano === 1) unicos++;
  }

  // El riesgo promedio por registro es Σ(|c| × 1/|c|) / n = (número de clases) / n. La forma
  // cerrada no es un atajo ingenioso: sumar 500.000 términos de 1/k acumula error de punto
  // flotante, y este número se presenta como EXACTO. Hay un test que confronta las dos formas
  // sobre una tabla pequeña, para que la igualdad no quede en la palabra de un comentario.
  const riesgoPromedio = tamanos.length / filas;

  return {
    naturaleza: "exacto",
    qis: [...qis],
    filas,
    clases: tamanos.length,
    kMinimo,
    riesgoMaximo: 1 / kMinimo,
    riesgoPromedio,
    unicos,
    proporcionUnicos: unicos / filas,
  };
}

// ── QI advisor ────────────────────────────────────────────────────────────────────────────────

function resumirCombinacion(
  nombres: readonly string[],
  ids: Uint32Array,
  clases: number,
  filas: number,
): CombinacionQi {
  const tamanos = new Uint32Array(clases);
  for (let f = 0; f < filas; f++) tamanos[ids[f]]++;

  let k = Number.POSITIVE_INFINITY;
  let unicos = 0;
  for (const tamano of tamanos) {
    if (tamano < k) k = tamano;
    if (tamano === 1) unicos++;
  }
  return {
    columnas: [...nombres],
    k,
    clases,
    unicos,
    proporcionUnicos: unicos / filas,
  };
}

/**
 * Propone qué combinaciones de columnas delatan, con su k REAL — calculado sobre el archivo
 * entero, no estimado.
 *
 * Es la lección de Sweeney (2000) y su réplica de Golle (2006) vuelta herramienta: ninguna de esas
 * columnas identifica a nadie por separado, y juntas señalan a buena parte de la tabla. El usuario
 * no tiene por qué saber eso de antemano; el advisor se lo muestra sobre SUS datos.
 *
 * Candidatas: cuasi-identificadores y columnas no personales. Se excluyen los identificadores
 * directos (identifican solos: no hay nada que aconsejar) y los datos sensibles del art. 5, que en
 * el modelo de k-anonimato son el ATRIBUTO OBJETIVO —lo que el atacante quiere averiguar— y no la
 * llave por la que enlaza.
 */
export function aconsejarQis(
  tabla: TablaColumnar,
  diagnostico: Diagnostico,
  opciones: { candidatosMaximos?: number; tamanoMaximo?: number } = {},
): AdvisorDeQis {
  const candidatosMaximos = opciones.candidatosMaximos ?? CANDIDATOS_MAXIMOS;
  const tamanoMaximo = opciones.tamanoMaximo ?? TAMANO_MAXIMO_DE_COMBINACION;
  const porNombre = new Map(tabla.columnas.map((c) => [c.nombre, c]));
  const excluidas: ColumnaExcluida[] = [];

  const elegibles: { columna: ColumnaColumnar; cardinalidad: number }[] = [];
  for (const hallazgo of diagnostico.columnas) {
    const columna = porNombre.get(hallazgo.nombre);
    if (!columna) continue;

    if (hallazgo.categoria === "identificador-directo") {
      excluidas.push({
        nombre: hallazgo.nombre,
        motivo:
          "identificador directo: señala a la persona sin ayuda de ninguna otra columna",
      });
      continue;
    }
    if (hallazgo.categoria === "dato-sensible") {
      excluidas.push({
        nombre: hallazgo.nombre,
        motivo:
          "dato sensible (art. 5): es lo que el atacante quiere averiguar, no la llave",
      });
      continue;
    }

    const cardinalidad = columna.valores.length - 1;
    if (cardinalidad <= 1) {
      excluidas.push({
        nombre: hallazgo.nombre,
        motivo: "un solo valor distinto: no distingue a nadie",
      });
      continue;
    }
    elegibles.push({ columna, cardinalidad });
  }

  // Poder identificador de cada columna POR SÍ SOLA — un pase O(n) por columna. Es lo que separa
  // a las que ya delatan de las que solo delatan acompañadas, y es información que el usuario
  // necesita ver aunque la columna no entre a ninguna combinación.
  const identificanSolas: ColumnaQueIdentificaSola[] = [];
  const paraCombinar: { columna: ColumnaColumnar; cardinalidad: number }[] = [];
  for (const elegible of elegibles) {
    if (tabla.filas === 0) {
      paraCombinar.push(elegible);
      continue;
    }
    const sola = combinar(new Uint32Array(tabla.filas), elegible.columna);
    const resumen = resumirCombinacion(
      [elegible.columna.nombre],
      sola.ids,
      sola.clases,
      tabla.filas,
    );
    if (resumen.proporcionUnicos >= UMBRAL_IDENTIFICA_SOLA) {
      identificanSolas.push({
        nombre: elegible.columna.nombre,
        cardinalidad: elegible.cardinalidad,
        unicos: resumen.unicos,
        proporcionUnicos: resumen.proporcionUnicos,
      });
      continue;
    }
    paraCombinar.push(elegible);
  }

  // Más valores distintos ⇒ más poder de discriminación. Empate por orden de columna: fijo.
  const ordenadas = paraCombinar
    .map((e, posicion) => ({ ...e, posicion }))
    .sort((a, b) => b.cardinalidad - a.cardinalidad || a.posicion - b.posicion);

  const candidatas = ordenadas.slice(0, candidatosMaximos);
  for (const sobrante of ordenadas.slice(candidatosMaximos)) {
    excluidas.push({
      nombre: sobrante.columna.nombre,
      motivo: `fuera de las ${candidatosMaximos} candidatas con más valores distintos`,
    });
  }

  // Recorrido en profundidad del retículo de subconjuntos: cada nivel hereda las clases del padre
  // y solo paga UN pase O(n) por columna añadida. Sin esa herencia, cada combinación costaría
  // recalcular desde cero y el advisor no cabría en el presupuesto.
  const combinaciones: CombinacionQi[] = [];
  let evaluadas = 0;

  const explorar = (
    indices: number[],
    nombres: string[],
    ids: Uint32Array,
    clases: number,
  ): void => {
    if (nombres.length >= 2) {
      evaluadas++;
      combinaciones.push(resumirCombinacion(nombres, ids, clases, tabla.filas));
    }
    if (nombres.length >= tamanoMaximo) return;
    for (
      let i = (indices[indices.length - 1] ?? -1) + 1;
      i < candidatas.length;
      i++
    ) {
      const siguiente = combinar(ids, candidatas[i].columna);
      explorar(
        [...indices, i],
        [...nombres, candidatas[i].columna.nombre],
        siguiente.ids,
        siguiente.clases,
      );
    }
  };

  if (tabla.filas > 0) {
    for (let i = 0; i < candidatas.length; i++) {
      const inicial = combinar(
        new Uint32Array(tabla.filas),
        candidatas[i].columna,
      );
      explorar(
        [i],
        [candidatas[i].columna.nombre],
        inicial.ids,
        inicial.clases,
      );
    }
  }

  // Ranking por poder identificador: primero la que deja más gente sola. A igual proporción, la
  // combinación MÁS CORTA es la más alarmante (delata lo mismo con menos información), y el
  // desempate final por nombres deja el orden fijado.
  //
  // Los tres criterios van en sentencias separadas a propósito: encadenarlos con `||` y ternarios
  // se lee compacto y se comporta mal — la precedencia lo convierte en un `if` sobre el primero
  // que resulte verdadero. Un comparador roto aquí no explota: solo hace que dos corridas ordenen
  // distinto, que es la peor clase de error para este producto.
  combinaciones.sort((a, b) => {
    if (b.proporcionUnicos !== a.proporcionUnicos) {
      return b.proporcionUnicos - a.proporcionUnicos;
    }
    if (a.columnas.length !== b.columnas.length) {
      return a.columnas.length - b.columnas.length;
    }
    const claveA = a.columnas.join(" ");
    const claveB = b.columnas.join(" ");
    if (claveA === claveB) return 0;
    // Comparación por punto de código, nunca por locale: el orden no puede depender del idioma
    // del sistema operativo.
    return claveA < claveB ? -1 : 1;
  });

  // Orden fijo también aquí: primero la que deja más gente sola, luego por nombre.
  identificanSolas.sort((a, b) => {
    if (b.proporcionUnicos !== a.proporcionUnicos) {
      return b.proporcionUnicos - a.proporcionUnicos;
    }
    if (a.nombre === b.nombre) return 0;
    return a.nombre < b.nombre ? -1 : 1;
  });

  return {
    identificanSolas,
    candidatos: candidatas.map((c) => ({
      nombre: c.columna.nombre,
      cardinalidad: c.cardinalidad,
    })),
    excluidas,
    combinaciones,
    combinacionesEvaluadas: evaluadas,
    tope: { candidatosMaximos, tamanoMaximo },
  };
}

// ── Entrada principal ─────────────────────────────────────────────────────────────────────────

/**
 * Riesgo exacto sobre los cuasi-identificadores detectados + el advisor de combinaciones.
 */
export function evaluarRiesgo(
  tabla: TablaColumnar,
  diagnostico: Diagnostico,
  opciones?: { candidatosMaximos?: number; tamanoMaximo?: number },
): EvaluacionDeRiesgo {
  const porNombre = new Map(tabla.columnas.map((c) => [c.nombre, c]));
  const qis = diagnostico.columnas
    .filter((c) => c.categoria === "cuasi-identificador")
    .map((c) => c.nombre);
  const columnasQi = qis
    .map((nombre) => porNombre.get(nombre))
    .filter((c): c is ColumnaColumnar => c !== undefined);

  const clases = clasesDeEquivalencia(columnasQi, tabla.filas);
  return {
    riesgo: riesgoProsecutor(clases, qis, tabla.filas),
    advisor: aconsejarQis(tabla, diagnostico, opciones),
  };
}
