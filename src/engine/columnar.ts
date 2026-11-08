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
  /**
   * Solo la pone el lector JSON (S6): las claves SIN escapar del camino hasta el valor
   * (`["paciente","contacto","correo"]`; `nombre` es esa ruta con escapes). Una columna de CSV o Excel
   * no la tiene y el clasificador la trata exactamente como siempre; con ella, el clasificador mira
   * la ÚLTIMA clave y no el camino entero, porque `salud.` o `paciente.` son el nombre de un padre,
   * no una descripción de cada hijo.
   */
  readonly ruta?: readonly string[];
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

/**
 * El mismo texto, en memoria propia (S10). PapaParse corta cada celda del trozo de 10 MB con
 * `substring`, y V8 guarda un corte de 13 caracteres o más como una REFERENCIA al trozo entero
 * (`SlicedString`): un solo valor que entra al diccionario mantiene vivos los 10 MB de los que
 * salió. Con una columna casi única de valores largos (una IP, un correo) cada trozo deja uno, y el
 * diccionario acaba reteniendo el archivo entero: medido con el CSV de 5 M de filas, era el grueso
 * del pico de memoria. Concatenar obliga a V8 a copiar el texto a una cadena plana nueva, y el
 * corte de esa copia solo retiene la copia. Se paga una vez por valor DISTINTO, no por celda; el
 * contenido no cambia, así que los bytes de salida tampoco.
 */
export function desprendida(valor: string): string {
  return (" " + valor).slice(1);
}

/**
 * Una columna con más valores distintos que los que se le permiten (S10). El alto volumen arma
 * tablas enteras de millones de filas, y un `Map` de V8 no pasa de 2²⁴ entradas: por encima lanza un
 * `RangeError` sin decir cuál. Con el tope dicho de antemano, la pasada sabe qué no cupo y lo dice
 * con su clave, en vez de caerse con un error genérico.
 */
export class SinCupo extends Error {
  constructor(readonly tope: number) {
    super("sin-cupo");
    this.name = "SinCupo";
  }
}

class AcumuladorDeColumna {
  readonly nombre: string;
  private codigos: Uint32Array;
  private readonly valores: string[] = [""];
  private readonly indice = new Map<string, number>([["", CODIGO_VACIO]]);
  private longitud = 0;
  private noVacios = 0;

  constructor(
    nombre: string,
    capacidad: number,
    private readonly distintosMaximos: number,
  ) {
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
      // `valores[0]` es el vacío: los distintos con contenido son `valores.length - 1`.
      if (this.valores.length > this.distintosMaximos)
        throw new SinCupo(this.distintosMaximos);
      const propio = desprendida(valor);
      codigo = this.valores.length;
      this.valores.push(propio);
      this.indice.set(propio, codigo);
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

  /**
   * `distintosMaximos`: valores distintos (sin contar el vacío) que admite cada columna; uno más
   * lanza `SinCupo`. Sin él no hay tope: en memoria lo pone antes el de celdas.
   */
  constructor(
    nombresDeColumna: readonly string[],
    filasEstimadas = CAPACIDAD_INICIAL,
    distintosMaximos = Number.POSITIVE_INFINITY,
  ) {
    this.acumuladores = nombresDeColumna.map(
      (nombre, i) =>
        new AcumuladorDeColumna(
          nombre || `columna_${i + 1}`,
          filasEstimadas,
          distintosMaximos,
        ),
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

// ── Construcción dispersa (JSON) ──────────────────────────────────────────────────────────────
// Un JSON no tiene encabezado: las columnas aparecen según se descubren las rutas, quizá en el
// registro 40.000. Una columna descubierta tarde se rellena hacia atrás con celda vacía (código 0)
// sin trabajo extra: los arreglos tipados nacen en ceros, y cero ES «vacío» (y «ausente» en las
// clases). Solo se escribe lo que existe.

class AcumuladorDisperso {
  readonly nombre: string;
  readonly ruta: readonly string[];
  codigos: Uint32Array;
  clases: Uint8Array;
  private readonly valores: string[] = [""];
  private readonly indice = new Map<string, number>([["", CODIGO_VACIO]]);
  private noVacios = 0;

  constructor(nombre: string, ruta: readonly string[], capacidad: number) {
    this.nombre = nombre;
    this.ruta = ruta;
    this.codigos = new Uint32Array(capacidad);
    this.clases = new Uint8Array(capacidad);
  }

  crecer(capacidad: number): void {
    const codigos = new Uint32Array(capacidad);
    codigos.set(this.codigos);
    this.codigos = codigos;
    const clases = new Uint8Array(capacidad);
    clases.set(this.clases);
    this.clases = clases;
  }

  poner(fila: number, valor: string, clase: number): void {
    let codigo = this.indice.get(valor);
    if (codigo === undefined) {
      const propio = desprendida(valor);
      codigo = this.valores.length;
      this.valores.push(propio);
      this.indice.set(propio, codigo);
    }
    if (codigo !== CODIGO_VACIO) this.noVacios++;
    this.codigos[fila] = codigo;
    this.clases[fila] = clase;
  }

  finalizar(filas: number): { columna: ColumnaColumnar; clases: Uint8Array } {
    this.indice.clear();
    const sobra = this.codigos.length - filas;
    const recortar = sobra > filas / 8;
    const codigos = recortar
      ? this.codigos.slice(0, filas)
      : this.codigos.subarray(0, filas);
    const clases = recortar
      ? this.clases.slice(0, filas)
      : this.clases.subarray(0, filas);
    return {
      columna: {
        nombre: this.nombre,
        ruta: this.ruta,
        codigos,
        valores: this.valores,
        noVacios: this.noVacios,
      },
      clases,
    };
  }
}

/**
 * Construye una tabla columnar celda a celda, con columnas que aparecen sobre la marcha. Cada celda
 * lleva además una `clase` (un byte) que la tabla no guarda: es la memoria de qué ERA el valor
 * (texto, número, `null`, ausente…) para quien lo reescriba después.
 *
 * La capacidad de las filas es una sola para todas las columnas y crece duplicando (O(1)
 * amortizado, sin conocer el total de registros). `celdasMaximas` acota ese crecimiento para que la
 * memoria reservada no se pase del tope de celdas del lector.
 */
export class ConstructorColumnarDisperso {
  private readonly acumuladores: AcumuladorDisperso[] = [];
  private readonly celdasMaximas: number;
  private capacidad = CAPACIDAD_INICIAL;
  private filas = 0;

  constructor(celdasMaximas = Number.POSITIVE_INFINITY) {
    this.celdasMaximas = celdasMaximas;
  }

  get filasCerradas(): number {
    return this.filas;
  }

  get totalDeColumnas(): number {
    return this.acumuladores.length;
  }

  /** Descubre una columna: las filas ya cerradas quedan vacías y «ausentes». Devuelve su índice. */
  agregarColumna(nombre: string, ruta: readonly string[]): number {
    this.acumuladores.push(
      new AcumuladorDisperso(nombre, ruta, this.capacidad),
    );
    return this.acumuladores.length - 1;
  }

  /** Escribe la celda de la fila EN CURSO (la que aún no se cerró). */
  poner(columna: number, valor: string, clase: number): void {
    this.acumuladores[columna].poner(this.filas, valor, clase);
  }

  cerrarFila(): void {
    this.filas++;
    if (this.filas < this.capacidad) return;
    const tope = Math.floor(
      this.celdasMaximas / Math.max(1, this.acumuladores.length),
    );
    const nueva = Math.max(
      this.capacidad + 1,
      Math.min(this.capacidad * 2, tope),
    );
    for (const a of this.acumuladores) a.crecer(nueva);
    this.capacidad = nueva;
  }

  finalizar(): { tabla: TablaColumnar; clases: Uint8Array[] } {
    const columnas: ColumnaColumnar[] = [];
    const clases: Uint8Array[] = [];
    for (const acumulador of this.acumuladores) {
      const { columna, clases: clasesDeLaColumna } = acumulador.finalizar(
        this.filas,
      );
      columnas.push(columna);
      clases.push(clasesDeLaColumna);
    }
    return { tabla: { columnas, filas: this.filas }, clases };
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

  // La ruta (solo existe en las columnas de JSON) sobrevive a la transformación; una columna de CSV
  // no gana la propiedad, así que su forma sigue siendo la de siempre.
  return original.ruta === undefined
    ? { nombre: original.nombre, codigos, valores, noVacios }
    : {
        nombre: original.nombre,
        ruta: original.ruta,
        codigos,
        valores,
        noVacios,
      };
}

/** Valor de una celda por (columna, fila). */
export function valorEn(columna: ColumnaColumnar, fila: number): string {
  return columna.valores[columna.codigos[fila]];
}

/** Cardinalidad: valores distintos NO vacíos de la columna. */
export function cardinalidad(columna: ColumnaColumnar): number {
  return columna.valores.length - 1;
}
