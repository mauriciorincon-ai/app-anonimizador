// Validadores europeos (S8, ADR-016) — identificadores nacionales con carácter o dígito de control.
//
// Cada uno cita en comentario la fuente de su algoritmo y hasta dónde se pudo VERIFICAR, con la fecha
// de consulta (2026-11-02), porque «si lo marca, es porque el algoritmo oficial lo confirma» solo es
// cierto si quien lo lee puede ir a la fuente y saber qué se abrió y qué no. Hay tres grados:
//   · verificado en la fuente oficial, con ejemplos que ella publica: NIR, Steuer-IdNr, BSN, PESEL;
//   · verificado en la tabla oficial pero SIN ejemplo oficial: codice fiscale;
//   · fuente oficial NO abierta (HTTP 403 al verificador), algoritmo tomado de los extractos que cita
//     el buscador y comprobado a mano con su único ejemplo: DNI y NIE.
// Todos tienen `certeza: "algoritmo-oficial"`: el control se recalcula y cuadra. Y, como el NIT,
// ninguno afirma que el número EXISTA o pertenezca a alguien: afirma que su control cuadra y que su
// estructura es posible.
//
// Los separadores habituales (espacios, puntos y guiones) se ignoran al validar: un NIR se escribe
// «1 85 05 78 006 084 36» y un DNI «12.345.678-Z». Las letras pueden venir en minúscula.
//
// El IBAN ya existía (`universales.ts`, ISO 13616) y se reutiliza: no se duplica aquí.

import { mensaje } from "@/lib/idioma";

import type { Validador } from "./tipos";

/** Quita los separadores que las personas ponen a mano y pasa a mayúsculas. */
export function sinSeparadores(valor: string): string {
  return valor.replace(/[\s.\-/]/g, "").toUpperCase();
}

/** Los dígitos de una cadena que solo los tiene, como números. */
function digitosDe(cadena: string): number[] {
  return [...cadena].map(Number);
}

// ── Claves nacionales dentro del BBAN de un IBAN (S10) ────────────────────────────────────────
/**
 * Los dos dígitos de control del CCC español dentro del BBAN: el primero sobre «00» + banco + oficina
 * y el segundo sobre la cuenta, con los pesos 1-2-4-8-5-10-9-7-3-6 y el resto a 11 (11 → 0, 10 → 1).
 * El BBAN español es banco (4) · oficina (4) · control (2) · cuenta (10).
 *
 * Verificado contra el ejemplo del registro IBAN, ES91 2100 0418 4502 0005 1332: banco 2100, oficina
 * 0418, cuenta 0200051332 → control «45». La fuente oficial (Banco de España) no se abrió: el
 * algoritmo es el publicado y el ejemplo lo comprueba.
 */
const PESOS_DEL_CCC = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];

function digitoDelCcc(diez: string): number {
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(diez[i]) * PESOS_DEL_CCC[i];
  const resto = 11 - (suma % 11);
  return resto === 11 ? 0 : resto === 10 ? 1 : resto;
}

/** Los dos dígitos de control del CCC (banco 4 + oficina 4, cuenta 10), como cadena de dos cifras. */
export function controlDelCcc(bancoYOficina: string, cuenta: string): string {
  return `${digitoDelCcc(`00${bancoYOficina}`)}${digitoDelCcc(cuenta)}`;
}

/**
 * La clave del RIB francés: 97 − ((89 × banco + 15 × agencia + 3 × cuenta) módulo 97), con las
 * letras de la cuenta cambiadas por cifras (A–I → 1–9, J–R → 1–9, S–Z → 2–9). El BBAN francés es
 * banco (5) · agencia (5) · cuenta (11, alfanumérica) · clave (2).
 *
 * Verificado contra el ejemplo del registro IBAN, FR14 2004 1010 0505 0001 3M02 606: banco 20041,
 * agencia 01005, cuenta 0500013M026 → clave «06». La fuente oficial (Banque de France) no se abrió.
 * El producto cabe en un entero seguro de JS (< 2⁵³) solo si se reduce antes: se hace módulo 97 por
 * partes.
 */
export function claveDelRib(
  banco: string,
  agencia: string,
  cuenta: string,
): number {
  const cifras = cuenta.toUpperCase().replace(/[A-Z]/g, (letra) => {
    const i = letra.charCodeAt(0) - 65;
    return String(i < 9 ? i + 1 : i < 18 ? i - 8 : i - 16);
  });
  const modulo = (texto: string) =>
    [...texto].reduce((r, c) => (r * 10 + Number(c)) % 97, 0);
  return (
    97 - ((89 * modulo(banco) + 15 * modulo(agencia) + 3 * modulo(cifras)) % 97)
  );
}

// ── España: DNI y NIE ─────────────────────────────────────────────────────────────────────────
/**
 * Letra de control del DNI y del NIE: el número módulo 23 indexa esta tabla.
 *
 * Fuente: Ministerio del Interior, «Cálculo del dígito de control del NIF/NIE»
 * (interior.gob.es). **Esa página NO se pudo abrir** (HTTP 403 al verificador, 2026-11-02): la
 * tabla y el módulo 23 se tomaron de los extractos que el buscador cita de ella y se comprobaron a
 * mano con su ejemplo: 12345678 = 23 × 536768 + 14 y el índice 14 es la «Z». Ninguna otra fuente
 * oficial abierta trae la fórmula: la AEAT («Composición del NIF», personas físicas) y el Real
 * Decreto 1065/2007 (arts. 19–20) solo dicen 8 dígitos y una letra mayúscula «de acuerdo con sus
 * disposiciones reguladoras», y la Orden INT/2058/2008 define el NIE de 9 caracteres (X, 7
 * dígitos, letra) sin fórmula. Un NIE anterior a julio de 2008 (X + 8 dígitos) no se reconoce.
 */
export const LETRAS_DE_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

export function letraDeDni(numero: number): string {
  return LETRAS_DE_DNI[numero % 23];
}

/** DNI: 8 dígitos y la letra de control. */
export function cumpleDni(valor: string): boolean {
  const limpio = sinSeparadores(valor);
  if (!/^\d{8}[A-Z]$/.test(limpio)) return false;
  return letraDeDni(Number(limpio.slice(0, 8))) === limpio[8];
}

/**
 * NIE: X, Y o Z, 7 dígitos y la letra. Para la letra de control, X vale 0, Y vale 1 y Z vale 2 y
 * pasan a ser el primer dígito de un número de 8.
 */
export function cumpleNie(valor: string): boolean {
  const limpio = sinSeparadores(valor);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(limpio)) return false;
  const inicial = "XYZ".indexOf(limpio[0]);
  return letraDeDni(Number(`${inicial}${limpio.slice(1, 8)}`)) === limpio[8];
}

// ── Francia: NIR ──────────────────────────────────────────────────────────────────────────────
/**
 * Clave del NIR: 97 − (los 13 primeros dígitos módulo 97). Córcega usa `2A` y `2B` en el
 * departamento; para el cálculo la letra se sustituye por 0 y se restan 1 000 000 (A) o 2 000 000 (B)
 * al número de 13 dígitos antes de dividir, que equivale a que 2A y 2B valgan 19 y 18.
 *
 * Fuente: INSEE, «Identifiant d'individus : NIR» (xml.insee.fr/schema/nir.html, consultada
 * 2026-11-02): el patrón del esquema, el sexo (1 o 2), el mes 01–12, `2A`/`2B` y la clave como
 * complemento a 97. Ejemplos que la propia página publica: 1510246102043 con clave 25 y
 * 278112B050002 con clave 86. Sin verificar en fuente oficial: que la clave vaya de 01 a 97 (es
 * inferencia), las series de sexo 3, 4, 7 y 8 y los meses 20 y 30–42 y 50–99 que el texto llama
 * «otros códigos específicos» sin listarlos: aquí solo se acepta el sexo 1 o 2 y el mes real.
 */
export function claveDelNir(trece: string): number | null {
  if (!/^\d[0-9AB]{12}$/.test(trece)) return null;
  const departamento = trece.slice(5, 7);
  let numero: number;
  if (departamento === "2A") numero = Number(trece.replace("2A", "19"));
  else if (departamento === "2B") numero = Number(trece.replace("2B", "18"));
  else if (/^\d{13}$/.test(trece)) numero = Number(trece);
  else return null;
  // 13 dígitos caben en un entero seguro de JS (< 2^53): no hace falta BigInt.
  return 97 - (numero % 97);
}

export function cumpleNir(valor: string): boolean {
  const limpio = sinSeparadores(valor);
  // sexo (1 o 2) · año · mes · departamento (dos cifras, o 2A y 2B en Córcega) · municipio · orden · clave
  if (!/^[12]\d{4}(?:\d{2}|2A|2B)\d{6}\d{2}$/.test(limpio)) return false;
  const mes = Number(limpio.slice(3, 5));
  // 01–12 es el mes de nacimiento; los meses 20 y 30–42 y 50–99 son los casos de mes desconocido o
  // de inscripción provisional que el INSEE documenta, y aquí solo se acepta el mes real.
  if (mes < 1 || mes > 12) return false;
  const clave = claveDelNir(limpio.slice(0, 13));
  return clave !== null && clave === Number(limpio.slice(13, 15));
}

// ── Italia: codice fiscale ────────────────────────────────────────────────────────────────────
/**
 * Carácter de control del codice fiscale: los 15 primeros caracteres se suman con una tabla para
 * las posiciones impares y otra para las pares, y la suma módulo 26 es una letra (0 = A … 25 = Z).
 *
 * Fuente: Decreto Ministeriale del 23 dicembre 1976, «Sistemi di codificazione dei soggetti da
 * iscrivere all'anagrafe tributaria» (Allegati, arts. 2, 6 y 7), leído en su reproducción en la
 * Gazzetta Ufficiale web el 2026-11-02; la Agenzia delle Entrate lo confirma en sus FAQ (16
 * caracteres, +40 para las mujeres). **El decreto no trae ningún ejemplo** y no se usa uno de blog.
 * El texto digitalizado tiene erratas: imprime «4 = O» en la tabla de omocodia, y la convención es
 * «4 = Q» (que Q y T encajen sin hueco en las tablas lo confirma; el Q solo lo corroboran fuentes
 * secundarias), y una «r» donde va el 19 de la columna par (T). El texto tampoco precisa si la
 * omocodia admite cualquier subconjunto de las siete cifras o solo sustituciones seguidas desde la
 * derecha: aquí se acepta cualquier subconjunto.
 */
const VALOR_EN_POSICION_IMPAR: Readonly<Record<string, number>> = {
  "0": 1,
  "1": 0,
  "2": 5,
  "3": 7,
  "4": 9,
  "5": 13,
  "6": 15,
  "7": 17,
  "8": 19,
  "9": 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

function valorEnPosicionPar(caracter: string): number {
  return /\d/.test(caracter) ? Number(caracter) : caracter.charCodeAt(0) - 65;
}

export function controlDelCodiceFiscale(quince: string): string {
  let suma = 0;
  for (let i = 0; i < quince.length; i++) {
    // Las posiciones se cuentan desde 1: la primera es impar.
    suma +=
      i % 2 === 0
        ? VALOR_EN_POSICION_IMPAR[quince[i]]
        : valorEnPosicionPar(quince[i]);
  }
  return String.fromCharCode(65 + (suma % 26));
}

/** La letra del mes, en el orden de los meses: enero A, febrero B, marzo C, abril D, mayo E… */
export const LETRAS_DE_MES = "ABCDEHLMPRST";

/**
 * Las siete posiciones que pueden venir sustituidas por letras cuando dos personas comparten el
 * código (omocodia): los dígitos del año, del día y del municipio pasan a letras LMNPQRSTUV.
 */
const POSICIONES_CON_OMOCODIA = [6, 7, 9, 10, 12, 13, 14];
const LETRAS_DE_OMOCODIA = "LMNPQRSTUV";

function sinOmocodia(codigo: string): string {
  const llano = [...codigo];
  for (const i of POSICIONES_CON_OMOCODIA) {
    const posicion = LETRAS_DE_OMOCODIA.indexOf(llano[i]);
    if (posicion !== -1) llano[i] = String(posicion);
  }
  return llano.join("");
}

export function cumpleCodiceFiscale(valor: string): boolean {
  const limpio = sinSeparadores(valor);
  if (
    !/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(
      limpio,
    )
  ) {
    return false;
  }
  if (!LETRAS_DE_MES.includes(limpio[8])) return false;
  const llano = sinOmocodia(limpio);
  // El día es 01–31 y a las mujeres se les suma 40: 41–71.
  const dia = Number(llano.slice(9, 11));
  if (!((dia >= 1 && dia <= 31) || (dia >= 41 && dia <= 71))) return false;
  return controlDelCodiceFiscale(limpio.slice(0, 15)) === limpio[15];
}

// ── Alemania: Steuer-IdNr ─────────────────────────────────────────────────────────────────────
/**
 * Cifra de control de la Steueridentifikationsnummer, sobre las 10 primeras cifras: producto = 10;
 * por cada cifra, suma = (cifra + producto) mod 10, con 0 → 10; producto = (2 × suma) mod 11; la
 * cifra es 11 − producto, y 10 → 0. Es el sistema híbrido ISO 7064 MOD 11,10; **esa identificación es
 * de Velo: el documento oficial no nombra la norma ISO**.
 *
 * Fuente: Bayerisches Landesamt für Steuern / ELSTER, «Prüfung der Steuer- und
 * Steueridentifikationsnummer sowie der Ordnungskriterien bei der Grundsteuer» (Stand 02.09.2026),
 * cap. 2.2, y § 1 StIdV («zehn Ziffern und einer Prüfziffer als elfter Ziffer»); consultadas
 * 2026-11-02. **No se abrieron el § 139b AO ni la página del BZSt**: las reglas de cifras salen del
 * documento de ELSTER. Ese documento publica los ejemplos 86095742719, 47036892816, 65929970489,
 * 57549285017 y 25768131411 (de ilustración; no deben usarse en transmisiones) y la TestID
 * 02476291358, que empieza por 0 y solo vale como número de prueba.
 */
export function cifraDeControlSteuer(diez: readonly number[]): number {
  let producto = 10;
  for (const digito of diez) {
    let suma = (digito + producto) % 10;
    if (suma === 0) suma = 10;
    producto = (suma * 2) % 11;
  }
  const control = 11 - producto;
  return control === 10 ? 0 : control;
}

/**
 * La estructura posible de las 10 primeras cifras, según el documento de ELSTER: no empieza por 0
 * (salvo las IdNr de prueba, que aquí se rechazan); exactamente una cifra aparece dos o tres veces y
 * las demás una sola vez; y las tres cifras iguales «nunca en posiciones directamente consecutivas».
 * Ese último punto es ambiguo: el ejemplo oficial 65929970489 tiene tres 9 y dos de ellos
 * contiguos, así que se lee como «no las tres seguidas».
 */
export function estructuraDeSteuer(diez: readonly number[]): boolean {
  if (diez[0] === 0) return false;
  const apariciones = new Array<number>(10).fill(0);
  for (const d of diez) apariciones[d]++;
  const repetidas = apariciones.filter((n) => n >= 2);
  if (repetidas.length !== 1 || repetidas[0] > 3) return false;
  if (apariciones.every((n) => n > 0)) return false;
  if (repetidas[0] === 3) {
    const digito = apariciones.indexOf(3);
    for (let i = 0; i + 2 < diez.length; i++) {
      if (
        diez[i] === digito &&
        diez[i + 1] === digito &&
        diez[i + 2] === digito
      ) {
        return false;
      }
    }
  }
  return true;
}

export function cumpleSteuerIdNr(valor: string): boolean {
  const limpio = sinSeparadores(valor);
  if (!/^\d{11}$/.test(limpio)) return false;
  const digitos = digitosDe(limpio);
  return (
    estructuraDeSteuer(digitos.slice(0, 10)) &&
    cifraDeControlSteuer(digitos.slice(0, 10)) === digitos[10]
  );
}

// ── Países Bajos: BSN ─────────────────────────────────────────────────────────────────────────
/**
 * Prueba del 11 («elfproef») del BSN: 9·a + 8·b + 7·c + 6·d + 5·e + 4·f + 3·g + 2·h − 1·i debe ser
 * múltiplo de 11; el último dígito pesa −1, no +1.
 *
 * Fuentes (consultadas 2026-11-02): RvIG, «Logisch ontwerp BRPk» (nota al elemento BSN) y las
 * «Richtsnoeren Identificatie en verificatie van persoonsgegevens» (BWBR0033181), que publican el
 * ejemplo 123456782 (suma 154 = 11 × 14); y RvIG, UC 27 «Genereren nummers». No se abrieron
 * rijksoverheid.nl ni la Belastingdienst, y hay un solo ejemplo oficial. Las fuentes abiertas no
 * excluyen el 000000000: rechazarlo es decisión de Velo, porque pasa la prueba sin ser un número
 * que se asigne. Un BSN de 8 cifras se lee con un cero a la izquierda (así lo antepone el registro,
 * y una hoja de cálculo se lo come): se comprueba el de 9. Un número de 8 cifras cualquiera lo
 * pasa por azar una de cada 11 veces (~9 %), muy por debajo del 85 % que adjudica una columna.
 */
export function sumaDelBsn(nueve: readonly number[]): number {
  return nueve.reduce(
    (suma, digito, i) => suma + digito * (i === 8 ? -1 : 9 - i),
    0,
  );
}

export function cumpleBsn(valor: string): boolean {
  const sinCero = sinSeparadores(valor);
  if (!/^\d{8,9}$/.test(sinCero)) return false;
  const limpio = sinCero.padStart(9, "0");
  // Todo ceros pasa la prueba del 11 (la suma es 0) y no es un número que se asigne.
  if (/^0+$/.test(limpio)) return false;
  return sumaDelBsn(digitosDe(limpio)) % 11 === 0;
}

// ── Polonia: PESEL ────────────────────────────────────────────────────────────────────────────
/**
 * El mes del PESEL lleva el siglo: 01–12 es 1900–1999, 21–32 es 2000–2099, 41–52 es 2100–2199,
 * 61–72 es 2200–2299 y 81–92 es 1800–1899. Pesos 1-3-7-9-1-3-7-9-1-3 y cifra de control = 10 − la
 * última cifra de la suma (0 si esa cifra es 0).
 *
 * Fuentes (consultadas 2026-11-02): gov.pl, «Czym jest numer PESEL» (actualizada 18.03.2026), el
 * Rozporządzenie del Ministro de Asuntos Interiores de 4.01.2012, § 7 (pesos y algoritmo; no se
 * verificó su vigencia en 2026), y el Ministerstwo Cyfryzacji (ustawa o ewidencji ludności, Dz.U.
 * 2017 poz. 657; el artículo concreto no se abrió). Ejemplo completo publicado: 02070803628. Que el
 * día exista en el calendario es consecuencia lógica de la codificación, no texto de la fuente.
 */
const SIGLO_DEL_PESEL: Readonly<Record<number, number>> = {
  0: 1900,
  2: 2000,
  4: 2100,
  6: 2200,
  8: 1800,
};

const PESOS_DEL_PESEL = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

export function controlDelPesel(diez: readonly number[]): number {
  const suma = diez.reduce((s, d, i) => s + d * PESOS_DEL_PESEL[i], 0);
  return (10 - (suma % 10)) % 10;
}

/** La fecha de nacimiento que dice un PESEL, o `null` si no existe en el calendario. */
export function fechaDelPesel(
  digitos: readonly number[],
): { anio: number; mes: number; dia: number } | null {
  const mesCodificado = digitos[2] * 10 + digitos[3];
  const siglo = SIGLO_DEL_PESEL[Math.floor(mesCodificado / 20) * 2];
  if (siglo === undefined) return null;
  const mes = mesCodificado % 20;
  const dia = digitos[4] * 10 + digitos[5];
  const anio = siglo + digitos[0] * 10 + digitos[1];
  if (mes < 1 || mes > 12 || dia < 1) return null;
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return dia <= diasDelMes ? { anio, mes, dia } : null;
}

export function cumplePesel(valor: string): boolean {
  const limpio = sinSeparadores(valor);
  if (!/^\d{11}$/.test(limpio)) return false;
  const digitos = digitosDe(limpio);
  return (
    fechaDelPesel(digitos) !== null &&
    controlDelPesel(digitos.slice(0, 10)) === digitos[10]
  );
}

// ── Los validadores registrados ───────────────────────────────────────────────────────────────

function europeo(
  id: Validador["id"],
  textos: Pick<Validador, "etiqueta" | "fuente">,
  prioridad: number,
  valida: (valor: string) => boolean,
): Validador {
  return {
    id,
    ...textos,
    certeza: "algoritmo-oficial",
    // Un número nacional de identificación identifica a una persona por sí solo (RGPD art. 4.1).
    categoria: "identificador-directo",
    prioridad,
    valida,
  };
}

export const validadorCodiceFiscale = europeo(
  "codice-fiscale",
  {
    etiqueta: mensaje("validador.codiceFiscale.etiqueta"),
    fuente: mensaje("validador.codiceFiscale.fuente"),
  },
  94,
  cumpleCodiceFiscale,
);
export const validadorNir = europeo(
  "nir",
  {
    etiqueta: mensaje("validador.nir.etiqueta"),
    fuente: mensaje("validador.nir.fuente"),
  },
  93,
  cumpleNir,
);
export const validadorDni = europeo(
  "dni",
  {
    etiqueta: mensaje("validador.dni.etiqueta"),
    fuente: mensaje("validador.dni.fuente"),
  },
  92,
  cumpleDni,
);
export const validadorNie = europeo(
  "nie",
  {
    etiqueta: mensaje("validador.nie.etiqueta"),
    fuente: mensaje("validador.nie.fuente"),
  },
  92,
  cumpleNie,
);
export const validadorSteuerIdNr = europeo(
  "steuer-idnr",
  {
    etiqueta: mensaje("validador.steuerIdnr.etiqueta"),
    fuente: mensaje("validador.steuerIdnr.fuente"),
  },
  91,
  cumpleSteuerIdNr,
);
export const validadorPesel = europeo(
  "pesel",
  {
    etiqueta: mensaje("validador.pesel.etiqueta"),
    fuente: mensaje("validador.pesel.fuente"),
  },
  91,
  cumplePesel,
);
export const validadorBsn = europeo(
  "bsn",
  {
    etiqueta: mensaje("validador.bsn.etiqueta"),
    fuente: mensaje("validador.bsn.fuente"),
  },
  89,
  cumpleBsn,
);
