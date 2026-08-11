// El motor de políticas — qué se le hace a cada columna, como un archivo que se guarda.
//
// Una política NO es una preferencia de la sesión: es el documento que dice qué tratamiento
// recibió un archivo, y por eso lleva **hash**. El mismo hash significa el mismo tratamiento, y
// eso es lo que después va al reporte y —en el S3— al certificado. Si dos entregas del mismo mes
// declaran el mismo hash, recibieron exactamente lo mismo; si no, la diferencia se ve.
//
// Tres decisiones que sostienen esa promesa:
//
//   1. **El hash se calcula sobre la forma normalizada**, con las reglas ordenadas por nombre de
//      columna. Editar la política en otro orden no puede cambiar su identidad: el usuario no
//      tiene por qué saber en qué orden tocó las filas.
//   2. **Se ordena por punto de código, nunca con `localeCompare`** — que depende del idioma del
//      sistema y haría que la misma política tuviera hashes distintos en dos computadores. (El
//      gate de determinismo prohíbe `localeCompare` en el motor justamente por esto.)
//   3. **La política viaja como archivo, jamás a `localStorage`.** Lleva nombres de columna del
//      usuario, que son datos suyos; el gate de privacidad veta el almacenamiento y con razón.

import { z } from "zod";

import { sha256 } from "@/lib/sha256";
import { serializarCanonico } from "./serializacion";

/** Versión del formato. Un archivo de otra versión se rechaza con su nombre, no se adivina. */
export const VERSION_DE_POLITICA = 1;

// ── Las técnicas ──────────────────────────────────────────────────────────────────────────────
// El discriminante es plano (`tipo`) y no anidado: un `generalizar` con un `modo` adentro obliga
// a Zod a un union de unions y a la UI a un select de selects, y no compra nada.

const tecnicaSchema = z.discriminatedUnion("tipo", [
  /** Se deja tal cual. Es una decisión explícita, no la ausencia de una. */
  z.object({ tipo: z.literal("conservar") }),
  /** La columna entera desaparece del archivo de salida. */
  z.object({ tipo: z.literal("suprimir") }),
  /** `1032456789` → `103***89`, con la regla del S1: nunca más de la mitad a la vista. */
  z.object({ tipo: z.literal("enmascarar") }),
  /** HMAC-SHA256 con la llave del usuario → hexadecimal. Irreversible sin bóveda (S3). */
  z.object({
    tipo: z.literal("seudonimizar"),
    longitud: z.number().int().min(6).max(64),
  }),
  /**
   * HMAC → dígitos → dígito de verificación oficial recalculado. El seudónimo PARECE un NIT o una
   * cédula para que el sistema del destino no rechace el archivo. **No es FPE** y no se puede
   * revertir por algoritmo (ver `tecnicas/formato.ts`).
   */
  z.object({
    tipo: z.literal("seudonimizar-con-formato"),
    formato: z.enum(["nit", "cedula"]),
  }),
  /** Números a intervalos: edad 37 con amplitud 10 → `30-39`. */
  z.object({
    tipo: z.literal("generalizar-rango"),
    amplitud: z.number().int().positive(),
  }),
  /** Fechas recortadas: `1987-03-14` → `1987-03` o `1987`. */
  z.object({
    tipo: z.literal("generalizar-fecha"),
    precision: z.enum(["anio", "mes"]),
  }),
  /** Los primeros N caracteres. Con códigos DIVIPOLA, los 2 primeros son el departamento. */
  z.object({
    tipo: z.literal("generalizar-prefijo"),
    caracteres: z.number().int().positive(),
  }),
  /**
   * La columna entra al reparto de Mondrian, que decide cuánto generalizar para alcanzar el
   * `kObjetivo` de la política. No es una técnica por columna en el mismo sentido que las otras:
   * marca participación, y el corte lo decide el algoritmo mirando todas juntas.
   */
  z.object({ tipo: z.literal("generalizar-automatico") }),
]);

export type Tecnica = z.infer<typeof tecnicaSchema>;

const reglaSchema = z.object({
  columna: z.string().min(1),
  tecnica: tecnicaSchema,
});

export type Regla = z.infer<typeof reglaSchema>;

export const politicaSchema = z.object({
  version: z.literal(VERSION_DE_POLITICA),
  /** De dónde salió: una de fábrica, una editada a mano, o una de fábrica ya tocada. */
  origen: z.enum([
    "manual",
    "habeas-data",
    "hipaa",
    "habeas-data-editada",
    "hipaa-editada",
  ]),
  reglas: z.array(reglaSchema),
  /** k que Mondrian debe alcanzar sobre las columnas marcadas `generalizar-automatico`. */
  kObjetivo: z.number().int().min(2).nullable(),
});

export type Politica = z.infer<typeof politicaSchema>;

// ── Identidad ─────────────────────────────────────────────────────────────────────────────────

/**
 * Forma normalizada: reglas ordenadas por nombre de columna, sin duplicados (gana la última, que
 * es lo que el usuario acaba de escribir). Es lo que se hashea y lo que se compara.
 */
export function normalizarPolitica(politica: Politica): Politica {
  const porColumna = new Map<string, Regla>();
  for (const regla of politica.reglas) porColumna.set(regla.columna, regla);

  const reglas = [...porColumna.values()].sort((a, b) =>
    // Punto de código, no locale: la misma política tiene que dar el mismo hash en toda máquina.
    a.columna === b.columna ? 0 : a.columna < b.columna ? -1 : 1,
  );
  return { ...politica, reglas };
}

/**
 * SHA-256 de la política normalizada. Es su identidad: mismo hash ⇒ mismo tratamiento.
 *
 * `origen` entra al hash a propósito. Aplicar Habeas Data y luego editarlo hasta dejarlo igual que
 * una política manual idéntica **no es lo mismo**: la procedencia es parte de lo que el reporte
 * declara, y dos documentos que dicen cosas distintas no pueden compartir identidad.
 */
export function hashDePolitica(politica: Politica): string {
  const texto = serializarCanonico(normalizarPolitica(politica));
  return sha256(new TextEncoder().encode(texto));
}

/** ¿Dos políticas tratan el archivo igual? Compara identidad, no referencias. */
export function mismaPolitica(a: Politica, b: Politica): boolean {
  return hashDePolitica(a) === hashDePolitica(b);
}

// ── Ida y vuelta como archivo ─────────────────────────────────────────────────────────────────

/**
 * A texto, ya normalizada y con sangría: este archivo lo va a leer una persona y lo va a comparar
 * con `diff` contra el del mes pasado. El hash va DENTRO, junto a la advertencia de que se
 * recalcula al importar — un hash que se creyera a sí mismo no verificaría nada.
 */
export function exportarPolitica(politica: Politica): string {
  const normalizada = normalizarPolitica(politica);
  return `${JSON.stringify(
    {
      _velo: "politica de anonimizacion",
      _hash: hashDePolitica(normalizada),
      _nota: "El hash se recalcula al importar; el de aquí es informativo.",
      ...normalizada,
    },
    null,
    2,
  )}\n`;
}

export type ResultadoDeImportacion =
  | { ok: true; politica: Politica }
  | {
      ok: false;
      motivo: "json-invalido" | "version-distinta" | "forma-invalida";
      detalle: string;
    };

/**
 * De texto a política, o un error que dice QUÉ pasó.
 *
 * No lanza: importar un archivo que el usuario eligió a mano falla de formas normales, y cada una
 * necesita un mensaje distinto en pantalla. Un `throw` genérico las volvería todas «archivo
 * inválido», que no le dice a nadie qué hacer.
 */
export function importarPolitica(texto: string): ResultadoDeImportacion {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return {
      ok: false,
      motivo: "json-invalido",
      detalle: "El archivo no es un JSON que se pueda leer.",
    };
  }

  // La versión se mira ANTES que la forma: si un archivo v2 llegara a esta v1, el error útil es
  // «es de otra versión», no una lista de campos que no cuadran.
  const version = (crudo as { version?: unknown })?.version;
  if (typeof version === "number" && version !== VERSION_DE_POLITICA) {
    return {
      ok: false,
      motivo: "version-distinta",
      detalle: `La política es de la versión ${version} y esta Velo entiende la ${VERSION_DE_POLITICA}.`,
    };
  }

  const analisis = politicaSchema.safeParse(crudo);
  if (!analisis.success) {
    const primero = analisis.error.issues[0];
    return {
      ok: false,
      motivo: "forma-invalida",
      detalle: primero
        ? `${primero.path.join(".") || "la política"}: ${primero.message}`
        : "La forma del archivo no corresponde a una política.",
    };
  }
  return { ok: true, politica: normalizarPolitica(analisis.data) };
}

// ── Consultas que la UI y el pipeline necesitan ───────────────────────────────────────────────

/** La técnica de una columna. Sin regla, se conserva: no hacer nada es dejar el dato como está. */
export function tecnicaDe(politica: Politica, columna: string): Tecnica {
  return (
    politica.reglas.find((regla) => regla.columna === columna)?.tecnica ?? {
      tipo: "conservar",
    }
  );
}

/** Columnas marcadas para que Mondrian decida cuánto generalizarlas. */
export function columnasDeMondrian(politica: Politica): string[] {
  return politica.reglas
    .filter((regla) => regla.tecnica.tipo === "generalizar-automatico")
    .map((regla) => regla.columna);
}

/**
 * ¿La política deja algún identificador directo sin tratar?
 *
 * Es la pregunta que encabeza el panel de riesgo (Fase 4) y la que el reporte tiene que repetir:
 * una reducción del 92 % con una cédula intacta al lado es la composición que este sprint tiene
 * prohibida. Vive aquí, junto a la política, porque es una propiedad de la política — no un
 * detalle de presentación que cada pantalla pueda recordar u olvidar.
 */
export function identificadoresSinTratar(
  politica: Politica,
  columnas: readonly { nombre: string; categoria: string }[],
): string[] {
  return columnas
    .filter(
      (columna) =>
        columna.categoria === "identificador-directo" &&
        tecnicaDe(politica, columna.nombre).tipo === "conservar",
    )
    .map((columna) => columna.nombre);
}
