# Sprint 002 · El disfraz — bitácora de implementación

> Velo transforma, y lo demuestra. El S1 dejó una app que **ve**; este sprint la hace **actuar**:
> política campo por campo → preview antes/después → riesgo recalculado con Mondrian → archivo
> anonimizado descargado. Todo en el navegador, determinista, cero IA.
>
> **El patrón que gobierna el sprint:** `la-composicion-de-verdades-puede-mentir`. Los cuatro
> hallazgos de la auditoría del S1 —en un sprint sin un solo bug funcional— tocaron todos esa
> categoría.

Branch `sprint-002/el-disfraz`. Orden: `portafolio/anonimizador/ordenes/SPRINT_002-orden.md`.

---

## Fase 0 — Deuda del harness y del kit

### El delta del kit v1.12.0

`playwright.config.ts` **ya estaba adoptado**: el S1 lo pagó en su Fase 2 de auditoría, cuando se
descubrió que el e2e local corría contra `next dev` y sacaba 5 rojos sobre un árbol limpio. Se
verificó en vez de rehacerse — `command: "pnpm build && pnpm start"`, `reuseExistingServer: false`,
`timeout: 180_000`, los tres en su sitio.

Lo que sí entró:

- **`lighthouse-categorias.json`**, copiado del kit. El nombre es deliberadamente
  no-auto-descubrible: LHCI auto-carga `lighthouserc.json`, y si este archivo se llamara así, el
  assert de budgets lo cargaría solo y estallaría — `budgetsFile` es **mutuamente excluyente** con
  `assertions`.
- **El job `lighthouse`, desdoblado**: un `lhci collect` y **dos** `lhci assert`, por esa misma
  exclusividad. Y el flag correcto: `lhci collect` usa `--url=`, no `--collect.url=` (que es de
  `autorun`).
- `.lighthouseci/` al `.gitignore`: correr el gate en local no debe ensuciar el árbol.

Verificado en local antes de empujar, con el Chromium de Playwright vía `CHROME_PATH`:

```
Run #1..#3 ...done.
assert --budgetsFile=./perf-budget.json        → All results processed!   (exit 0)
assert --config=./lighthouse-categorias.json   → All results processed!   (exit 0)
```

**Un número que conviene tener a la vista desde ahora:** las tres corridas dieron Performance
**0,95 · 0,94 · 0,93** (LHCI toma la mediana). Contra el umbral de 0,90 el margen es de cuatro
centésimas — y la Fase 5 mete una ruta nueva más pesada que la aduana: un editor de política es una
tabla editable con controles. Que el gate nuevo cace esa ruta es plausible, y si pasa **es el
hallazgo, no una regresión**.

### La demo en rojo del gate de categorías

Deuda asignada a este sprint: el gate llegó al repo sin la suya, y el estándar 2 v2.4.0 dice que
**todo gate nuevo nace con su demo**. PR #5 desechable con `minScore: 1.0` en las cuatro
categorías, contra la rama del sprint para que el diff fuera de una línea por categoría.

```
Checking assertions against 1 URL(s), 3 total run(s)
All results processed!                          ← assert 1 (budgets): VERDE

Checking assertions against 1 URL(s), 3 total run(s)
1 result(s) for http://localhost:3000/ :
  ✘  categories.performance failure for minScore assertion
        expected: >=1
           found: 0.94
      all values: 0.69, 0.94, 0.93
Assertion failed. Exiting with status code 1.
##[error]Process completed with exit code 1.
```

Falla **nombrando la categoría** y el valor encontrado, no con un «assertion failed» genérico. Y
falla **por separado** del assert de budgets, que corre antes y sigue verde: era justo lo que el
desdoblamiento tenía que lograr, y sin verlo no había forma de saberlo.

**Lo que la demo destapó de paso, y vale más que la demo:** las tres corridas del runner dieron
**0,69 · 0,94 · 0,93**. La primera, en frío, no habría pasado ni el umbral de 0,90 — la salva que
LHCI toma la **mediana**, no el mínimo. Así que el margen real de esta app contra el gate nuevo es
más delgado de lo que sugería el 0,95 medido en local, y depende de una decisión de LHCI que
nosotros no controlamos. Con la ruta de la Fase 5 encima, conviene mirarlo antes del PR.

PR cerrado y branch borrado en el mismo comando. Cero rastro en el historial.

### Spike A — cuánto cuesta de verdad un seudónimo → **ADR-004**

La orden dice «HMAC-SHA256 con Web Crypto». Había una razón concreta para dudarlo antes de escribir
la Fase 2, y no era el rendimiento: **`crypto.subtle` es asíncrono y el motor es síncrono y puro.**
Y una medición previa en **Node 24** apuntaba a la alternativa: 4,5 s por 500k valores esperando
uno por uno, 1,8 s en lotes — contra un HMAC síncrono sobre el `Sha256` que el repo ya tiene.

Medido **en Chromium**, sobre 500.000 valores distintos, cada camino sobre los 500.000 completos
(`scripts/spikes/spike-hmac.mjs`, que inyecta el archivo REAL del producto con el quitador de tipos
nativo de Node 24, no una copia):

| Camino                              | 500k       | Por valor |
| ----------------------------------- | ---------- | --------- |
| **Web Crypto, `await` uno por uno** | **0,68 s** | 1,37 µs   |
| **Web Crypto, lotes de 2.000**      | **0,62 s** | 1,24 µs   |
| Síncrono sobre el `Sha256` del repo | 2,91 s     | 5,83 µs   |
| Síncrono con un `terminarBytes()`   | 3,28 s     | 6,55 µs   |

**En el navegador el resultado es el OPUESTO al de Node:** Web Crypto es 4,4× más rápido donde en
Node era 2,5× más lento. Si el spike se hubiera corrido donde era cómodo, la decisión habría salido
al revés — y esa es la razón entera por la que el plan exigía el navegador.

Las dos implementaciones dan **el mismo digest** en los 9 casos, incluidas las tres fronteras del
bloque de 64 bytes y una llave de 100 bytes (la rama que obliga a hashear la llave).

**Veredicto: Web Crypto, como decía la orden** — y el argumento que motivó el spike se desinfló al
mirarlo de cerca: el contagio de `async` no ocurre, porque el pipeline de transformación es código
nuevo y los motores del S1 no calculan HMAC. Tampoco hace falta lotear: los lotes compran un 9 % a
cambio de complejidad y de 2.000 promesas vivas. Detalle en **ADR-004**.

**Presupuesto que hereda la Fase 2:** ~0,7 s por columna seudonimizada de 500k valores distintos,
dentro del worker. Se medirá en el gate de rendimiento de este sprint, no citando esta tabla.

### El e2e contra el build

Tercer punto de la fase, y el más rápido: confirmar que los 5 rojos del dev server siguen
enterrados. `pnpm test:e2e` en local, contra el build, **39 pasadas y 1 saltada por diseño** — el
mismo resultado que el CI. La fricción que originó el delta v1.12.0 no volvió.

---

## Fase 1 — El motor de políticas

**307 pruebas unitarias** (96,7 % sentencias · 91,7 % ramas). `politica.ts` al 100 % de sentencias;
`politicas-de-fabrica.ts`, al 100 %.

### La política es un archivo con identidad

`src/engine/politica.ts`. Una política no es una preferencia de la sesión: es el documento que dice
qué tratamiento recibió un archivo, y por eso lleva **hash SHA-256**. Mismo hash ⇒ mismo
tratamiento — y eso es lo que va al reporte y, en el S3, al certificado.

Tres decisiones sostienen esa promesa:

1. **El hash se calcula sobre la forma normalizada**, con las reglas ordenadas por columna. El
   usuario no tiene por qué saber en qué orden tocó las filas.
2. **Se ordena por punto de código, jamás con `localeCompare`** — que depende del idioma del
   sistema y le daría a la misma política dos hashes en dos computadores. El gate de determinismo
   del S1 ya lo prohíbe en el motor; aquí se ve por qué.
3. **`origen` entra al hash.** Aplicar Habeas Data y editarlo hasta dejarlo igual que una política
   manual idéntica **no es lo mismo**: la procedencia es parte de lo que el reporte declara, y dos
   documentos que dicen cosas distintas no pueden compartir identidad.

`importarPolitica` **no lanza**: devuelve el motivo. Un archivo que el usuario eligió a mano falla
de formas normales —JSON roto, otra versión, forma inválida— y cada una necesita un mensaje
distinto en pantalla. Un `throw` genérico las volvería todas «archivo inválido», que no le dice a
nadie qué hacer. La versión se mira **antes** que la forma, para que un archivo v2 diga «es de otra
versión» y no una lista de campos que no cuadran.

### El hallazgo de la fase: Safe Harbor es SUPRIMIR, no seudonimizar

45 CFR §164.514(b)(2) pide **eliminar** los 18 identificadores. El §164.514(c) permite conservar un
código de reidentificación, pero con una condición que aquí no se cumple: **el código no puede
derivarse de la información**. Un HMAC del valor se deriva del valor — así que seudonimizar una
cédula deja el archivo **fuera de Safe Harbor**, por muy irreversible que sea el seudónimo.

Es una diferencia que decide el diseño, no una nota al pie: la política de HIPAA **suprime** donde
la norma dice suprimir, aunque el archivo pierda sus llaves de cruce; y la de Habeas Data —que no
tiene lista tipo Safe Harbor, sino principios y una guía— seudonimiza conservando formato para que
el cruce sobreviva. Las dos tratan el mismo archivo de forma distinta, y **el hash lo demuestra**.

Otra decisión con la misma lógica: **el dato sensible del art. 5 se CONSERVA**. Es el atributo que
el análisis quiere medir, no la llave por la que se enlaza; suprimirlo sería anonimizar destruyendo
el propósito. Queda protegido por el k de los cuasi-identificadores, que es el modelo entero de
k-anonimato.

### Lo que Velo no ve, dicho en la tabla

Los 18 identificadores están enumerados de la A a la R **con cómo los ve Velo o por qué no los ve**.
El reparto real: **7 por validador · 2 por nombre de columna · 9 que no ve en absoluto** (fax,
SSN, historia clínica, afiliado, licencia, dispositivo, URL, fotografías, y la cláusula de cierre
del literal R —que por definición no tiene forma, y es lo que hace que Safe Harbor no se pueda
automatizar del todo).

**Un defecto que el test cazó y que vale registrar:** la advertencia de HIPAA decía _«Velo solo
reconoce automáticamente 8 de los 18»_ y la tabla decía 7. Un número escrito a mano dentro de una
prosa que describe una tabla se desincroniza en el primer cambio y nadie se entera — es la «cita
que no se cumple» del S1 en su versión de copy. **Arreglo:** la prosa no lleva números y la cifra
la compone la UI con `resumenDeCobertura()`, más un test que prohíbe la forma `N de los M` en
cualquier advertencia. El error se hizo imposible, no se corrigió.

Y ninguna de las dos se presenta como certificación: son la interpretación de Velo de una guía,
aplicada a las columnas que Velo alcanzó a reconocer. Ningún programa que solo ve una tabla puede
decidir si un tratamiento es lícito.

### El gate de observabilidad creció con los objetos nuevos

El sanitizador del S1 cerraba las dos puertas que existían entonces (encabezados y celdas). Este
sprint trae dos objetos más que jamás pueden salir, y el gate creció **el mismo día que nacieron**:
una **llave** —entera, en pedazos, la frase de paso y la sal— y una **política** exportada, que
lleva los nombres de columna del usuario. Ninguno sale, verificado sobre el payload crudo.

De paso quedó escrito algo que no es obvio: el **hash** de la política sí podría viajar sin revelar
nada, pero tiene 64 caracteres y el sanitizador lo descarta igual. Está bien que así sea — el gate
no puede distinguir «hash inofensivo» de «llave» mirando la cadena.

---

## Fase 2 — Las cuatro familias de técnicas

**354 pruebas unitarias** (96,9 % sentencias · 92,3 % ramas). `engine/tecnicas/` al 98,1 %,
`csv.ts` al 100 %, `llave.ts` al 94,4 %.

### La llave vive fuera del motor, y no es orden

El gate de determinismo del S1 veta `crypto.getRandomValues` en cada `.ts` de `src/engine/` — un
motor que puede producir azar deja de ser reproducible. Generar una sal necesita azar de verdad.
Así que `src/lib/llave.ts` genera y deriva (**PBKDF2-600k**, con la cifra de OWASP citada en el
código), y al motor le llega la llave **ya derivada**: las técnicas siguen siendo funciones puras
de (valor, llave). Era el riesgo nº1 del plan y se pagó donde estaba previsto, no al chocar.

La llave se deriva **no extraíble**: aunque alguien consiga una referencia, no puede leer sus
bytes. Y lleva una **huella corta** —el HMAC de una constante— para que el usuario reconozca que
dos archivos salieron de la misma llave sin enseñar un solo byte de ella.

### Se transforma el diccionario, no las filas — y luego se re-deduplica

Una columna de 500.000 filas con 3 valores distintos cuesta **3** transformaciones. Es el regalo de
la representación columnar del S1.

Lo que no era obvio: **después hay que reconstruir el diccionario**. Generalizar junta valores —40
edades distintas caen en 5 rangos— y un diccionario que conservara las 40 entradas haría que la
columna mintiera sobre su propia cardinalidad. De la cardinalidad salen las clases de equivalencia,
o sea el riesgo: una columna que miente ahí produce un k equivocado, que es la peor forma de fallar
en este producto. Hay test.

### El hallazgo de la fase: el formato preservado colisiona, y hay que decirlo

Un seudónimo tiene que caber en el formato que el sistema del destino espera. Un NIT son 9 dígitos
que empiezan por 8 o 9: **2×10⁸ combinaciones**, no 2⁶⁴. Por la paradoja del cumpleaños, en un
archivo grande dos valores distintos caen en el mismo seudónimo — y entonces dos empresas se ven
como una.

Medido sobre 500.000 valores distintos, con el código que se despacha:

| Formato | Espacio | Colisiones medidas | Teoría (n²/2N) |
| ------- | ------- | ------------------ | -------------- |
| NIT     | 2×10⁸   | **620**            | 625            |
| Cédula  | 10⁹     | **127**            | 125            |

La predicción y la medición cuadran al 1 %. No es un caso raro: es aritmética, y le pasa a
cualquier herramienta que preserve formato.

**Por qué Velo no lo resuelve rehasheando.** La salida obvia —ante una colisión, volver a hashear
con un contador hasta encontrar hueco— rompería en silencio justo lo que este sprint promete: el
seudónimo dejaría de depender solo del valor y la llave, y pasaría a depender de **qué más había en
el archivo**. El mismo cliente saldría distinto en marzo que en abril, y los cruces —la razón de
existir de C9— se romperían donde nadie los está mirando. Así que Velo **las cuenta y las reporta**,
y ofrece el camino sin colisiones prácticas: el seudónimo hexadecimal, que conserva el cruce y
pierde el parecido.

### C9 no se construye: cae sola

Mismo valor + misma llave ⇒ mismo seudónimo, dentro del archivo y entre archivos. No hay tabla de
correspondencia que mantener: es lo que un HMAC hace. Lo que sí hay es un test que carga **dos
archivos distintos** con las filas en otro orden y comprueba que el join sigue cuadrando — porque
una propiedad que nadie comprueba es una esperanza.

### El determinismo, en sus dos direcciones y con su complemento

- **Misma llave ⇒ archivo byte-idéntico** (SHA-256 del CSV de salida), y el tamaño de los trozos
  del parser no lo cambia.
- **Llave distinta ⇒ archivo distinto** — la dirección que atrapa un HMAC mal cableado que
  devolviera una constante y pasaría la primera con nota perfecta.
- Y el **complemento**, que no estaba en el plan y hacía falta: lo que NO depende de la llave
  —enmascarado, fechas generalizadas, municipio— tiene que salir **idéntico** con las dos llaves.
  Si cambiara, algo estaría leyendo la llave donde no debe.

### El CSV, con sus cinco decisiones escritas

Separador coma (RFC 4180) · comillas solo cuando hacen falta · la comilla se duplica, no se escapa
con barra —eso es JSON— · **fin de línea `\n`** · **sin BOM**.

Las dos últimas se apartan de RFC 4180 (que pide CRLF) **a propósito y con su consecuencia
declarada**: mezclar finales de línea daría archivos distintos según el sistema donde se generó, que
es exactamente lo que el determinismo prohíbe. El precio va al manual: _Excel en Windows puede
necesitar que le digas que el archivo es UTF-8 al abrirlo._ Se prefiere decirlo a romper la promesa
por comodidad.

Y el archivo descargado **no repite el nombre del original**: `pacientes-oncologia-2026.csv` cuenta
de qué va el contenido antes de que nadie lo abra, y ese nombre viaja en el asunto de un correo y en
una carpeta compartida. Sale como `velo-anonimizado-<8 del hash de la política>.csv`, que además
permite reconocer dos entregas del mismo tratamiento.

### Nota de rendimiento

Seudonimizar 500k valores distintos cuesta **~5 s en Node** y **~0,7 s en Chromium** (ADR-004). La
diferencia es la misma que el Spike A destapó: `crypto.subtle` del navegador es mucho más rápido
que el de Node. El presupuesto real se mide en el gate de la Fase 5, por la UI y con el hilo
principal vigilado.

---

## Fase 3 — Mondrian: el reparto que decide cuánto generalizar

**Estado:** completa. `pnpm test` → **397 pruebas verdes**, cobertura 97,6 % sentencias / 93,5 %
ramas; `engine/mondrian.ts` 100 % sentencias y 98,7 % ramas, `engine/diversidad.ts` 100 %.

Archivos nuevos: `src/engine/mondrian.ts` · `src/engine/diversidad.ts` ·
`tests/unit/mondrian.test.ts` (23) · `tests/unit/diversidad.test.ts` (13).
Tocados: `docs/kit-de-prueba/generador.mjs` (perfil nuevo) · `src/engine/tecnicas/index.ts`
(cableado) · `tests/unit/tecnicas.test.ts` · `tests/unit/determinismo-transformacion.test.ts`.

### El fixture va primero, y por una razón

El perfil **`mediana-repetida`** del kit se escribió **antes** que el algoritmo. Un dataset
uniforme no distingue una implementación correcta de una rota: con valores bien repartidos, cortar
por la posición central y cortar por el **valor** de la mediana dan casi lo mismo. La diferencia
solo aparece cuando la mediana se repite tanto que caería a los dos lados del corte por posición.

El perfil trae dos columnas con la mediana clavada — medido sobre 2.000 filas: `edad_reportada`
**54 %** en el valor `40`, `puntaje_triage` **79 %** en `50` — y un test verifica esa proporción,
para que el caso duro no se ablande en silencio si alguien toca el generador.

Las dos columnas viven **fuera** de `COLUMNAS` en el generador: el perfil `clinico` es
`Object.keys(COLUMNAS)`, así que añadirlas ahí habría cambiado el archivo del S1 —y su hash, y los
fixtures de e2e— sin pedir permiso.

### El contrato del ADR-002 §3, punto por punto

1. **Dimensión de mayor rango, empate por menor índice de columna.** Con test que lo distingue:
   dos dimensiones de rango idéntico y presupuesto para un solo corte — se corta la primera. Y otro
   que fija que el índice es **el de la tabla, no el de la lista de la política**: si mandara el
   orden en que la política nombra las columnas, reordenar la política sin cambiar nada cambiaría
   el archivo de salida.
2. **Partición por valor, jamás por posición.** El test obligatorio no pregunta «¿las clases tienen
   k filas?» —cortar por posición también las produce— sino **¿la generalización sigue siendo una
   función del valor?**: dos filas con el mismo valor original tienen que recibir la misma etiqueta.
   Y su consecuencia observable, que es la que muerde: **barajar las filas no cambia una sola
   etiqueta**. Cortando por posición, el archivo anonimizado dependería del orden en que llegaron
   las filas — la regla dura nº3 rota de la forma más silenciosa posible.
3. **Caché de la proyección por columna** (`WeakMap` sobre la identidad de la columna, que es
   inmutable en este motor). Memorizar una función pura no toca el determinismo y aquí paga: mover
   el k en la interfaz vuelve a repartir, y sin caché volvería a ordenar los 477.701 valores
   distintos de `latitud` en cada movimiento.

### Las etiquetas, y la celda vacía

La etiqueta es el **intervalo observado**: `18 a 39`, o el valor tal cual si la partición tiene uno
solo. Separador `" a "` y no el `30-39` de `generalizar-rango`, **porque no son la misma cosa**:
aquel produce un balde canónico de ancho fijo, este produce dos valores que salieron de este
archivo. Con fechas, además, `1987-03-14-1990-05-02` no se puede ni leer.

La celda vacía **recibe la etiqueta de su partición**, con el sufijo `(o vacío)`. No es un adorno:
si el vacío se quedara vacío, dos filas de la misma clase saldrían con valores distintos y el k
prometido se partiría en dos sin que nadie lo notara. El sufijo es lo que impide que la celda
afirme un dato que nunca existió.

### Lo que Mondrian promete, y lo que la pantalla podría hacerle decir

**El hallazgo de honestidad de la fase, con test que lo exhibe.** Mondrian garantiza k sobre **las
columnas que entraron al reparto**. El k del **archivo** se mide sobre todos sus
cuasi-identificadores. Un QI que la política conserva parte esas clases y deja el k real por debajo
del prometido — el test construye el caso: `kAlcanzado = 5` sobre `edad`, y el archivo entregado
tiene clases de **una sola fila** por culpa de un código de empleado que nadie tocó. Ninguna de las
dos cifras miente por separado; la composición sí.

Por eso `kAlcanzado` **no se lee del tamaño de las particiones** sino de las clases de equivalencia
de la tabla de salida (dos particiones pueden fundirse en una clase, y leer el mínimo de partición
daría un número pesimista pero igual de falso), y por eso la Fase 4 vuelve a medir con todos los QIs.

**k no alcanzable no se resuelve solo:** si el archivo tiene menos filas que el k pedido, Mondrian
generaliza todo lo que puede y lo devuelve dicho (`alcanzado: false`, `motivo`), sin suprimir filas
por su cuenta. Borrar registros del archivo de alguien es decisión suya — y además es silenciosa:
un archivo con menos filas de las que entró no se nota mirándolo. Igual con `kObjetivo: null` y
columnas marcadas: salen intactas y quedan en `pendientesDeMondrian`; elegir un k por el usuario
sería elegir por él cuánta información pierde.

### l-diversity y t-closeness — se miden, no se optimizan (ADR-002 §4)

`src/engine/diversidad.ts`, con sus fuentes citadas (Machanavajjhala et al., ICDE 2006; Li, Li &
Venkatasubramanian, ICDE 2007). k=5 impecable no dice nada si las 5 personas de la clase comparten
el diagnóstico: eso es el ataque de homogeneidad, y ℓ lo ve. Y una clase puede tener ℓ=3 aprobado y
ser un 80 % de un diagnóstico que en el archivo pesa mucho menos: eso lo ve t y ℓ no. Hay un test
para cada una de esas dos frases.

Tres límites **declarados en el propio archivo**, no escondidos:

- ℓ es la variante **distinta**, no la entrópica ni la recursiva (c,ℓ).
- t usa **distancia de variación total**, propia de atributos categóricos. Para atributos con orden
  natural el paper usa EMD ordenada, que Velo no implementa: un CIE-10 no tiene orden, así que la
  métrica encaja con el caso real, pero si alguien marcara sensible una columna ordenada el número
  saldría **más optimista de lo que debería**.
- Se **miden y se reportan**. Optimizarlas es NP-hard; verificarlas sobre una partición ya hecha es
  lineal, y eso es lo que se hace.

La celda vacía cuenta como un valor del atributo: una clase donde todos lo tienen en blanco es tan
homogénea como una donde todos comparten diagnóstico, y tratarla como «ausencia» la dejaría pasar
por diversa.

### Rendimiento: el spike medía otra cosa, y hay que decirlo

El ADR-002 reportó **171 ms** (8 QIs, 500k) y avisó: _«el S2 debe medir en su propio gate en vez de
citar esta tabla»_. Medido aquí, sobre el fixture de 500k×24 del kit, con el código que se despacha:

| Escenario | Proyección | Reparto + tabla de salida | k medido | **Total** | Particiones |
| --- | ---: | ---: | ---: | ---: | ---: |
| Los 8 QIs exactos del ADR-002 | 84 ms | 650 ms | 85 ms | **819 ms** | 65.596 |
| 8 QIs con tres columnas casi únicas (`latitud`, `longitud`, `ip_registro`) | 597 ms | 702 ms | 89 ms | **1.387 ms** | 65.734 |

k=5 alcanzado en los dos. **La proyección del ADR (78 ms) coincide con la medida (84 ms); el
algoritmo no.** La razón no es que el spike se equivocara: el spike **solo particionaba**. El
producto además proyecta, **construye la tabla de salida** (65.596 particiones × 8 dimensiones de
etiquetas, más el diccionario) y **mide el k del resultado**. Comparar 171 ms con 819 ms es comparar
media tarea con la tarea.

Dos costos se pagaron durante la fase, con su medición:

- **Claves numéricas precalculadas.** `sort` llama al comparador ~n·log n veces; convertir el texto
  a número ahí dentro eran 9 millones de `replace` + `Number` en una columna de 480.000 valores
  distintos. Proyección: **1.734 → 601 ms**.
- **Mediana por dos caminos.** El histograma es imbatible mientras el dominio quepa, y desastroso
  cuando el dominio tiene 477.701 casillas y la partición tiene 5 filas — que es todo el fondo del
  árbol con una columna casi única. Cuando el ancho supera al número de filas se ordenan los
  ordinales de la partición (`TypedArray.sort()`, numérico y sin locale). Reparto: **1.915 → 702 ms**.
  Ninguno de los dos usa pivote, o sea ninguno usa azar, que en este motor está prohibido.

Total del peor caso: **3.794 → 1.387 ms**. Corre en el worker, así que no bloquea el hilo principal;
el presupuesto real se verifica por la UI en la Fase 5.

**Y una corrección que costó un CI en rojo.** El test de escala llevaba `expect(ms).toBeLessThan(10_000)`
como «presupuesto». En la Fase 3 pasó; en la Fase 4 falló **sin que Mondrian cambiara una línea**: el
runner de GitHub midió **11.042 ms** para el mismo trabajo que aquí toma 1.387 — **7,7×**. El umbral
estaba calibrado contra la máquina de desarrollo y el gate era flaky desde que nació; la Fase 3 lo
pasó por margen, no por estar bien.

La lección es la misma que destapó la demo en rojo de Lighthouse en la Fase 0 (el runner puntuó 0,69
en su primera corrida donde aquí puntúa 0,95): **el hardware de CI no es el de esta máquina, y un
número calibrado aquí no significa nada allá.** Un reloj de pared en un runner compartido no es un
presupuesto — es ruido con unidades. El umbral pasó a 45 s y quedó escrito como lo que es: una alarma
de incendio contra un O(n²), no un presupuesto. El presupuesto vive en la tabla de arriba, con su
hardware declarado, y se verifica por la UI en la Fase 5.

### Cableado al pipeline

`aplicarPolitica` ahora **cierra el círculo**: Mondrian corre al final, **sobre las columnas ya
transformadas** —generalizar lo que entró en vez de lo que sale produciría intervalos sobre valores
que ya no existen en el archivo— y el resultado viaja en `TablaTransformada.mondrian`. El gate de
determinismo del archivo de salida se extendió a una política **con reparto**: dos corridas, mismo
SHA-256; trozos de parser distintos, mismo SHA-256; otro k, otro archivo.

### Desviación del plan

Ninguna. El plan pedía además «verificación de l-diversity y t-closeness sobre la partición ya
formada»: vive en `src/engine/diversidad.ts` en vez de dentro de `mondrian.ts`, porque son
mediciones sobre una partición cualquiera y no dependen de cómo se formó.

---

## Fase 4 — El antes y el después, y dónde podía mentir

**Estado:** completa. `pnpm test` → **444 pruebas verdes**, cobertura 98,0 % sentencias / 93,4 %
ramas; `engine/balance.ts` 100 % sentencias, `engine/utilidad.ts` 98,1 %, `engine/reporte.ts`
94,7 % (venía de 90,9 %).

Archivos nuevos: `src/engine/balance.ts` · `src/engine/utilidad.ts` ·
`tests/unit/balance.test.ts` (12) · `tests/unit/utilidad.test.ts` (17).
Tocados: `src/engine/reporte.ts` (sección de tratamiento + sección de utilidad) ·
`tests/unit/reporte.test.ts` (+14).

### La regla de honestidad no vive en la pantalla: vive en el tipo

El plan la pedía como criterio de aceptación. Escribirla como convención —«acuérdate de poner la
advertencia arriba»— habría durado hasta la tercera pantalla. Así que `reduccion` no viaja como un
`number` suelto:

- `salvedades` sale **ya ordenada**, con las descalificantes delante. Ninguna vista tiene que
  ordenarlas, y por tanto ninguna puede desordenarlas.
- `esTitular` es un campo del motor, no un cálculo de cada componente. Tres pantallas que lo
  recalculen son tres oportunidades de olvidarlo.

Son **seis salvedades**, y cada una sale de **números medidos**, no de un umbral elegido a ojo:

| Salvedad | Gravedad | De dónde sale |
| --- | --- | --- |
| `identificadores-sin-tratar` | descalifica | la política conserva un identificador directo |
| `unicos-restantes` | descalifica | `despues.unicos > 0` |
| `k-no-alcanzado` | descalifica | Mondrian pidió k y no llegó |
| `k-del-reparto-no-es-el-del-archivo` | descalifica | `despues.kMinimo < mondrian.kAlcanzado` |
| `clases-homogeneas` | matiza | ℓ=1 en alguna clase (Fase 3) |
| `colisiones-de-seudonimo` | matiza | colisiones del formato preservado (Fase 2) |

La cuarta **cierra el hallazgo de la Fase 3**: aquel test exhibía el engaño; este lo convierte en
algo que la pantalla no puede callar. Y se detecta comparando los dos números que ya se midieron,
no adivinando qué columnas quedaron fuera del reparto.

La separación entre **descalifica** y **matiza** tampoco es un color: lo primero desmiente la
lectura «ya está tratado» (alguien sigue señalable); lo segundo la acompaña (el ataque de
homogeneidad y las colisiones son revelación de ATRIBUTO, otro eje). Confundirlos habría hecho que
`esTitular` fuera falso casi siempre, y un mecanismo que nunca deja pasar nada deja de significar
algo.

### Dos decisiones sobre la cifra misma

**`reduccion` es `null`, no `0 %`, cuando antes no había ningún único.** Presentar ese 0/0 como
«0 %» alarma sin motivo y como «100 %» tranquiliza sin motivo: son cifras inventadas en direcciones
opuestas. Se dice con palabras y se remite a la cifra que sí existe — cuántos hay **ahora**.

**Las dos medidas salen de la misma función del S1**, corrida sobre la tabla original y sobre la
transformada. Si el riesgo de después se calculara con otro modelo, la resta no significaría nada.
Los cuasi-identificadores de «después» son los de «antes» **menos los suprimidos** —quien reciba el
archivo no tendrá esas columnas, así que descontarlas es legítimo— y el reporte **lo dice y las
nombra**, porque callarlo no lo sería.

### La utilidad perdida, sin puntuación

`utilidad.ts` mide en dos planos y **no puntúa**. No hay un «85 % de utilidad conservada» porque
ese número exige decidir qué columna importa, y eso lo sabe el usuario, no Velo.

- **Por columna:** valores distintos, celdas cambiadas y **entropía de Shannon en bits** — que es
  literalmente «cuántas preguntas de sí/no hacen falta para distinguir una fila por esta columna».
  Pasar de 15,2 a 2,3 bits dice más que «se generalizó».
- **Entre columnas:** **V de Cramér antes y después** (Cramér 1946, §21.9). Es la que duele y la
  que nadie mira: una columna puede conservar su distribución entera y haber perdido su RELACIÓN
  con otra, y con ella el análisis que el destinatario pensaba hacer. Se ordenan de la que más se
  perdió a la que menos: es el hallazgo, no el inventario.

Dos topes **declarados con su motivo**, no callados: 64 valores distintos por columna y 8 columnas
al cruce. El primero es estadístico antes que de rendimiento — una tabla de contingencia con más
casillas que filas está casi toda vacía y la V sale **inflada hacia 1 por pura escasez**. Y los
valores del diccionario que ya nadie usa no cuentan para los grados de libertad, con test propio:
generalizar deja entradas huérfanas, y contarlas subiría la V sin que la relación hubiera cambiado.

### El criterio de aceptación: orden, no cifra

El reporte exportado se abre **fuera de contexto**, en el correo de alguien que no estuvo en la
pantalla. Así que el orden del documento es lo único que decide qué se lee primero, y el test lo
compara por posición:

```
seccion.indexOf('class="salvedades') < seccion.indexOf('class="reduccion"')
```

Sobre un archivo real del kit con una reducción del **87 %** —grande, lucible— y la cédula intacta:
la salvedad va primera, la cifra **no** se emite como titular (`cifrota` no aparece), y la salvedad
**nombra** `cedula_titular`. Con su complemento, sin el cual el test pasaría por vacío: cuando nada
descalifica, la cifra **sí** sale de titular.

### La composición que se cometía por omisión

Al añadir el tratamiento, la sección de riesgo del S1 pasó a ser ambigua: sus cifras describen el
archivo que **entró**, y puestas debajo de un balance se leerían como las del archivo que sale.
Ahora se titula «el archivo ORIGINAL» cuando hay tratamiento, y el balance va **antes** que ella en
el documento. Nadie escribió nunca una frase falsa; la habría escrito el orden.

### Costo, medido

Sobre el fixture de 500.000 × 24 del kit, con una política que suprime, enmascara, generaliza y
reparte: **`aplicarPolitica` 344 ms** (Mondrian incluido, sobre tres columnas de baja cardinalidad)
y **`medirUtilidad` 303 ms**. El segundo compara celda por celda las 24 columnas —12 millones de
comparaciones de texto— para saber cuántas cambiaron de verdad, en vez de deducirlo de la técnica
aplicada: una columna generalizada puede dejar valores idénticos, y contarlos como cambiados sería
inflar la pérdida. El presupuesto real se verifica por la UI en la Fase 5.

### Desviación del plan

Ninguna. El plan pedía «distribuciones marginales y correlaciones»: las marginales se entregan como
**entropía en bits** en vez de como la distribución completa, porque después de generalizar los dos
dominios son distintos y las distribuciones no se pueden comparar término a término — la entropía
sí, y es la cifra que responde la pregunta que el usuario tiene.

---

## Fase 5 — La UI: Velo deja de mirar y transforma

**Estado:** completa. `pnpm test` → **502 pruebas verdes**; `pnpm test:e2e` → **68 verdes, 2
saltadas declaradas** (el fixture de 500k corre en un solo proyecto). Lighthouse local:
`/` 93/100/100/100 · `/transformar` **92/100/100/100**.

Archivos nuevos: `src/app/transformar/page.tsx` · `src/components/editor-de-politica.tsx` ·
`llave-del-proyecto.tsx` · `vista-previa.tsx` · `balance-en-pantalla.tsx` ·
`descarga-del-archivo.tsx` · `decisions/005-la-frontera-y-la-descarga.md` ·
`tests/e2e/transformar.spec.ts` (9) · `tests/unit/balance-en-pantalla.test.tsx` (8).
Tocados: `workers/contrato.ts` · `workers/parser.worker.ts` · `lib/sesion.ts` ·
`app/diagnostico/page.tsx` · `engine/politica.ts` · `engine/politicas-de-fabrica.ts` ·
`components/zona-de-carga.tsx` · `tests/e2e/{garantia-de-red,a11y}.spec.ts` ·
`tests/unit/{privacidad,politicas-de-fabrica}.test.ts` · `lighthouse-urls.json` ·
`docs/MANUAL-DE-USO.md`.

### La frontera sobrevive a la descarga (ADR-005)

Descargar exige bytes, y la salida obvia —serializar en el worker, mandar el string a la página—
habría tirado la frontera por la ventana **sin que se notara**: la pantalla se vería idéntica. El
worker construye el `Blob` y lo transfiere; la página lo convierte en URL y nunca lo lee.

Y no lo lee **porque no puede**: `asaDeArchivo()` convierte el `Blob` en URL y su referencia se
pierde ahí mismo. Lo que llega a los componentes es una **cadena**. No hay ningún objeto sobre el
que se pudiera llamar `.text()`, así que la regla deja de ser una convención que alguien tiene que
recordar.

Eso obligó a rehacer un gate que había escrito mal media hora antes: veté `.text()` fuera del
worker con una expresión regular, y chocó de inmediato con el importador de políticas, que lee un
JSON que el usuario eligió a mano. **Una regex no distingue ese archivo del de datos**, y un gate
que no distingue acaba con una lista de excepciones — que es un gate muerto. Se cambió por la
clausura, que sí distingue, y el gate de texto se quedó solo con `.arrayBuffer()` y `FileReader`,
que no le hacen falta a nadie fuera del worker.

**Y el reparto de Mondrian viaja SIN su tabla.** `ResultadoDeMondrian` la lleva dentro; reenviarlo
tal cual habría mandado el archivo entero a la página en el sprint que pone la frontera a prueba.
Los campos se copian **uno a uno** en vez de con un `Omit`: así el día que el reparto gane un campo
nuevo no cruza solo — hay que escribirlo y mirarlo.

### La llave no existe en la página

La frase de paso entra al worker y no vuelve a salir; la llave se deriva allá, es no extraíble, y
de vuelta cruza solo la huella de 12 hex. La pantalla borra la frase de su propio estado en cuanto
la manda. Y `descartar()` termina el worker, que es lo que garantiza que no queda una `CryptoKey`
viva en ninguna parte.

### Lo que la pasada de capturas encontró — y ningún test veía

Los tres hallazgos de la fase salieron de **mirar las imágenes**, no de ejecutar nada. Ninguno
habría fallado un axe, un e2e ni un unitario.

**1. Habeas Data dejaba el archivo en k=1.** La pantalla decía «el reparto alcanzó k=7» y, al lado,
«1.978 registros (99 %) siguen solos». Las dos ciertas. La causa: `fecha_nacimiento` recibía su
regla por tipo —«recortar al año», que es lo que la guía recomienda— y con eso **salía del
reparto**; la fecha recortada seguía partiendo las clases desde fuera. La política prometía un k
que sus propias reglas impedían cumplir.

El arreglo va en `construirPolitica`: si la política declara `kObjetivo`, los cuasi-identificadores
entran al reparto aunque tengan regla por tipo. No es una preferencia — **k-anonimato es una
propiedad del conjunto de cuasi-identificadores**, así que uno fuera del reparto no es una
excepción al k, es su negación. Las reglas por tipo siguen mandando en todo lo demás
(`fecha_atencion`, que es no personal, se sigue recortando). Medido después: k del archivo **1 → 7**,
únicos **1.978 → 0**, y el balance pasa a poder lucir su cifra. Tres tests de regresión, incluido el
complemento que impide que la excepción se aplique a lo ancho.

Vale la pena decir de dónde salió: **la maquinaria funcionó**. La salvedad
`k-del-reparto-no-es-el-del-archivo` de la Fase 4 hizo exactamente su trabajo — enseñó en pantalla
una composición que era falsa. Lo que faltaba no era el detector, era arreglar lo que detectó.

**2. Una frase del copy era falsa para una de las dos políticas.** El botón de fábrica llevaba
«3 de 4 automáticos» junto a «9 de 18 automáticos»: dos coberturas con **denominadores distintos**,
que puestas lado a lado se comparan solas y la comparación es falsa. Al bajarlas al aviso de origen
escribí «de los N identificadores que enumera esa fuente» — cierto para HIPAA, que enumera 18, y
**falso para la Ley 1581**, que no enumera identificadores: esos 4 puntos son el resumen que hace
Velo. Ahora dice «Velo resume esa fuente en N puntos», que es verdad en los dos casos.

**3. Dos defectos de maquetación que solo existen en un tamaño.** La tabla del editor recortaba el
desplegable en 412 px (tres columnas no caben; la categoría bajó bajo el nombre y ahora son dos), y
«Grupo mínimo, después» envolvía a dos líneas dejando su número un renglón por debajo de los otros
tres — la fila de cuatro cifras dejaba de leerse como una fila. El primero no lo ve axe; el segundo
no lo ve nadie que no mire.

### Lo que la pasada de Lighthouse encontró

`/transformar` sacaba **96 en buenas prácticas** contra el 100 de `/`, y el único punto era una
**violación de CSP por `eval`**. La fuente: **Zod 4 compila validadores con `new Function`**. La CSP
de Velo no lleva `'unsafe-eval'` y no va a llevarlo, así que el intento se bloqueaba, Zod caía a su
camino interpretado y todo funcionaba… dejando una violación registrada en cada carga.

Se apagó con `z.config({ jitless: true })`, y no por el punto de Lighthouse: **una violación de CSP
en cada visita es ruido permanente en el panel de incidencias, y el ruido permanente es donde se
esconde la violación que sí importa.** Además deja de depender de que la detección de Zod acierte —
si su fallback fallara un día, la validación de políticas se rompería en producción y **ningún test
unitario lo vería, porque jsdom no aplica CSP**.

Eso destapó un hueco: la verificación nº2 del plan (política exportada → importada ⇒ misma
política) solo existía en unitarios. Ahora hay un e2e que la hace **por la UI, con la CSP real**,
incluida la recarga de la página en medio.

### Los dos contrapesos del ⭐ diferido

Exigibles por el método, no opcionales:

- **Teclado completo en la tabla editable.** El editor usa `<select>` nativo, y por dos razones que
  no son de gusto: el navegador ya trae Alt+↓, flechas, Escape y el anuncio del lector de pantalla
  —y en un teléfono abre la rueda del sistema—, y el `contain: paint` que el S1 puso en
  `.tabla-desplazable` recortaría cualquier menú propio pintado dentro de esa caja (riesgo 7 del
  plan). El desplegable nativo se pinta en la capa superior del navegador. El e2e enfoca, cambia
  el valor y tabula sin ratón.
- **`prefers-reduced-motion` con visibilidad real.** No comprueba que no haya movimiento —eso lo
  garantiza el cinturón global del S1— sino que **nada quedó invisible** al quitarlo: recorre las
  cinco pantallas y mide la opacidad calculada, porque un elemento que solo aparece por una
  animación de entrada desaparece para siempre.

### Alcances declarados

- **Lighthouse mide `/transformar` VACÍA.** Sin archivo cargado no hay editor, ni 24 desplegables,
  ni balance: el gate de categorías nunca ve el estado pesado que el riesgo 4 del plan temía. El 92
  de rendimiento es real y es del estado ligero. Queda dicho aquí y en el summary; medir el estado
  pesado exigiría que Lighthouse cargara un archivo, y eso no lo puede hacer.
- **El e2e de 500k corre en un solo proyecto** (`desktop-chromium`), igual que el del S1 y por la
  misma razón: el fixture pesa 130 MB y lo que se mide —el hilo principal— es el mismo en móvil.
- **El `Blob` preparado vive en memoria** hasta que se guarda o se descarta la sesión. Es memoria,
  no persistencia —nada tocó el disco—, y la URL se revoca al invalidar o al descartar.

### Desviación del plan

Ninguna en alcance. Dos precisiones: la política se importa con `File.text()` en la página (es la
política, no la tabla: la tabla no sale del worker), y el `Blob` se convierte en URL dentro de la
tienda en vez de en el componente — el dueño del recurso es quien controla su ciclo de vida, y así
el componente no necesita un efecto para crearla ni para revocarla.

### CI en rojo tras la Fase 5 — el umbral de cobertura, y por qué no lo vi

El commit `f7ed785` puso el job `quality` en rojo. **Las 502 pruebas pasaron**: lo que falló fue el
umbral de `src/lib/**`, en 79,91 % contra el 80 % exigido.

```
ERROR: Coverage for statements (79.91%) does not meet "src/lib/**/*.ts" threshold (80%)
ERROR: Coverage for branches (68.86%) does not meet "src/lib/**/*.ts" threshold (80%)
```

El causante era `sesion.ts` al **46,73 %** — el archivo que la Fase 5 dobló de tamaño. Y el fallo de
proceso es mío y es simple: verifiqué con `pnpm vitest run`, que corre las pruebas, en vez de
`pnpm test`, que es el que pasa `--coverage` y aplica los umbrales. Leí el 94,87 % de «All files»
—cierto— y no las cuatro líneas de ERROR que venían después con el desglose por glob. **Es el
patrón del sprint cometido contra mí mismo:** la cifra que miré era verdadera y la conclusión que
saqué de ella, falsa.

**El arreglo no fue bajar el umbral.** `tests/unit/sesion.test.tsx` declara en su cabecera que solo
prueba los caminos de rechazo porque «un archivo válido instanciaría un `Worker`, que en jsdom no
existe — ese camino lo cubre el e2e». Era cierto en el S1, cuando la sesión terminaba en el informe.
La Fase 5 le metió el taller entero y esa frase pasó a cubrir la mitad del archivo.

`tests/unit/taller.test.tsx` (17 pruebas) dobla el worker —cuyo contrato son dos cosas,
`postMessage` y eventos `message`— y dobla también el registro de URLs de objeto, que jsdom no
implementa. Con eso se pueden hacer preguntas **que el e2e no puede hacer**: `URL.revokeObjectURL`
no deja rastro en la pantalla, así que un Velo que nunca revocara se vería idéntico y acumularía un
archivo entero en memoria por cada edición de la política — cientos de MB con 500k filas. Las tres
que importan:

- **el asa que llega a la interfaz tiene tres campos y los tres son cadena o número** — la versión
  ejecutable de lo que ADR-005 decía solo en un comentario y en un tipo;
- **invalidar, transformar de nuevo y descartar sueltan los bytes**, cada uno con su URL;
- **la frase de paso no aparece en el estado publicado** (`JSON.stringify(taller)` no la contiene).

`sesion.ts` quedó en **96,73 %** y `src/lib/**` en 98,39 % / 97,16 %. Total: **519 pruebas**, 98,34 %
de sentencias. Las tres líneas que siguen sin cubrir son las dos de renderizado en servidor y el
`return actual` de los mensajes del taller, que el propio `recibir` intercepta antes.

**Lo que queda como regla:** verificar con `pnpm test`, que es lo que corre el CI. Un comando
parecido que no aplica los gates no es una verificación, es un ensayo.
