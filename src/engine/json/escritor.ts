// El escritor de JSON (S6) — la segunda pasada.
//
// Vuelve a leer el original (la fuente entrega el texto otra vez desde el principio) y, registro a
// registro, escribe el que va a la salida. La tabla TRANSFORMADA es la que manda: lo que ella dice
// de cada celda es lo que sale; el original solo aporta la estructura (qué claves, en qué orden, qué
// subárboles no se tocan).
//
// Qué se conserva y qué se declara:
//   • Cada registro sale COMPACTO (sin espacios) y con sus claves en el orden ORIGINAL. Un registro
//     por línea, así que el resultado es JSON Lines válido o un arreglo con un registro por línea.
//   • Una celda que NO cambió se copia con su texto crudo original: `1E3` sigue siendo `1E3`, el
//     número de 20 dígitos no pasa por un `double`, los escapes `é` se quedan como estaban.
//   • Una celda que SÍ cambió sale siempre como TEXTO (`JSON.stringify`): un número seudonimizado o
//     generalizado a un rango ya no es un número, y escribirlo sin comillas sería mentir.
//   • Una celda que quedó vacía sale como lo que era: `null` si era `null` (o un número, un booleano),
//     `""` si era un texto, y NO sale si la clave no existía en ese registro.
//   • Una celda que no existía en el original pero la transformación llenó (Mondrian etiqueta todas
//     las filas de una partición, también las vacías) se AGREGA al final del objeto que la contendría,
//     creando los objetos intermedios que falten, en el orden en que se descubrieron las columnas. Si
//     en ese registro la clave existe como otra cosa (un valor suelto, una lista), no cabe y se omite:
//     lo que no se escribe no revela nada.
//   • Una columna que ya no está en la tabla transformada (suprimida) se omite en todas partes; un
//     objeto cuyos hijos se omitieron todos queda `{}`.
//   • Las listas y los subárboles sin columnas se copian token por token, compactos, sin tocar.
//
// El motor no sabe de huellas ni de bytes: el worker calcula el SHA-256 de lo que lee y comprueba que
// la segunda pasada vio el mismo archivo. Aquí solo se defiende lo evidente: si la estructura que
// llega no es la que se leyó la primera vez, se aborta con `json-invalido`.

import {
  CODIGO_VACIO,
  type ColumnaColumnar,
  type TablaColumnar,
} from "../columnar";
import type { FuenteDeTexto, LecturaJson } from "./lector";
import { partirRuta } from "./ruta";
import {
  AnalizadorDeRegistros,
  Tokenizador,
  type VisitanteDeJson,
} from "./tokenizador";
import { CLASE_DE_CELDA, ErrorDeJson, type TopesJson } from "./tipos";

/** Tamaño aproximado de cada trozo que sale, y de cada porción de entrada que se procesa de una vez. */
const TAMANO_DE_TROZO = 64 * 1024;
const SIN_TOPE = Number.MAX_SAFE_INTEGER;

/** Un nodo del árbol de columnas con el que se recorre el original. */
class NodoDeEscritura {
  readonly nivel: number;
  hijos: Map<string, NodoDeEscritura> | null = null;
  columna = -1;
  /** Fila + 1 en la que este nodo apareció (0 = en ninguna): sirve para saber qué claves faltaron. */
  visto = 0;
  /** Columnas DEBAJO de este nodo con celdas ausentes que la transformación llenó, en orden. */
  etiquetables: number[] = [];

  constructor(nivel: number) {
    this.nivel = nivel;
  }
}

interface ColumnaDeEscritura {
  readonly original: ColumnaColumnar;
  readonly clases: Uint8Array;
  /** La misma columna en la tabla transformada, o null si la transformación la suprimió. */
  readonly transformada: ColumnaColumnar | null;
  readonly segmentos: readonly string[];
}

/** ¿Hay alguna celda que el original no traía y la transformación sí? */
function llenaCeldasAusentes(
  clases: Uint8Array,
  transformada: ColumnaColumnar,
): boolean {
  const codigos = transformada.codigos;
  for (let fila = 0; fila < clases.length; fila++) {
    if (
      clases[fila] === CLASE_DE_CELDA.ausente &&
      codigos[fila] !== CODIGO_VACIO
    ) {
      return true;
    }
  }
  return false;
}

// Marcos de la pila del escritor.
const M_TRATADO = 0; // un objeto cuyas claves se recorren con el árbol de columnas
const M_CRUDO_OBJETO = 1; // un objeto que se copia tal cual
const M_CRUDO_LISTA = 2; // una lista, que se copia tal cual

class VisitanteDeEscritura implements VisitanteDeJson {
  /** Los registros ya completos (con su separador) que aún no salieron. */
  salida = "";

  private readonly tok: Tokenizador;
  private readonly columnas: readonly ColumnaDeEscritura[];
  private readonly raiz: NodoDeEscritura;
  private readonly total: number;
  private readonly arreglo: boolean;

  private registro = "";
  private fila = 0;

  private readonly tipoDeMarco: Uint8Array;
  private readonly nodoDeMarco: Array<NodoDeEscritura | null>;
  /** 1 si el objeto del marco ya escribió alguna clave (la próxima necesita coma antes). */
  private readonly emitidoDeMarco: Uint8Array;
  private nivel = 0;

  private nodoDeClave: NodoDeEscritura | null = null;
  private claveCruda = "";

  constructor(
    tok: Tokenizador,
    columnas: readonly ColumnaDeEscritura[],
    raiz: NodoDeEscritura,
    total: number,
    arreglo: boolean,
    profundidad: number,
  ) {
    this.tok = tok;
    this.columnas = columnas;
    this.raiz = raiz;
    this.total = total;
    this.arreglo = arreglo;
    const tamano = profundidad + 2;
    this.tipoDeMarco = new Uint8Array(tamano);
    this.nodoDeMarco = new Array(tamano).fill(null);
    this.emitidoDeMarco = new Uint8Array(tamano);
  }

  /** Lo que lleva escrito hasta aquí; el generador lo entrega y empieza otro trozo. */
  vaciar(): string {
    const trozo = this.salida;
    this.salida = "";
    return trozo;
  }

  get registrosEscritos(): number {
    return this.fila;
  }

  private empujar(tipo: number, nodo: NodoDeEscritura | null): void {
    this.nivel++;
    this.tipoDeMarco[this.nivel] = tipo;
    this.nodoDeMarco[this.nivel] = nodo;
    this.emitidoDeMarco[this.nivel] = 0;
  }

  private cambio(): never {
    throw new ErrorDeJson("json-invalido", this.tok.lineaDelToken);
  }

  inicioDeRegistro(): void {
    // Más registros que los que se leyeron la primera vez: el archivo no es el mismo.
    if (this.fila >= this.total) this.cambio();
    this.nivel = 0;
    this.registro = "{";
    this.empujar(M_TRATADO, this.raiz);
  }

  finDeRegistro(): void {
    this.salida += this.arreglo
      ? (this.fila === 0 ? "[\n" : ",\n") + this.registro
      : this.registro + "\n";
    this.registro = "";
    this.fila++;
  }

  /** Lo que se escribe al terminar, cuando ya no quedan registros. */
  cierre(): string {
    return this.arreglo ? "\n]\n" : "";
  }

  clave(clave: string): void {
    if (this.tipoDeMarco[this.nivel] === M_TRATADO) {
      this.claveCruda = this.tok.texto();
      this.nodoDeClave = this.nodoDeMarco[this.nivel]!.hijos?.get(clave) ?? null;
    } else {
      this.registro += this.tok.texto() + ":";
    }
  }

  coma(): void {
    // En un objeto tratado la coma la decide `emitirClave`: una clave omitida no deja coma huérfana.
    if (this.tipoDeMarco[this.nivel] !== M_TRATADO) this.registro += ",";
  }

  /** Escribe la clave pendiente (con la coma que le toque) en el objeto tratado en curso. */
  private emitirClave(): void {
    if (this.emitidoDeMarco[this.nivel] === 1) this.registro += ",";
    this.emitidoDeMarco[this.nivel] = 1;
    this.registro += this.claveCruda + ":";
  }

  escalar(): void {
    if (this.tipoDeMarco[this.nivel] !== M_TRATADO) {
      this.registro += this.tok.texto();
      return;
    }
    const nodo = this.nodoDeClave;
    // Un valor suelto donde la primera pasada no vio ninguno: el archivo cambió entre pasadas.
    if (nodo === null || nodo.columna < 0) this.cambio();
    nodo.visto = this.fila + 1;
    const pieza = this.celda(nodo.columna);
    if (pieza !== null) {
      this.emitirClave();
      this.registro += pieza;
    }
  }

  /** Cómo se escribe el valor de la fila en curso, o null si la clave no va. */
  private celda(indice: number): string | null {
    const columna = this.columnas[indice];
    const transformada = columna.transformada;
    if (transformada === null) return null;
    const fila = this.fila;
    const original = columna.original.valores[columna.original.codigos[fila]];
    const nuevo = transformada.valores[transformada.codigos[fila]];
    if (nuevo === original) return this.tok.texto();
    if (nuevo === "") {
      return columna.clases[fila] === CLASE_DE_CELDA.texto ? '""' : "null";
    }
    return JSON.stringify(nuevo);
  }

  abrirObjeto(): void {
    if (this.tipoDeMarco[this.nivel] !== M_TRATADO) {
      this.registro += "{";
      this.empujar(M_CRUDO_OBJETO, null);
      return;
    }
    const nodo = this.nodoDeClave;
    this.emitirClave();
    this.registro += "{";
    if (nodo !== null) nodo.visto = this.fila + 1;
    if (nodo !== null && nodo.hijos !== null) this.empujar(M_TRATADO, nodo);
    else this.empujar(M_CRUDO_OBJETO, null);
  }

  cerrarObjeto(): void {
    if (this.tipoDeMarco[this.nivel] === M_TRATADO) {
      const extras = this.extras(this.nodoDeMarco[this.nivel]!);
      if (extras !== "") {
        if (this.emitidoDeMarco[this.nivel] === 1) this.registro += ",";
        this.registro += extras;
      }
    }
    this.registro += "}";
    this.nivel--;
  }

  abrirLista(): void {
    if (this.tipoDeMarco[this.nivel] === M_TRATADO) {
      const nodo = this.nodoDeClave;
      this.emitirClave();
      if (nodo !== null) nodo.visto = this.fila + 1;
    }
    this.registro += "[";
    this.empujar(M_CRUDO_LISTA, null);
  }

  cerrarLista(): void {
    this.registro += "]";
    this.nivel--;
  }

  /**
   * Las claves que faltaron en este objeto y que la transformación llenó, ya escritas
   * (`"b":{"c":"…"}`), o "" si no hay ninguna. «Faltó» significa: ni la clave ni nada con ese nombre
   * apareció en este objeto del registro.
   */
  private extras(nodo: NodoDeEscritura): string {
    if (nodo.etiquetables.length === 0) return "";
    const fila = this.fila;
    let columnas: number[] | null = null;
    for (const c of nodo.etiquetables) {
      const columna = this.columnas[c];
      if (columna.clases[fila] !== CLASE_DE_CELDA.ausente) continue;
      const transformada = columna.transformada!;
      if (transformada.codigos[fila] === CODIGO_VACIO) continue;
      const hijo = nodo.hijos!.get(columna.segmentos[nodo.nivel])!;
      // Si la clave apareció, o es un objeto (y allí se completará) o es otra cosa: no cabe.
      if (hijo.visto === fila + 1) continue;
      (columnas ??= []).push(c);
    }
    return columnas === null ? "" : this.miembros(columnas, nodo.nivel);
  }

  private miembros(columnas: readonly number[], nivel: number): string {
    // Agrupa por la clave del nivel, en el orden en que se descubrieron las columnas.
    const grupos = new Map<string, number[]>();
    for (const c of columnas) {
      const clave = this.columnas[c].segmentos[nivel];
      const grupo = grupos.get(clave);
      if (grupo === undefined) grupos.set(clave, [c]);
      else grupo.push(c);
    }
    const partes: string[] = [];
    for (const [clave, miembros] of grupos) {
      // Una ruta que es valor Y contenedor a la vez: gana el valor, la clave no puede ser las dos.
      const hoja = miembros.find(
        (c) => this.columnas[c].segmentos.length === nivel + 1,
      );
      if (hoja !== undefined) {
        const transformada = this.columnas[hoja].transformada!;
        partes.push(
          `${JSON.stringify(clave)}:${JSON.stringify(transformada.valores[transformada.codigos[this.fila]])}`,
        );
      } else {
        partes.push(
          `${JSON.stringify(clave)}:{${this.miembros(miembros, nivel + 1)}}`,
        );
      }
    }
    return partes.join(",");
  }
}

/**
 * Segunda pasada: escribe el JSON de salida a partir del original y de la tabla transformada.
 *
 * - `fuente` entrega el MISMO texto que la primera pasada, desde el principio.
 * - `transformada` tiene las mismas filas, en el mismo orden; sus columnas se emparejan POR NOMBRE
 *   con las de `lectura.tabla`, y una columna que falte se considera suprimida.
 *
 * Cada trozo que sale (≈ 64 KB) contiene registros COMPLETOS, así que quien lo codifique a bytes
 * nunca parte un carácter ni un registro. Arreglo: `[\n` + registros separados por `,\n` + `\n]\n`;
 * JSON Lines: un registro y `\n`.
 */
export async function* escribirJson(
  fuente: FuenteDeTexto,
  lectura: LecturaJson,
  transformada: TablaColumnar,
): AsyncGenerator<string> {
  const { tabla, clases, estructura } = lectura;
  if (transformada.filas !== tabla.filas) {
    throw new Error(
      "La tabla transformada no tiene las mismas filas que la leída",
    );
  }

  const porNombre = new Map<string, ColumnaColumnar>();
  for (const columna of transformada.columnas)
    porNombre.set(columna.nombre, columna);

  const raiz = new NodoDeEscritura(0);
  const columnas: ColumnaDeEscritura[] = tabla.columnas.map((original, c) => {
    const nueva = porNombre.get(original.nombre) ?? null;
    return {
      original,
      clases: clases[c],
      transformada: nueva,
      segmentos: original.ruta ?? partirRuta(original.nombre),
    };
  });

  // El árbol de columnas: por él se sabe, en cada clave del original, a qué columna corresponde.
  columnas.forEach((columna, c) => {
    const etiquetable =
      columna.transformada !== null &&
      llenaCeldasAusentes(columna.clases, columna.transformada);
    const segmentos = columna.segmentos;
    let nodo = raiz;
    if (etiquetable) raiz.etiquetables.push(c);
    for (let k = 0; k < segmentos.length; k++) {
      nodo.hijos ??= new Map();
      let hijo = nodo.hijos.get(segmentos[k]);
      if (hijo === undefined) {
        hijo = new NodoDeEscritura(k + 1);
        nodo.hijos.set(segmentos[k], hijo);
      }
      nodo = hijo;
      if (etiquetable && k < segmentos.length - 1) nodo.etiquetables.push(c);
    }
    nodo.columna = c;
  });

  // La primera pasada ya validó los topes: aquí solo se acota la profundidad a la que se vio.
  const topes: TopesJson = {
    rutas: SIN_TOPE,
    celdas: SIN_TOPE,
    profundidad: estructura.profundidad,
    largoDeClave: SIN_TOPE,
    largoDeTexto: SIN_TOPE,
  };
  const tok = new Tokenizador(topes);
  const visitante = new VisitanteDeEscritura(
    tok,
    columnas,
    raiz,
    tabla.filas,
    estructura.forma === "arreglo",
    estructura.profundidad,
  );
  const analizador = new AnalizadorDeRegistros(tok, visitante, topes);

  for await (const trozo of fuente()) {
    // Porciones acotadas: la salida de cada una también lo está, y se puede entregar sin esperar a que
    // termine un trozo de entrada enorme.
    for (let desde = 0; desde < trozo.length; desde += TAMANO_DE_TROZO) {
      analizador.alimentar(
        trozo.length <= TAMANO_DE_TROZO
          ? trozo
          : trozo.slice(desde, desde + TAMANO_DE_TROZO),
      );
      if (visitante.salida.length >= TAMANO_DE_TROZO) yield visitante.vaciar();
    }
  }
  analizador.terminar();

  if (
    analizador.forma !== estructura.forma ||
    visitante.registrosEscritos !== tabla.filas
  ) {
    throw new ErrorDeJson("json-invalido", null);
  }
  const resto = visitante.vaciar() + visitante.cierre();
  if (resto !== "") yield resto;
}
