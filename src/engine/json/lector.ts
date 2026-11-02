// El lector de JSON (S6) — la primera pasada.
//
// Lee el archivo UNA vez, en streaming, y lo vuelve una tabla columnar DISPERSA: una columna por cada
// ruta de valores sueltos (`paciente.contacto.correo`), en el orden en que se descubrieron, con las
// celdas de los registros donde esa ruta no existe vacías. Junto a la tabla viaja, por columna, la
// CLASE de cada celda (ausente, texto, número, `true`, `false`, `null`): la tabla solo guarda
// cadenas, y sin la clase el escritor no podría distinguir un `null` de una clave ausente ni un `42`
// de un `"42"`.
//
// Las listas (`contactos[]`) NO son columnas y no se aplanan en silencio: se declaran en
// `estructura.noTratadas` con los nombres de campo que traen, y la segunda pasada las copia tal cual.
//
// El archivo se lee por la `FuenteDeTexto`, que el worker implementa con `File.slice` y un
// `TextDecoder` estricto; este módulo no sabe de bytes, de huellas ni de la página. Lo único que
// lanza es `ErrorDeJson`, y jamás con contenido del archivo.

import { ConstructorColumnarDisperso, type TablaColumnar } from "../columnar";
import {
  Esquema,
  BIT_DE_TIPO,
  type ListaDeEsquema,
  type NodoDeEsquema,
  type NodoDePista,
} from "./esquema";
import {
  AnalizadorDeRegistros,
  T_CADENA,
  T_FALSO,
  T_NUMERO,
  T_VERDADERO,
  Tokenizador,
  type VisitanteDeJson,
} from "./tokenizador";
import {
  CLASE_DE_CELDA,
  ErrorDeJson,
  TOPES_JSON,
  type EstructuraJson,
  type MotivoJson,
  type TopesJson,
} from "./tipos";

/**
 * El texto del archivo, decodificado. Cada llamada empieza DESDE EL PRINCIPIO y entrega trozos de
 * cualquier tamaño: un token, un `\uXXXX` o un par sustituto pueden quedar partidos entre dos trozos.
 * La segunda pasada llama otra vez a la misma fuente.
 */
export type FuenteDeTexto = () => AsyncIterable<string>;

export interface LecturaJson {
  /** Una columna por ruta de valores sueltos, en orden de descubrimiento; cada una trae `ruta`. */
  readonly tabla: TablaColumnar;
  /** Por columna, un valor de `ClaseDeCelda` por registro. */
  readonly clases: readonly Uint8Array[];
  readonly estructura: EstructuraJson;
}

// Tipos de marco de la pila del visitante.
const M_OBJETO = 0; // un objeto fuera de las listas (el del registro incluido)
const M_OBJETO_DE_LISTA = 1; // un objeto dentro de una lista
const M_LISTA = 2; // una lista (sus elementos no se tratan)

class VisitanteDeLectura implements VisitanteDeJson {
  private readonly tok: Tokenizador;
  private readonly topes: TopesJson;
  private readonly constructorDeTabla: ConstructorColumnarDisperso;
  private readonly esquema: Esquema;
  private readonly lineaActual: () => number;

  private readonly tipoDeMarco: Uint8Array;
  private readonly nodoDeMarco: Array<NodoDeEsquema | NodoDePista | null>;
  private readonly instanciaDeMarco: Float64Array;
  private readonly clavesDeMarco: Array<Set<string> | null>;
  private nivel = 0;
  private contadorDeObjetos = 0;

  /** El nodo de la clave que se acaba de leer, a la espera de su valor. */
  private nodoDeClave: NodoDeEsquema | NodoDePista | null = null;
  /** La lista de primer nivel en la que se está (null fuera de una). */
  private listaActual: ListaDeEsquema | null = null;

  constructor(tok: Tokenizador, topes: TopesJson, linea: () => number) {
    this.tok = tok;
    this.topes = topes;
    this.constructorDeTabla = new ConstructorColumnarDisperso(topes.celdas);
    this.esquema = new Esquema(topes.rutas, (motivo) => {
      throw new ErrorDeJson(motivo, linea());
    });
    this.lineaActual = linea;
    const tamano = Math.max(2, topes.profundidad + 2);
    this.tipoDeMarco = new Uint8Array(tamano);
    this.nodoDeMarco = new Array(tamano).fill(null);
    this.instanciaDeMarco = new Float64Array(tamano);
    this.clavesDeMarco = new Array(tamano).fill(null);
  }

  private fallar(motivo: MotivoJson): never {
    throw new ErrorDeJson(motivo, this.lineaActual());
  }

  get filas(): number {
    return this.constructorDeTabla.filasCerradas;
  }

  get columnas(): number {
    return this.constructorDeTabla.totalDeColumnas;
  }

  private empujar(
    tipo: number,
    nodo: NodoDeEsquema | NodoDePista,
    instancia: number,
  ): void {
    this.nivel++;
    this.tipoDeMarco[this.nivel] = tipo;
    this.nodoDeMarco[this.nivel] = nodo;
    this.instanciaDeMarco[this.nivel] = instancia;
    this.clavesDeMarco[this.nivel] = null;
  }

  inicioDeRegistro(): void {
    this.nivel = 0;
    this.listaActual = null;
    this.empujar(M_OBJETO, this.esquema.raiz, ++this.contadorDeObjetos);
  }

  finDeRegistro(): void {
    this.constructorDeTabla.cerrarFila();
    // Registros × rutas es lo que de verdad ocupa la memoria: se corta en cuanto se pasa.
    if (this.filas * this.columnas > this.topes.celdas) {
      this.fallar("json-excede-tope");
    }
  }

  clave(clave: string): void {
    const nivel = this.nivel;
    const instancia = this.instanciaDeMarco[nivel];
    if (this.tipoDeMarco[nivel] === M_OBJETO) {
      const nodo = this.esquema.hijo(
        this.nodoDeMarco[nivel] as NodoDeEsquema,
        clave,
      );
      // Una clave repetida en el mismo objeto no se puede devolver igual: dos lectores la leerían
      // distinto (el primero, el último) y el archivo de salida cambiaría de sentido.
      if (nodo.ultimoPadre === instancia) this.fallar("json-claves-duplicadas");
      nodo.ultimoPadre = instancia;
      this.nodoDeClave = nodo;
      return;
    }
    const lista = this.listaActual as ListaDeEsquema;
    const nodo = this.esquema.hijoDePista(
      lista,
      this.nodoDeMarco[nivel] as NodoDePista,
      clave,
    );
    if (nodo.ciego) {
      // Sin nodo propio no hay marca: aquí sí hace falta recordar las claves del objeto.
      const claves = (this.clavesDeMarco[nivel] ??= new Set());
      if (claves.has(clave)) this.fallar("json-claves-duplicadas");
      claves.add(clave);
    } else {
      if (nodo.ultimoPadre === instancia) this.fallar("json-claves-duplicadas");
      nodo.ultimoPadre = instancia;
    }
    this.nodoDeClave = nodo;
  }

  abrirObjeto(): void {
    const nivel = this.nivel;
    const tipo = this.tipoDeMarco[nivel];
    const instancia = ++this.contadorDeObjetos;
    if (tipo === M_OBJETO) {
      const nodo = this.nodoDeClave as NodoDeEsquema;
      nodo.presencia++;
      nodo.tipos |= BIT_DE_TIPO.objeto;
      this.empujar(M_OBJETO, nodo, instancia);
    } else if (tipo === M_OBJETO_DE_LISTA) {
      this.empujar(
        M_OBJETO_DE_LISTA,
        this.nodoDeClave as NodoDePista,
        instancia,
      );
    } else {
      // Un elemento de una lista que es un objeto: los campos cuelgan del nodo de la propia lista.
      const nodo = this.nodoDeMarco[nivel] as NodoDePista;
      this.marcarElementoCompuesto(nodo);
      this.empujar(M_OBJETO_DE_LISTA, nodo, instancia);
    }
  }

  cerrarObjeto(): void {
    this.nivel--;
  }

  abrirLista(): void {
    const nivel = this.nivel;
    const tipo = this.tipoDeMarco[nivel];
    if (tipo === M_OBJETO) {
      const nodo = this.nodoDeClave as NodoDeEsquema;
      nodo.presencia++;
      nodo.tipos |= BIT_DE_TIPO.lista;
      const lista = this.esquema.listaDe(nodo);
      lista.registros++;
      this.listaActual = lista;
      this.empujar(M_LISTA, lista.raiz, 0);
    } else {
      const lista = this.listaActual as ListaDeEsquema;
      let padre: NodoDePista;
      if (tipo === M_OBJETO_DE_LISTA) {
        padre = this.nodoDeClave as NodoDePista;
      } else {
        padre = this.nodoDeMarco[nivel] as NodoDePista;
        this.marcarElementoCompuesto(padre);
      }
      this.empujar(M_LISTA, this.esquema.listaDePista(lista, padre), 0);
    }
  }

  cerrarLista(): void {
    this.nivel--;
    // Si el marco que queda debajo es un objeto de los tratados, la lista que se cerró era la de
    // primer nivel; si es otra lista o un objeto de lista, seguimos dentro de ella.
    if (this.tipoDeMarco[this.nivel] === M_OBJETO) this.listaActual = null;
  }

  coma(): void {
    // Las comas no dicen nada a la lectura.
  }

  escalar(tipo: number): void {
    const nivel = this.nivel;
    const marco = this.tipoDeMarco[nivel];
    if (marco === M_OBJETO_DE_LISTA) {
      this.esquema.registrarPista(
        this.listaActual as ListaDeEsquema,
        this.nodoDeClave as NodoDePista,
      );
      return;
    }
    if (marco === M_LISTA) {
      // Los elementos sueltos de la lista misma no dicen ningún campo: una lista de números no tiene
      // pistas. Los de una lista DENTRO de otra (`m[][]`) sí nombran una ruta distinta.
      const lista = this.listaActual as ListaDeEsquema;
      const nodo = this.nodoDeMarco[nivel] as NodoDePista;
      if (nodo !== lista.raiz) this.esquema.registrarPista(lista, nodo);
      return;
    }

    const nodo = this.nodoDeClave as NodoDeEsquema;
    nodo.presencia++;
    let valor: string;
    let clase: number;
    switch (tipo) {
      case T_CADENA:
        valor = this.tok.cadena();
        clase = CLASE_DE_CELDA.texto;
        nodo.tipos |= BIT_DE_TIPO.texto;
        break;
      case T_NUMERO:
        // El texto CRUDO: `1E3`, `-0`, `12345678901234567890` salen como entraron.
        valor = this.tok.texto();
        clase = CLASE_DE_CELDA.numero;
        nodo.tipos |= BIT_DE_TIPO.numero;
        break;
      case T_VERDADERO:
        valor = "true";
        clase = CLASE_DE_CELDA.verdadero;
        nodo.tipos |= BIT_DE_TIPO.booleano;
        break;
      case T_FALSO:
        valor = "false";
        clase = CLASE_DE_CELDA.falso;
        nodo.tipos |= BIT_DE_TIPO.booleano;
        break;
      default: // null
        valor = "";
        clase = CLASE_DE_CELDA.nulo;
        nodo.tipos |= BIT_DE_TIPO.nulo;
    }

    if (nodo.columna < 0) {
      if (this.columnas >= this.topes.rutas)
        this.fallar("json-demasiado-ancho");
      // La fila en curso ya cuenta: si con la columna nueva se pasa, se corta antes de reservar.
      if ((this.filas + 1) * (this.columnas + 1) > this.topes.celdas) {
        this.fallar("json-excede-tope");
      }
      nodo.columna = this.constructorDeTabla.agregarColumna(
        nodo.ruta,
        nodo.segmentos,
      );
    }
    this.constructorDeTabla.poner(nodo.columna, valor, clase);
  }

  /** Un elemento de la lista de primer nivel que es un objeto o una lista: «lista de objetos». */
  private marcarElementoCompuesto(nodoDeLista: NodoDePista): void {
    const lista = this.listaActual;
    if (lista !== null && nodoDeLista === lista.raiz) lista.conObjetos = true;
  }

  resultado(forma: "arreglo" | "lineas", profundidad: number): LecturaJson {
    const { tabla, clases } = this.constructorDeTabla.finalizar();
    return {
      tabla,
      clases,
      estructura: this.esquema.describir(
        forma,
        tabla.filas,
        profundidad,
        tabla.columnas.length,
      ),
    };
  }
}

/**
 * Primera pasada: el archivo, columna por columna.
 *
 * @throws ErrorDeJson — el único error que sale de aquí, con su motivo y la línea; nunca cita
 *   contenido del archivo.
 */
export async function leerJson(
  fuente: FuenteDeTexto,
  topes: TopesJson = TOPES_JSON,
): Promise<LecturaJson> {
  const tok = new Tokenizador(topes);
  const visitante = new VisitanteDeLectura(tok, topes, () => tok.lineaDelToken);
  const analizador = new AnalizadorDeRegistros(tok, visitante, topes);

  for await (const trozo of fuente()) analizador.alimentar(trozo);
  analizador.terminar();

  // `terminar()` sin error implica que hubo al menos un registro y que la forma quedó fijada.
  return visitante.resultado(
    analizador.forma!,
    analizador.profundidadMaxima,
  );
}
