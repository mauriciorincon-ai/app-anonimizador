// El balance del tratamiento — el antes y el después, y el sitio exacto donde este sprint podía
// mentir sin que ningún test lo notara.
//
// El patrón que gobierna el Sprint 002 (`la-composicion-de-verdades-puede-mentir`) tiene aquí su
// forma concreta: **«riesgo reducido 92 %» junto a una cédula intacta.** Las dos afirmaciones son
// verdad. La composición dice que el archivo está tratado, y no lo está. Ningún test unitario ve
// esa mentira, porque no hay una cifra equivocada — hay una cifra bien calculada puesta donde no
// debía.
//
// De ahí la decisión de diseño de este archivo: **la regla no vive en la pantalla, vive en el
// tipo.** `reduccion` no es un `number` suelto que cada componente recuerde acompañar; es una cifra
// que viaja con sus salvedades y con `esTitular`, y las salvedades vienen **ya ordenadas** con las
// descalificantes delante. Una pantalla —o un reporte, o el certificado del S3— puede formatearlas
// como quiera, pero no puede reordenarlas por descuido ni imprimir el porcentaje sin haberlas
// tenido en la mano.
//
// Dos cosas que este módulo NO hace:
//   · **No inventa un motor de riesgo.** Corre el del S1 dos veces, sobre la tabla original y sobre
//     la transformada. Si el número de después se calculara distinto que el de antes, la resta no
//     significaría nada.
//   · **No decide por el usuario.** Enumera lo que descalifica la cifra; no bloquea la descarga.
//     Velo mide y dice; entregar el archivo es decisión de quien lo entrega.

import type { Diagnostico } from "./clasificador";
import type { TablaColumnar } from "./columnar";
import type { MedidaDeDiversidad } from "./diversidad";
import type { ResultadoDeMondrian } from "./mondrian";
import { identificadoresSinTratar, type Politica } from "./politica";
import {
  clasesDeEquivalencia,
  riesgoProsecutor,
  type RiesgoExacto,
} from "./riesgo";
import type { ColisionEnColumna } from "./tecnicas";

/**
 * Algo que hay que decir en la MISMA línea que la cifra de reducción.
 *
 * `gravedad` no es una etiqueta de color: separa lo que **desmiente** la lectura «ya está tratado»
 * de lo que la **matiza**. Solo lo primero impide que el porcentaje vaya de titular.
 */
export type Salvedad = { readonly gravedad: "descalifica" | "matiza" } & (
  | {
      /** Columnas que señalan a la persona sin ayuda de nadie, y la política las conserva. */
      readonly tipo: "identificadores-sin-tratar";
      readonly columnas: readonly string[];
    }
  | {
      /** Registros que siguen SOLOS en su clase después del tratamiento. */
      readonly tipo: "unicos-restantes";
      readonly cuantos: number;
      readonly proporcion: number;
    }
  | {
      /** La política pidió un k y el reparto no llegó. */
      readonly tipo: "k-no-alcanzado";
      readonly kObjetivo: number;
      readonly kAlcanzado: number;
    }
  | {
      /**
       * El k que Mondrian alcanzó sobre SUS columnas es mayor que el del archivo entero: hay
       * cuasi-identificadores fuera del reparto que parten esas clases.
       */
      readonly tipo: "k-del-reparto-no-es-el-del-archivo";
      readonly kDelReparto: number;
      readonly kDelArchivo: number;
    }
  | {
      /** Dos valores distintos acabaron con el mismo seudónimo. */
      readonly tipo: "colisiones-de-seudonimo";
      readonly columna: string;
      readonly cuantas: number;
    }
  | {
      /** Clases donde todo el mundo comparte el dato sensible: el ataque de homogeneidad. */
      readonly tipo: "clases-homogeneas";
      readonly atributo: string;
      readonly filas: number;
    }
);

export interface BalanceDelTratamiento {
  readonly antes: RiesgoExacto;
  readonly despues: RiesgoExacto;
  /**
   * Reducción de la proporción de registros únicos.
   *
   * `null` cuando antes no había ninguno: no se puede reducir lo que no existía, y presentar ese
   * 0/0 como «0 %» (alarmante) o como «100 %» (tranquilizador) sería inventar la cifra en una u
   * otra dirección.
   */
  readonly reduccion: number | null;
  /** Ordenadas: lo que descalifica primero. Nunca hay que ordenarlas otra vez. */
  readonly salvedades: readonly Salvedad[];
  /**
   * ¿La reducción puede presentarse sola, como titular? Solo si nada la descalifica.
   *
   * Existe como campo y no como cálculo de cada pantalla porque la regla es del producto, no de la
   * vista: tres pantallas que la recalculen son tres oportunidades de olvidarla.
   */
  readonly esTitular: boolean;
}

export interface EntradasDelBalance {
  readonly tablaOriginal: TablaColumnar;
  readonly tablaTransformada: TablaColumnar;
  readonly diagnostico: Diagnostico;
  readonly politica: Politica;
  readonly suprimidas: readonly string[];
  readonly colisiones: readonly ColisionEnColumna[];
  readonly mondrian: ResultadoDeMondrian | null;
  readonly diversidad: readonly MedidaDeDiversidad[];
}

/** El orden de las salvedades es parte del contrato: primero lo que deja a alguien señalable. */
const ORDEN: Record<Salvedad["tipo"], number> = {
  "identificadores-sin-tratar": 0,
  "unicos-restantes": 1,
  "k-no-alcanzado": 2,
  "k-del-reparto-no-es-el-del-archivo": 3,
  "clases-homogeneas": 4,
  "colisiones-de-seudonimo": 5,
};

function riesgoDe(tabla: TablaColumnar, qis: readonly string[]): RiesgoExacto {
  const porNombre = new Map(tabla.columnas.map((c) => [c.nombre, c]));
  const columnas = qis
    .map((nombre) => porNombre.get(nombre))
    .filter((c) => c !== undefined);
  return riesgoProsecutor(
    clasesDeEquivalencia(columnas, tabla.filas),
    qis,
    tabla.filas,
  );
}

/**
 * Compara el archivo que entró con el que va a salir.
 *
 * Los cuasi-identificadores de «después» son los de «antes» **menos los suprimidos**, y esa
 * diferencia es legítima: quien reciba el archivo no tendrá esas columnas. Lo que no sería legítimo
 * es cambiar el modelo de riesgo entre las dos medidas, y por eso las dos salen de la misma
 * función del S1.
 */
export function balanceDelTratamiento(
  entradas: EntradasDelBalance,
): BalanceDelTratamiento {
  const {
    tablaOriginal,
    tablaTransformada,
    diagnostico,
    politica,
    suprimidas,
    colisiones,
    mondrian,
    diversidad,
  } = entradas;

  const qisAntes = diagnostico.columnas
    .filter((c) => c.categoria === "cuasi-identificador")
    .map((c) => c.nombre);
  const qisDespues = qisAntes.filter((nombre) => !suprimidas.includes(nombre));

  const antes = riesgoDe(tablaOriginal, qisAntes);
  const despues = riesgoDe(tablaTransformada, qisDespues);

  const salvedades: Salvedad[] = [];

  const sinTratar = identificadoresSinTratar(politica, diagnostico.columnas);
  if (sinTratar.length > 0) {
    salvedades.push({
      gravedad: "descalifica",
      tipo: "identificadores-sin-tratar",
      columnas: sinTratar,
    });
  }

  if (despues.unicos > 0) {
    salvedades.push({
      gravedad: "descalifica",
      tipo: "unicos-restantes",
      cuantos: despues.unicos,
      proporcion: despues.proporcionUnicos,
    });
  }

  if (mondrian !== null && !mondrian.alcanzado) {
    salvedades.push({
      gravedad: "descalifica",
      tipo: "k-no-alcanzado",
      kObjetivo: mondrian.kObjetivo,
      kAlcanzado: mondrian.kAlcanzado,
    });
  }

  // La trampa que la Fase 3 dejó exhibida y esta cierra: Mondrian promete k sobre SUS columnas.
  // Si el archivo tiene cuasi-identificadores fuera del reparto, sus clases son más finas y el k
  // real es menor. Se detecta comparando los dos números medidos, no adivinando conjuntos.
  if (
    mondrian !== null &&
    mondrian.dimensiones.length > 0 &&
    despues.kMinimo > 0 &&
    despues.kMinimo < mondrian.kAlcanzado
  ) {
    salvedades.push({
      gravedad: "descalifica",
      tipo: "k-del-reparto-no-es-el-del-archivo",
      kDelReparto: mondrian.kAlcanzado,
      kDelArchivo: despues.kMinimo,
    });
  }

  for (const medida of diversidad) {
    if (medida.filasEnClasesHomogeneas > 0) {
      salvedades.push({
        gravedad: "matiza",
        tipo: "clases-homogeneas",
        atributo: medida.atributo,
        filas: medida.filasEnClasesHomogeneas,
      });
    }
  }

  for (const colision of colisiones) {
    salvedades.push({
      gravedad: "matiza",
      tipo: "colisiones-de-seudonimo",
      columna: colision.columna,
      cuantas: colision.cuantas,
    });
  }

  salvedades.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);

  const reduccion =
    antes.proporcionUnicos === 0
      ? null
      : (antes.proporcionUnicos - despues.proporcionUnicos) /
        antes.proporcionUnicos;

  return {
    antes,
    despues,
    reduccion,
    salvedades,
    esTitular:
      reduccion !== null &&
      !salvedades.some((s) => s.gravedad === "descalifica"),
  };
}
