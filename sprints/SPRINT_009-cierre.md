---
sprint: 009 · «Velo en tu equipo» · app: anonimizador · hito: H-2 · opened: 2026-11-07 · closed: 2026-11-07
branch: sprint-009/velo-en-tu-equipo · pr: #19
---

**Objetivo:** Velo local (mismo motor, `pnpm velo`), puente a PostgreSQL y SQL Server, API REST en `127.0.0.1:3301`, JSON/JSONL en alto volumen. **Estado: construido; PR listo, merge del usuario.**
**Resultado:** las cuatro piezas. Local = web en los mismos bytes (e2e con Chromium: CSV y JSON Lines, anonimizado, bóveda en claro y certificado). El puente escribe `<tabla>__velo` y la original no se toca (huella antes y después). JSON de 21 M de celdas: ida y vuelta idéntica al original en Chromium, sin red.
**Tiempo:** orden 5 h · estimado 5,25 h · real **2,1 h** (−2,9 h, −58 % contra la orden). Sin fase pasada del 50 %.

```
| Commits | Sesiones | Horas activas | Span 2026-11-07 21:38 → 23:12 (1,6 h) |
| 15 | 1 | 2,1 h | F1 6 c · 0,9 h (est. 1,75) · F2 4 c · 0,5 h (est. 1,75) · F3 5 c · 0,7 h (est. 1,5) |
```

**Entregables:** `velo-local/` (CLI, API, núcleo, `puente/`) · ADR-017 · `docs/api/velo-local.yaml` · `pnpm kit:base` · job `puente` · JSON por pasadas (`src/engine/json/trozos.ts`, `src/workers/json-por-trozos.ts`) · manual ES/EN §9 y §11, guía (bloque AJ, gate 44), README.
**No completado / sin verificar:** SQL Server solo lo prueba el job `puente` (nunca corrió antes del PR). `puente` aún no está en el ruleset `main-protegida` (se añade con `gh api` cuando el check exista). Sin capturas ni vista del preview: FORMA y TEXTO al ensayo general del H-2.
**Desviaciones:** (1) ADR-017 decía «siempre por pasadas»; Velo local elige memoria o pasadas con la regla de la web, o el certificado no coincidiría (ADR corregido). (2) El e2e de JSON usa un archivo de 316 MB (cada celda lleva su clave), un solo proyecto. (3) Un defecto propio en F2 (`ORDER BY` de PostgreSQL contra la columna de salida) se pagó en la fase.
**Decisiones:** G-Plan «1 a 2 a». **Aprendizajes:** un solo escritor con la fuente de celdas abstracta es lo que da «por trozos = en memoria»; un fixture del kit compacto no prueba el JSON con sangría (lo halló la auditoría).

**Auditoría** (Sonnet, solo lectura, 7,4 min, una pasada): alcance, calidad, seguridad y frases caducadas.

- A1 `trozos.ts:323` arreglo con sangría por pasadas fallaba con `json-no-es-registros` — **pagado · d743186** (test que falla y pasa). M4/M5 ADR-015:117 y ADR-017:37, B3 título de `inicio.ts:404` — **pagados · d743186**. Seguridad/privacidad: sin C/A. Veredicto: **listo para cierre**.
- Deuda (lote del hito): M1 `velo-local/cli.ts:176-198` las frases de bóveda/bitácora se piden tras escribir el anonimizado · M2 `velo-local/puente/orden.ts:127-148` el certificado queda huérfano si falla `antesDeConfirmar` · M3 falta test de `anotarEnBitacora` con rollback · M6 `docs/BROCHURE.html:3167` y `:1548` («no lee bases de datos»), `docs/BLUEPRINT.html:536,701,808` («sin backend», S10) · B1 `velo-local/puente/sqlserver.ts:179-188` llave binaria · B2 `<tabla>__restaurada` lleva originales en claro con los permisos del esquema, sin aviso (regla 17-bis).

**Verificado (leído uno por uno):** `tsc` ok · lint 0 errores (1 aviso previo de `.design-sync`) · `pnpm test` 2381 pasan, 1 omitida, umbrales de cobertura ok · puente 7/7 contra `kit:base` · e2e locales: JSON 1,6 min, local = web ×2, S8 y JSON/regreso/red ×16 · `gate:anti-ia`, dependencias y cero-enlaces (homepage vacía) en verde. Checks del PR: se leen al final.
**Modelos:** F1 Opus, F2 y F3 Sonnet, auditor Sonnet; sin desvío. **Relevos:** ninguno. Advisor: 0 consultas. Subagentes F3: Explore ×1, auditor ×1.
**Tokens:** `analyze_registro.py --since 2026-11-07` → «sin registro en ese rango»; % de la barra de 7 días: no recibido.
**Derivados en disco:** archivos de Velo local `0o600` y `wx` (no pisan); tablas `__velo` y `__restaurada` en la base del usuario (B2). Aprovisionamiento nuevo y protecciones del sistema: n/a.
**Servidores:** `lsof` LISTEN en este repo: 0 (solo el test-server de la extensión Playwright de VS Code, que no cuenta; 3300/3301/5433 cerrados).
**Para mergear:** squash y borrar la rama; después `/cierre-sprint anonimizador`.
