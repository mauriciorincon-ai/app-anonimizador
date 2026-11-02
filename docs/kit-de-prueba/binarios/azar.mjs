// Aleatoriedad reproducible y léxicos del kit — compartidos entre el generador tabular
// (`../generador.mjs`) y los generadores de binarios (JPEG, PNG, WebP y PDF de esta carpeta).
//
// Vive aquí, y no dentro de `generador.mjs`, para que los binarios la importen sin ciclo: el
// generador importa los binarios y los binarios no pueden importar de vuelta al generador. El código
// es el mismo de siempre, movido sin tocar una coma: la misma semilla produce el mismo CSV, XLSX y
// JSON, byte por byte (lo vigilan `tests/unit/generador*.test.ts`).

// ── Aleatoriedad reproducible ─────────────────────────────────────────────────────────────────
// mulberry32: PRNG de 32 bits, determinista y sin dependencias. Cero Math.random() en todo el
// kit — es la misma regla que gobierna el motor.
export function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearAzar(semilla) {
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

// ── Léxicos (palabras, no personas) ───────────────────────────────────────────────────────────
export const NOMBRES = [
  "María",
  "Juan",
  "Ana",
  "Carlos",
  "Luisa",
  "Andrés",
  "Camila",
  "Jorge",
  "Paula",
  "Diego",
  "Valentina",
  "Santiago",
  "Daniela",
  "Felipe",
  "Laura",
  "Sebastián",
  "Isabela",
  "Mateo",
];
export const APELLIDOS = [
  "Gómez",
  "Rodríguez",
  "Martínez",
  "López",
  "Ramírez",
  "Torres",
  "Vargas",
  "Castro",
  "Rojas",
  "Moreno",
  "Jiménez",
  "Herrera",
  "Mendoza",
  "Peña",
  "Cárdenas",
  "Osorio",
];
export const DOMINIOS = [
  "ejemplo.com",
  "correo-demo.co",
  "prueba.org",
  "muestra.net",
];
export const MUNICIPIOS = [
  "Bogotá",
  "Medellín",
  "Cali",
  "Barranquilla",
  "Bucaramanga",
  "Cartagena",
  "Pereira",
  "Manizales",
  "Villavicencio",
  "Neiva",
  "Pasto",
  "Armenia",
  "Sincelejo",
  "Tunja",
  "Popayán",
  "Montería",
];

// ── Fábricas de valores, con sus casos FUERA de rango ──────────────────────────────────────────
// `tasaInvalida` es la fracción de valores que se emiten deliberadamente rotos. No es ruido: es
// lo que impide que el clasificador se pruebe contra su propio supuesto.

export function cedula(azar, tasaInvalida) {
  if (azar.conProbabilidad(tasaInvalida)) {
    // Imposibles reales: cero, demasiado corta, demasiado larga, con letras.
    return azar.de(["0", "99", "1", "123456789012", "10A2456789"]);
  }
  // NUIP actual (10 dígitos desde 1.000.000.000) y series históricas de hasta 8.
  return azar.conProbabilidad(0.7)
    ? String(azar.entero(1_000_000_000, 1_299_999_999))
    : String(azar.entero(1_000_000, 79_999_999));
}
