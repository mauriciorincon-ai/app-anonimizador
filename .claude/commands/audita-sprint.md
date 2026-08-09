---
description: Auditoría final de dos fases del sprint — OBLIGATORIA al concluir la construcción, antes de la guía de prueba/gate ⭐ y del cierre (método v1.10.0).
---

# /audita-sprint

Realiza la **auditoría final del sprint antes del cierre**. Es un paso OBLIGATORIO de todo
sprint (método v1.10.0): se ejecuta justo al concluir la construcción — ANTES de la
validación con `docs/GUIA-DE-PRUEBA.html`/gate ⭐ del usuario y ANTES del summary definitivo.

Trabaja en **dos fases** y **no modifiques nada hasta que el usuario apruebe la Fase 1**.

## Regla de modelos (léela primero)

**El modelo que audita PLANEA; cualquier modelo ejecuta.** La Fase 1 la corre un modelo
poderoso y su entregable más importante es dejar cada ajuste **tan bien definido — archivo,
línea, cambio exacto, criterio de verificación — que CUALQUIER modelo de menor capacidad
pueda ejecutarlo de la mejor manera sin ambigüedad**. La Fase 2 puede (y suele) correrse con
un modelo menor siguiendo ese plan al pie. El usuario decide el modelo de cada fase con
`/model` — este comando se lo recuerda al entregar el reporte.

## FASE 1 — Auditoría (SOLO LECTURA)

1. **Cobertura de alcance:** contrasta CADA ítem planeado (el plan aprobado del sprint +
   la orden de la planeadora) contra lo implementado. Clasifica cada uno como:
   **Completo / Parcial / No implementado / Implementado con desviación** — justificando
   cada clasificación con citas de archivos y líneas.
2. **Calidad de código** de lo desarrollado en el sprint:
   - **Correctitud:** bugs, edge cases no manejados, manejo de errores.
   - **Diseño:** acoplamiento, duplicación, responsabilidades mal ubicadas.
   - **Seguridad:** inputs sin validar, secretos expuestos, inyecciones.
   - **Tests:** cobertura de lo nuevo, casos faltantes, tests frágiles.
   - **Consistencia:** adherencia a las convenciones existentes del repo.
3. **Herramientas/dependencias:** señala SOLO librerías o patrones con una alternativa
   claramente superior (mantenimiento, seguridad, idiomática del stack) con justificación
   fuerte — jamás preferencias de estilo.

**Entrega de la Fase 1:** un reporte con hallazgos clasificados por severidad
(**Crítico / Alto / Medio / Bajo**) y una recomendación explícita: **"listo para cierre"** o
**"requiere ajustes"**. Valida que todo quede documentado en los archivos correspondientes
(bitácora, ADRs, deuda declarada). Cada hallazgo Crítico/Alto debe traer su **ajuste
ejecutable**: archivo(s) y línea(s), cambio exacto propuesto, y el criterio observable de
"ajuste verificado" — el formato que un modelo de menor capacidad puede seguir sin pensar
de más. Cierra recordando al usuario: *"aprueba la Fase 1 y fija el modelo de la Fase 2 con
`/model` (un modelo menor basta si sigue este plan)"*.

## FASE 2 — Correcciones (SOLO tras aprobación del usuario)

1. Propón el **plan de ajustes para los hallazgos Crítico/Alto** (los Medio/Bajo se declaran
   como deuda con pago asignado, salvo que el usuario pida incluirlos).
2. **Espera la validación del usuario** del plan.
3. Solo entonces implementa — siguiendo el plan de la Fase 1 al pie; cualquier desviación se
   declara antes de ejecutarla.
4. Al terminar: registra en la bitácora y en el `SPRINT_NNN-summary.md` los hallazgos, los
   pagos y la deuda aceptada. **Sin auditoría registrada en el summary, el cierre del sprint
   queda condicionado** (lo verifica el `/cierre-sprint` de la planeadora).

## Posición en el flujo del sprint

construcción concluida → **`/audita-sprint`** (Fase 1 → aprobación → Fase 2) →
`/deploy-check` → summary (registra la auditoría) → PR → gate ⭐ del usuario → merge.
