# Velo — cómo se construye con este sistema

Velo es una **aduana de datos**: anonimiza y des-anonimiza tablas **enteramente en el navegador**.
Esa promesa manda sobre el diseño. Dos consecuencias que no son estéticas:

- **Nada sugiere subida, nube ni servidor.** Ni iconos de nube, ni flechas hacia arriba, ni copy de
  «subiendo». El archivo nunca viaja, y la interfaz no puede insinuar lo contrario.
- **Nada promete anonimato absoluto.** Prohibido «100 % seguro», «anonimato garantizado»,
  «imposible de reidentificar». Velo **reduce** riesgo y lo **mide**. Y una cifra estimada jamás se
  presenta con la tipografía ni la jerarquía de una exacta.

## Envoltura y tema

**No hay provider ni contexto que envolver** — los componentes son puros y se usan directamente.
Lo único obligatorio es que `styles.css` esté cargado: ahí viven los tokens, las tres fuentes y el
CSS de los componentes.

**El tema oscuro es automático**, vía `@media (prefers-color-scheme: dark)` sobre `:root`. No hay
clase `dark` ni interruptor: los mismos tokens cambian de valor. No escribas variantes `dark:` —
usa el token y el tema se resuelve solo. El oscuro **no es el claro invertido**: es «estar dentro de
la bóveda», con papel `#0f1411` y acento más claro para conservar contraste.

## El idioma de estilo: utilidades de Tailwind con tema propio

Nada de shadcn/ui sin personalizar, y nada de colores crudos de Tailwind (`bg-slate-100`,
`text-gray-700`): **no existen en esta hoja**. El vocabulario completo es este.

| Familia     | Nombres reales                                                                        | Para qué                                          |
| ----------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Superficies | `bg-papel` · `bg-papel-hundido` · `bg-superficie`                                     | fondo de página, zona hundida, tarjeta            |
| Texto       | `text-tinta` · `text-tinta-suave` · `text-tinta-tenue`                                | principal, secundario, terciario                  |
| Bordes      | `border-borde` · `border-borde-control`                                               | decorativo y el de controles (≥3:1, WCAG 1.4.11)  |
| Acento      | `bg-acento` · `text-acento` · `bg-acento-tenue`                                       | **una sola acción principal por pantalla**        |
| Semánticos  | `alerta` · `aviso` · `sensible`, cada uno con su `-tenue`                             | error, advertencia, dato sensible                 |
| Radios      | `rounded-1` (4px) · `rounded-2` (8px) · `rounded-3` (12px)                            | —                                                 |
| Sombra      | `shadow-1` · `shadow-2`                                                               | casi no se usa: **separa el borde, no la sombra** |
| Tipografía  | `font-display` (Fraunces) · `font-sans` (IBM Plex Sans) · `font-mono` (IBM Plex Mono) | titulares · texto · valores y nombres de archivo  |

Los tokens crudos son `var(--papel)`, `var(--tinta)`, `var(--acento)`, `var(--borde-control)`,
`var(--radio-1..3)`, `var(--mov-1..3)`, `var(--curva)`, `var(--fuente-display|sans|mono)`. Úsalos
solo cuando no haya utilidad; la regla del repo es que **si un color, radio o duración no está ahí,
no se usa**.

**Foco visible, sin excepción**: `outline: 2px solid var(--acento); outline-offset: 2px`. Nunca
`outline: none` sin un reemplazo que mida ≥3:1.

## Dónde está la verdad

Lee `styles.css` y sus `@import` antes de estilar nada — es la hoja real, con los tokens en claro y
oscuro. Y lee el `.prompt.md` de cada componente: llevan las reglas que no se deducen del tipo (por
qué la nota del `Panel` va al pie, por qué `"sin-confirmar"` no es un fallo, las tres reglas del
icono).

## Un ejemplo idiomático

```jsx
<Panel
  etiqueta="Paso 3"
  titulo="El riesgo, medido"
  nota="El advisor miró 6 de 24 columnas: las que llegaron con al menos 30 valores distintos."
>
  <p className="text-tinta-suave text-[0.9375rem] leading-relaxed">
    Hay <strong className="text-tinta">412 filas</strong> que quedan solas en su
    clase.
  </p>
  <div className="mt-4 flex flex-wrap items-center gap-3">
    <Boton variante="principal">
      <IconoDescargar />
      Descargar el archivo tratado
    </Boton>
    <Boton variante="discreto">Ver el certificado</Boton>
  </div>
</Panel>
```

Fíjate en tres cosas: la **nota al pie declara el alcance** (un tope silencioso se lee como «lo
revisé todo»); hay **una sola** acción principal; y el botón **lleva su icono y conserva su texto**.

## Formularios — el idioma real, con sus clases exactas

No hay componente `Input` ni `Select`: la app usa **controles nativos con estas clases**, y son las
únicas correctas (verificadas contra la hoja compilada):

- **Etiqueta de campo**: `text-tinta block text-[0.9375rem]` — y `font-medium` si encabeza el campo.
- **Etiqueta de sección**: la clase propia `etiqueta` (versalitas de mono con tracking — el acento
  tipográfico de la app; es la que usa `Panel` por dentro).
- **Input de texto / contraseña / número**:
  `rounded-1 border-borde-control bg-superficie text-tinta mt-2 w-full max-w-md border px-3 py-2 text-[0.9375rem]`
- **Select**: igual que el input, con `max-w-[18rem] px-2 py-1.5 text-[0.875rem]`. Velo usa
  `<select>` **nativo** a propósito (teclado y lector de pantalla gratis) — no inventes dropdowns.
- **Checkbox**: `accent-acento mt-0.5 size-4 shrink-0`, dentro de un
  `<label class="text-tinta-suave flex items-start gap-2 text-[0.8125rem] leading-snug">`.

**El selector de archivo nunca es el control nativo a la vista** (mostraría chrome del navegador en
inglés): es un `<input type="file" class="sr-only">` con `aria-label`, disparado por un
`<Boton variante="discreto">` con su icono, y al lado una línea con el nombre elegido en `font-mono`
o «Ningún archivo elegido todavía.» en `text-tinta-tenue`.

**Las frases de paso jamás se muestran ni se guardan en la página** — el campo es `type="password"`
y su valor no se refleja en ningún otro sitio de la UI.
