// Reporte de errores metadata-only (kit-app v1.2.1 — patrón validado en nutri-kids S1 y ds S1),
// ENDURECIDO para Velo (S1) según la regla dura nº2: los datos del usuario jamás salen del
// navegador — y "los datos" incluye los NOMBRES DE COLUMNA, no solo los valores de celda.
//
// El contrato del kit (`Record<string, number | string | boolean>`) admite un `string`, y por ahí
// cabe perfectamente un nombre de columna. En una app cuya promesa central es que nada sale, esa
// puerta se cierra con un sanitizador en el borde: lo que no tenga forma de metadato NO viaja.
//
// Las dos vías de fuga y cómo se cierran:
//   · strings → solo pasan si tienen forma de etiqueta corta en kebab-case (una enum del código,
//     no texto del usuario). Un encabezado real ("Cédula del titular", "DIAGNOSTICO_CIE10") o un
//     valor de celda no la tienen: llevan espacios, tildes, mayúsculas o largo.
//   · números → un conteo de columnas es metadato legítimo; una cédula (10 dígitos) NO lo es, y
//     ambos son `number`. Se resuelve por magnitud: por debajo de 10.000 pasan exactos (columnas,
//     códigos, milisegundos); de ahí en adelante viajan como ORDEN DE MAGNITUD ("1e5–1e6"), que
//     conserva todo el valor diagnóstico y destruye el identificador.
import * as Sentry from "@sentry/nextjs";

/** Umbral por encima del cual un número viaja como orden de magnitud, no como valor. */
const MAGNITUD_EXACTA_MAXIMA = 10_000;

/** Marca de lo que el sanitizador descartó: el evento se reporta igual, sin el contenido. */
export const DESCARTADO = "[descartado]";

const FORMA_DE_ETIQUETA = /^[a-z][a-z0-9-]{0,31}$/;
const FORMA_DE_KIND = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;

/**
 * Identificador estable del tipo de error, con forma `dominio/motivo` (ej. "parser/worker-crash").
 * Un `kind` que no la tenga es texto libre — y el texto libre es el vector clásico de fuga.
 */
export function sanitizarKind(kind: string): string {
  return FORMA_DE_KIND.test(kind) ? kind : "evento/no-conforme";
}

function ordenDeMagnitud(valor: number): string {
  const signo = valor < 0 ? "-" : "";
  const exponente = Math.floor(Math.log10(Math.abs(valor)));
  return `${signo}1e${exponente}–1e${exponente + 1}`;
}

function sanitizarValor(
  valor: number | string | boolean,
): number | string | boolean {
  if (typeof valor === "boolean") return valor;

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return DESCARTADO;
    // Proporciones y porcentajes (|v| ≤ 1) viajan redondeados: no identifican a nadie.
    if (!Number.isInteger(valor)) {
      return Math.abs(valor) <= 1
        ? Math.round(valor * 1000) / 1000
        : ordenDeMagnitud(valor);
    }
    if (Math.abs(valor) < MAGNITUD_EXACTA_MAXIMA) return valor;
    return ordenDeMagnitud(valor);
  }

  return FORMA_DE_ETIQUETA.test(valor) ? valor : DESCARTADO;
}

/**
 * Deja pasar solo lo que tiene forma de metadato. Las CLAVES también se validan: una clave puede
 * ser tan reveladora como un valor (`{ "Cédula del titular": 3 }` filtraría el encabezado).
 */
export function sanitizarMeta(
  meta: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  const limpio: Record<string, number | string | boolean> = {};
  for (const clave of Object.keys(meta).sort()) {
    if (!FORMA_DE_ETIQUETA.test(clave)) continue; // clave sospechosa ⇒ el par entero no viaja
    limpio[clave] = sanitizarValor(meta[clave]);
  }
  return limpio;
}

/**
 * Reporta un error como evento tipado con contexto controlado.
 * @param kind  identificador estable del tipo de error, forma `dominio/motivo`
 * @param meta  SOLO metadatos seguros — lo demás lo descarta el sanitizador, no la disciplina
 */
export function reportError(
  kind: string,
  meta: Record<string, number | string | boolean> = {},
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return; // inerte sin DSN
  Sentry.captureMessage(sanitizarKind(kind), {
    level: "error",
    extra: sanitizarMeta(meta),
  });
}
