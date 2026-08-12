# Sprint 003 · El regreso — bitácora de implementación

> Velo cierra el círculo. El S1 lo hizo **ver**, el S2 lo hizo **actuar**; este sprint entrega la
> mitad que justifica el producto entero: cuando el tercero devuelve el archivo trabajado, el
> usuario lo carga y **los valores originales vuelven**. Bóveda cifrada + seudónimos reversibles +
> motor de restauración.
>
> **Las tres tensiones vienen resueltas de la planeadora y no se reabren:** la bóveda es un
> **archivo** portable (no IndexedDB); la restauración es **por valor** (no por posición); las
> colisiones de formato vuelven la restauración **ambigua**, y se dice **antes** de restaurar, con
> su número.

Branch `sprint-003/el-regreso`. Orden: `portafolio/anonimizador/ordenes/SPRINT_003-orden.md`.
Plan aprobado: `~/.claude/plans/eventual-riding-conway.md`.

---

## Fase 0 — Deuda del kit y del harness

### El delta del kit v1.15.0 — los cuatro puntos

**1. `playwright.config.ts` → dos reporters en CI.** Adoptado, pero **con otra razón que la del
delta**: la premisa se midió antes de creerla y resultó falsa. Ver «La demo» abajo.

**2. §4 y §5 de `/audita-sprint` se aplican desde la Fase 1, no al cierre.** Queda anotado aquí
como regla operativa del sprint, porque no hay dónde más ponerlo (la skill vive en la planeadora y
no se escribe desde aquí):

- **§4 — ¿qué frases caducaron?** Cada fase que cambie una capacidad revisa el copy que la
  describía. Este sprint tiene el caso servido en bandeja: portada, manual y README dicen hoy que
  el seudónimo **es irreversible**, y la Fase 2 lo vuelve medio falso. No se deja para el cierre.
- **§5 — campos del contrato sin consumidor.** Ningún campo nuevo nace sin su lector. Es el A2 del
  S2 al pie de la letra: un reporte entero, escrito y probado, **sin un solo llamador** — 6 de 9
  campos del contrato huérfanos, y ni la cobertura ni el typecheck lo vieron.

**3. Regla dura de verificación.** `pnpm test` ≠ `vitest run` (el script lleva `--coverage`, y el
CI rojo del S2 fue exactamente esa diferencia: 79,91 % contra un umbral de 80 %). `pnpm typecheck`
≠ `tsc --noEmit` (el script lleva `next typegen` delante). Y **leer lo que viene después del
resumen**: la línea que importa suele estar debajo del bloque verde.

**4. `/regreso` en `lighthouse-urls.json`.** Hecho, con la ruta todavía vacía. Ver abajo.

### La demo del `N flaky` — y la premisa que se cayó

El estándar dice que **un gate nuevo nace fallando**: antes de confiar en que el cambio de reporter
hace visible la línea, hay que verla. Spec temporal que falla su intento 0 y pasa en el 1, que es
la definición exacta de flaky para Playwright:

```ts
test("demo: falla el primer intento y pasa en el reintento", ({}, testInfo) => {
  expect(testInfo.retry).toBeGreaterThan(0);
});
```

Corrido con `CI=1` (que es lo que enciende `retries: 2` y los reporters de CI). Salida literal con
la config nueva, `[["github"], ["list"]]`:

```
Running 1 test using 1 worker

  ✘  1 [desktop-chromium] › tests/e2e/flaky-demo.spec.ts:8:5 › demo: falla el primer intento… (2ms)
::error file=tests/e2e/flaky-demo.spec.ts,title=…::  1) …%0A    Error: falla a propósito…
  ✓  2 [desktop-chromium] › … (retry #1) (1ms)
::notice title=🎭 Playwright Run Summary::  1 flaky%0A    [desktop-chromium] › …

  1 flaky
    [desktop-chromium] › tests/e2e/flaky-demo.spec.ts:8:5 › demo: falla el primer intento…
```

La línea aparece. **Pero la demo desmiente la razón del delta**, y eso vale más que la línea:

**Corrección 1 — `github` SÍ imprime `N flaky`.** El delta pedía el cambio «porque `github` no
imprime la línea». Se aisló el reporter (`--reporter=github`, que ignora la config) y la imprime
igual, dos veces: como texto plano al final del log **y** como anotación `::notice` del PR.

```
Running 1 test using 1 worker      ← y nada más hasta el final
  1 flaky
::notice title=🎭 Playwright Run Summary::  1 flaky%0A    [desktop-chromium] › …
```

Lo que `github` **no** imprime es el **avance por prueba**: sin `list`, el log salta de «Running 70
tests» al resumen, sin una sola línea intermedia. Eso es lo que gana el cambio — ver qué prueba
corre, cuánto tarda cada una y cuál se quedó colgada. El cambio se queda (esa visibilidad es real y
es justo la que convierte el `timeout: 90_000` en una alarma legible), pero **con la razón
corregida en el propio archivo**, para que nadie lo herede creyendo la versión falsa.

**Corrección 2 — la hipótesis del S2 no la sostienen los logs.** El comentario del `timeout` en
`playwright.config.ts` afirma que en CI el problema «no se había visto porque `retries: 2` las
reintentaba». Se revisaron las **12 corridas verdes** del historial del repo:

```
31552071285 → 70 passed (2.4m)     31455094308 → 68 passed (2.3m)
31551789638 → 70 passed (2.4m)     31452691992 → 39 passed (57.1s)
31551293390 → 70 passed (2.5m)     31451493024 → 39 passed (1.0m)
31550876014 → 70 passed (2.5m)     31449886869 → 39 passed (1.0m)
31549013575 → 70 passed (1.9m)     31449144597 → 39 passed (55.1s)
31548133976 → 70 passed (2.3m)     31448532242 → 39 passed (1.0m)
```

**Ni un `flaky` en toda la historia del repo.** Si los reintentos hubieran rescatado una prueba,
Playwright lo habría dicho — con el reporter que ya había. Así que el timeout de 30 s **nunca se
disparó en el runner**: solo en local, donde `retries: 0` y las pruebas pequeñas competían por CPU
con la de 500k filas en una máquina con más cosas encendidas. La frase del S2 era una inferencia
razonable escrita como hecho, y el registro dice otra cosa. El comentario del `timeout` se corrige
en el mismo commit.

Consecuencia práctica para el gate «cero flaky» del cierre: la línea de partida es **cero flaky en
12 de 12 corridas**, no un flaky invisible que ahora se revela.

### `/regreso` entra a la medición estando vacía

`lighthouse-urls.json` → `["/", "/transformar", "/regreso"]`, y `src/app/regreso/page.tsx` como
andamio honesto (dice que no está construida; no promete nada). Nada la enlaza todavía.

El motivo es el riesgo 9 del plan, que el S2 pagó completo: `/transformar` nació sin medirse, se
midió **el día del PR**, salió en **0,88** de rendimiento por arrastrar el motor entero en el
bundle, y hubo que rehacer la carga a última hora. Aquí la ruta se mide desde el primer commit para
tener el número de partida **antes** de construir, y para que cualquier caída se lea contra él.

Medición local con el Chromium de Playwright (`CHROME_PATH`), tres corridas por ruta, el mismo par
de asserts que corre el CI. **Los dos verdes.**

```
/               perf 0.95  a11y 1  bp 1  seo 1  LCP 3.0 s
/               perf 0.95  a11y 1  bp 1  seo 1  LCP 2.9 s
/               perf 0.93  a11y 1  bp 1  seo 1  LCP 3.2 s
/transformar    perf 0.93  a11y 1  bp 1  seo 1  LCP 3.2 s
/transformar    perf 0.93  a11y 1  bp 1  seo 1  LCP 3.2 s
/transformar    perf 0.93  a11y 1  bp 1  seo 1  LCP 3.2 s
/regreso        perf 0.95  a11y 1  bp 1  seo 1  LCP 2.9 s
/regreso        perf 0.93  a11y 1  bp 1  seo 1  LCP 3.2 s
/regreso        perf 0.93  a11y 1  bp 1  seo 1  LCP 3.2 s
```

**Medianas (que es lo que LHCI evalúa): `/` 0,95 · `/transformar` 0,93 · `/regreso` 0,93.**

**El número de partida enseña algo que no se esperaba, y conviene tenerlo escrito antes de la Fase
5:** `/regreso` está **vacía** —un título, dos párrafos y un enlace, sin una línea de JavaScript
propio— y saca **exactamente lo mismo** que `/transformar`, que carga un taller entero bajo demanda.
O sea que el 0,93 **no lo produce el contenido de la página: lo produce el piso común** (fuentes,
layout, el runtime de Next). Tres consecuencias prácticas:

1. **El margen sobre 0,90 no es del sprint, es estructural.** Ninguna pantalla de `/regreso` va a
   poder «compensar» con ligereza: 0,93 es el techo de una página en blanco.
2. **La Fase 5 tiene un presupuesto de casi cero** sobre el camino crítico. Todo lo pesado va
   diferido desde que nace —igual que el taller—, y no como arreglo posterior.
3. **El LCP de una página vacía es 3,0 s contra un budget de 3,5 s.** El margen real son ~300 ms de
   una métrica _simulada_ por Lantern sobre localhost, que castiga a las SPAs sanas. Si el gate cae
   en la Fase 5, el sospechoso número uno es el piso común, no la pantalla nueva.

### Desviación del plan

**El punto 1 del delta del kit v1.15.0 parte de una premisa falsa.** El cambio de reporter se hizo
—porque lo que aporta de verdad, el avance por prueba, vale— pero **no por el motivo que dice el
delta**, y la razón escrita en `playwright.config.ts` es la corregida, no la heredada. Con ella cae
también la frase del S2 sobre los reintentos que tapaban el timeout: no hay un solo `flaky` en las
12 corridas del historial.

Va aquí porque **en la planeadora no se escribe desde esta casa**. Lo que le toca decidir a ella:
si el delta se corrige en el kit (para que las demás apps no hereden la premisa) y si el estándar
gana la regla que este episodio ilustra — **un delta del kit también nace demostrado**: la demo no
solo comprueba que el gate nuevo funciona, comprueba que **el problema que dice arreglar existe**.
Aquí el gate funcionaba y el problema no existía.

### Verificación de la Fase 0

| Check                | Resultado                                                               |
| -------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`     | ✅ limpio                                                               |
| `pnpm lint`          | ✅ sin warnings                                                         |
| `pnpm test`          | ✅ **543 pruebas** en 30 archivos · statements 98,51 % · líneas 99,04 % |
| `pnpm build`         | ✅ 5 rutas estáticas, `/regreso` entre ellas                            |
| `CI=1 pnpm test:e2e` | ✅ **70 passed, 2 skipped, cero `flaky`** (48,2 s)                      |
| Lighthouse (local)   | ✅ budgets y categorías, los dos asserts verdes en las 3 rutas          |

Y el reporter nuevo se ganó el sueldo en la primera corrida real: el log ahora dice que la prueba
más lenta del suite es **`500.000 filas: Habeas Data de un clic, preview y descarga` con 27,6 s**.
Contra la alarma de 90 s eso es holgura de sobra, pero el dato **no existía** — antes solo se sabía
que 70 pruebas tardaban 2,5 minutos entre todas. Es exactamente la visibilidad que justifica el
cambio, ahora que la razón del delta se cayó.

### Los cuatro checks en el runner (PR #7, borrador desde la Fase 0)

```
anti-ia: pass    quality: pass    e2e: pass    lighthouse: pass
```

`e2e`: **70 passed, 2 skipped, cero `flaky`** (2,4 m). Lighthouse corrió las **tres** rutas,
`/regreso` incluida, y los dos asserts procesaron sin fallo.

**Y aquí está el número que justifica el cambio de reporter, esta vez de verdad.** En el runner, la
misma prueba de 500.000 filas tarda **1,0 m**:

```
✓  69 [desktop-chromium] › … › 500.000 filas: Habeas Data de un clic, preview y descarga (1.0m)
```

**60 s contra una alarma de 90 s: dos tercios del presupuesto, no la holgura cómoda que sugería el
27,6 s de local.** El runner de GitHub es la mitad de rápido que esta máquina para esa prueba, y esa
línea **no existía en el log antes de hoy** — el reporter `github` a secas salta de «Running 70
tests» al resumen. Se anota como número vigilado del sprint: si la Fase 5 mete al e2e un round-trip
completo sobre archivo grande, el margen que queda son 30 s, y el sitio donde se va a notar primero
es justo ahí.

---
