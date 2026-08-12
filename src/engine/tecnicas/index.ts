// El pipeline de transformación — de la tabla original a la que se descarga.
//
// Dos cosas que la representación columnar del S1 regala aquí, y que valen el sprint entero:
//
//   1. **Se transforma el DICCIONARIO, no las filas.** Una columna de 500.000 filas con 3 valores
//      distintos («F», «M», «O») cuesta 3 transformaciones, no 500.000. Y una de cédulas casi
//      únicas cuesta lo que de verdad cuesta, sin fingir.
//   2. **El resultado se re-deduplica.** Generalizar junta valores: 40 edades distintas caen en 5
//      rangos. Si el diccionario conservara las 40 entradas, la cardinalidad de la columna mentiría
//      — y de la cardinalidad salen las clases de equivalencia, o sea el riesgo. Así que después de
//      transformar se reconstruye el diccionario y la columna vuelve a decir la verdad sobre sí
//      misma.
//
// El vacío nunca se transforma: una celda en blanco no tiene seudónimo, no se enmascara y no se
// generaliza. Sigue en blanco, y el conteo de no-vacíos lo refleja.

import {
  CODIGO_VACIO,
  type ColumnaColumnar,
  type TablaColumnar,
} from "../columnar";
import { enmascarar } from "../mascara";
import { anonimizarConMondrian, type ResultadoDeMondrian } from "../mondrian";
import type { EntradaDeBoveda } from "../boveda";
import {
  columnasDeMondrian,
  esReversible,
  requiereLlave,
  tecnicaDe,
  type Politica,
  type Tecnica,
} from "../politica";
import {
  generalizarFecha,
  generalizarPrefijo,
  generalizarRango,
} from "./generalizar";
import { seudonimizar, seudonimizarConFormato } from "./seudonimo";

export interface ColisionEnColumna {
  readonly columna: string;
  readonly cuantas: number;
}

export interface TablaTransformada {
  readonly tabla: TablaColumnar;
  /** Columnas que ya no están en el archivo de salida. */
  readonly suprimidas: readonly string[];
  /** Dónde dos valores distintos acabaron con el mismo seudónimo. Vacío es lo normal. */
  readonly colisiones: readonly ColisionEnColumna[];
  /**
   * Columnas marcadas para el reparto de Mondrian que quedaron SIN generalizar. Con una política
   * bien formada está vacío; si `kObjetivo` es null y hay columnas marcadas, aquí están —salieron
   * intactas y el usuario tiene que enterarse, porque una política que pide k sin decir cuál no
   * puede resolverse adivinando.
   */
  readonly pendientesDeMondrian: readonly string[];
  /** El reparto, cuando la política pidió k. `null` cuando no había nada que repartir. */
  readonly mondrian: ResultadoDeMondrian | null;
  /**
   * El material de la bóveda: una entrada por columna **reversible**, con su diccionario original y
   * los seudónimos que salieron de él, en paralelo.
   *
   * **Sale gratis, y eso es un hallazgo de la Fase 2, no una casualidad.** El plan preveía extender
   * `ResultadoDeSeudonimo` para que registrara la correspondencia; no hizo falta tocar ese contrato
   * —ni sus tres consumidores— porque aquí ya están los dos diccionarios en paralelo: el de entrada
   * es `columna.valores` y el de salida es lo que devuelve la técnica. La correspondencia son esas
   * dos listas, que es exactamente la forma que `construirBoveda` recibe.
   *
   * Va sin identidad a propósito. La huella de la llave, su sal y el hash de la política son hechos
   * de la **sesión**, no de la transformación, y quien los tiene es el worker. El motor entrega el
   * material; la bóveda se arma donde vive la identidad.
   */
  readonly correspondencias: readonly EntradaDeBoveda[];
}

/**
 * Rehace la columna con los valores nuevos, deduplicando.
 *
 * `valoresNuevos` viene en paralelo al diccionario viejo, así que el mapeo viejo→nuevo es directo
 * y las filas solo pagan una lectura de índice: nunca se recorre el texto por fila.
 */
function reconstruirColumna(
  original: ColumnaColumnar,
  valoresNuevos: readonly string[],
): ColumnaColumnar {
  const indice = new Map<string, number>([["", CODIGO_VACIO]]);
  const valores: string[] = [""];
  const viejoANuevo = new Uint32Array(valoresNuevos.length);

  for (let v = 0; v < valoresNuevos.length; v++) {
    const nuevo = valoresNuevos[v];
    let codigo = indice.get(nuevo);
    if (codigo === undefined) {
      codigo = valores.length;
      valores.push(nuevo);
      indice.set(nuevo, codigo);
    }
    viejoANuevo[v] = codigo;
  }

  const codigos = new Uint32Array(original.codigos.length);
  let noVacios = 0;
  for (let f = 0; f < codigos.length; f++) {
    const codigo = viejoANuevo[original.codigos[f]];
    codigos[f] = codigo;
    if (codigo !== CODIGO_VACIO) noVacios++;
  }

  return { nombre: original.nombre, codigos, valores, noVacios };
}

/** Las técnicas que no necesitan llave son puras y síncronas: un mapa sobre el diccionario. */
function transformarSincrono(
  valores: readonly string[],
  tecnica: Tecnica,
): readonly string[] | null {
  const mapear = (fn: (v: string) => string) =>
    valores.map((valor) => (valor === "" ? "" : fn(valor)));

  switch (tecnica.tipo) {
    case "enmascarar":
      // La regla del S1, ya pagada en su auditoría: nunca más de la mitad del valor a la vista.
      return mapear(enmascarar);
    case "generalizar-rango":
      return mapear((v) => generalizarRango(v, tecnica.amplitud));
    case "generalizar-fecha":
      return mapear((v) => generalizarFecha(v, tecnica.precision));
    case "generalizar-prefijo":
      return mapear((v) => generalizarPrefijo(v, tecnica.caracteres));
    default:
      return null;
  }
}

/**
 * Aplica la política columna por columna.
 *
 * `generalizar-automatico` NO se resuelve aquí: esas columnas salen intactas y anotadas en
 * `pendientesDeMondrian`, porque Mondrian no es una técnica por columna — mira todas las marcadas a
 * la vez y decide dónde cortar. La Fase 3 recoge esa lista.
 */
export async function aplicarPolitica(
  tabla: TablaColumnar,
  politica: Politica,
  llave: CryptoKey | null,
): Promise<TablaTransformada> {
  if (requiereLlave(politica) && llave === null) {
    // Invariante del pipeline, no error de usuario: la UI no deja llegar aquí sin llave. Si llega,
    // es un defecto nuestro y tiene que sonar fuerte en vez de producir un archivo a medias.
    throw new Error("la política pide seudonimizar y no se dio una llave");
  }

  const columnas: ColumnaColumnar[] = [];
  const suprimidas: string[] = [];
  const colisiones: ColisionEnColumna[] = [];
  const correspondencias: EntradaDeBoveda[] = [];

  for (const columna of tabla.columnas) {
    const tecnica = tecnicaDe(politica, columna.nombre);

    if (tecnica.tipo === "suprimir") {
      suprimidas.push(columna.nombre);
      continue;
    }
    if (
      tecnica.tipo === "conservar" ||
      tecnica.tipo === "generalizar-automatico"
    ) {
      columnas.push(columna);
      continue;
    }

    // Las dos que necesitan llave se despachan por su `tipo`, no por descarte: descartar deja a
    // TypeScript sin forma de saber qué variante quedó viva, y con él al lector.
    if (
      tecnica.tipo !== "seudonimizar" &&
      tecnica.tipo !== "seudonimizar-con-formato"
    ) {
      const sincrono = transformarSincrono(columna.valores, tecnica);
      columnas.push(
        sincrono === null ? columna : reconstruirColumna(columna, sincrono),
      );
      continue;
    }

    // `llave` no es null aquí: lo garantiza la guarda del principio.
    const resultado =
      tecnica.tipo === "seudonimizar"
        ? await seudonimizar(columna.valores, llave!, tecnica.longitud)
        : await seudonimizarConFormato(
            columna.valores,
            llave!,
            tecnica.formato,
          );

    if (resultado.colisiones > 0) {
      colisiones.push({
        columna: columna.nombre,
        cuantas: resultado.colisiones,
      });
    }
    // ANTES de reconstruir: `columna.valores` es todavía el diccionario original, que es la mitad
    // izquierda de la correspondencia. Después de reconstruir ya no existe.
    if (esReversible(tecnica)) {
      correspondencias.push({
        columna: columna.nombre,
        originales: columna.valores,
        seudonimos: resultado.valores,
      });
    }
    columnas.push(reconstruirColumna(columna, resultado.valores));
  }

  // Solo las que sobrevivieron: una columna marcada para Mondrian y suprimida a la vez no existe.
  const paraMondrian = columnasDeMondrian(politica).filter(
    (nombre) => !suprimidas.includes(nombre),
  );

  // Mondrian va AL FINAL, sobre las columnas ya transformadas: generaliza lo que el archivo va a
  // llevar de verdad, no lo que llevaba al entrar. Y va aparte porque no es una técnica por
  // columna — mira todas las marcadas a la vez y decide dónde cortar.
  const transformada: TablaColumnar = { columnas, filas: tabla.filas };
  const mondrian =
    paraMondrian.length > 0 && politica.kObjetivo !== null
      ? anonimizarConMondrian(transformada, paraMondrian, politica.kObjetivo)
      : null;

  return {
    tabla: mondrian?.tabla ?? transformada,
    suprimidas,
    colisiones,
    pendientesDeMondrian: mondrian === null ? paraMondrian : [],
    mondrian,
    correspondencias,
  };
}
