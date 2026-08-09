---
description: Checklist pre-merge a main. Verifica que todo lo necesario está listo antes de mergear un PR.
---

# /deploy-check

Checklist exhaustivo antes de mergear a `main` (que dispara deploy a producción en Vercel).

## Pasos

Corre cada verificación en orden y reporta estado:

### 1. Tests
- [ ] `pnpm test` verde.
- [ ] `pnpm test:e2e` verde.
- [ ] Cobertura del app afectada >=70%.

### 2. Type safety
- [ ] `pnpm typecheck` sin errores.
- [ ] Sin `@ts-ignore` nuevos sin justificación en comentario.

### 3. Lint y formato
- [ ] `pnpm lint` sin warnings nuevos.
- [ ] `prefers-reduced-motion` respetado si hay animaciones nuevas.

### 4. Build
- [ ] `pnpm build` exitoso.
- [ ] Bundle size no creció >10% vs main (medir con `next build` output).

### 5. Security
- [ ] `pnpm audit --audit-level high` limpio.
- [ ] Sin secrets en el diff.
- [ ] Variables de entorno nuevas agregadas a `.env.example` y a Vercel env.

### 6. Observabilidad
- [ ] Endpoints nuevos loggean request/duration.
- [ ] Errores nuevos capturados por Sentry (no hay path a `throw` sin try/catch).

### 7. Accesibilidad y diseño
- [ ] Axe scan sin violaciones en rutas nuevas (e2e test con `@axe-core/playwright`).
- [ ] Navegación por teclado probada en rutas nuevas.
- [ ] **Checklist de revisión de diseño del skill `diseno-ui` corrido sobre la preview** (fidelidad a design-system.md, jerarquía, 5 estados, cero anti-patrones) + aprobación visual del usuario.

### 8. Performance
- [ ] Lighthouse score >=90 en Performance, Best Practices, Accessibility, SEO (móvil).
      **Si lo corres a mano: `npx @lhci/cli`** — `npx lhci` A SECAS resuelve a un paquete
      impostor del registry (imprime "Hello, this is AnupamAS01!"); el CI del kit ya usa el
      correcto (K-habla S2).
- [ ] No hay queries N+1.
- [ ] Imágenes usan `next/image`.

### 9. Documentación
- [ ] README actualizado si cambió el setup.
- [ ] **`docs/MANUAL-DE-USO.md` actualizado con las features de este sprint** (qué hace, cómo se usa, limitaciones — en lenguaje de usuario final). Feature sin manual = sprint no cierra.
- [ ] CHANGELOG entry (si el proyecto lo usa).
- [ ] Si hay decisión arquitectónica: ADR en `decisions/` de este repo.

### 10. Cierre del sprint (las dos casas)
- [ ] Bitácora `sprints/SPRINT_NNN-implementation-log.md` al día en este repo.
- [ ] Si este merge cierra el sprint: `sprints/SPRINT_NNN-summary.md` generado (plantilla en CLAUDE.md) — es lo que la planeadora lee para la retrospectiva.
- [ ] (Si aplicó IA embebida) checklist del skill `ia-embebida` completo.

## Output esperado

```
### ✅ Pasa (N/10)
- ...

### ❌ Falla (N/10) — bloquea merge
- tipo: descripción
- fix: ...

### ⚠️ Warnings (no bloquean, pero revisar)
- ...

### Decisión: MERGE OK | NO MERGE
```

Si NO MERGE, termina ahí. Si MERGE OK, el usuario procede manualmente (no mergees automáticamente).
