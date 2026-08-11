// La muestra de la vista previa — qué se enseña de cada columna, y con cuánta ropa.
//
// Vivía dentro del worker, donde ninguna prueba la alcanzaba, y ahí se le coló el hallazgo A3 de la
// auditoría del S2: decidía **por columna** lo que es una regla **del valor**. Una generalización
// deja filas intactas dentro de una columna que sí cambió —una partición de Mondrian con un solo
// valor se rotula con ese valor; un prefijo de 2 no toca lo que ya mide 2— y esas filas salían a la
// pantalla COMPLETAS, con el dato crudo del usuario, porque otra fila de la misma columna había
// cambiado.
//
// Por eso ahora vive en `engine/`: es una regla de producto, hermana de `mascara.ts`, y aquí la
// cobertura se exige por encima del 80 %. En el worker no la miraba nadie.
//
// Las tres reglas, en orden de importancia:
//
//   1. **El lado «antes» va SIEMPRE enmascarado.** Es el dato crudo, y la regla del S1 —nunca más
//      de la mitad del valor a la vista— no se relaja porque ahora estemos transformando.
//   2. **El lado «después» va completo solo si ESE valor cambió.** Un seudónimo o un intervalo no
//      son el dato de nadie; enmascararlos volvería inútil la única pantalla cuyo trabajo es
//      responder «¿qué va a recibir el otro?». Pero un valor que no cambió sigue siendo el dato.
//   3. **Una columna sensible que no cambió no se enseña.** Su «después» es su «antes», y sacar un
//      dato del artículo 5 a una pantalla que no lo necesita no tiene defensa.

import { posicionesDeMuestra } from "./clasificador";
import type { ColumnaColumnar } from "./columnar";
import { enmascarar } from "./mascara";
import { tecnicaDe, type Politica } from "./politica";
import type { MuestraDeTransformacion } from "@/workers/contrato";

/** Hasta cuántas filas se enseñan en la vista previa. Suficiente para reconocer el cambio. */
export const FILAS_DE_MUESTRA = 6;

/**
 * ¿Cambió algún valor de la columna? Se mira el ARCHIVO ENTERO, no la muestra.
 *
 * La primera versión respondía con las 6 filas de la vista previa, y de ahí salían dos afirmaciones
 * falsas a la vez (hallazgos M1 y A3): la pantalla decía «N de M columnas cambian» —una conclusión
 * de 6 filas presentada como exacta— y una columna sensible que hubiera cambiado fuera de esas 6 se
 * ocultaba como si estuviera intacta.
 *
 * El recorrido sale barato porque **corta en la primera diferencia**: una columna que sí cambió se
 * resuelve casi siempre en la primera fila. La que se recorre entera es la que no cambió, y esa es
 * justamente la respuesta que no se puede adivinar.
 */
export function columnaCambio(
  original: ColumnaColumnar,
  nueva: ColumnaColumnar,
): boolean {
  for (let i = 0; i < original.codigos.length; i++) {
    if (
      original.valores[original.codigos[i]] !== nueva.valores[nueva.codigos[i]]
    ) {
      return true;
    }
  }
  return false;
}

export function muestraDeColumna(
  original: ColumnaColumnar,
  nueva: ColumnaColumnar | undefined,
  politica: Politica,
  categoria: string,
  filas: number,
): MuestraDeTransformacion {
  const tecnica = tecnicaDe(politica, original.nombre).tipo;

  // Sin columna nueva, la política la suprimió: no hay «después» que enseñar, y el «antes» tampoco
  // se enseña — la columna no va en el archivo y su contenido ya no es asunto de esta pantalla.
  if (nueva === undefined) {
    return {
      nombre: original.nombre,
      tecnica,
      filas: [],
      despuesEnmascarado: false,
      omitida: false,
      suprimida: true,
    };
  }

  const cambio = columnaCambio(original, nueva);

  if (categoria === "dato-sensible" && !cambio) {
    return {
      nombre: original.nombre,
      tecnica,
      filas: [],
      despuesEnmascarado: true,
      omitida: true,
      suprimida: false,
    };
  }

  const pares = posicionesDeMuestra(filas, FILAS_DE_MUESTRA).map((p) => ({
    antes: original.valores[original.codigos[p]],
    despues: nueva.valores[nueva.codigos[p]],
  }));

  return {
    nombre: original.nombre,
    tecnica,
    filas: pares.map((par) => ({
      antes: enmascarar(par.antes),
      // La comparación es de ESTE par, no de la columna. Ver la cabecera: es el hallazgo A3.
      despues:
        par.antes === par.despues ? enmascarar(par.despues) : par.despues,
    })),
    despuesEnmascarado: !cambio,
    omitida: false,
    suprimida: false,
  };
}
