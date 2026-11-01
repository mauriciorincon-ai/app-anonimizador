# Skills — kit-app

Skills que Claude Code carga automáticamente en cualquier app del pipeline. Cada archivo es un `.md` con frontmatter (`name`, `description`) y contenido estructurado.

## Skills incluidos

| Skill | Cubre el estándar |
|---|---|
| `testing-patterns` | #1 Testing (unit, integration, e2e) |
| `security-owasp` | #4 Seguridad (OWASP Top 10) |
| `observability` | #3 Observabilidad (logs, errors, metrics) |
| `accessibility-wcag` | #6 UX + Accesibilidad (WCAG AA) |
| `repo-app` | #2 CI/CD + estructura del repo standalone + deploy Vercel + PWA |
| `ia-embebida` | #7 IA embebida responsable (Zod→persistencia, guardrails, costo, HITL) |
| `diseno-ui` | #6 (mitad estética) — design-system.md por app, heurísticas vanguardistas, integración Claude Design (/design-sync), gate de revisión de diseño |

## Estándares sin skill dedicado

- **#5 Performance** — cubierto por `perf-budget.json` (gate de CI, ver `repo-app`) y Web Vitals en `observability`. Si se necesita skill dedicado más adelante, crear `performance-budgets.md`.

## Cómo Claude Code usa los skills

Al iniciar sesión, Claude Code lee los frontmatter de todos los skills en `.claude/skills/` y los tiene disponibles. Los invoca cuando el `description` del skill matchea con la tarea actual.

## Agregar skills específicos por app

Cuando una app necesita conocimiento de dominio no transferible, crear skills específicos en el `.claude/skills/` del repo de esa app. Ejemplos que NO van en el kit:

- `gestalt-engine` (Power BI) — lógica del motor topológico.
- `pbir-parser` (Power BI) — parseo de archivos PBIR.
- `rag-pipeline` (Hoja de Vida) — arquitectura RAG específica.
- `persona-detection` (Hoja de Vida) — clasificador de visitantes.
- `decision-boundary-engine` (Data Science) — fronteras de decisión client-side.
- `hermetic-sandbox` (Data Science) — sandbox de ejecución aislada.

Cuando uno de estos patrones aparezca en 3+ apps, se promueve al kit general.

## Agregar skills nuevos al kit general

Formato mínimo:

```markdown
---
name: nombre-del-skill
description: [cuándo invocar este skill, una oración clara con disparadores]
---

# Nombre del Skill — Kit General

[Contenido estructurado en secciones útiles para Claude Code]
```

El `description` es crítico: es lo que Claude Code usa para decidir cargarlo. Debe mencionar **síntomas o tareas**, no jerga abstracta.
