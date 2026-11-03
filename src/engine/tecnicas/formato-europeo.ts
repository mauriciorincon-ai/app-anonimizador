// Seudónimos con formato europeo (S8, ADR-016) — un IBAN sigue pareciendo un IBAN, un DNI un DNI.
//
// Mismo principio que la cédula y el NIT del S1: HMAC de la llave → dígitos (y letras donde la norma
// las pide) → el carácter de control RECALCULADO con el mismo algoritmo oficial que usa el
// validador. El seudónimo pasa el validador, así que el sistema del destino no lo rechaza; y no hay
// FPE (regla dura 3): la vuelta la da la bóveda, no el cifrado del formato.
//
// **Todo se sintetiza, nada se hereda** salvo lo que el IBAN necesita para seguir siendo de su país:
// el DNI, el NIR o el codice fiscale que salen no conservan ni un dato del original (ni el
// departamento, ni el año, ni el sexo), porque esos campos son cuasi-identificadores y heredarlos
// sería dejar la mitad del dato a la vista. Por eso los números que salen son plausibles y
// ficticios: pasan el control, no pertenecen a nadie conocido.
//
// **Los símbolos.** Cada uno sale de 8 caracteres hexadecimales (32 bits) del HMAC, módulo el número
// de opciones: el sesgo del módulo es de n/2³², del orden de 10⁻⁹ para un dígito y 10⁻⁸ para una
// letra. Un HMAC da 64 caracteres, es decir 8 símbolos; un formato que necesita más pide más
// BLOQUES, cada uno el HMAC del valor con un contador (`BLOQUES`), así que el seudónimo depende solo
// del valor y la llave, jamás de qué más hay en el archivo (la razón del S1 para no «rehashear»).
//
// **Nunca igual a la entrada.** Un seudónimo que coincidiera con el dato original sería una
// filtración disfrazada de seudónimo. La probabilidad es de 1 entre ~10⁸ por valor, pero «casi
// nunca» no es una garantía: si el candidato coincide con la entrada, se vuelve a sortear con otro
// intento del mismo valor (de nuevo solo valor y llave), y un test lo comprueba.

import type { FormatoDeSeudonimo } from "../politica";
import {
  cifraDeControlSteuer,
  claveDelNir,
  controlDelCodiceFiscale,
  controlDelPesel,
  LETRAS_DE_MES,
  letraDeDni,
  sinSeparadores,
  sumaDelBsn,
} from "../validadores/europeos";

/** Los formatos cuyo seudónimo se arma aquí (los otros dos, la cédula y el NIT, viven en `seudonimo.ts`). */
export type FormatoEuropeo = Exclude<FormatoDeSeudonimo, "cedula" | "nit">;

export function esEuropeo(
  formato: FormatoDeSeudonimo,
): formato is FormatoEuropeo {
  return formato !== "cedula" && formato !== "nit";
}

/** Cuántos HMAC (de 8 símbolos cada uno) necesita cada formato, con holgura sobre lo que gasta. */
export const BLOQUES: Readonly<Record<FormatoEuropeo, number>> = {
  iban: 4, // hasta 30 caracteres de BBAN
  dni: 2, // 8 dígitos
  nie: 2, // prefijo + 7 dígitos
  nir: 2, // sexo, año (2), mes, departamento, municipio, orden
  "codice-fiscale": 3, // 6 letras, año, mes, día, sexo, municipio (letra y número)
  "steuer-idnr": 2, // ausente, repetida, 9 del barajado, ajuste
  bsn: 2, // 8 dígitos
  pesel: 1, // año, mes, día, serie
};

/** Los símbolos de un seudónimo: hexadecimal del HMAC leído de a 32 bits. */
export class Simbolos {
  private posicion = 0;

  constructor(private readonly hex: string) {}

  /** Un entero en [0, n). */
  entero(n: number): number {
    const trozo = this.hex.slice(this.posicion, this.posicion + 8);
    if (trozo.length < 8) {
      throw new Error("el seudónimo con formato se quedó sin símbolos");
    }
    this.posicion += 8;
    return Number.parseInt(trozo, 16) % n;
  }

  digito(): number {
    return this.entero(10);
  }

  letra(): string {
    return String.fromCharCode(65 + this.entero(26));
  }

  /** `cuantos` dígitos como cadena. */
  digitos(cuantos: number): string {
    let salida = "";
    for (let i = 0; i < cuantos; i++) salida += this.digito();
    return salida;
  }
}

const relleno = (numero: number, largo: number): string =>
  String(numero).padStart(largo, "0");

// ── Constructores, uno por formato ────────────────────────────────────────────────────────────

/** IBAN: el país y el largo del original, y el BBAN nuevo con la misma clase de carácter por posición. */
function iban(entrada: string, s: Simbolos): string {
  const limpio = sinSeparadores(entrada);
  const forma = /^([A-Z]{2})\d{2}([A-Z0-9]{10,30})$/.exec(limpio);
  // Un valor que no tiene forma de IBAN sale como un IBAN español sintético: el formato es lo que
  // el usuario pidió, y el país no se puede inventar de un texto cualquiera.
  const pais = forma ? forma[1] : "ES";
  const modelo = forma ? forma[2] : "0".repeat(20);
  let bban = "";
  for (const caracter of modelo) {
    bban += /\d/.test(caracter) ? s.digito() : s.letra();
  }
  // Los dos dígitos de control: 98 − (BBAN + país + «00», con las letras como A=10…Z=35, módulo 97).
  const numerico = `${bban}${pais}00`.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let residuo = 0;
  for (const c of numerico) residuo = (residuo * 10 + Number(c)) % 97;
  const compacto = `${pais}${relleno(98 - residuo, 2)}${bban}`;
  // Se conserva el agrupado de a cuatro si el original era un IBAN que lo traía.
  return forma && /\s/.test(entrada.trim())
    ? (compacto.match(/.{1,4}/g) ?? [compacto]).join(" ")
    : compacto;
}

function dni(s: Simbolos): string {
  // El primer dígito no es 0: una hoja de cálculo se come el cero a la izquierda y el DNI dejaría
  // de ser de 8 cifras sin que nadie lo note.
  const numero = `${1 + s.entero(9)}${s.digitos(7)}`;
  return `${numero}${letraDeDni(Number(numero))}`;
}

function nie(s: Simbolos): string {
  const inicial = s.entero(3);
  const cuerpo = s.digitos(7);
  return `${"XYZ"[inicial]}${cuerpo}${letraDeDni(Number(`${inicial}${cuerpo}`))}`;
}

function nir(s: Simbolos): string {
  const sexo = 1 + s.entero(2);
  const anio = relleno(s.entero(100), 2);
  const mes = relleno(1 + s.entero(12), 2);
  // Departamentos 01–95 sin el 20, que en Córcega es 2A y 2B: se evitan para no mezclar la regla.
  let departamento = 1 + s.entero(94);
  if (departamento >= 20) departamento++;
  const municipio = relleno(1 + s.entero(990), 3);
  const orden = relleno(1 + s.entero(999), 3);
  const trece = `${sexo}${anio}${mes}${relleno(departamento, 2)}${municipio}${orden}`;
  return `${trece}${relleno(claveDelNir(trece) ?? 0, 2)}`;
}

function codiceFiscale(s: Simbolos): string {
  let letras = "";
  for (let i = 0; i < 6; i++) letras += s.letra();
  const anio = relleno(s.entero(100), 2);
  const mes = LETRAS_DE_MES[s.entero(12)];
  // El día: 01–28, y a las mujeres se les suma 40 (así lo dice la norma del codice fiscale).
  const dia = relleno(1 + s.entero(28) + (s.entero(2) === 1 ? 40 : 0), 2);
  const municipio = `${s.letra()}${relleno(s.entero(1000), 3)}`;
  const quince = `${letras}${anio}${mes}${dia}${municipio}`;
  return `${quince}${controlDelCodiceFiscale(quince)}`;
}

/**
 * Steuer-IdNr: se arma en vez de sortearse hasta acertar. Entre 10 cifras al azar solo ~4 % tienen
 * la estructura que pide el documento de ELSTER (una cifra repetida, alguna ausente), y de un solo HMAC no
 * salen suficientes intentos. Se elige la cifra que falta, la que se repite, se baraja y se corrige
 * un 0 inicial: todo determinista.
 */
function steuerIdNr(s: Simbolos): string {
  const ausente = s.entero(10);
  const presentes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== ausente);
  const repetida = presentes[s.entero(9)];
  const cifras = [...presentes, repetida];
  // Fisher–Yates con símbolos del HMAC.
  for (let i = cifras.length - 1; i > 0; i--) {
    const j = s.entero(i + 1);
    [cifras[i], cifras[j]] = [cifras[j], cifras[i]];
  }
  if (cifras[0] === 0) {
    // Un 0 al frente no es posible: se cambia por la primera cifra que no sea 0, a partir de un
    // punto elegido por el HMAC, para no sesgar a un sitio.
    const desde = 1 + s.entero(9);
    for (let k = 0; k < 9; k++) {
      const j = 1 + ((desde - 1 + k) % 9);
      if (cifras[j] !== 0) {
        [cifras[0], cifras[j]] = [cifras[j], cifras[0]];
        break;
      }
    }
  }
  return `${cifras.join("")}${cifraDeControlSteuer(cifras)}`;
}

function bsn(s: Simbolos): string {
  const digitos = [1 + s.entero(9)];
  for (let i = 1; i < 8; i++) digitos.push(s.digito());
  // El noveno resta en la prueba del 11: debe valer (suma de los ocho) módulo 11, y solo cabe si es
  // 0–9. Si saliera 10, se mueve el octavo y se vuelve a calcular (con 10 valores del octavo, al
  // menos 9 dan un noveno posible).
  for (let intento = 0; intento < 10; intento++) {
    const resto = sumaDelBsn([...digitos, 0]) % 11;
    if (resto < 10) return `${digitos.join("")}${resto}`;
    digitos[7] = (digitos[7] + 1) % 10;
  }
  // Inalcanzable por el argumento de arriba; si ocurriera, mejor un error fuerte que un BSN roto.
  throw new Error("no se encontró un BSN con la prueba del 11");
}

function pesel(s: Simbolos): string {
  // Nacidos de 1930 a 2005: un rango fijo, no el reloj (el motor no lee la fecha de hoy).
  const anio = 1930 + s.entero(76);
  const mes = 1 + s.entero(12);
  const dia = 1 + s.entero(28);
  const serie = relleno(s.entero(10_000), 4);
  const mesCodificado = anio >= 2000 ? mes + 20 : mes;
  const diez = `${relleno(anio % 100, 2)}${relleno(mesCodificado, 2)}${relleno(dia, 2)}${serie}`;
  return `${diez}${controlDelPesel([...diez].map(Number))}`;
}

/** El seudónimo de un valor, con los símbolos de un intento. */
export function construirEuropeo(
  formato: FormatoEuropeo,
  entrada: string,
  simbolos: Simbolos,
): string {
  switch (formato) {
    case "iban":
      return iban(entrada, simbolos);
    case "dni":
      return dni(simbolos);
    case "nie":
      return nie(simbolos);
    case "nir":
      return nir(simbolos);
    case "codice-fiscale":
      return codiceFiscale(simbolos);
    case "steuer-idnr":
      return steuerIdNr(simbolos);
    case "bsn":
      return bsn(simbolos);
    case "pesel":
      return pesel(simbolos);
  }
}
