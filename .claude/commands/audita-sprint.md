---
description: Auditoría de UNA pasada al concluir la construcción — un auditor independiente en solo lectura, 4 casillas; críticos y altos se pagan en el sprint, medios y bajos al lote del hito.
---

# /audita-sprint

Se corre una vez, al terminar la construcción (después del STOP, antes de `/deploy-check` o
`/release-check` y del cierre ejecutivo). **Una pasada, un auditor, sin segunda pasada.**

## Quién audita

Un **auditor independiente del constructor** — subagente o sesión nueva que NO construyó el sprint — en
**solo lectura**, con el diff del sprint delante: `git diff origin/main...HEAD --stat` y luego archivo por
archivo. La bitácora dice qué se creyó hacer; el diff dice qué se hizo. El constructor responde, no se
audita a sí mismo. Modelo: **Sonnet 5.5 · esfuerzo high** (tabla de la constitución); el subagente lo declara, no hereda el de la sesión.

## Las 4 casillas

1. **Alcance** — ítem por ítem del inicio ejecutivo del sprint (alcance incluido, fases, criterios de fin):
   **Completo / Parcial / No implementado / Con desviación**, cada uno con `archivo:línea`.
2. **Calidad** — correctitud (bugs, edge cases, errores sin manejar), **pruebas de lo que cambia** (cobertura
   de lo nuevo, casos faltantes, tests frágiles), seguridad básica (inputs sin validar, inyecciones),
   consistencia con el repo. Dependencias: solo si hay alternativa claramente superior, nunca estilo.
3. **Seguridad y privacidad** — secretos en el diff; enlaces de producción o de preview en cualquier
   archivo versionado y en el campo homepage del repo (`node scripts/cero-enlaces.mjs --homepage "$(gh repo view
   --json homepageUrl --jq .homepageUrl)"`; los dominios viven en `cero-enlaces.json`, ampliados con el host real
   del stack); datos reales del usuario o de su familia; derivados que nacen menos
   privados que su fuente; protecciones del sistema tocadas sin matriz ni «sí».
4. **Frases caducadas** — lo que el sprint dejó falso. Se busca por **promesa aplazada**, jamás por la
   palabra de la feature: `todavía no` · `aún no` · `por ahora` · `de momento` · `mientras tanto` ·
   `próximamente` · `llega después` · `en esta versión` · `más adelante` · `no (se) puede` · `podrás` ·
   `permitirá` — en portada, `docs/MANUAL-DE-USO.md`, `README.md`, `docs/GUIA-DE-PRUEBA.html`, estados
   vacíos y brochure; cada coincidencia contra lo que la app hace HOY. Y las frases de evidencia («leído
   como imagen», «N de N», «en verde») contra la corrida que las sostiene.

## Severidades y pago

- **C** crítico · **A** alto · **M** medio · **B** bajo. Todo hallazgo con `archivo:línea`; jamás un
  resumen por conteo.
- **Críticos y altos se pagan en este sprint**, antes del PR, con un ajuste ejecutable por hallazgo
  (archivo, cambio exacto, criterio de verificación). **«No reproducible» no cierra un C/A:** se re-audita
  su superficie hasta ubicarlo o descartarlo con evidencia.
- **Medios y bajos se listan en el cierre ejecutivo como deuda con sitio** (`archivo:línea` + una línea) y
  se pagan en el lote del cierre del hito; no se pagan en el sprint salvo que cuesten menos que anotarlos.
- Toda decisión que le pidas al usuario va en llano: qué pasa y qué cuesta por opción, sin identificadores
  de hallazgo en la pregunta.

## Entrega

Un reporte en el chat y la sección **Auditoría** del `sprints/SPRINT_NNN-cierre.md`: casilla por casilla,
hallazgos C/A con su estado (`pagado · <commit>` o `descartado · <razón>`), M/B como deuda con sitio, y el
veredicto **«listo para cierre»** o **«requiere ajustes»** (solo un C/A abierto lo produce).
