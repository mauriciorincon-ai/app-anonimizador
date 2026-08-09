---
name: diseno-ui
description: Oficio de diseño de frontend vanguardista - design-system.md por app, tokens disciplinados, heurísticas anti-look-genérico, integración con Claude Design vía /design-sync, y el checklist del gate de revisión de diseño. Invocar al construir o modificar CUALQUIER pantalla o componente visual, y al cerrar un sprint con UI.
---

# Diseño de UI — el oficio del frontend vanguardista

El pipeline exige apps que **no parezcan hechas por una IA con prisa**. Este skill define cómo se
logra: un sistema de diseño propio por app, disciplina de tokens, heurísticas de vanguardia y un
gate de revisión antes de mergear. **Cada app tiene su lenguaje visual propio** (decisión
2026-07-02); lo común entre apps es el *nivel* de calidad, no la estética.

## 1. `design-system.md` — la fuente de verdad visual de la app

Vive en la raíz del repo. Se crea en el **sprint 1** y toda pantalla posterior lo obedece (se
extiende por ADR, nunca se contradice en silencio). Contenido mínimo:

- **Personalidad** (3 adjetivos + 3 anti-adjetivos: qué es y qué jamás será — ej. "erudito, cálido,
  preciso / nunca corporativo, nunca juguetón, nunca denso").
- **Tokens**: paleta exacta (hex, con roles: fondo/superficie/tinta/acento/estados), escala
  tipográfica (familias con carácter + tamaños + pesos), spacing (múltiplos de 4/8), radios,
  sombras, duraciones de motion. Implementados como CSS variables / Tailwind config — **nunca
  valores mágicos sueltos en los componentes**.
- **Componentes canon**: los shadcn/ui **personalizados** de esta app (variantes propias, no el
  default), con su uso permitido.
- Modo claro/oscuro si aplica; orientación (las apps de canvas son landscape-primary).

**Origen de los tokens:** si existe prototipo en `referencias-ui/<slug>/` de la planeadora, los
tokens se **extraen de su `design-system.md`** (los 4 prototipos legados ya definen lenguajes
completos: scholarly indigo, clínica cálida, monocromo técnico, editorial). Si la app es nueva, se
definen en la exploración de diseño (§ 3).

## 2. Heurísticas de vanguardia (lo que separa "correcto" de "nivel mundial")

1. **Jerarquía despiadada.** En cada pantalla hay UNA cosa más importante; se le da el peso visual
   (tamaño/contraste/espacio) y todo lo demás retrocede. Si todo grita, nada se oye.
2. **El espacio en blanco es un material**, no un sobrante. Densidad decidida a propósito por
   pantalla (un dashboard denso y un lector aireado pueden convivir en la misma app con los mismos tokens).
3. **Tipografía con carácter.** La familia tipográfica lleva la personalidad (serif editorial,
   mono técnico, humanista cálida…). Inter-por-defecto-en-todo es la firma del look genérico.
4. **Color con intención.** Pocos colores, con roles; el acento se gasta con avaricia (CTAs,
   estados, datos clave). Nada de gradientes decorativos porque sí.
5. **Motion sutil y con física** (150–300ms, easing natural, `prefers-reduced-motion` respetado):
   el movimiento explica causalidad (de dónde vino, a dónde va), no decora.
6. **Microcopy es diseño**: español llano, mensajes de carga que dicen qué pasa, errores que dicen
   qué hacer. El texto por defecto de la librería nunca sobrevive al sprint.
7. **Los 5 estados diseñados** (vacío/cargando/error/éxito/contenido real) — el estado vacío es la
   primera impresión de la app: se diseña, no se rellena con un ícono gris.
8. **Detalle de borde**: alineación óptica (no solo matemática), tabular-nums en cifras, focus
   rings coherentes con la paleta, esquinas y sombras de la misma familia en toda la app.

**Anti-patrones (el "look IA genérica" — prohibidos):** shadcn sin personalizar; gradiente
violeta/azul por defecto; emojis como iconografía; grid de cards idénticas como respuesta a todo;
sombras pesadas en todo; hero centrado con dos botones para cualquier landing; bordes redondeados
XL uniformes; texto placeholder tipo "Lorem" o inglés residual.

## 3. Claude Design integrado — cuándo y cómo (herramienta viva, no superficie aparte)

Claude Code se integra **nativamente** con claude.ai/design vía la herramienta `DesignSync` y la
skill `/design-sync` (sync **bidireccional e incremental**, con plan aprobado antes de escribir).
Setup por app: **1 repo ↔ 1 proyecto Design System** en claude.ai/design (tipo
`PROJECT_TYPE_DESIGN_SYSTEM`, inmutable al crear — verificar con `get_project` antes de push).

| Situación | Flujo |
|---|---|
| **App nueva sin prototipo** (exploración) | El usuario explora pantallas en claude.ai/design (canvas/Vision Mockups) → desde el repo se **lee** el proyecto (`list_files`/`get_file`) → se extraen tokens y patrones → nace `design-system.md` |
| **Librería local → canvas** (ver e iterar componentes reales) | `/design-sync` push: los componentes del repo suben al proyecto y quedan como cards del Design System pane (`@dsCard`); el usuario los revisa/itera visualmente |
| **Pantalla nueva a mitad de camino** | Se diseña en el canvas del proyecto de la app **con los componentes reales ya sincronizados** → se lee y se implementa |
| **Refinamiento visual de un sprint** | push → iterar en canvas → pull incremental (un componente por vez, plan aprobado) |

Reglas: el **código del repo es la fuente de verdad** (el proyecto Design es espejo/mesa de
trabajo); el sync es **snapshot** (re-correr `/design-sync` tras cambios, no es tiempo real);
sync incremental — nunca reemplazo total; los mockups exportados de exploraciones se archivan en
`referencias-ui/<slug>/` de la planeadora (READ-ONLY, como los 4 legados).

## 4. Gate de revisión de diseño (parte del DoD — cada sprint con UI)

Antes del merge, correr este checklist sobre la **preview real** (no screenshots del código):

- [ ] Fiel a `design-system.md`: cero valores mágicos, componentes canon, tokens respetados.
- [ ] **El checklist entero se corre por CADA tema/paleta de la app** (claro Y oscuro, paletas
      duales) — un gate mono-tema deja pasar contrastes rotos (habla S1: 3.1:1 en oscuro).
- [ ] Jerarquía: en cada pantalla nueva se identifica en <3 segundos qué es lo importante.
- [ ] Los 5 estados existen y están diseñados (el vacío no es un placeholder gris).
- [ ] Densidad y ritmo de espaciado consistentes; alineación óptica revisada.
- [ ] Motion sutil, con propósito, y desactivable (`prefers-reduced-motion`).
- [ ] Microcopy en español llano; cero texto default de librería o inglés residual.
- [ ] Cero anti-patrones del § 2 (auto-auditarse honestamente contra la lista).
- [ ] Responsive real: móvil 360–420 y desktop ≥1024 revisados a mano (+ orientación si aplica).
- [ ] **El usuario aprobó la preview visualmente** — es quien firma "nivel mundial"; su feedback
      se anota en la bitácora del sprint.

Ítem rojo ⇒ se corrige antes del merge o se registra como deuda de diseño explícita en el summary
(con sprint de pago), igual que cualquier estándar.
