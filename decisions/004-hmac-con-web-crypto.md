# ADR-004 — El seudónimo se calcula con Web Crypto, no con SHA-256 propio

- **Estado:** aceptada
- **Fecha:** 2026-08-10
- **Sprint:** 002 · Fase 0 (Spike A)
- **Decide:** que la seudonimización irreversible del S2 use `crypto.subtle.sign` (HMAC-SHA256
  nativo), y no un HMAC síncrono construido sobre el `Sha256` propio del repo.

## Contexto

La orden del S2 dice «HMAC-SHA256 con **Web Crypto**». Había una razón concreta para dudarlo antes
de escribir la Fase 2, y no era el rendimiento: **`crypto.subtle` es asíncrono y el motor de Velo
es síncrono y puro**. `clasificar`, `evaluarRiesgo` y el serializador canónico no devuelven
promesas, y el gate de determinismo del S1 se apoya en eso. Un `await` por valor podía contagiar
`async` hacia arriba y arrastrar al gate con él.

La alternativa era barata: el repo ya tiene **SHA-256 de FIPS 180-4** implementado y verificado
(`src/lib/sha256.ts`, escrito en el S1 porque `crypto.subtle.digest` no tiene forma de streaming).
HMAC encima de eso son 25 líneas de RFC 2104.

Y había una medición previa que apuntaba en esa dirección: en **Node 24**, `crypto.subtle.sign`
costaba 4,5 s por 500.000 valores esperando uno por uno, y 1,8 s en lotes. Con esos números, el
HMAC síncrono parecía ganar por goleada.

**Node no es el navegador.** Esa medición no podía decidir nada: `crypto.subtle` de Chromium
despacha la operación de otra manera, y ese despacho era justo la variable en duda.

## Medición

`scripts/spikes/spike-hmac.mjs`, **en Chromium** (el de Playwright), sobre 500.000 valores
**distintos** — el peor caso real, porque una columna de cédulas es casi única. Cada camino corre
sobre los 500.000 completos: nada de extrapolar desde una muestra, que dejaría al primero medido
pagando el calentamiento.

El SHA-256 que se compara es **el archivo del producto**, inyectado en la página con el quitador de
tipos nativo de Node 24 — no una copia que pudiera divergir.

| Camino                              | 500k valores | Por valor |
| ----------------------------------- | ------------ | --------- |
| **Web Crypto, `await` uno por uno** | **0,68 s**   | 1,37 µs   |
| **Web Crypto, lotes de 2.000**      | **0,62 s**   | 1,24 µs   |
| Síncrono sobre el `Sha256` del repo | 2,91 s       | 5,83 µs   |
| Síncrono con un `terminarBytes()`   | 3,28 s       | 6,55 µs   |

**Corrección:** las dos implementaciones dan el mismo digest en los 9 casos probados — cadena
vacía, cédula, NIT con guion, las tres fronteras del bloque de 64 bytes (63/64/65), acentos, emoji,
y una llave de 100 bytes (la rama que obliga a hashear la llave, y que casi nadie prueba).

Dos sorpresas que conviene dejar escritas:

1. **En el navegador el resultado es el OPUESTO al de Node.** Web Crypto es 4,4× más rápido que el
   JS síncrono en Chromium, cuando en Node era 2,5× más lento. Si el spike se hubiera corrido donde
   era cómodo, la decisión habría salido al revés.
2. **La variante «justa» resultó ser la más lenta.** Se añadió un `terminarBytes()` para no
   descartar la alternativa por culpa de las conversiones hex↔bytes que la API impone... y salió
   peor: el costo estaba en `parseInt` por byte, y esa variante lo paga dos veces en vez de una.
   Se deja medido para que nadie tenga que volver a suponerlo.

## Veredicto

**Web Crypto, como decía la orden.** Y el argumento que motivó el spike se desinfló al mirarlo de
cerca: **el contagio de `async` no ocurre**. El pipeline de transformación es código NUEVO; los
motores síncronos del S1 (`clasificar`, `evaluarRiesgo`) no calculan HMAC y no tienen por qué
enterarse. La frontera asíncrona cae exactamente sobre lo que se escribe en este sprint.

**Tampoco hace falta lotear.** Los lotes de 2.000 compran un 9 % a cambio de complejidad y de un
pico de 2.000 promesas vivas. Se usa `await` uno por uno, que es el código más simple de leer y de
verificar — y sobre el **diccionario de valores distintos**, no fila por fila, que es el regalo de
la representación columnar.

## Consecuencias

1. `src/engine/tecnicas/seudonimo.ts` usa `crypto.subtle.sign` y es **asíncrono**. Recibe la llave
   ya derivada; **no la deriva ni la genera** — `crypto.getRandomValues` está prohibido en
   `src/engine/` por el gate de determinismo, y con razón.
2. `src/lib/llave.ts` (fuera del motor) genera material de llave y deriva con **PBKDF2-600k**.
3. El `Sha256` propio **se queda donde está**, haciendo la huella del archivo en streaming, que es
   para lo que se escribió. El HMAC síncrono **no se construye**: existe medido y verificado en el
   spike, y ahí queda si algún día hace falta.
4. Presupuesto de la Fase 2: **~0,7 s por columna seudonimizada** de 500k valores distintos, dentro
   del worker. Se mide en el gate de rendimiento de este sprint, no se cita esta tabla.

## Nota de honestidad

Los números salen de una máquina de desarrollo. Escalan con el tamaño del dataset, no con la
máquina, y la distancia entre los dos caminos (4,4×) es lo bastante amplia como para que un equipo
más lento no cambie el veredicto. El código del spike **no entra al producto**: midió, dio su
veredicto, y su valor está aquí.
