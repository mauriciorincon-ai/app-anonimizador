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

import { mensaje } from "@/lib/idioma";
import type { MensajeDeMotor } from "@/lib/idioma/mensajes";
import { MOTOR_TRANSFORMAR } from "@/lib/idioma/textos/motor-transformar";
import { sha256 } from "@/lib/sha256";
import { serializarCanonico } from "./serializacion";

/**
 * Zod, sin compilar validadores con `new Function`.
 *
 * Zod 4 acelera el análisis generando código en tiempo de ejecución. La CSP de Velo no permite
 * `eval` —`script-src` no lleva `'unsafe-eval'` y no va a llevarlo—, así que ese intento se
 * bloquea, Zod cae a su camino interpretado y todo sigue funcionando… dejando una violación de CSP
 * registrada en cada carga. Lo encontró la pasada de Lighthouse de la Fase 5: `/transformar` sacaba
 * 96 en buenas prácticas contra el 100 de `/`, y el único punto era este.
 *
 * Apagarlo explícitamente no es cosmético. Una violación de CSP registrada en cada visita es ruido
 * permanente en el panel de incidencias del navegador, y ruido permanente es donde se esconde la
 * violación que sí importa. Además deja de depender de que la detección de Zod acierte: si un día
 * su fallback fallara, la validación de políticas se rompería en producción y **ningún test
 * unitario lo vería**, porque jsdom no aplica CSP.
 */
z.config({ jitless: true });

/** Versión del formato. Un archivo de otra versión se rechaza con su nombre, no se adivina. */
export const VERSION_DE_POLITICA = 1;

// ── Las técnicas ──────────────────────────────────────────────────────────────────────────────
// El discriminante es plano (`tipo`) y no anidado: un `generalizar` con un `modo` adentro obliga
// a Zod a un union de unions y a la UI a un select de selects, y no compra nada.

/**
 * El eje reversible/irreversible de las dos técnicas de seudónimo (S3).
 *
 * **Es opcional y no un `boolean` con default, y esa decisión sostiene una promesa del S2.** La
 * identidad de una política es el SHA-256 de su forma normalizada, y «mismo hash ⇒ mismo
 * tratamiento» tiene que seguir siendo cierto entre sprints. Si este campo apareciera como
 * `reversible: false` en toda política, **cambiaría el hash de todas las del S2** — reportes ya
 * emitidos dejarían de cuadrar con el mismo tratamiento repetido hoy.
 *
 * Ausente significa irreversible, que es el default seguro. `normalizarPolitica` convierte un
 * `false` explícito en ausencia, para que las dos formas de decir lo mismo tengan un solo hash.
 * Un `true` sí cambia el hash, y debe: guardar la correspondencia **es** otro tratamiento.
 */
const reversibleSchema = z.boolean().optional();

const tecnicaSchema = z.discriminatedUnion("tipo", [
  /** Se deja tal cual. Es una decisión explícita, no la ausencia de una. */
  z.object({ tipo: z.literal("conservar") }),
  /** La columna entera desaparece del archivo de salida. */
  z.object({ tipo: z.literal("suprimir") }),
  /** `1032456789` → `103***89`, con la regla del S1: nunca más de la mitad a la vista. */
  z.object({ tipo: z.literal("enmascarar") }),
  /** HMAC-SHA256 con la llave del usuario → hexadecimal. Irreversible sin bóveda. */
  z.object({
    tipo: z.literal("seudonimizar"),
    longitud: z.number().int().min(6).max(64),
    reversible: reversibleSchema,
  }),
  /**
   * HMAC → dígitos → dígito de verificación oficial recalculado. El seudónimo PARECE un NIT o una
   * cédula para que el sistema del destino no rechace el archivo. **No es FPE** y no se puede
   * revertir por algoritmo (ver `tecnicas/formato.ts`).
   */
  z.object({
    tipo: z.literal("seudonimizar-con-formato"),
    formato: z.enum(["nit", "cedula"]),
    reversible: reversibleSchema,
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

// ── La generalización óptima (S7) ──────────────────────────────────────────────────────────────

/** Cada amplitud divide a la siguiente: así el rango de 10 contiene entero al de 5 (niveles anidados). */
function anidadas(amplitudes: readonly number[]): boolean {
  return amplitudes.every(
    (a, i) => i === 0 || (a > amplitudes[i - 1] && a % amplitudes[i - 1] === 0),
  );
}

/** Cada largo es menor que el anterior: un prefijo más corto contiene al más largo. */
function decrecientes(largos: readonly number[]): boolean {
  return largos.every((n, i) => i === 0 || n < largos[i - 1]);
}

/**
 * La escalera de un campo para la generalización óptima (`src/engine/jerarquias/`). Las tres de
 * fábrica citan su fuente oficial en `src/engine/jerarquias/fabrica/*.meta.json`.
 */
const jerarquiaSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("rango"),
    amplitudes: z
      .array(z.number().int().positive())
      .min(1)
      .max(6)
      // En inglés, como los mensajes de la librería: el informe de importación los cita tal cual.
      .refine(anidadas, "each width must divide the next one"),
  }),
  z.object({ tipo: z.literal("fecha") }),
  z.object({
    tipo: z.literal("prefijo"),
    largos: z
      .array(z.number().int().positive())
      .min(1)
      .max(6)
      .refine(decrecientes, "each length must be shorter than the one before"),
  }),
  z.object({ tipo: z.literal("supresion") }),
  z.object({ tipo: z.literal("divipola") }),
  z.object({ tipo: z.literal("edad-dane") }),
  z.object({ tipo: z.literal("ciiu") }),
]);

export type JerarquiaDeLaPolitica = z.infer<typeof jerarquiaSchema>;

/**
 * Cómo se alcanza el k sobre las columnas marcadas `generalizar-automatico`.
 *
 * **Ausente = Mondrian**, el de siempre, y por eso es opcional y no un campo con default: si
 * apareciera en toda política, cambiaría el hash de todas las que ya existen (la misma razón que
 * `reversible`). Presente, pide la búsqueda óptima con una jerarquía por columna (sin jerarquía, la
 * columna solo puede quedar igual o en `*`) y, si se quiere, una ℓ distinta sobre columnas sensibles.
 */
const generalizacionSchema = z.object({
  algoritmo: z.literal("optima"),
  jerarquias: z.record(z.string().min(1), jerarquiaSchema),
  diversidad: z
    .object({
      l: z.number().int().min(2),
      columnas: z.array(z.string().min(1)).min(1),
    })
    .optional(),
});

export type GeneralizacionOptima = z.infer<typeof generalizacionSchema>;

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
  /** S7: la generalización óptima en vez de Mondrian. Ausente = Mondrian. */
  generalizacion: generalizacionSchema.optional(),
});

export type Politica = z.infer<typeof politicaSchema>;

// ── Identidad ─────────────────────────────────────────────────────────────────────────────────

/**
 * `reversible: false` y `reversible` ausente son el mismo tratamiento, y no pueden tener dos hashes.
 * `serializarCanonico` y `JSON.stringify` omiten las claves `undefined`, así que dejarlo así es
 * suficiente — y deja intacta la identidad de toda política escrita antes del S3.
 */
function sinReversibleFalso(regla: Regla): Regla {
  const { tecnica } = regla;
  if (
    tecnica.tipo !== "seudonimizar" &&
    tecnica.tipo !== "seudonimizar-con-formato"
  ) {
    return regla;
  }
  return {
    ...regla,
    tecnica: { ...tecnica, reversible: tecnica.reversible || undefined },
  };
}

/**
 * Forma normalizada: reglas ordenadas por nombre de columna, sin duplicados (gana la última, que
 * es lo que el usuario acaba de escribir). Es lo que se hashea y lo que se compara.
 */
export function normalizarPolitica(politica: Politica): Politica {
  const porColumna = new Map<string, Regla>();
  for (const regla of politica.reglas)
    porColumna.set(regla.columna, sinReversibleFalso(regla));

  const reglas = [...porColumna.values()].sort((a, b) =>
    // Punto de código, no locale: la misma política tiene que dar el mismo hash en toda máquina.
    a.columna === b.columna ? 0 : a.columna < b.columna ? -1 : 1,
  );
  return {
    ...politica,
    reglas,
    generalizacion: generalizacionNormalizada(politica.generalizacion, reglas),
  };
}

/**
 * Lo que de la generalización óptima trata el archivo de verdad: las jerarquías de las columnas del
 * reparto, y la ℓ sobre columnas FUERA de él (sin repetir y en orden de punto de código; una columna
 * sensible no necesita regla en la política). Una jerarquía de una columna que ya no está en el
 * reparto no cambia el tratamiento, así que no puede cambiar el hash.
 */
function generalizacionNormalizada(
  generalizacion: GeneralizacionOptima | undefined,
  reglas: readonly Regla[],
): GeneralizacionOptima | undefined {
  if (generalizacion === undefined) return undefined;
  const reparto = new Set(
    reglas
      .filter((r) => r.tecnica.tipo === "generalizar-automatico")
      .map((r) => r.columna),
  );
  const jerarquias: Record<string, JerarquiaDeLaPolitica> = {};
  for (const [columna, jerarquia] of Object.entries(generalizacion.jerarquias))
    if (reparto.has(columna)) jerarquias[columna] = jerarquia;
  const columnas = [...new Set(generalizacion.diversidad?.columnas ?? [])]
    .filter((c) => !reparto.has(c))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    algoritmo: "optima",
    jerarquias,
    ...(generalizacion.diversidad && columnas.length > 0
      ? { diversidad: { l: generalizacion.diversidad.l, columnas } }
      : {}),
  };
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
 * La nota del archivo exportado, en los DOS idiomas y siempre en el mismo orden («es / en»).
 *
 * El JSON que alguien exporta tiene que ser idéntico sin importar en qué idioma tenía la pantalla:
 * dos personas que exportan la misma política y comparan los archivos con `diff` no pueden
 * encontrar una diferencia que sea solo del idioma de su navegador. (El hash no cambiaría —se
 * recalcula sin `_nota`—, pero el archivo sí, y el archivo es lo que se versiona.)
 */
const NOTA_DEL_ARCHIVO = `${MOTOR_TRANSFORMAR["politica.notaDelArchivo"].es} / ${MOTOR_TRANSFORMAR["politica.notaDelArchivo"].en}`;

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
      _nota: NOTA_DEL_ARCHIVO,
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
      /** Qué pasó, como mensaje: la pantalla lo dice en su idioma. */
      detalle: MensajeDeMotor;
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
      detalle: mensaje("politica.importar.jsonInvalido"),
    };
  }

  // La versión se mira ANTES que la forma: si un archivo v2 llegara a esta v1, el error útil es
  // «es de otra versión», no una lista de campos que no cuadran.
  const version = (crudo as { version?: unknown })?.version;
  if (typeof version === "number" && version !== VERSION_DE_POLITICA) {
    return {
      ok: false,
      motivo: "version-distinta",
      detalle: mensaje("politica.importar.versionDistinta", {
        version,
        esperada: VERSION_DE_POLITICA,
      }),
    };
  }

  const analisis = politicaSchema.safeParse(crudo);
  if (!analisis.success) {
    const primero = analisis.error.issues[0];
    // `problema` es el texto de la librería de validación, tal cual: un dato, no copy de Velo.
    const ruta = primero?.path.join(".") ?? "";
    return {
      ok: false,
      motivo: "forma-invalida",
      detalle: !primero
        ? mensaje("politica.importar.sinForma")
        : ruta === ""
          ? mensaje("politica.importar.formaInvalidaRaiz", {
              problema: primero.message,
            })
          : mensaje("politica.importar.formaInvalida", {
              ruta,
              problema: primero.message,
            }),
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

/**
 * ¿Esta política necesita una llave para poder aplicarse?
 *
 * Vive aquí y no en `tecnicas/`, y la razón es de peso —literalmente—: es la **única** pregunta del
 * motor de transformación que la interfaz necesita responder, porque de ella depende si se pinta el
 * panel de la llave. Importarla de `tecnicas/index.ts` arrastraba al bundle de `/transformar` el
 * motor entero: Mondrian, los seudónimos, las generalizaciones y la columnar — código que solo
 * corre **dentro del worker**. El gate de Lighthouse lo cobró en el CI del cierre del S2.
 *
 * Es una propiedad de la política, igual que `tecnicaDe` o `columnasDeMondrian`. Estaba en el sitio
 * equivocado.
 */
export function requiereLlave(politica: Politica): boolean {
  return politica.reglas.some(
    (regla) =>
      regla.tecnica.tipo === "seudonimizar" ||
      regla.tecnica.tipo === "seudonimizar-con-formato",
  );
}

/**
 * ¿Esta técnica guarda la correspondencia para poder deshacerse?
 *
 * Solo las dos de seudónimo pueden ser reversibles, y no es una limitación de esta versión: una
 * máscara y una generalización **destruyen información**. `103***89` y `30-39` no vuelven ni con
 * bóveda ni con nada, porque los dígitos que faltan ya no existen en ningún sitio. El seudónimo es
 * distinto: no destruye, sustituye — y por eso admite una tabla que lo deshaga.
 */
export function esReversible(tecnica: Tecnica): boolean {
  return (
    (tecnica.tipo === "seudonimizar" ||
      tecnica.tipo === "seudonimizar-con-formato") &&
    tecnica.reversible === true
  );
}

/**
 * ¿Esta política necesita bóveda?
 *
 * Hermana de `requiereLlave`, y vive aquí por la misma razón de peso: es una pregunta que la
 * interfaz necesita responder para saber si pedir la frase de la bóveda, e importarla de
 * `tecnicas/index.ts` arrastraría el motor entero al bundle de la página. El gate de Lighthouse ya
 * cobró eso una vez, en el cierre del S2.
 */
export function requiereBoveda(politica: Politica): boolean {
  return politica.reglas.some((regla) => esReversible(regla.tecnica));
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
