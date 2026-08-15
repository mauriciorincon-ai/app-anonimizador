---
category: Primitivas
---

# MarcaDeSello

Solo el glifo del sello, sin texto. Existe para componerlo dentro de otra cosa (el propio `Sello`
lo usa); **no lo uses solo como logo**: sin su frase, la promesa que representa no se lee.

| Prop    | Tipo     | Por defecto |
| ------- | -------- | ----------- |
| `clase` | `string` | `""`        |

Hereda el color con `currentColor`, así que el tamaño y el tono se fijan desde `clase`.

```jsx
<MarcaDeSello clase="size-5 shrink-0 text-acento" />
```
