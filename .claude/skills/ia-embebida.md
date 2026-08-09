---
name: ia-embebida
description: Patrón obligatorio para features con IA generativa embebida - salidas estructuradas con Zod que se descomponen y persisten en la BD, guardrails de entrada/salida, tracking de costo y gancho HITL. Invocar al construir cualquier feature que llame a un LLM.
---

# IA embebida — el patrón de sinergia app↔LLM

Objetivo del pipeline: apps donde la IA generativa **interactúa nativamente** y sus resultados se
**descomponen y almacenan** como datos de primera clase de la aplicación — no chatbots pegados a un
lado. Este skill define el patrón único que toda feature LLM sigue.

## Arquitectura (vive en `src/lib/ia/`)

```
lib/ia/
├─ schemas.ts     # esquemas Zod de cada salida estructurada (el contrato app↔LLM)
├─ client.ts      # único punto de llamada al LLM (modelo, retry, timeout, streaming)
├─ guardrails.ts  # filtros de input/output + política del dominio
├─ persist.ts     # descomposición de la salida validada → filas/entidades en Supabase
└─ cost.ts        # medición tokens/costo por request → logger estructurado
```

**Regla de oro:** la UI nunca llama al LLM directo; llama a un route handler que usa `client.ts`,
valida contra `schemas.ts`, filtra con `guardrails.ts` y persiste con `persist.ts`.

## 1. Salida estructurada (Zod + Vercel AI SDK)

```ts
// schemas.ts — el contrato: lo que la app entiende y almacena
export const AnalisisSchema = z.object({
  resumen: z.string().max(500),
  entidades: z.array(z.object({ tipo: z.enum(["persona","monto","fecha"]), valor: z.string() })),
  confianza: z.number().min(0).max(1),
});

// client.ts — generateObject valida contra el schema; si no cumple, reintenta/falla explícito
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
const { object, usage } = await generateObject({
  model: anthropic("claude-sonnet-5"),      // Haiku para tareas simples; Sonnet para razonamiento
  schema: AnalisisSchema,
  prompt, abortSignal: AbortSignal.timeout(30_000),
});
```

- Elección de modelo por tarea: clasificación/extracción simple → Haiku; razonamiento/generación
  rica → Sonnet. Documentar la elección en el ADR si difiere del default.
- Streaming (`streamText`/`streamObject`) solo para UX de lectura; lo persistido siempre es el
  objeto validado final.
- **Schemas de ENTRADA de routes: `.strict()` explícito** (ds S2). El default de Zod **acepta y
  descarta** claves desconocidas en silencio; vocabulario cerrado real exige rechazo total — un
  payload con campos colados (p. ej. `rows`) debe RECHAZARSE, no limpiarse.
- **En código cliente, importar de `schemas.ts` SOLO con `import type`** (ds S2). Un import
  runtime mete zod al bundle del cliente y revienta el budget de la landing (48 bytes bastaron
  para un Lighthouse rojo determinista); el guardián Zod es el route, el cliente usa type-guards.

### AI SDK v7 — puntas afiladas verificadas (kit v1.7.5; cada una cobró una iteración real)

1. `convertToModelMessages` es **async** — `await` obligatorio (nutri-kids S2).
2. Un provider mock debe emitir **`stream-start` como PRIMER chunk** del stream (nutri-kids S2).
3. Tipos `StreamPart`/`Usage` **no exportados** → cast localizado anclado al tipo del
   constructor del mock, jamás `any` (nutri-kids S2).
4. El `onError` del stream mergeado vive en **`toUIMessageStream`**, NO en
   `createUIMessageStream` — el circuit breaker se registra ahí (hoja-de-vida S3).
5. `finishReason` de `LanguageModelV3` es **objeto `{unified, raw}`**, no string
   (hoja-de-vida S3).

## 2. Descomposición y persistencia

`persist.ts` mapea el objeto validado a entidades de la BD (nunca guardar el blob crudo como única
forma): p. ej. `AnalisisSchema` → fila en `analisis` + N filas en `entidades` con FK. Guardar
además: `modelo`, `version_prompt`, `costo_usd`, `created_by` — trazabilidad de qué IA produjo qué
dato. RLS aplica a estas tablas como a cualquier otra.

**Variante efímera — de primera clase (kit v1.7.5; privacidad alta, p. ej. datos de menores):**
cuando la decisión de privacidad es NO persistir la salida LLM (chat conversacional efímero),
`schemas.ts` de salida y `persist.ts` **no aplican por diseño** y el checklist se sustituye por:
(a) **no-persistencia verificada por e2e** (recarga ⇒ hilo vacío; ni localStorage ni servidor);
(b) **logs solo-metadatos con test de término plantado** (inyectar un término secreto en la
conversación y afirmar que jamás aparece en los logs); (c) **minimización declarada en el ADR
de privacidad** (qué viaja al proveedor, anonimizado cómo, qué se loguea). El **request** SÍ se
valida con zod siempre. Precedentes: nutri-kids S2 (ADR-006) · hoja-de-vida S3.

## 3. Guardrails (capa base, por sprint)

- **Input:** longitud máxima, tipo de contenido esperado, strip de instrucciones inyectadas
  (patrón anti prompt-injection del skill `security-owasp`), rate limiting por usuario.
- **Output:** validación Zod (ya bloquea la mayoría del formato malicioso) + lista de negación del
  dominio (ej. en `habla`: nunca diagnóstico clínico; en `financiera`: nunca recomendación de
  inversión — el brief define la política).
- **System prompt** siempre del lado servidor; el cliente jamás lo compone.

## 4. Costo

`cost.ts`: por request loggear `{ requestId, modelo, tokens_in, tokens_out, costo_usd, feature }`
con Pino. Presupuesto mensual por app definido en el brief; alerta si el run-rate lo excede (F6).

## 5. HITL (por release, dominios sensibles)

Si el brief marca el dominio como sensible (habla, financiera, inmobiliaria): las respuestas
high-stakes o de baja `confianza` se marcan `estado: pending_review`, la UI muestra "en revisión",
y un dashboard mínimo de operador permite aprobar/rechazar antes de exponer.

## 6. Fallback honesto — el circuit breaker SE ANUNCIA (ds S2)

Degradar a plantilla/fallback determinista NUNCA en silencio. "Nunca sección vacía" no basta: si
la UI muestra el fallback por un fallo, debe **decir por qué** (en cubetas honestas: no
configurado en este despliegue · el proveedor no respondió · la salida no pasó la
verificación/guardrail) y ofrecer **reintento iniciado por el usuario** — jamás retries
automáticos (protegido por el rate limit). Sin el aviso, la feature parece rota justo cuando está
siendo honesta (hallazgo real de usuario en preview: "lo activo y no pasa nada").

## 7. Contacto con la realidad — validar con el proveedor REAL antes del merge (ds S2)

**El mock prueba el circuito; el contrato del proveedor solo se valida contra el proveedor.** En
el sprint que estrena (o cambia) el proveedor real: correr el circuito completo end-to-end con la
**key real** ANTES del merge (CI sigue en mock por diseño). Las 5 clases de fallo que solo el
proveedor real muestra (todas ocurrieron en el primer request real de ds S2):

1. El soporte de **structured outputs varía POR MODELO** dentro del mismo proveedor (en Groq, los
   llama-3.x solo aceptan `json_object`; `generateObject` exige `json_schema`).
2. **Modelos de razonamiento** consumen `maxOutputTokens` razonando — presupuestos realistas
   (p. ej. 1500/600 + `reasoningEffort: "low"`), no los del modelo no-razonador.
3. **Matching literal vs idioma:** la prosa en español acentúa identificadores ("la región" por
   `region`) — verificadores insensibles a diacríticos sin dejar de ser literales.
4. El LLM **frasea resultados que no puede conocer** (direcciones como desenlaces reales sin tener
   la clase positiva) — el prompt lo restringe explícitamente.
5. **La varianza del Grader/juez decide su modelo:** medir estabilidad sobre la misma salida
   (3/4/5 en corridas repetidas = inaceptable) + rúbrica explícita en el prompt.

**Y antes de todo eso: la key del proveedor real se valida con su humo el día 0** (orden §
aprovisionamiento, kit v1.7.4) — un 401 descubierto en la fase de integración es un fallo de
proceso, no de código (hoja-de-vida S3: la key aprovisionada era inválida y producción quedó
en fallback).

## 8. El mock es un proveedor de primera clase (hoja-de-vida S3)

En adapters multi-proveedor conmutables por env, **el mock se implementa como un proveedor MÁS
dentro del adapter** (`CHAT_PROVIDER=mock` o equivalente) — jamás como intercept de red (msw,
`page.route`, nock) del proveedor real en unit/e2e:

- **Probar la conmutación es probar el mecanismo:** elegir `mock` por env recorre el mismo
  código que elegir Groq/Gemini — el intercept de red se salta justo la pieza que la feature
  promete.
- **CI determinista sin secretos ni red**; el e2e corre con el env del webServer.
- **Streaming end-to-end:** el mock emite por la misma interfaz del SDK — la UI (chunks,
  estados, citas) se prueba con el flujo real.
- **Excepción legítima:** intercepts SOLO para forzar caminos de error — p. ej. responder con
  el MISMO 503 que emite el server real para probar el fallback.

Patrón completo: `wiki/patterns/mock-como-proveedor-de-primera-clase.md` (planeadora).

## Checklist del sprint (lo verifica /deploy-check)

- [ ] Toda llamada LLM pasa por `lib/ia/client.ts` y valida contra un schema de `schemas.ts`.
- [ ] Lo persistido está descompuesto en entidades (no solo blob) con metadatos de trazabilidad —
      **o variante efímera declarada** (no-persistencia por e2e + logs solo-metadatos con término
      plantado + minimización en ADR — § 2).
- [ ] Guardrails de input/output activos; system prompt server-side.
- [ ] Costo por request loggeado.
- [ ] Tests: unit del schema (casos válidos/inválidos) + mock del LLM en integración (nunca llamar
      al API real en CI) + 1 e2e con respuesta fixture.
- [ ] Circuito validado contra el **proveedor REAL con key real antes del merge** (§7; CI sigue
      en mock).
- [ ] El fallback **anuncia su motivo** y ofrece reintento iniciado por el usuario (§6; sin
      retries automáticos).
- [ ] Schemas de entrada de routes con **`.strict()`**; el cliente importa de `schemas.ts` solo
      con **`import type`** (§1).
