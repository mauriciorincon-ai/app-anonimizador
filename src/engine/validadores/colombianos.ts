// Validadores colombianos — el moat del producto. Ninguna herramienta gringa los trae, y cada uno
// lleva su fuente oficial citada AQUÍ, en el código, no en un documento aparte: el algoritmo es
// tan citable como el resto del pipeline.

import type { Validador } from "./tipos";

/** Deja solo dígitos. Los NITs viajan como "900.123.456-7" y los celulares como "+57 300 …". */
function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

// ── NIT ───────────────────────────────────────────────────────────────────────────────────────
/**
 * Pesos primos del dígito de verificación del NIT, aplicados de DERECHA a IZQUIERDA.
 * Fuente: DIAN, Orden Administrativa 4 de 1989.
 * https://es.wikipedia.org/wiki/N%C3%BAmero_de_Identificaci%C3%B3n_Tributaria_(Colombia)
 */
const PESOS_NIT = [
  3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71,
] as const;

/**
 * Recomputa el DV de un NIT: suma ponderada por los pesos primos, módulo 11; si el residuo es 0 o
 * 1 el DV es el residuo, si es mayor el DV es 11 − residuo. Devuelve null si el número no cabe en
 * la tabla de pesos.
 */
export function digitoVerificacionNit(numeroBase: string): number | null {
  const digitos = soloDigitos(numeroBase);
  if (digitos.length === 0 || digitos.length > PESOS_NIT.length) return null;
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[i]) * PESOS_NIT[digitos.length - 1 - i];
  }
  const residuo = suma % 11;
  return residuo < 2 ? residuo : 11 - residuo;
}

export const validadorNit: Validador = {
  id: "nit",
  etiqueta: "NIT con dígito de verificación",
  fuente: "DIAN, Orden Administrativa 4 de 1989 — pesos primos, módulo 11",
  certeza: "algoritmo-oficial",
  categoria: "identificador-directo",
  prioridad: 100,
  valida(valor) {
    // El DV va separado por guion. Sin DV no hay nada que confirmar: eso es un número, no un NIT
    // verificado — y decir lo contrario sería justo la exageración que el producto no se permite.
    const partes = valor.trim().split("-");
    if (partes.length !== 2) return false;
    const base = soloDigitos(partes[0]);
    const dv = partes[1].trim();
    if (!/^\d$/.test(dv)) return false;
    if (base.length < 6 || base.length > 15) return false;
    return digitoVerificacionNit(base) === Number(dv);
  },
};

// ── Cédula de ciudadanía ──────────────────────────────────────────────────────────────────────
/**
 * La cédula colombiana NO tiene dígito de verificación público. La Registraduría documenta el
 * formato (NUIP de 10 dígitos desde 1.000.000.000; series históricas de hasta 8 dígitos asignadas
 * por sexo), pero no publica un checksum: https://www.registraduria.gov.co/-Cedula-de-ciudadania-
 *
 * Por eso este validador es ESTRUCTURAL y así se declara. Es una diferencia que importa: con el
 * NIT, Velo afirma; con la cédula, reconoce una forma. La investigación F1 dejó el punto como gap
 * abierto — si apareciera documentación oficial de un DV, este validador sube de categoría.
 */
/**
 * Encabezados que respaldan la lectura de una serie histórica como cédula. Sin esta señal, un
 * número de 6–8 dígitos no se reclama (ver el comentario del validador).
 */
const ENCABEZADO_DE_CEDULA =
  /(c[eé]dula|\bc\.?c\.?\b|documento|identificaci[oó]n|\bnuip\b|\bdni\b)/i;

export const validadorCedula: Validador = {
  id: "cedula",
  etiqueta: "Cédula de ciudadanía (formato)",
  fuente:
    "Registraduría Nacional — NUIP de 10 dígitos desde 1.000.000.000; series históricas ≤ 8 " +
    "dígitos. No existe dígito de verificación público: la validación es estructural.",
  certeza: "estructural",
  categoria: "identificador-directo",
  prioridad: 60,
  valida(valor, contexto) {
    const limpio = valor.trim();
    if (!/^\d[\d.]*$/.test(limpio)) return false; // admite puntos de miles, no letras
    const digitos = soloDigitos(limpio);

    // NUIP actual: 10 dígitos desde 1.000.000.000. La forma es específica y se reclama sola.
    if (digitos.length === 10) return digitos[0] === "1";

    if (digitos.length < 6 || digitos.length > 8 || digitos[0] === "0")
      return false;

    // Serie histórica: 6–8 dígitos es la forma de CUALQUIER número — un monto en pesos, un
    // consecutivo, un código de producto. Sin dígito de verificación público no hay manera de
    // separarlos mirando el valor, así que aquí Velo no adivina: solo reclama la columna si el
    // ENCABEZADO la respalda. Sin esa regla, una columna de montos se marcaría como cédulas —
    // lo comprobó el fixture del kit, no una intuición.
    return ENCABEZADO_DE_CEDULA.test(contexto.nombre);
  },
};

// ── Telefonía ─────────────────────────────────────────────────────────────────────────────────
/**
 * Desde el 1-dic-2021 la numeración colombiana es de 10 dígitos, fijos y móviles. Los móviles
 * empiezan por 3; los fijos por 60 + dígito regional (601 Bogotá, 602 Cali, 604 Medellín…).
 * Fuente: CRC — https://www.crcom.gov.co/es/noticias/comunicado-prensa/inicia-implementacion-definitiva-nuevo-esquema-numeracion-y-marcacion
 */
function nacionalDeDiezDigitos(valor: string): string | null {
  let digitos = soloDigitos(valor);
  if (digitos.startsWith("57") && digitos.length === 12)
    digitos = digitos.slice(2); // +57
  return digitos.length === 10 ? digitos : null;
}

export const validadorCelular: Validador = {
  id: "celular-co",
  etiqueta: "Celular colombiano",
  fuente:
    "CRC — numeración unificada a 10 dígitos (1-dic-2021); móviles inician por 3",
  certeza: "estructural",
  categoria: "identificador-directo",
  prioridad: 70,
  valida(valor) {
    const numero = nacionalDeDiezDigitos(valor);
    return numero !== null && numero[0] === "3";
  },
};

export const validadorFijo: Validador = {
  id: "fijo-co",
  etiqueta: "Teléfono fijo colombiano",
  fuente:
    "CRC — numeración unificada a 10 dígitos: 60 + indicativo regional + 7 dígitos",
  certeza: "estructural",
  categoria: "identificador-directo",
  prioridad: 70,
  valida(valor) {
    const numero = nacionalDeDiezDigitos(valor);
    return numero !== null && numero.startsWith("60") && numero[2] !== "0";
  },
};

// ── Placas ────────────────────────────────────────────────────────────────────────────────────
/**
 * Carros: 3 letras + 3 dígitos (ABC123). Motos actuales: 3 letras + 2 dígitos + 1 letra (ABC12D).
 * Fuente: https://es.wikipedia.org/wiki/Anexo:Matr%C3%ADculas_automovil%C3%ADsticas_de_Colombia
 */
export const validadorPlaca: Validador = {
  id: "placa-co",
  etiqueta: "Placa de vehículo colombiana",
  fuente:
    "Formato oficial de matrículas de Colombia — carro ABC123, moto ABC12D",
  certeza: "estructural",
  categoria: "identificador-directo",
  prioridad: 80,
  valida(valor) {
    const limpio = valor.trim().toUpperCase();
    return (
      /^[A-Z]{3}\d{3}$/.test(limpio) || /^[A-Z]{3}\d{2}[A-Z]$/.test(limpio)
    );
  },
};
