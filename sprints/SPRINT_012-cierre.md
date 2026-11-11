---
sprint: 12
app: anonimizador
hito: H-2
opened: 2026-11-09
closed: 2026-11-10
branch: sprint-012/listo-para-el-ensayo
pr: pendiente (se abre tras el último commit)
---

**Listo para tu ensayo** · objetivo: pagar la deuda del S10, cerrar la construcción del H-2 (docs, inglés, brochure, BLUEPRINT, `design-sync`) y dejar la guía como UN recorrido para el ensayo general del S13, en ES y EN.
**Resultado:** construcción del H-2 cerrada. La guía es un recorrido de 26 paradas y 203 pasos con la matriz `cubre` de las 22 funcionalidades (ninguna descartada) y su test; el inglés se ve alternando el idioma a mitad del recorrido. **Estado:** `pnpm test` 2646 verdes + 1 omitido (cobertura en umbral) · tsc y lint limpios · gate anti-IA y `verificar-dependencias` verdes · e2e completo en escritorio 151/151 y en móvil 139/139 (12 omitidos por diseño, solo escritorio) · CI por leer al final.

| Fase                        | Plan   | Real (git) | Entregó                                                                                                                  |
| --------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| F1 deuda de código del S10  | 1,25 h | 0,7 h      | 7 ítems con test y demo en rojo (cupo por motor, `click()` de Safari, escrituras a medias, camino muerto, cableado)      |
| F2 documentos e inglés      | 2 h    | 1,1 h      | docs del S10, memoria como requisito, e2e/capturas EN, brochure 22 + export, BLUEPRINT as-built, `design-sync` publicado |
| F3 guía, auditoría y cierre | 2,25 h | 0,9 h      | guía-recorrido + `guia-cobertura.test`, 15 hallazgos de la auditoría pagados, inglés de las pantallas del H-2, cierre    |

`horas-sprint.mjs` (antes del commit del cierre): 18 commits · 3 sesiones · **2,7 h activas** · span 2026-11-09 21:53 → 2026-11-10 19:09 (21,3 h). Orden: 5,5 h; diferencia −2,8 h por la heurística (no cuenta esperas de builds y e2e).
**Desviaciones:** (1) la orden decía «24 funcionalidades»; la VISION y `CLAUDE.md` dicen 22 y se entregan 22 → pregunta 1. (2) La web **no puede fijar la sal** (`sesion.ts:392` la genera siempre): el copy prometía repetir seudónimos con «la misma frase y sal»; se corrigió a «solo con Velo local `--sal`» en UI, manuales, guía, brochure y export, y la guía lo prueba (parada 21, C9, con las órdenes corridas). (3) `pglite` y su socket pasan a `devDependencies` (13 → 11 dependencias de ejecución). (4) `CLAUDE.md` regla 11 aún dice «⭐/⭐⭐»: la guía ya no tiene estrellas → pregunta 4 (no se edita la constitución sin orden).
**Auditoría** (Sonnet 5.5, solo lectura, una pasada): alcance parcial → completo · calidad · seguridad limpia (`cero-enlaces` verde, sin secretos ni datos reales, Safari con matriz y sin pedir contraseña) · frases caducadas. C 0 · A 2 · M 4 · B 9, **todos pagados**:
· A-1 inglés solo cubría el flujo CSV `pagado · a362e96` (7 pruebas EN: JSON, PDF, foto, óptima, ruido, RGPD, alto volumen + certificados; demo en rojo: un «El rango es la» en el catálogo EN hizo caer la prueba y se restauró; 37 capturas en `tmp/capturas-en/`, 2 leídas como imagen) · A-2 promesas de sal en la web `pagado · 0c5be25`.
· M-1 cifras del export (2646/117 · 302 e2e en 22 archivos · 11 dependencias; cobertura 97,33 % reproducida con las `stmt` de clover) `pagado · 1481198, a362e96` · M-2 `--salida` en restaurar y puente `pagado · 0c5be25` · M-3 manuales: carpeta debe existir y aviso «No pude borrar» `pagado · 0c5be25` y el commit del cierre · M-4 encabezado «Sprint 008» `pagado · 0c5be25`.
· B-1 `EscrituraAMedias` escapaba `pagado · 0c5be25` · B-2 mensaje con carpeta por omisión `pagado · 0c5be25` · B-3 textos de Firefox/WebKit medidos (JavaScriptCore dice «Length exceeded the maximum array length», SpiderMonkey lanza `InternalError`) `pagado · 1481198` · B-4 arnés `tests/medicion/pico-velo-local.mjs` `pagado · 1481198` · B-5 claves de React `pagado · 0c5be25` (0 avisos en la corrida completa) · B-7 «regla 14» → 17 · B-8 «petición en rojo» solo en previews · B-9 BLUEPRINT «S005–S012» `pagado · 0c5be25` · B-6 `pino` sin uso → pregunta 5 (declarado en `CLAUDE.md`).
**Deuda: ninguna** salvo lo que espera tu respuesta abajo. **Modelo por fase:** F1, F2 y F3 Sonnet 5.5 (requerido y activo, sin desvío; F3 con `/advisor opus`). **Relevos:** ninguno. **Tokens:** Explore ×4 (Haiku) · auditor Sonnet ×1 (~232 k) · advisor 2 consultas (orden de la guía, antes del STOP) · `/compact` 3 pedidos y hechos · plan con `/effort medium` según el archivo del sprint.
**Servidores:** `lsof` LISTEN en este repo: 0 (solo el test-server de VS Code Playwright, que no cuenta; `app-hackguard` y `app-planlang` son de otras apps y no se tocaron). **PRs abiertos antes de este:** 0.
**Preguntas cerradas (default si no respondes):** (1) ¿CV Viva queda en 22, no 24? **22**. (2) ¿El pico de memoria del riesgo exacto sigue como límite conocido declarado, no descartado? **sí**. (3) ¿La web solo documenta la sal (repetir seudónimos = Velo local `--sal`) o le sumamos un campo para pegarla? **solo documentar**. (4) ¿Reescribo la regla 11 de `CLAUDE.md` («recorrido, sin estrellas») en el S13? **sí**. (5) ¿Quito `pino` de `package.json`? **no** (sigue declarado).
Para mergear: squash y borrar la rama; después `gh repo edit --homepage ""` y `/cierre-sprint anonimizador`.
