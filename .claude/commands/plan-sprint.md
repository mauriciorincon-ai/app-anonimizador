---
description: Planea el trabajo del sprint activo leyendo la orden de construcción emitida por la casa planeadora.
---

# /plan-sprint

Prepara el plan de ejecución del sprint a partir de la **orden de construcción** que el usuario
indique (o la más reciente en `portafolio/<slug>/ordenes/` de la planeadora,
`~/Code/hr01-develop-ai-apps/`, agregada como directorio adicional de solo lectura).

## Pasos

1. Lee la orden de construcción completa.
2. Lee sus referencias: `portafolio/<slug>/sprints/SPRINT_NNN.md` (con `status: open`), el brief,
   y el prototipo READ-ONLY si la orden lo referencia.
3. Lee los estándares del pipeline (`estandares/estandares.md` de la planeadora) — los 6+1 gates.
4. Analiza el estado actual del código de **este** repo — y **LEE el código de las features
   existentes que la nueva tocará**. El plan incluye SIEMPRE una sección **«Riesgos de
   integración con lo existente»** (kit v1.7.3): qué interacciones podrían romper una regla
   dura (honestidad, privacidad, presupuesto) o un comportamiento ya validado. La orden
   describe el QUÉ; los riesgos nº 1 suelen vivir en el CÓMO-choca-con-lo-que-ya-existe
   (precedente: el bucle parlante→micrófono de habla S3, ausente de la orden).
5. Propón un plan de ejecución por fases:
   - **Fase 0 — Setup:** deps, config, scaffolding si falta — y el **humo de credenciales**
     si la orden trae aprovisionamiento (kit v1.7.4): validar cada credencial con su comando
     de humo ANTES de la fase 1. Una credencial aprovisionada no es una credencial válida
     (el 401 de Groq en hoja-de-vida S3 se descubrió en la integración).
   - **Fase 1 — Motor/núcleo:** lógica pura con tests (y `lib/ia/` si el sprint toca LLM — skill `ia-embebida`).
   - **Fase 2 — UI:** integración visual (paleta/microcopy del prototipo, construido desde cero).
   - **Fase 3 — Integración + e2e:** tests end-to-end + axe.
   - **Fase 4 — Calidad:** gates de los 6+1 estándares (`/deploy-check`).
6. Para cada fase: archivos a crear/modificar, tests a escribir, criterio observable de "fase completa".
7. Presenta el plan y espera su aprobación (plan mode). **La aprobación del plan significa SOLO
   "el plan es correcto" — NO es la orden de arranque.**
8. **Gate de arranque (obligatorio, kit v1.6.2):** tras la aprobación del plan, NO escribas
   código. Emite el **bloque de arranque**:
   - (a) Tu **recomendación de modelo y esfuerzo para ESTE sprint**, con su razón — por fase si
     difiere (motor puro vs. UI/motion vs. integración). Tú recomiendas; **el usuario decide**
     (modelo y esfuerzo son comandos suyos: `/model`).
   - (b) El recordatorio operativo: *"fija modelo y esfuerzo con `/model` y dime cualquier
     ajuste al plan"*.
   - (c) Espera la palabra explícita **«construye»** del usuario. Si responde con ajustes,
     incorpóralos y vuelve a esperar.
   **Prohibido crear o editar archivos antes del «construye».**
9. **Gates de FASE (obligatorio, kit v1.8.0):** durante la construcción, al terminar CADA
   fase del plan:
   - (a) **DETENTE** — prohibido arrancar la fase siguiente.
   - (b) Entrega el **resumen completo de la fase**: qué se construyó, archivos
     creados/modificados, tests corridos y su resultado, el criterio observable de "fase
     completa" verificado, y cualquier desviación del plan.
   - (c) Recuerda al usuario: *"valida el resumen y, si quieres, cambia modelo/esfuerzo con
     `/model` para la siguiente fase"*.
   - (d) Espera el **«continúa»** explícito. Ajustes del usuario se incorporan antes de
     seguir.
10. **Al concluir la construcción** (todas las fases aprobadas): corre **`/audita-sprint`**
   (auditoría final de dos fases — OBLIGATORIA, método v1.10.0) ANTES del summary definitivo
   y de entregar la guía/gate ⭐ al usuario.

## Output esperado

Un plan en markdown con la estructura de arriba. Recuerda: **nunca escribes en la planeadora**; si
detectas que el plan del sprint necesita cambio, anótalo como `## Desviación del plan` en tu
bitácora y decláralo en el plan propuesto.
