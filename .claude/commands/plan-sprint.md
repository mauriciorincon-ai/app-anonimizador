---
description: Plan del sprint en 5 pasos desde el archivo del sprint de la planeadora (inicio ejecutivo + plan + prompt). Plan mode; nada se construye antes del «construye».
---

# /plan-sprint

Prepara el plan de ejecución del sprint activo. Fuente: `portafolio/<slug>/sprints/SPRINT_NNN.md` de la
planeadora (`~/Code/hr01-develop-ai-apps/`, solo lectura) — el que el usuario indique o el más reciente
con `status: open`.

## Pasos

1. **Lee el archivo del sprint entero:** inicio ejecutivo (objetivo, resultado esperado, alcance incluido y
   excluido, fases, dependencias, riesgos, criterios de fin, «reutiliza»), plan técnico breve y prompt de
   arranque, más las referencias que cite (brief, visión, maqueta aprobada en `docs/diseno/`). Si el sprint
   toca una feature votada del roadmap de CV Viva, anótalo.
2. **Estado real del código y riesgos.** Lee las features existentes que el sprint tocará — el riesgo nº 1
   vive en cómo lo nuevo choca con lo que ya existe — y contrasta con `grep`, no con la memoria. Lista qué
   reutilizas y qué aprovisionamiento nuevo exige el sprint (solo si lo hay: su humo va en la primera fase).
3. **Plan en ≤ 3 fases.** Por fase: objetivo, archivos a crear o modificar, tests, **criterio observable de
   «fase completa»** y **horas estimadas**. Total ≈ 4 h activas por defecto (≤ 12 h con una línea de
   justificación). Declara qué NO hace el sprint y la única mirada de DECISIÓN si la hay (pantalla o flujo
   fuera de la maqueta, cambio que altera el uso, acción sobre protecciones del sistema). Sin fase 0 de
   método ni fase de cierre: el cierre son los pasos 3–5 del workflow de la constitución.
4. **Aprobación en plan mode y gate de arranque.** Presenta el plan y espera su aprobación. Aprobar el plan
   NO arranca nada: emite el bloque de arranque — modelo **requerido** de cada fase según la tabla de la
   constitución (desvío = una línea de por qué; esfuerzo solo sugerido) con su `/model` — y espera la
   palabra **«construye»**. **Gate de modelo (kit v2.2.0):** antes de la F1 y al abrir cada fase escribes
   «Fase N · modelo requerido: X · modelo activo: Y»; si no coinciden, NO construyes hasta su «vamos con Y»
   o su `/model X`. Fable 5.1 solo si el usuario lo declara emergencia. **Relevo (regla 29):** segundo
   intento fallido o 20 min sin avance verificable ⇒ paras y pides relevo en una línea; jamás un loop. Si llegan ajustes, incorpóralos y vuelve a esperar. **Prohibido crear o editar
   archivos antes del «construye».**
5. **Construye** en branch `sprint-NNN/<tema>` con commits convencionales etiquetados `[F1]` / `[F2]` /
   `[F3]` en el subject (de ahí salen las horas por fase de `scripts/horas-sprint.mjs`). **Un solo STOP al
   final de la construcción** con el resumen de las fases (qué, archivos, tests y resultado, criterio
   verificado, desviaciones) — más la mirada de DECISIÓN del paso 3 si la hay, en matriz de una fila
   (archivo · botón/estado · qué mirar · respuesta esperada), con la pregunta llana en la primera línea y
   dónde abrirla. Después: `/audita-sprint` → `/deploy-check` o `/release-check` → cierre ejecutivo → PR.
   **UN SOLO PR VIVO POR APP (regla 18, kit v2.1.0):** al arrancar el sprint y antes de abrir el PR corre
   `gh pr list --state open`; un abierto (dependabot incluido) se procesa o se cierra, o se sigue en su rama; un
   segundo PR solo complementario y con «complementa #N: <razón>» como primera línea del cuerpo. Al pedir el
   merge entregas la lista de PRs abiertos, que debe ser ese uno.

## Output esperado

El plan en markdown con la estructura del paso 3 y el bloque de arranque del paso 4. Nunca escribes en la
planeadora: una desviación del plan se declara en el cierre ejecutivo del sprint.
