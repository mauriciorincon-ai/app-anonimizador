---
description: Orquesta la suite completa de tests (unit + integration + e2e) con reporte unificado.
---

# /run-tests

Corre la suite de tests completa y reporta resultados de forma unificada.

## Pasos

1. **Unit + integration** (Vitest):
   ```bash
   pnpm test -- --coverage
   ```
   Captura: tests totales, pasados, fallados, cobertura global y por archivo.

2. **E2E** (Playwright):
   ```bash
   pnpm test:e2e
   ```
   Captura: specs totales, pasados, fallados, duración, screenshots de fallos si hay.

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
- Specs: X total | Y pass | Z fail
- Duración: Ns
- ❌ Fallos con screenshots en: test-results/

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
