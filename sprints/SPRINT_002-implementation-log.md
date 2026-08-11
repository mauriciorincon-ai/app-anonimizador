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

### La demo en rojo del gate de categorías

Deuda asignada a este sprint: el gate llegó al repo sin la suya, y el estándar 2 v2.4.0 dice que
**todo gate nuevo nace con su demo**. PR #5 desechable con `minScore: 1.0` en las cuatro
categorías, contra la rama del sprint para que el diff fuera de una línea por categoría.

```
Checking assertions against 1 URL(s), 3 total run(s)
All results processed!                          ← assert 1 (budgets): VERDE

Checking assertions against 1 URL(s), 3 total run(s)
1 result(s) for http://localhost:3000/ :
  ✘  categories.performance failure for minScore assertion
        expected: >=1
           found: 0.94
      all values: 0.69, 0.94, 0.93
Assertion failed. Exiting with status code 1.
##[error]Process completed with exit code 1.
```

Falla **nombrando la categoría** y el valor encontrado, no con un «assertion failed» genérico. Y
falla **por separado** del assert de budgets, que corre antes y sigue verde: era justo lo que el
desdoblamiento tenía que lograr, y sin verlo no había forma de saberlo.

**Lo que la demo destapó de paso, y vale más que la demo:** las tres corridas del runner dieron
**0,69 · 0,94 · 0,93**. La primera, en frío, no habría pasado ni el umbral de 0,90 — la salva que
LHCI toma la **mediana**, no el mínimo. Así que el margen real de esta app contra el gate nuevo es
más delgado de lo que sugería el 0,95 medido en local, y depende de una decisión de LHCI que
nosotros no controlamos. Con la ruta de la Fase 5 encima, conviene mirarlo antes del PR.

PR cerrado y branch borrado en el mismo comando. Cero rastro en el historial.

### Spike A — cuánto cuesta de verdad un seudónimo → **ADR-004**

La orden dice «HMAC-SHA256 con Web Crypto». Había una razón concreta para dudarlo antes de escribir
la Fase 2, y no era el rendimiento: **`crypto.subtle` es asíncrono y el motor es síncrono y puro.**
Y una medición previa en **Node 24** apuntaba a la alternativa: 4,5 s por 500k valores esperando
uno por uno, 1,8 s en lotes — contra un HMAC síncrono sobre el `Sha256` que el repo ya tiene.

Medido **en Chromium**, sobre 500.000 valores distintos, cada camino sobre los 500.000 completos
(`scripts/spikes/spike-hmac.mjs`, que inyecta el archivo REAL del producto con el quitador de tipos
nativo de Node 24, no una copia):

| Camino                              | 500k       | Por valor |
| ----------------------------------- | ---------- | --------- |
| **Web Crypto, `await` uno por uno** | **0,68 s** | 1,37 µs   |
| **Web Crypto, lotes de 2.000**      | **0,62 s** | 1,24 µs   |
| Síncrono sobre el `Sha256` del repo | 2,91 s     | 5,83 µs   |
| Síncrono con un `terminarBytes()`   | 3,28 s     | 6,55 µs   |

**En el navegador el resultado es el OPUESTO al de Node:** Web Crypto es 4,4× más rápido donde en
Node era 2,5× más lento. Si el spike se hubiera corrido donde era cómodo, la decisión habría salido
al revés — y esa es la razón entera por la que el plan exigía el navegador.

Las dos implementaciones dan **el mismo digest** en los 9 casos, incluidas las tres fronteras del
bloque de 64 bytes y una llave de 100 bytes (la rama que obliga a hashear la llave).

**Veredicto: Web Crypto, como decía la orden** — y el argumento que motivó el spike se desinfló al
mirarlo de cerca: el contagio de `async` no ocurre, porque el pipeline de transformación es código
nuevo y los motores del S1 no calculan HMAC. Tampoco hace falta lotear: los lotes compran un 9 % a
cambio de complejidad y de 2.000 promesas vivas. Detalle en **ADR-004**.

**Presupuesto que hereda la Fase 2:** ~0,7 s por columna seudonimizada de 500k valores distintos,
dentro del worker. Se medirá en el gate de rendimiento de este sprint, no citando esta tabla.

### El e2e contra el build

Tercer punto de la fase, y el más rápido: confirmar que los 5 rojos del dev server siguen
enterrados. `pnpm test:e2e` en local, contra el build, **39 pasadas y 1 saltada por diseño** — el
mismo resultado que el CI. La fricción que originó el delta v1.12.0 no volvió.
