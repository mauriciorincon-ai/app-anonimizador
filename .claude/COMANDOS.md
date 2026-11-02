# Slash Commands — Kit General

> Vive en `.claude/COMANDOS.md`, FUERA de `.claude/commands/` (kit v1.38.0, ds K-S6-1): todo `.md` dentro de esa
> carpeta se registra como comando, y este README aparecía como `/README` en la lista.

Comandos reutilizables que Claude Code puede invocar en cualquier app del pipeline. Cada archivo es un `.md` con frontmatter que Claude Code carga desde `.claude/commands/` de la app.

## Comandos incluidos

| Comando | Cuándo usarlo |
|---|---|
| `/plan-sprint` | Al abrir el sprint (plan mode). Lee el archivo del sprint de la planeadora y propone un plan de ≤ 3 fases con horas; espera el «construye» (kit v2.0.0: 5 pasos). |
| `/self-review` | Antes de crear PR. Revisa el diff como staff engineer estricto. |
| `/security-audit` | Antes de merge a main, o cada 2-3 sprints. OWASP Top 10 checklist. |
| `/deploy-check` | Antes de abrir el PR (perfil WEB). ≤ 10 casillas MANUALES; todo lo demás lo corre la CI (kit v2.0.0). |
| `/release-check` | Antes de abrir el PR (perfil ESCRITORIO). Sustituye a `/deploy-check`: ≤ 10 casillas manuales — binario, TCC, ventana protegida, no persistencia, cargo audit (kit v2.0.0). |
| `/run-tests` | Corrida completa de la suite (unit + integration + e2e + a11y). |
| `/audita-sprint` | Al concluir la construcción, antes del cierre ejecutivo. UNA pasada de un auditor independiente en solo lectura, 4 casillas; críticos y altos se pagan en el sprint, medios y bajos al lote del hito (kit v2.0.0). |
| `/design-sync` | Al cierre del hito, DESPUÉS del gate humano y solo cuando el usuario lo invoca (lleva `disable-model-invocation`): publica el design system con el bundle `design-sync/` del repo. |

## Cómo Claude Code los usa

Claude Code carga automáticamente los comandos de `.claude/commands/` cuando inicias una sesión en un proyecto. Los invocas escribiendo `/nombre-del-comando` en el chat.

## Agregar comandos nuevos

Cuando un patrón de tarea se repite en 3+ sprints, considera promoverlo a command. El formato mínimo:

```markdown
---
description: [una línea clara de qué hace]
---

# /nombre-comando

[Descripción larga]

## Pasos
1. ...

## Output esperado
[Estructura del output]
```

## Comandos específicos por app

Si una app tiene necesidades únicas (ej. `/rebuild-vector-index` solo para Hoja de Vida), ponlos en el `.claude/commands/` del repo de esa app, NO en este kit.
