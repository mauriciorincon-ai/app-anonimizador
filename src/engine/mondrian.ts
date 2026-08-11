// Mondrian — k-anonimato multidimensional, y el sitio donde este sprint puede mentir sin querer.
//
// LeFevre, DeWitt & Ramakrishnan, *Mondrian Multidimensional K-Anonymity*, ICDE 2006.
// https://pages.cs.wisc.edu/~lefevre/MultiDim.pdf
//
// Greedy top-down: se corta el espacio de los cuasi-identificadores por la dimensión de mayor
// rango, por la mediana, y se repite mientras los dos lados sigan teniendo al menos k filas. Cuando
// ninguna dimensión admite un corte, la partición es final y sus filas comparten un mismo valor
// generalizado. O(n log n) frente a lo exponencial del óptimo, que es NP-hard.
//
// El ADR-002 lo midió (171 ms en el peor caso de 500k×8) y dejó **§3 y §4 como contrato**. Los tres
// puntos de ese contrato están aquí, y ninguno es cosmético:
//
//   1. **Dimensión de mayor rango; empate por MENOR índice de columna.** Sin un desempate fijado,
//      dos corridas sobre el mismo archivo pueden cortar distinto y producir archivos distintos.
//   2. **Partición POR VALOR (≤ mediana | > mediana), jamás por posición.** Es la línea que separa
//      este archivo de una implementación plausible y rota. Cortar por la posición central reparte
//      las filas cuyo valor ES la mediana entre los dos lados: dos filas idénticas reciben
//      etiquetas distintas, la generalización deja de ser una función del valor, y el archivo de
//      salida pasa a depender del ORDEN en que llegaron las filas — que es la regla dura nº3 rota
//      de la forma más silenciosa posible. Con `mediana-repetida` del kit, el 54 % de una columna
//      cae exactamente en la mediana: ahí la diferencia se ve.
//   3. **La proyección se cachea por columna.** El ADR avisó que el cuello no es el algoritmo sino
//      pasar los categóricos a dominio ordenado (78 ms con 8 QIs, y crece con la cardinalidad).
//      Aquí se proyecta cada columna UNA vez, no una vez por partición.
//
// ⚠️ **Lo que este módulo promete y lo que NO** — la composición que puede mentir, escrita antes de
// que alguien la componga: Mondrian garantiza k sobre **las columnas que entraron al reparto**. El
// k del ARCHIVO se mide sobre TODOS sus cuasi-identificadores. Un QI que se quedó fuera (porque la
// política lo conserva) parte esas clases y deja el k real por debajo del prometido. Por eso
// `kAlcanzado` no se lee de las particiones sino de las clases de equivalencia de la tabla de
// salida, y por eso la Fase 4 vuelve a medir con todos los QIs. Hay un test que exhibe exactamente
// ese engaño.

import {
  CODIGO_VACIO,
  type ColumnaColumnar,
  type TablaColumnar,
} from "./columnar";
import { clasesDeEquivalencia } from "./riesgo";

/** Separador de un intervalo OBSERVADO: `"18 a 39"`, `"1987-03-14 a 1990-05-02"`. */
const SEPARADOR = " a ";
/**
 * Sufijo cuando el intervalo también cubre celdas vacías.
 *
 * No es un adorno: la etiqueta se aplica a TODAS las filas de la partición, vacías incluidas —si
 * no, dos filas de la misma clase saldrían con valores distintos y el k prometido se partiría en
 * dos. Decir «o vacío» es lo que impide que la celda afirme un dato que nunca existió.
 */
const SUFIJO_VACIO = " (o vacío)";

/** Un valor es numérico si lo es del todo: nada de `Number("1e5")` ni de espacios creativos. */
const NUMERICO = /^-?\d+(?:[.,]\d+)?$/;

export interface Proyeccion {
  /** Ordinal (posición en el dominio ordenado) de cada código del diccionario. */
  readonly ordinalPorCodigo: Uint32Array;
  /** El dominio, ordenado. `valoresOrdenados[0]` es siempre la cadena vacía. */
  readonly valoresOrdenados: readonly string[];
  /** Si el dominio se ordenó como números o por punto de código. */
  readonly numerica: boolean;
}

/**
 * Caché de proyecciones, la que el ADR-002 pidió por nombre: «el costo real está en la proyección
 * de categóricos a dominio ordenado, y se puede cachear por columna».
 *
 * Memorizar una función pura no rompe el determinismo —la segunda respuesta es la primera— y aquí
 * paga de verdad: mover el k en la interfaz vuelve a repartir, y sin caché volvería a ordenar los
 * 477.701 valores distintos de `latitud` cada vez (600 ms medidos). La clave es la IDENTIDAD de la
 * columna, y eso vale porque en este motor las columnas son inmutables: transformar produce una
 * columna nueva, nunca reescribe la vieja. `WeakMap` deja que la tabla anterior se recoja sola
 * cuando el usuario carga otro archivo.
 */
const cache = new WeakMap<ColumnaColumnar, Proyeccion>();

/**
 * Lleva el diccionario de una columna a un dominio ORDENADO, y devuelve el ordinal de cada código.
 *
 * El orden decide dónde corta Mondrian, así que es una decisión de producto, no de implementación:
 *
 *   · **Si todos los valores no vacíos son números, se ordena numéricamente.** Por punto de código,
 *     `"10"` iría antes que `"9"` y los intervalos de edad no significarían nada.
 *   · **Si no, por punto de código** — nunca `localeCompare`, que ordena según el idioma del sistema
 *     operativo y haría que el mismo archivo se anonimizara distinto en dos computadores.
 *   · **El vacío ocupa siempre el ordinal 0**, el más bajo. Una celda en blanco es una fila más y
 *     tiene que caer en alguna partición; dejarla fuera sería suprimirla sin decirlo.
 *   · **Empate numérico, desempate por texto:** `"40"` y `"40.0"` valen lo mismo y son entradas
 *     distintas del diccionario. Sin el desempate, el orden lo decidiría el algoritmo de `sort`.
 */
export function proyectar(columna: ColumnaColumnar): Proyeccion {
  const enCache = cache.get(columna);
  if (enCache !== undefined) return enCache;

  const { valores } = columna;
  const numerica = valores.every((v) => v === "" || NUMERICO.test(v));

  const codigos: number[] = [];
  for (let c = 0; c < valores.length; c++) {
    if (valores[c] !== "") codigos.push(c);
  }

  // Las claves numéricas se calculan UNA vez por valor, no dentro del comparador. No es
  // micro-optimización: `sort` llama al comparador ~n·log n veces, así que convertir el texto ahí
  // dentro son 9 millones de `replace` + `Number` en una columna de 480.000 valores distintos —
  // medido, 1,7 s de los 3,8 s del caso peor. Precalcularlas los deja en 480.000.
  const claves = numerica ? new Float64Array(valores.length) : null;
  if (claves !== null) {
    for (let c = 0; c < valores.length; c++) {
      claves[c] = Number(valores[c].replace(",", "."));
    }
  }

  // El diccionario ya viene deduplicado, así que dos códigos distintos nunca traen el mismo texto:
  // el comparador no necesita el caso de igualdad y no hay orden que quede al azar.
  codigos.sort((a, b) => {
    if (claves !== null && claves[a] !== claves[b])
      return claves[a] - claves[b];
    return valores[a] < valores[b] ? -1 : 1;
  });

  const ordinalPorCodigo = new Uint32Array(valores.length);
  const valoresOrdenados: string[] = [""];
  for (let i = 0; i < codigos.length; i++) {
    // El vacío se queda en 0 por construcción del Uint32Array.
    ordinalPorCodigo[codigos[i]] = i + 1;
    valoresOrdenados.push(valores[codigos[i]]);
  }

  const proyeccion = { ordinalPorCodigo, valoresOrdenados, numerica };
  cache.set(columna, proyeccion);
  return proyeccion;
}

/** Por qué no se alcanzó el k pedido. La frase para el usuario la escribe la UI, no el motor. */
export type MotivoDeMondrian = "menos-filas-que-k" | "sin-dimensiones";

export interface ResultadoDeMondrian {
  /** La tabla con las columnas del reparto ya generalizadas. Las demás salen intactas. */
  readonly tabla: TablaColumnar;
  readonly kObjetivo: number;
  /**
   * k REAL sobre las columnas del reparto en la tabla de SALIDA. No es el mínimo tamaño de
   * partición: dos particiones pueden acabar con las mismas etiquetas y fundirse en una clase, y
   * entonces el k verdadero es mayor. Se mide sobre el resultado, que es lo que alguien recibe.
   */
  readonly kAlcanzado: number;
  readonly alcanzado: boolean;
  readonly motivo: MotivoDeMondrian | null;
  /** Las columnas que entraron al reparto, en el orden de la tabla. */
  readonly dimensiones: readonly string[];
  /**
   * Dimensiones que nunca admitieron un corte. No es un error: es utilidad perdida que el usuario
   * merece ver — esa columna salió generalizada a su rango completo, o sea, casi borrada.
   */
  readonly sinCortes: readonly string[];
  readonly particiones: number;
}

interface Dimension {
  readonly nombre: string;
  readonly proyeccion: Proyeccion;
  /** Ordinal por FILA, precalculado: quita una indirección del bucle más caliente del motor. */
  readonly ordinalPorFila: Uint32Array;
}

/** El intervalo observado de una dimensión dentro de una partición, ya como texto. */
function etiquetar(
  proyeccion: Proyeccion,
  minimoNoVacio: number,
  maximo: number,
  hayVacio: boolean,
): string {
  // Toda la partición está en blanco en esta columna: sigue en blanco. Inventar un intervalo
  // afirmaría un dato que nadie escribió.
  if (minimoNoVacio === 0) return "";

  const { valoresOrdenados } = proyeccion;
  const base =
    minimoNoVacio === maximo
      ? valoresOrdenados[maximo]
      : `${valoresOrdenados[minimoNoVacio]}${SEPARADOR}${valoresOrdenados[maximo]}`;
  return hayVacio ? `${base}${SUFIJO_VACIO}` : base;
}

/**
 * Reparte las filas en particiones de al menos `k`, cortando por valor.
 *
 * Devuelve los rangos `[ini, fin)` sobre `indices`, ya reordenado. La recursión va en una pila
 * explícita a propósito: con cortes muy desbalanceados —que es justo lo que produce una mediana
 * repetida— la profundidad puede acercarse a n/k, y eso desborda la pila de llamadas.
 */
function repartir(
  dimensiones: readonly Dimension[],
  indices: Uint32Array,
  k: number,
  cortesPorDimension: Uint32Array,
): { ini: number; fin: number }[] {
  const d = dimensiones.length;
  const n = indices.length;
  // Los ordinales, sueltos del objeto: el bucle de min/max los recorre d×n veces por nivel del
  // árbol y no conviene pagar una indirección de propiedad en cada vuelta.
  const ordinales = dimensiones.map((dimension) => dimension.ordinalPorFila);
  const buffer = new Uint32Array(n);
  const escala = new Uint32Array(n);
  const minimo = new Uint32Array(d);
  const maximo = new Uint32Array(d);
  const orden = Array.from({ length: d }, (_, j) => j);

  let ancho = 0;
  for (const dimension of dimensiones) {
    ancho = Math.max(ancho, dimension.proyeccion.valoresOrdenados.length);
  }
  const histograma = new Uint32Array(ancho);

  const finales: { ini: number; fin: number }[] = [];
  const pendientes: [number, number][] = [[0, n]];

  while (pendientes.length > 0) {
    const [ini, fin] = pendientes.pop()!;
    const filas = fin - ini;

    minimo.fill(0xffffffff);
    maximo.fill(0);
    for (let i = ini; i < fin; i++) {
      const fila = indices[i];
      for (let j = 0; j < d; j++) {
        const ordinal = ordinales[j][fila];
        if (ordinal < minimo[j]) minimo[j] = ordinal;
        if (ordinal > maximo[j]) maximo[j] = ordinal;
      }
    }

    // Contrato del ADR-002 §3: mayor rango primero, empate por MENOR índice de columna.
    orden.sort(
      (a, b) => maximo[b] - minimo[b] - (maximo[a] - minimo[a]) || a - b,
    );

    let cortada = false;
    for (const j of orden) {
      // Como `orden` va por rango descendente, un rango 0 aquí significa que todas las que quedan
      // también lo tienen: no hay nada más que intentar.
      if (maximo[j] === minimo[j]) break;

      const anchoDeLaDimension = maximo[j] - minimo[j] + 1;
      const ordinalPorFila = ordinales[j];
      // La mediana es el valor donde la frecuencia acumulada alcanza ⌈filas/2⌉. Se busca sin
      // pivotes —o sea, sin azar, que en este motor está prohibido— por dos caminos, y el barato
      // depende de la forma de la partición:
      //
      //   · **histograma**, O(filas + ancho): imbatible mientras el dominio quepa. Es el caso de
      //     `sexo`, `municipio`, `estrato`.
      //   · **ordenar los ordinales de la partición**, O(filas·log filas): gana cuando el dominio
      //     es enorme y la partición chica, que es exactamente el fondo del árbol con una columna
      //     casi única (`latitud` tiene 477.701 valores distintos y allá abajo quedan 5 filas).
      //     Sin este camino, cada intento pagaba medio millón de casillas para mirar cinco.
      const objetivo = Math.ceil(filas / 2);
      let mediana: number;
      let izquierda: number;

      if (anchoDeLaDimension <= filas) {
        for (let i = ini; i < fin; i++) {
          histograma[ordinalPorFila[indices[i]] - minimo[j]]++;
        }
        let acumulado = 0;
        mediana = minimo[j];
        for (let v = 0; v < anchoDeLaDimension; v++) {
          acumulado += histograma[v];
          if (acumulado >= objetivo) {
            mediana = minimo[j] + v;
            break;
          }
        }
        histograma.fill(0, 0, anchoDeLaDimension);
        izquierda = acumulado;
      } else {
        for (let i = ini; i < fin; i++) {
          escala[i - ini] = ordinalPorFila[indices[i]];
        }
        // `sort()` de un TypedArray es numérico y no depende de la configuración regional.
        const ordenados = escala.subarray(0, filas);
        ordenados.sort();
        mediana = ordenados[objetivo - 1];
        // El lado izquierdo llega hasta la ÚLTIMA repetición de la mediana: por valor, no por
        // posición. Es la misma regla del histograma, escrita sobre un arreglo ordenado.
        let ultimo = objetivo - 1;
        while (ultimo + 1 < filas && ordenados[ultimo + 1] === mediana)
          ultimo++;
        izquierda = ultimo + 1;
      }

      // Corte permitido (allowable cut del paper): los DOS lados aguantan k. Si no, se intenta la
      // dimensión siguiente en vez de forzar el corte — es lo que hace que una mediana repetida
      // hasta el 100 % no rompa nada: simplemente esa dimensión no se corta.
      if (izquierda < k || filas - izquierda < k) continue;

      let izq = ini;
      let der = ini + izquierda;
      for (let i = ini; i < fin; i++) {
        const fila = indices[i];
        if (ordinalPorFila[fila] <= mediana) buffer[izq++] = fila;
        else buffer[der++] = fila;
      }
      indices.set(buffer.subarray(ini, fin), ini);

      pendientes.push([ini, ini + izquierda], [ini + izquierda, fin]);
      cortesPorDimension[j]++;
      cortada = true;
      break;
    }

    if (!cortada) finales.push({ ini, fin });
  }
  return finales;
}

/** Rehace una columna del reparto con la etiqueta de la partición de cada fila. */
function generalizarColumna(
  original: ColumnaColumnar,
  etiquetaPorParticion: readonly string[],
  particionPorFila: Uint32Array,
): ColumnaColumnar {
  // Diccionario en ORDEN DE PRIMERA APARICIÓN por fila, como el resto del motor: así la tabla
  // generalizada es indistinguible de una recién parseada y el gate de determinismo la compara sin
  // excepciones.
  const indice = new Map<string, number>([["", CODIGO_VACIO]]);
  const valores: string[] = [""];
  // El código de cada partición se resuelve la PRIMERA vez que aparece: una búsqueda en el mapa por
  // partición (65.000) en vez de una por fila (500.000), sin cambiar el orden del diccionario.
  const codigoPorParticion = new Int32Array(etiquetaPorParticion.length).fill(
    -1,
  );
  const codigos = new Uint32Array(particionPorFila.length);
  let noVacios = 0;

  for (let f = 0; f < codigos.length; f++) {
    const particion = particionPorFila[f];
    let codigo = codigoPorParticion[particion];
    if (codigo === -1) {
      const etiqueta = etiquetaPorParticion[particion];
      codigo = indice.get(etiqueta) ?? valores.length;
      if (codigo === valores.length) {
        valores.push(etiqueta);
        indice.set(etiqueta, codigo);
      }
      codigoPorParticion[particion] = codigo;
    }
    codigos[f] = codigo;
    if (codigo !== CODIGO_VACIO) noVacios++;
  }
  return { nombre: original.nombre, codigos, valores, noVacios };
}

function kDeLaTabla(
  columnas: readonly ColumnaColumnar[],
  filas: number,
): number {
  const { tamanos } = clasesDeEquivalencia(columnas, filas);
  let minimo = Number.POSITIVE_INFINITY;
  for (const tamano of tamanos) if (tamano < minimo) minimo = tamano;
  // Sin clases el mínimo se queda en infinito: un archivo sin filas tiene k=0, no k=∞.
  return Number.isFinite(minimo) ? minimo : 0;
}

/**
 * Generaliza las columnas indicadas hasta que ninguna clase de equivalencia baje de `kObjetivo`.
 *
 * **k no alcanzable no se resuelve solo.** Si el archivo tiene menos filas que el k pedido, Mondrian
 * generaliza todo lo que puede y lo devuelve dicho —`alcanzado: false`— en vez de suprimir filas
 * por su cuenta. Borrar registros del archivo de alguien es una decisión suya, y además silenciosa:
 * un archivo con menos filas de las que entró no se nota mirándolo.
 */
export function anonimizarConMondrian(
  tabla: TablaColumnar,
  nombresDeDimension: readonly string[],
  kObjetivo: number,
): ResultadoDeMondrian {
  // En el ORDEN DE LA TABLA, no en el de la lista: el desempate del contrato es «menor índice de
  // columna», y ese índice tiene que significar siempre lo mismo.
  const pedidas = new Set(nombresDeDimension);
  const columnas = tabla.columnas.filter((c) => pedidas.has(c.nombre));

  if (columnas.length === 0 || tabla.filas === 0) {
    const suficientes = tabla.filas >= kObjetivo;
    return {
      tabla,
      kObjetivo,
      kAlcanzado: tabla.filas,
      alcanzado: suficientes,
      motivo: suficientes ? null : "sin-dimensiones",
      dimensiones: [],
      sinCortes: [],
      particiones: tabla.filas > 0 ? 1 : 0,
    };
  }

  const dimensiones: Dimension[] = columnas.map((columna) => {
    const proyeccion = proyectar(columna);
    const ordinalPorFila = new Uint32Array(tabla.filas);
    for (let f = 0; f < tabla.filas; f++) {
      ordinalPorFila[f] = proyeccion.ordinalPorCodigo[columna.codigos[f]];
    }
    return { nombre: columna.nombre, proyeccion, ordinalPorFila };
  });

  const indices = new Uint32Array(tabla.filas);
  for (let f = 0; f < tabla.filas; f++) indices[f] = f;

  const cortesPorDimension = new Uint32Array(dimensiones.length);
  const particiones = repartir(
    dimensiones,
    indices,
    kObjetivo,
    cortesPorDimension,
  );

  // Etiqueta de cada partición en cada dimensión: el intervalo observado de sus filas.
  const particionPorFila = new Uint32Array(tabla.filas);
  const etiquetas: string[][] = dimensiones.map(() => []);

  for (let p = 0; p < particiones.length; p++) {
    const { ini, fin } = particiones[p];
    for (let j = 0; j < dimensiones.length; j++) {
      const { ordinalPorFila } = dimensiones[j];
      let minimoNoVacio = 0;
      let maximo = 0;
      let hayVacio = false;
      for (let i = ini; i < fin; i++) {
        const ordinal = ordinalPorFila[indices[i]];
        if (ordinal === 0) {
          hayVacio = true;
          continue;
        }
        if (minimoNoVacio === 0 || ordinal < minimoNoVacio)
          minimoNoVacio = ordinal;
        if (ordinal > maximo) maximo = ordinal;
      }
      etiquetas[j].push(
        etiquetar(dimensiones[j].proyeccion, minimoNoVacio, maximo, hayVacio),
      );
    }
    for (let i = ini; i < fin; i++) particionPorFila[indices[i]] = p;
  }

  const generalizadas = new Map(
    dimensiones.map((dimension, j) => [
      dimension.nombre,
      generalizarColumna(columnas[j], etiquetas[j], particionPorFila),
    ]),
  );

  const salida: TablaColumnar = {
    columnas: tabla.columnas.map((c) => generalizadas.get(c.nombre) ?? c),
    filas: tabla.filas,
  };
  const kAlcanzado = kDeLaTabla([...generalizadas.values()], tabla.filas);

  return {
    tabla: salida,
    kObjetivo,
    kAlcanzado,
    alcanzado: kAlcanzado >= kObjetivo,
    motivo: kAlcanzado >= kObjetivo ? null : "menos-filas-que-k",
    dimensiones: dimensiones.map((dimension) => dimension.nombre),
    sinCortes: dimensiones
      .filter((_, j) => cortesPorDimension[j] === 0)
      .map((dimension) => dimension.nombre),
    particiones: particiones.length,
  };
}
