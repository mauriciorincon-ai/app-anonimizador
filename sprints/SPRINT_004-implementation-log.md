# Sprint 004 · El cierre — bitácora de implementación

> Último sprint del ciclo H1. Velo ya ve, transforma y devuelve; este sprint entrega lo que hace el
> trabajo **defendible** — el certificado, la bitácora y los estimadores — más los dos entregables
> de cierre de ciclo y el gate ⭐ acumulado, que no se difiere.

Rama `sprint-004/el-cierre`, desde `origin/main` en `84324c8`.

---

## Fase 0 — Deuda del kit y del ciclo

### El delta del kit v1.15.2

El único punto: **el §4 se busca por promesa aplazada, no por la palabra de la feature.** Es la
regla que nació de mi propio S3, donde el inventario buscó «irreversible» y se le escaparon las dos
frases vivas porque decían «revertir» y «camino de vuelta». Aplicado abajo, y con una vuelta de
tuerca que el delta no traía y que este sprint necesitaba.

### Pago de deuda 1 · B2 — la carga duplicada del contrato

Declarada en el S2, aplazada al S3, aplazada al S4 «con el certificado». Se paga aquí, y **la
verificación previa importa tanto como el borrado**: `mondrian`, `diversidad`, `colisiones` y
`pendientesDeMondrian` cruzaban la frontera del worker con **cero lectores** en `components/`,
`app/` y `lib/`.

Lo que las hacía innecesarias no es que sobraran: es que **la frontera llevaba la materia prima y
la conclusión sacada de ella**. `balanceDelTratamiento` consume las cuatro **dentro del worker** y
de ahí salen las salvedades del balance, que son lo que la pantalla lee. Mandar además los insumos
era ofrecerle a la página que sacara sus propias conclusiones de datos que nadie había ordenado ni
clasificado.

De regalo cayó `ResumenDeMondrian` —el `Omit` que existía para que la tabla generalizada no
cruzara— y con él la proyección campo a campo del worker. **La defensa más barata contra que un
dato cruce sigue siendo que no cruce.**

**El pago no es el borrado, es la guardia.** En `tests/unit/taller.test.tsx`:

```ts
const CLAVES_DEL_RESULTADO: Record<keyof ResultadoDeTransformacion, true> = { … };
```

Un `Record<keyof …, true>` exige **todas** las claves y **solo** esas, así que añadir un campo al
contrato **rompe la compilación** y borrarlo también. Es más fuerte que la lista de claves en
tiempo de ejecución que el S3 puso sobre `ResumenDelRegreso`: aquella la puede esquivar un
`as unknown as` en el fixture —que es exactamente cómo estos cuatro campos sobrevivieron dos
sprints—, esta no. Cuando falle, la pregunta no es «¿cómo lo arreglo?» sino **«¿quién lee el campo
nuevo?»**.

### Pago de deuda 2 · `esDeLaMismaLlave`

**Borrada.** Se escribió en el S3 para el estado «esta bóveda es de otra llave» y nunca tuvo
llamador, porque no tenía segundo operando: en `/regreso` no hay llave HMAC cargada —el regreso
ocurre semanas después, en otra sesión, sin proyecto abierto—.

Y al mirarla de cerca, la función no solo era inútil: **habría sido peor que lo que ya existe.** La
pregunta que el usuario necesita respondida es «¿esta bóveda es de este archivo?», y la contesta
`restaurar()` con `reconocimiento: "ninguno"`, mirando el **contenido**. Una bóveda de la misma
llave y otro archivo distinto falla igual — y la comparación de huellas la habría dado por buena.

`huellaDeLlave` se queda en la bóveda y se sigue enseñando: sirve para que una persona reconozca de
qué proyecto es. Lo que no existe es la comparación automática que nadie pedía.

### `/diagnostico` y `/bitacora` entran al gate

`lighthouse-urls.json` era `["/", "/transformar", "/regreso"]`: **`/diagnostico` llevaba tres
sprints sin que el gate la mirara**, desde el sprint que la creó. Entra ahora, junto con la ruta
nueva.

`/bitacora` nace como andamio declarado —encabezado y un párrafo que dice «en construcción», sin
controles muertos ni esqueleto gris—, por la lección que el S2 y el S3 pagaron dos veces: un número
que aparece el día del PR llega tarde para arreglarlo. `/transformar` cayó a 0,88 por llevar el
motor en el bundle; `/regreso` a 0,90 por un salto de contenido de 0,107. Los dos se supieron
cuando ya había pantalla que rehacer.

**Números de partida, mediana de 3 corridas, con los dos asserts en verde:**

| Ruta           | Rendimiento | A11y | Best practices | SEO  |
| -------------- | ----------- | ---- | -------------- | ---- |
| `/`            | 0,95        | 1,00 | 1,00           | 1,00 |
| `/diagnostico` | **0,93**    | 1,00 | 1,00           | 1,00 |
| `/transformar` | 0,93        | 1,00 | 1,00           | 1,00 |
| `/regreso`     | 0,93        | 1,00 | 1,00           | 1,00 |
| `/bitacora`    | 0,93        | 1,00 | 1,00           | 1,00 |

**`/diagnostico` no nació en rojo**, que era la pregunta abierta del riesgo 6 del plan. Se anota
igual: llevaba tres sprints sin evidencia, y «probablemente está bien» no es una medición.

### §4 — el inventario de frases caducadas, con sus dos barridas

**Barrida 1, por vocabulario** (`todavía no`, `aún no`, `por ahora`, `de momento`, `mientras
tanto`, `próximamente`, `llega después`, `en esta versión`, `más adelante`, `no se puede`):
**limpia**. Los aciertos son comentarios de código, un mensaje de estado legítimo («la política pide
seudónimos y todavía no hay llave» describe un estado real y transitorio, no una promesa aplazada) y
límites declarados que siguen siendo ciertos.

**Barrida 2, por estructura** — y aquí está lo que la primera no puede ver. **Una sección entera
puede ser una promesa aplazada sin usar una sola palabra del vocabulario.** Dos encontradas:

| Dónde                                  | Qué es                                                                                                                  | Cuándo caduca |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------- |
| `docs/MANUAL-DE-USO.md § Lo que viene` | Promete «el certificado» y «la bitácora de tratamientos» como futuro. Ni un `todavía no` en todo el párrafo.            | Fases 1 y 4   |
| `README.md § Qué hace hoy`             | Enumera por sprint: «Sprints 001–003 · El diagnóstico, el disfraz y el regreso». Verdadero hoy, falso el día del merge. | Fase 4        |

**El corolario que este sprint añade al patrón, y que la Fase 0 no habría visto sin buscarlo:** hay
tres formas de prometer un futuro, no una. Por **vocabulario** («todavía no»), por **título de
sección** («Lo que viene») y por **enumeración con fecha implícita** («Sprints 001–003»). La tercera
es la más traicionera porque **no promete nada: se queda quieta mientras el producto avanza**, y una
lista que no se actualiza miente por omisión sin haber cambiado una letra.

Se pagan al final de la fase que las vuelva falsas, no al final del sprint — que es la corrección
que el S3 se ganó.

### Verificación de la Fase 0

| Criterio del plan                     | Resultado                                                              |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint`        | ✅ limpios                                                             |
| `pnpm test`                           | ✅ **644 verdes, 1 saltada**, con las dos guardias nuevas del contrato |
| `CI=1 pnpm test:e2e`                  | ✅ **88 passed, 2 skipped, cero flaky**                                |
| Los cinco números de partida anotados | ✅ arriba, con los dos asserts en verde                                |
| B2 pagada                             | ✅ cuatro campos fuera, con guardia de compilación                     |
| `esDeLaMismaLlave` pagada             | ✅ borrada, con su razón escrita en el hueco que dejó                  |
| Inventario §4 con su calendario       | ✅ dos barridas, dos hallazgos, ambos con fase asignada                |

---

## Fase 1 — El certificado

### Desviación del plan

El plan aprobado decía **`src/engine/certificado.ts`**, archivo nuevo. **No se creó**, y el
certificado evolucionó dentro de `engine/reporte.ts`. La razón salió de leer el código, no de la
comodidad:

`construirReporte` sirve **dos** documentos —el diagnóstico del S1 y el del tratamiento— y comparten
la envoltura entera: `ESTILOS`, `SELLO`, `escapar`, el formato de cifras, la tabla columna por
columna, la sección de riesgo, la del advisor y el pie. Todo eso es **privado del módulo**. Un
archivo aparte obligaba a una de dos cosas: **exportar diez internos** (convertir en API pública lo
que hoy se puede cambiar sin miedo) o **duplicar la envoltura** — y dos documentos con dos
envolturas es exactamente cómo empiezan a decir cosas distintas. Este repo lleva dos sprints
persiguiendo documentos que se contradicen entre sí; crear el tercero a propósito habría sido raro.

Lo que sí ganó identidad propia: `DatosDelTratamiento` con las dos huellas, `seccionDeVerificacion`,
`nombreDelCertificado` y el componente `descarga-del-certificado.tsx`. El documento se llama
certificado donde el usuario lo lee.

### El párrafo que se disculpaba, sustituido por la cosa

El hallazgo más bonito de la fase estaba escrito en el código desde el S2. El documento llevaba
esto:

> **Esta huella no es la del archivo que se entrega.** Es la del original… El archivo tratado es
> otro archivo y tiene otra huella.

Sincero, y **por eso mismo era la prueba de que faltaba algo**: un documento que tiene que explicar
lo que no puede demostrar está señalando su propio agujero. El S4 no añade la huella al lado de la
disculpa — **la sustituye**. Y el test que custodiaba aquella frase ahora custodia que no pueda
volver: si alguien la reintrodujera junto a las dos huellas, el documento se contradiría a sí mismo,
que es el A2 que la auditoría del S3 encontró en el manual.

### La huella de salida, y la afirmación que había que probar

Se calcula **mientras se arman los trozos** del CSV, no releyendo el `Blob`: el peor caso son ~130
MB y una segunda pasada costaría recorrerlos otra vez. A la página cruza la huella —64 hex—, igual
que ya cruzaba la del archivo de entrada desde el S1; **el `Blob` sigue saliendo como asa opaca y el
ADR-005 no se toca**.

Ese atajo descansa en una afirmación sobre codificación que es **fácil de escribir en un comentario
y difícil de verificar leyendo**: que `TextEncoder().encode(trozo)`, trozo a trozo, da exactamente
los bytes que el navegador escribe en el disco. Si fuera falsa, el certificado declararía una huella
que no coincide — y el defecto sería **invisible en pantalla**: el documento se vería perfecto y solo
fallaría cuando alguien lo comprobara, que es justo lo que promete que se puede hacer.

`tests/unit/huella-de-salida.test.ts` la prueba con lo que rompe las suposiciones: acentos y `ñ` (dos
bytes), emojis y banderas (cuatro bytes y pares sustitutos), cortes en sitios incómodos, trozos
vacíos, y la comprobación contra un `Blob` de verdad. Más la otra dirección —un byte distinto cambia
la huella— sin la cual una implementación que devolviera una constante pasaría todo lo demás.

### El estado que el sprint estrena

**El certificado no puede existir antes que el archivo.** No es una limitación incómoda: es la
verdad del artefacto —sin archivo no hay huella de salida— y por eso el paso 6 lo dice con esas
palabras en vez de enseñar un botón muerto:

> El certificado lleva la huella SHA-256 del archivo tratado, y esa huella no existe hasta que el
> archivo existe.

### Lo que se verifica desde fuera de Velo

`tests/e2e/certificado.spec.ts` hace lo que hará un auditor: descarga el CSV y el certificado y
calcula el SHA-256 con **`node:crypto`**, que no comparte una línea con `lib/sha256.ts`. Si el motor
de hash de Velo tuviera un defecto, un test que lo verificara con ese mismo motor pasaría tan
tranquilo.

### Un test que falló por su instrumento, no por su sujeto

El primer intento de «el certificado no llama a nadie» abría el HTML con `page.route("**/*")` y la
red interceptada. Falla siempre: el patrón **aborta también la navegación `file://` del propio
documento**. Se cambió por la comprobación sobre el texto, que es más directa y no tiene esa trampa
— el patrón que el S2 ya había dejado probado para el reporte. Se anota porque el síntoma (`goto`
falla) no se parece nada a la causa (el test se aborta a sí mismo).

### Verificación de la Fase 1

| Criterio del plan | Resultado |
|---|---|
| Dos huellas distintas y correctas | ✅ y comprobadas contra `node:crypto`, no contra sí mismas |
| Recalcular a mano coincide con la de salida | ✅ e2e con el archivo real descargado |
| Ni una celda del archivo en el documento | ✅ barrido con una cédula del fixture |
| Dos generaciones con la misma fecha, byte-idénticas | ✅ el test del S2 sigue verde sin tocarlo |
| Se abre sin internet | ✅ sin `http`, sin `<script>`, sin `<link>`, sin `url(` |
| Cobertura >80 % | ✅ |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **651 verdes, 1 saltada**.
`CI=1 pnpm test:e2e`: **94 passed, 2 skipped, cero flaky**.

**Nota sobre el tipo:** hacer `sha256DeSalida` y `nombreDeSalida` obligatorios rompió **once** sitios
de test a la vez. Se anota como señal, no como molestia: si hubieran sido opcionales, el certificado
habría podido construirse sin huella de salida y nadie se habría enterado.

---

## Fase 2 — La bitácora

### El sobre cifrado se extrajo, y los tests de la bóveda son la prueba

La bitácora necesitaba **exactamente** el formato del `.velo` con otro contenido dentro. Se extrajo
`lib/archivo-cifrado.ts` en vez de duplicarlo, y la razón no es «no te repitas»: **una equivocación
en cripto duplicada son dos equivocaciones que se arreglan por separado, y la segunda se olvida.**
Subir las iteraciones, endurecer la derivación o corregir un fallo del modo tiene ahora un solo
sitio y dos archivos que se benefician.

**La prueba de que la extracción no cambió conducta: los 28 tests de la bóveda pasaron sin
tocarse.** Ni una aserción, ni un fixture. Si hubiera hecho falta editarlos, el refactor no habría
sido un refactor.

Lo que NO se comparte, y por qué se separa:

| | Bóveda | Bitácora |
|---|---|---|
| Palabra mágica | `VELO` | `VLOG` |
| Extensión | `.velo` | `.velolog` |

La palabra mágica es la **defensa** —abrir una donde se esperaba la otra se rechaza **sin descifrar
nada**—; la extensión es la **cortesía**, porque el selector filtra y la equivocación se evita antes
de ocurrir. Se separan porque es **el error más probable del usuario**: dos archivos cifrados de la
misma app, guardados el mismo día. Contestarle «frase incorrecta» lo mandaría a probar frases media
hora. Tiene su test.

### Zod aquí, a mano en la bóveda — y no es incoherencia

La bóveda valida a mano porque puede traer **480.000 pares** y pasarlos por un esquema significa una
validación por cadena sobre la única estructura del producto que llega a medio millón de entradas.
Una bitácora son decenas o cientos de entradas de diez campos: exactamente el terreno donde
`politica.ts` ya usa Zod. **Copiar la validación a mano aquí habría sido heredar el precio sin
heredar el motivo.**

### La entrada guarda las dos puntas, no la reducción

La decisión menos obvia del tipo, y viene de la lección más cara del ciclo. «Bajó del 30 % al 2 %»
es cierta y puede ser engañosa; el balance del S2 tuvo que aprender a viajar con sus salvedades. Una
bitácora que guardara la reducción **compuesta** repetiría el error **justo donde más dura**: un
registro que se lee meses después, sin la pantalla al lado.

Así que la entrada guarda `unicosAntes` y `unicosDespues` por separado —dos hechos, no una
conclusión— y arrastra el `esTitular` que el balance ya había decidido, en vez de re-decidirlo con
menos información y meses de retraso.

### «No reescribe las anteriores» — lo que no puede significar

No puede significar bytes: AES-GCM exige IV único, así que el archivo entero cambia cada vez, por
diseño. Quien lea la DoD esperando un `append` al final del archivo se encontraría otra cosa, y por
eso queda escrito en el ADR.

Significa lo que importa y lo que se prueba: **la serialización EN CLARO de las N entradas previas
es byte-idéntica tras añadir la N+1.** Con su test hermano —que `anadirEntrada` no mute—, sin el
cual el primero podría estar comparando un objeto consigo mismo.

→ **ADR-007 · La bitácora: archivo propio, aparte de la bóveda.**

### Verificación de la Fase 2

| Criterio del plan | Resultado |
|---|---|
| Tres entradas sobreviven crear → cifrar → cerrar → abrir, en orden | ✅ |
| Añadir no reescribe las anteriores | ✅ probado en claro, más el test de no-mutación |
| El archivo en disco no lleva un nombre en claro | ✅ barrido de bytes: ni nombres, ni hashes, ni la palabra `entradas` |
| Frase incorrecta con su mensaje | ✅ y distinguida de «se descifró pero no es una bitácora» |
| Cobertura >80 % | ✅ `lib` en 95,4 % · `engine` en 98,9 % |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **676 verdes, 1 saltada** (+25).
`CI=1 pnpm test:e2e`: **94 passed, 2 skipped, cero flaky**.
