# ADR-007 — La bitácora es un archivo cifrado propio, aparte de la bóveda

- **Estado:** aceptada
- **Fecha:** 2026-08-13
- **Sprint:** 004 · Fase 2
- **Decide:** dónde vive la memoria de los tratamientos, por qué va cifrada, por qué **no** va dentro
  de la bóveda, y qué significa exactamente «añadir una entrada no reescribe las anteriores».

## Contexto

El certificado (fase 1) prueba **un** tratamiento ante un tercero. La bitácora responde otra
pregunta, y es del usuario para sí mismo: **«¿qué he hecho yo con mis archivos?»** — meses después,
cuando alguien le pregunte qué entregó, cuándo y con qué política.

Es un artefacto nuevo, con un ciclo de vida distinto a todo lo que Velo tenía: **crece a lo largo de
meses** y sobrevive a proyectos, llaves y archivos.

## 1. Va cifrada, porque los nombres de archivo son sensibles por sí solos

Lo dijo el ADR-005 al hablar de la frontera del `Blob`, y aquí se cobra: `pacientes-oncologia-2026.csv`
**cuenta de qué va el contenido antes de que nadie lo abra**. Una bitácora es precisamente una lista
de esos nombres con sus fechas — un índice de a qué se dedica su dueño y sobre quién trabaja.

Un archivo en claro en la carpeta de Descargas sería, sin exagerar, el resumen ejecutivo de la
actividad del usuario. Va cifrada con el mismo sobre que la bóveda: AES-GCM-256 con IV único,
PBKDF2-600k, cabecera autenticada e iteraciones dentro del archivo.

`tests/unit/bitacora.test.ts` barre los bytes del archivo sellado y comprueba que no aparece ni un
nombre, ni un hash, ni la palabra `entradas`. Lo único legible es la palabra mágica.

## 2. Archivo propio, NO dentro de la bóveda

Las tres razones, en orden de peso:

- **Existe aunque no haya bóveda.** La bóveda solo nace si la política marcó columnas reversibles, y
  **muchos tratamientos no la crean**. Meter la bitácora dentro haría que registrar lo que hiciste
  dependiera de haber pedido poder deshacerlo — dos decisiones que no tienen nada que ver.
- **Tienen ciclos de vida distintos.** La bóveda es **por trabajo y por llave**: una por tratamiento
  reversible, y muere cuando su archivo deja de importar. La bitácora es **una sola y crece durante
  meses**, atravesando proyectos y llaves.
- **Mezclarlas hace que perder una sea perder las dos**, y son pérdidas de gravedad muy distinta.
  Perder la bóveda es perder la vuelta de un archivo; perder la bitácora es perder el registro de
  todo. Un archivo cuyo extravío cuesta las dos cosas es un punto único de falla que no compra nada.

**Corolario que la UI tiene que sostener:** son **tres secretos con tres alcances** —la frase del
proyecto (llave HMAC), la de la bóveda y la de la bitácora—, y reusarlos convertiría la filtración de
uno en la filtración de todo. La app no los propone iguales ni los rellena entre sí.

## 3. El sobre cifrado se extrajo; el contenido no

`lib/archivo-cifrado.ts` nace en este sprint con el formato que el S3 escribió para el `.velo`, y las
dos piezas lo usan. La razón no es «no te repitas»: **una equivocación en cripto duplicada son dos
equivocaciones que se arreglan por separado, y la segunda se olvida.** Subir las iteraciones,
endurecer la derivación o corregir un fallo del modo tiene ahora un solo sitio.

La prueba de que la extracción no cambió conducta: **los 28 tests de la bóveda pasaron sin tocarse.**

Lo que **no** se comparte:

|                | Bóveda                               | Bitácora                |
| -------------- | ------------------------------------ | ----------------------- |
| Palabra mágica | `VELO`                               | `VLOG`                  |
| Extensión      | `.velo`                              | `.velolog`              |
| Contenido      | correspondencia seudónimo → original | entradas de tratamiento |

La palabra mágica es la **defensa** —abrir una donde se esperaba la otra se rechaza sin descifrar
nada, con un mensaje que dice cuál es cuál—; la extensión es la **cortesía**, porque el selector de
archivos filtra y la equivocación se evita antes de ocurrir. Se separan a propósito: es el error más
probable del usuario (dos archivos cifrados de la misma app, guardados el mismo día) y merece algo
mejor que un «frase incorrecta» que le haría dudar de la frase y probarla diez veces.

## 4. «Añadir no reescribe las anteriores» — qué significa exactamente

**No puede significar bytes.** El archivo va cifrado con AES-GCM y un IV nuevo por sellado, así que
el archivo entero cambia cada vez, por diseño. Quien lea la DoD esperando un `append` de bytes al
final del archivo se va a encontrar otra cosa, y por eso está escrito aquí.

Significa lo que importa y lo que se prueba: **la serialización EN CLARO de las N entradas previas es
byte-idéntica después de añadir la N+1.** Una bitácora que «corrigiera» una entrada vieja al escribir
una nueva dejaría de ser un registro para ser una opinión sobre el pasado.

Es la misma frontera de determinismo que el ADR-006 estableció: lo reproducible es el claro, nunca el
cifrado.

## 5. La entrada guarda las dos puntas del riesgo, no la reducción

Decisión de honestidad, y la menos obvia del tipo. Una cifra de reducción sola —«bajó del 30 % al
2 %»— es cierta y puede ser engañosa; el balance del S2 tuvo que aprender a viajar con sus salvedades
para no mentir, y esa fue la lección más cara del ciclo.

Una bitácora que guardara la reducción **compuesta** repetiría el error justo donde más dura: un
registro que se lee meses después, sin la pantalla al lado. Así que la entrada guarda `unicosAntes` y
`unicosDespues` por separado —dos hechos— y arrastra el `esTitular` que el balance ya había decidido,
en vez de re-decidirlo con menos información.

## Consecuencias

- El usuario custodia **tres** archivos posibles: el anonimizado, la bóveda (si pidió vuelta) y la
  bitácora. La UI tiene que dejar claro cuál es cuál y que sus frases no se comparten.
- **Perder la frase de la bitácora es perder la bitácora.** Misma consecuencia aceptada y comunicada
  que la bóveda: no hay recuperación, y decirlo antes es parte del trato.
- La bitácora crece sin techo declarado. Se mide en la fase 4 con muchas entradas; si hace falta, se
  declara el tope con su número, como el ADR-003 hizo con Excel.
