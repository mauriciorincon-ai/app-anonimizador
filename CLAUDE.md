# Velo (app-anonimizador) — constitución de la app (Claude Code)

> Auto-cargado en cada sesión de este repo. Esta app pertenece al pipeline **AI-APPs**; su plan
> vive en la casa planeadora. Estampada desde kit-app v1.10.0 el 2026-08-09 (Sprint 001).
> **Primera app del portafolio con CERO IA por diseño de producto: el determinismo ES la
> propuesta de valor.**

## Las dos casas (regla dura)

| Casa           | Path                           | Escritor único   | Qué vive ahí                                                                     |
| -------------- | ------------------------------ | ---------------- | -------------------------------------------------------------------------------- |
| **Planeadora** | `~/Code/hr01-develop-ai-apps/` | su propia sesión | brief, VISION, sprints (plan+retro), órdenes de construcción, método, estándares |
| **Esta app**   | este repo                      | **tú**           | código, tests, ADRs de implementación, bitácora y summary del sprint             |

- ✅ Puedes **leer** la planeadora (conexión fija vía `.claude/settings.local.json`, o por path absoluto).
- ❌ **Nunca escribes** en la planeadora. Si el plan necesita cambio, lo anotas en tu
  `sprints/SPRINT_NNN-implementation-log.md` bajo `## Desviación del plan` y avisas al usuario.
- El avance de implementación vive **solo aquí** — la planeadora te lee, tú no le reportas a mano.

## Qué es esta app

**Velo** — _"Velo para entregar. Desvelo para recuperar."_ La **aduana de datos** del usuario:
anonimiza y **des-anonimiza** datos tabulares (CSV/Excel, ≤500k filas) antes de entregarlos a
IAs no confiables, herramientas cloud y terceros — con transformaciones **100% deterministas**
y el ciclo completo de ida y vuelta (el tercero procesa; Velo restaura la consistencia
original con la bóveda local). Contrato de alcance: `portafolio/anonimizador/VISION.md`
(planeadora, aprobada 2026-08-09 — 22 funcionalidades).

**Estado: ciclo H1 entregado (S001–S004, cerrado el 2026-08-15).** Velo **ve** (S1: diagnóstico
y riesgo exacto), **transforma** (S2: técnicas, política, k-anonimato), **devuelve** (S3: bóveda
cifrada y restauración por valor) y **deja constancia** (S4: certificado con las dos huellas,
bitácora cifrada, riesgo poblacional estimado). Cinco rutas: `/` · `/diagnostico` ·
`/transformar` · `/regreso` · `/bitacora`. Las 14 funcionalidades del MVP personal están en
`main`. El as-built de la infraestructura vive en `docs/BLUEPRINT.html`.

**La tesis del producto:** el mercado hace la mitad del viaje (micro-tools unidireccionales o
enterprise inaccesible); Velo es la única herramienta 100%-navegador con round-trip,
localizada para Colombia, con certificado. En un mundo de herramientas que alucinan, **la
precisión determinista es el lujo**.

## ⚠️ Reglas duras de esta app (producto, no estilo)

1. **CERO IA generativa — para siempre en el runtime.** Ni SDKs de LLM, ni llamadas a APIs de
   IA, ni "solo para esta feature". Es LA propuesta de valor (reproducible = auditable), no
   una limitación. Se blinda con **gate anti-IA en CI** (check que falla si un SDK de LLM
   aparece en `package.json`). ADR-001 lo documenta. _(La IA como herramienta de DESARROLLO
   —tú, Claude Code— está bien; en el producto, jamás.)_
2. **Los datos del usuario JAMÁS salen del navegador.** Ni red, ni logs, ni Sentry (los
   eventos no pueden contener valores de celdas NI nombres de columnas), ni almacenamiento
   persistente por defecto (el vault cifrado del S3 será la ÚNICA excepción, con acción
   explícita del usuario). Se blinda con **e2e que intercepta toda la red** durante el flujo
   con archivo cargado y falla si hay un request con payload de datos.
3. **Determinismo byte-idéntico.** Mismo input + misma política + misma llave = misma salida,
   byte por byte — test de CI que corre el motor dos veces y compara. Nada de `Math.random()`
   sin seed en el motor, nada de orden de iteración no determinista (fija desempates).
4. **Honestidad medida.** El riesgo EXACTO (clases de equivalencia) se presenta como exacto;
   los estimadores poblacionales SIEMPRE etiquetados "estimado". **Prohibido en todo copy:**
   "anonimato garantizado", "100% seguro", "imposible de reidentificar" — Velo reduce riesgo
   y lo MIDE; no promete magia (k-anonimato es atacable y lo sabemos con fuentes).
5. **Repo público — JAMÁS un dato real.** Ni en fixtures, ni en tests, ni en issues, ni en
   capturas de docs. Todo dato de prueba sale del **generador sintético seeded**
   (`docs/kit-de-prueba/`). Si un archivo real del usuario toca el working tree, NO se
   commitea (gitignore + revisión en cada self-review).
6. **Las llaves son núcleo de UX, no un extra.** Llave del vault perdida = irreversibilidad
   total (consecuencia aceptada y COMUNICADA en la UI); llave HMAC filtrada = seudónimos
   enlazables. El onboarding de llaves se diseña con el mismo cuidado que el motor.

## Stack

- **Frontend = la app entera:** Next.js (estampado del kit) + TypeScript strict + Tailwind +
  shadcn/ui. **Procesamiento 100% client-side** — "cloud para el acceso, local para los
  datos": Vercel sirve la app; los datos viven y mueren en la pestaña.
- **Datos:** PapaParse (CSV streaming en Web Worker) · SheetJS `dense:true` (Excel, con tope
  declarado — revienta ~200k filas, evidencia F1) · representación columnar (typed arrays +
  diccionario de strings).
- **Cripto (Web Crypto nativo, cero dependencias):** HMAC-SHA256 (`crypto.subtle`) ·
  AES-GCM + PBKDF2-600k para el vault (S3; upgrade path Argon2id-WASM) · **FPE PROHIBIDO**
  (FF3 roto, NIST en flux — F1): preservación de formato = HMAC → dígitos → DV oficial
  recomputado (NIT: pesos primos mod 11 de la DIAN).
- **Backend/BD:** **NINGUNO en H1.** Sin Supabase, sin API routes con datos.
- **IA embebida:** **NINGUNA** (regla dura 1).
- **Tests:** Vitest + Playwright + Testing Library + @axe-core/playwright.
- **Deploy:** Vercel (preview por PR, prod desde `main`; **Deployment Protection desde el día
  0: producción pública, previews protegidas** — y documentado en el BLUEPRINT).
  **Observabilidad:** Pino + Sentry client-only metadata-only del kit, con la regla reforzada
  de la regla dura 2.

## Estructura

```
src/
├─ app/              (App Router: aduana, diagnóstico)
├─ components/       (UI sin lógica de negocio)
├─ engine/           (motores puros DETERMINISTAS, sin side-effects, cobertura >80%:
│    validadores/ · clasificador.ts · riesgo.ts — cada validador cita su fuente oficial)
├─ workers/          (parser.worker.ts — el archivo se procesa AQUÍ, jamás en main thread)
├─ lib/              (utils, dominio; lib/crypto con Web Crypto)
└─ types/
tests/{unit,integration,e2e}/
docs/kit-de-prueba/  (generador sintético seeded — la ÚNICA fuente de datos de prueba)
design-system.md     (S1, "bóveda serena" — gate visual del usuario)
docs/MANUAL-DE-USO.md · docs/GUIA-DE-PRUEBA.html (acumulativa, plantilla v1.10.0)
sprints/ · decisions/
```

## Reglas de desarrollo

1. **TypeScript strict.** Sin `any` ni `@ts-ignore` sin justificación.
2. **Tests con cada feature.** Motores puros >80%, UI >50%, ≥1 e2e por feature core que llega
   POR LA UI. Al escribir los primeros tests: `--coverage` al script `test`. Fixtures
   sintéticos incluyen casos FUERA de rango (NITs con DV inválido, cédulas imposibles,
   columnas-trampa que parecen sensibles y no lo son).
3. **Motor separado de UI.** Todo el trabajo pesado en `engine/` + `workers/`; los componentes
   no tocan datos crudos.
4. **A11y desde el inicio:** carga por teclado además de drag, aria-labels, contraste AA,
   `prefers-reduced-motion` con **e2e activo** (estándares v2.3.0).
5. **Commits convencionales**; branch `sprint-NNN/<tema>`; jamás push directo a `main`; PR con
   CI verde + preview probado. Ruleset `main-protegida` con checks requeridos desde el
   estampado; job nuevo de CI → a la ruleset en el mismo sprint.
6. **Secrets solo en `.env.local`/Vercel.** Doble cinturón gitleaks (hook pre-commit +
   PreToolUse). **Carnada canónica verificada (viaja PARTIDA aquí):** ármala concatenando
   `AWS_ACCESS_KEY_ID=` + `AKIAQ7RTZ4PX` + `KM2WNB3S` SOLO en el archivo de prueba del hook.
   _(Nota: en esta app casi no hay secrets — no hay APIs; el cinturón protege igual contra
   accidentes, p. ej. un archivo real del usuario.)_
7. **Presupuesto de esfuerzo:** ~12 pasos por pantalla; si lo excedes, simplifica o consulta.
8. **Manual de uso vivo** (`docs/MANUAL-DE-USO.md`): toda feature en `main` queda documentada
   en el mismo sprint, en español llano.
9. **Diseño con gate** (`design-system.md` + skill `diseno-ui`): el S1 lo crea (personalidad
   "bóveda serena": precisión y confianza sin frialdad clínica; el sello "nada sale de aquí"
   como identidad visible); cada sprint con UI cierra con **pasada de capturas del builder**
   (método v1.11.0: bloques leídos como imagen, animaciones cuadro a cuadro) + checklist +
   gate visual del usuario sobre la preview.
10. **Guía de prueba viva y ACUMULATIVA** (`docs/GUIA-DE-PRUEBA.html`, plantilla kit v1.10.0):
    bola de nieve, origen por línea, filtros, gate mínimo ⭐ (solo lo no-automatizable),
    "Empieza en:" por bloque, acumulados con punto de partida, localStorage versionado por
    sprint, kit de prueba enlazado.
11. **PROHIBIDO entregar por artifacts** — todo entregable es archivo del repo (HTML
    autocontenido o MD).
12. **Brochure vivo** (`docs/BROCHURE.html` + ruta `/conoce`, molde v2): se PRODUCE (storyboard
    con clímax **aprobado por el usuario** antes de la primera línea de HTML + banco de
    técnicas del kit), anclado al design-system de esta app. Tiene **dos estados**: **INICIAL**
    (declarado en la propia pieza) mientras las pruebas del usuario no han cerrado, y
    **SELLADO** cuando el gate ⭐ las cierra. Junto al HTML viaja **`docs/brochure-export.json`**
    (contrato `brochure-export` v1.0.0), y **todo PR que toque features lo actualiza en el
    mismo PR** — la cifra del pie del brochure, la del export y el `MANUAL-DE-USO.md` no pueden
    desincronizarse (hay test de contrato que lo verifica).
13. **Última milla** (método v1.11.0): todo link de producción se prueba DESDE AFUERA, SIN
    sesión (curl/incógnito) — y **sin publicarlo** (regla 14); dominio + protección de
    deployment documentados en el BLUEPRINT **sin escribir la dirección**.
14. **Cero enlaces — la producción se MUESTRA, jamás se ENTREGA** (kit v1.19.0): ningún archivo
    de este repo público ni ningún campo de GitHub (incluido **homepage**) publica URLs de
    producción o de preview. Las direcciones son **dato privado**: viven en la orden de la casa
    planeadora, que es el registro privado. En su lugar: el brochure como contenido, la ruta
    `/conoce` nombrada sin URL absoluta, y el CTA público de **lista de espera**. El campo
    `homepage` del repo lo **REESCRIBE la GitHub App de Vercel tras cada deploy de producción**:
    se re-limpia después de cada merge a `main` y se declara como limpieza recurrente.

## Estándares (los 6+1, gates en CI)

Testing · CI/CD · Observabilidad · Seguridad · Performance (contra `perf-budget.json` +
presupuesto propio: 500k filas sin bloquear main thread) · UX+A11y · **IA embebida: se cumple
por AUSENCIA VERIFICADA (gate anti-IA)**. Detalle: `estandares/estandares.md` de la planeadora
(RO, v2.3.0). Ítem rojo ⇒ deuda técnica explícita en el summary o el sprint no cierra.

## Workflow de un sprint

**Apertura** — el usuario trae la orden de la planeadora
(`portafolio/anonimizador/ordenes/SPRINT_NNN-orden.md`). Léela ENTERA + sus inputs. **Plan
mode primero, siempre.** La aprobación del plan NO arranca la construcción: emite el bloque
de arranque (modelo/esfuerzo recomendados + `/model`) y espera el **«construye»** explícito.
Branch `sprint-NNN/<tema>`.

**Durante** — construye por fases (spikes → motor → UI → integración → e2e). Bitácora viva
en `sprints/SPRINT_NNN-implementation-log.md`; ADRs en `decisions/`. `/self-review` tras cada
bloque; `/run-tests` frecuente. **Gate de FASE: al terminar CADA fase DETENTE** — resumen
completo, recuerda `/model`, espera el **«continúa»**.

**Cierre** — `/audita-sprint` OBLIGATORIA (dos fases; el modelo poderoso audita y PLANEA para
que cualquier modelo ejecute) → DoD → `/deploy-check` → `sprints/SPRINT_NNN-summary.md`
OBLIGATORIO (plantilla del kit; registra la auditoría) → PR → gate ⭐ del usuario → merge con
CI verde. Sin summary el sprint NO está cerrado.

**Cierre de CICLO (S3 — la orden lo declarará):** BLUEPRINT.html (as-built con SVG embebido,
incluyendo dominio + protección de deployment) + design system a Claude Design
(`/design-sync`) + Brochure vivo producido con storyboard.

## Patrones de dominio de esta app

- **Validador con fuente:** cada validador de `engine/validadores/` lleva en comentario la
  fuente oficial de su algoritmo (DIAN mod-11, CRC +57, Luhn ISO 7812-1, IBAN ISO 13616…) —
  el código es citable como el resto del pipeline.
- **El worker es la frontera:** los datos crudos viven en el worker; hacia la UI solo viajan
  agregados, muestras enmascaradas y metadatos. Ningún componente recibe el dataset entero.
- **Determinismo verificable:** desempates fijados (orden de columnas, medianas estables),
  cero aleatoriedad sin seed, y el test byte-idéntico como regresión permanente.
- **Muestras siempre enmascaradas:** cuando la UI muestra un valor de ejemplo, va parcialmente
  enmascarado (`123***89`) — ni el diagnóstico expone datos completos innecesariamente.

## Idioma

Español en conversación, UI y bitácoras. Inglés en código, commits, nombres y ADRs.
