---
sprint: 11
app: anonimizador
hito: H-2
opened: 2026-11-08
closed: 2026-11-08
branch: sprint-011/lo-que-faltaba
pr: pendiente
---

**Lo que faltaba** · objetivo: las cinco cosas «pendientes del dueño» del manual (AVIF · secuencias HEIC y Live Photo · tope de supresión · CIIU Rev. 5 A.C. · descarga grande en Firefox y Safari) construidas; el manual ya no lista pendientes salvo el pico de memoria.
**Resultado:** cinco construidas, con desvíos abajo. **Estado:** listo para PR · `pnpm test` 2572 verdes + 1 omitido (cobertura en umbral) · tsc y lint limpios · gate anti-IA verde · e2e Chromium de las tres fases en verde · CI por leer.

| Fase                                | Plan | Real (git) | Entregó                                                                                                              |
| ----------------------------------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| F1 imágenes (Opus)                  | 2 h  | 0,5 h      | AVIF fijo; secuencias HEIC/AVIF y `.mov` limpiados en su lugar; kit sintético; demo en rojo                          |
| F2 datos (Opus)                     | 2 h  | 0,7 h      | `supresionMaxima` exacta (vs. fuerza bruta); CIIU Rev. 5 con fuente y SHA; detección de revisión; web = local        |
| F3 salida y cierre (Sonnet+advisor) | 2 h  | 1,8 h      | descarga por service worker propio + partes de respaldo; medición Firefox/WebKit; manuales, guía, BLUEPRINT, ADR-013 |

`horas-sprint.mjs`: 15 commits · 2 sesiones · **3,0 h activas** · span 14:35→21:55 (7,3 h). Estimado 6 h; diferencia −3,0 h por la heurística, que no cuenta las esperas de las mediciones (≈ 3 h de reloj en la F3, ~1,5 h por el fallo de Firefox: causa abajo).
**Desviaciones:** (1) Live Photo: el UUID de pareja vive en el EXIF de la foto, que se quita entero; solo el `.mov` lo conserva → **no completado: el lado foto** (dicho en UI y certificado). (2) AVIF fijo por reconstrucción, no en su lugar. (3) JSON no admite el tope; JSON y XLSX sin respaldo por partes; el restaurado del regreso sigue por memoria. (4) La correlativa Rev. 4→5 se cita y no se usa (muchos a muchos). (5) Hook de pruebas `limiteDeParte` en `construir-archivo`. (6) e2e solo en Chromium; Firefox por sonda y por `pico-alto-volumen.mjs`.
**Decisión de diseño:** el service worker es un SEGUNDO contexto que ve los bytes de SALIDA (nota regla 7 en `contrato.ts` y BLUEPRINT); no guarda nada, no pide a la red; la página nunca los lee; `serviceWorker` queda vetado en `src/` fuera de `descarga-en-flujo.ts`. Queda su registro persistente en el navegador (dicho en el manual).
**Medición (1 M filas × 24, una corrida por celda):** pico Firefox 2,4 GB por trozos / 2,6 GB en memoria; WebKit 4,0 / 4,8 GB. **No distinguible del ruido** (el diagnóstico varió 1,8–2,2 GB entre corridas iguales); el manual lo dice y deja el pico como lo único pendiente. **Safari real no medido:** habilitarlo pide contraseña de administrador (regla 24, no se tocó) → **parada del ensayo general** (guía, ah8b).
**Hallazgo propio (F3):** Firefox dejaba a medias una descarga de ~420 MB (la corrida oficial falló 2 veces, 60 y 30 min de espera). Auditado el instrumento (idioma, perfil persistente, orden de espera: no era), partida por tamaño, causa probable el apagado del service worker por inactividad; latido de 10 s lo arregla (408 MB en 96 s; 428 243 004 bytes, 1 000 001 líneas, SHA en el certificado). **Verificado a mano en Firefox, no en la CI** (el e2e solo corre Chromium). WebKit se midió antes del latido.
**Demos en rojo:** F1 (secuencia con GPS) y F2 (tope 0 que borra · Rev. 4 leída como Rev. 5) caen y se restauraron; F3: gate de privacidad del SW (demo A) y mutación del SW: sin su guarda, cae «ya terminó, no lo toca». Las demás del gate nuevo no se hicieron.
**Auditoría** (Sonnet, solo lectura; declaró esfuerzo bajo, se pidió high): alcance 5/5 con 1 desvío declarado · calidad: sin C/A · seguridad: limpia (`cero-enlaces` verde, sin secretos ni datos reales) · frases: 2 **A** `pagado · 4dfeb01` (guía AD y README decían AVIF/Live Photo pendientes/rechazadas); **M pagados · 033ee5c**: descarga colgada si se suelta el archivo, `activo()` sin tope, escape RFC 5987, pruebas del SW; ADR-013 con addendum · 4dfeb01. Veredicto: listo para cierre.
**Deuda (lote del hito):** M `docs/BLUEPRINT.html:921` no cuenta AVIF, secuencias, tope ni Rev. 5 · M `src/lib/sesion.ts:481` `prepararArchivo` con `enFlujo` y su respaldo solo por e2e, sin unitaria · M manual: cancelar la descarga no se probó en navegador real · B `public/velo-descarga-sw.js:41` un reintento del navegador cae a la red (404) · B `src/lib/descarga-en-flujo.ts:85` el latido sigue hasta soltar el archivo · B `src/engine/metadatos/secuencia.ts:76` se conserva `tmcd` (timecode) sin declararlo · B WebKit sin repetir con latido.
**Modelo por fase:** F1 y F2 Opus 5.5 (requerido), F3 Sonnet 5.5 + `/advisor opus` (requerido); sin desvío. **Relevos:** ninguno pedido; la falla de Firefox se resolvió con un camino distinto (sonda por tamaño), no con un tercer intento igual. **Tokens:** Explore 3 (1 por fase) · advisor 2 consultas en F3 · auditor Sonnet 1 (~204 k) · `/compact` 3 · `/advisor on` 1.
**Servidores:** `lsof` LISTEN en este repo: 0 (solo el test-server de VS Code Playwright, que no cuenta). **Alcance diferido:** e2e/capturas EN (S12), FORMA/TEXTO «no vistas» → ensayo general del H-2.
Para mergear: squash y borrar la rama; después `/cierre-sprint anonimizador`.
