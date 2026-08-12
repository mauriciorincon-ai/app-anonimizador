// Seudonimización irreversible — el disfraz que no se quita sin la bóveda del S3.
//
// HMAC-SHA256 con la llave del usuario, vía `crypto.subtle.sign` (ADR-004: medido en Chromium,
// 4,4× más rápido que un HMAC síncrono propio; 0,68 s por 500.000 valores distintos).
//
// **La consistencia referencial (C9) no se construye aquí: cae sola.** Mismo valor + misma llave ⇒
// mismo seudónimo, dentro del archivo y entre archivos, porque eso es lo que un HMAC hace. No hay
// tabla que mantener ni estado que sincronizar. Lo que sí hay es un test que lo verifica, porque
// una propiedad que nadie comprueba es una esperanza.
//
// **Esto NO es FPE.** FF3 está roto (Durak & Vaudenay, *Breaking the FF3 Format-Preserving
// Encryption Standard over Small Domains*, CRYPTO 2017 — ePrint 2017/521) y el segundo borrador de
// NIST SP 800-38G Rev.1 lo elimina por completo. Un seudónimo con formato de Velo **parece** una
// cédula para que el sistema del destino no rechace el archivo, pero no se puede revertir por
// algoritmo: la vuelta la da la bóveda (S3), no el cifrado del formato.

import { digitoVerificacionNit } from "../validadores/colombianos";

/** Lo que sale de seudonimizar una lista de valores distintos. */
export interface ResultadoDeSeudonimo {
  /** Seudónimos, en el mismo orden que los valores de entrada. */
  readonly valores: readonly string[];
  /**
   * Cuántos valores distintos acabaron compartiendo seudónimo.
   *
   * No es un detalle de implementación: es información que el usuario necesita. Ver la nota sobre
   * colisiones en `seudonimizarConFormato`.
   */
  readonly colisiones: number;
}

const codificador = new TextEncoder();

async function hmacHex(clave: CryptoKey, valor: string): Promise<string> {
  const firma = await crypto.subtle.sign(
    "HMAC",
    clave,
    codificador.encode(valor),
  );
  return [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cuenta cuántas entradas distintas colapsaron en el mismo seudónimo. */
function contarColisiones(
  entradas: readonly string[],
  salidas: readonly string[],
): number {
  const vistos = new Set<string>();
  let colisiones = 0;
  for (let i = 0; i < salidas.length; i++) {
    // El vacío no se seudonimiza: no cuenta como colisión de nadie.
    if (entradas[i] === "") continue;
    if (vistos.has(salidas[i])) colisiones++;
    else vistos.add(salidas[i]);
  }
  return colisiones;
}

/**
 * Seudónimo hexadecimal. `longitud` caracteres del HMAC.
 *
 * Con la longitud por defecto (16 caracteres = 64 bits) la probabilidad de que dos valores de un
 * archivo de 500.000 compartan seudónimo es del orden de 10⁻⁸: es el camino sin colisiones
 * prácticas, a cambio de que el resultado no se parezca al dato original.
 */
export async function seudonimizar(
  valores: readonly string[],
  clave: CryptoKey,
  longitud = 16,
): Promise<ResultadoDeSeudonimo> {
  const salida: string[] = [];
  for (const valor of valores) {
    salida.push(
      valor === "" ? "" : (await hmacHex(clave, valor)).slice(0, longitud),
    );
  }
  return { valores: salida, colisiones: contarColisiones(valores, salida) };
}

// ── Formato preservado (C10) ──────────────────────────────────────────────────────────────────

/**
 * Rango de cada formato, y el precio que se paga por parecerse al original.
 *
 * **El problema de las colisiones, dicho con números.** Un seudónimo tiene que caber en el formato
 * que el sistema del destino espera, y un NIT colombiano son 9 dígitos que empiezan por 8 o 9: eso
 * son 2×10⁸ combinaciones posibles, no 2⁶⁴. Por la paradoja del cumpleaños, en un archivo con
 * 500.000 NITs distintos cabe esperar **del orden de 600 pares** que caigan en el mismo seudónimo
 * — un 0,1 % de los valores, pero un 0,1 % que hace que dos empresas distintas se vean como una.
 *
 * **Por qué Velo NO lo resuelve rehashando.** La salida obvia sería, ante una colisión, volver a
 * hashear con un contador hasta encontrar un hueco. Eso rompería en silencio la propiedad que este
 * sprint promete: el seudónimo dejaría de depender solo del valor y la llave, y pasaría a depender
 * de QUÉ MÁS había en el archivo. El mismo cliente saldría con un seudónimo distinto en el archivo
 * de marzo que en el de abril, y los cruces —que son la razón de existir de C9— se romperían justo
 * donde nadie los está mirando.
 *
 * Así que Velo **las cuenta y las reporta**. Si el número no te sirve, el camino sin colisiones es
 * el seudónimo hexadecimal: se conserva el cruce, se pierde el parecido.
 */
const FORMATOS = {
  /** NUIP de 10 dígitos desde 1.000.000.000 (Registraduría). 10⁹ combinaciones. */
  cedula: { minimo: 1_000_000_000, rango: 1_000_000_000 },
  /** Base de 9 dígitos en el rango de las empresas (8xx–9xx). 2×10⁸ combinaciones. */
  nit: { minimo: 800_000_000, rango: 200_000_000 },
} as const;

export type FormatoDeSeudonimo = keyof typeof FORMATOS;

/** 13 caracteres hexadecimales = 52 bits, que es lo que un `number` de JS representa sin perder. */
const HEX_SEGUROS = 13;

/**
 * Convierte el digest en un número dentro del rango del formato.
 *
 * Se toman **52 bits** del HMAC —el entero más grande que JS maneja exacto— y se reducen módulo el
 * rango. Con `BigInt` se podrían usar 64, pero no compra nada: el sesgo que introduce el módulo es
 * del orden de rango/2⁵² ≈ 4×10⁻⁸, irrelevante para un seudónimo, y se declara en vez de omitirse.
 * Lo que sí compra es que el motor siga sin depender de literales `BigInt`.
 */
function numeroEnRango(hex: string, formato: FormatoDeSeudonimo): number {
  const { minimo, rango } = FORMATOS[formato];
  return minimo + (Number.parseInt(hex.slice(0, HEX_SEGUROS), 16) % rango);
}

/**
 * Seudónimo que conserva el formato: una cédula sigue pareciendo una cédula, un NIT sale con su
 * **dígito de verificación oficial recalculado** (mod 11 de la DIAN) para que el sistema del
 * destino no lo rechace.
 *
 * Nota de honestidad heredada del S1: la cédula colombiana **no tiene dígito de verificación
 * público**, así que su seudónimo solo puede ser estructuralmente válido — 10 dígitos empezando
 * por 1. Con el NIT sí hay algoritmo, y se recomputa de verdad.
 */
export async function seudonimizarConFormato(
  valores: readonly string[],
  clave: CryptoKey,
  formato: FormatoDeSeudonimo,
): Promise<ResultadoDeSeudonimo> {
  const salida: string[] = [];
  for (const valor of valores) {
    if (valor === "") {
      salida.push("");
      continue;
    }
    const base = numeroEnRango(await hmacHex(clave, valor), formato).toString();
    if (formato === "nit") {
      // El DV se recomputa con el algoritmo oficial sobre la base nueva: el seudónimo no hereda el
      // dígito del original, lo gana por derecho propio.
      salida.push(`${base}-${digitoVerificacionNit(base)}`);
    } else {
      salida.push(base);
    }
  }
  return { valores: salida, colisiones: contarColisiones(valores, salida) };
}
