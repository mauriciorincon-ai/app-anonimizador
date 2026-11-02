// JSON propio (S6) — el tokenizador y el analizador de registros.
//
// Por qué no `JSON.parse`: (1) reordena las claves que parecen enteros (`{"2":…,"1":…}` sale con la
// 1 primero) y el archivo de salida tiene que conservar el orden del original; (2) pasa los números
// por un `double` y pierde todo lo que pasa de 2^53 (`12345678901234567890` se vuelve
// `12345678901234567000`: un identificador alterado en silencio); (3) sus mensajes de error CITAN el
// contenido, y un error de Velo jamás cita un dato del usuario. Aquí los números se conservan como
// TEXTO CRUDO y el error es una clave con un número de línea, nada más.
//
// Gramática: RFC 8259 estricta. Sin comas finales, sin comentarios, sin `NaN`/`Infinity`, sin ceros
// a la izquierda, sin comillas simples, sin caracteres de control sin escapar dentro de una cadena.
//
// Dos capas:
//   • `Tokenizador` parte el texto en tokens ATÓMICOS. Recibe el texto por trozos de cualquier
//     tamaño: un token (o un `\uXXXX`, o la mitad de un par sustituto) puede quedar cortado entre
//     dos trozos, y entonces el tokenizador devuelve «pendiente» y espera el siguiente.
//   • `AnalizadorDeRegistros` es la máquina de estados que entiende la forma (arreglo de objetos o
//     JSON Lines), cuenta líneas, aplica los topes y avisa a un visitante de lo que va viendo. Es
//     ITERATIVA (una pila de estados, no recursión): una bomba de 100.000 niveles se corta en el
//     nivel 33 sin tocar la pila de llamadas.

import {
  ErrorDeJson,
  type FormaJson,
  type MotivoJson,
  type TopesJson,
} from "./tipos";

// ── Tipos de token ────────────────────────────────────────────────────────────────────────────
export const T_PENDIENTE = -1;
export const T_FIN = 0;
export const T_LLAVE_A = 1;
export const T_LLAVE_C = 2;
export const T_CORCHETE_A = 3;
export const T_CORCHETE_C = 4;
export const T_DOS_PUNTOS = 5;
export const T_COMA = 6;
export const T_CADENA = 7;
export const T_NUMERO = 8;
export const T_VERDADERO = 9;
export const T_FALSO = 10;
export const T_NULO = 11;

function esDigito(c: number): boolean {
  return c >= 48 && c <= 57;
}

function esHexadecimal(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/** Deshace los escapes de una cadena YA validada por el tokenizador (sin las comillas). */
function decodificar(crudo: string): string {
  let resultado = "";
  let desde = 0;
  for (;;) {
    const barra = crudo.indexOf("\\", desde);
    if (barra < 0) return resultado + crudo.slice(desde);
    resultado += crudo.slice(desde, barra);
    const e = crudo.charCodeAt(barra + 1);
    switch (e) {
      case 110: // n
        resultado += "\n";
        break;
      case 116: // t
        resultado += "\t";
        break;
      case 114: // r
        resultado += "\r";
        break;
      case 98: // b
        resultado += "\b";
        break;
      case 102: // f
        resultado += "\f";
        break;
      case 117: // u
        resultado += String.fromCharCode(
          parseInt(crudo.slice(barra + 2, barra + 6), 16),
        );
        desde = barra + 6;
        continue;
      default: // " \ /
        resultado += crudo[barra + 1];
    }
    desde = barra + 2;
  }
}

// ── Tokenizador ───────────────────────────────────────────────────────────────────────────────
export class Tokenizador {
  /** El token que acaba de devolver `siguiente()`: su tipo y dónde está en el búfer. */
  inicio = 0;
  final = 0;
  /** Para una cadena: ¿llevaba escapes? (si no, su valor es el trozo tal cual). */
  conEscape = false;
  /** Línea (1-based) donde EMPIEZA el token actual. */
  lineaDelToken = 1;
  /** Línea por la que va el tokenizador. */
  linea = 1;

  private buf = "";
  private pos = 0;
  private terminado = false;
  private porRevisarBom = true;
  /** Una cadena sin cerrar recuerda hasta dónde ya se validó, para no repasarla en cada trozo. */
  private avanceDeCadena = 0;
  private cadenaConEscape = false;
  private readonly maxCrudo: number;
  private readonly maxNumero: number;

  constructor(topes: TopesJson) {
    // Una cadena puede ocupar hasta 6 caracteres crudos por carácter real (`A`). Pasarse de esto
    // es excederse del tope de largo, y se corta ANTES de acumular una cadena sin fin en memoria.
    this.maxCrudo = Math.max(topes.largoDeTexto, topes.largoDeClave) * 6 + 2;
    this.maxNumero = topes.largoDeTexto;
  }

  alimentar(texto: string): void {
    if (texto.length === 0) return;
    this.buf =
      this.pos >= this.buf.length ? texto : this.buf.slice(this.pos) + texto;
    this.pos = 0;
    if (this.porRevisarBom) {
      this.porRevisarBom = false;
      if (this.buf.charCodeAt(0) === 0xfeff) this.pos = 1;
    }
  }

  /** No llegará más texto: lo que quede pendiente ya no se completa. */
  terminar(): void {
    this.terminado = true;
  }

  private invalido(): ErrorDeJson {
    return new ErrorDeJson("json-invalido", this.linea);
  }

  private excede(): ErrorDeJson {
    return new ErrorDeJson("json-excede-tope", this.linea);
  }

  /** El texto crudo del token actual (con comillas y escapes si es una cadena). */
  texto(): string {
    return this.buf.slice(this.inicio, this.final);
  }

  /** Para una cadena: su largo crudo, sin comillas. */
  largoCrudo(): number {
    return this.final - this.inicio - 2;
  }

  /** Para una cadena: su valor, con los escapes deshechos. */
  cadena(): string {
    const crudo = this.buf.slice(this.inicio + 1, this.final - 1);
    return this.conEscape ? decodificar(crudo) : crudo;
  }

  /** Devuelve el tipo del siguiente token, `T_PENDIENTE` si falta texto, o `T_FIN`. */
  siguiente(): number {
    const buf = this.buf;
    const n = buf.length;
    let pos = this.pos;
    while (pos < n) {
      const c = buf.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 13) pos++;
      else if (c === 10) {
        pos++;
        this.linea++;
      } else break;
    }
    this.pos = pos;
    this.lineaDelToken = this.linea;
    if (pos >= n) return this.terminado ? T_FIN : T_PENDIENTE;

    switch (buf.charCodeAt(pos)) {
      case 123:
        return this.puntuacion(T_LLAVE_A, pos);
      case 125:
        return this.puntuacion(T_LLAVE_C, pos);
      case 91:
        return this.puntuacion(T_CORCHETE_A, pos);
      case 93:
        return this.puntuacion(T_CORCHETE_C, pos);
      case 58:
        return this.puntuacion(T_DOS_PUNTOS, pos);
      case 44:
        return this.puntuacion(T_COMA, pos);
      case 34:
        return this.leerCadena(pos);
      case 116:
        return this.leerLiteral(pos, "true", T_VERDADERO);
      case 102:
        return this.leerLiteral(pos, "false", T_FALSO);
      case 110:
        return this.leerLiteral(pos, "null", T_NULO);
      default: {
        const c = buf.charCodeAt(pos);
        if (c === 45 || esDigito(c)) return this.leerNumero(pos);
        throw this.invalido();
      }
    }
  }

  private puntuacion(tipo: number, pos: number): number {
    return this.token(tipo, pos, 1);
  }

  /** Fija el token actual: `largo` caracteres desde `pos`. */
  private token(tipo: number, pos: number, largo: number): number {
    this.inicio = pos;
    this.final = pos + largo;
    this.pos = pos + largo;
    return tipo;
  }

  private leerLiteral(pos: number, texto: string, tipo: number): number {
    const buf = this.buf;
    const disponibles = buf.length - pos;
    const comparar = Math.min(texto.length, disponibles);
    for (let k = 0; k < comparar; k++) {
      if (buf.charCodeAt(pos + k) !== texto.charCodeAt(k))
        throw this.invalido();
    }
    if (disponibles < texto.length) {
      if (this.terminado) throw this.invalido();
      return T_PENDIENTE;
    }
    return this.token(tipo, pos, texto.length);
  }

  private leerCadena(pos: number): number {
    const buf = this.buf;
    const n = buf.length;
    let i = pos + 1 + this.avanceDeCadena;
    let conEscape = this.cadenaConEscape;
    while (i < n) {
      const c = buf.charCodeAt(i);
      if (c === 34) {
        if (i + 1 - pos > this.maxCrudo) throw this.excede();
        this.inicio = pos;
        this.final = i + 1;
        this.pos = i + 1;
        this.conEscape = conEscape;
        this.avanceDeCadena = 0;
        this.cadenaConEscape = false;
        return T_CADENA;
      }
      if (c === 92) {
        conEscape = true;
        if (i + 1 >= n) break; // la barra es lo último que hay: el escape sigue en el próximo trozo
        const e = buf.charCodeAt(i + 1);
        if (e === 117) {
          const disponibles = Math.min(4, n - i - 2);
          for (let k = 0; k < disponibles; k++) {
            if (!esHexadecimal(buf.charCodeAt(i + 2 + k)))
              throw this.invalido();
          }
          if (disponibles < 4) break;
          i += 6;
          continue;
        }
        if (
          e === 34 ||
          e === 92 ||
          e === 47 ||
          e === 98 ||
          e === 102 ||
          e === 110 ||
          e === 114 ||
          e === 116
        ) {
          i += 2;
          continue;
        }
        throw this.invalido();
      }
      if (c < 32) throw this.invalido(); // un salto de línea o tabulador SIN escapar
      i++;
    }
    // No se cerró dentro de este búfer.
    if (this.terminado) throw this.invalido();
    if (i - pos > this.maxCrudo) throw this.excede();
    this.avanceDeCadena = i - pos - 1;
    this.cadenaConEscape = conEscape;
    return T_PENDIENTE;
  }

  private leerNumero(pos: number): number {
    const buf = this.buf;
    const n = buf.length;
    let i = pos;
    while (i < n) {
      const c = buf.charCodeAt(i);
      if (
        esDigito(c) ||
        c === 46 ||
        c === 101 ||
        c === 69 ||
        c === 43 ||
        c === 45
      )
        i++;
      else break;
    }
    if (i - pos > this.maxNumero) throw this.excede();
    // Un número que llega hasta el final del búfer puede seguir en el próximo trozo.
    if (i >= n && !this.terminado) return T_PENDIENTE;

    // -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
    let j = pos;
    if (buf.charCodeAt(j) === 45) j++;
    if (j >= i) throw this.invalido();
    const primero = buf.charCodeAt(j);
    if (primero === 48) j++;
    else if (primero >= 49 && primero <= 57) {
      j++;
      while (j < i && esDigito(buf.charCodeAt(j))) j++;
    } else throw this.invalido();
    if (j < i && buf.charCodeAt(j) === 46) {
      j++;
      const desde = j;
      while (j < i && esDigito(buf.charCodeAt(j))) j++;
      if (j === desde) throw this.invalido();
    }
    if (j < i && (buf.charCodeAt(j) === 101 || buf.charCodeAt(j) === 69)) {
      j++;
      if (j < i && (buf.charCodeAt(j) === 43 || buf.charCodeAt(j) === 45)) j++;
      const desde = j;
      while (j < i && esDigito(buf.charCodeAt(j))) j++;
      if (j === desde) throw this.invalido();
    }
    if (j !== i) throw this.invalido();
    return this.token(T_NUMERO, pos, i - pos);
  }
}

// ── Analizador de registros ───────────────────────────────────────────────────────────────────

/**
 * Lo que el analizador cuenta mientras lee. El texto de lo que se ve (claves, valores) lo pide el
 * visitante al tokenizador en el momento: el búfer se recompone con el próximo trozo.
 */
export interface VisitanteDeJson {
  /** Empieza un registro: el `{` del objeto de primer nivel ya se vio. */
  inicioDeRegistro(): void;
  /** Termina un registro: su `}` ya llegó por `cerrarObjeto`. */
  finDeRegistro(): void;
  /** Una clave (sin escapes). Su texto crudo, con comillas, es `tokenizador.texto()`. */
  clave(clave: string): void;
  /** Un objeto ANIDADO (el del registro no pasa por aquí). */
  abrirObjeto(): void;
  /** Cierra un objeto, el del registro incluido (`finDeRegistro` viene después). */
  cerrarObjeto(): void;
  abrirLista(): void;
  cerrarLista(): void;
  /** Una coma entre dos elementos de un objeto o una lista. */
  coma(): void;
  /** Un valor suelto: `T_CADENA`, `T_NUMERO`, `T_VERDADERO`, `T_FALSO` o `T_NULO`. */
  escalar(tipo: number): void;
}

// Estado del nivel superior (fuera de los registros).
const TOP_INICIO = 0;
const TOP_ARR_PRIMERO = 1; // después de `[`: un registro o el cierre
const TOP_ARR_ELEMENTO = 2; // después de una coma: un registro
const TOP_ARR_COMA = 3; // después de un registro: coma o cierre
const TOP_FUERA = 4; // después del `]`: solo espacio
const TOP_LINEAS = 5; // entre registros de JSON Lines

// Estado de un nivel DENTRO de un registro.
const F_OBJ_INICIO = 10; // `{` recién abierta: una clave o el cierre
const F_OBJ_CLAVE = 11; // después de una coma: una clave
const F_OBJ_DOS_PUNTOS = 12;
const F_OBJ_VALOR = 13;
const F_OBJ_COMA = 14; // después de un valor: coma o cierre
const F_LST_INICIO = 20; // `[` recién abierto: un valor o el cierre
const F_LST_VALOR = 21; // después de una coma: un valor
const F_LST_COMA = 22;

function esEscalar(tipo: number): boolean {
  return tipo >= T_CADENA && tipo <= T_NULO;
}

export class AnalizadorDeRegistros {
  forma: FormaJson | null = null;
  registros = 0;
  /** El nivel más profundo que se vio (el objeto del registro es el nivel 1). */
  profundidadMaxima = 0;

  private readonly tok: Tokenizador;
  private readonly visitante: VisitanteDeJson;
  private readonly topes: TopesJson;
  private readonly pila: Uint8Array;
  private prof = 0;
  private estadoTop = TOP_INICIO;
  private esLineas = false;
  private lineaDelRegistro = 0;
  private lineaDeCierre = 0;

  constructor(tok: Tokenizador, visitante: VisitanteDeJson, topes: TopesJson) {
    this.tok = tok;
    this.visitante = visitante;
    this.topes = topes;
    // La pila nunca pasa de `profundidad + 1`: al intentar el nivel siguiente se lanza el error.
    this.pila = new Uint8Array(Math.max(2, topes.profundidad + 2));
  }

  alimentar(texto: string): void {
    this.tok.alimentar(texto);
    this.procesar();
  }

  /** No hay más texto: lo que falte por cerrar es un archivo cortado. */
  terminar(): void {
    this.tok.terminar();
    this.procesar();
  }

  private fallar(motivo: MotivoJson): never {
    throw new ErrorDeJson(motivo, this.tok.lineaDelToken);
  }

  private procesar(): void {
    const tok = this.tok;
    for (;;) {
      const tipo = tok.siguiente();
      if (tipo === T_PENDIENTE) return;
      this.consumir(tipo);
      if (tipo === T_FIN) return;
    }
  }

  private consumir(tipo: number): void {
    if (this.prof === 0) {
      this.consumirNivelSuperior(tipo);
      return;
    }
    // JSON Lines: un registro es UNA línea. El objeto envuelto de un JSON pretty-printed
    // (`{\n "a": 1\n}`) cae aquí en su primera línea y se dice lo que es: no es una lista de registros.
    if (
      this.esLineas &&
      tipo !== T_FIN &&
      this.tok.lineaDelToken !== this.lineaDelRegistro
    ) {
      this.fallar(
        this.registros === 0 ? "json-no-es-registros" : "json-invalido",
      );
    }
    const pila = this.pila;
    const estado = pila[this.prof];
    switch (estado) {
      case F_OBJ_INICIO:
        if (tipo === T_CADENA) return this.clave();
        if (tipo === T_LLAVE_C) return this.cerrarObjeto();
        return this.fallar("json-invalido");
      case F_OBJ_CLAVE:
        if (tipo === T_CADENA) return this.clave();
        return this.fallar("json-invalido");
      case F_OBJ_DOS_PUNTOS:
        if (tipo !== T_DOS_PUNTOS) return this.fallar("json-invalido");
        pila[this.prof] = F_OBJ_VALOR;
        return;
      case F_OBJ_VALOR:
        return this.valor(tipo, F_OBJ_COMA);
      case F_OBJ_COMA:
        if (tipo === T_COMA) {
          this.visitante.coma();
          pila[this.prof] = F_OBJ_CLAVE;
          return;
        }
        if (tipo === T_LLAVE_C) return this.cerrarObjeto();
        return this.fallar("json-invalido");
      case F_LST_INICIO:
        if (tipo === T_CORCHETE_C) return this.cerrarLista();
        return this.valor(tipo, F_LST_COMA);
      case F_LST_VALOR:
        return this.valor(tipo, F_LST_COMA);
      default: // F_LST_COMA
        if (tipo === T_COMA) {
          this.visitante.coma();
          pila[this.prof] = F_LST_VALOR;
          return;
        }
        if (tipo === T_CORCHETE_C) return this.cerrarLista();
        return this.fallar("json-invalido");
    }
  }

  private clave(): void {
    const tok = this.tok;
    if (
      tok.largoCrudo() > this.topes.largoDeClave &&
      tok.cadena().length > this.topes.largoDeClave
    ) {
      this.fallar("json-excede-tope");
    }
    this.visitante.clave(tok.cadena());
    this.pila[this.prof] = F_OBJ_DOS_PUNTOS;
  }

  /** Un valor donde se esperaba uno; `despues` es el estado del contenedor cuando el valor termine. */
  private valor(tipo: number, despues: number): void {
    const tok = this.tok;
    if (tipo === T_LLAVE_A) {
      this.pila[this.prof] = despues;
      this.abrir(F_OBJ_INICIO);
      this.visitante.abrirObjeto();
    } else if (tipo === T_CORCHETE_A) {
      this.pila[this.prof] = despues;
      this.abrir(F_LST_INICIO);
      this.visitante.abrirLista();
    } else if (esEscalar(tipo)) {
      if (
        tipo === T_CADENA &&
        tok.largoCrudo() > this.topes.largoDeTexto &&
        tok.cadena().length > this.topes.largoDeTexto
      ) {
        this.fallar("json-excede-tope");
      }
      this.pila[this.prof] = despues;
      this.visitante.escalar(tipo);
    } else {
      this.fallar("json-invalido");
    }
  }

  private abrir(estadoInicial: number): void {
    if (++this.prof > this.topes.profundidad)
      this.fallar("json-demasiado-profundo");
    if (this.prof > this.profundidadMaxima) this.profundidadMaxima = this.prof;
    this.pila[this.prof] = estadoInicial;
  }

  private cerrarObjeto(): void {
    this.visitante.cerrarObjeto();
    this.prof--;
    if (this.prof === 0) {
      this.visitante.finDeRegistro();
      this.registros++;
      this.lineaDeCierre = this.tok.lineaDelToken;
      this.estadoTop = this.esLineas ? TOP_LINEAS : TOP_ARR_COMA;
    }
  }

  private cerrarLista(): void {
    this.visitante.cerrarLista();
    this.prof--;
  }

  private empezarRegistro(): void {
    this.prof = 0;
    this.abrir(F_OBJ_INICIO);
    this.lineaDelRegistro = this.tok.lineaDelToken;
    this.visitante.inicioDeRegistro();
  }

  /** Lo que se ve fuera de un registro: la forma del archivo. */
  private consumirNivelSuperior(tipo: number): void {
    switch (this.estadoTop) {
      case TOP_INICIO:
        if (tipo === T_LLAVE_A) {
          this.forma = "lineas";
          this.esLineas = true;
          return this.empezarRegistro();
        }
        if (tipo === T_CORCHETE_A) {
          this.forma = "arreglo";
          this.estadoTop = TOP_ARR_PRIMERO;
          return;
        }
        // Un valor suelto es JSON válido, pero no es una lista de registros.
        if (esEscalar(tipo)) this.fallar("json-no-es-registros");
        return this.fallar("json-invalido");
      case TOP_ARR_PRIMERO:
        if (tipo === T_LLAVE_A) return this.empezarRegistro();
        // `[]` (nada que tratar), un valor suelto o una lista dentro de la lista.
        if (tipo === T_CORCHETE_C || tipo === T_CORCHETE_A || esEscalar(tipo))
          this.fallar("json-no-es-registros");
        return this.fallar("json-invalido");
      case TOP_ARR_ELEMENTO:
        if (tipo === T_LLAVE_A) return this.empezarRegistro();
        if (tipo === T_CORCHETE_A || esEscalar(tipo))
          this.fallar("json-no-es-registros");
        return this.fallar("json-invalido"); // incluye `,]`: la coma final
      case TOP_ARR_COMA:
        if (tipo === T_COMA) {
          this.estadoTop = TOP_ARR_ELEMENTO;
          return;
        }
        if (tipo === T_CORCHETE_C) {
          this.estadoTop = TOP_FUERA;
          return;
        }
        return this.fallar("json-invalido");
      case TOP_FUERA:
        // Tras el `]` solo cabe espacio en blanco: lo único que sigue válido es el fin.
        if (tipo === T_FIN) return;
        return this.fallar("json-invalido");
      default: // TOP_LINEAS
        if (tipo === T_FIN) return;
        // Algo más en la MISMA línea donde cerró el registro anterior es basura al final de la línea.
        if (this.tok.lineaDelToken === this.lineaDeCierre)
          this.fallar("json-invalido");
        if (tipo === T_LLAVE_A) return this.empezarRegistro();
        if (tipo === T_CORCHETE_A || esEscalar(tipo))
          this.fallar("json-no-es-registros");
        return this.fallar("json-invalido");
    }
  }
}
