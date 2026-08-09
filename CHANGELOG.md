# kit-app — CHANGELOG

> Las apps ya estampadas NO se actualizan solas: el delta relevante se anota en la orden de
> construcción de su siguiente sprint.

## v1.10.1 — 2026-08-09 (fix de estampado: la carnada del CHANGELOG bloqueaba el commit del kit)

Fuente: estampado de `anonimizador` (Velo) — el script murió en su propio gate: `gitleaks`
bloqueó el commit del kit por un secreto REAL en `CHANGELOG.md` línea 272, que llevaba la
carnada canónica **entera**. La regla v1.7.3 ("la carnada viaja PARTIDA") se aplicó al
`CLAUDE.md` del kit, pero **la entrada de changelog que documentaba esa misma decisión la
escribió completa** — y el CHANGELOG SÍ viaja a cada app estampada. Velo fue la primera app
estampada desde entonces y la primera en chocar. El gate funcionó exactamente como debe:
detectó un secreto real antes de que entrara a un repo público.

- **`CHANGELOG.md` (entrada v1.6.3): la carnada ahora viaja PARTIDA** (concatenación en tres
  piezas), igual que en `CLAUDE.md`.
- **Regla explícita (nueva):** **todo archivo del kit que se COPIE a un repo de app lleva la
  carnada PARTIDA.** Los que NO viajan —`README.md` y ambos estampadores (`.sh`/`.ps1`)— la
  llevan **entera a propósito**: son la instrucción que el usuario copia para probar el hook.
  Al escribir cualquier archivo nuevo del kit, preguntarse primero: *¿este archivo aterriza en
  el repo de una app?*
- Sin cambios de comportamiento. Desbloquea el estampado de Velo y de toda app futura.

## v1.10.0 — 2026-08-08 (molde BROCHURE v2: se produce, no se estampa — informe del piloto habla)

Fuente: `app-habla/sprints/ENTREGA-brochure-informe-planeadora.md` (+ summary + storyboard).
El piloto estampó el molde v1 fielmente — CI verde, Lighthouse 100 — y el usuario lo RECHAZÓ
(«hacia abajo todo mal»); el final fue sobresaliente («está espectacular») y la diferencia fue
MÉTODO. Diagnóstico: el v1 heredó la LEY del estudio CINE y ninguna de sus TÉCNICAS (13
patrones catalogados, el molde usaba 2) y saltaba la dramaturgia (la privacidad — la promesa
mayor — enterrada en un acordeón porque nadie preguntó cuál era el clímax). Dato duro: de 16
defectos, la CI vio 4; las capturas leídas como imagen, 12; el gate del usuario sumó 11
correcciones más; la verificación externa halló el mayor (la app entera tras el login de
Vercel). Las 7 adopciones de la § 5 del informe:

- **(1 · estructural) `BROCHURE.plantilla.html` → v2 — REGLA CERO: no se estampa, se
  PRODUCE.** Storyboard obligatorio con clímax explícito, ritmo, reduced-motion por escena,
  dial MOTION_INTENSITY fijado con el usuario, identidad en una frase y riesgo registrado —
  aprobado («guion aprobado») ANTES del HTML.
- **(2) `BROCHURE-banco-de-tecnicas.md` (NUEVO):** las recetas del estudio en vanilla listas
  para copiar — G3 (blur-to-focus, alzar/asentar con stagger jerárquico, dibujar el trazo,
  steps() boiling line, contador rAF, confeti determinista), G2 (visibility en el colapso,
  apertura anunciada, dirección del recorrido, anclaje medido), G1 serena (el motor Mostar en
  ~60 líneas: un rAF → variables CSS con lerp/smoothstep e inercia) + lo vetado con porqués +
  esqueleto del storyboard.
- **(3) Gate de capturas por bloque** leídas como imagen (cuadro a cuadro en animaciones)
  antes de presentar al usuario — cazó 12 de 16.
- **(4) e2e obligatorio de reduced-motion** (visibilidad real de elementos clave): el hero
  invisible pasó 12 e2e y Lighthouse 100/100 sin él.
- **(5) Checklist de sala de proyección en el molde**, con la frase «la CI estuvo verde con
  un entregable rechazado» — verde no es bueno; fidelidad al producto real como criterio.
- **(6) Checklist de última milla:** el link de producción se prueba SIN sesión
  (curl/incógnito); dominio + protección de deployment documentados en el BLUEPRINT.
- **(7) Correcciones puntuales al molde:** `visibility` en la transición del acordeón (el
  lector de pantalla recitaba las 24 features "cerradas"; axe no lo ve) · LCP jamás desde
  `opacity: 0` (el h1 sube pintado; el fundido va a la línea de apoyo) · patrón canónico
  `<h3><button>` (el v1 anidaba al revés: HTML inválido) · icono del design system, no
  `[EMOJI]` · tabla de mapeo como evidencia del conteo N · trade-off de webfonts declarado
  (Georgia + system-ui) · nota `data-tema` (el brochure sigue al sistema, no al selector de
  la app) · presupuesto de scroll móvil (~1 pantalla).
- Transversal (al método v1.11.0): **lo medible se corrige midiendo contra la versión
  anterior** (el salto del piloto: 1291px → 119px — «creo que mejoró» es una opinión).

## v1.9.0 — 2026-08-07 (Brochure vivo: el anti-manual como entregable estándar)

Fuente: directiva del usuario — enviar Hablemos San a la mamá de su hijo (que odia los
manuales) exige una presentación de la app "de lo general a lo particular" que se consulte
como página web; y ese formato se vuelve el brochure de TODAS las apps y el contenido de la
vitrina de hoja-de-vida (H2). Decisión de arquitectura sellada: **el brochure se construye
en la casa de desarrollo de cada app** (contenido = sus features reales; entrega = ruta
pública de la app desplegada); la planeadora fabrica el molde; el Estudio CINE
(`hr03-estudio-cine`, RO) presta el ADN visual, no la fábrica. Aprobado 2026-08-07.

- **`docs/BROCHURE.plantilla.html` (NUEVO):** molde autocontenido con 10 reglas en cabecera.
  4 capas de progressive disclosure (promesa → tarjetas → detalle por tarjeta → lo fino);
  regla de conteo contra el MANUAL-DE-USO (agrupar sí, omitir jamás); ADN CINE adaptado a
  documento: G3 entrada coreografiada (IntersectionObserver + stagger CSS) y G2 transición
  de estado al abrir capas — G1 scroll-scrubbed excluida a propósito (pesa demasiado para
  un brochure); solo `transform`/`opacity` (excepción declarada: grid-rows en expansión);
  `prefers-reduced-motion` = experiencia alterna completa; mobile-first; a11y (botones con
  aria-expanded, contenido real en DOM); tokens neutros que se REEMPLAZAN por el
  design-system de la app.
- **`CLAUDE.md` regla 13 (nueva; la anterior 13 pasa a 14):** brochure vivo obligatorio con
  doble vida (ruta `/conoce` + `docs/BROCHURE.html`), actualización en el mismo sprint que
  cambia features, cero datos personales.
- Primera implementación: app-habla (orden puntual de la planeadora, decisión F0 puntual
  2026-08-07). La vitrina de hoja-de-vida consumirá los brochures de las 5 apps (H2, se
  agenda en el checkpoint F0).

## v1.8.2 — 2026-08-07 (cosecha del primer ciclo completo: gate ⭐ de habla S4)

Fuente: retrospectiva del cierre de habla S4 — primer ciclo H1 completo del portafolio. Las dos
primeras reglas nacieron de fricciones REALES del gate del usuario (una semana de sesiones por
bloques); la tercera consolida el peaje de subir a React 19. Aprobado 2026-08-07 (propuesta
chat-only, método v1.10.0).

- **`docs/GUIA-DE-PRUEBA.html` (plantilla), regla 8 — "Empieza en:" por bloque:** la meta-línea
  de CADA bloque abre con la ruta exacta donde arranca su primera prueba (`Empieza en: /jugar`),
  con la convención explicada una vez en la caja de la URL. El probador jamás deduce desde dónde
  parte un bloque. Aplicada en la anatomía de ejemplo (bloques A y B).
- **`docs/GUIA-DE-PRUEBA.html` (plantilla), regla 9 — los acumulados declaran su punto de
  partida:** toda prueba que observa un acumulado (mínimo/máximo/contador/racha) dice en su
  "Esperado" desde qué estado se parte ("reinicia la sesión y…"). Origen: la prueba A6 de habla
  pedía ver subir un mínimo corrido dentro de la misma sesión — un imposible del instrumento.
- **Skill `testing-patterns` § React 19 + linter estricto (NUEVA):** (1) cargar storage al
  montar con `useSyncExternalStore`, no `setState` dentro de `useEffect` (lint + flash del valor
  por defecto); (2) un ref que se lee en render pasa a estado (mutar el ref no re-renderiza —
  bug latente que el linter de React 19 ahora atrapa).

## v1.8.1 — 2026-07-20 (keep-alive de Supabase free estampado de fábrica)

Fuente: correo de Supabase avisando pausa por inactividad de `app-inmobiliaria` (2026-07-20).
Aprobado el mismo día. Diagnóstico: el keep-alive existía y corría verde, pero su cadencia
**semanal** no deja margen contra el umbral de 7 días y los crons de GitHub se retrasan horas
(la corrida del día salió 7 h tarde). Hermano no cubierto: hoja-de-vida S4 creó su proyecto
Supabase **sin** keep-alive.

- **`docs/supabase-keep-alive.plantilla.yml` (NUEVO):** workflow listo para copiar a
  `.github/workflows/supabase-ping.yml` + la migración compañera `ping()` (función `stable`
  que no toca tablas, `execute` solo a `anon`). **Cadencia lunes y jueves**, `curl -f`
  obligatorio, y la guarda de secrets faltantes ahora **FALLA** (`exit 1`) en vez de dar el
  falso verde que teníamos. Es plantilla y no workflow activo a propósito: una app sin
  Supabase tendría un cron corriendo en vacío y viéndose verde.
- **`docs/APROVISIONAMIENTO.plantilla.md`:** bloque obligatorio "si el servicio es Supabase
  free" — migración + workflow + secrets [TÚ] + **verificación en vivo** (corrida disparada a
  mano con 2xx real), y las dos trampas de segundo orden (GitHub deshabilita crons de repos
  quietos 60 días; el Pro se evalúa en G-Release, no antes).
- **Skill `testing-patterns` § e2e-BD-real, regla 0:** la CI corre contra Postgres LOCAL — el
  proyecto cloud no recibe actividad de ella; el keep-alive es parte del sprint que
  aprovisiona.
- **Plantilla ORDEN (planeadora):** bloque obligatorio en § Aprovisionamiento cuando el
  sprint crea un proyecto Supabase.
- Patrón completo: `wiki/patterns/supabase-en-ci-y-cloud.md` § 5ª fricción.

## v1.8.0 — 2026-07-20 (G-Metodo "Proceso v2": gates de FASE + /audita-sprint obligatoria)

Fuente: 4 directivas directas del usuario al concluir la construcción de la cola F0 #6.
Aprobado 2026-07-20 (propuesta chat/archivo temporal, borrado al aplicar — método v1.10.0).

- **Gates de FASE (`plan-sprint` paso 9 + CLAUDE.md + plantilla ORDEN):** al terminar CADA
  fase del plan, el builder SE DETIENE, entrega el resumen completo de la fase (qué se
  construyó, archivos, tests y resultados, criterio de fase completa, desviaciones) y espera
  el «continúa» explícito del usuario — cada pausa es un punto de decisión de
  modelo/esfuerzo (`/model`).
- **Comando NUEVO `/audita-sprint` (auditoría final de dos fases — OBLIGATORIA, método
  v1.10.0):** al concluir la construcción, antes de la guía/gate ⭐ y del cierre. Fase 1
  solo-lectura (cobertura de alcance ítem por ítem con archivos y líneas · calidad ·
  dependencias · severidades Crítico/Alto/Medio/Bajo · veredicto "listo para cierre" /
  "requiere ajustes"). **Regla de modelos: el poderoso audita y PLANEA — deja cada ajuste
  tan bien definido (archivo, línea, cambio exacto, criterio de verificación) que CUALQUIER
  modelo de menor capacidad ejecuta la Fase 2 de la mejor manera.** Fase 2 solo tras
  aprobación del usuario. El summary registra hallazgos y pagos; sin auditoría, el cierre
  queda condicionado (lo verifica `/cierre-sprint`).
- `arquitectura/matriz-modelos.html` (planeadora) actualizada: fila `/audita-sprint` + "los
  dos relojes de cambio de modelo".

## v1.7.5 — 2026-07-20 (G-Metodo del cierre nutri-kids S2: salida efímera de primera clase + puntas AI SDK v7)

Fuente: `sprints/SPRINT_002-summary.md` de app-nutri-kids (§ Estándar 7 — adaptación, § K9).
Aprobado en bloque 2026-07-20 — detalle en
`entrega/2026-07-20-propuesta-gmetodo-cierre-nutri-kids-s2.md`.

- **Skill `ia-embebida` § 2 — variante de salida efímera de PRIMERA CLASE:** cuando la
  privacidad manda no persistir la salida LLM, `schemas.ts`/`persist.ts` no aplican por
  diseño y el checklist se sustituye (no-persistencia por e2e · logs solo-metadatos con
  término plantado · minimización en ADR). Dos apps la declaraban como desviación
  (hoja-de-vida S3, nutri-kids S2) — se estandariza.
- **Nota "AI SDK v7 — puntas afiladas verificadas":** 5 quirks consolidados que cobraron una
  iteración cada uno en dos apps (`convertToModelMessages` async · `stream-start` primer
  chunk · tipos no exportados · `onError` en `toUIMessageStream` · `finishReason` objeto).
- **Checklist del sprint** con la alternativa efímera. K8 (lighthouse-urls.json) verificado
  YA RESUELTO — se estampa desde v1.2.0.

## v1.7.4 — 2026-07-20 (G-Metodo del cierre hoja-de-vida S3: humo de credenciales + mock de primera clase)

Fuente: `sprints/SPRINT_003-summary.md` de app-hoja-de-vida (§ Bugs, § Sugerencias).
Aprobado en bloque 2026-07-20 — detalle en
`entrega/2026-07-20-propuesta-gmetodo-cierre-hoja-de-vida-s3.md`.

- **Plantilla ORDEN § Aprovisionamiento — columna "Humo (≤1 min)":** toda credencial
  aprovisionada viaja con su comando de validación; el builder lo corre en la fase 0 y el
  checklist re-emitido al abrir el PR lo repite si la credencial cambió (la GROQ_API_KEY
  inválida de hoja-de-vida S3 se descubrió en la integración, no el día 0).
- **`plan-sprint` fase 0:** exige el humo de credenciales ANTES de la fase 1 (cinturón lado
  builder aunque la orden sea vieja).
- **Skill `ia-embebida` § 7:** el humo del proveedor real es día 0 (un 401 en integración es
  fallo de proceso). **§ 8 nueva — "el mock es un proveedor de primera clase":** dentro del
  adapter, jamás intercept de red; excepción solo para forzar caminos de error. Dos apps
  (hoja-de-vida, nutri-kids) convergieron por separado → se estandariza. Patrón wiki:
  `mock-como-proveedor-de-primera-clase`.

## v1.7.3 — 2026-07-19 (G-Metodo del cierre habla S3: regla 9 + riesgos de integración + carnada partida)

Fuente: `sprints/SPRINT_003-summary.md` de app-habla (§ Fricción, § Aprendizajes, § Remate).
Aprobado en bloque 2026-07-19 — detalle en `entrega/2026-07-19-propuesta-gmetodo-cierre-habla-s3.md`.

- **Skill `testing-patterns` regla 9:** pantalla ya cubierta por e2e ⇒ su suite ENTERA corre en
  la misma fase que la toca (F2a de habla S3 dejó un e2e aseverando "exactamente 3 juegos").
- **`plan-sprint` paso 4 ampliado:** el plan incluye SIEMPRE la sección "Riesgos de integración
  con lo existente" — leer el código de las features que la nueva toca (el riesgo nº 1 de habla
  S3, el bucle parlante→mic, no estaba en la orden).
- **CLAUDE.md regla 7 — carnada PARTIDA:** la carnada canónica viaja partida en la plantilla
  (armarla solo en el archivo de prueba) — estandariza las 2 soluciones ad-hoc (allowlist de
  inmobiliaria S2 · partida manual de habla S3). El hook debe seguir detectando la carnada
  ARMADA.
- **Fuera del kit (mismo batch):** método → v1.9.1 — cuando el gate ⭐ se difiere, se
  RECOMIENDA el remate de auditoría de dos fases antes del merge (práctica inventada por el
  usuario en habla S3; cazó un defecto S2 latente). Plantilla ORDEN: línea del remate.

## v1.7.2 — 2026-07-18 (G-Metodo del cierre inmobiliaria S2: testing-patterns ×3 + Lighthouse solo páginas públicas)

Fuente: `sprints/SPRINT_002-summary.md` de app-inmobiliaria (K7–K10). Aprobado en bloque
2026-07-18 — detalle en `entrega/2026-07-18-propuesta-gmetodo-cierre-inmobiliaria-s2.md`.

- **Skill `testing-patterns` — 3 reglas anti-flakiness nuevas (6–8):** specs de Playwright se
  transpilan a CommonJS (nada de `import.meta.url`; paths desde `process.cwd()`) ·
  `getByRole("alert")` desnudo choca con el `__next-route-announcer__` de App Router · checkbox
  controlado async → `.click()` + aseverar el resultado observable, no `.check()`.
- **README regla 5 — compromiso devtools CERRADO CON VEREDICTO (4º caso Lantern):**
  `throttlingMethod: devtools` DESCARTADO en runners compartidos (K8-bis: infló más). Regla
  vigente: **la auditoría Lighthouse de CI cubre SOLO páginas públicas**; privadas/noindex/
  hidratadas se excluyen documentadamente y su LCP real va al gate ⭐. `budgetsFile` no permite
  umbral por-path. Patrón: `wiki/patterns/lighthouse-solo-paginas-publicas.md`.
- **Fuera del kit (mismo batch):** método → v1.9.0 (figura "gate ⭐ diferido al cierre de
  ciclo") + plantilla ORDEN (línea del gate ⭐ acumulado).

## v1.7.1 — 2026-07-18 (ajuste del usuario: blueprint POR APP en HTML autocontenido + SVG)

Fuente: directiva directa del usuario (2026-07-18) corrigiendo el formato del entregable v1.7.0.
Detalle en `entrega/2026-07-18-propuesta-f0-6-mvps-en-orden-inverso.md` § A.

- **`docs/BLUEPRINT.plantilla.html` (reemplaza a `BLUEPRINT.plantilla.md`):** el blueprint
  as-built pasa a **HTML autocontenido con diagrama SVG embebido** (cero CDNs, cero mermaid) —
  el usuario lo quiere abrible en navegador y **bien definido por proyecto**, no en vistas
  agregadas de portafolio (la vista conjunta del 2026-07-17 queda como foto puntual, no se
  mantiene). El entregable de cierre de ciclo es ahora `docs/BLUEPRINT.html` en el repo de cada
  app (CLAUDE.md del kit, plantillas ORDEN/SPRINT y skill `/sprint` actualizados).
- **Fuera del kit (mismo ajuste):** método → v1.8.1 — redacción del escalado suavizada ("el
  escalado prioriza el software determinista; la IA es importante pero no la prioridad" — la
  frase "jamás metiendo IA" sobre-endurecía la intención del usuario).

## v1.7.0 — 2026-07-17 (G-Metodo "ciclos y cierres": BLUEPRINT + Claude Design al cierre de ciclo)

Fuente: 4 directivas directas del usuario (2026-07-17) tras el cierre del S1 de Innmobiliaria.
Aprobado en bloque — detalle en `entrega/2026-07-17-propuesta-gmetodo-ciclos-y-cierres.md`.

- **`docs/BLUEPRINT.plantilla.md` (nuevo):** as-built de infraestructura — entregable OBLIGATORIO
  del cierre de ciclo (diagrama mermaid + tabla por pieza + costo real/mes + punto único de
  falla); vivo y acumulativo entre ciclos. Vista de portafolio en la planeadora
  (`entrega/2026-07-17-blueprint-infraestructura-portafolio.md`, v1).
- **CLAUDE.md — bloque "Cierre de CICLO"** en el workflow: blueprint + design system publicado
  en Claude Design (`/design-sync`) cuando el sprint es el último del ciclo; todo ciclo tiene
  MÍNIMO 3 sprints (regla dura).
- **CLAUDE.md regla 10:** Claude Design sigue BAJO DEMANDA durante el ciclo, pero la PUBLICACIÓN
  del design system consolidado al cierre del ciclo es obligatoria.
- **Fuera del kit (mismo batch):** método → v1.8.0 (escalado por defecto condicional · ciclo ≥3
  sprints · cierres de ciclo) · skill `/sprint` · plantillas ORDEN/SPRINT · brief de inmobiliaria
  reestructurado (fase 1 = ciclo de 3). Retro-aplicación: las 4 apps con historia generan su
  blueprint retroactivo + design-sync en su próxima orden.

## v1.6.4 — 2026-07-17 (G-Metodo del cierre inmobiliaria S1: Supabase-en-CI + runbook + 3er caso Lantern)

Fuente: `sprints/SPRINT_001-{summary,retrospectiva}.md` de app-inmobiliaria (primer sprint del
pipeline con Postgres real en CI y primer S1 que cierra desplegado). Aprobado en bloque
2026-07-17 — detalle en `entrega/2026-07-17-propuesta-gmetodo-cierre-inmobiliaria-s1.md`.

- **Skill `testing-patterns` — sección "e2e con BD real (Supabase) en CI":** los 4 quirks
  pagados (K3–K6: comillas de `status -o env` · `stdout: "pipe"` de Playwright · GRANTs/REVOKEs
  explícitos en la migración, doblemente invisibles con RPC `SECURITY DEFINER` · rate limit
  apagado solo en CI con test a nivel RPC) + strict-mode con datos por-proyecto + nube temprana
  sin Docker. Patrón: `wiki/patterns/supabase-en-ci-y-cloud.md`.
- **`docs/APROVISIONAMIENTO.plantilla.md` (nuevo):** runbook [TÚ]/[CLAUDE] — división explícita
  dueño-de-cuentas/agente, verificación en vivo por bloque, regla de identidad (SSO satélite vs.
  credencial de primera mano + 2FA para la casa de la infraestructura).
- **README regla 5:** 3er caso Lantern REGISTRADO (inmobiliaria S1) ⇒ evaluación
  `throttlingMethod: devtools` COMPROMETIDA como spike en el próximo gate Lighthouse rojo.
- **Fuera del kit (mismo batch):** método v1.7.0 (figura "base declarada" en F1) · skill
  `/sprint` de la planeadora (condiciones para escalar el alcance de un S1) · plantilla ORDEN
  (nube temprana sin Docker).

## v1.6.3 — 2026-07-15 (G-Metodo: carnada canónica VERIFICADA para la prueba del hook gitleaks)

Fuente: estampado de inmobiliaria — la instrucción "prueba el hook con un secreto falso" sin
carnada especificada produjo DOS falsos "todo bien" seguidos (`AKIAZZZZ…` no pasa la entropía;
`AKIA…9…` viola el alfabeto base32 de la regla `aws-access-token`; hasta la llave de ejemplo de
AWS docs está exenta). La carnada correcta se halló probando 4 candidatas contra el gitleaks
local (8.30.1) en sandbox. Aprobado en bloque 2026-07-15 — detalle en
`entrega/2026-07-15-propuesta-gmetodo-carnada-canonica-gitleaks.md`.

- **Carnada canónica del pipeline** (inventada; dispara `aws-access-token`) — desde v1.10.1
  viaja **PARTIDA en este archivo**: ármala concatenando `AWS_ACCESS_KEY_ID=` + `AKIAQ7RTZ4PX`
  + `KM2WNB3S`. Escrita en: CLAUDE.md regla 7 · README § Estampado · mensaje
  final de AMBOS estampadores (`.sh`/`.ps1`, paridad) · plantilla ORDEN § Verificación de
  supuestos (las apps ya estampadas la reciben vía sus próximas órdenes, patrón v1.6.2).
- **Regla nueva:** toda carnada se verifica contra el gitleaks VIGENTE en sandbox antes de
  entrar al kit — nunca se receta de memoria; re-verificar al subir gitleaks de versión mayor.

## v1.6.2 — 2026-07-13 (G-Metodo: gate de arranque — aprobar el plan ≠ arrancar la construcción)

Fuente: fricción reportada por el usuario al preparar el arranque del S1 de Innmobiliaria — la
aprobación del plan en plan mode disparaba la construcción de inmediato, sin espacio para fijar
modelo/esfuerzo (`/model`) ni ajustes finales. Aprobado en bloque 2026-07-13 — detalle en
`entrega/2026-07-13-propuesta-gmetodo-gate-de-arranque.md`.

- **Command `plan-sprint` — paso 7 dividido en 7+8:** la aprobación del plan significa SOLO "el
  plan es correcto"; el paso 8 es el **gate de arranque**: bloque con recomendación de modelo y
  esfuerzo para el sprint (por fase si difiere) + recordatorio `/model` + espera de la palabra
  explícita **«construye»**. Prohibido crear/editar archivos antes.
- **CLAUDE.md § Workflow (Apertura):** regla espejo (aplica aunque el builder no entre por la
  skill).
- **Fuera del kit (mismo batch):** `portafolio/_template/ordenes/ORDEN.md` § Prompt de arranque
  declara el contrato en el prompt pegable — así el gate opera TAMBIÉN en las apps ya estampadas
  (el contrato viaja en cada orden nueva); enmienda en vuelo a la orden S1 de inmobiliaria.

## v1.6.1 — 2026-07-12 (G-Metodo del cierre habla S2: la CI verifica el comportamiento, no la experiencia)

Fuente: `sprints/SPRINT_002-summary.md` de app-habla (§ EL GATE DEL USUARIO: 4 defectos que 187
tests no vieron, todos de la misma familia). Aprobado en bloque por el usuario 2026-07-12 —
detalle en `entrega/2026-07-12-propuesta-gmetodo-cierre-habla-s2.md`; patrón completo en
`wiki/patterns/la-ci-verifica-comportamiento-no-experiencia.md`.

- **Skill `testing-patterns` — 3 reglas anti-"comportamiento sin experiencia":** (1) por cada
  pantalla, ≥1 e2e llega POR LA UI, no solo por `goto(url)`; (2) todo copy que AFIRMA una
  métrica tiene test que confronta la frase con la definición de la métrica; (3) los fixtures
  sintéticos incluyen casos FUERA del rango que el código asume (el test no puede validar el
  supuesto que comparte con el código).
- **Command `deploy-check`:** Lighthouse a mano es `npx @lhci/cli` — `npx lhci` a secas es un
  paquete impostor del registry.
- **CLAUDE.md regla 11:** referencia de implementación de la guía acumulativa →
  `app-habla/docs/GUIA-DE-PRUEBA.html` (S2).
- **Fuera del kit (mismo batch):** header de `estandares/estandares.md` alineado a v2.2.0
  (K-habla-5: la cita fija envejece).

## v1.6.0 — 2026-07-12 (G-Metodo: guía ACUMULATIVA + código primero + kit de prueba — directiva del usuario)

Fuente: directiva del usuario 2026-07-12, detectada construyendo habla S2 (una guía comprimida
despachaba con "todo como antes" un juego cuyo motor cambió por dentro — el gate habría pasado
sin probarlo). Detalle: `entrega/2026-07-12-propuesta-gmetodo-guia-acumulativa-y-codigo-primero.md`.

- **`docs/GUIA-DE-PRUEBA.html` REESCRITA — de "viva" a "viva y ACUMULATIVA" (bola de nieve):**
  la última versión contiene TODAS las pruebas vigentes; el sprint N hereda ENTERAS las del N−1
  (jamás "verificar que sigue funcionando"). Cada prueba lleva su **origen en su línea** —
  `Nuevo · SN` · `Mejorado en SN` · `SN` (heredada ⇒ regresión) — con **filtros** (Todo · Lo que
  cambió · **Gate mínimo ⭐**). El gate mínimo tiene criterio FIJO: solo lo que ninguna
  automatización puede verificar (hardware/mic/voz reales, juicio sobre contenido, aprobación
  visual); lo que la CI respalda queda fuera. **Namespace de `localStorage` versionado por
  sprint** (una regresión sin correr no aparece marcada por el sprint anterior). Historial de la
  guía en el pie (pruebas eliminadas solo con feature muerta, declaradas). Callout **kit de
  prueba** (`docs/kit-de-prueba/`).
- **CLAUDE.md del kit — regla 11 reescrita** (todo lo anterior) **+ regla 13 nueva: código
  primero, IA generativa después** — toda funcionalidad nativa interna se resuelve con
  programación (código/librerías/algoritmos) antes de acudir a IA generativa; feature LLM exige
  ADR "código primero"; la IA es acento con fallback, jamás columna vertebral.
- **Fuera del kit (mismo batch):** `estandares/estandares.md` v2.2 (DoD + precondición código
  primero en el estándar 7) · `metodo/metodo.md` v1.6.0 · `CLAUDE.md` de la planeadora
  (principios 6 y 7) · plantillas ORDEN y SPRINT · **enmienda en vuelo a la orden del S2 de
  habla** (sprint abierto — el caso que parió la regla).
- **Delta para ds/nutri-kids/hoja-de-vida:** su primera `GUIA-DE-PRUEBA.html` nace acumulativa
  con esta plantilla (va en la orden de su próximo sprint con UI).

## v1.5.1 — 2026-07-12 (G-Metodo del cierre habla S1: el kit contra su primer estampado del stack nuevo)

Fuente: `sprints/SPRINT_001-{summary,implementation-log}.md` de app-habla (K-habla-1..4, todo con
números). Aprobado en bloque por el usuario 2026-07-12 — detalle en
`entrega/2026-07-12-propuesta-gmetodo-cierre-habla-s1.md`.

- **perf-budget.json:** script **300→350 KB** — el framework solo (Next 16 + React 19) pesa
  ~246 KB gz; 300 era una multa a la primera feature (habla se rompió con 1,1 KB propios).
  TBT/LCP/CLS intactos como guardias reales.
- **README regla 5:** sesgo Lantern MEDIDO (LCP real 24 ms vs Lantern ~3380 ms) + criterio de
  renegociación por ADR (precedente ×2) + `throttlingMethod: devtools` como opción si hay 3er caso.
- **vitest.config.ts:** el umbral 80% de motores cubre `src/{engine,lib}/**` + advertencia de
  ajustar el glob al layout de CADA app en la verificación del kit (K-habla-1).
- **Skills `accessibility-wcag` + `diseno-ui`:** regla "el gate recorre TODAS las paletas"
  (el axe mono-tema de habla dejó pasar un 3.1:1 en modo oscuro).
- **Plantilla ORDEN (planeadora):** la versión del kit se cita como la vigente al estampar
  (K-habla-2: la orden decía v1.3.1, el estampado real fue v1.4.0).

## v1.5.0 — 2026-07-12 (G-Metodo: dos reglas duras de ENTREGABLES — directiva del usuario)

Fuente: directiva del usuario 2026-07-12, **ya aplicada y validada en app-habla S1** (su CLAUDE.md
reglas 10–11 + `docs/GUIA-DE-PRUEBA.html`). Detalle:
`entrega/2026-07-12-propuesta-gmetodo-entregables.md`.

- **`docs/GUIA-DE-PRUEBA.html` (NUEVO en el kit):** plantilla de la **guía de prueba viva** —
  entregable **estándar de todo sprint con UI**. HTML **autocontenido** (cero CDNs, cero
  dependencias; casillas persistidas en `localStorage`; modo claro/oscuro), organizada por
  **bloques** con *qué probar · cómo · qué resultado esperar*, tabla de valores correctos y
  callout "repórtame sí o sí". **Viva, no acumulativa:** cada sprint agrega lo nuevo, complementa
  y **elimina lo que ya no aplica**. Doble propósito: gate de prueba del usuario + entregable a
  usuarios finales. Referencia de implementación: `app-habla/docs/GUIA-DE-PRUEBA.html` (S1).
- **CLAUDE.md del kit — regla 11:** la guía de prueba viva es obligatoria en todo sprint con UI.
- **CLAUDE.md del kit — regla 12:** **PROHIBIDO entregar por artifacts de Claude o cualquier
  plataforma externa.** Todo entregable (guías, reportes, documentos visuales) es un **archivo del
  repo** —HTML autocontenido o Markdown— que el usuario pueda abrir, versionar y llevarse. Sin
  excepciones, ni "para verlo rápido".
- **Fuera del kit (mismo batch):** `estandares/estandares.md` → DoD + regla de entregables (v2.1);
  plantillas de orden y de sprint de la planeadora; `CLAUDE.md` de la planeadora.
- **Delta para las 3 apps ya estampadas** (ds, nutri-kids, hoja-de-vida): se anota en la orden de
  su próximo sprint (política del kit) — la primera vez que toquen UI deben crear su
  `GUIA-DE-PRUEBA.html`. app-habla ya la tiene.

## v1.4.0 — 2026-07-11 (G-Metodo del `/nueva-app habla`: estampado en macOS)

Fuente: primer `/nueva-app` corrido en el Mac (habla). El script canónico era Windows-only
(`estampar-app.ps1`, rutas `C:\Code\`) — las 3 apps previas se estamparon en Windows antes de la
migración (2026-07-10). Aprobado en G-Metodo por el usuario 2026-07-11 — detalle en
`entrega/2026-07-11-propuesta-gmetodo-estampado-macos.md`.

- **`estampar-app.sh` (nuevo):** puerto fiel del `.ps1` a bash (macOS/Linux) — misma secuencia y
  mismas lecciones (allowBuilds de pnpm 11, exit-code por paso vía `set -euo pipefail`, hook
  100755 en el índice K12, `prepare` self-healing, ruleset con checks día 0). Usa `jq` para editar
  `package.json` y `rsync` para copiar el kit. **Vía vigente del pipeline** (el `.ps1` queda para
  la estación Windows de respaldo hr02).
- **Mejora incorporada al flujo (ambos scripts la tendrán; el `.sh` ya):** el estampado escribe
  `.claude/settings.local.json` con `additionalDirectories=[<planeadora>]` — **conexión fija a la
  planeadora automatizada** (antes era paso manual del reporte final; memoria `arranque-app-en-vscode`).
- **`gitignore.plantilla`:** añade `.claude/settings.local.json` — cierra el fleco de la migración
  (app-ds lo tenía a mano; el kit no) para que toda app futura nazca protegida en cualquier máquina.
- **README:** sección de estampado con las dos vías (mac/win) + nota de paridad de scripts.
- **Deuda declarada:** el `.ps1` no recibió aún el paso de `settings.local.json` (divergencia
  anotada; se salda cuando toque estampar en Windows).
- **✅ VALIDADO en el estampado de habla (2026-07-11):** los 10 pasos pasaron sin una sola
  fricción a la primera (Next 16.2.10; commit inicial escaneado por gitleaks — hook vivo K12;
  repo público + ruleset día 0; 46 archivos, cero datos; `settings.local.json` gitignored y no
  pusheado). El puerto macOS queda confirmado ×1.

## v1.3.1 — 2026-07-11 (G-Metodo del cierre S3 ds: K12 — el hook nace ejecutable)

Fuente: `sprints/SPRINT_003-{summary,implementation-log}.md` de app-ds. El gate local de
gitleaks nunca corrió en S1–S3 (hook estampado 100644 — git ignora hooks no ejecutables EN
SILENCIO — y `core.hooksPath` por-clon perdido en los re-clones de la migración al Mac; las 3
apps afectadas, ds pagada en su S3). Aprobado en bloque por el usuario 2026-07-11 — detalle en
`entrega/2026-07-11-propuesta-gmetodo-cierre-ds-s3.md`.

- **githooks/pre-commit:** commiteado **100755** en el kit (`update-index --chmod=+x`) — todo
  estampado futuro copia un hook ya ejecutable.
- **estampar-app.ps1:** §5 inyecta script **`prepare`** = `git config core.hooksPath githooks`
  (self-healing en cada `pnpm install`, sobrevive re-clones); §6 `update-index --chmod=+x` tras
  el add (blinda el modo aunque el host sea Windows).
- **README/CLAUDE.md (regla 7):** hook 100755 + prepare + verificación "si un secreto de prueba
  no es bloqueado, el gate está muerto".
- **Plantilla de orden (planeadora):** el kit-check exige hooks ejecutables y **ACTIVOS**, no
  solo presentes.
- Apps existentes: fix manual por repo (4 comandos, sección 6 de la propuesta) — ds ✅ (S3);
  hoja-de-vida y nutri-kids pendientes del usuario.

## v1.3.0 — 2026-07-10 (G-Metodo: protección GitHub no negociable — checks requeridos día 0)

Fuente: directiva del usuario 2026-07-10 (aprobada en bloque) — detalle en
`entrega/2026-07-10-propuesta-gmetodo-mvp-dos-horizontes.md`.

- **estampar-app.ps1:** la ruleset `main-protegida` nace con la regla `required_status_checks`
  (`quality`/`e2e`/`lighthouse`, `strict: false`) — antes los checks quedaban "para después del
  primer CI verde" y ese después era un pendiente manual eterno. Echo final actualizado.
- **CLAUDE.md regla 6 + repo-app.md:** repo público (GitHub Free solo aplica rulesets en
  públicos) + checks requeridos desde el estampado; **si un sprint añade un job de CI (p. ej.
  `integration`), se añade a la ruleset en el mismo sprint**. Repo privado exigiría upgrade de
  plan por decisión F0 — la protección no se sacrifica.
- Las rulesets de las 3 apps existentes (hoja-de-vida, nutri-kids, ds) se corrigieron por API el
  mismo día (no esperan a su siguiente orden: es configuración de GitHub, no código del repo).

## v1.2.2 — 2026-07-10 (G-Metodo del cierre S2 ds: el estándar 7 tocó la realidad)

Fuente: `sprints/SPRINT_002-summary.md` de app-ds (estreno completo del estándar 7 + validación
contra Groq real). Aprobado en bloque por el usuario 2026-07-10 — detalle en
`entrega/2026-07-10-propuesta-gmetodo-cierre-ds-s2.md`. Solo reglas de skill; cero código nuevo.

- **`ia-embebida.md` §7 (nueva) — Contacto con la realidad:** validar el circuito con **key real
  ANTES del merge** del sprint que estrena/cambia proveedor (CI sigue en mock). Documenta las 5
  clases de fallo que solo el proveedor real muestra (structured outputs varía POR MODELO ·
  presupuestos de modelos de razonamiento · diacríticos vs matching literal · el LLM frasea lo
  que no conoce · varianza del Grader).
- **`ia-embebida.md` §6 (nueva) — El fallback SE ANUNCIA:** degradar nunca en silencio — motivo
  en cubetas honestas + reintento iniciado por el usuario, jamás retries automáticos.
- **`ia-embebida.md` §1:** schemas de ENTRADA de routes con **`.strict()`** (el default de Zod
  acepta-y-descarta en silencio) · en cliente, `schemas.ts` solo con **`import type`** (un import
  runtime mete zod al bundle y revienta el budget de la landing).
- **Checklist del sprint:** +3 ítems verificables por `/deploy-check` (proveedor real pre-merge ·
  fallback anunciado · strict/import-type).
- **`repo-app.md`:** bullet transversal `.strict()` en toda entrada de route (aplica más allá
  de IA).

## v1.2.1 — 2026-07-09 (G-Metodo del cierre S1 ds: Sentry promovido + fricciones K6–K12)

Fuente: `sprints/SPRINT_001-summary.md` de app-ds + estampado de ds. Aprobado por el usuario
2026-07-09 — detalle en `entrega/2026-07-09-propuesta-gmetodo-cierre-ds-s1.md`.

- **Sentry PROMOVIDO al kit (validado ×2: nutri-kids S1 + ds S1):** `instrumentation-client.ts`
  (client-only, metadata-only, **inerte sin `NEXT_PUBLIC_SENTRY_DSN`** — cero ruido en CI) +
  `src/lib/observability.ts` (`reportError`: tipos+metadatos, jamás mensajes crudos) +
  `.env.example`. El script instala `@sentry/nextjs` y deja el build script de `@sentry/cli`
  ignorado en `pnpm-workspace.yaml` (K12 — no subimos source maps). `observability.md`
  actualizado (antes decía "NO viene cableado"). Server-side por ADR cuando haya backend.
- **`vitest.config.ts` (K6/K8):** coverage `include` con `**/*.ts` (v8 tronaba parseando
  `.gitkeep`) + umbral **80% para `src/engine/**`** (regla 2 del CLAUDE.md, antes solo el piso 70).
- **K7 documentado como paso de setup:** el script `test` estampado sigue sin `--coverage` (CI
  verde día 0 sin tests); CLAUDE.md regla 2 y el comentario del config instruyen añadirlo al
  escribir los primeros tests. K9/K10 (eslint lintea `coverage/` y assets generados en `public/`)
  documentados en CLAUDE.md regla 2 — el `eslint.config.mjs` es del scaffold y no se parchea a ciegas.
- **`repo-app.md`:** patrón nuevo — workers ESM/WASM (Pyodide) se sirven desde `public/` como
  module workers, no se bundlean (Turbopack los degrada a clásicos; K11 de ds S1). Enlace al
  patrón de la planeadora.
- **CLAUDE.md § Stack:** default "Next.js 15" → **"Next.js 16+ (lo que estampe create-next-app)"**
  (drift confirmado ×2).
- **estampar-app.ps1:** el echo final ya no pide crear proyecto de Claude Design (contradecía el
  G-Metodo 2026-07-07); ahora recuerda la conexión fija vía `.claude\settings.local.json`.
  SYNOPSIS sin versión hardcodeada.

## v1.2.0 — 2026-07-07 (G-Metodo del cierre S1 nutri-kids: paga las fricciones K1–K6)

Fuente: `sprints/SPRINT_001-summary.md` de app-nutri-kids (el kit requirió cirugía DENTRO del
sprint aunque el estampado ya era limpio). Aprobado por el usuario 2026-07-07 —
detalle en `entrega/2026-07-07-propuesta-gmetodo-batch-s1-nutri-kids.md`.

- **`vitest.config.ts` + `playwright.config.ts` + `tests/setup.ts` (nuevos, K1):** los configs
  que `ci.yml` siempre asumió, con el patrón validado en nutri-kids (jsdom + coverage v8 piso 70;
  e2e móvil Pixel + desktop; webServer `pnpm build && pnpm start` bajo CI).
- **`lighthouse-urls.json` (nuevo) + ci.yml (K3):** el job Lighthouse audita la lista de URLs del
  archivo (default `["/"]`); cada sprint añade sus rutas. Nota Lantern documentada en el workflow
  (LCP simulado castiga SPAs sanas: 3.8s simulado vs 242ms observado).
- **`next.config.ts` (nuevo, K6):** `devIndicators: false` — el indicador de dev tapa la nav
  inferior móvil e intercepta taps en e2e.
- **CLAUDE.md § Stack:** IA embebida = **adapter multi-proveedor** (proveedor por ADR de cada
  app) — alineado con el principio LLM-agnóstico del pipeline.
- **CLAUDE.md regla 10 + skills:** **Claude Design pasa a BAJO DEMANDA** (2 apps seguidas
  validaron design-system.md del builder + gate visual sobre preview). `repo-app.md`: patrones
  confirmados (useSyncExternalStore para localStorage↔React; overlays de primer uso estáticos;
  devIndicators). `observability.md`: aclaración honesta — **el kit NO trae Sentry cableado**
  (K2/K5); se cablea en el S1 de cada app con el patrón de nutri-kids; se promoverá al kit a la
  3ª validación.
- **estampar-app.ps1 (K4):** el commit inicial lee la versión real del CHANGELOG.

## v1.1.5 — 2026-07-06 (limpieza final del estampado #2)

- **`--skip-install` en create-next-app:** su install interno corría ANTES de que el script
  escribiera `allowBuilds` y abortaba en rojo (`ERR_PNPM_IGNORED_BUILDS` + "Aborting
  installation") — inofensivo pero alarmante. Ahora el único install es el del paso 2, ya
  configurado. El próximo estampado debe correr de punta a punta **sin ningún rojo**.

## v1.1.4 — 2026-07-06 (hotfix #4: el kit se mordía la cola con gitleaks)

- **`security-owasp.md` línea ~116:** el ejemplo didáctico de "nunca hardcodear" traía una clave
  con pinta real (`sk-proj-abc123...`) y el **hook pre-commit de gitleaks del propio kit la
  bloqueó** en el commit inicial del estampado #2 (regla `generic-api-key`, entropía 3.69).
  Ejemplo neutralizado a placeholder sin entropía + comentario del porqué. Validación positiva
  doble: el hook `githooks/pre-commit` (nuevo en v1.1.0) **funciona en commits reales**, y el
  `Check` de v1.1.2 volvió a detener el script en el paso exacto.

## v1.1.3 — 2026-07-06 (hotfix #3: pnpm 11 cambió el mecanismo de builds nativos)

- **`allowBuilds` (pnpm 11) además de `onlyBuiltDependencies` (pnpm 10):** pnpm 11 ya no lee la
  lista `onlyBuiltDependencies`; usa el mapa `allowBuilds: {pkg: true}` y **aborta el install**
  (`ERR_PNPM_IGNORED_BUILDS` fatal) si un build nativo no está aprobado, dejando un stub
  "set this to true or false" en el yaml. El script escribe ahora AMBOS formatos (cada versión
  ignora el ajeno) y añade `@tailwindcss/oxide` (Tailwind 4 compila nativo).
- Validación en vivo del `Check` de v1.1.2: el script se detuvo honesto en
  `FALLO: pnpm install (exit 1)` — el patrón de exit codes funcionó a la primera.

## v1.1.2 — 2026-07-06 (hotfix #2 del estampado de nutri-kids — 3 bugs más)

Detectados al correr el script v1.1.1 en la máquina del usuario (el estampado llegó al final
imprimiendo "OK" con el repo git y el remoto ROTOS):

- **Escrituras sin BOM (`EscribirSinBom`):** `Set-Content -Encoding utf8` en PS 5.1 escribe BOM;
  el BOM rompía `pnpm-workspace.yaml` (pnpm ignoró los builds nativos → `ERR_PNPM_IGNORED_BUILDS`),
  `package.json` ("Invalid package.json" de pnpm) y el JSON de la ruleset. Las 3 escrituras
  ahora usan `[IO.File]::WriteAllText` con `UTF8Encoding($false)`.
- **`git init` explícito e idempotente:** el script asumía que create-next-app inicializa git;
  en la máquina real no lo hizo → 4 `fatal: not a git repository`, sin commit inicial, y el
  `gh repo create --source --push` falló en cadena.
- **`Check` de exit codes tras cada comando nativo crítico** (scaffold, installs, git, gh):
  los comandos nativos no disparan `$ErrorActionPreference=Stop`, así que el script imprimía
  "OK repo creado y push hecho" y "OK ruleset activa" sobre pasos fallidos. Ahora un fallo
  detiene el script con el paso exacto.

## v1.1.1 — 2026-07-06 (hotfix del estampado #2, nutri-kids)

- **estampar-app.ps1 — fix de encoding (bug bloqueante):** el script estaba guardado como
  UTF-8 **sin BOM** y con finales **LF**; Windows PowerShell 5.1 lee los `.ps1` sin BOM como
  ANSI, el "—" (em-dash, multibyte) se degradaba a mojibake que incluye una **comilla
  tipográfica** (0x94), PowerShell la trata como comilla real → el parseo del archivo completo
  reventaba (11 errores) y el estampado nunca arrancaba. Fix mecánico, cero cambios de texto:
  re-guardado **UTF-8 CON BOM + CRLF** (validado: 0 errores de parseo).
- **`.gitattributes` nuevo en la raíz de la planeadora:** `*.ps1 text eol=crlf` (evita que git
  o un editor degrade los scripts de vuelta a LF). Regla derivada para todo el pipeline:
  **scripts `.ps1` con caracteres no-ASCII se guardan siempre UTF-8 con BOM** — o se escriben
  100% ASCII.

## v1.1.0 — 2026-07-05 (G-Metodo: batch post-SPRINT_001 de hoja-de-vida)

Fuente: 9 hallazgos del estampado #1 + la CI real del primer sprint
(`memoria/patrones-acumulados.md` de la planeadora).

- **ci.yml:** pnpm 9 → **11** y Node 20 → **22** en los 3 jobs (el scaffold estampa pnpm 11;
  pnpm 11 exige Node ≥22.13).
- **perf-budget.json:** eliminada la propiedad `_comment` (Lighthouse CI rechaza el archivo);
  `interactive` (TTI, deprecada) → `total-blocking-time ≤300ms`; LCP 2500 → 3000ms (efecto
  font-swap documentado en README §Reglas).
- **githooks/pre-commit** (nuevo): gitleaks bloquea commits manuales con secretos — antes solo
  las escrituras de Claude estaban protegidas (hook PreToolUse).
- **estampar-app.ps1** (nuevo, aprobado G-Metodo 2026-07-04): estampado semi-automático
  completo; criterio de aceptación: app recién estampada pasa CI verde en su primer PR.
  Incorpora: scaffold ANTES del kit, `--src-dir`, builds nativos pre-aprobados
  (`pnpm-workspace.yaml`), scripts `typecheck`/`test`/`test:e2e` con `--passWithNoTests`,
  CLAUDE.md desde `ordenes/CLAUDE-md-para-app.md`, ruleset `main-protegida` por API.
- **Sin `ai`/`@ai-sdk/<proveedor>` en el estampado:** el proveedor LLM se decide por ADR en el
  sprint que active IA.
- **README:** bloque de estampado reescrito alrededor del script; reglas nuevas (Lighthouse
  local orientativo; budget y font-swap).
- **CLAUDE.md:** regla 7 actualizada (doble cinturón gitleaks).

## v1.0.0 — 2026-07-02

Versión inicial (migración Cowork→Code): CLAUDE.md, skills, commands, settings con hooks,
ci.yml, perf-budget.json, MANUAL-DE-USO, gitignore.plantilla.
