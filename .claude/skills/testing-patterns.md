---
name: testing-patterns
description: Patrones de testing aplicables a las apps del pipeline (unit, integration, e2e). Invocar cuando Claude Code necesite escribir tests, refactorizar tests existentes, o decidir qué tipo de test aplica a un módulo nuevo.
---

# Testing Patterns — Kit General

Patrones de testing que aplican a las 8 apps del pipeline. Alineado con el non-negotiable #1 de los estándares del pipeline (CLAUDE.md § Estándares).

## Decisión rápida: qué tipo de test escribir

| Tipo de código | Test recomendado | Herramienta |
|---|---|---|
| Motor matemático/lógica pura | Unit (cobertura >80%) | Vitest |
| Hook de React | Unit + integration | Vitest + Testing Library |
| Componente UI con lógica | Integration | Testing Library + jsdom |
| Flujo multi-componente | Integration | Testing Library + MSW para APIs |
| Flujo completo con DB/API real | E2E | Playwright |
| API route / Server Action | Integration | Vitest + supertest o fetch directo |

## Patrón: motor puro testeable

Los motores de dominio (Gestalt en Power BI, Decision Boundary en DS, Monte Carlo en Financiera, etc.) deben ser **funciones puras**: mismo input → mismo output, sin side-effects.

**Ejemplo (Power BI Gestalt):**

```typescript
// src/engine/gestalt.ts
export type Visual = {
  id: string;
  type: 'card' | 'chart' | 'table';
  priority: number;
  preferredSize?: { w: number; h: number };
};

export type Layout = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function computeLayout(
  visuals: Visual[],
  canvas: { width: number; height: number }
): Layout[] {
  // función pura: sin DOM, sin storage, sin fetch
  // ...
}
```

```typescript
// tests/unit/gestalt.test.ts
import { describe, it, expect } from 'vitest';
import { computeLayout } from '@/engine/gestalt';

describe('computeLayout', () => {
  it('distribuye 4 visuals en grid 2x2 dentro del canvas', () => {
    const visuals = [/* ... */];
    const layout = computeLayout(visuals, { width: 1280, height: 720 });
    expect(layout).toHaveLength(4);
    expect(layout[0].x + layout[0].w).toBeLessThanOrEqual(1280);
  });

  it('prioriza visuals con priority mayor en posiciones superiores', () => {/* ... */});

  it('respeta preferredSize cuando hay espacio', () => {/* ... */});

  it('es determinista: mismo input produce mismo output', () => {
    const visuals = [/* ... */];
    const a = computeLayout(visuals, { width: 1280, height: 720 });
    const b = computeLayout(visuals, { width: 1280, height: 720 });
    expect(a).toEqual(b);
  });
});
```

## Patrón: integration de componente con datos

```typescript
// tests/integration/dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '@/components/Dashboard';

it('renderiza visuals y permite reorganizar con drag-and-drop', async () => {
  const user = userEvent.setup();
  render(<Dashboard visuals={fixtures.visuals} />);

  expect(screen.getAllByRole('article')).toHaveLength(4);

  const firstCard = screen.getByTestId('visual-card-1');
  const target = screen.getByTestId('drop-zone-3');
  await user.pointer([
    { keys: '[MouseLeft>]', target: firstCard },
    { coords: { x: target.offsetLeft, y: target.offsetTop } },
    { keys: '[/MouseLeft]' }
  ]);

  // assert: el estado cambió
});
```

## Patrón: e2e del happy path

```typescript
// tests/e2e/dashboard-creation.spec.ts
import { test, expect } from '@playwright/test';

test('usuario crea un dashboard desde CSV y lo exporta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Subir CSV' }).click();
  await page.setInputFiles('input[type=file]', 'tests/fixtures/sales.csv');
  await expect(page.getByRole('heading', { name: 'Dashboard generado' })).toBeVisible();

  await page.getByRole('button', { name: 'Exportar JSON' }).click();
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});
```

## Reglas anti-flakiness

1. **No `sleep`/`setTimeout` arbitrario.** Usa `waitFor`, `findBy`, `expect.toBeVisible()` con polling.
2. **Selectores resilientes:** `getByRole`, `getByLabelText`, `getByTestId`. Evita `getByText` para texto que cambia.
3. **Fixtures deterministas:** datos de prueba versionados en `tests/fixtures/`.
4. **Aislamiento:** cada test crea su propio estado, no depende de otros tests.
5. **Semilla de aleatoriedad:** si usas `faker`, fija la seed: `faker.seed(123)`.
6. **Los specs de Playwright se transpilan a CommonJS** (kit v1.7.2, inmobiliaria S2 K7): nada
   de `import.meta.url` en e2e — los paths de fixtures se resuelven desde `process.cwd()`.
   El error ("Failed to load the ES module") solo aparece al CORRER, no al escribir.
7. **`getByRole("alert")` desnudo es ambiguo en App Router** (K9): Next monta un
   `__next-route-announcer__` con `role="alert"` — siempre acota (`getByText(/…/)` o filtra por
   contenedor) o el strict mode fallará con 2 matches.
8. **Checkbox controlado con estado async → `.click()`, no `.check()`** (K9-bis): `.check()`
   hace flip-flop con el estado del servidor ("did not change its state"). Y la aserción va al
   **resultado observable** (el score que sube, la fila que aparece), no al atributo checked.
9. **Pantalla ya cubierta por e2e ⇒ su suite ENTERA corre en la MISMA fase que la toca** (kit
   v1.7.3, habla S3): meter un elemento nuevo a una pantalla testeada y correr la suite "al
   cierre" deja e2e mintiendo fases enteras (el selector aseveraba "exactamente 3 juegos" con
   4 en pantalla). La suite de la pantalla modificada se corre ANTES de declarar la fase
   completa.

## Reglas anti-"comportamiento sin experiencia" (G-Metodo 2026-07-12, habla S2)

> Origen: 187 tests con >90% de cobertura dejaron pasar 4 defectos que el usuario encontró en
> 25 minutos — la CI verificaba el comportamiento, no la experiencia. Patrón completo:
> `wiki/patterns/la-ci-verifica-comportamiento-no-experiencia.md` (planeadora, RO).

1. **Por cada pantalla, ≥1 e2e llega POR LA UI** (clics desde el home), no solo por
   `page.goto(url)`. Un e2e que navega por URL prueba la página, **no la manera de llegar a
   ella** — en habla, Ajustes fue invisible DOS sprints (con un outcome entero adentro) porque
   todos los e2e entraban por URL.
2. **Todo copy que AFIRMA una métrica tiene un test que confronta la frase con la definición
   de la métrica.** El unit que verifica el número no basta: en habla, `sostenidoMs` (total
   acumulado, sin reiniciar con el silencio) era correcto Y el titular "¡la sostuviste 7,3
   segundos!" mentía. Si la frase dice "sostuvo", el número que usa es la mejor racha continua.
3. **Los fixtures sintéticos incluyen casos FUERA del rango que el código asume.** El test no
   puede validar el supuesto que comparte con el código: el WAV de prueba cantaba a 300 Hz
   porque el código asumía F0 infantil 200–450 Hz — y el falsete real del padre (160–170 Hz)
   era inaudible para ambos. Todo parámetro "de población" se prueba también desde afuera del
   rango, y mejor aún: se ancla al dato medido en vivo en vez de afirmarse de manual.

## e2e con base de datos real (Supabase) en CI (kit v1.6.4, inmobiliaria S1)

> Origen: primer sprint del pipeline con Postgres real en CI (inmobiliaria S1) — 7 iteraciones
> hasta verde por 4 fricciones no obvias. Patrón completo:
> `wiki/patterns/supabase-en-ci-y-cloud.md` (planeadora, RO). Reglas:

0. **El proyecto cloud free se PAUSA a los ~7 días sin actividad de API** (kit v1.8.1) — y la
   CI corre contra Postgres LOCAL, así que el proyecto cloud no recibe nada de ella. Todo
   sprint que aprovisione Supabase estampa el **keep-alive** (`docs/supabase-keep-alive.
   plantilla.yml` → `.github/workflows/supabase-ping.yml`, cadencia **lunes y jueves**) + la
   migración `ping()` + los secrets, y verifica una corrida verde con 2xx real. Semanal NO
   alcanza: el umbral es de 7 días y los crons de GitHub se retrasan horas (caso real
   2026-07-20).
1. **`supabase status -o env` emite valores ENTRECOMILLADOS** — al volcarlos a `$GITHUB_ENV`,
   pásalos por `sed` que quite las comillas o `createClient` rechazará la URL con error opaco.
2. **Playwright descarta el stdout del `webServer` por defecto** — si el server loggea a stdout
   (Pino), pon `stdout: "pipe"` en `playwright.config.ts` desde el día 1 o debuggearás a ciegas.
3. **La migración declara TODOS los privilegios explícitos:** el stack Supabase (local y cloud)
   NO otorga grants de tabla por defecto a `authenticated` ni a `service_role` — `GRANT` explícito
   a cada rol que lee/escribe + `REVOKE` explícito a `anon`. Doblemente invisible si el flujo
   público usa RPC `SECURITY DEFINER` (salta los grants: el camino anon funciona y el autenticado
   muere con `permission denied`).
4. **Rate limit por IP + e2e no se mezclan:** en CI todo sale de localhost — apágalo SOLO en CI
   (env var) y cubre el rate limit con un test dedicado a nivel RPC (el gate se reubica, no se
   pierde).
5. **Strict mode con datos por-proyecto:** cada proyecto de Playwright inserta su propia fila —
   ancla las aserciones a un dato único de la corrida, jamás a un nombre repetido entre proyectos.
6. **Sin Docker/Colima local → la nube se provisiona TEMPRANO** (primera fase del sprint, no el
   cierre): el primer contacto con Postgres real no debe ocurrir en la CI final.

## React 19 + linter estricto (kit v1.8.2, habla S4)

> Origen: habla S4 subió a React 19 con el linter al día y dos patrones que venían "funcionando"
> desde sprints anteriores dejaron de pasar. Van a cobrar en toda app que suba de versión:

1. **Cargar storage al montar: `useSyncExternalStore`, NO `setState` dentro de `useEffect`.**
   El patrón `useEffect(() => setEstado(leerLocalStorage()), [])` dispara la regla de re-render
   síncrono y además parpadea el valor por defecto un frame. `useSyncExternalStore(subscribe,
   getSnapshot, getServerSnapshot)` lee el valor en el primer render, sin efecto y sin flash —
   y el `getServerSnapshot` resuelve el SSR de Next gratis.
2. **Un ref que se LEE en render pasa a estado.** `ref.current` dentro del JSX (o de un valor
   derivado que se renderiza) es un lint error en React 19 y un bug latente desde siempre:
   mutar el ref no re-renderiza, así que la UI muestra el valor viejo. Si el render lo necesita,
   es estado; el ref queda solo para lo que no pinta (timers, nodos DOM, valores de callbacks).

## Qué NO testear

- **Código generado** (types de TS, rutas de Next.js, componentes de shadcn sin customizar).
- **Libraries de terceros.** Confía en que React funciona.
- **Triviales:** getters/setters simples, mapeos 1:1.

## Cobertura

- **Motores puros / utils:** >80% (línea y rama).
- **Hooks y componentes con lógica:** >60%.
- **UI pura (solo markup):** no obligatorio testear.
- **Total del app:** >70%.

Configurar en `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70
      },
      exclude: ['**/*.config.*', '**/types/**', '.next/**']
    }
  }
});
```

## CI integration

Los tests corren en cada push/PR. Ver skill `repo-app` para detalle de pipelines.
