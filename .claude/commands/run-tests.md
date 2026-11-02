---
description: Orquesta la suite completa de tests (unit + integration + e2e) con reporte unificado.
---

# /run-tests

Corre la suite de tests completa y reporta resultados de forma unificada.

> **Regla dura (kit v1.15.0): se verifica con EL comando del CI, no con uno parecido.** Los
> comandos de abajo son los del `.github/workflows/ci.yml` — si divergen, gana el `ci.yml` y se
> corrige este archivo. Nunca sustituyas `pnpm test` por `vitest run` (ni `pnpm lint` por
> `eslint`) "para ir más rápido": los scripts de `package.json` llevan los flags donde viven los
> **gates** (`--coverage` aplica los umbrales; `next typegen` precede a `tsc`). *(Origen: Velo
> S2 — el `/deploy-check` se verificó con `vitest run`, dio 502 pruebas verdes y un porcentaje
> global cierto, y el CI se puso rojo por el umbral de `src/lib/**` que solo el flag aplica.)*

## Pasos

1. **Unit + integration** (Vitest):
   ```bash
   pnpm test
   ```
   Captura: tests totales, pasados, fallados, cobertura global y por archivo. **Lee las líneas
   posteriores al resumen** (errores de glob, umbrales, warnings): el verde de las pruebas no es
   el verde del job.

2. **E2E** (Playwright):
   ```bash
   pnpm test:e2e
   ```
   Captura: specs totales, pasados, fallados, duración, screenshots de fallos si hay — **y los
   REINTENTOS** (`flaky` en el resumen de Playwright). Un spec que pasó en su 2º intento **no es
   un spec verde: es un aviso** — repórtalo siempre, con nombre, aunque el job termine en verde.
   *(La línea `N flaky` la imprimen tanto `list` como `github`; lo que solo da `list` es el
   avance prueba por prueba, que es como se ve cuál se quedó colgada. Verificado con demo en
   rojo en Velo S3 — que de paso desmintió la premisa del S2: las 12 corridas verdes del repo
   dieron **cero flaky**, así que el timeout mal puesto solo rompía en local.)*

3. **Accessibility E2E** (axe dentro de Playwright):
   - Ejecutar tests específicos de a11y.
   - Capturar violaciones por ruta.

## Output esperado

```
### 🧪 Unit + Integration (Vitest)
- Tests: X total | Y pass | Z fail
- Duración: Ns
- Cobertura: lines X% | branches Y% | functions Z%
- ❌ Fallos:
  - archivo.test.ts > describe > it: mensaje de error

### 🎭 E2E (Playwright)
- Specs: X total | Y pass | Z fail | **⚠️ W flaky (pasaron en reintento)**
- Duración: Ns
- ❌ Fallos con screenshots en: test-results/
- ⚠️ Flaky (si W>0): nombre de cada spec + en qué intento pasó — **investigar antes del PR**

### ♿ Accessibility
- Rutas auditadas: X
- Violaciones: N por WCAG AA
- Detalle:
  - /dashboard: 2 violaciones (contrast, aria-label)

### 📊 Resumen
- Estado global: ✅ PASS | ❌ FAIL
- Tests totales: X
- Pasaron: Y (Z%)
- Cobertura: X%
- Bloqueantes: N

### Recomendación
- Si FAIL: listar top 3 cosas a arreglar.
- Si PASS: "Suite verde, apto para PR."
```

## Modo rápido

Si el usuario pide `/run-tests fast`, saltar e2e y solo correr unit + integration.

## Modo específico

Si el usuario pide `/run-tests <pattern>`, agregar `--filter` a turbo y `--grep` a Vitest/Playwright con el pattern.
