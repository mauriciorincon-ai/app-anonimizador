---
name: repo-app
description: Estructura, CI/CD y deploy del repo standalone de una app del pipeline (sucede al monorepo Turborepo). Invocar al estampar una app nueva, configurar CI o preparar el deploy en Vercel.
---

# Repo standalone de app — estructura, CI y deploy

> Sucesor del skill `monorepo-turborepo` (retirado 2026-07-02: el pipeline pasó de monorepo a
> **repo por app** estampado desde `kit-app/`). El código compartido ya no se enlaza: **se estampa**
> — mejoras al kit llegan como deltas en la siguiente orden de construcción.

## Estructura del repo

```
~/Code/app-<slug>/            # SIEMPRE bajo ~/Code, nunca OneDrive
├─ CLAUDE.md  .claude/  .github/workflows/ci.yml  perf-budget.json
├─ src/{app,components,engine,lib,types}  tests/{unit,integration,e2e}
├─ design-system.md  (fuente de verdad visual — regla 10; skill diseno-ui)
├─ docs/MANUAL-DE-USO.md  (manual de uso vivo — obligatorio, regla 9 del CLAUDE.md)
├─ sprints/  decisions/  public/
└─ package.json (pnpm)  .env.local (gitignored)  .env.example
```

## Scripts esperados en package.json

```json
{ "scripts": { "dev": "next dev", "build": "next build", "lint": "next lint",
  "typecheck": "tsc --noEmit", "test": "vitest run --coverage",
  "test:e2e": "playwright test", "format": "prettier --write ." } }
```

## CI (GitHub Actions — ya viene en el kit: `.github/workflows/ci.yml`)

Cada PR: install (pnpm, lockfile congelado) → typecheck → lint → test (unit, cobertura) →
build → `pnpm audit --audit-level high` → e2e (Playwright) → Lighthouse CI contra
`perf-budget.json`. `main` con branch protection: no push directo, PR con CI verde requerido.
**Regla 2026-07-10 (no negociable):** repo **público** (GitHub Free solo aplica rulesets en
públicos) + la ruleset `main-protegida` exige los checks `quality`/`e2e`/`lighthouse` desde el
estampado; si un sprint añade un job de CI, se añade a la ruleset en el mismo sprint.

```powershell
# Activar branch protection al crear el remoto (gh CLI):
gh repo create app-<slug> --private --source . --push
gh api -X PUT repos/{owner}/app-<slug>/branches/main/protection -f required_status_checks[strict]=true ...
# (o configurarlo en la UI de GitHub: Settings → Branches → Add rule)
```

## Deploy (Vercel, free tier)

1. Importar el repo en Vercel (framework autodetectado, Next.js).
2. Env vars por entorno (Production/Preview): claves Supabase, `ANTHROPIC_API_KEY`. Nunca en el repo.
3. Preview deploy automático por PR (es parte de la DoD probarlo a mano).
4. Prod solo desde `main`. Dominio custom cuando la app lo amerite.

## PWA-first (portabilidad web/móvil/PC)

- `manifest.json` + service worker (`next-pwa` o handler propio) desde el primer sprint con UI.
- Responsive obligatorio (móvil + desktop en la DoD); orientación declarada si la app lo exige
  (ds/hoja-de-vida son landscape-primary según sus prototipos).
- Si más adelante una app exige stores nativas: Capacitor envuelve este mismo código (ADR en su momento).

## Higiene

- Upgrades de deps: Dependabot activado; PRs de seguridad se atienden en el sprint corriente.
- `pnpm-lock.yaml` siempre commiteado. Node LTS fijado en `.nvmrc`/`engines`.
- Un solo lockfile, un solo framework por repo — si un motor exige Python (FastAPI), vive en
  `services/<nombre>/` del mismo repo con su propio CI job (decisión por ADR).

## Patrones React/Next confirmados en construcción real

- **Estado en localStorage → React vía `useSyncExternalStore`** (wrapper `src/lib/local-store.ts`):
  es EL puente cuando el linter (`react-hooks/set-state-in-effect`) veta setState-en-effect.
  Validado en nutri-kids S1 (ADR 001: localStorage versionado + zod re-validando al leer).
- **Los overlays de primer uso nacen estáticos:** un Radix Dialog montado en el layout (portal
  post-hidratación) se vuelve el elemento LCP de TODAS las rutas (nutri-kids S1: LCP 7.5 s →
  242 ms al volverlo overlay estático). Ver `wiki/patterns/lcp-nace-estatico.md` (planeadora).
- **`devIndicators: false` en next.config** (default del kit desde v1.2.0): el indicador de dev
  de Next tapa la navegación inferior móvil e intercepta taps en los e2e.
- **Todo schema Zod que valide la ENTRADA de un route handler lleva `.strict()`** (ds S2): el
  default de Zod acepta-y-descarta claves desconocidas en silencio — un payload con campos colados
  debe rechazarse, no limpiarse. Detalle y reglas hermanas en el skill `ia-embebida` §1.
- **Workers que cargan ESM/WASM (Pyodide) se sirven desde `public/`, NO se bundlean** (ds S1,
  K11): Turbopack instancia `new Worker(new URL(...), { type: "module" })` como worker **clásico**
  y el runtime ESM aborta ("classic web workers are not supported"). Patrón: runner autónomo en
  `public/<nombre>-runner.js` (module worker real) + self-host de assets con script de
  `prebuild`/`predev` + orquestación pura en el hilo principal (más testeable) + el directorio
  generado a los ignores de eslint. Detalle:
  `wiki/patterns/pyodide-module-worker-desde-public.md` (planeadora).
