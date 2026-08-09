// Reporte de errores metadata-only (kit-app v1.2.1 — patrón validado en nutri-kids S1 y ds S1).
// Regla: a Sentry van SOLO tipos de error + metadatos numéricos/categóricos que la app decida.
// JAMÁS mensajes crudos de excepciones de terceros (un traceback puede filtrar contenido del
// usuario, p. ej. nombres de columnas o valores), ni PII, ni payloads.
import * as Sentry from "@sentry/nextjs";

/**
 * Reporta un error como evento tipado con contexto controlado.
 * @param kind  identificador estable del tipo de error (ej. "experiment/worker-crash")
 * @param meta  SOLO metadatos seguros (números, booleanos, enums propios) — nunca contenido
 */
export function reportError(kind: string, meta: Record<string, number | string | boolean> = {}) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return; // inerte sin DSN
  Sentry.captureMessage(kind, { level: "error", extra: meta });
}
