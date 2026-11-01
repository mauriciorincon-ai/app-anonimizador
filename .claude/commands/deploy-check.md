---
description: Checklist pre-merge a main (perfil WEB) — ≤ 10 casillas MANUALES. Todo lo demás lo corre la CI; si no está en la CI, no es casilla.
---

# /deploy-check

**Todo lo demás lo corre la CI (`quality` · `e2e` · `lighthouse`); si no está en la CI, no es casilla.**
Esto es solo lo que la CI no puede ver. Se corre después de `/audita-sprint`, antes de abrir el PR.

- [ ] 1. **El preview abre y el flujo principal funciona** de punta a punta en el preview del PR, con
      sesión y sin ella.
- [ ] 2. **Capturas leídas como imagen** (no solo generadas) de las pantallas tocadas: **ambos temas, un
      idioma** (el otro al hito), móvil y escritorio, ningún desborde.
- [ ] 3. **`docs/MANUAL-DE-USO.md` actualizado** con cada feature de este sprint (qué hace, cómo se usa,
      limitaciones).
- [ ] 4. **Cierre ejecutivo** `sprints/SPRINT_NNN-cierre.md` ≤ 40 líneas, con la salida de
      `node scripts/horas-sprint.mjs` pegada y la sección Auditoría.
- [ ] 5. **Cero enlaces:** el paso «Cero enlaces» del job `quality` existe en el `ci.yml` de esta app (árbol +
      homepage del repo, dominios de `cero-enlaces.json` ampliados con el host real del stack); si aún no, aquí:
      `node scripts/cero-enlaces.mjs --homepage "$(gh repo view --json homepageUrl -q .homepageUrl)"` sale en verde.
      Si el homepage apunta a producción: `gh repo edit --homepage ""` (o el propio repo).
- [ ] 6. **Deuda registrada:** medios y bajos de la auditoría con `archivo:línea` en el cierre; cero
      críticos o altos abiertos.
- [ ] 7. **Aprovisionamiento nuevo probado** (solo si hubo): cada credencial o servicio nuevo con su humo
      corrido, `.env.example` y Vercel env al día. Si no hubo: «n/a».
- [ ] 8. **Checks requeridos con conclusión propia `success`**, leídos al final (`gh pr checks <N>`):
      `skipped`, `cancelled` y ausente no son verde; si un job corrió por primera vez, el cierre lo dice.
- [ ] 9. **Protecciones del sistema** (solo si el sprint tocó alguna): matriz y «sí» por acción en el
      cierre. Si no: «n/a».
- [ ] 10. **Derivados nuevos en disco** (solo si el sprint introdujo uno): nace con permisos no menos
      privados que su fuente e inventariado en el cierre. Si no: «n/a».

## Output

`✅ Pasa (n/10)` · `❌ Falla (n/10) — bloquea merge` (con su fix) · `Decisión: MERGE OK | NO MERGE`.
Si NO MERGE, termina ahí. Si MERGE OK, el merge (squash) lo hace el usuario — no mergees tú.
