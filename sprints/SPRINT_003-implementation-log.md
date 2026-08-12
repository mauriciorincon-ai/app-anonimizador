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

## Fase 1 — La bóveda, y su medición ANTES de la UI

Dos archivos nuevos, y la frontera entre ellos **es** la decisión:

| Archivo | Qué hace | Por qué ahí |
|---|---|---|
| `src/engine/boveda.ts` | construye, serializa, deserializa, huella, consultas | puro y síncrono: el gate de determinismo barre `src/engine/**` |
| `src/lib/boveda-archivo.ts` | AES-GCM, PBKDF2, el azar, el formato `.velo` | es lo único que el motor tiene prohibido: azar y `async` |

Es la misma frontera que el S2 trazó con la llave HMAC, y no una organización de carpetas: el motor
recibe lo derivado, nunca lo genera.

### Tres decisiones que no venían en el plan

**1. Arreglos paralelos, no un arreglo de objetos.** `seudonimos[i]` volvió de `originales[i]`, como
la tabla columnar hace con `valores` y `codigos`. El plan estimaba ~50 B por par y ~24 MB en el peor
caso; medido son **26 B por par y 11,64 MB** — la mitad, porque un arreglo de objetos repetiría dos
nombres de clave 446.006 veces. Y la colisión sale gratis: **no es una excepción del formato, es una
entrada con dos originales.**

**2. Las iteraciones de PBKDF2 viajan DENTRO del `.velo`** (cuatro bytes en la cabecera). Si el
número viviera solo en el código, endurecerlo el año que viene volvería ilegible toda bóveda sellada
antes — y una bóveda que deja de abrirse es la pérdida total que el producto existe para evitar. Con
la consecuencia atendida: la cabecera va en claro, así que un `.velo` manipulado puede pedir cuatro
mil millones de iteraciones y colgar la pestaña un cuarto de hora. **Tope de 5.000.000 comprobado
antes de derivar nada**, con su test que además cronometra que el rechazo es inmediato.

**3. La validación al deserializar es a mano, no con Zod.** La política son decenas de reglas y Zod
es la herramienta correcta ahí. Una bóveda son 446.006 pares: pasarlos por un esquema es una
validación por cadena con la maquinaria de issues y rutas detrás, sobre la única estructura del
producto que llega a medio millón de entradas. Lo que hay que comprobar son cuatro formas y un
paralelismo.

### La medición del peor caso

`MEDIR_BOVEDA=1 pnpm vitest run tests/unit/boveda-peor-caso.test.ts --coverage.enabled=false` —
se salta por defecto (tarda ~7 s y no verifica: mide). Columna `cedula_titular`, 500.000 filas del
generador seeded, por el camino real.

```
  valores distintos                  446006
  HMAC con formato (cedula)          3990 ms      ← Node; el número del navegador es el ADR-004
  colisiones de formato              100          ← teoría n²/2·10⁹ ≈ 99,5
  construirBoveda                    289 ms
  serializarBoveda                   117 ms
  tamaño en claro                    11.64 MB
  huellaDeBoveda (SHA-256)           255 ms
  sellarBoveda (PBKDF2 + AES-GCM)    138 ms
  tamaño del .velo                   11.64 MB
  abrirBoveda                        123 ms
  gzip del claro (referencia)        3.78 MB (32 % del claro)
  heap usado al terminar             239.56 MB
```

**Cabe con holgura: no hay tope que declarar.** Y la teoría de colisiones cuadra con la medida al
0,5 % — 100 contra 99,5 predichas —, que es la confirmación de que la cifra que la UI va a enseñar
en la Fase 4 no es una estimación de servilleta.

**No se comprime**, aunque gzip deje el claro en un tercio. 11,6 MB ya cabe sin apretar, y comprimir
añade un paso cuyo modo de fallo —un flujo truncado— produce una bóveda ilegible, el peor desenlace
posible del producto. Queda medido: si algún caso lo necesita, la decisión se toma con la cifra.

### Lo que la medición desmintió (y obligó a corregir código del S2)

`src/lib/llave.ts` afirmaba: *«Tarda del orden de un segundo, y eso es lo que compra»*. Medido en
Chromium con `tests/medicion/cripto-en-el-navegador.mjs`:

```
PBKDF2-HMAC-SHA256 (ms por derivación, mediana de 3):
  600.000 iteraciones → 36 ms
  1.000.000 iteraciones → 61 ms
  2.000.000 iteraciones → 121 ms

AES-GCM 256:  cifrar 26 MB → 12 ms   ·   descifrar 26 MB → 10 ms
```

**36 ms, no un segundo.** Tres consecuencias, en orden de importancia:

1. **La garantía es el número de iteraciones, no los segundos.** El tiempo varía un orden de
   magnitud entre un portátil y un teléfono de gama baja; por eso OWASP se expresa en iteraciones.
   Escribir el tiempo como si fuera la propiedad era escribir una cifra sin fuente.
2. **`ITERACIONES_PBKDF2` es una constante de COMPATIBILIDAD desde el S2, no un parámetro.** Subirla
   cambia la llave derivada de la misma frase y la misma sal, o sea **cambia todos los seudónimos**
   — que es romper C9 entre archivos de meses distintos. Endurecerla exige versión de llave y
   migración. Esto no estaba escrito en ningún sitio y era exactamente la clase de cosa que se
   descubre rompiéndole los cruces a alguien.
3. **Entrada para la Fase 5:** la orden describe un estado «derivando (tarda a propósito, y lo
   dice)». En esta máquina no hay espera perceptible. El costo deliberado es real —600.000
   iteraciones lo son—, pero una pantalla que prometa una espera que no ocurre es la misma mentira
   por composición de siempre. El copy se decide en la Fase 5 con este número delante.

AES-GCM, de paso, resultó irrelevante: 12 ms por 26 MB. El cifrado nunca iba a ser el problema.

### Verificación de la Fase 1

| Criterio del plan | Resultado |
|---|---|
| Round-trip serializar→cifrar→descifrar→deserializar con la misma huella | ✅ |
| El `.velo` no contiene un valor original en claro (barrido de bytes) | ✅ ni originales, ni seudónimos, ni nombres de columna |
| Dos serializaciones en claro son byte-idénticas | ✅ y el orden de llegada no cambia la huella |
| Dos sellados **sí** difieren, y ambos abren la misma bóveda | ✅ las dos mitades juntas, o la afirmación se lee mal |
| Medición del peor caso en la bitácora | ✅ arriba, con su script repetible |
| Cobertura >80 % | ✅ `engine/boveda.ts` 100 % stmts / 96,9 % ramas · `lib/boveda-archivo.ts` **100 / 100** |
| ADR | ✅ `decisions/006-la-boveda-archivo-no-base-de-datos.md` |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **574 pruebas verdes, 1 saltada** (la medición).

**El riesgo 2 del plan queda cubierto sin código nuevo:** `abrirBoveda` recibe **bytes, no un
`File`**. Como el gate de privacidad ya veta `.arrayBuffer()` y `new FileReader` fuera de
`src/workers/`, el único que puede convertir el archivo en bytes es el worker. La defensa es la
forma de la API, no una regla añadida.

**Sobre §5 de la auditoría (campos sin consumidor):** todos los campos de `Boveda` tienen lector hoy
—`version` y las tres identidades en `deserializarBoveda`, `huellaDeLlave` en `esDeLaMismaLlave`,
`columnas` en `indiceDeColumna`— **salvo `salDeLlave`**, cuyo consumidor real (volver a derivar la
llave HMAC) llega en la Fase 5. Se declara aquí en vez de descubrirlo en la auditoría: hoy lo lee su
test de round-trip, y si la Fase 5 no lo consume, sobra.

---

## Fase 2 — Seudonimización reversible

### El riesgo 5 se disolvió, no se pagó

El plan preveía extender `ResultadoDeSeudonimo` para que registrara la correspondencia, y avisaba
del precio: ese contrato ya lo tienen `tecnicas/index.ts`, `contrato.ts` y el balance. **No hizo
falta tocarlo.**

La correspondencia ya estaba ahí: `aplicarPolitica` tiene en la mano el diccionario de entrada
(`columna.valores`) y el de salida (lo que devuelve la técnica), **en paralelo y en el mismo orden**
— que es exactamente la forma que `construirBoveda` recibe. Guardar la correspondencia son tres
líneas y cero cambios de contrato:

```ts
if (esReversible(tecnica)) {
  correspondencias.push({
    columna: columna.nombre,
    originales: columna.valores,   // ANTES de reconstruir: después ya no existe
    seudonimos: resultado.valores,
  });
}
```

Que salga gratis es consecuencia de la forma que se eligió en la Fase 1 —arreglos paralelos— y no de
la suerte. Las colisiones también: `construirBoveda` agrupa por seudónimo, así que un seudónimo con
dos originales **se guarda con los dos** sin una sola rama especial.

`TablaTransformada` gana un campo, `correspondencias`, **sin identidad a propósito**: la huella de
la llave, su sal y el hash de la política son hechos de la sesión, no de la transformación. El motor
entrega el material; la bóveda se arma donde vive la identidad.

### El eje sin romper la identidad de las políticas del S2

`reversible` entra como **campo opcional**, no como `boolean` con default `false`. La diferencia no
es de estilo: la identidad de una política es el SHA-256 de su forma normalizada, y si el campo
apareciera como `false` en todas, **cambiaría el hash de todas las políticas del S2** — los reportes
ya emitidos dejarían de cuadrar con el mismo tratamiento repetido hoy.

- Ausente = irreversible. Es el default seguro y deja intacta la identidad anterior.
- `normalizarPolitica` convierte un `false` explícito en ausencia: dos formas de decir lo mismo, un
  solo hash.
- `true` **sí** cambia el hash, y debe: guardar la correspondencia es otro tratamiento.

Con su test: una política exportada por el S2 se importa, se comporta igual y **hashea igual**.

`requiereBoveda` vive en `politica.ts`, al lado de `requiereLlave` y por la misma razón medida en el
S2: es una pregunta que la UI necesita responder, e importarla de `tecnicas/index.ts` arrastraría el
motor entero al bundle. El gate de Lighthouse ya cobró eso una vez.

**`esReversible` solo admite las dos técnicas de seudónimo**, y no por limitación de versión:
enmascarar y generalizar **destruyen** información. `103***89` y `30-39` no vuelven ni con bóveda,
porque los dígitos que faltan no existen en ningún sitio. El seudónimo no destruye, sustituye.

### El fixture de colisión provocada

Perfil nuevo `colisiones-de-formato` en el generador seeded (`nit_empresa` + `cedula_titular` +
`sucursal`), con la aritmética escrita en el propio archivo: un seudónimo con formato de NIT cabe en
2×10⁸ valores, así que con n NITs distintos caben esperar n²/(2·2×10⁸) pares colisionados.

```
n = 20.000 → ~1 par     n = 60.000 → ~9 pares     n = 100.000 → ~25 pares
```

Con 60.000 filas la probabilidad de no ver ninguna colisión es de **una entre ocho mil**. Medido con
semilla 42 y llave fija: **5 colisiones sobre 59.988 seudónimos**. Cinco contra nueve no es un
defecto —con λ=9 un proceso de Poisson deja P(X≤5) ≈ 12 %—, y el test afirma `> 0` y no `= 5` a
propósito: el fixture garantiza que la ambigüedad **ocurre**, no cuántas veces, y clavar el número
lo volvería rojo ante cualquier retoque legítimo del generador.

Lo que el test verifica de verdad no es el conteo: es que el seudónimo colisionado **guarda sus dos
originales**. Elegir uno y callarse sería devolverle a alguien el dato de otra empresa.

### §4 — las frases que caducan (revisadas ahora, no en el cierre)

Tres frases dicen que el seudónimo es irreversible. **Ninguna es falsa todavía**: el eje existe en
el motor y la UI no lo ofrece, así que hoy un usuario no puede hacer nada reversible. Caducan en la
Fase 5, el día que la pantalla lo permita:

| Dónde | Qué dice | Qué pasa en la Fase 5 |
|---|---|---|
| `README.md:36` | «un seudónimo de hoy es irreversible, porque la bóveda llega en el S3» | falsa: la bóveda llegó |
| `docs/MANUAL-DE-USO.md:325` | «Hoy los seudónimos son irreversibles a propósito» | falsa por el mismo motivo |
| `src/components/editor-de-politica.tsx:57` | etiqueta «Seudónimo irreversible» | correcta, pero necesita su hermana reversible al lado |

Se dejan como están **a propósito**: cambiarlas hoy las volvería falsas en sentido contrario —
anunciarían una capacidad que el usuario todavía no tiene.

### Verificación de la Fase 2

| Criterio del plan | Resultado |
|---|---|
| Una columna reversible da el MISMO seudónimo que sin bóveda (regresión de C9) | ✅ valores y códigos idénticos, con y sin |
| La bóveda contiene su correspondencia completa | ✅ cada original del archivo se recupera desde su seudónimo |
| Un fixture con colisión provocada la registra con sus dos originales | ✅ perfil nuevo, 5 colisiones medidas |
| Cobertura >80 % | ✅ ver abajo |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **584 verdes, 1 saltada** — y entre ellas todas
las del S2 sobre hashes de política y determinismo de la transformación, que es la prueba de que la
compatibilidad se conservó.

**Declarado por §5:** `correspondencias` no tiene consumidor de producción hasta la Fase 5, cuando el
worker arme la bóveda con la identidad de la sesión. Hoy lo leen sus tests. Va escrito aquí, junto a
`salDeLlave` de la Fase 1, para que la auditoría los encuentre declarados y no huérfanos.

---
