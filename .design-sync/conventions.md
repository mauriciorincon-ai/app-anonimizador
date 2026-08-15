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
