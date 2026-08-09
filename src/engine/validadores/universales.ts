// Validadores universales — los que no dependen de Colombia. Dos de ellos (Luhn e IBAN) sí tienen
// checksum oficial, así que Velo puede AFIRMAR; el resto reconoce forma y así se declara.

import type { Validador } from "./tipos";

// ── Luhn (tarjetas de pago) ───────────────────────────────────────────────────────────────────
/**
 * Algoritmo de Luhn, módulo 10 — especificado en ISO/IEC 7812-1. Desde la derecha se duplica un
 * dígito sí y uno no; si el doble pasa de 9 se le restan 9; la suma total debe ser múltiplo de 10.
 * Detecta todo error de un dígito y casi toda transposición (salvo 09↔90).
 * Fuente: https://www.creditcardvalidator.org/articles/luhn-algorithm
 */
export function cumpleLuhn(digitos: string): boolean {
  if (!/^\d+$/.test(digitos)) return false;
  let suma = 0;
  let duplicar = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = Number(digitos[i]);
    if (duplicar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    duplicar = !duplicar;
  }
  return suma % 10 === 0;
}

export const validadorTarjeta: Validador = {
  id: "tarjeta",
  etiqueta: "Tarjeta de pago (Luhn)",
  fuente: "Algoritmo de Luhn, módulo 10 — ISO/IEC 7812-1",
  certeza: "algoritmo-oficial",
  categoria: "identificador-directo",
  prioridad: 90,
  valida(valor) {
    const digitos = valor.replace(/[\s-]/g, "");
    // El rango de longitud es parte del estándar (13–19). Sin él, cualquier número corto que
    // cuadre con Luhn por casualidad se marcaría como tarjeta: uno de cada diez lo hace.
    if (digitos.length < 13 || digitos.length > 19) return false;
    // El primer dígito es el MII (Major Industry Identifier) de ISO/IEC 7812-1, y el rango de las
    // tarjetas de pago es 3–6 (viajes, banca y comercio). El 9 está reservado para asignación
    // NACIONAL: un consecutivo interno de 16 dígitos que empiece por 9 puede cuadrar con Luhn de
    // casualidad, pero no es —ni puede ser— una tarjeta. Sin esta regla, una columna de
    // referencias de recaudo se marca como dato financiero, que es un falso positivo caro.
    if (!"3456".includes(digitos[0])) return false;
    return cumpleLuhn(digitos);
  },
};

// ── IBAN ──────────────────────────────────────────────────────────────────────────────────────
/**
 * IBAN — ISO 13616, con checksum mod 97-10 de ISO 7064: se mueven los 4 primeros caracteres al
 * final, se convierten las letras a números (A=10 … Z=35) y el resto módulo 97 debe ser 1.
 * El módulo se calcula por trozos porque el número completo desborda el entero seguro de JS.
 */
export function cumpleIban(valor: string): boolean {
  const limpio = valor.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(limpio)) return false;
  const reordenado = limpio.slice(4) + limpio.slice(0, 4);
  let residuo = 0;
  for (const caracter of reordenado) {
    const trozo = /\d/.test(caracter)
      ? caracter
      : String(caracter.charCodeAt(0) - 55); // A=10 … Z=35
    for (const digito of trozo) residuo = (residuo * 10 + Number(digito)) % 97;
  }
  return residuo === 1;
}

export const validadorIban: Validador = {
  id: "iban",
  etiqueta: "Cuenta bancaria IBAN",
  fuente: "ISO 13616 con checksum mod 97-10 de ISO 7064",
  certeza: "algoritmo-oficial",
  categoria: "identificador-directo",
  prioridad: 95,
  valida: (valor) => cumpleIban(valor),
};

// ── Correo ────────────────────────────────────────────────────────────────────────────────────
/**
 * No existe "el algoritmo oficial del correo": el RFC 5322 admite formas que ningún sistema real
 * usa y ninguna expresión regular las cubre todas. Esto reconoce la forma habitual y se declara
 * ESTRUCTURAL — decir "validado" sería vender más de lo que hay.
 */
export const validadorEmail: Validador = {
  id: "email",
  etiqueta: "Correo electrónico",
  fuente: "Forma habitual del RFC 5322 (validación estructural, no checksum)",
  certeza: "estructural",
  categoria: "identificador-directo",
  prioridad: 85,
  valida(valor) {
    const limpio = valor.trim();
    if (limpio.length > 254 || /\s/.test(limpio)) return false;
    return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(limpio);
  },
};

// ── IP ────────────────────────────────────────────────────────────────────────────────────────
/** IPv4 en notación decimal punteada: cuatro octetos de 0 a 255, sin ceros a la izquierda. */
export const validadorIp: Validador = {
  id: "ip",
  etiqueta: "Dirección IP",
  fuente: "IPv4 decimal punteada (RFC 791) — rango exacto por octeto",
  certeza: "estructural",
  // Una IP identifica un dispositivo, casi nunca a una persona sola: delata en combinación.
  categoria: "cuasi-identificador",
  prioridad: 88,
  valida(valor) {
    const partes = valor.trim().split(".");
    if (partes.length !== 4) return false;
    return partes.every((parte) => {
      if (!/^\d{1,3}$/.test(parte)) return false;
      if (parte.length > 1 && parte[0] === "0") return false;
      return Number(parte) <= 255;
    });
  },
};

// ── Coordenadas ───────────────────────────────────────────────────────────────────────────────
/**
 * Validación por rango definicional: latitud en [−90, 90], longitud en [−180, 180]. Se exigen
 * decimales porque un entero suelto entre −90 y 90 es, casi siempre, cualquier otra cosa (una edad,
 * un estrato, un conteo) — y marcar eso como coordenada sería un falso positivo de manual.
 */
export const validadorCoordenada: Validador = {
  id: "coordenada",
  etiqueta: "Coordenada geográfica",
  fuente: "Rango definicional: latitud [−90, 90], longitud [−180, 180]",
  certeza: "estructural",
  categoria: "cuasi-identificador",
  prioridad: 75,
  valida(valor) {
    const limpio = valor.trim();
    if (!/^-?\d{1,3}\.\d{3,}$/.test(limpio)) return false;
    const numero = Number(limpio);
    return numero >= -180 && numero <= 180;
  },
};

// ── Fechas ────────────────────────────────────────────────────────────────────────────────────
/**
 * Formatos ISO (2026-08-09) y los dos habituales en Colombia (09/08/2026 y 09-08-2026). Se
 * verifica que la fecha EXISTA, no solo que tenga forma: 2026-02-31 tiene forma impecable.
 */
export const validadorFecha: Validador = {
  id: "fecha",
  etiqueta: "Fecha",
  fuente:
    "ISO 8601 (AAAA-MM-DD) y formato DD/MM/AAAA; se verifica que la fecha exista",
  certeza: "estructural",
  // Por sí sola una fecha no identifica a nadie. Si la columna es de nacimiento, el clasificador
  // la sube a cuasi-identificador por el nombre — y lo dice.
  categoria: "no-personal",
  prioridad: 50,
  valida(valor) {
    const limpio = valor.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio);
    const local = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(limpio);
    if (!iso && !local) return false;
    const [anio, mes, dia] = iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [Number(local![3]), Number(local![2]), Number(local![1])];
    if (mes < 1 || mes > 12 || dia < 1) return false;
    const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    return dia <= diasDelMes;
  },
};

// ── Genéricos ─────────────────────────────────────────────────────────────────────────────────
/** Número sin más señal. Prioridad baja: cualquier validador específico le gana. */
export const validadorNumero: Validador = {
  id: "numero",
  etiqueta: "Número",
  fuente: "Forma numérica (sin significado de dominio)",
  certeza: "estructural",
  categoria: "no-personal",
  prioridad: 10,
  valida: (valor) => /^-?\d+([.,]\d+)?$/.test(valor.trim()),
};
