#!/usr/bin/env node
// Generador sintético seeded — LA ÚNICA fuente de datos de prueba de Velo.
//
// Regla dura nº5 del producto: el repo es público y JAMÁS entra un dato real, ni en fixtures, ni
// en tests, ni en capturas. Todo lo que este generador produce sale de un PRNG con semilla, así
// que es *reproducible* (misma semilla ⇒ mismo archivo, byte por byte) sin ser real.
//
// Sobre el léxico: los nombres y apellidos son PALABRAS de uso común combinadas al azar por el
// PRNG, no registros de personas; los municipios son datos geográficos públicos. Ninguna fila
// corresponde a un ser humano.
//
// Lo que este generador hace y ningún dataset "bonito" haría — la regla anti-supuesto-compartido
// (habla S2): un fixture que solo trae casos válidos prueba el código contra sus propios
// supuestos. Por eso aquí entran a propósito NITs con DV inválido, cédulas imposibles, celulares
// de 9 dígitos, tarjetas que fallan Luhn, celdas vacías, formatos con puntos y guiones — y
// COLUMNAS-TRAMPA que parecen sensibles y no lo son (un código interno de 10 dígitos que parece
// cédula; una referencia de pago que pasa Luhn por accidente).
//
// Uso:
//   node docs/kit-de-prueba/generador.mjs --filas 1000 --seed 42 --salida datos.csv
//   node docs/kit-de-prueba/generador.mjs --filas 500000 --seed 42 --perfil clinico
//   pnpm kit:generar -- --filas 5000 --perfil limpio --salida tmp/limpio.csv
//
// Perfiles: clinico (default, mezcla completa con datos del art. 5) · limpio (cero datos
// personales: el estado "archivo limpio" de la UI) · trampas (concentra los señuelos).

import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";

// ── Aleatoriedad reproducible ─────────────────────────────────────────────────────────────────
// mulberry32: PRNG de 32 bits, determinista y sin dependencias. Cero Math.random() en todo el
// archivo — es la misma regla que gobierna el motor.
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crearAzar(semilla) {
  const rnd = mulberry32(semilla);
  return {
    /** Entero en [min, max] inclusive. */
    entero: (min, max) => min + Math.floor(rnd() * (max - min + 1)),
    /** Elemento de un arreglo. */
    de: (lista) => lista[Math.floor(rnd() * lista.length)],
    /** true con probabilidad p. */
    conProbabilidad: (p) => rnd() < p,
    /** Cadena de n dígitos, con el primero opcionalmente forzado. */
    digitos: (n, primero) => {
      let s = primero ?? String(1 + Math.floor(rnd() * 9));
      while (s.length < n) s += String(Math.floor(rnd() * 10));
      return s;
    },
  };
}

// ── Algoritmos oficiales (los mismos que validará el motor, aquí para GENERAR) ─────────────────

/**
 * Dígito de verificación del NIT — DIAN, Orden Administrativa 4 de 1989.
 * Pesos primos de derecha a izquierda, suma ponderada, módulo 11.
 * Fuente: https://es.wikipedia.org/wiki/N%C3%BAmero_de_Identificaci%C3%B3n_Tributaria_(Colombia)
 */
const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function digitoVerificacionNit(numero) {
  const digitos = String(numero).replace(/\D/g, "");
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    const desdeLaDerecha = digitos.length - 1 - i;
    suma += Number(digitos[i]) * PESOS_NIT[desdeLaDerecha];
  }
  const residuo = suma % 11;
  return residuo < 2 ? residuo : 11 - residuo;
}

/**
 * Luhn (mod 10) — ISO/IEC 7812-1. Devuelve el dígito que hace válida la cadena.
 * Fuente: https://www.creditcardvalidator.org/articles/luhn-algorithm
 */
export function digitoLuhn(sinDigitoFinal) {
  let suma = 0;
  let duplicar = true; // el dígito de control va a la derecha: el anterior se duplica
  for (let i = sinDigitoFinal.length - 1; i >= 0; i--) {
    let d = Number(sinDigitoFinal[i]);
    if (duplicar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    duplicar = !duplicar;
  }
  return (10 - (suma % 10)) % 10;
}

/**
 * IBAN — ISO 13616 con checksum mod 97-10 de ISO 7064.
 * Fuente: https://www.iso.org/standard/81090.html (algoritmo descrito en ISO 7064)
 */
export function ibanConChecksum(pais, bban) {
  const reordenado = `${bban}${pais}00`;
  const numerico = reordenado.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let residuo = 0;
  for (const c of numerico) residuo = (residuo * 10 + Number(c)) % 97;
  const control = String(98 - residuo).padStart(2, "0");
  return `${pais}${control}${bban}`;
}

// ── Léxicos (palabras, no personas) ───────────────────────────────────────────────────────────
const NOMBRES = [
  "María", "Juan", "Ana", "Carlos", "Luisa", "Andrés", "Camila", "Jorge", "Paula", "Diego",
  "Valentina", "Santiago", "Daniela", "Felipe", "Laura", "Sebastián", "Isabela", "Mateo",
];
const APELLIDOS = [
  "Gómez", "Rodríguez", "Martínez", "López", "Ramírez", "Torres", "Vargas", "Castro", "Rojas",
  "Moreno", "Jiménez", "Herrera", "Mendoza", "Peña", "Cárdenas", "Osorio",
];
const MUNICIPIOS = [
  "Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Cartagena", "Pereira", "Manizales",
  "Villavicencio", "Neiva", "Pasto", "Armenia", "Sincelejo", "Tunja", "Popayán", "Montería",
];
// Nombres y apellidos REALES pero POCO FRECUENTES, elegidos a propósito FUERA del diccionario
// del motor. Es la regla anti-supuesto-compartido aplicada al léxico: si el fixture solo trajera
// nombres que el diccionario ya conoce, el test estaría midiendo al motor contra su propia lista
// y jamás vería el falso negativo. Un apellido no deja de serlo por no estar en un diccionario.
const NOMBRES_RAROS = ["Zoraida", "Euclides", "Nohemí", "Arístides", "Yeimy", "Ovidio"];
const APELLIDOS_RAROS = ["Tarazona", "Chaparro", "Piraquive", "Cuéllar", "Anzola", "Bejarano"];
const DOMINIOS = ["ejemplo.com", "correo-demo.co", "prueba.org", "muestra.net"];
// Códigos con forma CIE-10 pero inventados: la columna es sensible (art. 5), el valor no es real.
const DIAGNOSTICOS = ["J45.9", "E11.9", "I10.X", "F32.1", "M54.5", "K21.0", "N39.0", "B24.X"];
const ASEGURADORAS = ["Salud Aurora", "Prevención Andes", "Vital Caribe", "Mutual Orinoco"];
const GRUPOS_ETNICOS = ["Ninguno", "Afrodescendiente", "Indígena", "Raizal", "Rrom"];
const SEXOS = ["F", "M", "O"];
const SUCURSALES = ["SUC-01", "SUC-02", "SUC-03", "SUC-07", "SUC-11"];

// ── Fábricas de valores, con sus casos FUERA de rango ──────────────────────────────────────────
// `tasaInvalida` es la fracción de valores que se emiten deliberadamente rotos. No es ruido: es
// lo que impide que el clasificador se pruebe contra su propio supuesto.

function cedula(azar, tasaInvalida) {
  if (azar.conProbabilidad(tasaInvalida)) {
    // Imposibles reales: cero, demasiado corta, demasiado larga, con letras.
    return azar.de(["0", "99", "1", "123456789012", "10A2456789"]);
  }
  // NUIP actual (10 dígitos desde 1.000.000.000) y series históricas de hasta 8.
  return azar.conProbabilidad(0.7)
    ? String(azar.entero(1_000_000_000, 1_299_999_999))
    : String(azar.entero(1_000_000, 79_999_999));
}

function nit(azar, tasaInvalida) {
  const base = String(azar.entero(800_000_000, 999_999_999));
  const dv = digitoVerificacionNit(base);
  if (azar.conProbabilidad(tasaInvalida)) {
    // DV incorrecto: el caso que separa un validador real de una expresión regular.
    return `${base}-${(dv + 1) % 10}`;
  }
  // Con y sin puntos: el mismo NIT escrito como lo escribe la gente.
  return azar.conProbabilidad(0.3)
    ? `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6)}-${dv}`
    : `${base}-${dv}`;
}

function celular(azar, tasaInvalida) {
  if (azar.conProbabilidad(tasaInvalida)) {
    // 9 dígitos (numeración vieja), prefijo que no existe, y el fijo disfrazado de móvil.
    return azar.de(["300123456", "4001234567", "31012345678", "60112345"]);
  }
  const numero = `3${azar.digitos(9, azar.de(["0", "1", "2", "5"]))}`.slice(0, 10);
  return azar.conProbabilidad(0.25)
    ? `+57 ${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}`
    : numero;
}

function telefonoFijo(azar) {
  // Numeración unificada CRC desde 1-dic-2021: 60 + indicativo regional + 7 dígitos.
  return `60${azar.de(["1", "2", "4", "5", "6", "7", "8"])}${azar.digitos(7)}`;
}

function placa(azar, tasaInvalida) {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const tres = () => azar.de(letras) + azar.de(letras) + azar.de(letras);
  if (azar.conProbabilidad(tasaInvalida)) return azar.de(["AB123", "ABCD12", "12ABC3", "ABC-123"]);
  return azar.conProbabilidad(0.75)
    ? `${tres()}${azar.digitos(3, String(azar.entero(0, 9)))}` // carro: ABC123
    : `${tres()}${azar.digitos(2, String(azar.entero(0, 9)))}${azar.de(letras)}`; // moto: ABC12D
}

function tarjeta(azar, tasaInvalida) {
  const base = `4${azar.digitos(14, String(azar.entero(0, 9)))}`.slice(0, 15);
  const valida = `${base}${digitoLuhn(base)}`;
  if (azar.conProbabilidad(tasaInvalida)) return `${base}${(digitoLuhn(base) + 3) % 10}`;
  return valida;
}

function correo(azar, nombre, apellido) {
  const usuario = `${nombre.toLowerCase()}.${apellido.toLowerCase()}${azar.entero(1, 99)}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // sin tildes: como las escribe un sistema de correo
  return `${usuario}@${azar.de(DOMINIOS)}`;
}

function fecha(azar, anioMin, anioMax) {
  const anio = azar.entero(anioMin, anioMax);
  const mes = azar.entero(1, 12);
  const dia = azar.entero(1, 28); // 28 evita meses inválidos sin sesgar el mes
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ── Definición de columnas por perfil ─────────────────────────────────────────────────────────
// Cada columna declara qué DEBERÍA detectar el motor. La tabla es, de hecho, el oráculo de los
// tests: si el clasificador dice otra cosa, o el motor falla o el generador miente.

const COLUMNAS = {
  // Identificadores directos
  cedula_titular: {
    tipo: "cedula",
    categoria: "identificador-directo",
    gen: (a, c) => cedula(a, c.tasaInvalida),
  },
  nit_empresa: {
    tipo: "nit",
    categoria: "identificador-directo",
    gen: (a, c) => nit(a, c.tasaInvalida),
  },
  celular: {
    tipo: "celular-co",
    categoria: "identificador-directo",
    gen: (a, c) => celular(a, c.tasaInvalida),
  },
  telefono_fijo: {
    tipo: "fijo-co",
    categoria: "identificador-directo",
    gen: (a) => telefonoFijo(a),
  },
  placa_vehiculo: {
    tipo: "placa-co",
    categoria: "identificador-directo",
    gen: (a, c) => placa(a, c.tasaInvalida),
  },
  correo: {
    tipo: "email",
    categoria: "identificador-directo",
    gen: (a, _c, f) => correo(a, f.nombre, f.apellido),
  },
  nombre_completo: {
    tipo: "nombre",
    categoria: "identificador-directo",
    gen: (a, _c, f) => `${f.nombre} ${f.apellido}`,
  },
  tarjeta_pago: {
    tipo: "tarjeta",
    categoria: "identificador-directo",
    gen: (a, c) => tarjeta(a, c.tasaInvalida),
  },
  cuenta_iban: {
    tipo: "iban",
    categoria: "identificador-directo",
    gen: (a) => ibanConChecksum("DE", `${a.digitos(8)}${a.digitos(10)}`),
  },
  ip_registro: {
    tipo: "ip",
    categoria: "cuasi-identificador",
    gen: (a) => `${a.entero(1, 223)}.${a.entero(0, 255)}.${a.entero(0, 255)}.${a.entero(1, 254)}`,
  },

  // Cuasi-identificadores: por sí solos no delatan; combinados, sí (Sweeney 2000 / Golle 2006).
  // El tipo lo dan los valores; la categoría, el encabezado — y el motor debe distinguirlo.
  fecha_nacimiento: {
    tipo: "fecha",
    categoria: "cuasi-identificador",
    gen: (a) => fecha(a, 1940, 2010),
  },
  sexo: { tipo: "categoria", categoria: "cuasi-identificador", gen: (a) => a.de(SEXOS) },
  municipio: { tipo: "categoria", categoria: "cuasi-identificador", gen: (a) => a.de(MUNICIPIOS) },
  estrato: { tipo: "numero", categoria: "cuasi-identificador", gen: (a) => String(a.entero(1, 6)) },
  latitud: {
    tipo: "coordenada",
    categoria: "cuasi-identificador",
    gen: (a) => (a.entero(-4_000_000, 12_000_000) / 1e6).toFixed(6),
  },
  longitud: {
    tipo: "coordenada",
    categoria: "cuasi-identificador",
    gen: (a) => (a.entero(-79_000_000, -67_000_000) / 1e6).toFixed(6),
  },

  // Datos sensibles — Ley 1581 art. 5. Ningún algoritmo puede mirar "J45.9" y afirmar que es
  // salud: aquí el motor SOLO puede apoyarse en el encabezado, y tiene que decirlo.
  diagnostico: { tipo: "categoria", categoria: "dato-sensible", gen: (a) => a.de(DIAGNOSTICOS) },
  aseguradora: { tipo: "categoria", categoria: "dato-sensible", gen: (a) => a.de(ASEGURADORAS) },
  grupo_etnico: { tipo: "categoria", categoria: "dato-sensible", gen: (a) => a.de(GRUPOS_ETNICOS) },

  // COLUMNAS-TRAMPA: parecen sensibles y no lo son. Si el motor las marca, es un falso positivo.
  codigo_interno: {
    tipo: "cedula",
    categoria: "identificador-directo",
    trampa:
      "10 dígitos con forma de cédula, pero es un consecutivo del sistema. La cédula colombiana " +
      "NO tiene dígito de verificación público, así que ningún motor determinista puede " +
      "distinguirlos: el `tipo` esperado es el falso positivo, a propósito. Lo que Velo sí debe " +
      "hacer es declarar la certeza como estructural para que el usuario lo corrija.",
    gen: (a) => String(1_400_000_000 + a.entero(0, 99_999_999)),
  },
  referencia_pago: {
    tipo: "numero",
    categoria: "no-personal",
    trampa:
      "16 dígitos que pasan Luhn a propósito. NO es tarjeta: el primer dígito (MII de ISO/IEC " +
      "7812-1) es 9, reservado a asignación nacional. Velo debe rechazarla por esa regla oficial.",
    gen: (a) => {
      const base = a.digitos(15, "9");
      return `${base}${digitoLuhn(base)}`;
    },
  },

  // No personal
  sucursal: { tipo: "categoria", categoria: "no-personal", gen: (a) => a.de(SUCURSALES) },
  monto: { tipo: "numero", categoria: "no-personal", gen: (a) => String(a.entero(10_000, 9_999_999)) },
  fecha_atencion: { tipo: "fecha", categoria: "no-personal", gen: (a) => fecha(a, 2024, 2026) },
};

const PERFILES = {
  clinico: Object.keys(COLUMNAS),
  limpio: ["sucursal", "monto", "fecha_atencion", "estrato"],
  trampas: ["codigo_interno", "referencia_pago", "sucursal", "monto", "cedula_titular"],
};

// ── Escritura CSV ─────────────────────────────────────────────────────────────────────────────
const necesitaComillas = /[",\n\r]/;

function celdaCsv(valor) {
  return necesitaComillas.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}

async function escribir(stream, texto) {
  if (!stream.write(texto)) await once(stream, "drain");
}

/**
 * Emite el encabezado y luego una fila por vez. Es un generador para que el CSV pueda escribirse
 * en streaming (500k filas no caben cómodas en memoria) y el XLSX pueda acumularlas — el formato
 * cambia; los datos, con la misma semilla, jamás.
 */
export function* generarFilas({ filas, seed, perfil, tasaInvalida, tasaVacia }) {
  const columnas = PERFILES[perfil];
  if (!columnas) throw new Error(`perfil desconocido: ${perfil}`);

  const azar = crearAzar(seed);
  const config = { tasaInvalida, tasaVacia };
  yield columnas;

  for (let i = 0; i < filas; i++) {
    // El nombre se sortea una vez por fila para que `correo` y `nombre_completo` sean coherentes:
    // sin esa coherencia, el riesgo por clases de equivalencia sería irreal.
    const fila = azar.conProbabilidad(tasaInvalida)
      ? { nombre: azar.de(NOMBRES_RAROS), apellido: azar.de(APELLIDOS_RAROS) }
      : { nombre: azar.de(NOMBRES), apellido: azar.de(APELLIDOS) };
    yield columnas.map((nombre) => {
      const valor = COLUMNAS[nombre].gen(azar, config, fila);
      // Las celdas vacías son parte del terreno: un archivo real las trae y el motor no puede
      // dividir por cero al calcular el % de aciertos sobre no-vacíos.
      return azar.conProbabilidad(tasaVacia) ? "" : valor;
    });
  }
}

export async function generarCsv(opciones) {
  const { salida } = opciones;
  const hash = createHash("sha256");
  mkdirSync(dirname(salida), { recursive: true });
  const stream = createWriteStream(salida);

  let columnas = null;
  let bloque = "";
  for (const fila of generarFilas(opciones)) {
    if (!columnas) columnas = fila;
    bloque += `${fila.map(celdaCsv).join(",")}\n`;
    if (bloque.length > 1 << 20) {
      hash.update(bloque);
      await escribir(stream, bloque);
      bloque = "";
    }
  }
  if (bloque) {
    hash.update(bloque);
    await escribir(stream, bloque);
  }

  stream.end();
  await once(stream, "finish");
  return { sha256: hash.digest("hex"), columnas };
}

/**
 * Variante XLSX. SheetJS no tiene escritura en streaming en el navegador ni aquí: el libro entero
 * vive en memoria antes de escribirse — que es exactamente la razón por la que Excel tiene un tope
 * declarado en Velo y el CSV no (ver decisions/003-excel-tope-y-suministro.md).
 */
export async function generarXlsx(opciones) {
  const { salida } = opciones;
  const XLSX = await import("xlsx");
  // El build ESM de SheetJS no trae `fs` cableado: en Node hay que inyectarlo o `writeFile`
  // falla con "cannot save file". En el navegador no aplica (allá se escribe a Blob).
  XLSX.set_fs(await import("node:fs"));
  const matriz = [...generarFilas(opciones)];
  const hoja = XLSX.utils.aoa_to_sheet(matriz, { dense: true });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "datos");
  mkdirSync(dirname(salida), { recursive: true });
  XLSX.writeFile(libro, salida, { compression: true });
  return { sha256: null, columnas: matriz[0] };
}

/**
 * Oráculo del kit: qué debería detectar el motor en cada columna. Lo consumen los tests, así que
 * el generador no es solo la fuente de datos — es también la respuesta correcta contra la que se
 * mide el motor.
 */
export function esperadoPorColumna(perfil = "clinico") {
  return Object.fromEntries(
    PERFILES[perfil].map((nombre) => [
      nombre,
      {
        tipo: COLUMNAS[nombre].tipo,
        categoria: COLUMNAS[nombre].categoria,
        trampa: COLUMNAS[nombre].trampa ?? null,
      },
    ]),
  );
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
function leerArgumentos(argv) {
  const opciones = {
    filas: 1000,
    seed: 42,
    perfil: "clinico",
    formato: "csv",
    salida: "",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const clave = argv[i]?.replace(/^--/, "");
    const valor = argv[i + 1];
    if (clave === undefined || valor === undefined) continue;
    if (clave === "perfil" || clave === "salida" || clave === "formato") opciones[clave] = valor;
    else if (clave in opciones) opciones[clave] = Number(valor);
  }
  if (!opciones.salida) {
    opciones.salida =
      `tmp/kit-de-prueba/${opciones.perfil}-${opciones.filas}-s${opciones.seed}.${opciones.formato}`;
  }
  return opciones;
}

const esEjecucionDirecta = process.argv[1] && process.argv[1].endsWith("generador.mjs");

if (esEjecucionDirecta) {
  const opciones = leerArgumentos(process.argv.slice(2));
  opciones.salida = resolve(process.cwd(), opciones.salida);
  const inicio = Date.now();
  const generar = opciones.formato === "xlsx" ? generarXlsx : generarCsv;
  const { sha256, columnas } = await generar(opciones);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(2);
  console.log(`✓ ${opciones.filas} filas × ${columnas.length} columnas · perfil ${opciones.perfil}`);
  console.log(`  archivo : ${opciones.salida}`);
  console.log(`  semilla : ${opciones.seed}  (misma semilla ⇒ mismo archivo, byte por byte)`);
  if (sha256) console.log(`  sha-256 : ${sha256}`);
  console.log(`  tiempo  : ${segundos} s`);
}
