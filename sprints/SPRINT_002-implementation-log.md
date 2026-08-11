# Sprint 002 · El disfraz — bitácora de implementación

> Velo transforma, y lo demuestra. El S1 dejó una app que **ve**; este sprint la hace **actuar**:
> política campo por campo → preview antes/después → riesgo recalculado con Mondrian → archivo
> anonimizado descargado. Todo en el navegador, determinista, cero IA.
>
> **El patrón que gobierna el sprint:** `la-composicion-de-verdades-puede-mentir`. Los cuatro
> hallazgos de la auditoría del S1 —en un sprint sin un solo bug funcional— tocaron todos esa
> categoría.

Branch `sprint-002/el-disfraz`. Orden: `portafolio/anonimizador/ordenes/SPRINT_002-orden.md`.

---

## Fase 0 — Deuda del harness y del kit

### El delta del kit v1.12.0

`playwright.config.ts` **ya estaba adoptado**: el S1 lo pagó en su Fase 2 de auditoría, cuando se
descubrió que el e2e local corría contra `next dev` y sacaba 5 rojos sobre un árbol limpio. Se
verificó en vez de rehacerse — `command: "pnpm build && pnpm start"`, `reuseExistingServer: false`,
`timeout: 180_000`, los tres en su sitio.

Lo que sí entró:

- **`lighthouse-categorias.json`**, copiado del kit. El nombre es deliberadamente
  no-auto-descubrible: LHCI auto-carga `lighthouserc.json`, y si este archivo se llamara así, el
  assert de budgets lo cargaría solo y estallaría — `budgetsFile` es **mutuamente excluyente** con
  `assertions`.
- **El job `lighthouse`, desdoblado**: un `lhci collect` y **dos** `lhci assert`, por esa misma
  exclusividad. Y el flag correcto: `lhci collect` usa `--url=`, no `--collect.url=` (que es de
  `autorun`).
- `.lighthouseci/` al `.gitignore`: correr el gate en local no debe ensuciar el árbol.

Verificado en local antes de empujar, con el Chromium de Playwright vía `CHROME_PATH`:

```
Run #1..#3 ...done.
assert --budgetsFile=./perf-budget.json        → All results processed!   (exit 0)
assert --config=./lighthouse-categorias.json   → All results processed!   (exit 0)
```

**Un número que conviene tener a la vista desde ahora:** las tres corridas dieron Performance
**0,95 · 0,94 · 0,93** (LHCI toma la mediana). Contra el umbral de 0,90 el margen es de cuatro
centésimas — y la Fase 5 mete una ruta nueva más pesada que la aduana: un editor de política es una
tabla editable con controles. Que el gate nuevo cace esa ruta es plausible, y si pasa **es el
hallazgo, no una regresión**.
