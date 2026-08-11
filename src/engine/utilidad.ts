// Utilidad perdida — el otro lado de la balanza, y la única forma de que el usuario decida.
//
// Anonimizar siempre es un intercambio: cada bit de riesgo que se quita sale de un bit de
// información que alguien iba a usar. Una herramienta que solo enseñe la mitad buena del trato está
// pidiendo un acto de fe. Aquí se mide lo que el archivo perdió, en dos planos:
//
//   · **Por columna** — cuántos valores distintos quedan, cuántos bits de información conserva y
//     cuántas celdas cambiaron. La entropía de Shannon en bits no es adorno estadístico: es
//     literalmente «cuántas preguntas de sí/no hacen falta para distinguir una fila de otra por esta
//     columna». Pasar de 15,2 a 2,3 bits dice más que «se generalizó».
//   · **Entre columnas** — la V de Cramér antes y después. Es la que de verdad duele y la que nadie
//     mira: una columna puede conservar su distribución entera y aun así haber perdido su RELACIÓN
//     con otra, y con ella el análisis que el destinatario pensaba hacer. Cramér, *Mathematical
//     Methods of Statistics* (1946), §21.9 — V = √(χ²/n / mín(f−1, c−1)), en [0, 1].
//
// **Lo que este módulo NO hace:** no puntúa. No hay un «85 % de utilidad conservada», porque ese
// número exige decidir qué columna importa —y eso lo sabe el usuario, no Velo—. Se entregan las
// cifras y las decide quien conoce para qué era el archivo.

import { type ColumnaColumnar, type TablaColumnar } from "./columnar";

/**
 * Cardinalidad máxima para entrar al cálculo de correlaciones.
 *
 * La V de Cramér necesita una tabla de contingencia de f×c casillas. Con `correo` (112.444 valores
 * distintos) contra `fecha_nacimiento` (23.856) serían 2.700 millones de casillas para un número
 * que, además, no significaría nada: una tabla de contingencia con más casillas que filas está casi
 * toda vacía y la V sale inflada hacia 1 por pura escasez. El tope es estadístico antes que de
 * rendimiento, y las columnas que quedan fuera se reportan con su motivo.
 */
export const CARDINALIDAD_MAXIMA_DE_CORRELACION = 64;

/** Cuántas columnas entran al cruce. Con 8 salen 28 pares. */
export const COLUMNAS_MAXIMAS_DE_CORRELACION = 8;

export interface PerdidaEnColumna {
  readonly nombre: string;
  readonly estado: "intacta" | "transformada" | "suprimida";
  readonly cardinalidadAntes: number;
  readonly cardinalidadDespues: number;
  /** Entropía de Shannon, en bits. Cuánto distingue esta columna una fila de otra. */
  readonly bitsAntes: number;
  readonly bitsDespues: number;
  /** Proporción de celdas cuyo valor cambió. Una columna intacta tiene 0; una suprimida, 1. */
  readonly celdasCambiadas: number;
}

export interface CorrelacionComparada {
  readonly columnas: readonly [string, string];
  /** V de Cramér en [0, 1]: 0 = independientes, 1 = una determina la otra. */
  readonly antes: number;
  readonly despues: number;
}

export interface ColumnaFueraDelCruce {
  readonly nombre: string;
  readonly motivo: string;
}

export interface Utilidad {
  readonly columnas: readonly PerdidaEnColumna[];
  /** Bits sumados de las columnas que sobreviven. El total del archivo antes y después. */
  readonly bitsAntes: number;
  readonly bitsDespues: number;
  readonly correlaciones: readonly CorrelacionComparada[];
  /** Qué se quedó fuera del cruce y POR QUÉ. Un tope callado se lee como «lo revisé todo». */
  readonly fueraDelCruce: readonly ColumnaFueraDelCruce[];
  readonly tope: {
    readonly cardinalidadMaxima: number;
    readonly columnasMaximas: number;
  };
}

/** Frecuencia de cada código de la columna. La celda vacía cuenta como un valor más. */
function frecuencias(columna: ColumnaColumnar): Uint32Array {
  const cuenta = new Uint32Array(columna.valores.length);
  for (const codigo of columna.codigos) cuenta[codigo]++;
  return cuenta;
}

/**
 * Entropía de Shannon en bits: H = −Σ p·log₂(p).
 *
 * Una columna con un solo valor da 0 bits (no distingue a nadie); una con todos los valores
 * distintos da log₂(n) — 18,9 bits con 500.000 filas. Es la medida que hace comparables una fecha
 * generalizada al año y un municipio truncado a departamento.
 */
export function entropiaEnBits(
  columna: ColumnaColumnar,
  filas: number,
): number {
  if (filas === 0) return 0;
  let bits = 0;
  for (const cuenta of frecuencias(columna)) {
    if (cuenta === 0) continue;
    const p = cuenta / filas;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * V de Cramér entre dos columnas, en [0, 1].
 *
 * Se calcula sobre la tabla de contingencia de los códigos del diccionario. No hay corrección de
 * sesgo (Bergsma 2013): la V cruda se compara consigo misma antes y después, y una corrección
 * aplicada a las dos no cambiaría la lectura, que es si la relación sobrevivió.
 */
export function vDeCramer(
  a: ColumnaColumnar,
  b: ColumnaColumnar,
  filas: number,
): number {
  if (filas === 0) return 0;
  const fa = a.valores.length;
  const fb = b.valores.length;

  const conjunta = new Uint32Array(fa * fb);
  const totalA = new Uint32Array(fa);
  const totalB = new Uint32Array(fb);
  for (let f = 0; f < filas; f++) {
    const ca = a.codigos[f];
    const cb = b.codigos[f];
    conjunta[ca * fb + cb]++;
    totalA[ca]++;
    totalB[cb]++;
  }

  // Filas y columnas VACÍAS de la tabla no cuentan para los grados de libertad: un diccionario
  // puede traer un valor que ya no aparece en ninguna fila (Mondrian junta valores, y el vacío
  // existe siempre aunque nadie lo use). Contarlas encogería el denominador y con él inflaría la V.
  let usadasA = 0;
  for (const total of totalA) if (total > 0) usadasA++;
  let usadasB = 0;
  for (const total of totalB) if (total > 0) usadasB++;
  const gradosDeLibertad = Math.min(usadasA - 1, usadasB - 1);
  if (gradosDeLibertad <= 0) return 0;

  let chiCuadrado = 0;
  for (let ia = 0; ia < fa; ia++) {
    if (totalA[ia] === 0) continue;
    for (let ib = 0; ib < fb; ib++) {
      if (totalB[ib] === 0) continue;
      const esperado = (totalA[ia] * totalB[ib]) / filas;
      const observado = conjunta[ia * fb + ib];
      const diferencia = observado - esperado;
      chiCuadrado += (diferencia * diferencia) / esperado;
    }
  }
  // El redondeo puede sacar la raíz de 1 por unas milésimas cuando la relación es perfecta.
  return Math.min(1, Math.sqrt(chiCuadrado / filas / gradosDeLibertad));
}

/**
 * Compara el archivo original con el transformado y devuelve lo que se perdió.
 *
 * Las dos tablas se emparejan **por nombre de columna**: lo que no aparece en la salida está
 * suprimido, y eso es una pérdida del 100 % que hay que contar como tal.
 */
export function medirUtilidad(
  antes: TablaColumnar,
  despues: TablaColumnar,
): Utilidad {
  const filas = antes.filas;
  const enSalida = new Map(despues.columnas.map((c) => [c.nombre, c]));

  const columnas: PerdidaEnColumna[] = antes.columnas.map((original) => {
    const nueva = enSalida.get(original.nombre);
    if (nueva === undefined) {
      return {
        nombre: original.nombre,
        estado: "suprimida" as const,
        cardinalidadAntes: original.valores.length - 1,
        cardinalidadDespues: 0,
        bitsAntes: entropiaEnBits(original, filas),
        bitsDespues: 0,
        celdasCambiadas: 1,
      };
    }

    let cambiadas = 0;
    for (let f = 0; f < filas; f++) {
      if (
        original.valores[original.codigos[f]] !==
        nueva.valores[nueva.codigos[f]]
      ) {
        cambiadas++;
      }
    }
    return {
      nombre: original.nombre,
      estado:
        cambiadas === 0 ? ("intacta" as const) : ("transformada" as const),
      cardinalidadAntes: original.valores.length - 1,
      cardinalidadDespues: nueva.valores.length - 1,
      bitsAntes: entropiaEnBits(original, filas),
      bitsDespues: entropiaEnBits(nueva, filas),
      celdasCambiadas: filas === 0 ? 0 : cambiadas / filas,
    };
  });

  // Candidatas al cruce: las que sobreviven y caben en una tabla de contingencia honesta. Se
  // ordenan por cardinalidad descendente —más valores, más relación que perder— con desempate por
  // posición, el mismo criterio que el consejero de cruces del S1.
  const fueraDelCruce: ColumnaFueraDelCruce[] = [];
  const elegibles: ColumnaColumnar[] = [];
  for (const original of antes.columnas) {
    const nueva = enSalida.get(original.nombre);
    if (nueva === undefined) {
      fueraDelCruce.push({
        nombre: original.nombre,
        motivo: "suprimida: no queda nada con qué cruzarla",
      });
      continue;
    }
    const cardinalidad = Math.max(
      original.valores.length,
      nueva.valores.length,
    );
    if (cardinalidad > CARDINALIDAD_MAXIMA_DE_CORRELACION) {
      fueraDelCruce.push({
        nombre: original.nombre,
        motivo: `más de ${CARDINALIDAD_MAXIMA_DE_CORRELACION} valores distintos: la tabla de contingencia quedaría casi vacía y la cifra saldría inflada`,
      });
      continue;
    }
    elegibles.push(original);
  }

  const ordenadas = elegibles
    .map((columna, posicion) => ({ columna, posicion }))
    .sort(
      (a, b) =>
        b.columna.valores.length - a.columna.valores.length ||
        a.posicion - b.posicion,
    );
  const candidatas = ordenadas.slice(0, COLUMNAS_MAXIMAS_DE_CORRELACION);
  for (const sobrante of ordenadas.slice(COLUMNAS_MAXIMAS_DE_CORRELACION)) {
    fueraDelCruce.push({
      nombre: sobrante.columna.nombre,
      motivo: `fuera de las ${COLUMNAS_MAXIMAS_DE_CORRELACION} columnas con más valores distintos`,
    });
  }

  const correlaciones: CorrelacionComparada[] = [];
  for (let i = 0; i < candidatas.length; i++) {
    for (let j = i + 1; j < candidatas.length; j++) {
      const a = candidatas[i].columna;
      const b = candidatas[j].columna;
      correlaciones.push({
        columnas: [a.nombre, b.nombre],
        antes: vDeCramer(a, b, filas),
        despues: vDeCramer(
          enSalida.get(a.nombre)!,
          enSalida.get(b.nombre)!,
          filas,
        ),
      });
    }
  }

  // Primero la relación que MÁS se perdió: es el hallazgo, no el inventario. Desempate por nombres
  // en punto de código, para que dos corridas ordenen igual.
  correlaciones.sort((a, b) => {
    const perdidaA = a.antes - a.despues;
    const perdidaB = b.antes - b.despues;
    if (perdidaA !== perdidaB) return perdidaB - perdidaA;
    // Cada par aparece una sola vez, así que dos claves nunca son iguales.
    const claveA = a.columnas.join(" ");
    const claveB = b.columnas.join(" ");
    return claveA < claveB ? -1 : 1;
  });

  const vivas = columnas.filter((c) => c.estado !== "suprimida");
  return {
    columnas,
    bitsAntes: columnas.reduce((suma, c) => suma + c.bitsAntes, 0),
    bitsDespues: vivas.reduce((suma, c) => suma + c.bitsDespues, 0),
    correlaciones,
    fueraDelCruce,
    tope: {
      cardinalidadMaxima: CARDINALIDAD_MAXIMA_DE_CORRELACION,
      columnasMaximas: COLUMNAS_MAXIMAS_DE_CORRELACION,
    },
  };
}
