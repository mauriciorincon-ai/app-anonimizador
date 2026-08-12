# ADR-005 — La frontera del worker sobrevive a la descarga: el Blob es un asa, no un dato

- **Estado:** aceptada
- **Fecha:** 2026-08-11
- **Sprint:** 002 · Fase 5
- **Decide:** cómo sale de Velo el archivo anonimizado sin que los datos crucen a la página.

## El problema

La regla dura nº2 dice que los datos del usuario jamás salen del navegador, y el S1 la implementó
con una frontera más estrecha que eso: **los datos crudos no salen ni del worker.** Hacia la página
viajan conteos, nombres de columna, proporciones y muestras enmascaradas. Ningún componente ha visto
nunca una celda.

Descargar rompe esa simetría, porque descargar exige bytes. Y la salida evidente —serializar el CSV
en el worker, mandar el string a la página, y que la página haga el `Blob`— **destruye la frontera
justo en el sprint que la pone a prueba**, sin que se note: la pantalla se vería idéntica. Decir
«nada cruza» mientras 130 MB de celdas del usuario pasan por `postMessage` sería precisamente la
mentira por composición que este sprint tiene prohibida.

## La decisión

**El worker construye el `Blob` y transfiere el `Blob`. La página hace `createObjectURL` y nunca lo
lee.**

Un `Blob` no es contenido: es una **referencia opaca** a un bloque de bytes que el agente de usuario
guarda por su cuenta. La página recibe un asa, la convierte en una URL `blob:` y la pone en un
`<a download>`. Quien copia los bytes al disco es el navegador, con su propio diálogo. En ningún
momento existe en el hilo principal una cadena, un `ArrayBuffer` ni un `TypedArray` con datos del
usuario.

Tres consecuencias que se siguen de eso y no de una preferencia:

1. **La página no puede leer el archivo aunque quisiera**, salvo llamando explícitamente a
   `blob.text()` / `arrayBuffer()` / `FileReader`. Eso convierte la regla en algo verificable: no
   hay que auditar «¿alguien miró el contenido?» sino «¿alguien llamó a una de esas tres cosas?».
   `tests/unit/privacidad.test.ts` barre `src/` buscándolas.
2. **Ninguna URL `blob:` sale a la red.** Es un origen opaco del propio documento; no hay petición,
   no hay servidor, no hay caché intermedia. El e2e de garantía de red lo comprueba escuchando toda
   la red durante la transformación **y la descarga**.
3. **El nombre del archivo no lo pone el original.** Sale `velo-anonimizado-<8 del hash de la
política>.csv`, decidido en la Fase 2: `pacientes-oncologia-2026.csv` cuenta de qué va el
   contenido antes de que nadie lo abra, y ese nombre viaja en el asunto de un correo.

## Por qué el CSV se arma por trozos

500.000 filas × 24 columnas son ~130 MB de texto. Concatenarlos en una sola cadena obliga a tener
dos copias vivas cada vez que el motor duplica el buffer interno. `new Blob([...trozos])` acepta la
lista y la junta **una vez**, en memoria nativa y fuera del heap de JavaScript. El worker acumula de
20.000 en 20.000 filas.

## La alternativa que se descartó, y por qué

**File System Access API** (`showSaveFilePicker` + escritura en streaming) evitaría materializar el
archivo entero: el usuario elige el destino y el worker escribe directo. Es mejor en memoria y sería
la opción obvia si Velo fuera solo-Chromium.

No entra porque **no existe en Firefox ni en Safari** (estado a agosto de 2026), y la ruta de respaldo
para esos navegadores sería exactamente este `Blob` — o sea, habría que construir las dos y mantener
las dos. Con el tope declarado del producto (500k filas) el `Blob` cabe con holgura. Queda archivado,
no descartado: el día que Velo necesite escribir archivos que no caben en memoria, esta es la puerta.

## Lo que este ADR NO resuelve

El `Blob` vive en memoria hasta que se revoca su URL. Si el usuario prepara el archivo y no lo
guarda, esos bytes siguen ahí hasta que cierra la pestaña o descarta la sesión. Es memoria, no
persistencia —nada tocó el disco—, pero conviene decirlo en vez de dar a entender que preparar el
archivo es gratis. La URL se revoca al desmontar la pantalla.
