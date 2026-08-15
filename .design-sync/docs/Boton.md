---
category: Primitivas
---

# Boton

Dos variantes y ni una más. **Una sola acción principal por pantalla**: el acento se gasta con
avaricia, y dos botones `principal` a la vista significan que no está claro qué se espera del
usuario.

| Prop        | Tipo                                      | Por defecto   |
| ----------- | ----------------------------------------- | ------------- |
| `variante`  | `"principal" \| "discreto"`               | `"principal"` |
| `className` | `string`                                  | `""`          |
| …resto      | `ButtonHTMLAttributes<HTMLButtonElement>` | —             |

- `principal` — acento sólido. La acción que la pantalla espera.
- `discreto` — solo borde. Todo lo demás.

**Todo botón lleva su icono** (ver el grupo Iconos), y el icono va primero, antes del texto.

Para un enlace que debe verse como acción, usa `clasesDeBoton(variante)` en un `<a>` en vez de
envolver el enlace en un botón.

```jsx
<Boton variante="principal"><IconoTransformar />Transformar el archivo</Boton>
<Boton variante="discreto"><IconoAtras />Volver</Boton>
```
