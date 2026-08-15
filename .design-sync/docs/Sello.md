---
category: Primitivas
---

# Sello

El sello «Nada sale de este navegador» — la identidad visible de Velo, no un adorno. Va en el
encabezado de toda pantalla y en el pie de los informes descargables.

**Nunca lo pongas suelto como decoración.** Afirma algo concreto sobre el producto (que los datos
no viajan) y repetirlo donde no aplica lo devalúa.

| Prop       | Tipo      | Por defecto |
| ---------- | --------- | ----------- |
| `compacto` | `boolean` | `false`     |

- `compacto={false}` — versión de encabezado, con la frase completa.
- `compacto` — una línea con la marca y el texto corto, para pies y barras estrechas.

```jsx
<Sello />
<Sello compacto />
```
