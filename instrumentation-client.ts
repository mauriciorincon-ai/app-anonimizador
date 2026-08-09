// Sentry client-only, metadata-only (kit-app v1.2.1 — patrón validado en nutri-kids S1 y ds S1).
// INERTE SIN DSN: si NEXT_PUBLIC_SENTRY_DSN no está definida (CI, local sin configurar),
// no se inicializa nada y no hay ruido. Configura la DSN en .env.local y en Vercel.
// Server-side Sentry (instrumentation.ts) se añade cuando la app tenga backend, por ADR.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local",
    // Sin tracing ni replay: error tracking puro (presupuesto y privacidad).
    tracesSampleRate: 0,
    // Privacidad (metadata-only): nunca enviar requests ni breadcrumbs que puedan
    // arrastrar contenido del usuario. Reportar errores vía src/lib/observability.ts.
    beforeSend(event) {
      delete event.request;
      event.breadcrumbs = undefined;
      if (event.exception?.values?.[0]?.type === "AbortError") return null;
      return event;
    },
  });
}

// Hook opcional de Next para transiciones de router (no-op si Sentry no inicializó).
export const onRouterTransitionStart = dsn
  ? Sentry.captureRouterTransitionStart
  : () => {};
