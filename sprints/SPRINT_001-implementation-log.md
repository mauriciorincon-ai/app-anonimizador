---
sprint: 001
app: anonimizador
titulo: "El diagnóstico — Velo abre la aduana"
branch: sprint-001/el-diagnostico
inicio: 2026-08-09
estado: construyendo
---

# Bitácora de implementación — Sprint 001

> Bitácora viva. Se escribe mientras se construye, no al final. Las desviaciones del plan van en
> su propia sección y se avisan al usuario (la planeadora es READ-ONLY: aquí se anota, allá se lee).

## Fase 0 — Cimientos, gates y spikes ✅

Branch `sprint-001/el-diagnostico` desde `origin/main` (que ya incluye el PR #1 del estampado,
squash-merge `8de433a`). Sin aprovisionamiento externo: Velo no consume un solo servicio, así que
el "humo de credenciales" del método no aplica — su equivalente es CI verde con la config nueva.

### Gate anti-IA — la regla dura nº1 vuelta check mecánico

`scripts/gate-anti-ia.mjs` audita `package.json` **y `pnpm-lock.yaml`** contra tres familias
vetadas (SDKs de proveedores de LLM · frameworks de orquestación · runtimes de inferencia local,
incluidos los que corren en la propia pestaña). Una dependencia **transitiva** cuenta igual que una
directa.

- Job propio en CI (`anti-ia`), **sin `needs` y sin `pnpm install`**: ~10 s, se pone rojo de
  inmediato en vez de esperar al final del pipeline.
- **Agregado a la ruleset `main-protegida` como check requerido en esta misma fase** (regla 5 del
  CLAUDE.md: un job nuevo entra a la ruleset en el sprint que lo crea). Checks requeridos ahora:
  `anti-ia`, `quality`, `e2e`, `lighthouse`.
- 10 tests unitarios que prueban el gate **en rojo**: SDK directo, SDK colado en `devDependencies`,
  dependencia transitiva con el manifiesto limpio — y que NO confunda `@aws-sdk/client-s3` ni
  `aidan` con IA. Verificado también por CLI: exit 1 con el culpable nombrado.
- Detalle y razones: `decisions/001-cero-ia.md`.

### Cobertura activada (K7 del kit) y observabilidad endurecida

`test` pasó a `vitest run --coverage`, lo que mete `src/lib/**` y `src/engine/**` bajo el umbral de
80%. Como estaba previsto en el plan (riesgo 3), eso obligaba a tocar `src/lib/observability.ts`
en la misma fase — así que se **adelantó de la Fase 1 a la 0** el endurecimiento que la DoD exige:

- Los `string` de `meta` solo pasan si tienen forma de etiqueta corta en kebab-case (una enum del
  código). Un encabezado real (`"Cédula del titular"`, `"DIAGNOSTICO_CIE10"`) o un valor de celda
  no la tienen. Las **claves** se validan igual que los valores: una clave puede revelar tanto como
  un valor.
- Los `number` se resolvieron por magnitud, que era el hueco no obvio: un conteo de columnas y una
  cédula son ambos `number`. Por debajo de 10.000 pasan exactos; de ahí en adelante viajan como
  orden de magnitud (`"1e9–1e10"`), que conserva el valor diagnóstico y destruye el identificador.
- 13 tests, incluido uno de barrido que mete todos los encabezados y valores prohibidos y luego
  inspecciona el payload crudo enviado a Sentry.

### Kit de prueba — la única fuente de datos (`docs/kit-de-prueba/generador.mjs`)

PRNG seeded (mulberry32), cero `Math.random()`. 24 columnas en el perfil clínico, con perfiles
`limpio` (para el estado "archivo limpio") y `trampas`.

- **Determinismo verificado:** dos corridas con `--seed 42` dan el mismo SHA-256
  (`379406f2…0947` para 1.000 filas). Semilla distinta ⇒ archivo distinto. Tras refactorizar el
  generador para compartir la producción de filas entre CSV y XLSX, la salida siguió siendo
  **byte-idéntica** — la propia regla del producto atrapó que el refactor no cambió nada.
- **Algoritmos verificados contra una implementación independiente** (Python), no contra sí mismos:
  sobre 1.000 filas → NIT con DV válido 895 / inválido 69 · Luhn válidas 909 / inválidas 67 · IBAN
  válidos 966 / inválidos 0 · cédulas de 10 dígitos 613, históricas 276, imposibles 75.
- **Casos fuera de rango** (regla anti-supuesto-compartido): NITs con DV incorrecto, cédulas
  imposibles (`0`, `99`, 12 dígitos, con letras), celulares de 9 dígitos y de prefijo inexistente,
  placas mal formadas, tarjetas que fallan Luhn, ~3% de celdas vacías, y los mismos valores escritos
  como los escribe la gente (`900.123.456-7`, `+57 300 123 4567`).
- **Columnas-trampa** (si el motor las marca, es falso positivo): `codigo_interno` — 10 dígitos con
  forma de cédula, es un consecutivo del sistema (964/964 con 10 dígitos); `referencia_pago` — pasa
  Luhn **a propósito** (973/973), parece tarjeta y es una referencia de recaudo.
- Cada columna declara qué **debería** detectar el motor (`esperadoPorColumna()`): el kit es también
  el oráculo de los tests de la Fase 1.
- Los datasets **no se commitean** (500k filas = 130 MB, repo público): `tmp/` va a `.gitignore` y
  se regeneran con su semilla.

### Spike A · parser 500k + columnar → **riesgo del worker cerrado**

`src/engine/columnar.ts` (typed arrays + diccionario de strings) y `src/workers/parser.worker.ts`
(PapaParse en streaming dentro del worker) nacieron aquí y **se quedan**: son código de producto.

Medido en Chromium con build de **producción** (que es como corre el job `e2e`), fixture de 500.000
filas × 24 columnas (135,79 MB):

| Métrica                                   | Valor        |
| ----------------------------------------- | ------------ |
| Parseo + construcción columnar            | **2.680 ms** |
| Tareas largas en el hilo principal        | **0**        |
| Heap del hilo principal                   | 10 MB        |
| Peticiones externas durante todo el flujo | **0**        |

- **Turbopack instancia bien el worker** (`new Worker(new URL(...))`, sin `type: "module"`): el
  riesgo K11 heredado de ds S1 no se materializó, ni en dev ni en producción.
- **El bundle del parser NO entra al load inicial** (riesgo 2 del plan). Evidencia por red: antes de
  soltar el archivo se piden 10 recursos, ninguno es el chunk del parser; al soltarlo se piden
  exactamente 3 (`turbopack-worker-*.js` 818 B + runtime 9,3 KB + parser 21 KB). Las fuentes se
  sirven desde `_next/static/media` — `next/font` self-hostea, cero peticiones a Google.
- **Memoria de la tabla columnar**, medida en Node (mismo V8, porque `performance.memory` no existe
  dentro de un worker): **371,8 MB** para 500k × 24 con 6,29 M de valores únicos. Sale de una
  optimización que el spike encontró: soltar el `Map` de construcción en `finalizar()` bajó el costo
  de **558,2 MB a 371,8 MB** — 186 MB que eran entradas de Map vivas sin razón. Deja ~7× de holgura
  bajo el techo de ~4 GB por pestaña.

### Spike B · Excel → **el riesgo nº1 del plan, cerrado con dos hallazgos**

1. **`xlsx` del registro npm rompe el CI.** Verificado en proyecto aislado: `xlsx@0.18.5` (la última
   que quedó en npm) dispara dos avisos **high** que `pnpm audit --audit-level high` reporta →
   `quality` en rojo. Se instaló desde el **CDN oficial de SheetJS** (`xlsx-0.20.3.tgz`): audit
   limpio, y el lockfile fija el tarball con integridad sha512.
2. **El techo real no es el que decía la investigación.** F1 documentaba crashes desde ~200k filas;
   este stack leyó **400.000 filas × 24 columnas (167 MB) en 11,7 s con 0 tareas largas**. El límite
   duro apareció en la **escritura**: SheetJS no pudo generar el fixture de 500k
   (`RangeError: Invalid string length`, el tope de string de V8).

**Tope declarado por TAMAÑO de archivo, no por filas** — porque el número de filas de un `.xlsx` no
se conoce hasta abrirlo, y abrirlo es justo la operación peligrosa; `file.size` se conoce al soltar.
Tope duro **150 MB**, aviso desde 40 MB. CSV sin tope. Todo en
`decisions/003-excel-suministro-y-tope.md`.

### Spike C · Mondrian → **viable tal cual** (ADR-002)

500.000 filas, k=5, Node 24: **61 ms** con 3 QIs · **120 ms** con 5 · **171 ms** con 8. Cero clases
por debajo de k. Dos corridas ⇒ partición idéntica (el desempate fijado por índice de dimensión hace
la salida reproducible). No hace falta WASM, ni DuckDB-WASM, ni el patrón SKALD. El costo real está
en proyectar categóricos a dominio ordenado (78 ms con 8 QIs), no en el algoritmo.

El código del spike es desechable y así está marcado: midió, dio veredicto, y su valor vive en
`decisions/002-spike-mondrian.md`.

### Limpieza del andamio

`layout.tsx` pasó a `lang="es-CO"` con metadata de Velo (venía como "Create Next App" en inglés);
`page.tsx` dejó de ser la plantilla de `create-next-app` (logos de Vercel/Next, texto en inglés) y
es un marcador honesto en español, sin una sola petición externa. La aduana de verdad se construye
en la Fase 3, después de `design-system.md`.

**Instrumentos temporales retirados:** la ruta `/spike-parser` y los dos specs de Playwright de los
spikes A y B se eliminaron al terminar la medición. Eran instrumentos, no producto, y habrían puesto
el job `e2e` en rojo en CI (dependen de fixtures de 130 MB que no existen allá). Sus sucesores
permanentes —el e2e de presupuesto de rendimiento y el de la garantía de red, con `globalSetup` que
genera los fixtures— llegan en la Fase 4. Los dos spikes de Node (`scripts/spikes/`) sí se quedan:
son reproducibles, no tocan CI, y sostienen los ADRs.

### Comandos para reproducir las mediciones

```bash
pnpm kit:generar -- --filas 500000 --seed 42 --salida tmp/kit-de-prueba/clinico-500k.csv
node --expose-gc --max-old-space-size=4096 scripts/spikes/spike-a-memoria.mjs
node --expose-gc --max-old-space-size=6144 scripts/spikes/spike-c-mondrian.mjs
pnpm kit:generar -- --filas 400000 --seed 42 --formato xlsx --salida tmp/kit-de-prueba/clinico-400000.xlsx
```

## Desviación del plan

1. **El endurecimiento de `observability.ts` se adelantó de la Fase 1 a la Fase 0.** Razón: activar
   `--coverage` en F0 mete el archivo bajo el umbral de 80% de inmediato; escribir un test para el
   contrato viejo y reescribirlo en F1 era churn sin valor. El plan ya preveía la colisión (riesgo 3);
   solo cambió la fase donde se paga. No afecta el alcance.
2. **El tope de Excel se declara por tamaño de archivo, no por número de filas.** El plan hablaba de
   "tope de filas medido". La medición mostró que un tope por filas es inaplicable: el conteo no se
   conoce sin abrir el archivo, que es la operación riesgosa. El acceptance criterion nº4 ("Excel
   funciona hasta el tope que el spike fije") se cumple igual, con un tope que sí se puede evaluar
   antes de tocar el archivo.

Ninguna de las dos toca el alcance del sprint ni el plan de la casa planeadora.
