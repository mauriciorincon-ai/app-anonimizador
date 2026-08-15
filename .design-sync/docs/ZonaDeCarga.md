---
category: Primitivas
---

# ZonaDeCarga

La aduana: por donde entra el archivo. **Solo se usa en la portada.**

Acepta arrastre **y** un `<input type="file">` real y accesible — nunca solo arrastre, que deja
fuera el teclado y los lectores de pantalla.

| Prop           | Tipo                      |
| -------------- | ------------------------- |
| `estado`       | `EstadoDeSesion`          |
| `onArchivo`    | `(archivo: File) => void` |
| `onReintentar` | `() => void`              |

Es un componente **controlado por el estado de la sesión**: `estado.fase` decide qué se ve —
`inicial` (la zona), `analizando` y `listo` (el progreso), `error` (el motivo, con qué hacer). No
mantiene el archivo por dentro; lo entrega por `onArchivo` y la pantalla decide.

El archivo **nunca sale del navegador**: se procesa en un Web Worker. Cualquier diseño que sugiera
una subida a un servidor contradice el producto.

```jsx
<ZonaDeCarga
  estado={{ fase: "inicial" }}
  onArchivo={recibir}
  onReintentar={reiniciar}
/>
```
