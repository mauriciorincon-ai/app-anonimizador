---
category: Iconos
---

# Iconos

19 iconos de trazo sobre rejilla de 24, grosor 1,5, con `currentColor` y tamaño en `em` — así el
icono siempre pesa lo mismo que el texto que acompaña.

| Prop        | Tipo                  |
| ----------- | --------------------- |
| `className` | `string \| undefined` |

**El tamaño NO se cambia con `size-*` ni con `h-*`/`w-*`.** El componente fija `h-[1.05em] w-[1.05em]`
y empata en especificidad con cualquier utilidad que le pases, así que gana el orden del CSS y no tu
clase. El tamaño lo manda **el `font-size` del padre** — que es justamente lo que hace que el icono
pese siempre lo mismo que el texto al que acompaña. Usa `className` para el color o el margen.

## Las tres reglas, que no son de gusto

1. **Ni candado, ni escudo, ni llave — vetados.** Donde la acción es cifrar, el icono nombra **lo
   que el usuario hace** (añadir, guardar), no la criptografía que ocurre debajo.
2. **Nada que sugiera subida ni nube.** «Subir un archivo» es precisamente lo que Velo NO hace: una
   flecha hacia una nube contaría una mentira sobre el producto en el primer botón que se ve.
3. **El texto nunca se va.** El icono es redundancia útil para reconocer la acción de un vistazo; un
   icono solo, sin etiqueta, es un jeroglífico. Por eso van `aria-hidden`: el lector de pantalla ya
   lee la etiqueta, y oírla dos veces es peor que no ver el dibujo.

## Cuál usar

`IconoTabla` archivo de datos · `IconoLupa` diagnosticar · `IconoTransformar` transformar ·
`IconoDescargar` descargar · `IconoExportar` / `IconoImportar` sacar y meter · `IconoOjo` ver ·
`IconoVolver` restaurar · `IconoAtras` / `IconoAdelante` navegar · `IconoCuaderno` bitácora ·
`IconoArchivador` bóveda · `IconoCertificado` certificado · `IconoDocumento` informe ·
`IconoBarras` medición · `IconoMas` añadir · `IconoEquis` quitar · `IconoAbrir` abrir un archivo ·
`IconoReiniciar` empezar de nuevo.

```jsx
<Boton variante="principal">
  <IconoDescargar />
  Descargar el archivo tratado
</Boton>
```
