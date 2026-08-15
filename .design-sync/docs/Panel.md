---
category: Primitivas
---

# Panel

Contenedor de sección: etiqueta opcional arriba, título, contenido y **nota al pie**.

**La nota se pinta en el PIE, y no es adorno de plantilla.** Es donde viven los topes y los alcances
declarados («el advisor miró 6 de 24 columnas»). Un tope silencioso se lee como «lo revisé todo», y
esa es justo la exageración que este producto no puede permitirse. Nunca escribas en la nota algo
como «lo de arriba» — se lee lejos de lo que describe.

| Prop        | Tipo        | Requerido |
| ----------- | ----------- | --------- |
| `titulo`    | `string`    | sí        |
| `children`  | `ReactNode` | sí        |
| `etiqueta`  | `string`    | no        |
| `nota`      | `ReactNode` | no        |
| `className` | `string`    | no        |

```jsx
<Panel
  etiqueta="Paso 2"
  titulo="La llave del proyecto"
  nota="Se derivó con 600.000 vueltas de PBKDF2."
>
  …
</Panel>
```
