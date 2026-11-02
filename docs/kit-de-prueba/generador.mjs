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
//   pnpm kit:generar -- --filas 2000 --perfil anidado --formato json --salida tmp/anidado.json
//   pnpm kit:generar -- --filas 2000 --perfil anidado --formato jsonl --salida tmp/anidado.jsonl
//   pnpm kit:generar -- --formato jpeg --seed 42 --salida tmp/foto.jpg --centinelas tmp/foto.json
//   pnpm kit:generar -- --formato pdf --perfil con-revisiones --seed 42 --salida tmp/doc.pdf
//
// Formatos (`--formato`): csv (default) · xlsx · json (UN arreglo de objetos) · jsonl (JSON Lines,
// un objeto por línea). Un formato desconocido es un error: jamás cae en silencio a CSV.
//
// Perfiles planos (valen en los cuatro formatos; en JSON las columnas numéricas salen como número):
// clinico (default, mezcla completa con datos del art. 5) · limpio (cero datos personales: el
// estado "archivo limpio" de la UI) · trampas (concentra los señuelos) · sin-personales (ni un
// cuasi-identificador) · mediana-repetida (el caso duro de Mondrian) · colisiones-de-formato.
//
// Perfiles solo JSON (`--formato json|jsonl`): anidado (objetos dentro de objetos) · con-listas
// (anidado + `contactos[]` y `etiquetas[]`, que Velo debe DECLARAR como no tratadas) ·
// heterogeneo (claves que faltan, tipos mezclados, null vs ausente vs "", un número mayor que
// 2⁵³, la clave `__proto__` y claves enteras fuera de orden).
//
// Binarios con metadatos falsos (`--formato pdf|jpeg|png|webp`, carpeta `binarios/`): archivos VÁLIDOS
// (un visor los abre, un navegador muestra la imagen) cargados de metadatos inventados, para probar
// la limpieza. Misma semilla ⇒ mismos bytes. `--centinelas <ruta>` escribe un JSON con las cadenas
// que quedaron escondidas en los metadatos (todas ≥ 6 caracteres, ninguna en el contenido visible):
// el test las busca en la salida del limpiador y afirma que ya no están. No llevan `--filas` ni
// `--perfil`, salvo el PDF: `--perfil simple|con-revisiones|cifrado|firmado` (default con-revisiones).
//
// La forma canónica de JSON que escribe el kit: compacta (sin espacios), una línea por registro.
//   json  : "[\n" + registros.join(",\n") + "\n]\n"
//   jsonl : cada registro + "\n"
// Es la misma que reescribe el motor de Velo, así que el viaje de identidad es byte-igual.

import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";

import {
  APELLIDOS,
  DOMINIOS,
  MUNICIPIOS,
  NOMBRES,
  cedula,
  crearAzar,
} from "./binarios/azar.mjs";
import { generarJpeg } from "./binarios/jpeg.mjs";
import { PERFILES_PDF, generarPdf } from "./binarios/pdf.mjs";
import { generarPng } from "./binarios/png.mjs";
import { generarWebp } from "./binarios/webp.mjs";

// ── Aleatoriedad reproducible ─────────────────────────────────────────────────────────────────
// `crearAzar` (mulberry32, sin Math.random) y los léxicos de nombres y municipios viven en
// `binarios/azar.mjs`, compartidos con los generadores de binarios. Sigue siendo el mismo PRNG:
// misma semilla ⇒ mismo archivo, byte por byte.

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
// Nombres y apellidos REALES pero POCO FRECUENTES, elegidos a propósito FUERA del diccionario
// del motor. Es la regla anti-supuesto-compartido aplicada al léxico: si el fixture solo trajera
// nombres que el diccionario ya conoce, el test estaría midiendo al motor contra su propia lista
// y jamás vería el falso negativo. Un apellido no deja de serlo por no estar en un diccionario.
const NOMBRES_RAROS = ["Zoraida", "Euclides", "Nohemí", "Arístides", "Yeimy", "Ovidio"];
const APELLIDOS_RAROS = ["Tarazona", "Chaparro", "Piraquive", "Cuéllar", "Anzola", "Bejarano"];
// Códigos con forma CIE-10 pero inventados: la columna es sensible (art. 5), el valor no es real.
const DIAGNOSTICOS = ["J45.9", "E11.9", "I10.X", "F32.1", "M54.5", "K21.0", "N39.0", "B24.X"];
const ASEGURADORAS = ["Salud Aurora", "Prevención Andes", "Vital Caribe", "Mutual Orinoco"];
const GRUPOS_ETNICOS = ["Ninguno", "Afrodescendiente", "Indígena", "Raizal", "Rrom"];
const SEXOS = ["F", "M", "O"];
const SUCURSALES = ["SUC-01", "SUC-02", "SUC-03", "SUC-07", "SUC-11"];

// ── Fábricas de valores, con sus casos FUERA de rango ──────────────────────────────────────────
// `tasaInvalida` es la fracción de valores que se emiten deliberadamente rotos. No es ruido: es
// lo que impide que el clasificador se pruebe contra su propio supuesto.

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

/**
 * El nombre se sortea una vez por registro para que `correo` y `nombre` sean coherentes: sin esa
 * coherencia, el riesgo por clases de equivalencia sería irreal. Con probabilidad `tasaInvalida`
 * el registro lleva un nombre FUERA del diccionario del motor (ver NOMBRES_RAROS).
 */
function sortearPersona(azar, tasaInvalida) {
  return azar.conProbabilidad(tasaInvalida)
    ? { nombre: azar.de(NOMBRES_RAROS), apellido: azar.de(APELLIDOS_RAROS) }
    : { nombre: azar.de(NOMBRES), apellido: azar.de(APELLIDOS) };
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

// ── Columnas de MEDIANA REPETIDA — el caso que rompe a Mondrian si se corta por POSICIÓN ───────
//
// Un dataset uniforme nunca expone ese defecto: con valores bien repartidos, cortar por la posición
// central y cortar por el VALOR de la mediana dan casi lo mismo. La diferencia solo aparece cuando
// la mediana se repite tanto que cae a los dos lados del corte por posición — y entonces dos filas
// con el MISMO valor reciben etiquetas distintas, la generalización deja de ser una función del
// valor, y el archivo pasa a depender del orden en que llegaron las filas. Aquí el sesgo ES el
// fixture: sin él, el test obligatorio del ADR-002 §3 pasaría sin haber probado nada.
//
// Viven fuera de `COLUMNAS` a propósito: el perfil `clinico` es `Object.keys(COLUMNAS)`, así que
// añadirlas ahí cambiaría el archivo del S1 —y su hash, y sus fixtures de e2e— sin pedir permiso.
const COLUMNAS_SESGADAS = {
  edad_reportada: {
    tipo: "numero",
    categoria: "cuasi-identificador",
    gen: (a) => (a.conProbabilidad(0.55) ? "40" : String(a.entero(18, 89))),
  },
  puntaje_triage: {
    tipo: "numero",
    categoria: "cuasi-identificador",
    gen: (a) => (a.conProbabilidad(0.82) ? "50" : String(a.entero(0, 100))),
  },
};

const TODAS_LAS_COLUMNAS = { ...COLUMNAS, ...COLUMNAS_SESGADAS };

const PERFILES = {
  clinico: Object.keys(COLUMNAS),
  limpio: ["sucursal", "monto", "fecha_atencion", "estrato"],
  trampas: ["codigo_interno", "referencia_pago", "sucursal", "monto", "cedula_titular"],
  // Para Mondrian: dos columnas con la mediana clavada (55 % en `40`, 82 % en `50`) junto a
  // cuasi-identificadores normales y un dato sensible del art. 5 para medir l-diversity.
  "mediana-repetida": [
    "sexo",
    "municipio",
    "estrato",
    "edad_reportada",
    "puntaje_triage",
    "diagnostico",
    "monto",
  ],
  // Para el REGRESO (S3): un archivo donde la colisión de formato es segura, no probable.
  //
  // Un seudónimo con formato de NIT tiene que caber en 9 dígitos que empiezan por 8 o 9: son
  // 2×10⁸ valores posibles, no 2⁶⁴. Por la paradoja del cumpleaños, con n NITs distintos caben
  // esperar n²/(2·2×10⁸) pares que colisionen — o sea que la colisión no es un caso raro que haya
  // que esperar sentado: es aritmética, y con suficientes filas ocurre siempre.
  //
  //     n = 20.000 → ~1 par        n = 60.000 → ~9 pares       n = 100.000 → ~25 pares
  //
  // Este perfil existe para que la ambigüedad de la restauración se pruebe con datos que la
  // producen de verdad, y no solo con una bóveda escrita a mano. Con 60.000 filas la probabilidad
  // de NO ver ninguna colisión es de una entre ocho mil. Y con semilla fija y llave fija, el número
  // exacto es reproducible: el test lo afirma, no lo tolera.
  //
  // `cedula_titular` va al lado a propósito: su rango (10⁹) es cinco veces mayor, así que con las
  // mismas filas colisiona mucho menos. Sirve para que el fixture tenga una columna reversible
  // limpia junto a la sucia, que es el caso realista.
  "colisiones-de-formato": ["nit_empresa", "cedula_titular", "sucursal"],
  // Sin una sola columna personal — ni siquiera un cuasi-identificador. Existe para poder llegar
  // al estado "no reconocimos datos personales" de la interfaz por el camino real (soltando un
  // archivo), y no solo en un test con un informe de mentira. `limpio` no sirve para eso: su
  // `estrato` es un cuasi-identificador de manual, y así debe seguir siendo.
  "sin-personales": ["sucursal", "monto", "fecha_atencion"],
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
    const fila = sortearPersona(azar, tasaInvalida);
    yield columnas.map((nombre) => {
      const valor = TODAS_LAS_COLUMNAS[nombre].gen(azar, config, fila);
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

// ── JSON y JSON Lines ─────────────────────────────────────────────────────────────────────────
//
// Un registro JSON NO se construye con objetos de JavaScript: un objeto reordena las claves que
// parecen enteros ("2" va después de "1"), traga la clave `__proto__` como si fuera el prototipo
// y redondea los números que pasan de 2⁵³. Justo lo que este kit necesita poder escribir. Por eso
// el registro es un `Map` (conserva el orden de inserción de CUALQUIER clave) y el número que
// debe salir tal cual se escribe va envuelto en `NumeroCrudo`. La clave que no debe estar, no se
// inserta: «ausente» y «null» son cosas distintas y el kit emite las dos.

class NumeroCrudo {
  constructor(texto) {
    this.texto = texto;
  }
}

/** Forma canónica: compacta, claves en el orden de inserción, cadenas como las deja JSON.stringify. */
export function serializarRegistro(valor) {
  if (valor === null) return "null";
  if (valor instanceof NumeroCrudo) return valor.texto;
  if (valor instanceof Map) {
    let cuerpo = "";
    for (const [clave, hijo] of valor) {
      cuerpo += `${cuerpo ? "," : ""}${JSON.stringify(clave)}:${serializarRegistro(hijo)}`;
    }
    return `{${cuerpo}}`;
  }
  if (Array.isArray(valor)) return `[${valor.map(serializarRegistro).join(",")}]`;
  if (typeof valor === "string" || typeof valor === "boolean") return JSON.stringify(valor);
  if (typeof valor === "number" && Number.isFinite(valor)) return JSON.stringify(valor);
  throw new Error(`valor que el kit no sabe escribir como JSON: ${String(valor)}`);
}

// Léxicos de los perfiles JSON (palabras inventadas, como los de arriba).
const CALLES = ["Calle", "Carrera", "Avenida", "Diagonal", "Transversal"];
const PARENTESCOS = ["madre", "padre", "hermana", "hermano", "pareja", "vecina"];
const ETIQUETAS = [
  "seguimiento",
  "control",
  "prioritario",
  "pendiente-de-pago",
  "domicilio",
  "teleconsulta",
];
// Textos libres con lo que un serializador suele estropear: comillas, barra invertida, salto de
// línea, tildes y un carácter fuera del plano básico. JSON.stringify los escapa de UNA sola
// manera, y esa es la forma canónica que el motor debe reproducir al re-escribirlos.
const OBSERVACIONES = [
  "sin novedad",
  'dijo "vuelvo mañana"',
  "ruta C:\\datos\\sede",
  "línea 1\nlínea 2",
  "muy amable 👍",
  "control en 15 días / ver anexo #3",
];
const NOTAS_INTERNAS = ["nota interna", "sin marca", "revisado"];
// Números que deben salir EXACTAMENTE como se escribieron: exponente, ceros finales, cero negativo.
const NUMEROS_CRUDOS = ["1E3", "2.50", "1.5e-3", "-0.0", "0.10", "100", "3.14159"];

function direccion(azar) {
  return `${azar.de(CALLES)} ${azar.entero(1, 170)} # ${azar.entero(1, 99)}-${azar.entero(1, 99)}`;
}

/** Con probabilidad `tasaVacia` la hoja sale vacía ("" en texto, null en número). */
function conVacio(azar, config, valor, vacio = "") {
  return azar.conProbabilidad(config.tasaVacia) ? vacio : valor;
}

/** Anidado: objetos dentro de objetos, todas las rutas presentes en todos los registros. */
function registroAnidado(azar, config) {
  const { tasaInvalida } = config;
  const persona = sortearPersona(azar, tasaInvalida);
  const nacimiento = fecha(azar, 1940, 2010);
  const paciente = new Map([
    ["documento", conVacio(azar, config, cedula(azar, tasaInvalida))],
    ["nombre", conVacio(azar, config, `${persona.nombre} ${persona.apellido}`)],
    ["nacimiento", conVacio(azar, config, nacimiento)],
    [
      "contacto",
      new Map([
        ["correo", conVacio(azar, config, correo(azar, persona.nombre, persona.apellido))],
        ["celular", conVacio(azar, config, celular(azar, tasaInvalida))],
      ]),
    ],
  ]);
  const ubicacion = new Map([
    ["ciudad", conVacio(azar, config, azar.de(MUNICIPIOS))],
    ["direccion", conVacio(azar, config, direccion(azar))],
  ]);
  const empleador = new Map([["nit", conVacio(azar, config, nit(azar, tasaInvalida))]]);
  const atencion = new Map([
    ["fecha", conVacio(azar, config, fecha(azar, 2024, 2026))],
    ["diagnostico", conVacio(azar, config, azar.de(DIAGNOSTICOS))],
    // La edad sale coherente con el nacimiento: es un NÚMERO JSON, no un texto.
    ["edad", conVacio(azar, config, 2026 - Number(nacimiento.slice(0, 4)), null)],
  ]);
  return new Map([
    ["paciente", paciente],
    ["ubicacion", ubicacion],
    ["empleador", empleador],
    ["atencion", atencion],
  ]);
}

/** Con listas: lo anterior más dos listas, que Velo declara «no tratadas» y copia crudas. */
function registroConListas(azar, config) {
  const registro = registroAnidado(azar, config);
  const contactos = [];
  for (let i = azar.entero(0, 3); i > 0; i--) {
    contactos.push(
      new Map([
        [
          "correo",
          conVacio(azar, config, correo(azar, azar.de(NOMBRES), azar.de(APELLIDOS))),
        ],
        ["parentesco", azar.de(PARENTESCOS)],
      ]),
    );
  }
  const etiquetas = [];
  for (let i = azar.entero(0, 4); i > 0; i--) etiquetas.push(azar.de(ETIQUETAS));
  registro.set("contactos", contactos);
  registro.set("etiquetas", etiquetas);
  return registro;
}

/**
 * Heterogéneo: el JSON del mundo real, donde cada registro es un poco distinto. Cada rareza está
 * ahí a propósito (ver `CAMPOS_HETEROGENEO`): claves que faltan, un camino que es texto en unos
 * registros y objeto en otros, null vs ausente vs "", un número mayor que 2⁵³ escrito como número,
 * la clave `__proto__` y claves enteras en un orden que un objeto de JavaScript no respetaría.
 * Los dos primeros registros llevan números largos fijos para que un test pueda buscarlos.
 */
function registroHeterogeneo(azar, config, indice) {
  const { tasaInvalida } = config;
  const persona = sortearPersona(azar, tasaInvalida);
  const serialLargo = azar.conProbabilidad(0.2);
  const serialSorteado = azar.digitos(serialLargo ? 20 : 17, "1");
  const serial =
    indice === 0 ? "12345678901234567" : indice === 1 ? "12345678901234567890" : serialSorteado;

  const documento = cedula(azar, tasaInvalida);
  const documentoComoNumero = azar.conProbabilidad(0.3) && /^[1-9]\d*$/.test(documento);
  const tipoDeEdad = azar.entero(0, 6); // 0-4 número · 5 texto · 6 null
  const edad = azar.entero(18, 90);
  const estadoDelCelular = azar.entero(0, 4); // 0-1 valor · 2 "" · 3 null · 4 ausente
  const celularValor = celular(azar, tasaInvalida);
  const contactoEsObjeto = azar.conProbabilidad(0.5);
  const correoValor = correo(azar, persona.nombre, persona.apellido);
  const celularDeContacto = celular(azar, tasaInvalida);

  const paciente = new Map();
  paciente.set("documento", documentoComoNumero ? Number(documento) : documento);
  paciente.set("nombre", conVacio(azar, config, `${persona.nombre} ${persona.apellido}`));
  paciente.set("edad", tipoDeEdad <= 4 ? edad : tipoDeEdad === 5 ? String(edad) : null);
  if (estadoDelCelular <= 1) paciente.set("celular", celularValor);
  else if (estadoDelCelular === 2) paciente.set("celular", "");
  else if (estadoDelCelular === 3) paciente.set("celular", null);
  paciente.set(
    "contacto",
    contactoEsObjeto
      ? new Map([
          ["correo", correoValor],
          ["celular", celularDeContacto],
        ])
      : correoValor,
  );

  const ciudad = azar.de(MUNICIPIOS);
  const hayCiudad = !azar.conProbabilidad(0.2);
  const nitValor = nit(azar, tasaInvalida);
  const hayEmpleador = azar.conProbabilidad(0.3);
  const protoDocumento = cedula(azar, tasaInvalida);
  const protoNota = azar.de(NOTAS_INTERNAS);
  const referenciaDos = celular(azar, tasaInvalida);
  const referenciaUno = correo(azar, azar.de(NOMBRES), azar.de(APELLIDOS));
  const lectura = azar.de(NUMEROS_CRUDOS);
  const activo = azar.conProbabilidad(0.5);
  const observacion = azar.de(OBSERVACIONES);
  const hayObservacion = !azar.conProbabilidad(0.3);

  const registro = new Map();
  registro.set("id", indice + 1);
  registro.set("serial", new NumeroCrudo(serial));
  registro.set("paciente", paciente);
  if (hayCiudad) registro.set("ciudad", conVacio(azar, config, ciudad));
  if (hayEmpleador) registro.set("empleador", new Map([["nit", nitValor]]));
  registro.set(
    "__proto__",
    new Map([
      ["documento", protoDocumento],
      ["nota", protoNota],
    ]),
  );
  // Claves enteras: un objeto de JavaScript las pondría como "1", "2". El archivo dice "2", "1".
  registro.set(
    "referencias",
    new Map([
      ["2", conVacio(azar, config, referenciaDos)],
      ["1", conVacio(azar, config, referenciaUno)],
    ]),
  );
  registro.set("lectura", new NumeroCrudo(lectura));
  registro.set("activo", activo);
  if (hayObservacion) registro.set("observacion", observacion);
  return registro;
}

// Cada ruta declara qué DEBERÍA detectar el motor, igual que `COLUMNAS` para los perfiles planos.
// `presencia`: "siempre" (en todos los registros) o "parcial" (en algunos). `tipos`: los tipos de
// valor JSON que puede traer, con las tasas por defecto. Las rutas usan «.» y, para listas, `[]`
// (`contactos[]`); ninguna clave del kit lleva «.», «[», «]» ni «\», así que no hay escapes.
function campo(ruta, tipo, categoria, tipos, presencia = "siempre") {
  return { ruta, tipo, categoria, tipos, presencia };
}

const CAMPOS_ANIDADO = [
  campo("paciente.documento", "cedula", "identificador-directo", ["string"]),
  campo("paciente.nombre", "nombre", "identificador-directo", ["string"]),
  campo("paciente.nacimiento", "fecha", "cuasi-identificador", ["string"]),
  campo("paciente.contacto.correo", "email", "identificador-directo", ["string"]),
  campo("paciente.contacto.celular", "celular-co", "identificador-directo", ["string"]),
  campo("ubicacion.ciudad", "categoria", "cuasi-identificador", ["string"]),
  // Sin validador de valores: el encabezado «direccion» es lo único que la delata.
  campo("ubicacion.direccion", "texto", "identificador-directo", ["string"]),
  campo("empleador.nit", "nit", "identificador-directo", ["string"]),
  campo("atencion.fecha", "fecha", "no-personal", ["string"]),
  campo("atencion.diagnostico", "categoria", "dato-sensible", ["string"]),
  campo("atencion.edad", "numero", "cuasi-identificador", ["number", "null"]),
];

const LISTAS_CON_LISTAS = [
  {
    ruta: "contactos[]",
    elementos: "objetos",
    rutasHijas: ["contactos[].correo", "contactos[].parentesco"],
  },
  { ruta: "etiquetas[]", elementos: "textos", rutasHijas: [] },
];

const CAMPOS_HETEROGENEO = [
  campo("id", "numero", "no-personal", ["number"]),
  // Número de 17 o 20 dígitos, mayor que 2⁵³, escrito como NÚMERO JSON (no como texto).
  campo("serial", "numero", "no-personal", ["number"]),
  campo("paciente.documento", "cedula", "identificador-directo", ["string", "number"]),
  campo("paciente.nombre", "nombre", "identificador-directo", ["string"]),
  campo("paciente.edad", "numero", "cuasi-identificador", ["number", "string", "null"]),
  // Valor, "", null o ausente, en proporciones parecidas.
  campo("paciente.celular", "celular-co", "identificador-directo", ["string", "null"], "parcial"),
  // Texto (un correo) en unos registros, objeto en otros: la misma ruta con dos formas.
  campo("paciente.contacto", "email", "identificador-directo", ["string", "object"]),
  campo("paciente.contacto.correo", "email", "identificador-directo", ["string"], "parcial"),
  campo("paciente.contacto.celular", "celular-co", "identificador-directo", ["string"], "parcial"),
  campo("ciudad", "categoria", "cuasi-identificador", ["string"], "parcial"),
  campo("empleador.nit", "nit", "identificador-directo", ["string"], "parcial"),
  // La clave `__proto__` como clave de datos, con hijos.
  campo("__proto__.documento", "cedula", "identificador-directo", ["string"]),
  campo("__proto__.nota", "texto", "no-personal", ["string"]),
  // Claves enteras, escritas "2" antes que "1".
  campo("referencias.2", "celular-co", "identificador-directo", ["string"]),
  campo("referencias.1", "email", "identificador-directo", ["string"]),
  // Números que deben salir tal cual: 1E3, 2.50, -0.0…
  campo("lectura", "numero", "no-personal", ["number"]),
  campo("activo", "booleano", "no-personal", ["boolean"]),
  campo("observacion", "texto", "no-personal", ["string"], "parcial"),
];

const PERFILES_JSON = {
  anidado: { construir: registroAnidado, campos: CAMPOS_ANIDADO, listas: [] },
  "con-listas": {
    construir: registroConListas,
    campos: CAMPOS_ANIDADO,
    listas: LISTAS_CON_LISTAS,
  },
  heterogeneo: { construir: registroHeterogeneo, campos: CAMPOS_HETEROGENEO, listas: [] },
};

// Los perfiles planos también se escriben como JSON, con el mismo dato que su CSV. Lo único que
// cambia es el tipo: lo que el CSV llama número, JSON lo escribe como número (una celda vacía,
// como null) y las coordenadas conservan sus ceros finales (`-3.475030`).
const NUMEROS_EN_JSON = new Set(["estrato", "monto", "edad_reportada", "puntaje_triage"]);
const DECIMALES_EN_JSON = new Set(["latitud", "longitud"]);

function registroPlano(columnas, fila) {
  const registro = new Map();
  columnas.forEach((nombre, i) => {
    const celda = fila[i];
    if (NUMEROS_EN_JSON.has(nombre)) registro.set(nombre, celda === "" ? null : Number(celda));
    else if (DECIMALES_EN_JSON.has(nombre))
      registro.set(nombre, celda === "" ? null : new NumeroCrudo(celda));
    else registro.set(nombre, celda);
  });
  return registro;
}

export const FORMATOS = ["csv", "xlsx", "json", "jsonl"];
export const PERFILES_SOLO_JSON = Object.keys(PERFILES_JSON);

/**
 * Un registro por vez, como `Map`, listo para `serializarRegistro`. Los perfiles planos salen de
 * `generarFilas` (el mismo dato que su CSV, con la misma semilla); los perfiles JSON, de su propio
 * constructor.
 */
export function* generarRegistros({ filas, seed, perfil, tasaInvalida, tasaVacia }) {
  const perfilJson = PERFILES_JSON[perfil];
  if (perfilJson) {
    const azar = crearAzar(seed);
    const config = { tasaInvalida, tasaVacia };
    for (let i = 0; i < filas; i++) yield perfilJson.construir(azar, config, i);
    return;
  }
  const origen = generarFilas({ filas, seed, perfil, tasaInvalida, tasaVacia });
  const columnas = origen.next().value;
  for (const fila of origen) yield registroPlano(columnas, fila);
}

/** Las rutas (o columnas) que tiene cada registro de un perfil, en el orden del oráculo. */
function rutasDelPerfil(perfil) {
  return PERFILES_JSON[perfil]
    ? PERFILES_JSON[perfil].campos.map((c) => c.ruta)
    : PERFILES[perfil];
}

/**
 * Escribe JSON (`forma: "json"`) o JSON Lines (`forma: "jsonl"`) en bloques de ~1 MB: 500 000
 * registros no caben cómodos como UNA cadena. La forma canónica es exactamente:
 *   json  → "[\n" + registros.join(",\n") + "\n]\n"
 *   jsonl → cada registro + "\n"
 */
async function escribirRegistros(opciones, forma) {
  const { salida } = opciones;
  const hash = createHash("sha256");
  mkdirSync(dirname(salida), { recursive: true });
  const stream = createWriteStream(salida);
  const emitir = async (texto) => {
    hash.update(texto);
    await escribir(stream, texto);
  };

  let bloque = forma === "json" ? "[\n" : "";
  let primero = true;
  for (const registro of generarRegistros(opciones)) {
    const texto = serializarRegistro(registro);
    bloque += forma === "json" ? `${primero ? "" : ",\n"}${texto}` : `${texto}\n`;
    primero = false;
    if (bloque.length > 1 << 20) {
      await emitir(bloque);
      bloque = "";
    }
  }
  if (forma === "json") bloque += "\n]\n";
  if (bloque) await emitir(bloque);

  stream.end();
  await once(stream, "finish");
  return { sha256: hash.digest("hex"), columnas: rutasDelPerfil(opciones.perfil) };
}

export const generarJson = (opciones) => escribirRegistros(opciones, "json");
export const generarJsonl = (opciones) => escribirRegistros(opciones, "jsonl");

// ── Binarios con metadatos falsos ─────────────────────────────────────────────────────────────
export const FORMATOS_BINARIOS = ["pdf", "jpeg", "png", "webp"];
export { PERFILES_PDF };
const EXTENSIONES_BINARIAS = { pdf: "pdf", jpeg: "jpg", png: "png", webp: "webp" };

/**
 * Escribe un binario (PDF, JPEG, PNG o WebP) y, si se pide, el JSON de sus centinelas. El perfil solo
 * existe para el PDF (por omisión `con-revisiones`); pedirlo para una imagen es un error, no algo
 * que se ignore en silencio. Devuelve `columnas: []` para que el contrato sea el de los demás.
 */
export async function generarBinario(opciones) {
  const { formato, perfil, seed = 42, salida, centinelas: rutaDeCentinelas } = opciones;
  let resultado;
  if (formato === "pdf") {
    resultado = generarPdf({ semilla: seed, perfil: perfil ?? "con-revisiones" });
  } else if (perfil !== undefined) {
    throw new Error(`el formato «${formato}» no tiene perfiles: solo el PDF los tiene`);
  } else if (formato === "jpeg") {
    resultado = generarJpeg({ semilla: seed });
  } else if (formato === "png") {
    resultado = generarPng({ semilla: seed });
  } else {
    resultado = generarWebp({ semilla: seed });
  }
  const { bytes, centinelas } = resultado;

  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, bytes);
  if (rutaDeCentinelas) {
    mkdirSync(dirname(rutaDeCentinelas), { recursive: true });
    writeFileSync(rutaDeCentinelas, `${JSON.stringify(centinelas, null, 2)}\n`, "utf8");
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    columnas: [],
    centinelas,
    tamano: bytes.length,
  };
}

/**
 * La puerta única del kit: valida y reparte por formato. Un formato o un perfil que no existen son
 * un error, no un CSV: un fixture generado con la opción equivocada no puede pasar por bueno.
 */
export async function generar(opciones) {
  const { formato = "csv", perfil = "clinico", filas } = opciones;
  if (FORMATOS_BINARIOS.includes(formato)) return generarBinario(opciones);
  if (!FORMATOS.includes(formato)) {
    const validos = [...FORMATOS, ...FORMATOS_BINARIOS].join(", ");
    throw new Error(`formato desconocido: «${formato}» (los válidos: ${validos})`);
  }
  if (opciones.centinelas) {
    throw new Error(
      `--centinelas solo aplica a los binarios (${FORMATOS_BINARIOS.join(", ")}), no a ${formato}`,
    );
  }
  if (!PERFILES[perfil] && !PERFILES_JSON[perfil]) {
    const validos = [...Object.keys(PERFILES), ...PERFILES_SOLO_JSON].join(", ");
    throw new Error(`perfil desconocido: «${perfil}» (los válidos: ${validos})`);
  }
  const esJson = formato === "json" || formato === "jsonl";
  if (PERFILES_JSON[perfil] && !esJson) {
    throw new Error(`el perfil «${perfil}» solo existe en los formatos json y jsonl`);
  }
  if (!Number.isInteger(filas) || filas < 0) {
    throw new Error(`filas debe ser un entero de 0 en adelante: ${String(filas)}`);
  }
  const escritores = {
    csv: generarCsv,
    xlsx: generarXlsx,
    json: generarJson,
    jsonl: generarJsonl,
  };
  return escritores[formato]({ ...opciones, formato, perfil });
}

/**
 * Oráculo del kit: qué debería detectar el motor en cada columna. Lo consumen los tests, así que
 * el generador no es solo la fuente de datos — es también la respuesta correcta contra la que se
 * mide el motor.
 */
export function esperadoPorColumna(perfil = "clinico") {
  // Los perfiles JSON declaran RUTAS, no columnas: mismo oráculo (`tipo`, `categoria`, `trampa`),
  // más `presencia` y `tipos`. Ver también `esperadoPorRuta` y `listasEsperadas`.
  if (PERFILES_JSON[perfil]) return esperadoPorRuta(perfil);
  if (!PERFILES[perfil]) throw new Error(`perfil desconocido: ${perfil}`);
  return Object.fromEntries(
    PERFILES[perfil].map((nombre) => [
      nombre,
      {
        tipo: TODAS_LAS_COLUMNAS[nombre].tipo,
        categoria: TODAS_LAS_COLUMNAS[nombre].categoria,
        trampa: TODAS_LAS_COLUMNAS[nombre].trampa ?? null,
      },
    ]),
  );
}

/**
 * Oráculo de los perfiles JSON, por ruta (`paciente.contacto.correo`): qué debería detectar el
 * motor, si la ruta está en todos los registros o solo en algunos, y qué tipos de valor trae.
 * Solo para perfiles JSON; los planos tienen `esperadoPorColumna`.
 */
export function esperadoPorRuta(perfil = "anidado") {
  const perfilJson = PERFILES_JSON[perfil];
  if (!perfilJson) {
    throw new Error(`«${perfil}» no es un perfil JSON: para los planos usa esperadoPorColumna`);
  }
  return Object.fromEntries(
    perfilJson.campos.map(({ ruta, tipo, categoria, tipos, presencia }) => [
      ruta,
      { tipo, categoria, trampa: null, presencia, tipos: [...tipos] },
    ]),
  );
}

/**
 * Las listas que un perfil JSON trae y que Velo debe DECLARAR como no tratadas (se copian crudas).
 * `[]` para los perfiles sin listas. `rutasHijas` son los caminos dentro de los elementos.
 * @returns {{ ruta: string, elementos: "objetos" | "textos", rutasHijas: string[] }[]}
 */
export function listasEsperadas(perfil = "con-listas") {
  const perfilJson = PERFILES_JSON[perfil];
  if (!perfilJson) return [];
  return perfilJson.listas.map((l) => ({ ...l, rutasHijas: [...l.rutasHijas] }));
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
function leerArgumentos(entrada) {
  // `pnpm kit:generar -- --filas …` (la forma que documenta CLAUDE.md) le pasa al script el `--`
  // suelto con pnpm 11; leído de a pares, corría todo un lugar y el generador ignoraba en silencio
  // lo pedido. Se descarta antes de leer.
  const argv = entrada.filter((arg) => arg !== "--");
  const opciones = {
    filas: 1000,
    seed: 42,
    perfil: "clinico",
    formato: "csv",
    salida: "",
    centinelas: "",
    tasaInvalida: 0.08,
    tasaVacia: 0.03,
  };
  let perfilPedido = false;
  for (let i = 0; i < argv.length; i += 2) {
    const clave = argv[i]?.replace(/^--/, "");
    const valor = argv[i + 1];
    if (clave === undefined || valor === undefined) continue;
    if (clave === "perfil") perfilPedido = true;
    if (["perfil", "salida", "formato", "centinelas"].includes(clave)) opciones[clave] = valor;
    else if (clave in opciones) opciones[clave] = Number(valor);
  }
  const esBinario = FORMATOS_BINARIOS.includes(opciones.formato);
  // El «clinico» por omisión es de los perfiles tabulares: en un binario, el perfil solo existe si
  // se pidió (y solo lo acepta el PDF).
  if (esBinario && !perfilPedido) {
    opciones.perfil = opciones.formato === "pdf" ? "con-revisiones" : undefined;
  }
  if (!opciones.salida) {
    opciones.salida = esBinario
      ? `tmp/kit-de-prueba/${opciones.formato === "pdf" ? `documento-${opciones.perfil}` : "foto"}-s${opciones.seed}.${EXTENSIONES_BINARIAS[opciones.formato]}`
      : `tmp/kit-de-prueba/${opciones.perfil}-${opciones.filas}-s${opciones.seed}.${opciones.formato}`;
  }
  return opciones;
}

const esEjecucionDirecta = process.argv[1] && process.argv[1].endsWith("generador.mjs");

if (esEjecucionDirecta) {
  const opciones = leerArgumentos(process.argv.slice(2));
  opciones.salida = resolve(process.cwd(), opciones.salida);
  if (opciones.centinelas) opciones.centinelas = resolve(process.cwd(), opciones.centinelas);
  const inicio = Date.now();
  try {
    const { sha256, columnas, centinelas, tamano } = await generar(opciones);
    const segundos = ((Date.now() - inicio) / 1000).toFixed(2);
    const esJson = opciones.formato === "json" || opciones.formato === "jsonl";
    if (FORMATOS_BINARIOS.includes(opciones.formato)) {
      const perfil = opciones.perfil ? ` · perfil ${opciones.perfil}` : "";
      console.log(`✓ ${opciones.formato}${perfil} · ${tamano} bytes`);
    } else {
      console.log(
        esJson
          ? `✓ ${opciones.filas} registros × ${columnas.length} rutas · perfil ${opciones.perfil} · ${opciones.formato}`
          : `✓ ${opciones.filas} filas × ${columnas.length} columnas · perfil ${opciones.perfil}`,
      );
    }
    console.log(`  archivo : ${opciones.salida}`);
    console.log(`  semilla : ${opciones.seed}  (misma semilla ⇒ mismo archivo, byte por byte)`);
    if (sha256) console.log(`  sha-256 : ${sha256}`);
    if (centinelas && opciones.centinelas) {
      console.log(`  centinelas : ${centinelas.length} cadenas escondidas → ${opciones.centinelas}`);
    }
    console.log(`  tiempo  : ${segundos} s`);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
