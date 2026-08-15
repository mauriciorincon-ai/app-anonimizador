---
category: Primitivas
---

# InsigniaDeCerteza

Cuánta confianza tiene Velo en haber clasificado bien una columna. Es una pieza de **honestidad
medida**: la app dice lo que sabe y con qué certeza, y nunca presenta una inferencia como un hecho.

| Prop      | Tipo                         |
| --------- | ---------------------------- |
| `certeza` | `Certeza \| "sin-confirmar"` |

`"sin-confirmar"` no es un fallo ni un estado vacío: es la respuesta honesta cuando la evidencia no
alcanza. Muéstralo, no lo escondas. Las etiquetas viven en `ETIQUETAS_DE_CERTEZA`.

```jsx
<InsigniaDeCerteza certeza="alta" />
<InsigniaDeCerteza certeza="sin-confirmar" />
```
