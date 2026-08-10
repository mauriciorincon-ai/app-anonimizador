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

## Fase 1 — Motor de detección ✅

`src/engine/` con 133 tests y **97,8% de statements / 96,0% de ramas** (umbral: 80%).

### La distinción que sostiene la promesa del producto

Velo dice "si lo marca, es porque el algoritmo oficial lo confirma". Esa frase solo es honesta si el
código separa lo que confirma de lo que apenas reconoce — así que cada validador declara su
**certeza**:

- **`algoritmo-oficial`** — hay un dígito de verificación que se recomputa y cuadra: NIT (mod 11 de
  la DIAN), tarjetas (Luhn, ISO/IEC 7812-1), IBAN (97-10 de ISO 7064). Aquí Velo **afirma**.
- **`estructural`** — no existe checksum público y solo se puede verificar la forma: cédula
  (la Registraduría no publica DV), teléfonos, placas, correo, IP, coordenadas, fechas, nombres.
  Aquí Velo **reconoce**, y la UI no puede presentarlo igual.
- **`sin-confirmar`** — la conclusión viene del **encabezado**, no de los valores. Es el único
  camino posible para los datos sensibles del art. 5: ningún cálculo puede mirar `J45.9` y afirmar
  que es un diagnóstico de salud. Velo lo marca —callarlo sería peor— pero jamás con la misma
  seguridad, y la evidencia dice explícitamente que fue el nombre de la columna.

Cada validador lleva **su fuente oficial citada en el código**, no en un documento aparte.

### Taxonomía de 4 categorías (decisión de arranque, ya implementada)

`identificador-directo` · `cuasi-identificador` · `dato-sensible (art. 5)` · `no-personal`. El
encabezado solo puede **subir** la categoría, nunca bajarla: si los valores confirman un NIT, que la
columna se llame `codigo` no lo vuelve inocuo (hay test).

### Dos correcciones de diseño que salieron del fixture, no de la intuición

1. **La adjudicación es por ESPECIFICIDAD, no por aciertos.** El primer diseño elegía al validador
   con más aciertos sobre la muestra, y eso está mal por una razón que solo se ve con datos reales:
   en una columna de cédulas, «es un número» acierta en MÁS filas que «es una cédula» —los valores
   rotos siguen siendo números—, así que el validador más permisivo se quedaba con todas las
   columnas. Ahora gana la mayor prioridad; aciertos y orden del registro solo desempatan.
2. **La cédula histórica exige apoyo del encabezado.** El kit destapó un falso positivo real: la
   columna `monto` (6–7 dígitos) tiene _exactamente_ la forma de una cédula de serie histórica, y
   sin dígito de verificación público ningún cálculo puede separarlas. En vez de adivinar, el
   validador ahora solo reclama el rango histórico si el encabezado lo respalda
   (`cedula|cc|documento|identificacion|nuip`). El NUIP de 10 dígitos se sigue reclamando solo.

### Las dos columnas-trampa: una vencida, una declarada

| Trampa                                                            | Resultado                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referencia_pago` — 16 dígitos que **pasan Luhn a propósito**     | **Vencida con una regla oficial**, no con una heurística: el primer dígito es el MII de ISO/IEC 7812-1 y el 9 está reservado a asignación nacional. Ninguna tarjeta de pago empieza por ahí. Se clasifica como `numero` / `no-personal`.                                                                                                |
| `codigo_interno` — consecutivo de 10 dígitos en el rango del NUIP | **No se puede vencer, y el test lo fija por escrito.** Sin DV público, un consecutivo en ese rango es indistinguible de una cédula para cualquier motor determinista. Velo lo marca como cédula con certeza `estructural`, que es la señal de que ahí hay algo que revisar. Esconder el falso positivo habría sido peor que declararlo. |

### El oráculo vive en el kit, no en el test

`esperadoPorColumna()` del generador declara, columna por columna, qué tipo y qué categoría debería
detectar el motor. El test se mide contra eso, así que **no puede acomodarse** al comportamiento del
motor: si el motor cambia, falla. Las 24 columnas del perfil clínico coinciden.

Además, el kit ahora genera un 8% de **nombres reales fuera del diccionario del motor** (Zoraida
Piraquive, Arístides Tarazona). Es la regla anti-supuesto-compartido aplicada al léxico: sin ellos,
el test mediría al diccionario contra su propia lista. Hay un test que **fija el falso negativo por
escrito** — un apellido no deja de serlo por faltar en una lista, y "detección de nombres" no puede
leerse como exhaustiva.

### Gate de determinismo (regla dura nº3)

`tests/unit/determinismo.test.ts` verifica los tres caminos por los que el determinismo se rompe:

1. Dos corridas sobre el mismo archivo ⇒ misma serialización canónica.
2. **El tamaño de chunk del parser no cambia el resultado** (7, 1.999 y 100.000 filas por bloque dan
   lo mismo). PapaParse corta por bytes: si el diagnóstico dependiera de dónde cae el corte, dos
   computadores darían resultados distintos sobre el mismo CSV.
3. **El código fuente del motor no contiene fuentes de no-determinismo**: un escaneo por archivo
   prohíbe `Math.random`, `Date.now`, `new Date()`, `crypto.getRandomValues` y `localeCompare` (que
   ordena según el idioma del sistema). Un test de comportamiento no vería esto: el resultado
   seguiría siendo plausible, solo dejaría de ser reproducible.

Y un cuarto que evita el autoengaño: **una semilla distinta SÍ cambia la salida** — un gate de
determinismo que pasa siempre no prueba nada.

`serializacion.ts` existe porque `JSON.stringify` conserva el orden de inserción: comparar con él
sería medir con una regla que se mueve.

### Rendimiento

**82 ms** para clasificar 500.000 filas × 24 columnas (muestreo determinista de 5.000 filas por
columna, a zancada fija por todo el archivo — no "las primeras N", que en un archivo ordenado por
fecha no representa nada). Resultado sobre el fixture: 10 identificadores directos, 7
cuasi-identificadores, 3 datos sensibles, 4 no personales.

### Privacidad en el diagnóstico

Las muestras van enmascaradas (`103***89`) con un número **fijo** de asteriscos: si contaran los
caracteres ocultos, la máscara filtraría la longitud del valor. Y las columnas sensibles **no llevan
muestra**: con tres valores posibles ninguna máscara esconde nada — `I******a` es «Indígena».

## Fase 2 — Motor de riesgo ✅

`src/engine/riesgo.ts` con 161 tests en total (97,3% statements · 94,2% ramas).

### Todo lo que sale de aquí es EXACTO, y lleva la marca puesta

Cada resultado viaja con `naturaleza: "exacto"`. No es decoración: el S2 añadirá los estimadores de
unicidad poblacional (Pitman/Zayatz), que dependen del modelo y de la fracción de muestreo, y la UI
tiene que poder distinguirlos sin ambigüedad. Modelo de atacante: **prosecutor** —el más adverso de
los tres de ARX y el único calculable exacto sobre la muestra—, riesgo por registro = 1/|clase|.

### La tabla de 12 filas calculada a mano

El caso central del test no es un fixture grande: son 12 filas con su aritmética escrita en el
propio archivo (5 clases de tamaños 4·3·2·2·1 → k=1, riesgo máximo 1, promedio 5/12, 1 único).
Un motor de riesgo verificado solo contra datasets grandes produce números plausibles que nadie
comprobó nunca.

De ahí salió un detalle que valía la pena fijar: el riesgo promedio se calcula como
**clases/filas**, no sumando 500.000 términos de 1/k (que acumularía error de punto flotante en un
número que se presenta como exacto). La igualdad es demostrable —Σ(|c|×1/|c|)/n = clases/n— y hay un
test que **confronta las dos formas** para que no quede en la palabra de un comentario.

### Lattice incremental

Las clases de una combinación de tamaño _m_ se derivan de las de tamaño _m−1_ más una columna: un
pase O(n) sobre enteros por columna añadida, con recorrido en profundidad que hereda del padre. Sin
esa herencia cada combinación costaría recalcular desde cero.

Hay un test que verifica la **propiedad matemática del retículo**: añadir una columna nunca puede
bajar el número de clases ni el de únicos. Si el recorrido incremental estuviera mal, esa invariante
se rompería sin que ningún otro test lo notara.

### El advisor: dos decisiones que cambiaron con los datos

1. **Un comparador roto que el fixture no habría cazado.** El ranking encadenaba tres criterios con
   `||` y ternarios; la precedencia lo convertía en un `if` sobre el primero que fuera verdadero.
   No explota: solo hace que dos corridas ordenen distinto — la peor clase de error para este
   producto. Reescrito en sentencias separadas, con el porqué al lado.
2. **Las columnas que identifican solas se REPORTAN, no se excluyen.** El primer diseño descartaba
   las columnas "casi únicas" por su cardinalidad. El kit mostró el problema: a 3.000 filas la fecha
   de nacimiento (≈24.000 valores posibles) es casi única y quedaba fuera — escondiendo justo el
   hallazgo más importante del archivo. Ahora el umbral se mide sobre el **efecto** (cuánta gente
   queda sola, no cuántos valores distintos hay), esas columnas salen en su propia lista
   `identificanSolas` con su número, y solo se las deja fuera del recorrido de combinaciones porque
   cualquier combinación que las incluyera heredaría su unicidad sin decir nada nuevo.

   El test que fija la diferencia está construido a mano: 100 filas con 90 valores distintos (el
   90% — un umbral por cardinalidad la habría descartado) que solo dejan solos a 80 registros
   (80%). La columna entra a las combinaciones, que es lo correcto.

**Nada de topes silenciosos:** el advisor publica cuántas candidatas mira (6), hasta qué tamaño
combina (4), cuántas combinaciones evaluó (50 = C(6,2)+C(6,3)+C(6,4)) y **qué quedó fuera con su
motivo** — identificador directo (señala solo), dato sensible del art. 5 (es el objetivo del ataque,
no la llave), columna constante, o fuera del tope.

### Rendimiento y resultado sobre el fixture de 500k

**1.254 ms** para la evaluación completa (clases de equivalencia sobre 7 QIs + las 50 combinaciones
del advisor). Resultado: 500.000 clases, k mínimo 1, **100% de registros únicos** — con esos
cuasi-identificadores, el archivo no protege a nadie, y el advisor lo desglosa:
`referencia_pago` 97% · `ip_registro` 97% · `latitud` 94% · `longitud` 93% · `monto` 92% identifican
solas; la combinación más delatora sin ellas es
`fecha_nacimiento + fecha_atencion + municipio + estrato` con k=1 y 99,5% de únicos.

### El gate de determinismo ahora cubre el diagnóstico completo

Se extendió para serializar **detección + riesgo + advisor** y comparar entre corridas y entre
tamaños de chunk. Un ranking que cambie de orden rompe la promesa igual que un tipo mal detectado.

## Fase 3 — UI: la aduana y el diagnóstico ✅

### `design-system.md` primero — «bóveda serena»

El documento se escribió antes de la primera línea de JSX, y las pantallas lo obedecen.
Personalidad: **precisa · serena · cómplice**, y explícitamente **nunca alarmista, nunca clínica,
nunca ostentosa**. La metáfora que ordena las decisiones son **dos materiales**: el _papel_ (fondo
claro y cálido, donde se lee) y la _bóveda_ (fondo verde-negro, donde los datos están) — el tema
oscuro no es el mismo diseño en negativo, es estar adentro.

- **El sello «nada sale de aquí» es el elemento de identidad**, dibujado en SVG inline. La razón no
  es de rendimiento: una marca servida desde un CDN sería una petición externa, o sea que el sello
  que promete que nada sale estaría hecho de algo que sí salió. No es clicable, no se anima y no
  reacciona a nada — es lo único de la interfaz que nunca cambia, porque nunca deja de ser cierto.
- **Contraste medido, no estimado a ojo** (script WCAG 2.1 antes de fijar la paleta): todo texto
  ≥4,5:1 sobre sus tres fondos posibles en los dos temas; el peor caso es `--tinta-tenue` sobre
  `--papel-hundido` con **4,75:1** en claro y **5,48:1** en oscuro. `--borde-control` existe como
  token aparte precisamente porque los controles necesitan su propio 3:1 (WCAG 1.4.11) y el borde
  decorativo no llega ni debe.
- **Tres familias con oficio**: Fraunces (display, la calidez editorial que impide que esto se lea
  como un panel de control), IBM Plex Sans (interfaz) e IBM Plex Mono (cifras, nombres de columna,
  fuentes citadas). Self-hosteadas por `next/font` en build: cero peticiones a Google en runtime.

### La frontera se movió a donde tenía que estar

El worker ya no solo parsea: **clasifica y mide el riesgo dentro de sí mismo**. Leer el archivo en
el worker y mandar la tabla a la página para analizarla habría tirado la frontera por la ventana.
Lo que cruza es el informe —conteos, nombres de columna, proporciones y muestras ya
enmascaradas—; la tabla se queda, y muere cuando el worker se termina.

- `src/workers/contrato.ts` es la lista de lo permitido, en tipos. Vive aparte del worker para que
  la UI pueda importarlo sin arrastrar PapaParse y el motor al bundle de la página.
- `src/lib/sesion.ts`: store en memoria, cero persistencia. `descartar()` **termina el worker**, que
  es la única forma real de borrar: dejar de tenerlo.
- La transición ante los mensajes del worker se extrajo como función pura (`siguienteEstado`) —
  entre otras cosas para cerrar el caso del **progreso rezagado**: un mensaje que el worker ya había
  encolado cuando el usuario descartó no puede resucitar la pantalla de análisis.

### P1 «La aduana» y P2 «El diagnóstico»

Los cinco estados de cada pantalla existen y están construidos, no rellenados. Dos decisiones que
son de producto y no de estilo:

- **No hay barra de progreso falsa.** La barra solo aparece cuando hay una medida real que enseñar
  (los bytes leídos del CSV). Un `.xlsx` no reporta avance mientras SheetJS abre el libro, y las
  etapas de clasificación y riesgo no tienen fracción: ahí se nombra la etapa y se cuentan las
  filas, sin barra. Inventar el relleno sería una mentira pequeña en la única pantalla donde el
  producto está pidiendo confianza.
- **El estado «sin datos cargados» es una pantalla diseñada, no un error.** Recargar
  `/diagnostico` no recupera nada, y la pantalla dice exactamente eso: _«No quedó nada, y es a
  propósito»_. Esa pérdida es la prueba visible de la promesa.

El advisor declara su alcance donde se aplica: cuántas combinaciones evaluó, sobre cuántas
candidatas, con qué tope, y qué columnas quedaron fuera **con su motivo**.

### Tres defectos que solo aparecieron al mirar la pantalla

1. **La página entera se encogía en móvil.** La tabla de columnas vive en un contenedor con
   `overflow-x: auto`, así que su ancho no debería salir de ahí — pero Chromium en móvil lo sumaba
   igual al ancho del documento y aplicaba «encoger para ajustar»: un viewport de 412 px se
   dibujaba a **747 px**, con toda la tipografía a la mitad. Se cerró con `contain: paint` sobre la
   región (medido antes y después). No lo habría cazado ningún test de comportamiento: la página
   funcionaba, solo se veía mal.
2. **`opacity` sobre texto = contraste roto.** La línea de la fuente oficial iba con `opacity-80`
   para «atenuarla»; eso mezcla el color con el fondo y lo dejaba en **3,58:1** (claro) y **3,98:1**
   (oscuro). axe lo marcó en 18 nodos. La jerarquía la hacen ahora la familia mono y el tamaño, que
   no cuestan contraste.
3. **El `<dl>` del panel de riesgo no era un `<dl>`.** La explicación iba como `<p>` hermano del
   `<dd>`, lo que rompe la lista de definiciones para un lector de pantalla. La explicación se
   movió dentro del `<dd>`.

Y una de composición: **el sello aparecía dos veces en la misma pantalla** (encabezado y bloque
grande, a diez centímetros). Repetir la frase no refuerza una promesa, la abarata: el bloque
extendido ahora la _desarrolla_ y se colocó pegado a la zona de carga, que es donde el usuario la
necesita — en el segundo en que está a punto de soltar una tabla con datos de personas reales.

### Verificación

| Qué                               | Resultado                                                                  |
| --------------------------------- | -------------------------------------------------------------------------- |
| Tests unitarios y de integración  | **206 pasando** · cobertura 96,7% stmts / 93,9% ramas                      |
| axe (`@axe-core/playwright`)      | **16/16** — 4 estados × 2 temas × móvil y desktop, **cero violaciones**    |
| Flujo de 500k filas **por la UI** | **3.882 ms** de punta a punta · **0 tareas largas** en el hilo principal   |
| Peticiones durante todo el flujo  | **23, todas al propio origen; 0 externas y 0 con cuerpo**                  |
| Peso inicial de `/`               | script **209 KB** (presupuesto 350) · total **319 KB** (presupuesto 1.000) |
| Pasada de capturas                | 20 capturas leídas como imagen: 5 estados × 2 temas × móvil y desktop      |

`lighthouse-urls.json` se queda en `["/"]`: `/diagnostico` sin archivo cargado es —a propósito— el
estado vacío, así que medirlo no diría nada sobre la pantalla real, y medir la real exigiría
cargarle 130 MB a Lighthouse.

### Gate de honestidad medida, ahora mecánico

`tests/unit/copy.test.ts` barre el código de la interfaz y el manual buscando las frases que la
regla dura nº4 prohíbe («anonimato garantizado», «100 % seguro», «imposible de reidentificar») más
sus variantes habituales. Mira el **código fuente**, no la salida: una frase escondida en un estado
que ningún test recorre haría el mismo daño y no la cazaría ninguna aserción de comportamiento.

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

3. **El kit de prueba cambió su semilla de salida al añadir los nombres fuera del diccionario.** El
   SHA-256 de referencia para 1.000 filas con `--seed 42` pasó de `379406f2…0947` a
   `54d06ff9…0175`. No es una pérdida de determinismo —dos corridas siguen dando el mismo
   archivo— sino el efecto esperado de ampliar el generador; se anota para que nadie lea el cambio
   de huella como una regresión.
4. **Los validadores reciben el nombre de la columna como contexto** (`valida(valor, contexto)`).
   El plan asumía validadores puros de valor. La cédula histórica obligó a abrir la puerta: no es
   una concesión al pragmatismo, es la única forma honesta de tratar una forma que —sin checksum
   público— no se puede distinguir mirando el dato. El resto de validadores ignora el contexto.

5. **El QI advisor reporta las columnas que identifican solas en vez de excluirlas.** El plan decía
   "top-K candidatas por cardinalidad". La medición mostró que un umbral por cardinalidad esconde
   el hallazgo más importante cuando el archivo es pequeño (a 3.000 filas, la fecha de nacimiento
   es casi única). El acotamiento a top-6 y a combinaciones de 2–4 se mantiene tal cual; lo que
   cambió es el criterio para decidir qué columna entra, que ahora se mide sobre el efecto real.

6. **El kit ganó un perfil (`sin-personales`) y los e2e de la Fase 3 se adelantaron.** El estado
   «Velo no reconoció datos personales» era inalcanzable por el camino real: el perfil `limpio`
   tiene `estrato`, que es un cuasi-identificador de manual y debe seguir siéndolo. Se añadió un
   perfil sin una sola columna personal para poder llegar a ese estado soltando un archivo, y no
   solo con un informe de mentira en un test. De paso entraron el `globalSetup` de Playwright
   (genera los fixtures con el kit seeded, a `tmp/`, que está en `.gitignore`) y el barrido de axe,
   que el plan tenía en la Fase 4: son el criterio observable de cierre de la Fase 3, así que
   escribirlos allá y usarlos aquí habría sido el orden equivocado. El resto de la suite e2e
   —camino feliz, garantía de red, 500k, Excel, reduced-motion, teclado— sigue en la Fase 4.

Ninguna toca el alcance del sprint ni el plan de la casa planeadora.
