// Riesgo ESTIMADO — la otra mitad del asunto, y la que jamás se mezcla con la primera.
//
// `riesgo.ts` cuenta registros: es un group-by sobre el archivo del usuario y por eso viaja marcado
// `naturaleza: "exacto"`. Este archivo hace algo distinto: responde preguntas sobre una POBLACIÓN
// que Velo no tiene delante, apoyándose en un modelo y en un supuesto que el usuario declara. Por
// eso todo lo que sale de aquí va marcado `naturaleza: "estimado"`.
//
// **La regla dura del módulo: el estimado no se compone con el exacto.** Ni promedio, ni «riesgo
// total», ni la misma unidad visual. Y como el S2 aprendió por las malas, una regla que vive en la
// pantalla es una regla que tres pantallas pueden olvidar: aquí vive en el TIPO. Las cifras
// estimadas no son `number` sino `CifraEstimada` —un objeto con su intervalo—, así que
// `exacto.riesgoPromedio + estimado.promedio` NO COMPILA. Hay un test que lo fija.
//
// Los dos estimadores citan su fuente en el código, como los validadores del S1 citan a la DIAN.
// No es adorno: una fórmula mal copiada aquí produce un número plausible y falso, que es el peor
// defecto posible en un producto cuya propuesta de valor es la precisión.
//
// ── Por qué no hay estimador «por defecto» ────────────────────────────────────────────────────
// Ningún estimador poblacional existe sin fracción de muestreo, y Velo no puede conocerla: solo ve
// el archivo. Inventar un supuesto por defecto —«asumamos que es el 1 % de algo»— sería exactamente
// la mentira que este repo persigue. Sin población declarada NO se calcula, y se dice por qué.

import type { ClasesDeEquivalencia } from "./riesgo";

// ── Vocabulario común ─────────────────────────────────────────────────────────────────────────

/** Nivel de confianza de los intervalos. Un solo valor para todo el módulo. */
export const NIVEL_DE_CONFIANZA = 0.95;

/** Cuantil normal 0,975 — el 1,96 de los libros, con los decimales que hacen falta. */
const Z = 1.959963984540054;

/**
 * Tope de pasos de la enumeración exacta de la binomial negativa antes de buscar otra vía.
 *
 * Es un bucle de cinco operaciones: dos millones de pasos son unos milisegundos, y se pagan una vez
 * por tratamiento dentro del worker.
 */
const TOPE_DE_ENUMERACION = 2_000_000;

/**
 * Tamaño de clase a partir del cual la binomial negativa se parece bastante a una normal.
 *
 * Su asimetría es (2−p)/√(f·q): cae con la raíz de f. Con clases pequeñas —y la clase de tamaño 1
 * es la que más importa— la campana miente, así que ahí no se usa.
 */
const CLASE_BASTANTE_SIMETRICA = 50;

/**
 * Un intervalo, o la razón honesta de que no lo haya.
 *
 * La variante `no-derivable` no es un hueco por rellenar: es la respuesta correcta cuando no hay
 * incertidumbre de muestreo que medir, o cuando medirla exigiría un supuesto que no se sostiene.
 * Poner ahí una banda inventada sería justo la precisión falsa que este módulo existe para evitar.
 */
export type Intervalo =
  | {
      readonly tipo: "derivado";
      readonly desde: number;
      readonly hasta: number;
      readonly confianza: number;
      /** Qué recoge el intervalo y, sobre todo, qué NO recoge. */
      readonly cubre: string;
    }
  | { readonly tipo: "no-derivable"; readonly porque: string };

/**
 * Una cifra estimada. **Nunca viaja como `number` suelto.**
 *
 * Es la misma decisión que `BalanceDelTratamiento.reduccion` tomó en el S2 —la cifra viaja con lo
 * que la califica— aplicada al otro plano. Aquí gana además un efecto de tipos: sumarla a una cifra
 * exacta es un error de compilación, no un descuido que la revisión tenga que cazar.
 */
export interface CifraEstimada {
  readonly naturaleza: "estimado";
  readonly valor: number;
  readonly intervalo: Intervalo;
}

/** Por qué no se pudo estimar. Cada motivo tiene su frase; ninguno devuelve un cero disfrazado. */
export type MotivoDeNoEstimar =
  | "sin-poblacion-declarada"
  | "poblacion-menor-que-el-archivo"
  | "archivo-vacio"
  | "muestra-demasiado-pequena";

export interface EstimacionRechazada {
  readonly ok: false;
  readonly naturaleza: "estimado";
  readonly motivo: MotivoDeNoEstimar;
  readonly explicacion: string;
}

export interface EntradasDeEstimacion {
  /** Clases de equivalencia de la MUESTRA — las que `riesgo.ts` ya calculó sobre el archivo. */
  readonly clases: ClasesDeEquivalencia;
  /** Filas del archivo: la n del modelo. */
  readonly filas: number;
  /** Población declarada por el usuario (N). `null` cuando no la declaró, que es lo normal. */
  readonly poblacion: number | null;
}

/** Lo que comparten los dos estimadores: de dónde salen y bajo qué condiciones valen. */
interface Procedencia {
  readonly naturaleza: "estimado";
  readonly modelo: string;
  readonly supuesto: string;
  readonly fuente: string;
  readonly poblacion: number;
  readonly fraccionDeMuestreo: number;
}

export type Estimacion<T> =
  ({ readonly ok: true } & Procedencia & T) | EstimacionRechazada;

// ── El histograma de tamaños, que los dos estimadores comparten ───────────────────────────────

/**
 * Cuántas clases hay de cada tamaño, con las llaves en orden ascendente fijo.
 *
 * El orden importa aunque la suma sea conmutativa: sumar en punto flotante en distinto orden
 * cambia los últimos bits, y este producto promete que dos corridas dan lo mismo byte a byte.
 */
function histogramaDeTamanos(tamanos: ArrayLike<number>): Map<number, number> {
  const cuenta = new Map<number, number>();
  for (let i = 0; i < tamanos.length; i++) {
    const t = tamanos[i];
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  return new Map([...cuenta].sort((a, b) => a[0] - b[0]));
}

// ── Estimador 1 · riesgo individual de Benedetti–Franconi (1998) ──────────────────────────────
//
// FUENTE. Benedetti, R. & Franconi, L. (1998), «Statistical and technological solutions for
// controlled data dissemination»; Benedetti, Capobianchi & Franconi (1998). Es el estimador que
// implementan μ-ARGUS y sdcMicro. El modelo está enunciado literalmente en Rinott, Y. & Shlomo, N.
// (2007), «A smoothing model for sample disclosure risk estimation» (arXiv:0708.0980), §2.2:
//
//     «In the Argus model it is assumed that F_k | f_k ~ f_k + NB(f_k, π_k) with an implicit
//      assumption of independence between cells. Since π_k are assumed known we could now
//      calculate P(F_k = 1 | f_k = 1) and E[1/F_k | f_k = 1].»
//
// Es decir: para la clase k con f_k registros en la muestra, la frecuencia poblacional F_k sigue
// una binomial negativa desplazada, y el riesgo individual es la ESPERANZA DE 1/F_k — «si alguien
// intenta emparejar esta fila con una persona de la población, ¿qué probabilidad tiene de acertar?».
//
//     P(F = F | f) = C(F−1, f−1) · p^f · q^(F−f),   F ≥ f,   q = 1 − p
//     r_f = E[1/F | f] = Σ_{F≥f} (1/F) · C(F−1, f−1) · p^f · q^(F−f)
//
// π_k en μ-ARGUS sale de los pesos de diseño de la encuesta. Velo no tiene pesos —solo un archivo—
// así que usa la MISMA fracción p = n/N para todas las clases. Es un supuesto, y se declara.
//
// ── Cómo se calcula, y por qué NO con la recursión de los manuales ────────────────────────────
//
// Metiendo 1/F = ∫₀¹ x^(F−1) dx y sumando la serie se llega a la forma cerrada
//
//     r_f = ∫₀¹ p·x^(f−1)·(1 − qx)^(−f) dx
//
// y de ahí, integrando por partes, a la recursión clásica:
//
//     r_1 = (p/q)·ln(1/p)        r_f = (p/q)·( 1/(f−1) − r_{f−1} )
//
// **Esa recursión es una trampa.** Amplifica el error por p/q en cada paso, así que en cuanto
// p > 1/2 se descompone: con p = 0,99 y f = 5 devuelve 0,1983314862 contra el verdadero
// 0,1983309464 —correcto hasta el quinto decimal, falso en el sexto—, y con p = 0,9 y f = 50
// devuelve −3,7×10³¹. El primer caso es el peligroso: ningún test de «hay un número entre 0 y 1»
// lo ve pasar.
//
// Así que aquí hay DOS caminos, cada uno en el terreno donde es estable, y un test los compara
// contra la suma directa de la binomial negativa:
//
//   · p < 1/2 → la recursión ascendente, que ahí CONTRAE el error (factor p/q < 1). Medida hasta
//     clases de 500.000: error relativo máximo 8,5×10⁻¹⁴.
//   · p ≥ 1/2 → el desarrollo en (1 − x) del integral, que da una serie de TÉRMINOS TODOS
//     POSITIVOS —sin cancelación posible— con razón acotada por q < 1/2:
//
//         r_f = p · Σ_{k≥0}  q^k · k! / ( f·(f+1)···(f+k) )
//
//     Converge en 52 términos en el peor caso (p = 0,5; f = 2) y en 4 con clases grandes.
//     Error relativo máximo medido: 6,2×10⁻¹⁶.

/** Frontera entre los dos métodos: donde la recursión ascendente deja de contraer el error. */
const FRONTERA_DE_METODO = 0.5;

/** Tope de términos de la serie. Con razón < 1/2, 200 sobran para el épsilon del double. */
const TERMINOS_DE_LA_SERIE = 200;

/**
 * `r_f` por la serie de términos positivos. Válida para todo p; rápida cuando p ≥ 1/2.
 *
 * Con p = 1 (censo) solo sobrevive el primer término y devuelve exactamente 1/f, que es el riesgo
 * prosecutor EXACTO del S1: cuando el usuario declara que su archivo es la población entera, el
 * estimador deja de estimar y cae encima del exacto. Hay un test que lo fija.
 */
function riesgoPorSerie(f: number, p: number): number {
  const q = 1 - p;
  let termino = p / f;
  let suma = termino;
  for (let k = 0; k < TERMINOS_DE_LA_SERIE; k++) {
    termino = (termino * q * (k + 1)) / (f + k + 1);
    suma += termino;
    if (termino < 1e-19 * suma) break;
  }
  return suma;
}

/**
 * Riesgo individual de UNA clase de tamaño `f` con fracción de muestreo `p`.
 *
 * Cuesta O(f) cuando p < 1/2, porque la recursión pasa por todos los tamaños menores. Para un
 * archivo entero está `tablaDeRiesgoIndividual`, que hace ese recorrido una sola vez.
 */
export function riesgoIndividualDeClase(f: number, p: number): number {
  if (f <= 0) return 0;
  if (p >= FRONTERA_DE_METODO) return riesgoPorSerie(f, p);
  const q = 1 - p;
  let r = (p / q) * Math.log(1 / p);
  for (let i = 2; i <= f; i++) r = (p / q) * (1 / (i - 1) - r);
  return r;
}

/** Riesgo individual de cada tamaño presente, en un solo recorrido ascendente. */
function tablaDeRiesgoIndividual(
  tamanos: readonly number[],
  p: number,
): Map<number, number> {
  const tabla = new Map<number, number>();
  if (tamanos.length === 0) return tabla;

  if (p >= FRONTERA_DE_METODO) {
    for (const f of tamanos) tabla.set(f, riesgoPorSerie(f, p));
    return tabla;
  }

  const q = 1 - p;
  let r = (p / q) * Math.log(1 / p);
  let siguiente = 0;
  if (tamanos[0] === 1) {
    tabla.set(1, r);
    siguiente = 1;
  }
  const mayor = tamanos[tamanos.length - 1];
  for (let f = 2; f <= mayor; f++) {
    r = (p / q) * (1 / (f - 1) - r);
    if (siguiente < tamanos.length && tamanos[siguiente] === f) {
      tabla.set(f, r);
      siguiente++;
    }
  }
  return tabla;
}

const CUBRE_EL_RIESGO =
  "recoge la incertidumbre del modelo sobre cuántas personas más comparten esos valores en la población. " +
  "NO recoge el error de suponer el modelo: si el archivo no es una muestra aleatoria simple de esa población, el intervalo tampoco vale.";

/**
 * Intervalo posterior de 1/F para una clase de tamaño `f`.
 *
 * La cifra que se reporta es E[1/F], una esperanza. Esto es otra cosa: el rango donde el modelo
 * sitúa el riesgo REAL de ese registro, que depende de una F que nadie conoce. Sale de los cuantiles
 * de la binomial negativa, invertidos (F grande ⇒ riesgo pequeño).
 */
function intervaloDeRiesgo(f: number, p: number): Intervalo {
  if (p >= 1) {
    // Censo: la posterior es degenerada en F = f. No hay nada que ignorar.
    return {
      tipo: "derivado",
      desde: 1 / f,
      hasta: 1 / f,
      confianza: NIVEL_DE_CONFIANZA,
      cubre:
        "en censo no hay incertidumbre de muestreo: el estimado coincide con el riesgo exacto.",
    };
  }

  const q = 1 - p;
  const cola = (1 - NIVEL_DE_CONFIANZA) / 2;
  const derivado = (desde: number, hasta: number): Intervalo => ({
    tipo: "derivado",
    desde,
    hasta,
    confianza: NIVEL_DE_CONFIANZA,
    cubre: CUBRE_EL_RIESGO,
  });

  // f = 1 es el caso que más importa —los registros que están SOLOS— y el peor para todo lo demás:
  // la posterior es geométrica, larguísima con p pequeña y nada parecida a una campana. Por suerte
  // ahí los cuantiles tienen forma cerrada: P(F ≤ m) = 1 − q^m.
  if (f === 1) {
    const inferior = Math.max(1, Math.ceil(Math.log(1 - cola) / Math.log(q)));
    const superior = Math.max(
      inferior,
      Math.ceil(Math.log(cola) / Math.log(q)),
    );
    return derivado(1 / superior, 1 / inferior);
  }

  const media = f / p;
  const desviacion = Math.sqrt((f * q) / (p * p));

  // Enumeración exacta mientras la cola quepa; si no, la campana, y solo con clases lo bastante
  // grandes como para que la campana no mienta. Si no se cumple ninguna, se dice que no hay banda.
  if (media - f + 6 * desviacion <= TOPE_DE_ENUMERACION) {
    // P(F = f+j) = C(f−1+j, j)·p^f·q^j, con la razón (f−1+j)/j entre términos consecutivos.
    let termino = Math.pow(p, f);
    let acumulada = termino;
    let inferior = f;
    let superior = f;
    let vistoInferior = acumulada >= cola;
    for (let j = 1; j <= TOPE_DE_ENUMERACION; j++) {
      termino = (termino * q * (f - 1 + j)) / j;
      acumulada += termino;
      if (!vistoInferior && acumulada >= cola) {
        inferior = f + j;
        vistoInferior = true;
      }
      superior = f + j;
      if (acumulada >= 1 - cola) break;
    }
    return derivado(1 / superior, 1 / inferior);
  }

  if (f >= CLASE_BASTANTE_SIMETRICA) {
    return derivado(
      1 / (media + Z * desviacion),
      1 / Math.max(f, media - Z * desviacion),
    );
  }

  return {
    tipo: "no-derivable",
    porque:
      "con una fracción de muestreo tan pequeña y una clase tan chica, el modelo reparte la frecuencia poblacional en una cola larguísima y torcida: cualquier banda que Velo dibujara aquí sería más precisa que el conocimiento que la sostiene.",
  };
}

export interface RiesgoIndividual {
  /** Riesgo del registro más expuesto: el de la clase más pequeña. */
  readonly maximo: CifraEstimada;
  /** Riesgo medio por registro, ponderado por el tamaño de cada clase. */
  readonly promedio: CifraEstimada;
  /** Tamaño de la clase más pequeña de la muestra — el f del máximo. */
  readonly claseMasPequena: number;
}

/**
 * Riesgo individual estimado de reidentificación (Benedetti–Franconi 1998).
 *
 * Contesta «si alguien intenta emparejar esta fila con una persona de la población, ¿qué
 * probabilidad tiene de acertar?». El exacto del S1 contesta otra cosa —cuántas filas del ARCHIVO
 * son indistinguibles entre sí— y las dos cifras no se suman ni se promedian.
 */
export function riesgoIndividualEstimado(
  entradas: EntradasDeEstimacion,
): Estimacion<RiesgoIndividual> {
  const puerta = revisarEntradas(entradas);
  if (!puerta.pasa) return puerta.rechazo;
  const { poblacion, fraccion } = puerta;

  const histograma = histogramaDeTamanos(entradas.clases.tamanos);
  const presentes = [...histograma.keys()];
  const tabla = tablaDeRiesgoIndividual(presentes, fraccion);

  // La clase más pequeña es la más expuesta: r_f decrece con f, porque el integrando lleva x^(f−1)
  // sobre [0,1] y eso decrece punto a punto. Hay un test de monotonía que lo fija.
  const claseMasPequena = presentes[0];

  let acumulado = 0;
  for (const [tamano, cuantas] of histograma) {
    acumulado += tamano * cuantas * (tabla.get(tamano) ?? 0);
  }

  return {
    ok: true,
    naturaleza: "estimado",
    modelo:
      "binomial negativa: F_k | f_k ~ f_k + NB(f_k, p); el riesgo es E[1/F_k | f_k]",
    supuesto:
      "el archivo es una muestra aleatoria simple de la población declarada, con la misma fracción de muestreo para todas las clases (μ-ARGUS la saca de los pesos de la encuesta; Velo solo ve el archivo)",
    fuente:
      "Benedetti & Franconi (1998), el estimador de μ-ARGUS y sdcMicro. Modelo citado literalmente en Rinott & Shlomo (2007), arXiv:0708.0980 §2.2.",
    poblacion,
    fraccionDeMuestreo: fraccion,
    claseMasPequena,
    maximo: {
      naturaleza: "estimado",
      valor: tabla.get(claseMasPequena) ?? 0,
      intervalo: intervaloDeRiesgo(claseMasPequena, fraccion),
    },
    promedio: {
      naturaleza: "estimado",
      valor: acumulado / entradas.filas,
      intervalo: {
        tipo: "no-derivable",
        porque:
          "es la esperanza del modelo, no una cantidad medida: fijada la fracción de muestreo, su valor es el que es. Lo que puede fallar aquí es el modelo entero, y el error de un modelo no cabe en un intervalo de confianza.",
      },
    },
  };
}

// ── Estimador 2 · únicos poblacionales de Zayatz (1991) ───────────────────────────────────────
//
// FUENTE. Zayatz, L. V. (1991), «Estimation of the Percent of Unique Population Elements on a
// Microdata File Using the Sample», CENSUS/SRD/RR-91/08, U.S. Bureau of the Census, **§III
// (Procedure Using Equivalence Classes)**.
//
// El informe trae dos métodos propios. El §II usa submuestreo —necesitaría azar, que el gate de
// determinismo veta en `engine/`—; el §III usa la distribución de tamaños de las clases de
// equivalencia, que es justo lo que `riesgo.ts` ya calcula. Se implementa el §III.
//
// Contesta «de mis N filas únicas en el archivo, ¿cuántas lo serían en toda la población?».
//
//     Prob(C_p)     = probabilidad de que una clase de la POBLACIÓN tenga tamaño C. Se ESTIMA con
//                     la proporción de clases de tamaño C en la muestra (ahí está el supuesto).
//     Prob(1_s|C_p) = probabilidad de que una clase poblacional de tamaño C aparezca como clase de
//                     tamaño 1 en la muestra. Hipergeométrica, y se calcula EXACTA:
//
//                         Prob(1_s|C_p) = C(C,1)·C(N−C, n−1) / C(N,n)
//
//     Y por Bayes:  Prob(1_p|1_s) = Prob(1_p)·Prob(1_s|1_p) / Σ_C Prob(C_p)·Prob(1_s|C_p)
//
// El estimado de únicos poblacionales es u₁ · Prob(1_p|1_s); la proporción, eso entre n.
//
// Detalle bonito que sale solo de la fórmula: Prob(1_s|1_p) = C(N−1,n−1)/C(N,n) = n/N, o sea la
// propia fracción de muestreo. Es un test.

/**
 * Prob(1_s | C_p) para C = 1..maxC, en un recorrido.
 *
 * Se esquiva el binomial de números astronómicos escribiéndolo como producto:
 *
 *     Prob(1_s|C_p) = C·(n/N) · Π_{j=1..C−1} (N−n−j+1)/(N−j)
 *
 * —«uno de los C cae dentro de la muestra (n/N) y los otros C−1 se quedan fuera»— y se avanza de C
 * a C+1 multiplicando. Se comprueba contra los 20 valores publicados en la Tabla 4 del informe.
 *
 * A diferencia del ejemplo del paper, que trunca en C = 20 porque más allá Prob(C_p) ≈ 0, aquí se
 * recorren TODOS los tamaños presentes: truncar en silencio es la clase de atajo que este repo
 * declara o no toma.
 */
export function probabilidadDeUnicoEnMuestra(
  maxC: number,
  poblacion: number,
  filas: number,
): Float64Array {
  const probabilidades = new Float64Array(maxC + 1);
  if (maxC < 1) return probabilidades;
  let actual = filas / poblacion;
  probabilidades[1] = actual;
  for (let c = 2; c <= maxC; c++) {
    // Si quedan menos huecos fuera de la muestra que miembros por dejar fuera, es imposible.
    const fuera = poblacion - filas - c + 2;
    if (fuera <= 0) break;
    actual = (actual * c * fuera) / ((c - 1) * (poblacion - c + 1));
    probabilidades[c] = actual;
  }
  return probabilidades;
}

/**
 * Fracción de muestreo por debajo de la cual Velo NO da esta cifra.
 *
 * No es un número a ojo: sale de la evaluación del propio informe. Con la población #9 (56.372
 * registros, 15 variables, 39,073 % de únicos reales) la Tabla 6 da 46,754 % con fracción 0,1 y
 * 42,521 % con 0,2 — sobreestima siempre, y más cuanto menor es la fracción. La Tabla 8, con
 * fracción 1/100, es directamente inservible: 1,862 % contra un 0,194 % real (factor 10) y 78,590 %
 * contra un 35,139 % real.
 *
 * Dar ese número con una advertencia al lado sería dar un número débil. Se rechaza y se explica.
 */
export const FRACCION_MINIMA_ZAYATZ = 0.1;

export interface UnicosPoblacionales {
  /** Proporción de filas del archivo que además serían únicas en la población. */
  readonly proporcion: CifraEstimada;
  /** Cuántas filas serían, en números redondos. */
  readonly registros: CifraEstimada;
  /** Únicos en la MUESTRA: dato exacto que sirve de denominador, no una estimación. */
  readonly unicosEnLaMuestra: number;
  /** Prob(1_p | 1_s): de cada único del archivo, qué fracción lo es también en la población. */
  readonly proporcionDeLosUnicosQueSobrevive: number;
}

const PROCEDENCIA_ZAYATZ = {
  modelo:
    "clases de equivalencia + Bayes con muestreo hipergeométrico: Prob(1_p|1_s) = Prob(1_p)·Prob(1_s|1_p) / Σ_C Prob(C_p)·Prob(1_s|C_p)",
  supuesto:
    "la distribución de tamaños de clase de la muestra aproxima la de la población, y los datos son REALES: el propio informe advierte que el método puede no funcionar sobre datos simulados con estructuras de clase atípicas",
  fuente:
    "Zayatz, L. V. (1991), «Estimation of the Percent of Unique Population Elements on a Microdata File Using the Sample», CENSUS/SRD/RR-91/08, U.S. Bureau of the Census, §III.",
} as const;

const CUBRE_LOS_UNICOS =
  "recoge cuáles de tus registros únicos resultan serlo también en la población, bajo el modelo. " +
  "NO recoge el error del método: en la evaluación del propio Zayatz (1991) esta cifra SOBREESTIMA, y tanto más cuanto menor es la fracción de muestreo.";

function cifraSinUnicos(): CifraEstimada {
  return {
    naturaleza: "estimado",
    valor: 0,
    intervalo: {
      tipo: "no-derivable",
      porque:
        "no hay ni un registro único en el archivo, así que no hay nada de lo que estimar la supervivencia. Ese cero es exacto, no estimado.",
    },
  };
}

/**
 * Intervalo sobre cuántos de los `ensayos` únicos muestrales resultan ser únicos poblacionales.
 *
 * Bajo el modelo ese recuento es una binomial de parámetro CONOCIDO —la aleatoriedad está en
 * cuáles sobreviven, no en el parámetro—, así que la banda es la normal de esa binomial y no un
 * Wilson, que sirve para el caso contrario (parámetro desconocido estimado con los datos). Con
 * probabilidad 1 la binomial es degenerada y el intervalo es un punto, que es lo correcto: en
 * censo no queda nada por ignorar.
 */
function intervaloBinomial(
  ensayos: number,
  probabilidad: number,
  escala: number,
): Intervalo {
  const varianza = ensayos * probabilidad * (1 - probabilidad);
  if (varianza === 0) {
    return {
      tipo: "derivado",
      desde: ensayos * probabilidad * escala,
      hasta: ensayos * probabilidad * escala,
      confianza: NIVEL_DE_CONFIANZA,
      cubre:
        probabilidad >= 1
          ? "en censo no hay incertidumbre de muestreo: el estimado coincide con el exacto."
          : CUBRE_LOS_UNICOS,
    };
  }
  if (varianza < 10) {
    return {
      tipo: "no-derivable",
      porque:
        "hay muy pocos registros únicos para que una banda signifique algo: la aproximación normal de la binomial pide al menos 10 de varianza y aquí no llega.",
    };
  }

  const centro = ensayos * probabilidad;
  const desviacion = Math.sqrt(varianza);
  return {
    tipo: "derivado",
    desde: Math.max(0, centro - Z * desviacion) * escala,
    hasta: Math.min(ensayos, centro + Z * desviacion) * escala,
    confianza: NIVEL_DE_CONFIANZA,
    cubre: CUBRE_LOS_UNICOS,
  };
}

export function unicosPoblacionalesEstimados(
  entradas: EntradasDeEstimacion,
): Estimacion<UnicosPoblacionales> {
  const puerta = revisarEntradas(entradas);
  if (!puerta.pasa) return puerta.rechazo;
  const { poblacion, fraccion } = puerta;

  if (fraccion < FRACCION_MINIMA_ZAYATZ) {
    return {
      ok: false,
      naturaleza: "estimado",
      motivo: "muestra-demasiado-pequena",
      explicacion:
        `El archivo es el ${(fraccion * 100).toFixed(2)} % de la población declarada, y por debajo del ` +
        `${FRACCION_MINIMA_ZAYATZ * 100} % este método deja de servir: en la evaluación del propio ` +
        "Zayatz (1991), con una fracción del 1 % las estimaciones llegan a errar por un factor de 10. " +
        "Velo prefiere no dar la cifra a darla débil.",
    };
  }

  const histograma = histogramaDeTamanos(entradas.clases.tamanos);
  const presentes = [...histograma.keys()];
  const clasesTotales = entradas.clases.tamanos.length;
  const unicosEnLaMuestra = histograma.get(1) ?? 0;

  if (unicosEnLaMuestra === 0) {
    return {
      ok: true,
      naturaleza: "estimado",
      ...PROCEDENCIA_ZAYATZ,
      poblacion,
      fraccionDeMuestreo: fraccion,
      unicosEnLaMuestra: 0,
      proporcionDeLosUnicosQueSobrevive: 0,
      proporcion: cifraSinUnicos(),
      registros: cifraSinUnicos(),
    };
  }

  const condicionadas = probabilidadDeUnicoEnMuestra(
    presentes[presentes.length - 1],
    poblacion,
    entradas.filas,
  );

  // Σ_C Prob(C_p)·Prob(1_s|C_p). El término C = 1 es a la vez el numerador de Bayes, así que el
  // cociente nunca puede pasar de 1 — invariante con test.
  let denominador = 0;
  let numerador = 0;
  for (const [tamano, cuantas] of histograma) {
    const aporte = (cuantas / clasesTotales) * (condicionadas[tamano] ?? 0);
    denominador += aporte;
    if (tamano === 1) numerador = aporte;
  }

  const sobrevive = denominador > 0 ? numerador / denominador : 0;
  const registros = unicosEnLaMuestra * sobrevive;

  return {
    ok: true,
    naturaleza: "estimado",
    ...PROCEDENCIA_ZAYATZ,
    poblacion,
    fraccionDeMuestreo: fraccion,
    unicosEnLaMuestra,
    proporcionDeLosUnicosQueSobrevive: sobrevive,
    registros: {
      naturaleza: "estimado",
      valor: registros,
      intervalo: intervaloBinomial(unicosEnLaMuestra, sobrevive, 1),
    },
    proporcion: {
      naturaleza: "estimado",
      valor: registros / entradas.filas,
      intervalo: intervaloBinomial(
        unicosEnLaMuestra,
        sobrevive,
        1 / entradas.filas,
      ),
    },
  };
}

// ── Puerta común ──────────────────────────────────────────────────────────────────────────────

type Puerta =
  | {
      readonly pasa: true;
      readonly poblacion: number;
      readonly fraccion: number;
    }
  | { readonly pasa: false; readonly rechazo: EstimacionRechazada };

/** Lo que descalifica a los DOS estimadores, dicho una sola vez. */
function revisarEntradas(entradas: EntradasDeEstimacion): Puerta {
  const rechazo = (motivo: MotivoDeNoEstimar, explicacion: string): Puerta => ({
    pasa: false,
    rechazo: { ok: false, naturaleza: "estimado", motivo, explicacion },
  });

  if (entradas.filas <= 0 || entradas.clases.tamanos.length === 0) {
    return rechazo("archivo-vacio", "El archivo no tiene filas que medir.");
  }
  if (entradas.poblacion === null) {
    return rechazo(
      "sin-poblacion-declarada",
      "Ningún estimador poblacional existe sin saber de qué población salió el archivo, y Velo solo ve el archivo. " +
        "Declara cuántas personas tiene la población entera y aparecerá la estimación; el riesgo exacto no depende de este dato.",
    );
  }
  if (entradas.poblacion < entradas.filas) {
    return rechazo(
      "poblacion-menor-que-el-archivo",
      `La población declarada (${entradas.poblacion}) es menor que el archivo (${entradas.filas} filas). ` +
        "O el archivo no sale de esa población, o la cifra está mal escrita.",
    );
  }
  return {
    pasa: true,
    poblacion: entradas.poblacion,
    fraccion: entradas.filas / entradas.poblacion,
  };
}

// ── Entrada principal ─────────────────────────────────────────────────────────────────────────

export interface RiesgoEstimado {
  readonly individual: Estimacion<RiesgoIndividual>;
  readonly poblacional: Estimacion<UnicosPoblacionales>;
}

/**
 * Los dos estimadores, cada uno con su propio veredicto.
 *
 * Van juntos pero NO compuestos: uno puede dar cifra y el otro rechazar —pasa siempre que la
 * fracción de muestreo es baja, porque los dos modelos tienen dominios de validez distintos— y esa
 * asimetría es información, no un defecto que haya que uniformar.
 */
export function estimarRiesgo(entradas: EntradasDeEstimacion): RiesgoEstimado {
  return {
    individual: riesgoIndividualEstimado(entradas),
    poblacional: unicosPoblacionalesEstimados(entradas),
  };
}
