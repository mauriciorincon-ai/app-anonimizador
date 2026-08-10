// Clasificador de columnas — el corazón del diagnóstico.
//
// Recibe una tabla columnar y devuelve, por columna: qué tipo de dato es, POR QUÉ se llegó a esa
// conclusión, en qué categoría de la Ley 1581 cae y una muestra enmascarada. Todo determinista:
// mismo archivo ⇒ mismo diagnóstico, byte por byte.
//
// Dos señales, y la diferencia entre ellas es de honestidad, no de implementación:
//
//   1. LOS VALORES. Un validador confirma (NIT con el mod 11 de la DIAN) o reconoce una forma
//      (una cédula, que no tiene checksum público). Es la señal fuerte.
//   2. EL NOMBRE DE LA COLUMNA. Para los datos sensibles del art. 5 no existe algoritmo: ningún
//      cálculo puede mirar "J45.9" y afirmar que es un diagnóstico de salud. Solo el encabezado lo
//      sugiere. Velo lo marca igual —callarlo sería peor— pero NUNCA con la misma seguridad: la
//      certeza queda en "sin-confirmar" y la evidencia dice que fue el nombre, no el dato.
//
// Confundir las dos sería exactamente la exageración que la regla de honestidad medida prohíbe.

import {
  CODIGO_VACIO,
  type ColumnaColumnar,
  type TablaColumnar,
  valorEn,
} from "./columnar";
import { muestraParaColumna } from "./mascara";
import { VALIDADORES } from "./validadores";
import type {
  CategoriaLey1581,
  Certeza,
  TipoDetectado,
} from "./validadores/tipos";

/** Filas que se muestrean por columna. Suficiente para una proporción estable, barato a 500k. */
export const MUESTRA_MAXIMA = 5_000;

/** Proporción mínima de la muestra que un validador debe cubrir para adjudicarse la columna. */
export const UMBRAL_DE_ADJUDICACION = 0.85;

/** Una columna con pocos valores distintos, muy repetidos, es una categoría (sexo, municipio…). */
const MAXIMA_CARDINALIDAD_CATEGORICA = 50;
const REPETICION_MINIMA_CATEGORICA = 10;

export type Evidencia =
  | {
      origen: "validador";
      validador: TipoDetectado;
      etiqueta: string;
      fuente: string;
      certeza: Certeza;
      aciertos: number;
      muestreados: number;
    }
  | {
      origen: "nombre-de-columna";
      patron: string;
      nota: string;
    };

export interface HallazgoDeColumna {
  nombre: string;
  posicion: number;
  tipo: TipoDetectado;
  etiqueta: string;
  /** "sin-confirmar" cuando la conclusión se apoya en el encabezado y no en los valores. */
  certeza: Certeza | "sin-confirmar";
  categoria: CategoriaLey1581;
  /** El "por qué", en orden: primero la señal que decidió. */
  evidencia: Evidencia[];
  filas: number;
  filasNoVacias: number;
  cardinalidad: number;
  muestra: { texto: string; omitida: boolean } | null;
}

export interface Diagnostico {
  filas: number;
  columnas: HallazgoDeColumna[];
  resumen: Record<CategoriaLey1581, number>;
}

// ── Reglas por nombre de columna ──────────────────────────────────────────────────────────────
// Ordenadas: la primera que coincide gana. Las del art. 5 van primero para que "vida_sexual" no
// caiga en la regla genérica de "sexo".

interface ReglaDeNombre {
  patron: RegExp;
  descripcion: string;
  categoria: CategoriaLey1581;
  nota: string;
}

const REGLAS_DE_NOMBRE: readonly ReglaDeNombre[] = [
  {
    patron:
      /(salud|diagnostic|enfermedad|cie.?10|discapacidad|embarazo|vih|eps|asegurador|medicament|tratamiento)/i,
    descripcion: "nombre relacionado con salud",
    categoria: "dato-sensible",
    nota: "Ley 1581 art. 5 — los datos relativos a la salud son sensibles.",
  },
  {
    patron:
      /(etnia|etnic|raza|racial|raizal|indigen|afrodescend|palenquer|rrom)/i,
    descripcion: "nombre relacionado con origen étnico",
    categoria: "dato-sensible",
    nota: "Ley 1581 art. 5 — el origen racial o étnico es dato sensible.",
  },
  {
    patron:
      /(religi|creencia|confesion|politic|partido|sindicat|orientacion.?sexual|vida.?sexual|biometric|huella|iris)/i,
    descripcion: "nombre relacionado con convicciones, vida sexual o biometría",
    categoria: "dato-sensible",
    nota: "Ley 1581 art. 5 — convicciones, vida sexual y datos biométricos son sensibles.",
  },
  {
    patron: /(direccion|domicilio|residencia)/i,
    descripcion: "nombre de dirección",
    categoria: "identificador-directo",
    nota: "Una dirección ubica a la persona; se trata como identificador directo.",
  },
  {
    patron:
      /(nombre|apellido|razon.?social|titular|beneficiario|paciente|cliente)/i,
    descripcion: "nombre de persona",
    categoria: "identificador-directo",
    nota: "El encabezado indica que la columna nombra a la persona.",
  },
  {
    patron: /(fecha.?(de.?)?nac|nacimiento|f_nac|fnac|edad)/i,
    descripcion: "fecha de nacimiento o edad",
    categoria: "cuasi-identificador",
    nota: "Fecha de nacimiento + sexo + municipio identifica a buena parte de una población (Sweeney 2000; Golle 2006).",
  },
  {
    patron:
      /(sexo|genero|municipio|ciudad|departamento|barrio|localidad|comuna|estrato|ocupacion|profesion|cargo|nacionalidad|nivel.?educ)/i,
    descripcion: "atributo demográfico",
    categoria: "cuasi-identificador",
    nota: "Por sí solo no identifica; combinado con otros, sí.",
  },
];

function buscarReglaDeNombre(nombre: string): ReglaDeNombre | null {
  return REGLAS_DE_NOMBRE.find((regla) => regla.patron.test(nombre)) ?? null;
}

/** Jerarquía para escalar: una columna solo sube de categoría, nunca baja por el encabezado. */
const SEVERIDAD: Record<CategoriaLey1581, number> = {
  "no-personal": 0,
  "cuasi-identificador": 1,
  "identificador-directo": 2,
  "dato-sensible": 3,
};

// ── Muestreo determinista ─────────────────────────────────────────────────────────────────────
/**
 * Posiciones repartidas a zancada fija por TODA la columna. Nada de `Math.random()`, y tampoco
 * "las primeras N": un archivo ordenado por fecha o por región tiene el principio nada
 * representativo del resto.
 */
export function posicionesDeMuestra(
  filas: number,
  maximo = MUESTRA_MAXIMA,
): number[] {
  if (filas <= maximo) return Array.from({ length: filas }, (_, i) => i);
  return Array.from({ length: maximo }, (_, i) =>
    Math.floor((i * filas) / maximo),
  );
}

// ── Clasificación de una columna ──────────────────────────────────────────────────────────────
function clasificarColumna(
  columna: ColumnaColumnar,
  posicion: number,
  filas: number,
): HallazgoDeColumna {
  // Se cuenta cada código UNA vez y se pondera por sus apariciones en la muestra: validar el mismo
  // valor mil veces cuesta mil veces más y da exactamente el mismo resultado.
  const conteoPorCodigo = new Map<number, number>();
  let muestreados = 0;
  for (const p of posicionesDeMuestra(filas)) {
    const codigo = columna.codigos[p];
    if (codigo === CODIGO_VACIO) continue;
    conteoPorCodigo.set(codigo, (conteoPorCodigo.get(codigo) ?? 0) + 1);
    muestreados++;
  }

  const contexto = { nombre: columna.nombre };
  const aciertos = new Array<number>(VALIDADORES.length).fill(0);
  let primerValor: string | null = null;
  for (const [codigo, repeticiones] of conteoPorCodigo) {
    const valor = columna.valores[codigo];
    if (primerValor === null) primerValor = valor;
    for (let v = 0; v < VALIDADORES.length; v++) {
      if (VALIDADORES[v].valida(valor, contexto)) aciertos[v] += repeticiones;
    }
  }

  // Entre los que superan el umbral gana el MÁS ESPECÍFICO, no el que más acierta. Parece
  // contraintuitivo hasta que se ve el caso: en una columna de cédulas, "es un número" acierta en
  // MÁS filas que "es una cédula" —los valores rotos siguen siendo números— así que adjudicar por
  // aciertos entregaría toda columna al validador más permisivo. La prioridad codifica la
  // especificidad; los aciertos y el orden del registro solo desempatan. Los tres criterios están
  // fijados: sin el tercero, dos corridas podrían diferir.
  let ganador = -1;
  for (let v = 0; v < VALIDADORES.length; v++) {
    if (muestreados === 0 || aciertos[v] / muestreados < UMBRAL_DE_ADJUDICACION)
      continue;
    if (
      ganador === -1 ||
      VALIDADORES[v].prioridad > VALIDADORES[ganador].prioridad ||
      (VALIDADORES[v].prioridad === VALIDADORES[ganador].prioridad &&
        aciertos[v] > aciertos[ganador])
    ) {
      ganador = v;
    }
  }

  const cardinalidad = columna.valores.length - 1;
  const evidencia: Evidencia[] = [];
  let tipo: TipoDetectado;
  let etiqueta: string;
  let certeza: Certeza | "sin-confirmar";
  let categoria: CategoriaLey1581;

  if (ganador !== -1) {
    const validador = VALIDADORES[ganador];
    tipo = validador.id;
    etiqueta = validador.etiqueta;
    certeza = validador.certeza;
    categoria = validador.categoria;
    evidencia.push({
      origen: "validador",
      validador: validador.id,
      etiqueta: validador.etiqueta,
      fuente: validador.fuente,
      certeza: validador.certeza,
      aciertos: aciertos[ganador],
      muestreados,
    });
  } else {
    const esCategorica =
      cardinalidad > 0 &&
      cardinalidad <= MAXIMA_CARDINALIDAD_CATEGORICA &&
      muestreados >= cardinalidad * REPETICION_MINIMA_CATEGORICA;
    tipo = esCategorica ? "categoria" : "texto";
    etiqueta = esCategorica ? "Categoría (pocos valores repetidos)" : "Texto";
    certeza = "sin-confirmar";
    categoria = "no-personal";
  }

  // El encabezado solo puede SUBIR la categoría, nunca bajarla: si los valores confirman un NIT,
  // que la columna se llame "codigo" no lo vuelve inocuo.
  const regla = buscarReglaDeNombre(columna.nombre);
  if (regla && SEVERIDAD[regla.categoria] > SEVERIDAD[categoria]) {
    categoria = regla.categoria;
    evidencia.push({
      origen: "nombre-de-columna",
      patron: regla.descripcion,
      nota: regla.nota,
    });
    // Si el ascenso lo decidió el encabezado y no los datos, la certeza baja a "sin-confirmar":
    // es una sospecha razonable, no una confirmación, y la UI tiene que poder decirlo.
    if (ganador === -1) certeza = "sin-confirmar";
  }

  return {
    nombre: columna.nombre,
    posicion,
    tipo,
    etiqueta,
    certeza,
    categoria,
    evidencia,
    filas,
    filasNoVacias: columna.noVacios,
    cardinalidad,
    muestra: muestraParaColumna(primerValor, categoria === "dato-sensible"),
  };
}

// ── Diagnóstico completo ──────────────────────────────────────────────────────────────────────
export function clasificar(tabla: TablaColumnar): Diagnostico {
  const columnas = tabla.columnas.map((columna, i) =>
    clasificarColumna(columna, i, tabla.filas),
  );

  const resumen: Record<CategoriaLey1581, number> = {
    "identificador-directo": 0,
    "cuasi-identificador": 0,
    "dato-sensible": 0,
    "no-personal": 0,
  };
  for (const hallazgo of columnas) resumen[hallazgo.categoria]++;

  return { filas: tabla.filas, columnas, resumen };
}

/** Nombres de las columnas que el motor de riesgo debe tratar como cuasi-identificadores. */
export function cuasiIdentificadores(diagnostico: Diagnostico): string[] {
  return diagnostico.columnas
    .filter((c) => c.categoria === "cuasi-identificador")
    .map((c) => c.nombre);
}

/** Valor de una celda concreta; vive aquí para que los tests no importen el módulo columnar. */
export { valorEn };
