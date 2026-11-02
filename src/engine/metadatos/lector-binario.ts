// Lectura y escritura acotadas de bytes — la base de los lectores de imágenes (S6).
//
// Un archivo que llega a Velo no es de fiar: un largo puede apuntar más allá del final, un
// desplazamiento puede volver hacia atrás, una cuenta puede pedir cuatro mil millones de entradas.
// Aquí cada lectura comprueba que CABE antes de leer y, si no cabe, lanza `ErrorDeMetadatos` con la
// clave del motivo. No se usa `DataView`: su `RangeError` sería un segundo tipo de error, y los
// lectores prometen uno solo.
//
// El texto se decodifica con TOPE: un valor de metadato se guarda con `LARGO_MAXIMO_DE_VALOR`
// caracteres, así que no tiene sentido decodificar un megabyte para quedarse con 512. Se decodifican
// los bytes que alcanzan para pasarse del tope (y saber que se pasó), nada más.

import {
  ErrorDeMetadatos,
  LARGO_MAXIMO_DE_VALOR,
  type MotivoDeMetadatos,
} from "./tipos";

export const ILEGIBLE: MotivoDeMetadatos = "imagen-ilegible";

export function fallar(motivo: MotivoDeMetadatos = ILEGIBLE): never {
  throw new ErrorDeMetadatos(motivo);
}

/** `largo` bytes desde `pos` caben en el búfer. Escrito en positivo para que un `NaN` no pase. */
function exigir(
  bytes: Uint8Array,
  pos: number,
  largo: number,
  motivo: MotivoDeMetadatos,
): void {
  if (!(pos >= 0 && largo >= 0 && pos + largo <= bytes.length)) fallar(motivo);
}

export function u8(
  bytes: Uint8Array,
  pos: number,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  exigir(bytes, pos, 1, motivo);
  return bytes[pos];
}

export function u16be(
  bytes: Uint8Array,
  pos: number,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  exigir(bytes, pos, 2, motivo);
  return (bytes[pos] << 8) | bytes[pos + 1];
}

export function u16le(
  bytes: Uint8Array,
  pos: number,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  exigir(bytes, pos, 2, motivo);
  return bytes[pos] | (bytes[pos + 1] << 8);
}

// Los de 32 bits se arman con una multiplicación y no con `<< 24`: el desplazamiento de JavaScript
// es de 32 bits CON signo, y `0xFF << 24` da un número negativo.
export function u32be(
  bytes: Uint8Array,
  pos: number,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  exigir(bytes, pos, 4, motivo);
  return (
    bytes[pos] * 0x1000000 +
    ((bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3])
  );
}

export function u32le(
  bytes: Uint8Array,
  pos: number,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  exigir(bytes, pos, 4, motivo);
  return (
    bytes[pos + 3] * 0x1000000 +
    ((bytes[pos + 2] << 16) | (bytes[pos + 1] << 8) | bytes[pos])
  );
}

/** Con el orden de bytes como parámetro: TIFF lo declara en su cabecera (`II` o `MM`). */
export function u16(
  bytes: Uint8Array,
  pos: number,
  le: boolean,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  return le ? u16le(bytes, pos, motivo) : u16be(bytes, pos, motivo);
}

export function u32(
  bytes: Uint8Array,
  pos: number,
  le: boolean,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): number {
  return le ? u32le(bytes, pos, motivo) : u32be(bytes, pos, motivo);
}

/** Una vista (sin copia) de `largo` bytes desde `desde`, que tiene que caber entera. */
export function tramo(
  bytes: Uint8Array,
  desde: number,
  largo: number,
  motivo: MotivoDeMetadatos = ILEGIBLE,
): Uint8Array {
  exigir(bytes, desde, largo, motivo);
  return bytes.subarray(desde, desde + largo);
}

/** ¿Los bytes desde `desde` son exactamente `firma`? No lanza: si no caben, no coinciden. */
export function coincide(
  bytes: Uint8Array,
  firma: ArrayLike<number>,
  desde = 0,
): boolean {
  if (desde < 0 || desde + firma.length > bytes.length) return false;
  for (let i = 0; i < firma.length; i++)
    if (bytes[desde + i] !== firma[i]) return false;
  return true;
}

/** Los bytes de un texto ASCII escrito en el código (firmas, nombres de chunk). */
export function ascii(texto: string): Uint8Array {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i) & 0xff;
  return bytes;
}

/** Cuatro bytes como nombre técnico legible; lo que no es ASCII imprimible se vuelve `?`. */
export function nombreTecnico(bytes: Uint8Array): string {
  let nombre = "";
  for (const b of bytes)
    nombre += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "?";
  return nombre.trim();
}

/** Lectura secuencial con la misma garantía: lo que no cabe lanza, y la posición no se mueve. */
export class Cursor {
  constructor(
    readonly bytes: Uint8Array,
    public pos = 0,
    readonly motivo: MotivoDeMetadatos = ILEGIBLE,
  ) {}

  get restantes(): number {
    return this.bytes.length - this.pos;
  }

  u8(): number {
    const v = u8(this.bytes, this.pos, this.motivo);
    this.pos += 1;
    return v;
  }

  u16be(): number {
    const v = u16be(this.bytes, this.pos, this.motivo);
    this.pos += 2;
    return v;
  }

  u32be(): number {
    const v = u32be(this.bytes, this.pos, this.motivo);
    this.pos += 4;
    return v;
  }

  tramo(largo: number): Uint8Array {
    const v = tramo(this.bytes, this.pos, largo, this.motivo);
    this.pos += largo;
    return v;
  }

  saltar(largo: number): void {
    exigir(this.bytes, this.pos, largo, this.motivo);
    this.pos += largo;
  }
}

/**
 * Escritura en un búfer de tamaño FIJO, reservado una sola vez con el tope que el llamador conoce
 * (la entrada más lo poco que una limpieza puede añadir). Pasarse del tope es un error de programa,
 * no del archivo, y por eso lanza el error del lenguaje.
 */
export class Escritor {
  private readonly bytes: Uint8Array;
  private pos = 0;

  constructor(capacidad: number) {
    this.bytes = new Uint8Array(capacidad);
  }

  get largo(): number {
    return this.pos;
  }

  escribir(datos: Uint8Array): void {
    this.bytes.set(datos, this.pos);
    this.pos += datos.length;
  }

  /** Copia `[desde, hasta)` de otro búfer sin crear una vista intermedia. */
  copiar(origen: Uint8Array, desde: number, hasta: number): void {
    this.escribir(origen.subarray(desde, hasta));
  }

  u8(valor: number): void {
    this.bytes[this.pos++] = valor & 0xff;
  }

  u16be(valor: number): void {
    this.u8(valor >>> 8);
    this.u8(valor);
  }

  u32be(valor: number): void {
    this.u8(valor >>> 24);
    this.u8(valor >>> 16);
    this.u8(valor >>> 8);
    this.u8(valor);
  }

  u32le(valor: number): void {
    this.u8(valor);
    this.u8(valor >>> 8);
    this.u8(valor >>> 16);
    this.u8(valor >>> 24);
  }

  /** Reescribe 4 bytes ya escritos (el tamaño de un RIFF, que solo se sabe al final). */
  fijarU32le(pos: number, valor: number): void {
    const antes = this.pos;
    this.pos = pos;
    this.u32le(valor);
    this.pos = antes;
  }

  /** Una copia exacta de lo escrito: el búfer de trabajo no sale de aquí. */
  resultado(): Uint8Array {
    return this.bytes.slice(0, this.pos);
  }
}

// ── Texto ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Cuántos bytes de un valor se decodifican como mucho. Cuatro bytes por carácter (el peor caso de
 * UTF-8) dan de sobra para pasar de `LARGO_MAXIMO_DE_VALOR` y saber que hubo recorte.
 */
export const BYTES_DE_TEXTO = LARGO_MAXIMO_DE_VALOR * 4 + 4;

export interface TextoDecodificado {
  readonly texto: string;
  /** Los bytes eran más que el tope y no se decodificaron todos: el valor quedó recortado. */
  readonly cortado: boolean;
}

const UTF8_ESTRICTO = new TextDecoder("utf-8", { fatal: true });
const UTF8_LAXO = new TextDecoder("utf-8");

/** Corta en `tope` sin partir una secuencia UTF-8: retrocede sobre los bytes de continuación. */
function cortarUtf8(bytes: Uint8Array, tope: number): Uint8Array {
  if (bytes.length <= tope) return bytes;
  let fin = tope;
  for (let i = 0; i < 3 && fin > 0 && (bytes[fin] & 0xc0) === 0x80; i++) fin--;
  return bytes.subarray(0, fin);
}

export function textoLatin1(
  bytes: Uint8Array,
  tope = BYTES_DE_TEXTO,
): TextoDecodificado {
  const fin = Math.min(bytes.length, tope);
  let texto = "";
  for (let i = 0; i < fin; i++) texto += String.fromCharCode(bytes[i]);
  return { texto, cortado: bytes.length > tope };
}

/**
 * UTF-8 si los bytes lo son; si no, Latin-1. Los metadatos que dicen ser ASCII casi nunca lo son
 * (una cámara escribe UTF-8; un programa viejo, Latin-1) y ninguno lo declara: la decodificación
 * estricta decide sin adivinar, y el resultado es el mismo en cada corrida.
 */
export function textoUtf8OLatin1(
  bytes: Uint8Array,
  tope = BYTES_DE_TEXTO,
): TextoDecodificado {
  const parte = cortarUtf8(bytes, tope);
  try {
    return { texto: UTF8_ESTRICTO.decode(parte), cortado: parte !== bytes };
  } catch {
    return textoLatin1(bytes, tope);
  }
}

/** UTF-8 con reemplazo (`�`) de lo inválido: para paquetes enteros (XMP), donde no hay Latin-1. */
export function textoUtf8Laxo(bytes: Uint8Array, tope: number): string {
  return UTF8_LAXO.decode(cortarUtf8(bytes, tope));
}

/** UCS-2 / UTF-16 por pares de bytes; un byte suelto al final se descarta. */
export function textoUtf16(
  bytes: Uint8Array,
  le: boolean,
  tope = BYTES_DE_TEXTO,
): TextoDecodificado {
  const fin = Math.min(bytes.length, tope) & ~1;
  let texto = "";
  for (let i = 0; i < fin; i += 2)
    texto += String.fromCharCode(
      le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1],
    );
  return { texto, cortado: bytes.length > tope };
}
