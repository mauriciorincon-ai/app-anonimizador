// Representación columnar — la base física del motor de Velo.
//
// Por qué no filas de objetos: 500.000 filas × 24 columnas como `{cedula: "...", nit: "..."}` son
// 12 millones de propiedades de objeto; el heap de V8 está limitado a ~4 GB por pestaña
// (https://v8.dev/blog/heap-size-limit) y ese formato lo desperdicia entero. Columnar con
// diccionario de strings + Uint32Array de códigos hace holgado lo que fila-a-fila revienta, y de
// paso regala tres cosas que el diagnóstico necesita: la cardinalidad exacta sin recorrer nada,
// las clases de equivalencia como operaciones sobre enteros, y las muestras sin duplicar memoria.
//
// Determinismo: los códigos se asignan en ORDEN DE PRIMERA APARICIÓN. No es un detalle de
// implementación — es lo que hace que dos corridas sobre el mismo archivo produzcan la misma
// tabla, y por tanto el mismo diagnóstico byte por byte.

/** Código reservado para la celda vacía: siempre 0, en todas las columnas. */
export const CODIGO_VACIO = 0;

export interface ColumnaColumnar {
  readonly nombre: string;
  /** Un código por fila; índice dentro de `valores`. */
  readonly codigos: Uint32Array;
  /** Valores únicos en orden de primera aparición. `valores[0]` es siempre la cadena vacía. */
  readonly valores: readonly string[];
  /** Filas con contenido (todo lo que no es celda vacía). */
  readonly noVacios: number;
}

export interface TablaColumnar {
  readonly columnas: readonly ColumnaColumnar[];
  readonly filas: number;
}

const CAPACIDAD_INICIAL = 1024;

class AcumuladorDeColumna {
  readonly nombre: string;
  private codigos: Uint32Array;
  private readonly valores: string[] = [""];
  private readonly indice = new Map<string, number>([["", CODIGO_VACIO]]);
  private longitud = 0;
  private noVacios = 0;

  constructor(nombre: string, capacidad: number) {
    this.nombre = nombre;
    this.codigos = new Uint32Array(Math.max(capacidad, CAPACIDAD_INICIAL));
  }

  agregar(valor: string): void {
    if (this.longitud === this.codigos.length) {
      // Duplicar es O(1) amortizado y evita conocer el total de filas de antemano — que con un
      // CSV en streaming no se conoce hasta el final.
      const mayor = new Uint32Array(this.codigos.length * 2);
      mayor.set(this.codigos);
      this.codigos = mayor;
    }
    let codigo = this.indice.get(valor);
    if (codigo === undefined) {
      codigo = this.valores.length;
      this.valores.push(valor);
      this.indice.set(valor, codigo);
    }
    if (codigo !== CODIGO_VACIO) this.noVacios++;
    this.codigos[this.longitud++] = codigo;
  }

  finalizar(): ColumnaColumnar {
    // El índice solo sirve para CONSTRUIR (deduplicar mientras entran filas). Soltarlo aquí es la
    // optimización de memoria más rentable del motor: medido en el spike A, una tabla de 500k×24
    // con 6,3 M de valores únicos pasó de 558,2 MB a 371,8 MB — 186 MB que eran entradas de Map
    // vivas sin razón. Los strings no se pierden: `valores` los sigue referenciando.
    this.indice.clear();

    // Con capacidad muy sobrante, `subarray` mantendría vivo todo el buffer duplicado; con poca,
    // copiar sería un gasto tonto. El umbral decide con el dato, no con la intuición.
    const sobra = this.codigos.length - this.longitud;
    const codigos =
      sobra > this.longitud / 8
        ? this.codigos.slice(0, this.longitud)
        : this.codigos.subarray(0, this.longitud);

    return {
      nombre: this.nombre,
      codigos,
      valores: this.valores,
      noVacios: this.noVacios,
    };
  }
}

/**
 * Construye una tabla columnar fila por fila, apto para streaming: el CSV llega por chunks y
 * nunca existe una copia completa del archivo en memoria.
 */
export class ConstructorColumnar {
  private readonly acumuladores: AcumuladorDeColumna[];
  private filas = 0;

  constructor(
    nombresDeColumna: readonly string[],
    filasEstimadas = CAPACIDAD_INICIAL,
  ) {
    this.acumuladores = nombresDeColumna.map(
      (nombre, i) =>
        new AcumuladorDeColumna(nombre || `columna_${i + 1}`, filasEstimadas),
    );
  }

  /**
   * Agrega una fila. Las filas cortas se completan con vacío y las largas se truncan: un CSV real
   * trae filas irregulares y el motor no puede caerse por eso (ni inventar columnas nuevas a
   * mitad de archivo, que rompería el determinismo del esquema).
   */
  agregarFila(celdas: readonly string[]): void {
    for (let i = 0; i < this.acumuladores.length; i++) {
      this.acumuladores[i].agregar(celdas[i] ?? "");
    }
    this.filas++;
  }

  finalizar(): TablaColumnar {
    return {
      columnas: this.acumuladores.map((a) => a.finalizar()),
      filas: this.filas,
    };
  }
}

/**
 * Rehace la columna con los valores nuevos, deduplicando.
 *
 * `valoresNuevos` viene en paralelo al diccionario viejo, así que el mapeo viejo→nuevo es directo y
 * las filas solo pagan una lectura de índice: nunca se recorre el texto por fila.
 *
 * **Re-deduplicar no es cosmético.** Transformar junta valores —40 edades distintas caen en 5
 * rangos— y si el diccionario conservara las 40 entradas, la cardinalidad de la columna mentiría. De
 * la cardinalidad salen las clases de equivalencia, o sea el riesgo. Restaurar hace el camino
 * contrario y necesita lo mismo por la razón simétrica: un seudónimo colisionado que vuelve a dos
 * originales **separa** valores que estaban juntos.
 *
 * Vive aquí, y no en `tecnicas/`, porque es una operación de la representación y la usan los dos
 * motores que la recorren: el de transformación (S2) y el de restauración (S3).
 */
export function reconstruirColumna(
  original: ColumnaColumnar,
  valoresNuevos: readonly string[],
): ColumnaColumnar {
  const indice = new Map<string, number>([["", CODIGO_VACIO]]);
  const valores: string[] = [""];
  const viejoANuevo = new Uint32Array(valoresNuevos.length);

  for (let v = 0; v < valoresNuevos.length; v++) {
    const nuevo = valoresNuevos[v];
    let codigo = indice.get(nuevo);
    if (codigo === undefined) {
      codigo = valores.length;
      valores.push(nuevo);
      indice.set(nuevo, codigo);
    }
    viejoANuevo[v] = codigo;
  }

  const codigos = new Uint32Array(original.codigos.length);
  let noVacios = 0;
  for (let f = 0; f < codigos.length; f++) {
    const codigo = viejoANuevo[original.codigos[f]];
    codigos[f] = codigo;
    if (codigo !== CODIGO_VACIO) noVacios++;
  }

  return { nombre: original.nombre, codigos, valores, noVacios };
}

/** Valor de una celda por (columna, fila). */
export function valorEn(columna: ColumnaColumnar, fila: number): string {
  return columna.valores[columna.codigos[fila]];
}

/** Cardinalidad: valores distintos NO vacíos de la columna. */
export function cardinalidad(columna: ColumnaColumnar): number {
  return columna.valores.length - 1;
}
