// La bóveda — la correspondencia que permite el regreso.
//
// El S2 entregó el disfraz: HMAC-SHA256 sobre el valor, y el original no vuelve. Esa
// irreversibilidad **sigue siendo cierta sin este archivo**: la bóveda no debilita el seudónimo,
// guarda aparte la tabla que lo deshace. Quien tenga el archivo anonimizado y no tenga la bóveda
// está exactamente donde estaba en el S2.
//
// **Este archivo es puro, síncrono y determinista, y esas tres cosas son requisitos, no estilo.**
// El azar que la bóveda necesita —el IV de AES-GCM, la sal de PBKDF2— vive en
// `src/lib/boveda-archivo.ts`, porque el gate de determinismo barre `src/engine/**` y veta
// `crypto.getRandomValues` junto a `Math.random`. Es la misma frontera que el S2 trazó con la
// llave: el motor recibe lo derivado, no lo genera.
//
// **Aviso que un lector futuro va a necesitar, y por eso va arriba:** el determinismo byte-idéntico
// se mide sobre `serializarBoveda` —el texto EN CLARO—, **jamás sobre el `.velo` cifrado**. Dos
// cifrados de la misma bóveda dan bytes distintos a propósito, porque AES-GCM exige un IV único por
// operación y reusarlo con la misma llave rompe el cifrado por completo. Un gate que exigiera
// `.velo` byte-idéntico solo se podría satisfacer cometiendo ese error. Está razonado en
// `decisions/006-la-boveda-archivo-no-base-de-datos.md`.

import { sha256 } from "@/lib/sha256";
import { serializarCanonico } from "./serializacion";

/** Versión del formato. Una bóveda de otra versión se rechaza con su nombre, no se adivina. */
export const VERSION_DE_BOVEDA = 1;

/**
 * La correspondencia de una columna, en arreglos paralelos.
 *
 * `seudonimos[i]` volvió de `originales[i]`. Es la misma forma que ya usa la tabla columnar
 * (`valores` + `codigos`) y por la misma razón: a 480.000 entradas, un arreglo de objetos
 * `{seudonimo, originales}` casi duplica el tamaño del archivo sin añadir una sola verdad.
 *
 * **La colisión no es una excepción del formato: es una entrada con dos originales.** Cuando dos
 * valores distintos acaban con el mismo seudónimo —lo que en NIT sobre 500.000 filas pasa unas 620
 * veces, medido en el S2— ese seudónimo no tiene una respuesta, tiene dos. Guardarlas ambas es lo
 * que permite que la restauración lo DIGA en vez de elegir una y callarse.
 */
export interface CorrespondenciaDeColumna {
  readonly columna: string;
  /** Ordenados por punto de código. El orden es parte de la identidad de la bóveda. */
  readonly seudonimos: readonly string[];
  /** En paralelo a `seudonimos`. Casi siempre un elemento; dos o más es una colisión. */
  readonly originales: readonly (readonly string[])[];
}

/** Lo que ata una bóveda a un proyecto concreto. */
export interface IdentidadDeBoveda {
  /**
   * Huella de la llave HMAC (los 12 hex que `lib/llave.ts` calcula sobre una constante).
   *
   * Es lo que permite decir «esta bóveda es de otra llave» en vez de intentar restaurar y no
   * encontrar nada. Enseñarla no compromete la llave: es el HMAC de un texto público.
   */
  readonly huellaDeLlave: string;
  /**
   * La sal del proyecto. **Paga la deuda M2 del S2**, donde la sal no viajaba con la política y
   * repetir los seudónimos del mes pasado dependía de un copiar-pegar del usuario. Aquí viaja
   * DENTRO de la bóveda: quien tiene la bóveda y la frase puede volver a derivar la misma llave.
   *
   * No debilita nada — una sal no es secreta por definición: existe para que dos frases iguales no
   * produzcan la misma llave, y va en claro en cualquier diseño de PBKDF2. Y aquí ni siquiera va en
   * claro: el archivo entero está cifrado.
   */
  readonly salDeLlave: string;
  /** Hash de la política que produjo esta bóveda. Mismo hash ⇒ mismo tratamiento. */
  readonly hashDePolitica: string;
}

export interface Boveda extends IdentidadDeBoveda {
  readonly version: number;
  /** Ordenadas por nombre de columna, punto de código. */
  readonly columnas: readonly CorrespondenciaDeColumna[];
}

/** Lo que una columna aporta a la bóveda: su diccionario y los seudónimos que salieron de él. */
export interface EntradaDeBoveda {
  readonly columna: string;
  /** Valores originales **distintos** — el diccionario de la columna, no sus filas. */
  readonly originales: readonly string[];
  /** Seudónimos, en el MISMO orden que `originales`. */
  readonly seudonimos: readonly string[];
}

/**
 * Construye la bóveda a partir de las columnas reversibles.
 *
 * Trabaja sobre el **diccionario** de cada columna, no sobre las filas: en un archivo de 500.000
 * filas con 480.000 valores distintos eso son 480.000 pares y no 500.000, y en una columna con 12
 * valores distintos son 12. Es el mismo truco que hace que Mondrian y los seudónimos quepan en el
 * presupuesto.
 *
 * El vacío no entra: `""` no se seudonimiza, así que no hay nada que devolver.
 */
export function construirBoveda(
  identidad: IdentidadDeBoveda,
  entradas: readonly EntradaDeBoveda[],
): Boveda {
  const columnas = entradas.map((entrada) => {
    if (entrada.originales.length !== entrada.seudonimos.length) {
      // Invariante interna, no un archivo mal formado del usuario: si esto salta, quien llamó
      // rompió el paralelismo, y seguir produciría una bóveda que devuelve el original de otro.
      throw new Error(
        `boveda: la columna "${entrada.columna}" trae ${entrada.originales.length} originales y ${entrada.seudonimos.length} seudónimos`,
      );
    }

    const porSeudonimo = new Map<string, Set<string>>();
    for (let i = 0; i < entrada.seudonimos.length; i++) {
      const seudonimo = entrada.seudonimos[i];
      const original = entrada.originales[i];
      if (seudonimo === "" || original === "") continue;
      const yaEstan = porSeudonimo.get(seudonimo);
      if (yaEstan) yaEstan.add(original);
      else porSeudonimo.set(seudonimo, new Set([original]));
    }

    // Ordenar por punto de código, nunca `localeCompare`: el orden decide la huella, y una huella
    // que cambiara según el idioma del sistema no serviría para comparar dos corridas.
    const seudonimos = [...porSeudonimo.keys()].sort(porPuntoDeCodigo);
    return {
      columna: entrada.columna,
      seudonimos,
      originales: seudonimos.map((seudonimo) =>
        [...porSeudonimo.get(seudonimo)!].sort(porPuntoDeCodigo),
      ),
    };
  });

  return {
    version: VERSION_DE_BOVEDA,
    ...identidad,
    columnas: [...columnas].sort((a, b) =>
      porPuntoDeCodigo(a.columna, b.columna),
    ),
  };
}

function porPuntoDeCodigo(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * La bóveda a texto, con la serialización canónica del motor.
 *
 * Es la MISMA función que sostiene el hash de la política, y a propósito: si un día el orden de
 * claves dejara de ser estable, se rompería un solo instrumento y no dos.
 */
export function serializarBoveda(boveda: Boveda): string {
  return serializarCanonico(boveda);
}

/**
 * Huella de la bóveda: SHA-256 de su serialización en claro.
 *
 * Lo que el usuario ve para reconocer «esta es la bóveda de aquel archivo». Se calcula sobre el
 * claro **precisamente porque el `.velo` no es reproducible** (IV único): si la huella se calculara
 * sobre el cifrado, la misma bóveda tendría una huella distinta cada vez que se guarda.
 */
export function huellaDeBoveda(boveda: Boveda): string {
  return sha256(new TextEncoder().encode(serializarBoveda(boveda)));
}

export type ResultadoDeApertura =
  | { ok: true; boveda: Boveda }
  | {
      ok: false;
      motivo: "json-invalido" | "version-distinta" | "forma-invalida";
      detalle: string;
    };

/**
 * De texto a bóveda, o un error que dice QUÉ pasó. No lanza, igual que `importarPolitica`: abrir un
 * archivo que el usuario eligió a mano falla de formas normales y cada una necesita su mensaje.
 *
 * **La validación es a mano y no con Zod, y la razón es de tamaño.** La política son unas decenas
 * de reglas y Zod es la herramienta correcta ahí. Una bóveda puede traer 480.000 pares: pasarlos por
 * un esquema significa una validación por cadena, con la maquinaria de issues y rutas de Zod
 * detrás, sobre la única estructura del producto que llega a medio millón de entradas. Lo que hace
 * falta comprobar aquí son cuatro formas y un paralelismo, y eso son cuatro `Array.isArray` y una
 * comparación de longitudes.
 */
export function deserializarBoveda(texto: string): ResultadoDeApertura {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return {
      ok: false,
      motivo: "json-invalido",
      detalle: "El contenido de la bóveda no es un JSON que se pueda leer.",
    };
  }

  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    return {
      ok: false,
      motivo: "forma-invalida",
      detalle: "El archivo no contiene una bóveda.",
    };
  }
  const objeto = crudo as Record<string, unknown>;

  // La versión se mira ANTES que la forma, igual que en la política: si una bóveda v2 llegara a
  // esta v1, el error útil es «es de otra versión», no una lista de campos que no cuadran.
  if (
    typeof objeto.version === "number" &&
    objeto.version !== VERSION_DE_BOVEDA
  ) {
    return {
      ok: false,
      motivo: "version-distinta",
      detalle: `La bóveda es de la versión ${objeto.version} y esta Velo entiende la ${VERSION_DE_BOVEDA}.`,
    };
  }

  for (const campo of ["huellaDeLlave", "salDeLlave", "hashDePolitica"]) {
    if (typeof objeto[campo] !== "string") {
      return {
        ok: false,
        motivo: "forma-invalida",
        detalle: `A la bóveda le falta "${campo}".`,
      };
    }
  }

  if (!Array.isArray(objeto.columnas)) {
    return {
      ok: false,
      motivo: "forma-invalida",
      detalle: "La bóveda no trae la lista de columnas.",
    };
  }

  const columnas: CorrespondenciaDeColumna[] = [];
  for (const cruda of objeto.columnas as unknown[]) {
    const columna = cruda as Record<string, unknown>;
    if (
      typeof columna?.columna !== "string" ||
      !Array.isArray(columna.seudonimos) ||
      !Array.isArray(columna.originales)
    ) {
      return {
        ok: false,
        motivo: "forma-invalida",
        detalle: "Una de las columnas de la bóveda está incompleta.",
      };
    }
    if (columna.seudonimos.length !== columna.originales.length) {
      // El paralelismo roto es el único error de forma que produciría una restauración
      // silenciosamente equivocada: devolvería el original de otro seudónimo. Se rechaza entero.
      return {
        ok: false,
        motivo: "forma-invalida",
        detalle: `La columna "${columna.columna}" trae ${columna.seudonimos.length} seudónimos y ${columna.originales.length} listas de originales.`,
      };
    }
    columnas.push({
      columna: columna.columna,
      seudonimos: columna.seudonimos as string[],
      originales: columna.originales as string[][],
    });
  }

  return {
    ok: true,
    boveda: {
      version: VERSION_DE_BOVEDA,
      huellaDeLlave: objeto.huellaDeLlave as string,
      salDeLlave: objeto.salDeLlave as string,
      hashDePolitica: objeto.hashDePolitica as string,
      columnas,
    },
  };
}

// ── Consultas ─────────────────────────────────────────────────────────────────────────────────

/**
 * Índice de una columna para consultar en O(1).
 *
 * Se construye una vez por columna al restaurar; buscar linealmente sobre 480.000 entradas por cada
 * valor del archivo devuelto sería cuadrático.
 */
export function indiceDeColumna(
  correspondencia: CorrespondenciaDeColumna,
): Map<string, readonly string[]> {
  const indice = new Map<string, readonly string[]>();
  for (let i = 0; i < correspondencia.seudonimos.length; i++) {
    indice.set(correspondencia.seudonimos[i], correspondencia.originales[i]);
  }
  return indice;
}

/** Cuántos pares guarda la bóveda. Es la cifra que el usuario ve al guardarla. */
export function paresDeBoveda(boveda: Boveda): number {
  return boveda.columnas.reduce(
    (total, columna) => total + columna.seudonimos.length,
    0,
  );
}

/**
 * Cuántos seudónimos tienen más de un original.
 *
 * No es una estadística: es la cifra que la restauración tiene que decir **antes** de restaurar,
 * porque cada uno de esos seudónimos es una celda que no se puede devolver sin elegir.
 */
export function colisionesDeBoveda(boveda: Boveda): number {
  return boveda.columnas.reduce(
    (total, columna) =>
      total + columna.originales.filter((lista) => lista.length > 1).length,
    0,
  );
}

/** ¿Esta bóveda salió de esta llave? Se compara por huella, lo único observable de una llave. */
export function esDeLaMismaLlave(boveda: Boveda, huella: string): boolean {
  return boveda.huellaDeLlave === huella;
}
