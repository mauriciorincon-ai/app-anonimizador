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
