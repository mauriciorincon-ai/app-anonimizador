// El regreso — de vuelta a los valores originales, con la bóveda.
//
// Este motor recibe el archivo que **devolvió el tercero**, no el que Velo entregó. Entre uno y
// otro pasó un trabajo real: se reordenaron filas, se añadieron columnas de resultados, se borraron
// las que no servían, se corrigieron valores a mano. Restaurar tiene que sobrevivir a todo eso y
// **respetar lo que el tercero hizo**, que es la mitad del trato: el usuario entregó para que
// alguien trabajara, no para recibir su propio archivo de vuelta.
//
// Tres decisiones que hacen que eso funcione, y una que hace que sea honesto:
//
//   1. **Por VALOR, jamás por posición.** Se busca cada valor del diccionario en la
//      correspondencia de su columna. La fila 7 del archivo devuelto no tiene por qué ser la fila 7
//      del que salió, y confiar en que lo sea devolvería el dato de otra persona en cuanto alguien
//      ordenara por otra columna en Excel.
//   2. **Sobre el DICCIONARIO, no fila por fila.** Una columna de 500.000 filas con 446.000 valores
//      distintos cuesta 446.000 búsquedas, no 500.000; y una de 12 valores distintos cuesta 12. Es
//      el mismo truco que hace que Mondrian y los seudónimos quepan en el presupuesto.
//   3. **Las columnas se reconocen por CONTENIDO, no por nombre.** El tercero pudo renombrarlas —
//      «cedula» pasó a ser «ID_PACIENTE» — y un motor que se fiara del encabezado no restauraría
//      nada sin decir por qué.
//   4. **La celda que no se puede devolver no se inventa.** Cada celda queda en una de cuatro
//      categorías, y las tres que no son «restaurada» se cuentan y se dicen. Un seudónimo
//      colisionado no tiene una respuesta: tiene dos, y elegir una en silencio sería devolverle a
//      alguien el dato de otro.
//
// Puro y determinista, como el resto de `engine/`: dos restauraciones del mismo par
// (archivo, bóveda) producen la misma tabla, byte por byte.

import {
  indiceDeColumna,
  type Boveda,
  type CorrespondenciaDeColumna,
} from "./boveda";
import {
  reconstruirColumna,
  type ColumnaColumnar,
  type TablaColumnar,
} from "./columnar";

/**
 * Cuánto de una columna tiene que salir de la bóveda para darla por reconocida.
 *
 * **Primero, lo que este umbral NO hace**, porque es lo que se suele suponer de un número así: no
 * es lo que impide devolver el dato de otra persona. Eso lo impide la búsqueda, que es exacta —
 * cada valor está en la correspondencia o no está— y el hecho de que cada columna se restaure con
 * **una sola** correspondencia, la de mejor puntaje. Un seudónimo que por casualidad exista también
 * en otra columna de la bóveda no puede contaminar esta: nunca se consultan dos.
 *
 * Lo que sí decide el umbral es **si Velo toca la columna**. Y ahí sí hay una asimetría:
 *
 * - **Reconocer de menos** (umbral alto): una columna que el tercero editó mucho se queda sin
 *   restaurar. El usuario lo VE —sale con su proporción al lado— y puede actuar.
 * - **Reconocer de más** (umbral bajo): una columna que no salió de Velo —notas, referencias— tiene
 *   un par de valores que **coinciden por azar** con seudónimos, y esas celdas se reemplazan por
 *   cédulas de gente que no tiene nada que ver. No devuelve el original equivocado: destroza el
 *   trabajo del tercero metiéndole datos personales donde no los había.
 *
 * La mitad significa algo que una persona puede comprobar: **más de la mitad de lo que hay en esta
 * columna salió de esta correspondencia**. Y el estado «no reconocida» existe justamente para que
 * Velo no tenga que adivinar.
 */
export const UMBRAL_DE_RECONOCIMIENTO = 0.5;

/**
 * Coincidencias mínimas, además de la proporción.
 *
 * La proporción sola es frágil justo donde hay poco que medir: una columna de dos valores con uno
 * conocido da 0,5 y pasa. Con los números del peor caso —446.000 seudónimos de cédula sobre un
 * espacio de 10⁹— la probabilidad de que un valor cualquiera coincida por azar es 4,5×10⁻⁴; exigir
 * **dos** la lleva a 2×10⁻⁷, y una columna de verdad tiene cientos.
 *
 * El precio es real y se declara: una columna reversible con un único valor distinto sale con su
 * proporción en 1 y **sin restaurar**. Es un caso degenerado —una columna de una sola cédula
 * repetida— y perderlo cuesta menos que tocar una columna que no era.
 */
export const MINIMO_DE_COINCIDENCIAS = 2;

/** En qué acabó cada celda. Las tres que no son `restaurada` se cuentan y se dicen. */
export interface CeldasDeColumna {
  /** Volvió a su valor original. */
  readonly restauradas: number;
  /**
   * Su seudónimo tiene **más de un original**: no hay una respuesta. La celda se deja como está
   * —con el seudónimo— porque escribir uno de los dos sería devolver el dato de otra persona, y
   * borrarla destruiría la pista que permite resolverlo a mano.
   */
  readonly ambiguas: number;
  /** El valor no está en la bóveda: el tercero lo cambió, o lo escribió él. Se deja tal cual. */
  readonly desconocidas: number;
}

export interface ColumnaRestaurada {
  /** Nombre en el archivo devuelto, que puede no ser el que salió de Velo. */
  readonly columna: string;
  /** Columna de la bóveda que la explica. `null` cuando no se reconoció ninguna. */
  readonly deLaBoveda: string | null;
  /** Valores distintos de la columna que estaban en la correspondencia mejor puntuada. */
  readonly coincidencias: number;
  /** Valores distintos NO vacíos de la columna. Es el denominador de la proporción. */
  readonly distintos: number;
  /**
   * Proporción de valores distintos no vacíos que salieron de la correspondencia elegida (0 a 1).
   *
   * Viaja aunque la columna NO se reconozca, y a propósito: «no la restauramos, reconocimos el
   * 31 %» es una frase accionable, y «no reconocida» a secas no lo es.
   */
  readonly proporcionReconocida: number;
  readonly celdas: CeldasDeColumna;
}

export type ReconocimientoDeBoveda = "completo" | "parcial" | "ninguno";

/**
 * Algo que hay que decir en la MISMA línea que el porcentaje de restauración.
 *
 * Misma mecánica que las salvedades del balance del S2, y por la misma razón: **«restauradas
 * 445.806 de 446.006 (99,96 %)» es cierto y engañoso** si no dice que 200 celdas volvieron con el
 * valor de otra persona posible. La regla no vive en la pantalla —donde tres vistas son tres
 * ocasiones de olvidarla—, vive en el tipo: la proporción viaja con sus salvedades ya ordenadas y
 * con `esTitular` decidido.
 *
 * `gravedad` separa lo que **desmiente** la lectura «el archivo volvió» de lo que la **matiza**.
 */
export type SalvedadDelRegreso = {
  readonly gravedad: "descalifica" | "matiza";
} & (
  | {
      /** Celdas cuyo seudónimo tiene dos originales. Encabeza siempre: es la que puede hacer daño. */
      readonly tipo: "celdas-ambiguas";
      readonly cuantas: number;
      readonly proporcion: number;
    }
  | {
      /** Ninguna columna de la bóveda apareció: esta bóveda no es de este archivo. */
      readonly tipo: "boveda-no-corresponde";
    }
  | {
      /** Columnas de la bóveda que no aparecieron. Lo que no volvió no entra al porcentaje. */
      readonly tipo: "columnas-sin-aparecer";
      readonly columnas: readonly string[];
    }
  | {
      /**
       * Una columna con valores de la bóveda que no llegó al umbral. No se restauró, y decirlo
       * con su proporción es lo que separa un «no» accionable de un «no» a secas.
       */
      readonly tipo: "columna-a-medias";
      readonly columna: string;
      readonly proporcion: number;
    }
  | {
      /** Celdas que el tercero cambió. No es culpa de nadie, pero el porcentaje no las cubre. */
      readonly tipo: "celdas-desconocidas";
      readonly cuantas: number;
      readonly proporcion: number;
    }
);

/**
 * El orden es la decisión, no el adorno. La ambigüedad va primera **siempre**: es la única
 * categoría en la que el archivo puede salir con el dato de la persona equivocada.
 */
const ORDEN: Record<SalvedadDelRegreso["tipo"], number> = {
  "celdas-ambiguas": 0,
  "boveda-no-corresponde": 1,
  "columnas-sin-aparecer": 2,
  "columna-a-medias": 3,
  "celdas-desconocidas": 4,
};

export interface Restauracion {
  /** El archivo devuelto con los originales puestos donde se pudo. */
  readonly tabla: TablaColumnar;
  readonly columnas: readonly ColumnaRestaurada[];
  /**
   * Qué tanto encajó la bóveda con este archivo. **Lo decide el motor, no la pantalla**: es la
   * misma regla que el S2 aprendió con las salvedades del balance — una clasificación que vive en
   * el tipo no se puede pintar de dos maneras distintas en dos sitios.
   *
   * - `ninguno`: ninguna columna de la bóveda apareció. Esta bóveda no es de este archivo.
   * - `parcial`: algunas sí y otras no (el tercero borró columnas, o las editó demasiado).
   * - `completo`: todas las columnas de la bóveda encontraron la suya.
   */
  readonly reconocimiento: ReconocimientoDeBoveda;
  /** Columnas de la BÓVEDA que no aparecieron en el archivo devuelto. */
  readonly sinAparecer: readonly string[];
  /** Columnas del archivo devuelto que la bóveda no explica. Salen intactas. */
  readonly fueraDeAlcance: readonly string[];
  readonly totales: CeldasDeColumna;
  /**
   * Celdas restauradas sobre el total de celdas con contenido **de las columnas reconocidas**.
   *
   * `null` cuando no había ninguna: no se puede restaurar lo que no existía, y presentar ese 0/0
   * como «0 %» (alarmante) o «100 %» (tranquilizador) sería inventar la cifra en una u otra
   * dirección. Es la misma regla que `reduccion` en el balance del S2.
   */
  readonly proporcionRestaurada: number | null;
  /** Ordenadas: lo que descalifica primero. Nunca hay que ordenarlas otra vez. */
  readonly salvedades: readonly SalvedadDelRegreso[];
  /** ¿El porcentaje puede ir solo, de titular? Solo si nada lo descalifica. */
  readonly esTitular: boolean;
}

interface Candidata {
  readonly correspondencia: CorrespondenciaDeColumna;
  readonly indice: Map<string, readonly string[]>;
  readonly proporcion: number;
  readonly coincidencias: number;
  /** ¿Pasó el criterio? La candidata viaja igual cuando no, por su proporción. */
  readonly reconocida: boolean;
}

/**
 * ¿Qué columna de la bóveda explica esta columna del archivo devuelto?
 *
 * Puntúa contra TODAS las de la bóveda y se queda con la mejor que pase el criterio. El desempate
 * es por nombre de columna de la bóveda, punto de código: dos candidatas con la misma proporción
 * tienen que elegirse igual en toda máquina, o la salida deja de ser reproducible.
 */
function mejorCandidata(
  columna: ColumnaColumnar,
  indices: readonly {
    readonly correspondencia: CorrespondenciaDeColumna;
    readonly indice: Map<string, readonly string[]>;
  }[],
): Candidata | null {
  // El diccionario sin la celda vacía: `valores[0]` es siempre `""` y no se seudonimizó nunca.
  const distintos = columna.valores.length - 1;
  let mejor: Candidata | null = null;

  for (const { correspondencia, indice } of indices) {
    let coincidencias = 0;
    for (let v = 1; v < columna.valores.length; v++) {
      if (indice.has(columna.valores[v])) coincidencias++;
    }
    const proporcion = distintos === 0 ? 0 : coincidencias / distintos;

    if (
      mejor === null ||
      proporcion > mejor.proporcion ||
      (proporcion === mejor.proporcion &&
        correspondencia.columna < mejor.correspondencia.columna)
    ) {
      mejor = {
        correspondencia,
        indice,
        proporcion,
        coincidencias,
        // Se calcula aquí y no fuera para que la candidata sea siempre coherente consigo misma.
        reconocida:
          proporcion >= UMBRAL_DE_RECONOCIMIENTO &&
          coincidencias >= MINIMO_DE_COINCIDENCIAS,
      };
    }
  }

  // La mejor viaja aunque NO pase el criterio: la proporción es lo que permite decir «no la
  // restauramos, reconocimos el 31 %» en vez de un «no» sin explicación.
  return mejor;
}

/**
 * Restaura el archivo devuelto con la bóveda.
 *
 * No lanza y no deja nada a medias en silencio: lo que no se pudo devolver sale contado en
 * `totales` y explicado columna por columna.
 */
export function restaurar(tabla: TablaColumnar, boveda: Boveda): Restauracion {
  // Un índice por columna de la bóveda, construido UNA vez. Buscar linealmente sobre 446.000
  // entradas por cada valor del archivo sería cuadrático.
  const indices = boveda.columnas.map((correspondencia) => ({
    correspondencia,
    indice: indiceDeColumna(correspondencia),
  }));

  const columnas: ColumnaColumnar[] = [];
  const informe: ColumnaRestaurada[] = [];
  const fueraDeAlcance: string[] = [];
  const usadas = new Set<string>();
  let restauradas = 0;
  let ambiguas = 0;
  let desconocidas = 0;

  for (const columna of tabla.columnas) {
    const candidata = mejorCandidata(columna, indices);

    if (candidata === null || !candidata.reconocida) {
      columnas.push(columna);
      fueraDeAlcance.push(columna.nombre);
      informe.push({
        columna: columna.nombre,
        deLaBoveda: null,
        coincidencias: candidata?.coincidencias ?? 0,
        distintos: columna.valores.length - 1,
        proporcionReconocida: candidata?.proporcion ?? 0,
        celdas: { restauradas: 0, ambiguas: 0, desconocidas: 0 },
      });
      continue;
    }

    usadas.add(candidata.correspondencia.columna);

    // Se decide sobre el DICCIONARIO y se cuenta sobre las FILAS: dos valores distintos que caen en
    // la misma categoría son una decisión, pero el usuario cuenta celdas, no valores.
    const nuevos: string[] = [""];
    const categoriaPorValor = new Uint8Array(columna.valores.length);
    for (let v = 1; v < columna.valores.length; v++) {
      const originales = candidata.indice.get(columna.valores[v]);
      if (originales === undefined) {
        nuevos.push(columna.valores[v]);
        categoriaPorValor[v] = 2;
      } else if (originales.length > 1) {
        // Ambigua: se deja el seudónimo. Escribir uno de los dos originales sería devolverle a
        // alguien el dato de otro, y borrar la celda destruiría la pista para resolverlo a mano.
        nuevos.push(columna.valores[v]);
        categoriaPorValor[v] = 1;
      } else {
        nuevos.push(originales[0]);
        categoriaPorValor[v] = 0;
      }
    }

    const celdas = { restauradas: 0, ambiguas: 0, desconocidas: 0 };
    for (let f = 0; f < columna.codigos.length; f++) {
      const codigo = columna.codigos[f];
      if (codigo === 0) continue; // la celda vacía no es de nadie: ni restaurada ni desconocida
      if (categoriaPorValor[codigo] === 0) celdas.restauradas++;
      else if (categoriaPorValor[codigo] === 1) celdas.ambiguas++;
      else celdas.desconocidas++;
    }

    restauradas += celdas.restauradas;
    ambiguas += celdas.ambiguas;
    desconocidas += celdas.desconocidas;

    // `nuevos` va EN PARALELO al diccionario viejo, índice 0 incluido —la celda vacía sigue
    // vacía—, que es lo que `reconstruirColumna` espera. Recortarlo desalinearía cada valor con el
    // código del anterior, y la columna saldría entera con los datos corridos una posición.
    columnas.push(reconstruirColumna(columna, nuevos));
    informe.push({
      columna: columna.nombre,
      deLaBoveda: candidata.correspondencia.columna,
      coincidencias: candidata.coincidencias,
      distintos: columna.valores.length - 1,
      proporcionReconocida: candidata.proporcion,
      celdas,
    });
  }

  const sinAparecer = boveda.columnas
    .map((c) => c.columna)
    .filter((nombre) => !usadas.has(nombre));

  const reconocimiento: ReconocimientoDeBoveda =
    usadas.size === 0
      ? "ninguno"
      : sinAparecer.length === 0
        ? "completo"
        : "parcial";

  const conContenido = restauradas + ambiguas + desconocidas;
  const proporcionRestaurada =
    conContenido === 0 ? null : restauradas / conContenido;

  const salvedades: SalvedadDelRegreso[] = [];
  if (ambiguas > 0) {
    salvedades.push({
      gravedad: "descalifica",
      tipo: "celdas-ambiguas",
      cuantas: ambiguas,
      proporcion: ambiguas / conContenido,
    });
  }
  if (reconocimiento === "ninguno" && boveda.columnas.length > 0) {
    salvedades.push({ gravedad: "descalifica", tipo: "boveda-no-corresponde" });
  }
  if (sinAparecer.length > 0 && reconocimiento !== "ninguno") {
    // Descalifica: lo que no volvió no entra al denominador, así que el porcentaje describe menos
    // archivo del que el lector cree. Es la composición engañosa de siempre.
    salvedades.push({
      gravedad: "descalifica",
      tipo: "columnas-sin-aparecer",
      columnas: sinAparecer,
    });
  }
  for (const columna of informe) {
    // El piso es el MISMO que el del reconocimiento, y no un número nuevo: con dos coincidencias
    // el azar ya está descartado (2×10⁻⁷), así que si no se restauró fue por el umbral y merece
    // decirse. Por debajo de dos, mencionarlo sería ruido.
    if (
      columna.deLaBoveda === null &&
      columna.coincidencias >= MINIMO_DE_COINCIDENCIAS
    ) {
      salvedades.push({
        gravedad: "matiza",
        tipo: "columna-a-medias",
        columna: columna.columna,
        proporcion: columna.proporcionReconocida,
      });
    }
  }
  if (desconocidas > 0) {
    salvedades.push({
      gravedad: "matiza",
      tipo: "celdas-desconocidas",
      cuantas: desconocidas,
      proporcion: desconocidas / conContenido,
    });
  }
  salvedades.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);

  return {
    tabla: { columnas, filas: tabla.filas },
    columnas: informe,
    reconocimiento,
    sinAparecer,
    fueraDeAlcance,
    totales: { restauradas, ambiguas, desconocidas },
    proporcionRestaurada,
    salvedades,
    esTitular: !salvedades.some((s) => s.gravedad === "descalifica"),
  };
}
