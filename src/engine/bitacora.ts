// La bitácora — la memoria de lo que el usuario ha tratado.
//
// Responde una pregunta que ninguna otra pieza de Velo responde: **«¿qué he hecho yo con mis
// archivos?»**. El certificado prueba UN tratamiento ante un tercero; la bitácora es lo que el
// usuario tiene para sí mismo, meses después, cuando alguien le pregunte qué entregó y cuándo.
//
// **Es un archivo cifrado PROPIO, aparte de la bóveda**, y las tres razones están decididas en el
// plan del sprint y recogidas en `decisions/007-la-bitacora-archivo-propio.md`: existe aunque el
// trabajo no tenga columnas reversibles; la bóveda es por trabajo y por llave mientras la bitácora
// crece a lo largo de meses; y mezclarlas haría que perder una fuera perder las dos, siendo pérdidas
// de gravedad muy distinta.
//
// **Va cifrada porque los nombres de archivo son sensibles por sí solos.** Lo dijo el ADR-005 y aquí
// se cobra: `pacientes-oncologia-2026.csv` cuenta de qué va el contenido antes de que nadie lo abra,
// y una bitácora es una lista de esos nombres con sus fechas. Un archivo en claro tirado en Descargas
// sería un índice de a qué se dedica su dueño.
//
// Puro, síncrono y determinista, como el resto de `engine/`: el azar y lo asíncrono viven en
// `lib/bitacora-archivo.ts`, que es donde el gate de determinismo los permite.

import { z } from "zod";

import { sha256 } from "@/lib/sha256";
import { serializarCanonico } from "./serializacion";

z.config({ jitless: true });

/** Versión del formato. Una bitácora de otra versión se rechaza con su nombre, no se adivina. */
export const VERSION_DE_BITACORA = 1;

/**
 * Una entrada — un tratamiento que ocurrió.
 *
 * **Guarda las dos proporciones de riesgo, y NO la reducción entre ellas.** Es la decisión menos
 * obvia de este tipo y viene de la lección más cara del ciclo: una cifra de reducción sola —«bajó
 * del 30 % al 2 %»— es cierta y puede ser engañosa, y el balance del S2 tuvo que aprender a viajar
 * con sus salvedades para no mentir. Una bitácora que guardara la reducción compuesta repetiría el
 * error en el sitio donde más dura: un registro que se lee meses después, sin la pantalla al lado.
 * Guardando las dos puntas, la pantalla enseña dos hechos y no una conclusión.
 */
export interface EntradaDeBitacora {
  /** Fecha ya formateada por quien llama. Inyectada: el motor no puede mirar el reloj. */
  readonly fecha: string;
  /** Nombre del archivo que entró. Es lo más sensible de la entrada, y por eso todo va cifrado. */
  readonly archivo: string;
  /** Identidad del tratamiento: mismo hash ⇒ mismo trato. */
  readonly hashDePolitica: string;
  /** Las técnicas que se aplicaron, sin nombres de columna: qué se hizo, no a qué. */
  readonly tecnicas: readonly string[];
  readonly filas: number;
  /** Proporción de filas únicas ANTES (0 a 1). */
  readonly unicosAntes: number;
  /** Proporción de filas únicas DESPUÉS (0 a 1). */
  readonly unicosDespues: number;
  /**
   * ¿La cifra de este tratamiento podía ir sola, o llevaba salvedades que la descalificaban?
   *
   * Viaja con la entrada porque el balance ya lo había decidido, y volver a decidirlo aquí —con
   * menos información y meses después— sería inventarlo. Es la misma regla del S2: la clasificación
   * vive en el tipo, no en la pantalla que la pinta.
   */
  readonly esTitular: boolean;
  /** SHA-256 del archivo que entró. */
  readonly huellaDeEntrada: string;
  /** SHA-256 del archivo que salió. Es lo que ata una entrada a su certificado. */
  readonly huellaDeSalida: string;
}

export interface Bitacora {
  readonly version: number;
  /** En orden de registro. La primera es la más antigua. */
  readonly entradas: readonly EntradaDeBitacora[];
}

export function bitacoraVacia(): Bitacora {
  return { version: VERSION_DE_BITACORA, entradas: [] };
}

/**
 * Añade una entrada **sin tocar las anteriores**.
 *
 * «No reescribe las anteriores» no puede significar bytes: el archivo va cifrado con AES-GCM y un
 * IV nuevo por sellado, así que el archivo entero cambia siempre. Lo que sí significa, y es lo que
 * importa y lo que se prueba, es que **la serialización en claro de las N entradas previas es
 * byte-idéntica** después de añadir la N+1. Una bitácora que «corrigiera» una entrada vieja al
 * escribir una nueva dejaría de ser un registro para ser una opinión sobre el pasado.
 */
export function anadirEntrada(
  bitacora: Bitacora,
  entrada: EntradaDeBitacora,
): Bitacora {
  return {
    version: bitacora.version,
    entradas: [...bitacora.entradas, entrada],
  };
}

/** La bitácora a texto, con la serialización canónica del motor: claves ordenadas, estable. */
export function serializarBitacora(bitacora: Bitacora): string {
  return serializarCanonico(bitacora);
}

/** Huella de la bitácora: SHA-256 de su serialización EN CLARO (el cifrado no es reproducible). */
export function huellaDeBitacora(bitacora: Bitacora): string {
  return sha256(new TextEncoder().encode(serializarBitacora(bitacora)));
}

/**
 * El esquema de una entrada.
 *
 * **Aquí sí se usa Zod, y la bóveda no lo usa: la diferencia es de tamaño y está razonada.** Una
 * bóveda puede traer 480.000 pares y pasarlos por un esquema significa una validación por cadena
 * sobre la única estructura del producto que llega a medio millón de entradas; por eso allá la
 * comprobación es a mano. Una bitácora son decenas o cientos de entradas de nueve campos, que es
 * exactamente el terreno donde `politica.ts` ya usa Zod. Copiar la validación a mano de la bóveda
 * aquí habría sido heredar su precio sin heredar su motivo.
 */
const entradaSchema = z.object({
  fecha: z.string(),
  archivo: z.string(),
  hashDePolitica: z.string(),
  tecnicas: z.array(z.string()),
  filas: z.number().int().nonnegative(),
  unicosAntes: z.number().min(0).max(1),
  unicosDespues: z.number().min(0).max(1),
  esTitular: z.boolean(),
  huellaDeEntrada: z.string(),
  huellaDeSalida: z.string(),
});

const bitacoraSchema = z.object({
  version: z.number(),
  entradas: z.array(entradaSchema),
});

export type ResultadoDeLectura =
  | { ok: true; bitacora: Bitacora }
  | {
      ok: false;
      motivo: "json-invalido" | "version-distinta" | "forma-invalida";
      detalle: string;
    };

/**
 * De texto a bitácora, o un error que dice QUÉ pasó. No lanza, igual que `importarPolitica`.
 */
export function deserializarBitacora(texto: string): ResultadoDeLectura {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return {
      ok: false,
      motivo: "json-invalido",
      detalle: "El contenido de la bitácora no es un JSON que se pueda leer.",
    };
  }

  // La versión se mira ANTES que la forma, igual que en la política y en la bóveda: si una bitácora
  // v2 llegara a esta v1, el error útil es «es de otra versión», no una lista de campos que no
  // cuadran.
  if (
    typeof crudo === "object" &&
    crudo !== null &&
    "version" in crudo &&
    typeof (crudo as { version: unknown }).version === "number" &&
    (crudo as { version: number }).version !== VERSION_DE_BITACORA
  ) {
    return {
      ok: false,
      motivo: "version-distinta",
      detalle: `La bitácora es de la versión ${(crudo as { version: number }).version} y esta Velo entiende la ${VERSION_DE_BITACORA}.`,
    };
  }

  const leida = bitacoraSchema.safeParse(crudo);
  if (!leida.success) {
    return {
      ok: false,
      motivo: "forma-invalida",
      detalle:
        "El archivo no contiene una bitácora con la forma que Velo espera.",
    };
  }
  return { ok: true, bitacora: leida.data };
}
