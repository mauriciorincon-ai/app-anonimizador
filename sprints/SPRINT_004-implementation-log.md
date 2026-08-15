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

| Criterio del plan                                   | Resultado                                                  |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Dos huellas distintas y correctas                   | ✅ y comprobadas contra `node:crypto`, no contra sí mismas |
| Recalcular a mano coincide con la de salida         | ✅ e2e con el archivo real descargado                      |
| Ni una celda del archivo en el documento            | ✅ barrido con una cédula del fixture                      |
| Dos generaciones con la misma fecha, byte-idénticas | ✅ el test del S2 sigue verde sin tocarlo                  |
| Se abre sin internet                                | ✅ sin `http`, sin `<script>`, sin `<link>`, sin `url(`    |
| Cobertura >80 %                                     | ✅                                                         |

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

|                | Bóveda  | Bitácora   |
| -------------- | ------- | ---------- |
| Palabra mágica | `VELO`  | `VLOG`     |
| Extensión      | `.velo` | `.velolog` |

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

| Criterio del plan                                                  | Resultado                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Tres entradas sobreviven crear → cifrar → cerrar → abrir, en orden | ✅                                                                   |
| Añadir no reescribe las anteriores                                 | ✅ probado en claro, más el test de no-mutación                      |
| El archivo en disco no lleva un nombre en claro                    | ✅ barrido de bytes: ni nombres, ni hashes, ni la palabra `entradas` |
| Frase incorrecta con su mensaje                                    | ✅ y distinguida de «se descifró pero no es una bitácora»            |
| Cobertura >80 %                                                    | ✅ `lib` en 95,4 % · `engine` en 98,9 %                              |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **676 verdes, 1 saltada** (+25).
`CI=1 pnpm test:e2e`: **94 passed, 2 skipped, cero flaky**.

---

## Fase 3 — Los estimadores

`src/engine/riesgo-estimado.ts` + `tests/unit/riesgo-estimado.test.ts` + **ADR-008**.

La fase más delicada del ciclo, y por una razón concreta: aquí una fórmula mal copiada **no
revienta**. Devuelve un número plausible, del orden de magnitud correcto, que pasa cualquier
aserción de «hay una cifra entre 0 y 1». Así que la fase empezó donde el plan mandaba —en la
fuente— y no en el editor.

### Lo que se verificó antes de escribir una línea

| Qué                              | Cómo se verificó                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modelo de Benedetti–Franconi** | Citado **textualmente** desde Rinott & Shlomo (2007), arXiv:0708.0980 §2.2: «In the Argus model it is assumed that `F_k \| f_k ~ f_k + NB(f_k, π_k)`». Coincide con el modelo del que derivé las formas cerradas. |
| **Método de Zayatz**             | Descargado el informe original del Census Bureau (CENSUS/SRD/RR-91/08) y leído entero.                                                                                                                            |

**Y el primer hallazgo llegó ahí:** yo recordaba «Zayatz = hipergeométrica sobre `P(F=1|f=1)`».
El informe trae **dos** métodos propios y ninguno es exactamente eso. El §II usa submuestreo —habría
necesitado azar, que el gate de determinismo veta en `engine/`—; el §III usa la distribución de
tamaños de las clases de equivalencia, que es justo lo que `riesgo.ts` calcula desde el S1. Se
implementó el §III. **Si hubiera codificado de memoria, habría escrito otra cosa y le habría puesto
la cita de Zayatz encima.**

### La trampa numérica, y por qué está documentada en el código

De la definición se llega, integrando por partes, a la recursión que traen los manuales:

```
r_1 = (p/q)·ln(1/p)        r_f = (p/q)·( 1/(f−1) − r_{f−1} )
```

Amplifica el error por `p/q` en cada paso. Contrastada contra la suma directa de la binomial
negativa:

| p    | f   | recursión clásica | verdadero     |
| ---- | --- | ----------------- | ------------- |
| 0,99 | 5   | 0,198331**4862**  | 0,198331**0** |
| 0,90 | 50  | **−3,7×10³¹**     | 0,018035      |

El segundo caso es aparatoso y lo caza cualquiera. **El primero es el peligroso**: correcto hasta el
quinto decimal, falso en el sexto, y silencioso. Es exactamente el defecto que esta fase tenía que
no cometer.

El motor usa **dos caminos, cada uno donde es estable**, y un test los compara contra la suma
directa en todo el dominio:

- **p < ½** → la recursión ascendente, que ahí _contrae_ el error. Medida hasta clases de 500.000:
  error relativo máximo **8,5×10⁻¹⁴**.
- **p ≥ ½** → el desarrollo en (1−x) del integral, que da una serie de **términos todos positivos**
  —sin cancelación posible— con razón acotada por `q < ½`. Converge en 52 términos en el peor caso.
  Error relativo máximo **6,2×10⁻¹⁶**.

Hay un test que **reproduce el fallo de la recursión ingenua**. No protege un comportamiento:
protege una decisión, para que quien venga a «simplificar» el motor vea lo que costaría.

### Lo que la fuente publicó, y ahora es un test

La Tabla 4 del informe de Zayatz publica `Prob(1_s|C_p)` para C = 1..20 con N = 56.372 y n = 9.383.
Las 20 coinciden dentro de **0,001**. La tolerancia es una unidad del último decimal impreso y no
menos, porque **el redondeo de la tabla no es autoconsistente**: C = 1 publica 0,167 para 0,16645 y
C = 12 publica 0,269 para 0,26960. Son tablas calculadas a mano en 1991, y coincidir con las veinte
es la afirmación más fuerte que la fuente permite.

### La propiedad más bonita del módulo

**En censo, el estimado cae encima del exacto.** Si el usuario declara que su archivo _es_ la
población (N = n), Benedetti–Franconi devuelve `1/f` y Zayatz devuelve que todos los únicos
muestrales son poblacionales — es decir, exactamente `riesgoProsecutor` del S1.

No está programado como excepción: sale solo de que con p = 1 la binomial negativa es degenerada.
Los tests lo comparan contra `riesgoProsecutor` de verdad, no contra una constante.

### Un supuesto de la fuente que cambió cómo se testea

Zayatz declara **una sola** suposición sobre los datos: que sean **reales**, y advierte que el método
puede no funcionar «on simulated data sets with odd equivalence class structures».

Los fixtures de este repo son sintéticos **por regla dura** (repo público, jamás un dato real). O
sea: la fuente dice con todas las letras que este estimador **no se puede verificar comparándolo con
la verdad de un fixture generado**. El instrumento habitual del repo —correr sobre el kit de prueba
y mirar si cuadra— aquí _no vale_, y no por pereza sino por doctrina de la fuente.

Así que se verifica de cuatro maneras que no dependen del fixture: contra una **implementación
independiente** escrita en el propio test (suma directa y binomiales exactos, sin compartir una línea
con el motor), contra los **valores publicados**, contra los **límites** del modelo, y contra las
**invariantes** de la derivación (`θ ≤ 1` por construcción, `r_f ≤ 1/f` siempre).

### Cuándo Velo se niega — y con qué autoridad

`FRACCION_MINIMA_ZAYATZ = 0.1` **no es un número a ojo**: sale de la evaluación del propio informe.
Su Tabla 6 sobreestima siempre y cada vez más al bajar la fracción (46,754 % contra 39,073 % reales
con 0,1); su Tabla 8, con 1/100, llega a errar **por un factor de 10**.

Consecuencia aceptada y declarada en el ADR: **muchos archivos reales no verán esta segunda cifra**,
porque un archivo suele ser una fracción pequeña de su población. Benedetti–Franconi sí contesta
ahí, y esa asimetría —un estimador habla y el otro calla— es información sobre los datos, no un
defecto que haya que uniformar.

### La regla dura, puesta donde no se puede olvidar

El estimado no se compone con el exacto, y eso **vive en el tipo**: las cifras estimadas no son
`number` sino `CifraEstimada` —valor más intervalo—, así que `exacto.riesgoPromedio +
estimado.maximo` **no compila**. Lo fija un test con `@ts-expect-error`, el mismo instrumento que la
Fase 0 usó para el contrato del worker.

Y el intervalo tiene una variante `no-derivable` **con su razón**, que se usa de verdad: `promedio`
no lleva banda porque es la **esperanza** del modelo. Fijada la fracción, su valor es el que es; lo
que puede fallar es el modelo entero, y el error de un modelo no cabe en un intervalo de confianza.
Dibujar una habría sido más tranquilizador y falso.

→ **ADR-008 · El estimado no se compone con el exacto, y a veces no hay estimado.**

### Desviación del plan (menor, declarada)

El plan no pedía ADR en esta fase. Se escribió igual: el umbral del 10 % es una decisión de producto
**visible para el usuario** —le niega una cifra— y va a ser preguntada. Un umbral sin ADR se lee como
un número arbitrario.

### Deuda del ciclo cobrada aquí (§4, por estructura)

El barrido de promesas aplazadas de esta fase encontró que **la Fase 1 dejó el manual mintiendo**, y
es literalmente el patrón `un-gate-de-fase-no-ve-lo-que-la-fase-no-toca`: la Fase 1 construyó el
certificado y **no miró `docs/MANUAL-DE-USO.md`**.

Tres cosas falsas, ya pagadas:

1. `## Lo que viene` prometía **el certificado**, que existe y es alcanzable por la UI desde la
   Fase 1 (`taller.tsx:198`, con su e2e).
2. La sección del taller se llamaba «El reporte del tratamiento» y el producto dice «certificado».
3. Lo peor: un `>` citaba la **disculpa que la Fase 1 borró del propio documento** — «la huella no
   es la del archivo que descargas; si no cuadra, no es que el reporte esté mal». Hoy el certificado
   lleva **las dos huellas** y esa segunda **sí tiene que cuadrar**. El manual le estaba enseñando al
   usuario a ignorar justo la comprobación que el sprint construyó.

Lo que **no** caducó todavía y sigue en pie a propósito: la línea del §2 que dice que las cifras
exactas «en versiones futuras convivirán con estimadores de población». Los estimadores existen en el
motor, pero **el usuario no los ve hasta la Fase 4**. Pagarla ahora sería adelantar una verdad que la
pantalla no sostiene. Queda agendada para la Fase 4.

### Verificación de la Fase 3

| Criterio del plan                                         | Resultado                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Los dos estimadores citan su fuente                       | ✅ en el código, y verificada contra el original                      |
| Pasan sus tests de límites                                | ✅ censo → exacto · fracción → 0 → riesgo → 0 · monotonía en f y en p |
| Sin población declarada: «no calculable» **con su razón** | ✅ y nunca un cero                                                    |
| Ningún tipo permite sumar exacto con estimado             | ✅ `@ts-expect-error`                                                 |
| Cobertura >80 %                                           | ✅ **98,1 % sentencias · 100 % líneas** en el archivo nuevo           |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **709 verdes, 1 saltada** (+33).
Cobertura global: `engine` **98,77 %** · statements 97,95 % · branches 93,32 %.

---

## Fase 4 — UI e integración

La fase más ancha del sprint: dos pantallas nuevas, una ruta nueva y el estimado dentro del taller.

### La bitácora: dónde se escribe y dónde se lee

La decisión de diseño que gobierna todo lo demás: **el taller sabe QUÉ anotar, `/bitacora` sabe
CÓMO guardarlo.** El taller tiene el balance, las dos huellas y el hash de la política; la bitácora
es un archivo cifrado con su propia frase, y pedir esa frase en el taller habría metido un **cuarto
secreto** en la pantalla que ya gestiona la llave del proyecto y la de la bóveda.

Así que el taller deja la anotación montada en `lib/bitacora.ts` y navega. Estado propio y worker
propio, copiando el patrón que el S3 dejó probado con `lib/regreso.ts` — no se tocó `sesion.ts`,
que está construida alrededor de un archivo con un diagnóstico.

**La frase se pide también cuando la bitácora ya está abierta.** Podría guardarse tras abrirla y
ahorrarle al usuario escribirla otra vez; no se hace. Una frase retenida «por comodidad» es una
frase que vive en memoria toda la sesión, y la regla del S2 y el S3 es que entra y no se queda.

### Un permiso nuevo en la frontera, y por qué no la contradice

**Las entradas de la bitácora cruzan enteras a la página.** Es la primera estructura de Velo cuyo
contenido no se recorta, y conviene decir por qué no rompe la regla: lo que el worker guarda para sí
son los **datos de otras personas** —celdas, valores originales, correspondencias de la bóveda—. Una
bitácora no tiene nada de eso: son los apuntes del propio usuario sobre su propio trabajo, y la
pantalla que pidió abrirlos existe para enseñárselos. Nombres de archivo ya cruzaban desde el S1.

Lo que sigue sin cruzar es la **frase de paso**.

### El estimado: panel aparte, y eso es la regla

`RiesgoEstimadoEnPantalla` no está dentro del balance, y la separación no es maquetación. El balance
es todo exacto; colgarle un campo estimado habría hecho que la primera pantalla distraída los pintara
juntos. Van por caminos distintos —`estimacion` vive aparte de `balance` en el estado— y se pintan en
paneles distintos. Un tratamiento nuevo **invalida** la estimación anterior: describía otra tabla.

Y hay un test que mira lo que ningún test de cifras ve: **que ninguna cifra estimada use la
tipografía del titular exacto**. Dos números correctos con la misma letra ya se leen como si fueran
de la misma clase — la composición prohibida en su forma más silenciosa, porque nadie sumó nada.

### La pasada de capturas encontró tres cosas

Se corrió en los dos temas, leyendo las imágenes. No es un trámite: **los tres defectos eran
invisibles para los 724 tests**.

1. **El intervalo salía al revés.** Se pintaba `hasta` y luego `desde`, así que en porcentajes el
   rango se leía descendente («entre 9 % y 2 %») como si fuera una errata. Ahora va `desde` primero,
   que queda ascendente con los dos formatos: «entre 2 % y 9 %» y «entre 1 en 36 y 1 en 1».
2. **La nota decía «lo de arriba» y se pintaba abajo.** `Panel` coloca la nota en el pie, así que la
   frase que separa los dos planos aterrizaba DEBAJO de las cifras estimadas y parecía estar
   hablando de ellas — diciendo justo lo contrario de lo que quería decir. Se nombran los dos
   paneles por lo que son.
3. **`cerrarBitacora` era un exportado sin llamador**, que es lo que la §5 existe para impedir — y
   además hacía falta de verdad: sin él no había forma de abrir otra bitácora sin recargar.

### Alcanzabilidad, por el patrón que nació del propio S3

`/bitacora` **se alcanza desde la portada**, en su propio bloque («Y meses después»), y su e2e
**entra por clic desde `/`**. El S3 construyó el regreso entero con una suite que entraba siempre
por `goto("/regreso")`: la prueba de que la función existía era sólida y la de que era alcanzable no
existía.

### Verificación de la Fase 4

| Criterio del plan                                               | Resultado                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| El círculo del certificado, por la UI                           | ✅ ya cubierto en la Fase 1, sin regresión                                                                                 |
| La bitácora registra y recupera **en otra sesión de navegador** | ✅ contexto nuevo, sin memoria                                                                                             |
| Alcanzable desde la portada, e2e que entra por clic             | ✅                                                                                                                         |
| El estimado con modelo y supuesto en la misma línea             | ✅ con test que mira el bloque, no la página                                                                               |
| axe limpio en dos temas × dos tamaños                           | ✅ + dos escenarios nuevos (bitácora en reposo y en error)                                                                 |
| Lighthouse ≥90 en las **cinco** rutas                           | ✅ `/` 93 · `/diagnostico` 92 · `/transformar` 95 · `/regreso` 93 · **`/bitacora` 93** — a11y, best-practices y SEO en 100 |
| Bitácora con muchas entradas: long-tasks = 0                    | ✅ **2.000 entradas → 0 tareas largas, total 0 ms**                                                                        |
| e2e de red extendido a bitácora y estimado                      | ✅ test propio, con `.velolog` sellado y reabierto                                                                         |
| `prefers-reduced-motion`                                        | ✅                                                                                                                         |
| Pasada de capturas                                              | ✅ dos temas, tres defectos hallados y pagados                                                                             |

`pnpm typecheck` y `pnpm lint` limpios. `pnpm test`: **724 verdes, 1 saltada** (+15).
`CI=1 pnpm test:e2e`: **117 passed, 3 skipped, cero flaky** (+23).

**El tope de la bitácora queda medido y NO hace falta declararlo** (la pregunta que el ADR-007 dejó
abierta): 2.000 anotaciones —el doble de un uso intenso sostenido— se abren y se pintan sin una sola
tarea larga.

### Promesas aplazadas pagadas aquí

- `README.md § Qué hace hoy` decía «**Sprints 001–003**». Era la forma que la Fase 0 marcó como la
  más traicionera —la enumeración con fecha implícita, que _no promete nada y se queda quieta
  mientras el producto avanza_—. Ahora dice 001–004 y lista las tres funciones nuevas.
- `MANUAL-DE-USO.md § riesgo de reidentificación`: «en versiones futuras convivirán con estimadores
  de población» — dejada viva a propósito en la Fase 3 porque el usuario no los veía todavía. Ya los
  ve, y ya está pagada.
- `MANUAL-DE-USO.md § Lo que viene` prometía la bitácora. **Ya no queda ninguna promesa viva en el
  manual**, y la sección lo dice con esas palabras.
- El manual gana dos secciones nuevas (el riesgo estimado y la bitácora) y su cabecera deja de decir
  «Sprint 002».

---

## Fase 5 — Los dos cierres de ciclo

### La comprobación que iba primero, y por qué el plan la puso ahí

El riesgo 7 decía: *«`/design-sync` es el único paso que sale del repo y necesita sesión de
claude.ai. Esta sesión ya reportó conectores sin autorizar»*, con la mitigación de comprobar la
conexión **al empezar la fase, no al final** — para no gastarla y descubrir el bloqueo con el trabajo
hecho.

Comprobada de primero: la conexión responde y devuelve **seis proyectos de diseño**, todos del
usuario. **Ninguno es de Velo** — el dato que cambia la fase: `/design-sync` aquí **crea** el
proyecto, no actualiza uno existente.

Y la alarma de conectores era otra cosa. El aviso de esta sesión es de `claude.ai Google Drive`, un
conector distinto que Velo no usa para nada. **El riesgo 7 estaba correctamente identificado y
resultó no aplicar** — que es un desenlace distinto de «no existía»: la comprobación era barata y la
alternativa era enterarse al final.

### El BLUEPRINT se escribió consultando, no recordando

`docs/BLUEPRINT.html`, desde `docs/BLUEPRINT.plantilla.html`. La regla de la plantilla —*«se escribe
con lo DESPLEGADO de verdad, no con lo planeado»*— se tomó literalmente: **ninguna casilla salió de
la memoria de este sprint ni de lo que dicen el CLAUDE.md o el README.** Cada una salió de preguntarle
al servicio.

| Afirmación del blueprint         | De dónde salió                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Ruleset y sus 4 checks           | `gh api repos/:owner/:repo/rulesets/20613936` — y hay 3 reglas más de las que sabía |
| Duración real de cada job de CI  | `gh api .../actions/runs/<id>/jobs` sobre la última corrida: 0 · 1 · 3 · 3 min      |
| Protección de deployment apagada | `curl` sin sesión: producción **200**, preview del último commit **200**            |
| Región del edge                  | cabecera `x-vercel-id: iad1::…` de la respuesta de producción                       |
| Sentry sin DSN                   | el HTML de producción no contiene ninguno — verificado, no supuesto                 |
| Doble cinturón gitleaks          | `githooks/pre-commit` + `git config core.hooksPath` — existe y está activo          |

Las dos últimas importan más de lo que parecen. «Sentry está cableado» y «Sentry está reportando»
son afirmaciones distintas, y un blueprint que las confunda hace creer que hay observabilidad donde
no la hay. La casilla dice las dos cosas: **el cliente está integrado con un sanitizador más duro que
el del kit, y hoy está inerte porque no hay DSN.**

### Lo que el blueprint obligó a mirar y nadie había mirado en cuatro sprints

- **El plan Hobby de Vercel no permite uso comercial.** Velo no cobra hoy, así que no hay
  incumplimiento — pero la casilla estaba vacía y ahora dice que el día que cobre hay que pasar a
  Pro. Es exactamente la clase de dato que se descubre tarde y caro.
- **El punto único de falla de Velo no es la infraestructura.** La plantilla pregunta «¿cuál es y qué
  lo mitiga?» esperando 2FA y backups. La respuesta honesta de esta app es otra: **si Vercel y GitHub
  desaparecieran mañana no se pierde ni un dato**, porque Velo no custodia ninguno y el repo es
  público y clonable. El punto único de falla real es **la frase de paso del usuario**, y **no tiene
  mitigación técnica — tenerla sería el agujero**. La mitigación es de producto: la interfaz lo
  advierte antes de cifrar. Se escribió así, con esas palabras.

### El defecto que solo aparece dibujando

El SVG salió del primer intento **válido, autocontenido y con cinco textos saliéndose de su caja**:
el título de GitHub desbordando por ambos lados, la etiqueta «4 checks → deploy» pisando el borde de
Vercel, «recibe el resultado» y «abres con tu frase» metiéndose dentro de las cajas vecinas, y la
línea de Web Crypto rebasando su recuadro interior.

Ninguna herramienta iba a decirlo. El HTML era correcto, no había peticiones externas y el documento
abría sin internet — los tres criterios que el plan pedía verificar. **Un diagrama as-built con las
etiquetas cortadas miente por omisión igual que una lista desactualizada**, y la única forma de verlo
fue la misma de la Fase 4: renderizar y mirar. Se corrigieron los cinco y se volvió a mirar.

### §4 — una tercera promesa aplazada, en el sitio que ninguna fase toca

`.env.example:10` decía: *«El proveedor LLM y sus keys se añaden en el sprint que active IA (ver su
ADR)»*. Heredada de la plantilla del kit.

Es la **tercera forma** de promesa aplazada de este sprint, y la primera con una propiedad que las
otras dos no tienen: **no caduca en un sprint — es falsa para siempre.** La regla dura nº1 veta la IA
generativa en el runtime PARA SIEMPRE, el ADR-001 lo documenta y `gate-anti-ia` pone el CI en rojo si
aparece. Un archivo de ejemplo que le reserva sitio a una key que jamás va a existir enseña lo
contrario de lo que el producto es.

**Ninguna de las dos barridas de la Fase 0 la encontró**, y la razón es el patrón que la orden mandó
leer antes de planear: *un gate de fase no ve lo que la fase no toca*. Las dos barridas peinaron
documentos y copy de pantalla; `.env.example` no es ninguna de las dos cosas. Y **ningún sprint del
ciclo lo abrió jamás**, porque ningún sprint necesitó una variable de entorno: es un archivo que se
estampó una vez, se lee como andamiaje y nadie vuelve a mirar. Se pagó en esta fase, que es
justamente la que declara «IA embebida: NINGUNA» en el blueprint — la contradicción quedaba a dos
párrafos de distancia.

### Desviación del plan — `/design-sync` no lo puede correr el constructor

El plan asignaba a esta fase *«`/design-sync` — el design system consolidado se publica como activo
estable»*. La skill está marcada **`disable-model-invocation`**: reservada a invocación explícita del
usuario, y con instrucción expresa de **no replicar su flujo por otros medios**.

Así que la fase entrega lo que sí le corresponde y deja el resto en manos del usuario, sin
simularlo:

- ✅ **Conexión comprobada y funcionando** (la mitigación del riesgo 7, que era el trabajo real
  asignado a esta fase).
- ✅ **Destino identificado:** no existe proyecto de Velo → el comando **crea** uno nuevo.
- ✅ **Fuente lista:** `design-system.md`, 241 líneas, 7 secciones — personalidad, tokens,
  componentes canon, los cinco estados, la regla de cómo se presenta un número, anti-patrones
  vetados y el gate de revisión.
- ⏸ **Pendiente del usuario:** correr `/design-sync`. **El cierre del ciclo queda condicionado a
  eso**, y así se declarará en el summary — no como hecho.

### Verificación de la Fase 5

| Criterio del plan                              | Resultado                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| El BLUEPRINT abre **sin internet**             | ✅ renderizado con `offline: true`: **0 peticiones externas, 0 fallos**        |
| Con su SVG dentro                              | ✅ embebido en el documento; el único `url()` es `url(#punta)`, interno        |
| Autocontenido                                  | ✅ cero `<script>`, `<link>`, `<img>`, `@import`; los 5 `href` son navegación  |
| Declara dominio                                | ✅ subdominio del hosting, sin DNS de terceros, con dónde se administra        |
| Declara protección de deployment               | ✅ apagada en prod **y** previews, verificado desde afuera y sin sesión        |
| Costo real desglosado                          | ✅ US$0,00, con el límite de cada free tier y el margen real                   |
| Punto único de falla con su mitigación         | ✅ la frase de paso del usuario — y por qué no puede tener mitigación técnica  |
| Tabla completa, incluidas las casillas vacías  | ✅ 14 filas; las 6 que dicen NINGUNO/NO APLICA llevan su razón, no un guion    |
| Legible en los dos temas                       | ✅ claro y oscuro, revisados como imagen                                       |
| `/design-sync` corrido                         | ⏸ **lo corre el usuario** — ver la desviación de arriba                       |
| `pnpm typecheck` · `pnpm lint` · `pnpm test`   | ✅ limpios, **724 verdes, 1 saltada** (la fase no tocó código de producto)     |
