// El esquema de un JSON (S6): un árbol de las rutas que se vieron.
//
// El lector lo va armando mientras lee y de él salen tres cosas: qué rutas son columna (las de
// valores sueltos), qué rutas son listas (se declaran, no se tratan) y qué rutas no están en todos
// los registros o cambian de tipo (heterogéneas). No guarda valores: solo claves, conteos y tipos.
//
// Las claves del archivo son DATOS DEL USUARIO, no identificadores del programa: todo se indexa con
// `Map`, nunca con un objeto corriente, para que `__proto__` o `constructor` sean claves como
// cualquier otra y no toquen el prototipo.

import { escaparSegmento, SUFIJO_DE_LISTA } from "./ruta";
import type {
  EstructuraJson,
  FormaJson,
  MotivoJson,
  RutaHeterogenea,
  RutaNoTratada,
  TipoJson,
} from "./tipos";

/** Un tipo por bit: un nodo recuerda con un entero cuáles de ellos tomó. */
export const BIT_DE_TIPO = {
  texto: 1,
  numero: 2,
  booleano: 4,
  nulo: 8,
  objeto: 16,
  lista: 32,
} as const;

/** En orden alfabético: así salen los `tipos` de una ruta heterogénea. */
const TIPOS_ALFABETICOS: ReadonlyArray<readonly [number, TipoJson]> = [
  [BIT_DE_TIPO.booleano, "booleano"],
  [BIT_DE_TIPO.lista, "lista"],
  [BIT_DE_TIPO.nulo, "nulo"],
  [BIT_DE_TIPO.numero, "numero"],
  [BIT_DE_TIPO.objeto, "objeto"],
  [BIT_DE_TIPO.texto, "texto"],
];

/** Cuántas pistas (nombres de campo dentro de una lista) se conservan por lista. */
export const MAXIMO_DE_PISTAS = 8;

/** Un nodo de un árbol de rutas FUERA de las listas: puede ser columna, objeto o las dos cosas. */
export class NodoDeEsquema {
  /** Ruta con escapes (el nombre de la columna si es una). */
  readonly ruta: string;
  /** Las claves sin escapar, de la raíz hasta aquí. */
  readonly segmentos: readonly string[];
  hijos: Map<string, NodoDeEsquema> | null = null;
  lista: ListaDeEsquema | null = null;
  /** Índice de columna, o -1 si este nodo nunca fue un valor suelto. */
  columna = -1;
  /** En cuántos registros apareció. */
  presencia = 0;
  /** Bits de `BIT_DE_TIPO` que tomó. */
  tipos = 0;
  /**
   * Marca del último objeto-padre en el que se vio esta clave: si el mismo padre la vuelve a traer,
   * es una clave duplicada. Es un entero, no un `Set` por objeto: con 500.000 registros, la
   * diferencia es la de leer en segundos o en minutos.
   */
  ultimoPadre = -1;

  constructor(ruta: string, segmentos: readonly string[]) {
    this.ruta = ruta;
    this.segmentos = segmentos;
  }
}

/**
 * Un nodo DENTRO de una lista. Las listas no se tratan: solo se mira qué nombres de campo traen para
 * poder decirle al usuario «esto salió tal cual», así que el árbol es una versión mínima del otro.
 */
export class NodoDePista {
  readonly ruta: string;
  readonly ciego: boolean;
  hijos: Map<string, NodoDePista> | null = null;
  /** El nodo de las listas que cuelgan de este (`…[]`). */
  lista: NodoDePista | null = null;
  ultimoPadre = -1;
  registrado: boolean;

  constructor(ruta: string, ciego = false) {
    this.ruta = ruta;
    this.ciego = ciego;
    this.registrado = ciego;
  }
}

/**
 * Pasado el tope de nodos de una lista, todo lo nuevo cae aquí: no se registra ni se cuenta, pero la
 * lectura sigue (y se sigue validando) sin que un archivo hostil infle la memoria.
 */
export const NODO_CIEGO = new NodoDePista("", true);

/** Una lista vista en algún registro. */
export class ListaDeEsquema {
  /** Con `[]` al final. */
  readonly ruta: string;
  readonly raiz: NodoDePista;
  /** En cuántos registros apareció. */
  registros = 0;
  /** ¿Algún elemento era un objeto o una lista? */
  conObjetos = false;
  /** Hasta `MAXIMO_DE_PISTAS` rutas, ya ordenadas. */
  readonly pistas: string[] = [];
  nodos = 0;

  constructor(ruta: string) {
    this.ruta = ruta;
    this.raiz = new NodoDePista(ruta);
  }
}

export class Esquema {
  readonly raiz = new NodoDeEsquema("", []);
  private nodos = 0;
  private readonly maximoDeNodos: number;
  private readonly maximoDeNodosDeLista: number;
  private readonly fallar: (motivo: MotivoJson) => never;

  /**
   * `rutas` es el tope de columnas. Los nodos que NO son columna (objetos vacíos, contenedores)
   * también cuestan memoria, así que tienen su propio tope, holgado: ocho por cada ruta permitida.
   */
  constructor(rutas: number, fallar: (motivo: MotivoJson) => never) {
    this.maximoDeNodos = rutas * 8;
    this.maximoDeNodosDeLista = rutas;
    this.fallar = fallar;
  }

  hijo(padre: NodoDeEsquema, clave: string): NodoDeEsquema {
    let hijos = padre.hijos;
    if (hijos === null) hijos = padre.hijos = new Map();
    let nodo = hijos.get(clave);
    if (nodo === undefined) {
      if (++this.nodos > this.maximoDeNodos)
        this.fallar("json-demasiado-ancho");
      const segmentos = [...padre.segmentos, clave];
      const ruta =
        padre.ruta === ""
          ? escaparSegmento(clave)
          : `${padre.ruta}.${escaparSegmento(clave)}`;
      nodo = new NodoDeEsquema(ruta, segmentos);
      hijos.set(clave, nodo);
    }
    return nodo;
  }

  /** La lista del nodo (ya contado como nodo: la lista no suma otro al tope). */
  listaDe(nodo: NodoDeEsquema): ListaDeEsquema {
    if (nodo.lista === null) {
      nodo.lista = new ListaDeEsquema(nodo.ruta + SUFIJO_DE_LISTA);
    }
    return nodo.lista;
  }

  /** El nodo de la clave `clave` dentro de un objeto de una lista. */
  hijoDePista(
    lista: ListaDeEsquema,
    padre: NodoDePista,
    clave: string,
  ): NodoDePista {
    if (padre.ciego) return NODO_CIEGO;
    let hijos = padre.hijos;
    if (hijos === null) hijos = padre.hijos = new Map();
    let nodo = hijos.get(clave);
    if (nodo === undefined) {
      if (lista.nodos >= this.maximoDeNodosDeLista) return NODO_CIEGO;
      lista.nodos++;
      nodo = new NodoDePista(`${padre.ruta}.${escaparSegmento(clave)}`);
      hijos.set(clave, nodo);
    }
    return nodo;
  }

  /** El nodo de una lista dentro de una lista (`a[][]`) o de un campo de un elemento (`a[].b[]`). */
  listaDePista(lista: ListaDeEsquema, padre: NodoDePista): NodoDePista {
    if (padre.ciego) return NODO_CIEGO;
    if (padre.lista === null) {
      if (lista.nodos >= this.maximoDeNodosDeLista) return NODO_CIEGO;
      lista.nodos++;
      padre.lista = new NodoDePista(padre.ruta + SUFIJO_DE_LISTA);
    }
    return padre.lista;
  }

  /**
   * Anota una ruta como pista de la lista. Se conservan las 8 menores en orden alfabético: así la
   * respuesta no depende del orden en que aparecieron los campos y la memoria está acotada.
   */
  registrarPista(lista: ListaDeEsquema, nodo: NodoDePista): void {
    if (nodo.registrado) return;
    nodo.registrado = true;
    const pistas = lista.pistas;
    if (pistas.length === MAXIMO_DE_PISTAS) {
      if (nodo.ruta >= pistas[MAXIMO_DE_PISTAS - 1]) return;
      pistas.pop();
    }
    let i = pistas.length;
    while (i > 0 && pistas[i - 1] > nodo.ruta) i--;
    pistas.splice(i, 0, nodo.ruta);
  }

  /** Lo que el diagnóstico enseña, a partir de lo que se vio. */
  describir(
    forma: FormaJson,
    registros: number,
    profundidad: number,
    rutasTratadas: number,
  ): EstructuraJson {
    const noTratadas: RutaNoTratada[] = [];
    const heterogeneas: RutaHeterogenea[] = [];

    const recorrer = (nodo: NodoDeEsquema): void => {
      if (nodo.lista !== null) {
        noTratadas.push({
          ruta: nodo.lista.ruta,
          motivo: nodo.lista.conObjetos ? "lista-de-objetos" : "lista",
          registros: nodo.lista.registros,
          pistas: [...nodo.lista.pistas],
        });
      }
      if (nodo !== this.raiz) {
        const tipos = TIPOS_ALFABETICOS.filter(([bit]) => nodo.tipos & bit).map(
          ([, tipo]) => tipo,
        );
        if (nodo.presencia < registros || tipos.length > 1) {
          heterogeneas.push({
            ruta: nodo.ruta,
            presencia: nodo.presencia,
            tipos,
          });
        }
      }
      if (nodo.hijos !== null)
        for (const hijo of nodo.hijos.values()) recorrer(hijo);
    };
    recorrer(this.raiz);

    return {
      forma,
      registros,
      rutasTratadas,
      noTratadas,
      heterogeneas,
      profundidad,
    };
  }
}
