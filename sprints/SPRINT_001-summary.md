---
app: anonimizador
sprint: 001
titulo: "El diagnóstico — Velo abre la aduana"
branch: sprint-001/el-diagnostico
pr: 2
cerrado: 2026-08-09
---

# Sprint 001 · El diagnóstico — resumen

**Velo ya ve.** Se arrastra un CSV o un Excel y, sin que un solo byte salga del navegador, la
aplicación dice qué datos personales lleva la tabla, con qué certeza lo sabe, a cuánta gente
alcanza a señalar con el dedo y qué cruces de columnas delatan — y entrega todo eso como un
reporte HTML que se abre solo, sin internet, en el computador de quien lo reciba.

En S1 Velo **no transforma nada**. Demuestra que ve, y demuestra **por test** que no habla con
nadie.

10 commits · 76 archivos · +11.155 / −253 líneas.

---

## Lo que quedó en `main`

| Pieza                               | Qué hace                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **La aduana** (`/`)                 | Carga por arrastre **y por teclado** (un `<input type="file">` real, no un `div` disfrazado). Cinco estados diseñados, progreso honesto: barra solo cuando hay una medida de verdad que enseñar.                   |
| **El diagnóstico** (`/diagnostico`) | Riesgo exacto arriba, tabla columna por columna en medio, consejero de cruces abajo — cifra, evidencia, consejo.                                                                                                   |
| **Motor de detección**              | 13 validadores, **cada uno con su fuente oficial citada en el código**: NIT (mod 11 de la DIAN), cédula (estructural — no existe DV público, y se dice), CRC, placas, Luhn, IBAN, correo, IP, coordenadas, fechas. |
| **Motor de riesgo**                 | Clases de equivalencia por retículo incremental, prosecutor exacto (k mínimo, máximo, promedio, % de únicos) y advisor de combinaciones 2–4 con su k real.                                                         |
| **El reporte**                      | HTML autocontenido con la huella SHA-256 del archivo, para que quien lo reciba compruebe que habla de esa copia exacta.                                                                                            |
| **El worker**                       | La frontera: los datos crudos viven ahí y solo ahí. A la interfaz cruzan agregados, metadatos y muestras enmascaradas.                                                                                             |

**Rendimiento medido:** 500.000 filas × 24 columnas (130 MB) en ~5 s, **cero tareas largas** en el
hilo principal. SHA-256 en streaming a 85 MB/s.

---

## Las cuatro reglas duras, como gate mecánico

Ninguna es texto de marketing; las cuatro pueden poner el CI en rojo.

1. **Cero IA generativa.** `scripts/gate-anti-ia.mjs` audita `package.json` **y el lockfile**
   (una dependencia transitiva cuenta igual). Job propio del CI y check requerido.
   **Demostrado:** PR #3 desechable con `openai` → `anti-ia` **rojo en 7 s** con el culpable
   nombrado, antes que ningún otro job. PR cerrado y branch borrado.
2. **Los datos jamás salen del navegador.** Un e2e escucha toda petición y websocket durante el
   flujo completo con archivo cargado y exige cinco cosas: cero fuera del origen, cero con cuerpo,
   cero rutas no previstas, cero parámetros ajenos y **cero nombres de columna en una URL**. Más
   la CSP con `connect-src 'self'` y un test de código fuente que veta `fetch`, `localStorage`,
   `indexedDB` y compañía. **Medido:** la carga inicial de `/` hace **0 peticiones a terceros**.
3. **Determinismo byte-idéntico.** Dos corridas comparadas, tamaño de chunk irrelevante, y un
   barrido del código del motor que prohíbe `Math.random`, `Date.now`, `new Date()` y
   `localeCompare`.
4. **Ni un dato real en el repo.** El generador sintético seeded es la única fuente. Verificado en
   el self-review buscándolo, no suponiéndolo.

---

## Definition of Done (6+1)

| Estándar           | Estado | Evidencia                                                                                                                                                             |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Testing**        | ✅     | **269 unitarias** (96,5% sentencias · 92,1% ramas; motor >80%) + **39 e2e**, 1 saltada por diseño y declarada.                                                        |
| **CI/CD**          | ✅     | Cuatro jobs verdes y los cuatro **requeridos** en la ruleset `main-protegida` (activa), con `pull_request`, `deletion` y `non_fast_forward`.                          |
| **Determinismo**   | ✅     | `tests/unit/determinismo.test.ts` — incluye un caso que verifica que el instrumento distingue.                                                                        |
| **Observabilidad** | ✅     | Sanitizador sobre `reportError` + test que le mete un nombre de columna y un valor de celda y exige que no salgan.                                                    |
| **Seguridad**      | ✅     | Doble cinturón gitleaks **verificado hoy con la carnada** (el hook vive en `githooks/`, no en `.git/hooks/`) · `pnpm audit` limpio · CSP.                             |
| **Performance**    | ✅     | Lighthouse móvil: **Performance 95 · Accesibilidad 100 · Buenas prácticas 100 · SEO 100.** Carga inicial 345 KB (script 215 KB) contra un presupuesto de 350/1000 KB. |
| **UX + A11y**      | ⏳     | axe limpio en ambas pantallas × ambos temas (16/16) · teclado completo · reduced-motion con e2e. **Falta el gate visual ⭐ del usuario.**                             |
| **IA embebida**    | ✅     | **N/A estructural** — se cumple por ausencia verificada (gate anti-IA + ADR-001).                                                                                     |
| **Guía + manual**  | ✅     | `docs/GUIA-DE-PRUEBA.html` v1 (44 pruebas, gate mínimo ⭐ de 8, ~18 min) · `docs/MANUAL-DE-USO.md` · `README.md`.                                                     |
| **Auditoría**      | ✅     | Registrada abajo.                                                                                                                                                     |

**Deuda técnica activa:** `script-src 'unsafe-inline'` en la CSP — Next inyecta un script de
hidratación y sin _nonce_ (que exigiría renderizado dinámico) no hay forma de permitirlo sin la
palabra. Declarada en `next.config.ts` con su razón, no maquillada como «CSP estricta».

---

## `/audita-sprint` — hallazgos y pagos

**Fase 1 (auditoría):** cobertura de alcance completa — los 12 acceptance criteria, la DoD y las
cinco fases del plan, todos **Completos**, con las 8 desviaciones ya declaradas y ninguna nueva.
Veredicto: **requiere ajustes.** Los cuatro hallazgos tocaban la honestidad medida.

| Sev.     | Hallazgo                                                                                                                                                                      | Pago                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 🔴 Alto  | La máscara dejaba **un solo carácter oculto** en valores de 6. Una placa mide 6 y es identificador directo; esa muestra viaja dentro del reporte que se le manda a alguien.   | Tramos que solo aprietan: nunca más de la mitad del valor a la vista. `ABC123` → `AB***3`. |
| 🟡 Medio | **«0,0 %» con gente sola**: una persona única en 500.000 filas es 0,0002 %, y era la cifra grande del panel. El test lo consagraba bajo un comentario que decía lo contrario. | Por debajo de lo representable, el número se dice con palabras: «menos de 0,1 %».          |
| 🟡 Medio | `validadorCoordenada` **citaba** un rango de latitud [−90, 90] que no comprobaba.                                                                                             | La fuente dice el rango común que sí verifica, y por qué no aplica el estrecho.            |
| 🟡 Medio | El panel de riesgo no declaraba que su cifra **deja fuera** a los identificadores directos.                                                                                   | Una línea bajo la cifra, en la UI y en el reporte —que se lee fuera de contexto.           |

**Y uno que salió al verificar los pagos, no de la auditoría:** `pnpm test:e2e` **en local no
corría lo mismo que en CI**. Fuera de CI el `webServer` usaba `next dev`, y sobre un árbol limpio
salían 5 pruebas en rojo — el websocket de HMR (que el gate de red denuncia, con razón) y el
`eval()` de React en desarrollo (que la CSP bloquea), ninguno de los dos existe en producción. El
suite gritaba por algo que no estaba mirando. Ahora corre siempre contra el build de producción y
sin reutilizar servidor.

**Deuda aceptada (Bajos, sin pago):** una columna con un solo valor **y vacíos** se excluye del
advisor aunque separe en dos grupos · el primer chunk del CSV podría tomarse como encabezado si
estuviera vacío (haría falta más de 10 MB de líneas en blanco al inicio) · `sesion.ts` en 83%
porque su rama de worker caído exige un worker que reviente de verdad.

---

## Decisiones registradas

- **ADR-001 · Cero IA generativa** — decisión de producto, no limitación técnica: reproducible ⇒
  auditable.
- **ADR-002 · Spike Mondrian** — viable tal cual para el S2, con números medidos.
- **ADR-003 · Excel: suministro y tope** — SheetJS desde el tarball oficial (el `xlsx` de npm está
  congelado en 0.18.5 con dos avisos HIGH) y **tope por tamaño de archivo, no por filas**: el
  conteo de filas no se conoce sin abrir el archivo, que es justo la operación riesgosa.

Las 8 desviaciones del plan están en la bitácora, con su razón. Ninguna toca el alcance.

---

## Para el gate ⭐ del usuario

- **Preview:** la dirección de esta preview no se publica en el repositorio (registro privado en la
  orden de la casa planeadora).
- **Guía:** `docs/GUIA-DE-PRUEBA.html` — gate mínimo ⭐ de **8 pruebas, ~18 min**. Solo entró lo
  que ninguna automatización puede verificar: el juicio sobre el lenguaje y el diseño, el reporte
  abierto **con el wifi apagado**, la huella comprobada **en tu propia terminal**, y si el flujo de
  500k _se siente_ fluido.

---

## Sugerencias de mejora al método

1. **El e2e local debería correr contra el build, no contra el dev server.** El
   `playwright.config.ts` del kit usa `next dev` fuera de CI. En una app con CSP estricta y un gate
   de red, eso produce **5 rojos sobre un árbol limpio** por cosas que no existen en producción (el
   websocket de HMR, el `eval()` de React en desarrollo). Un suite que grita cuando no pasa nada
   acaba ignorado — y aquí es el suite que sostiene la promesa central del producto. Vale la pena
   que el kit traiga `command: "pnpm build && pnpm start"` y `reuseExistingServer: false` de fábrica.
2. **El `/deploy-check` pide «Lighthouse ≥90» y el CI del kit no lo mide.** El job compara contra
   `perf-budget.json` (tiempos y pesos), que es otra cosa. O el CI añade la aserción de categoría,
   o la casilla dice explícitamente que es una medición a mano — como está, se puede marcar sin
   haberla verificado nunca.
3. **La regla «un gate se demuestra fallando» merece ser del método, no de este sprint.** El PR
   desechable que pone el gate anti-IA en rojo costó cinco minutos y es la única evidencia real de
   que el gate funciona. Cualquier gate nuevo del pipeline podría nacer con su demo.
