---
name: accessibility-wcag
description: Patrones de accesibilidad WCAG AA aplicables a las apps del pipeline. Invocar al construir componentes UI nuevos o revisar flujos interactivos.
---

# Accessibility WCAG AA — Kit General

Non-negotiable #6 de los estándares del pipeline (CLAUDE.md § Estándares). WCAG 2.1 nivel AA como línea base.

> **Regla multi-paleta (habla S1, 2026-07-12):** si la app declara más de un tema/paleta
> (claro/oscuro, paleta dual adulto/niño), **TODO gate de contraste y axe se corre por CADA tema
> y en cada superficie con paleta propia**. Un axe mono-tema es medio gate: en habla dejó pasar
> un contraste 3.1:1 en modo oscuro.

## Setup mínimo

```bash
# Linters
pnpm add -D eslint-plugin-jsx-a11y

# Testing
pnpm add -D @axe-core/playwright
```

En `eslint.config.js`:

```js
export default [
  // ...
  { plugins: { 'jsx-a11y': jsxA11y }, rules: { ...jsxA11y.configs.recommended.rules } }
];
```

## Checklist por componente

### Elementos interactivos
- [ ] Elemento semántico correcto (`<button>`, `<a>`, `<label>` — no `<div onClick>`).
- [ ] Focus visible (no remover `outline` sin reemplazo con `:focus-visible`).
- [ ] Accessible name (texto visible, `aria-label`, o `aria-labelledby`).
- [ ] Tamaño mínimo clickeable: 44x44px.

### Formularios
- [ ] Cada input tiene `<label>` asociado (ideal) o `aria-label`.
- [ ] Mensajes de error con `aria-live="polite"` y `aria-describedby` apuntando desde el input.
- [ ] `required`, `aria-invalid`, `aria-required` según aplique.

### Imágenes
- [ ] Alt text descriptivo en imágenes informativas.
- [ ] `alt=""` en imágenes decorativas.
- [ ] SVGs interactivos: `role="img"` + `<title>`.

### Contraste
- [ ] Texto normal: ratio >=4.5:1.
- [ ] Texto grande (18pt+ o 14pt+ bold): ratio >=3:1.
- [ ] Elementos UI (bordes, iconos): ratio >=3:1.

### Navegación por teclado
- [ ] Tab order lógico (de arriba-a-abajo, izq-a-der).
- [ ] Todos los elementos interactivos alcanzables con Tab.
- [ ] Modales: focus trap + Escape cierra + focus retorna al trigger.
- [ ] Skip link ("Skip to main content") al inicio del body.

### Animaciones y movimiento
- [ ] `prefers-reduced-motion` respetado.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Dark mode
- [ ] Contraste validado en ambos temas.
- [ ] No depender solo del color para transmitir información (usar icono + texto).

## Patrón: focus trap en modal

```tsx
import { useEffect, useRef } from 'react';

export function Modal({ open, onClose, children }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      dialogRef.current?.focus();
    } else {
      (triggerRef.current as HTMLElement)?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="fixed inset-0 ..."
    >
      {children}
    </div>
  );
}
```

(Mejor: usar Radix Dialog o shadcn/ui que ya manejan esto correctamente.)

## Testing automatizado

```typescript
// tests/e2e/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage no tiene violaciones WCAG AA', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

Correr en e2e suite de cada feature principal.

## Qué axe NO detecta (hay que testear manualmente)

- Significado semántico real del texto alt.
- Tab order "lógico" (axe solo ve si es alcanzable).
- Contraste en estados hover/focus/disabled.
- Calidad de los mensajes de error.

## Herramientas para audit manual

- **axe DevTools** (extensión Chrome/Firefox): audit on-demand.
- **Lighthouse** (DevTools): score de accesibilidad.
- **NVDA / VoiceOver**: probar con lector de pantalla real, al menos una vez por sprint.
- **Keyboard only**: navegar una feature solo con Tab/Enter/Escape/Arrows, sin mouse.
