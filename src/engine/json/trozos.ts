// JSON por pasadas (S9) — la misma lectura y la misma escritura de `lector.ts` y `escritor.ts`, sin
// guardar la tabla.
//
// El alto volumen del S8 (`src/workers/alto-volumen.ts`) trabaja sobre FILAS DE TEXTO en lotes. Un
// JSON tiene que llegar ahí como filas, y volver a salir como JSON con la estructura del original.
// Este módulo pone las tres piezas que faltan, todas puras y sobre texto que llega en trozos:
//
//   · `descubrirJson`: la primera pasada. Recorre el archivo con el MISMO visitante de `leerJson`,
//     pero lo único que guarda son las columnas (las rutas, en el orden en que se descubren) y el
//     diagnóstico. La memoria es la del esquema —acotada por el tope de rutas—, no la del archivo.
//   · `lotesDeJson`: las filas, en lotes. El orden de las columnas es el de la primera pasada
//     (el descubrimiento es determinista); una celda donde la ruta no existe, o es `null`, es "".
//   · `EscritorDeRegistros`: la salida. Recibe, uno a uno, el texto crudo de un registro del original
//     y su fila TRANSFORMADA, y escribe el registro con el MISMO visitante que `escribirJson`. Es lo
//     que hace que por trozos y en memoria den los mismos bytes: no hay dos escritores.
//
// Nada de esto sabe de bytes, huellas ni de la página: la fuente de texto la pone quien llama.

import {
  VisitanteDeLectura,
  type FuenteDeTexto,
  type SumideroDeCeldas,
} from "./lector";
import {
  arbolDeColumnas,
  topesDeEscritura,
  VisitanteDeEscritura,
  type CeldasDeSalida,
} from "./escritor";
import { AnalizadorDeRegistros, Tokenizador } from "./tokenizador";
import {
  CLASE_DE_CELDA,
  ErrorDeJson,
  TOPES_JSON,
  type EstructuraJson,
  type FormaJson,
  type TopesJson,
} from "./tipos";

/**
 * Los topes de la lectura por pasadas: los mismos del lector, menos el de celdas (registros × rutas),
 * que existe porque la tabla vive en memoria y aquí no vive.
 */
export const TOPES_POR_TROZOS: TopesJson = {
  ...TOPES_JSON,
  celdas: Number.MAX_SAFE_INTEGER,
};

/** Porción de texto con la que se alimenta al analizador: acota lo que se acumula de una vez. */
const PORCION = 64 * 1024;

/** Cuántas filas lleva cada lote que sale de `lotesDeJson`. */
export const FILAS_POR_LOTE_DE_JSON = 5_000;

export interface ColumnaDeJson {
  /** La ruta, como se llama la columna: `paciente.contacto.correo`. */
  readonly nombre: string;
  readonly segmentos: readonly string[];
  /**
   * Todas sus celdas con valor son números JSON (`null` y ausente no cuentan; un solo texto o
   * booleano la saca). Es lo mismo que `columnasNumericas` decide en memoria (ADR-011), medido
   * mientras se descubre la columna porque aquí no queda tabla que mirar después.
   */
  readonly numerica: boolean;
}

/** Lo que la primera pasada deja de un JSON: sus columnas y el diagnóstico. No guarda ninguna celda. */
export interface DescripcionDeJson {
  readonly columnas: readonly ColumnaDeJson[];
  readonly estructura: EstructuraJson;
}

class SumideroDeConteo implements SumideroDeCeldas {
  private readonly nombres: { nombre: string; segmentos: readonly string[] }[] =
    [];
  private readonly numeros: number[] = [];
  private readonly otros: boolean[] = [];
  private cerradas = 0;

  get filasCerradas(): number {
    return this.cerradas;
  }
  get totalDeColumnas(): number {
    return this.nombres.length;
  }
  get columnas(): ColumnaDeJson[] {
    return this.nombres.map((c, i) => ({
      ...c,
      numerica: this.numeros[i] > 0 && !this.otros[i],
    }));
  }
  agregarColumna(nombre: string, segmentos: readonly string[]): number {
    this.nombres.push({ nombre, segmentos });
    this.numeros.push(0);
    this.otros.push(false);
    return this.nombres.length - 1;
  }
  poner(columna: number, _valor: string, clase: number): void {
    if (clase === CLASE_DE_CELDA.numero) this.numeros[columna]++;
    else if (clase !== CLASE_DE_CELDA.nulo) this.otros[columna] = true;
  }
  cerrarFila(): void {
    this.cerradas++;
  }
}

class SumideroDeLotes implements SumideroDeCeldas {
  readonly listas: string[][] = [];
  private cerradas = 0;
  private columnas = 0;
  private actual: string[];

  constructor(private readonly ancho: number) {
    this.actual = new Array<string>(ancho).fill("");
  }

  get filasCerradas(): number {
    return this.cerradas;
  }
  get totalDeColumnas(): number {
    return this.columnas;
  }
  agregarColumna(): number {
    return this.columnas++;
  }
  poner(columna: number, valor: string): void {
    this.actual[columna] = valor;
  }
  cerrarFila(): void {
    this.listas.push(this.actual);
    this.actual = new Array<string>(this.ancho).fill("");
    this.cerradas++;
  }
}

function alimentarPorPorciones(
  analizador: AnalizadorDeRegistros,
  trozo: string,
): void {
  for (let desde = 0; desde < trozo.length; desde += PORCION) {
    analizador.alimentar(
      trozo.length <= PORCION ? trozo : trozo.slice(desde, desde + PORCION),
    );
  }
}

/**
 * La primera pasada. Lanza `ErrorDeJson` (y solo ese, jamás con contenido del archivo) ante el
 * mismo JSON inválido que rechaza `leerJson`.
 */
export async function descubrirJson(
  fuente: FuenteDeTexto,
  topes: TopesJson = TOPES_POR_TROZOS,
): Promise<DescripcionDeJson> {
  const tok = new Tokenizador(topes);
  const sumidero = new SumideroDeConteo();
  const visitante = new VisitanteDeLectura(
    tok,
    topes,
    () => tok.lineaDelToken,
    sumidero,
  );
  const analizador = new AnalizadorDeRegistros(tok, visitante, topes);
  for await (const trozo of fuente()) alimentarPorPorciones(analizador, trozo);
  analizador.terminar();
  return {
    columnas: sumidero.columnas,
    estructura: visitante.estructura(
      analizador.forma!,
      analizador.profundidadMaxima,
    ),
  };
}

/**
 * Las filas, en lotes. El primer lote abre con el encabezado (los nombres de las columnas), igual
 * que un CSV. Si el archivo ya no es el que se describió —otras columnas, otro número de
 * registros— lanza `json-invalido`: no se sigue sobre un archivo distinto.
 */
export async function* lotesDeJson(
  fuente: FuenteDeTexto,
  descripcion: DescripcionDeJson,
  filasPorLote: number = FILAS_POR_LOTE_DE_JSON,
  topes: TopesJson = TOPES_POR_TROZOS,
): AsyncGenerator<string[][]> {
  const ancho = descripcion.columnas.length;
  const tok = new Tokenizador(topes);
  const sumidero = new SumideroDeLotes(ancho);
  const visitante = new VisitanteDeLectura(
    tok,
    topes,
    () => tok.lineaDelToken,
    sumidero,
  );
  const analizador = new AnalizadorDeRegistros(tok, visitante, topes);
  let conEncabezado = false;
  const lote = (filas: string[][]): string[][] => {
    if (conEncabezado) return filas;
    conEncabezado = true;
    return [descripcion.columnas.map((c) => c.nombre), ...filas];
  };

  for await (const trozo of fuente()) {
    for (let desde = 0; desde < trozo.length; desde += PORCION) {
      analizador.alimentar(
        trozo.length <= PORCION ? trozo : trozo.slice(desde, desde + PORCION),
      );
      while (sumidero.listas.length >= filasPorLote)
        yield lote(sumidero.listas.splice(0, filasPorLote));
    }
  }
  analizador.terminar();
  if (
    analizador.forma !== descripcion.estructura.forma ||
    sumidero.filasCerradas !== descripcion.estructura.registros ||
    sumidero.totalDeColumnas !== ancho
  ) {
    throw new ErrorDeJson("json-invalido", null);
  }
  if (sumidero.listas.length > 0 || !conEncabezado)
    yield lote(sumidero.listas.splice(0));
}

const COMILLA = 34;
const BARRA = 92;
const LLAVE_ABRE = 123;
const LLAVE_CIERRA = 125;
const CORCHETE_ABRE = 91;
const CORCHETE_CIERRA = 93;

/**
 * El texto crudo de cada registro del original, en orden. Es un recorrido liviano —comillas,
 * escapes y llaves— sobre un archivo que la primera pasada YA validó con el tokenizador de verdad;
 * por eso no vuelve a validar nada: si el archivo cambió, el escritor lo ve (otra estructura u otra
 * cuenta de registros) y la huella de entrada lo confirma.
 */
export async function* registrosCrudos(
  fuente: FuenteDeTexto,
  forma: FormaJson,
): AsyncGenerator<string> {
  // En un arreglo los registros cuelgan del nivel 1 (el `[` de afuera es el 0); en JSON Lines, del 0.
  const base = forma === "arreglo" ? 1 : 0;
  let profundidad = 0;
  let enCadena = false;
  let escape = false;
  let dentro = false;
  let pendiente = "";
  for await (const trozo of fuente()) {
    let inicio = dentro ? 0 : -1;
    for (let i = 0; i < trozo.length; i++) {
      const c = trozo.charCodeAt(i);
      if (enCadena) {
        if (escape) escape = false;
        else if (c === BARRA) escape = true;
        else if (c === COMILLA) enCadena = false;
        continue;
      }
      if (c === COMILLA) enCadena = true;
      else if (c === LLAVE_ABRE) {
        if (!dentro && profundidad === base) {
          dentro = true;
          inicio = i;
        }
        profundidad++;
      } else if (c === CORCHETE_ABRE) profundidad++;
      else if (c === LLAVE_CIERRA || c === CORCHETE_CIERRA) {
        profundidad--;
        if (dentro && profundidad === base) {
          yield pendiente + trozo.slice(inicio, i + 1);
          pendiente = "";
          dentro = false;
        }
      }
    }
    if (dentro) pendiente += trozo.slice(inicio);
  }
}

/**
 * Escribe un JSON registro a registro. `vivas[j]` es la columna de la descripción que trae la
 * posición `j` de cada fila transformada (las suprimidas no están); `numericas`, las columnas
 * (por posición en la descripción) cuyas celdas cambiadas vuelven a ser números (el regreso).
 */
export class EscritorDeRegistros {
  private readonly visitante: VisitanteDeEscritura;
  private readonly analizador: AnalizadorDeRegistros;
  private fila: readonly string[] = [];

  constructor(
    private readonly descripcion: DescripcionDeJson,
    vivas: readonly number[],
    numericas: ReadonlySet<number> = new Set(),
  ) {
    const { columnas, estructura } = descripcion;
    const posicion = new Int32Array(columnas.length).fill(-1);
    vivas.forEach((c, j) => (posicion[c] = j));
    const celdas: CeldasDeSalida = {
      suprimida: (c) => posicion[c] < 0,
      numerica: (c) => numericas.has(c),
      nueva: (c) => this.fila[posicion[c]] ?? "",
    };
    const segmentos = columnas.map((c) => c.segmentos);
    const raiz = arbolDeColumnas(segmentos, (c) => posicion[c] >= 0);
    const topes = topesDeEscritura(estructura.profundidad);
    const tok = new Tokenizador(topes);
    this.visitante = new VisitanteDeEscritura(
      tok,
      segmentos,
      celdas,
      raiz,
      estructura.registros,
      estructura.forma === "arreglo",
      estructura.profundidad,
    );
    this.analizador = new AnalizadorDeRegistros(tok, this.visitante, topes);
  }

  get registrosEscritos(): number {
    return this.visitante.registrosEscritos;
  }

  /** El registro `texto` del original, escrito con lo que dice su fila transformada. */
  registro(texto: string, fila: readonly string[]): string {
    this.fila = fila;
    // Cada registro entra como una línea de JSON Lines: el visitante es el mismo, y la forma de la
    // SALIDA (arreglo o líneas) la decide la descripción, no la manera en que aquí se alimenta.
    // Un registro de un arreglo puede ocupar varias líneas (sangría); en JSON Lines tiene que ser
    // una. Un CR o un LF crudo no puede estar DENTRO de una cadena JSON válida, así que quitarlos
    // solo toca el espacio entre tokens.
    this.analizador.alimentar(texto.replace(/[\r\n]+/g, " ") + "\n");
    return this.visitante.vaciar();
  }

  /** Lo que cierra el archivo, y la comprobación de que no quedó ningún registro sin escribir. */
  cierre(): string {
    if (
      this.visitante.registrosEscritos !== this.descripcion.estructura.registros
    )
      throw new ErrorDeJson("json-invalido", null);
    return this.visitante.cierre();
  }
}

/** Los nombres de las columnas que la bóveda debe marcar como numéricas (ADR-011). */
export function columnasNumericasDeJson(
  descripcion: DescripcionDeJson,
): Set<string> {
  return new Set(
    descripcion.columnas.filter((c) => c.numerica).map((c) => c.nombre),
  );
}
