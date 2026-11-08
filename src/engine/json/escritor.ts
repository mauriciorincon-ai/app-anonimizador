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
//     generalizado a un rango ya no es un número, y escribirlo sin comillas sería mentir. La única
//     excepción la pide el regreso (S7): una columna que en el original era toda números vuelve a
//     escribirse como número cuando lo restaurado es un número JSON válido (`numericas`).
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
  T_CADENA,
  T_FALSO,
  T_NUMERO,
  T_VERDADERO,
  Tokenizador,
  type VisitanteDeJson,
} from "./tokenizador";
import { CLASE_DE_CELDA, ErrorDeJson, type TopesJson } from "./tipos";

/** Tamaño aproximado de cada trozo que sale, y de cada porción de entrada que se procesa de una vez. */
const TAMANO_DE_TROZO = 64 * 1024;
const SIN_TOPE = Number.MAX_SAFE_INTEGER;

/** Un nodo del árbol de columnas con el que se recorre el original. */
export class NodoDeEscritura {
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

/** Un número JSON (RFC 8259, §6), tal cual: lo único que puede escribirse sin comillas. */
const NUMERO_JSON = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * De dónde sale lo que se escribe en cada celda. En memoria es la tabla transformada entera; por
 * pasadas (S9, `./trozos.ts`) es la fila transformada que el alto volumen acaba de entregar. El
 * visitante no sabe cuál de las dos es: eso es lo que hace que los dos caminos den los mismos bytes.
 */
export interface CeldasDeSalida {
  /** ¿La transformación suprimió esta columna? Una columna suprimida no se escribe. */
  suprimida(columna: number): boolean;
  /** Lo que cambió en esta columna vuelve a escribirse como número si lo es (el regreso). */
  numerica(columna: number): boolean;
  /** El valor transformado de la celda en la fila `fila`; "" si quedó vacía. */
  nueva(columna: number, fila: number): string;
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

export class VisitanteDeEscritura implements VisitanteDeJson {
  /** Los registros ya completos (con su separador) que aún no salieron. */
  salida = "";

  private readonly tok: Tokenizador;
  private readonly segmentos: readonly (readonly string[])[];
  private readonly celdas: CeldasDeSalida;
  /** Fila + 1 en la que cada columna tuvo un valor suelto (0 = en ninguna): lo que falta, falta. */
  private readonly vista: Int32Array;
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
    segmentos: readonly (readonly string[])[],
    celdas: CeldasDeSalida,
    raiz: NodoDeEscritura,
    total: number,
    arreglo: boolean,
    profundidad: number,
  ) {
    this.tok = tok;
    this.segmentos = segmentos;
    this.celdas = celdas;
    this.vista = new Int32Array(segmentos.length);
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
      this.nodoDeClave =
        this.nodoDeMarco[this.nivel]!.hijos?.get(clave) ?? null;
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

  escalar(tipo: number): void {
    if (this.tipoDeMarco[this.nivel] !== M_TRATADO) {
      this.registro += this.tok.texto();
      return;
    }
    const nodo = this.nodoDeClave;
    // Un valor suelto donde la primera pasada no vio ninguno: el archivo cambió entre pasadas.
    if (nodo === null || nodo.columna < 0) this.cambio();
    nodo.visto = this.fila + 1;
    this.vista[nodo.columna] = this.fila + 1;
    const pieza = this.celda(nodo.columna, tipo);
    if (pieza !== null) {
      this.emitirClave();
      this.registro += pieza;
    }
  }

  /**
   * Cómo se escribe el valor de la fila en curso, o null si la clave no va. El valor ORIGINAL y su
   * clase se leen del token, igual que los leyó la primera pasada: así no hace falta guardarlos.
   */
  private celda(indice: number, tipo: number): string | null {
    if (this.celdas.suprimida(indice)) return null;
    const nuevo = this.celdas.nueva(indice, this.fila);
    let original: string;
    switch (tipo) {
      case T_CADENA:
        original = this.tok.cadena();
        break;
      case T_NUMERO:
        original = this.tok.texto();
        break;
      case T_VERDADERO:
        original = "true";
        break;
      case T_FALSO:
        original = "false";
        break;
      default: // null
        original = "";
    }
    if (nuevo === original) return this.tok.texto();
    if (nuevo === "") return tipo === T_CADENA ? '""' : "null";
    if (this.celdas.numerica(indice) && NUMERO_JSON.test(nuevo)) return nuevo;
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
      // Con valor en este registro: no falta, y lo que ella dijo ya se escribió.
      if (this.vista[c] === fila + 1) continue;
      if (this.celdas.nueva(c, fila) === "") continue;
      const hijo = nodo.hijos!.get(this.segmentos[c][nodo.nivel])!;
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
      const clave = this.segmentos[c][nivel];
      const grupo = grupos.get(clave);
      if (grupo === undefined) grupos.set(clave, [c]);
      else grupo.push(c);
    }
    const partes: string[] = [];
    for (const [clave, miembros] of grupos) {
      // Una ruta que es valor Y contenedor a la vez: gana el valor, la clave no puede ser las dos.
      const hoja = miembros.find((c) => this.segmentos[c].length === nivel + 1);
      if (hoja !== undefined) {
        partes.push(
          `${JSON.stringify(clave)}:${JSON.stringify(this.celdas.nueva(hoja, this.fila))}`,
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

/** El árbol de columnas: por él se sabe, en cada clave del original, a qué columna corresponde. */
export function arbolDeColumnas(
  segmentosPorColumna: readonly (readonly string[])[],
  etiquetable: (columna: number) => boolean,
): NodoDeEscritura {
  const raiz = new NodoDeEscritura(0);
  segmentosPorColumna.forEach((segmentos, c) => {
    const llena = etiquetable(c);
    let nodo = raiz;
    if (llena) raiz.etiquetables.push(c);
    for (let k = 0; k < segmentos.length; k++) {
      nodo.hijos ??= new Map();
      let hijo = nodo.hijos.get(segmentos[k]);
      if (hijo === undefined) {
        hijo = new NodoDeEscritura(k + 1);
        nodo.hijos.set(segmentos[k], hijo);
      }
      nodo = hijo;
      if (llena && k < segmentos.length - 1) nodo.etiquetables.push(c);
    }
    nodo.columna = c;
  });
  return raiz;
}

export function topesDeEscritura(profundidad: number): TopesJson {
  return {
    rutas: SIN_TOPE,
    celdas: SIN_TOPE,
    profundidad,
    largoDeClave: SIN_TOPE,
    largoDeTexto: SIN_TOPE,
  };
}

/**
 * Segunda pasada: escribe el JSON de salida a partir del original y de la tabla transformada.
 *
 * - `fuente` entrega el MISMO texto que la primera pasada, desde el principio.
 * - `transformada` tiene las mismas filas, en el mismo orden; sus columnas se emparejan POR NOMBRE
 *   con las de `lectura.tabla`, y una columna que falte se considera suprimida.
 * - `numericas` (el regreso): nombres de columna cuyas celdas cambiadas vuelven a ser números.
 *
 * Cada trozo que sale (≈ 64 KB) contiene registros COMPLETOS, así que quien lo codifique a bytes
 * nunca parte un carácter ni un registro. Arreglo: `[\n` + registros separados por `,\n` + `\n]\n`;
 * JSON Lines: un registro y `\n`.
 */
export async function* escribirJson(
  fuente: FuenteDeTexto,
  lectura: LecturaJson,
  transformada: TablaColumnar,
  numericas: ReadonlySet<string> = new Set(),
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

  const segmentos = tabla.columnas.map(
    (original) => original.ruta ?? partirRuta(original.nombre),
  );
  const nuevas = tabla.columnas.map(
    (original) => porNombre.get(original.nombre) ?? null,
  );
  const celdas: CeldasDeSalida = {
    suprimida: (c) => nuevas[c] === null,
    numerica: (c) => numericas.has(tabla.columnas[c].nombre),
    nueva: (c, fila) => {
      const columna = nuevas[c]!;
      return columna.valores[columna.codigos[fila]];
    },
  };
  // Solo las columnas donde la transformación llenó algo que el original no traía se vuelven a
  // mirar al cerrar un objeto: en memoria se sabe de antemano, y es lo que mantiene barato el cierre.
  const raiz = arbolDeColumnas(segmentos, (c) => {
    const nueva = nuevas[c];
    return nueva !== null && llenaCeldasAusentes(clases[c], nueva);
  });

  // La primera pasada ya validó los topes: aquí solo se acota la profundidad a la que se vio.
  const topes = topesDeEscritura(estructura.profundidad);
  const tok = new Tokenizador(topes);
  const visitante = new VisitanteDeEscritura(
    tok,
    segmentos,
    celdas,
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
