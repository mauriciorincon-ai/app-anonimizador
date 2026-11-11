# Manual de uso — Velo

> _Velo para entregar. Desvelo para recuperar._
> Actualizado en el Sprint 012 · 10 de noviembre de 2026
>
> English version: [MANUAL-DE-USO.en.md](MANUAL-DE-USO.en.md)

Velo es la **aduana de tus datos**: lo que revisa tu tabla, tu JSON, tu PDF o tu imagen antes de
que salgan hacia una IA, una herramienta en la nube o el computador de un tercero. Este manual
cubre todo lo que Velo sabe hacer hoy.

---

## Lo primero, porque cambia cómo lo vas a usar

**Tu archivo no se sube a ningún lado.** Velo no tiene servidor. Cuando sueltas un archivo, se abre
dentro de la pestaña del navegador —en un hilo aparte, para que nada se congele— y ahí se queda.
No hay carga, no hay base de datos, no hay copia.

Eso tiene una consecuencia que conviene saber de antemano: **si recargas la página, el diagnóstico
desaparece**. No es un error. Es la misma razón por la que tus datos no se filtran: nunca se
guardaron en ningún sitio. Volver a soltar el archivo tarda lo mismo que la primera vez.

Y algo sobre el alcance, porque cambió: **Velo diagnostica, transforma, devuelve y deja
constancia**. Puedes enmascarar, seudonimizar y generalizar, llevarte el archivo tratado con su
certificado, y cuando el tercero te lo devuelva trabajado, recuperar los valores originales. Ese
camino de vuelta es la [bóveda](#5-la-bóveda-para-poder-deshacerlo) y
[el regreso](#6-el-regreso-recuperar-lo-que-entregaste). Y lo que hiciste queda anotado en
[la bitácora](#7-la-bitácora-acordarte-dentro-de-seis-meses), para dentro de seis meses. Cada uno
tiene su sección más abajo.

Y Velo trabaja con **tres clases de archivo**, no una. Las **tablas** (CSV y Excel) y los **JSON**
(un arreglo de objetos o JSON Lines) pasan por el diagnóstico y el taller de las secciones 2 a 7;
del JSON, [cómo se lee y qué no se trata](#si-tu-archivo-es-un-json), está explicado en la
sección 1. Los **PDF y las imágenes** (JPEG, PNG, WebP, HEIC —el formato de las fotos del iPhone—, AVIF y el video de una Live Photo)
no son datos tabulares: Velo les limpia
los **metadatos**, lo que el archivo dice de sí mismo y nadie ve en pantalla (autor, cámara,
ubicación, fechas, versiones anteriores), y lo explica
[la sección 8](#8-pdf-e-imágenes-limpiar-lo-que-el-archivo-dice-de-sí-mismo). Con la misma cautela
en las tres: **Velo limpia lo que el archivo dice de sí mismo; no toca el texto de las páginas ni
lo que se ve en la imagen.**

**Velo habla español e inglés.** En el encabezado de todas las pantallas hay dos botones, **ES** y
**EN**: el que está subrayado es el idioma en uso. Al abrir, Velo usa el idioma de tu navegador; si
prefieres otro, lo cambias ahí y toda la pantalla cambia con él —también el certificado y el
informe del regreso que descargas, que se escriben en el idioma que tengas elegido en ese momento—.
Si copias la dirección después de elegir, lleva `?lang=en` o `?lang=es` y abre igual para quien la
reciba. **Velo no recuerda tu elección**: como el resto, vive solo en la pestaña, así que al
recargar vuelve al idioma de tu navegador (o al de la dirección).

Hay cosas que el idioma **no** cambia, y conviene saberlo: lo que viene de tus archivos (los
nombres de columna, los valores, las muestras) se muestra tal como está; los reconocedores propios
de un país son los mismos en los dos idiomas —los colombianos (cédula, NIT, celular, placa, y la
Ley 1581 como marco) y los ocho documentos europeos de [la sección 10](#10-la-política-rgpd), con
el RGPD como marco— porque el inglés es el de la interfaz, no el de la detección; y la bóveda y la
bitácora son el mismo archivo sin importar en qué idioma las guardaste. Una anotación de la bitácora conserva la fecha tal como se escribió cuando la
anotaste. Lo que Velo escribe **dentro del archivo tratado** sí sigue el idioma con que pediste la
transformación: las dos palabras que usa al generalizar (el « a » entre los extremos de un rango y el
« (o vacío)» de un grupo con celdas vacías) salen como « to » y « (or empty)» si estabas en inglés, y
el certificado lo anota como «Idioma del trabajo». Mismo archivo, misma política, misma llave y mismo
idioma dan los mismos bytes; con otro idioma cambian esas dos palabras y nada más. Los nombres con
que se guardan los archivos (`velo-anonimizado-…`, `velo-limpio-…`, `velo-boveda-…`,
`velo-politica.json`) no cambian. El certificado, el certificado de la limpieza de un PDF o una
imagen y el informe del regreso salen en el idioma que usabas al descargarlos.

Dicho con precisión, porque la diferencia importa: **un seudónimo sigue siendo irreversible por sí
solo**. Quien reciba el archivo tratado no puede deshacerlo —eso es lo que lo hace seguro de
entregar—. Lo que lo deshace es la bóveda, un archivo cifrado aparte que solo tienes tú y que solo
se abre con tu frase de paso. Si no marcaste ninguna columna como reversible al transformar, no hay
bóveda y no hay vuelta: eso se decide antes, no después.

---

## Cómo se usa

### 1. Trae tu tabla

En la pantalla principal puedes **arrastrar** el archivo hasta el recuadro o **elegirlo** con el
botón (que funciona con teclado: llega con la tecla Tab y se abre con Enter). El recuadro se llama
«Trae tu tabla», pero no recibe solo tablas: también un JSON, un PDF o una imagen.

Velo lee:

| Formato                                                                                                                                         | Tope                  | Por qué                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV** (`.csv`)                                                                                                                                | sin tope de peso      | Se lee por partes; nunca existe entero en memoria. Por encima de 20.000.000 de celdas, Velo lo lee [por pasadas](#9-archivos-enormes-el-modo-de-alto-volumen).                              |
| **Excel** (`.xlsx`, `.xls`)                                                                                                                     | **150 MB**            | Un Excel hay que abrirlo completo para leerlo. Por encima de ese tamaño el navegador se queda sin memoria, así que Velo lo rechaza **antes** de abrirlo.                                    |
| **JSON** (`.json`) y **JSON Lines** (`.jsonl`, `.ndjson`)                                                                                       | sin tope de registros | La tabla que Velo arma vive en memoria hasta 20.000.000 de celdas (registros × rutas distintas); por encima, lo lee [por pasadas](#9-archivos-enormes-el-modo-de-alto-volumen) sin armarla. |
| **PDF** (`.pdf`)                                                                                                                                | **50 MB**             | Un PDF no se puede reescribir por partes: se abre entero en memoria, y lo que pesa es la cantidad de piezas que trae dentro. Velo lo rechaza **antes** de abrirlo.                          |
| **Imagen**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`), HEIC (`.heic`, `.heif`), AVIF (`.avif`) y el video de una Live Photo (`.mov`) | **100 MB**            | Igual que el PDF: se reescribe de una vez.                                                                                                                                                  |

Los topes de un JSON son: **256 rutas distintas**, **32 niveles** de anidamiento dentro de un
registro, claves de hasta 256 caracteres y textos de hasta 1.048.576 caracteres. Pasarse de
cualquiera se rechaza con un mensaje que dice cuál y qué hacer. El número de registros no tiene
tope: pasadas las 20.000.000 de celdas, el JSON se lee [por pasadas](#9-archivos-enormes-el-modo-de-alto-volumen).

Si tu Excel pesa más de 150 MB: ábrelo y guárdalo como CSV. Desde 40 MB Velo te avisa de que va a
tardar y te ofrece la misma salida. Si tu PDF pasa de 50 MB o tu imagen de 100 MB: divide el PDF en
partes con el programa que lo creó, o exporta la imagen otra vez con menos peso (menos resolución,
más compresión), y suelta esa copia.

Dos cosas más sobre lo que Velo lee:

- **Decide qué es un PDF o una imagen por su contenido, no por su extensión.** Si un `.jpg` es en
  realidad un PNG, lo trata como PNG, lo dice en un aviso y la copia limpia sale con la extensión
  que le corresponde. Si el contenido no es nada de lo que Velo lee (un `.json` que por dentro es
  un PDF, por ejemplo), se rechaza con un mensaje que dice qué hacer.
- **Lee HEIC y AVIF**, los formatos en que muchos teléfonos guardan las fotos (`.heic`, `.heif` y
  `.avif`), y **el video de una Live Photo** (`.mov`), pero solo para limpiarles los metadatos,
  como a cualquier imagen. Velo **no convierte** la foto ni la decodifica: la copia limpia sigue
  siendo del mismo formato. Qué quita, qué conserva y qué rechaza está en
  [la sección 8](#8-pdf-e-imágenes-limpiar-lo-que-el-archivo-dice-de-sí-mismo).

Mientras trabaja verás en qué va: **tomando la huella** del archivo, **leyendo**, **reconociendo
las columnas** y **midiendo el riesgo**. La barra solo aparece cuando hay algo real que medir; en
las etapas que no tienen una fracción que mostrar, Velo te dice la etapa y no te dibuja una barra
falsa. Con un CSV enorme verás además «Modo alto volumen: el archivo se lee por pasadas», que
explica [la sección 9](#9-archivos-enormes-el-modo-de-alto-volumen). Con un PDF o una imagen no hay filas ni columnas: Velo dice «Leyendo lo que el archivo dice
de sí mismo» y no dibuja barra, porque abre el archivo entero de una vez.

#### Si tu archivo es un JSON

Un JSON no es una tabla: sus registros pueden estar anidados, faltarles claves, cambiar de tipo de
uno a otro y llevar listas. Velo lo pasa por la misma aduana de las tablas, pero declara lo que no
puede tratar en vez de callarlo.

**Qué lee.** Dos formas: un arreglo de objetos (`[{…}, {…}]`) y JSON Lines (un objeto por línea).
Cuál de las dos es lo decide el contenido. Para archivos grandes conviene JSON Lines: una línea es
un registro, así que el número de línea con el que Velo avisa si algo está mal señala el registro.
Velo no usa el lector de JSON del navegador —reordenaría ciertas
claves y cambiaría los números muy grandes— sino uno propio y estricto. Por eso rechaza un
registro que repite una clave: según quién lo lea gana la primera o la última, y Velo no elige por
ti qué dato conservar.

**Cada ruta es una columna.** Un valor dentro de objetos anidados se vuelve una columna cuyo nombre
es el camino hasta él: `paciente.contacto.correo`. Con eso, la política, el diagnóstico, el riesgo
y el certificado funcionan como con una tabla. Para reconocer qué es cada ruta, Velo mira su
**último tramo** (`correo`, no `paciente`): que el padre se llame `salud` no vuelve sensible lo que
tiene dentro. El diagnóstico dice «registros · rutas tratadas» donde una tabla dice «filas ·
columnas».

**El panel «Estructura del JSON».** Aparece en el diagnóstico solo con un JSON. Dice cuántos
registros hay, cuántas rutas se tratan, la profundidad máxima y la forma del archivo, y declara
dos cosas:

- **Las listas no se tratan.** Una lista dentro de un registro (`contactos[]`, `etiquetas[]`) no
  cabe en una columna: Velo no la aplana ni la trata, y sale al archivo **tal cual**. Lo dice
  arriba de la tabla, con un aviso fuerte: nombra la ruta, en cuántos registros aparece y los
  **nombres** de los campos que vio dentro (nunca los valores). Una lista puede llevar correos,
  teléfonos o documentos, y **la política que elijas no la alcanza**. Antes de entregar el archivo,
  trata esas listas tú o quítalas del origen. Hoy Velo no las trata.
- **Las rutas irregulares.** Las que faltan en algunos registros o cambian de tipo de uno a otro
  (a veces número, a veces texto o `null`). Donde un registro no trae la ruta, Velo no la crea. Una
  celda que la política cambie sale como texto, aunque el original fuera un número.

**Qué sale.** Un JSON entra y un JSON sale, de la misma clase: un arreglo sale como
`velo-anonimizado-<8 caracteres>.json` y JSON Lines como `.jsonl`. Es una reescritura fiel, no una
copia byte por byte:

- Las claves conservan **su orden original** y la estructura es la misma.
- Se escribe **compacto, un registro por línea**: los espacios y saltos de línea entre elementos
  del original no se conservan.
- Los números que no cambiaron se copian con sus dígitos exactos (`12345678901234567890`, `1E3`),
  sin pasar por un número del navegador que los redondearía.
- Una celda que la política cambió sale siempre como texto (un `30-39` generalizado ya es texto).
  Una que quedó vacía se escribe como la tenía el original: sin la clave, `null` o `""`.
- Una columna que la política **suprime** desaparece de todos los registros; si el objeto que la
  contenía se queda sin nada, queda `{}`.
- Lo que hay dentro de una lista declarada no se toca.

El certificado lleva las dos huellas SHA-256, y Velo recalcula la del original mientras escribe: si
el archivo cambió desde el diagnóstico, no lo entrega.

**Con vuelta.** Un JSON también puede tener bóveda: la casilla «Poder deshacerlo con una bóveda»
funciona igual que con una tabla, y cuando el tercero te devuelva el archivo trabajado lo recuperas
en [el regreso](#6-el-regreso-recuperar-lo-que-entregaste), que lee JSON y JSON Lines además de
CSV. Lo que no es un seudónimo reversible (enmascarar, generalizar, quitar una columna, el ruido)
no vuelve, igual que en una tabla.

**Si no es un JSON válido,** Velo te dice en qué línea se detuvo («ahí, o justo antes, aparece el
problema») y no repite nada de lo que hay dentro: ni un trozo, ni el nombre de una clave. Los
demás motivos —no es una lista de registros, demasiados niveles, demasiadas rutas distintas, una
clave repetida, demasiado grande— también dicen qué hacer.

### 2. Lee el diagnóstico

La pantalla de diagnóstico tiene tres partes. (Es la de una tabla o un JSON. Si soltaste un PDF o
una imagen, el diagnóstico es otro y lo explica [la sección 8](#8-pdf-e-imágenes-limpiar-lo-que-el-archivo-dice-de-sí-mismo).)

#### El riesgo de reidentificación

La cifra grande responde a una sola pregunta: **cuánta gente de tu tabla queda sola**. Un registro
«solo» (o _único_) es una fila cuya combinación de valores no la comparte nadie más — se puede
señalar con el dedo.

| Dato                        | Qué significa                                                           |
| --------------------------- | ----------------------------------------------------------------------- |
| **% de únicos**             | Qué proporción de tus registros no comparte su combinación con nadie.   |
| **Grupo más pequeño (k)**   | Cuántas personas hay en el grupo más chico. Si es 1, alguien está solo. |
| **Riesgo del más expuesto** | «1 en 1» quiere decir que acertar quién es esa persona es seguro.       |
| **Riesgo promedio**         | El promedio del riesgo sobre todos los registros.                       |
| **Grupos distintos**        | Cuántas combinaciones diferentes de valores hay.                        |

**Todas estas cifras son exactas.** No son una estimación ni una proyección: se contaron registro
por registro sobre tu archivo completo. El panel lo dice con todas sus letras («Cifra exacta»), y
esa marca importa porque en el taller conviven con **cifras estimadas** —las del riesgo poblacional,
más abajo—, que llevan la palabra «estimado» pegada al número. Nunca se suman ni se promedian entre
sí: hablan de cosas distintas.

El modelo que Velo usa se llama **prosecutor**: supone que quien ataca ya sabe que la persona está
en tu tabla y solo busca cuál de las filas es. Es el escenario más adverso de los que se estudian,
y el único que se puede calcular exacto.

#### Columna por columna

Cada fila de la tabla te dice qué encontró Velo y, sobre todo, **por qué**. Ese «por qué» tiene
tres niveles de certeza, y la diferencia entre ellos es la diferencia entre saber y sospechar:

| Nivel             | Qué quiere decir                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirmado**    | Existe un dígito de verificación oficial y Velo lo recalculó y cuadra. Es el caso del NIT (mod 11 de la DIAN), las tarjetas (Luhn), el IBAN y los documentos europeos de la [sección 10](#10-la-política-rgpd). |
| **Por su forma**  | No existe checksum público para ese dato, así que solo se pudo comprobar la forma. Es el caso de la cédula colombiana: la Registraduría no publica un dígito de verificación.                                   |
| **Sin confirmar** | La conclusión se apoya en el **nombre de la columna**, no en los valores. Ningún cálculo puede mirar «J45.9» y afirmar que es un diagnóstico de salud; solo el encabezado lo sugiere.                           |

Y cada columna cae en una de las **cuatro categorías de la Ley 1581 de 2012**:

| Categoría                                              | Qué es                                                                                                                                                    | Ejemplos                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Identificador directo**                              | Señala a la persona sin ayuda de nada más.                                                                                                                | cédula, NIT, nombre, correo, celular, dirección |
| **Dato sensible (Ley 1581 art. 5 · RGPD art. 9 y 10)** | Salud, origen racial o étnico, convicciones, vida sexual, biometría y, en el RGPD, condenas e infracciones penales. La ley los protege de forma especial. | diagnóstico, grupo étnico, EPS                  |
| **Cuasi-identificador**                                | Por sí solo no identifica; **combinado con otros, sí**.                                                                                                   | fecha de nacimiento, sexo, municipio, estrato   |
| **No personal**                                        | No apunta a una persona.                                                                                                                                  | monto, sucursal, código de producto             |

Una aclaración que suele hacer falta: **una cédula no es un «dato sensible»** en el sentido de la
ley. Es un dato personal y un identificador directo, que es distinto. Velo no mezcla las dos cosas
aunque pintar todo de rojo fuera más llamativo.

Las **muestras** que se ven en la última columna van siempre enmascaradas (`103***89`), y las
columnas de datos sensibles no llevan muestra ninguna: con tres valores posibles, un asterisco no
esconde nada.

#### El consejero de cruces

Aquí está el hallazgo que casi nadie espera: **columnas que por separado no identifican a nadie,
juntas señalan a media tabla**. Es el resultado clásico de Latanya Sweeney (2000) y su réplica de
Philippe Golle (2006), aplicado a _tus_ datos.

El consejero muestra dos cosas:

- **Las que delatan solas**: columnas que, por sí mismas, ya dejan solo a casi todo el mundo. Suele
  ser lo más importante del archivo.
- **Las combinaciones más delatoras**, cada una con su **k real** — no estimado.

Y declara su propio alcance: cuántas combinaciones evaluó, sobre cuántas columnas candidatas, con
qué tope, y qué columnas quedaron fuera con su motivo. Si Velo miró 6 columnas de 24, lo dice ahí
mismo y no en una nota al pie de la documentación.

### 3. Llévate el reporte

El botón **Descargar el reporte** produce un archivo HTML que se abre con doble clic en cualquier
computador, **sin internet y sin instalar nada**. Antes de descargarlo puedes verlo completo con
«Ver antes de descargar».

**Qué lleva:** nombres de columna, qué se detectó y por qué, las categorías, las cifras de riesgo,
la huella del archivo y la fecha.

**Qué no lleva:** ninguna fila de tu tabla. Las muestras van enmascaradas y las columnas sensibles
no llevan ni muestra.

#### La huella SHA-256 y para qué sirve

El reporte incluye el **SHA-256** del archivo que analizaste. Es una firma de 64 caracteres que
depende de cada byte del archivo: si cambia una sola celda, cambia la huella entera.

Sirve para que quien reciba el reporte pueda comprobar que habla de **esa copia exacta** y no de
otra. Se verifica así:

```bash
# macOS
shasum -a 256 mi-archivo.csv

# Linux
sha256sum mi-archivo.csv
```

```powershell
# Windows (PowerShell)
Get-FileHash mi-archivo.csv -Algorithm SHA256
```

El texto que salga tiene que ser idéntico al del reporte.

---

### 4. Transforma: el taller

Desde el diagnóstico, **Transformar este archivo** te lleva al taller. Es la parte que cambia los
datos de verdad, y ocurre igual que el diagnóstico: dentro de esta pestaña, sin subir nada. (Con un
PDF o una imagen el botón se llama **Limpiar este archivo** y lleva a una pantalla sin opciones:
[sección 8](#8-pdf-e-imágenes-limpiar-lo-que-el-archivo-dice-de-sí-mismo).)

#### La política: qué se le hace a cada columna

Una fila por columna, con un desplegable. Puedes elegir columna por columna o partir de una
**política de fábrica**:

- **Habeas Data (Colombia)** — Ley 1581 de 2012 y Decreto 1377 de 2013, con las técnicas de la guía
  de anonimización AGN + SIC. Declara un objetivo de grupo mínimo (k = 5).
- **HIPAA · Safe Harbor** — los 18 identificadores de 45 CFR §164.514(b)(2). Ojo: Safe Harbor manda
  **borrar**, no seudonimizar, porque §164.514(c) prohíbe un código derivado de la información.
- **RGPD · GDPR (UE)** — el Reglamento (UE) 2016/679. **Seudonimiza, no anonimiza**: lo cuenta la
  [sección 10](#10-la-política-rgpd). Declara un objetivo de grupo mínimo (k = 5) que es elección
  de Velo, no del reglamento.

Las tres dicen, ahí mismo, cuántos de sus puntos reconoce Velo por el contenido de la columna,
cuántos solo por el nombre y **cuántos tienes que marcar tú**. Ninguna es una certificación.

En cuanto tocas una regla de una política de fábrica, Velo lo dice: _«ya no es Habeas Data»_ (o la
que fuera). La guía oficial no respalda una decisión que no tomó.

La política **no se guarda en ningún lado**. Si la quieres para el mes que viene, **expórtala** —
es un archivo JSON que puedes volver a importar. Lleva los nombres de tus columnas, que son datos
tuyos, y por eso no entra a la memoria de este navegador.

#### «Generalizar hasta alcanzar el k»

Es la única técnica que no decides tú del todo: marcas las columnas y **Velo mira todas juntas** y
decide dónde cortar hasta que nadie quede en un grupo de menos de _k_ registros. Al elegirla aparece
la casilla del **grupo mínimo**, con 5 puesto — y ese 5 queda **dentro de la política** desde ese
momento, no solo en la pantalla. Cuanto más alto el k, más seguro y menos preciso el dato.

Si importas una política que pide generalización automática y **no trae un k**, Velo te lo dice en
rojo y deja la casilla vacía: sin un k no hay hasta dónde generalizar, y esas columnas saldrían
intactas. Si aun así transformas, el balance lo pone arriba del todo con sus nombres.

Hay dos maneras de llegar a ese k —Mondrian, la de siempre, y la generalización óptima— y el taller
te deja compararlas antes de elegir: está explicado al final de esta sección, en
[«Cómo llegar al k»](#cómo-llegar-al-k-mondrian-o-la-generalización-óptima).

#### La llave, si pides seudónimos

Un seudónimo se calcula con una **frase de paso que solo tú tienes**. Tres cosas que conviene saber
antes de escribirla:

- **La misma frase y la misma sal dan los mismos seudónimos.** Es lo que te permite cruzar el
  archivo de marzo con el de abril sin tener los datos reales delante. En la web cada llave nueva
  estrena su propia sal y la pantalla no deja escribir una: para repetirlos, usa Velo local con
  `--sal`.
- **Si la pierdes, no hay vuelta atrás.** Nadie puede regenerarla; es la contrapartida de que nadie
  más la tenga.
- **Si se filtra, los seudónimos se vuelven enlazables.** Trátala como una contraseña.

Derivarla cuesta 600.000 vueltas de PBKDF2 (el mínimo que recomienda OWASP), **y ese costo es la
protección**: encarece por igual cada intento de adivinarla. Cuánto tarda depende del equipo — en un
portátil moderno es un instante, en un teléfono de gama baja se nota—; lo que se garantiza es el
número de vueltas, no los segundos. Guarda
la frase **y la sal** que Velo te enseña: sin las dos, ni Velo local puede repetir los seudónimos el mes que viene.

#### Antes y después

La vista previa enseña, columna por columna, qué va a recibir la otra persona. Los valores de la
izquierda van **enmascarados** porque siguen siendo tus datos; los de la derecha van completos
**cuando ese valor cambió**. Una columna sensible que no cambió no se muestra.

Verás filas de la derecha enmascaradas dentro de columnas que sí cambiaron, y es correcto: una
generalización deja intacto lo que ya estaba en su sitio —un prefijo de 2 no toca lo que ya mide
2— y un valor que no cambió sigue siendo tu dato, así que se tapa igual.

Debajo, el balance. Y aquí hay una regla del producto que conviene conocer: **si queda algo sin
tratar, eso se lee antes que cualquier porcentaje**. Una cédula intacta al lado de un «riesgo
reducido 87 %» son dos frases ciertas cuya suma dice algo falso, así que Velo pone la advertencia
arriba y **no** presenta la cifra como titular hasta que nada la desmienta.

Lo que puede aparecer ahí:

| Advertencia                           | Qué significa                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identificadores sin tratar            | Hay columnas que señalan a la persona sin ayuda de ninguna otra y la política las deja intactas.                                    |
| Registros que siguen solos            | Después del tratamiento, alguien sigue siendo único en su combinación de valores.                                                   |
| El k pedido no se alcanzó             | Pediste grupos de N y el reparto llegó a menos. Velo **no borra filas** para lograrlo.                                              |
| El k del reparto no es el del archivo | Las columnas generalizadas alcanzaron su k, pero otras columnas que no entraron parten esos grupos. **Vale el número del archivo.** |
| Grupos homogéneos                     | Hay grupos donde todos comparten el mismo dato sensible: dar con el grupo basta para saberlo.                                       |
| Colisiones de seudónimo               | Conservar el formato (cédula, NIT, un documento europeo) reduce el espacio disponible y dos valores distintos pueden chocar.        |

#### El archivo

**Preparar el archivo** lo escribe, y **Guardar** lo baja. Sale como
`velo-anonimizado-<8 caracteres>.csv` (`.json` o `.jsonl` si lo que entró fue un JSON, ver
[«Si tu archivo es un JSON»](#si-tu-archivo-es-un-json)) y no repite el nombre del original a propósito: un nombre como
`pacientes-2026.csv` cuenta de qué va el contenido antes de que nadie lo abra, y ese nombre viaja en
el asunto de un correo.

Esos ocho caracteres **no son un número de serie**: son el principio del SHA-256 de la política que
aplicaste. Dos archivos que lo compartan recibieron exactamente el mismo tratamiento — y el
certificado lleva el hash completo, para que puedas comprobarlo.

Un CSV o un Excel salen como un CSV separado por comas, con salto de línea `\n` y **sin BOM**. Si
Excel en Windows te pregunta por la codificación, es **UTF-8**. (Velo no genera `.xlsx`: un `.xlsx` es un zip y sus entradas
llevan fecha, así que dos archivos iguales no saldrían idénticos byte por byte — y esa igualdad es
justo lo que Velo promete.)

#### El certificado del tratamiento

El taller también entrega un documento, y no es el mismo del diagnóstico: además de lo que hay en la
tabla, dice **qué se le hizo** — el balance con sus advertencias, la utilidad que se perdió y el hash
completo de la política. Como todo documento de Velo, puedes **verlo antes de descargarlo**.

**Aparece después del archivo, no antes.** El certificado lleva la huella del archivo tratado, y esa
huella no existe hasta que el archivo existe. Mientras tanto, en su sitio verás una nota que lo dice.

Mándalo con el archivo. Un CSV anonimizado que llega solo obliga a quien lo recibe a creerte; con el
certificado al lado, puede **comprobarlo**.

> **Lleva las dos huellas, y por eso sirve.** Una es la del archivo que **entró** a Velo; la otra, la
> del que **descargas**. Quien reciba tu archivo puede recalcular esa segunda huella con un comando
> —el propio certificado se lo explica, con la orden exacta para macOS, Linux y Windows— y comprobar
> que el documento habla de **esa copia y no de otra**. Si no cuadra, el archivo no es el que el
> certificado describe.
>
> Lo que un certificado **no** es: una firma digital. Prueba que el documento y el archivo se
> corresponden, no quién los produjo.

#### El riesgo estimado: y en la población entera, ¿cuánto?

Debajo del balance hay un segundo panel, y la diferencia entre los dos es lo más importante que
tiene que quedar claro:

|                 | El balance                     | El riesgo estimado                      |
| --------------- | ------------------------------ | --------------------------------------- |
| De qué habla    | **tu archivo**                 | la **población** de la que salió        |
| Cómo se obtiene | contando registro por registro | con un modelo estadístico y un supuesto |
| Cómo va marcado | «Cifra exacta»                 | «Cifra estimada», con su modelo al lado |

**Nunca se juntan.** No hay un «riesgo total» que promedie los dos, ni aparecen con la misma
tipografía. Sumar una cifra exacta con una estimada da un número que no es ninguna de las dos cosas.

**Es opcional y hay que declarar la población.** Velo solo ve tu archivo: no puede saber si esas
2.000 filas son de un municipio de 40.000 habitantes o de un país entero, y **no se lo inventa**. Sin
ese dato la estimación no aparece, y el riesgo exacto no depende de él.

Cuando lo declaras salen dos cifras, cada una con su fuente citada:

- **Si alguien intenta emparejar una fila con una persona, ¿qué probabilidad tiene de acertar?**
  (Benedetti–Franconi, 1998 — el estimador de μ-ARGUS.)
- **De tus registros únicos, ¿cuántos lo serían también en la población?** (Zayatz, 1991, del
  U.S. Census Bureau.)

**Y a veces Velo se niega a darte la segunda**, con esta explicación: si tu archivo es menos del
10 % de la población que declaraste, ese método deja de servir — en la evaluación del propio informe
de Zayatz, con una muestra del 1 % las estimaciones llegan a errar por un factor de 10. Preferimos
no dar la cifra a darla débil. La primera sigue contestando: los dos modelos no valen en el mismo
terreno, y esa diferencia es información.

Un detalle que sale solo de las matemáticas y conviene saber: **si declaras que tu archivo es la
población entera, las cifras estimadas caen exactamente encima de las exactas.** No es una excepción
programada; es que ahí ya no hay nada que estimar.

#### Cómo llegar al k: Mondrian o la generalización óptima

Cuando alguna columna lleva la técnica «Generalizar hasta alcanzar el k», debajo del campo del grupo
mínimo aparece el panel **«Cómo llegar al k»**. Ahí eliges entre dos caminos hacia el mismo k:

- **Mondrian (el de siempre)**, que es el que viene puesto. Corta el archivo por regiones y
  generaliza distinto en cada una: es rápido y pierde poco donde hay muchos datos.
- **La generalización óptima.** Sube cada columna por su **escalera** hasta un nivel, **el mismo en
  todo el archivo**, y de todas las combinaciones de niveles elige la que cumple el k perdiendo
  menos información, medida en bits. Es el algoritmo OLA (El Emam y otros, _JAMIA_, 2009). **Por
  omisión no borra filas**; si tú lo pides, puede borrar hasta un tope (más abajo).

La elección queda dentro de la política, así que viaja con ella si la exportas.

**La escalera de cada columna.** Es la lista de pasos, del más fino al más grueso, por los que sube
una columna. Velo propone una según el tipo y el nombre de la columna; si no encaja, la cambias en
el desplegable «Escalera de generalización para la columna …»:

| Escalera                                                                 | Qué hace                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| «Rangos de 5, 10, 20 y 40»                                               | Un número en rangos cada vez más anchos.                     |
| «Rangos de 10, 100, 1.000 y 10.000»                                      | Lo mismo, para cifras grandes.                               |
| «Fecha: mes, trimestre, año»                                             | El trimestre sale como intervalo (`1987-01/1987-03`).        |
| «Primeros 3, 2 y 1 caracteres»                                           | Un código que conserva cada vez menos caracteres del inicio. |
| «Solo el valor o nada»                                                   | El valor tal cual o suprimido (`*`), sin pasos intermedios.  |
| «Municipio, departamento, región (DIVIPOLA, DANE)»                       | De fábrica, con fuente oficial.                              |
| «Edad: quinquenios, grandes grupos (DANE)»                               | De fábrica, con fuente oficial.                              |
| «Actividad económica: grupo, división, sección (CIIU Rev. 4 A.C., DANE)» | De fábrica, con fuente oficial.                              |
| «Actividad económica: grupo, división, sección (CIIU Rev. 5 A.C., DANE)» | De fábrica, con fuente oficial.                              |

Las de fábrica se apoyan en fuentes oficiales, y el certificado las cita con su fecha de
consulta (2 de noviembre de 2026; la CIIU Rev. 5, 8 de noviembre de 2026):

| Escalera                       | Fuente y versión                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Municipio → departamento       | DANE, DIVIPOLA «Códigos municipios», publicada en datos.gov.co (conjunto gdxc-w37w), corte al 30 de diciembre de 2024: 1.122 municipios y áreas, 33 departamentos.             |
| Departamento → región          | Ley 2056 de 2020, artículo 45 (secretariasenado.gov.co): las 6 regiones del Sistema General de Regalías.                                                                       |
| Edad → quinquenio → gran grupo | DANE, Proyecciones de Población y Estudios Demográficos (PPED), actualización de julio de 2025: quinquenios de 0-4 a 95-99 y 100 y más; grandes grupos 0-14, 15-59 y 60 y más. |
| Actividad económica (Rev. 4)   | DANE, CIIU Rev. 4 A.C., actualización 2022, adoptada por la Resolución 2306 de 2022: clase, grupo, división, sección.                                                          |
| Actividad económica (Rev. 5)   | DANE, CIIU Rev. 5 A.C., «Estructura detallada», adoptada por la Resolución 992 de 2026: 22 secciones, 87 divisiones, 266 grupos y 544 clases.                                  |

**Dos revisiones de la CIIU, una al lado de la otra.** Velo trae la **Rev. 4 A.C.** (2022) y la
**Rev. 5 A.C.** (la que el DANE adoptó en 2026, con dos años de transición): un mismo archivo puede
traer códigos de una o de otra. No son intercambiables: **436 de las 544 clases de la Rev. 5 existen
también en la Rev. 4 con el mismo número, y 118 de esas cambian de sección** (la Rev. 4 junta las
divisiones 58 a 63 en la sección J; la Rev. 5 las parte en J y K). El mismo código puede subir a
otra letra según la revisión, y por eso importa cuál usas.

- **Cómo decide Velo cuál proponer.** Mira los códigos de la columna: cuántos existen **solo** en la
  Rev. 4 y cuántos **solo** en la Rev. 5 (66 y 108 clases, respectivamente; el resto es común). Si
  los exclusivos son de una sola revisión, propone esa, y debajo del desplegable dice cuántos de
  sus códigos solo existen allí. Si hay de las dos, o si **todos** son comunes y no dicen cuál es,
  propone la Rev. 4 y lo dice. **El desplegable de la escalera es el selector: elige tú.** A la
  página solo llegan esos conteos; los códigos no salen del archivo.
- **Velo no traduce de una revisión a otra.** La tabla de correspondencia del DANE (15 de septiembre
  de 2026) relaciona los códigos de una y otra **de muchos a muchos**: un código puede repartirse en
  varios y varios juntarse en uno. Velo la **cita** en el certificado pero **no la usa**: convertir
  un código en otro sería inventar a qué actividad pertenece cada fila. Cada columna sube por la
  escalera de la revisión que elegiste, y un código que no está en esa revisión se queda como está
  en los pasos intermedios y llega a `*` en el último, como cualquier código que no se encuentra.

Lo que una escalera de fábrica no encuentra —un código que no existe, un nombre de municipio que se
repite en dos departamentos— se queda como está en los pasos intermedios y llega a `*` en el último.
Velo **no adivina** de cuál «La Unión» hablas: elegir una sería afirmar dónde vive alguien.

**ℓ distinta, si hay datos sensibles en el reparto.** Aparece un campo «ℓ distinta (opcional) sobre
…», de 2 a 100. Pide que en cada grupo haya al menos ℓ valores distintos del dato sensible, para que
estar en el grupo no lo delate. **Solo la generalización óptima lo exige**; con Mondrian se mide, no
se exige. Si la ℓ pedida no se alcanza, el certificado lo dice; solo con el tope de supresión, que tú pones, Velo borra filas para lograrla.

**Compararlas antes de elegir.** El botón **«Comparar los dos caminos»** calcula los dos y los pone
en una tabla, «Los dos caminos, lado a lado»:

| Fila                         | Qué dice                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| ¿Llega al k pedido?          | ✓ Sí o ✗ No, para cada camino.                                                   |
| Grupo más pequeño (k)        | El k que de verdad se alcanzó.                                                   |
| ℓ distinta                   | La que se alcanzó, si pediste una.                                               |
| Grupos distintos             | Cuántas combinaciones diferentes quedan.                                         |
| Registros solos en su grupo  | Cuántos siguen siendo únicos.                                                    |
| Riesgo del más expuesto      | La probabilidad de acertar con la persona más expuesta, en las columnas medidas. |
| Información que queda (bits) | Cuánto del detalle original sobrevive: más bits, menos pérdida.                  |
| Cómo queda cada columna      | El nivel de cada una (con Mondrian, «cortes locales»).                           |
| Combinaciones revisadas      | «N de M»: cuántas de las posibles recorrió la búsqueda.                          |

La tabla lo dice debajo del título y conviene leerlo: **está medida sobre las columnas del reparto
—las que marcaste con «Generalizar hasta alcanzar el k»—, no sobre el archivo entero.** Otras
columnas que no entraron al reparto pueden partir esos grupos; el balance completo, el que vale,
llega al transformar.

«Óptima» quiere decir la mejor combinación de niveles **de las escaleras que le diste**, no la mejor
generalización que existe: con otras escaleras, o con otro tope de supresión, el resultado podría
ser otro.

**Tope de supresión: borrar filas, solo si lo pides.** Debajo de las escaleras hay un campo
**«Tope de supresión (opcional), en % de las filas»**. Vacío, o en 0, Velo **no borra ninguna fila**
y todo funciona como antes: el archivo sale **byte por byte igual** que sin el campo. Con un número
—por ejemplo 2,5— la búsqueda puede dejar fuera del archivo de salida las filas que quedan en
grupos que no llegan al k (o a la ℓ), **siempre que no sean más que ese porcentaje de las filas**, a
cambio de generalizar menos las demás: a veces borrar tres filas sueltas ahorra subir una columna
entera de nivel. La búsqueda sigue siendo **exacta**, no una aproximación: encuentra la combinación
de menor pérdida entre las que caben en el tope, y cada fila borrada se cuenta como pérdida total.

- **La tabla «Los dos caminos, lado a lado»** gana una tercera columna, **«Óptima, borrando hasta N %»**,
  junto a **«Óptima, sin borrar»**, y una fila **«Filas que salen del archivo»**: así ves, con la
  pérdida de cada una, cuánto te ahorra el tope y cuánto cuesta.
- **Las filas salen del archivo de salida, jamás de tu original.** La vista previa y las medidas de
  utilidad se calculan sobre las filas que quedan. El certificado y el reporte dicen **cuántas filas
  salieron y de qué tamaños de grupo eran** (por ejemplo «3 de grupos de 1 · 4 de grupos de 2»):
  conteos, nunca valores.
- **En un JSON el tope no se aplica**: cada fila de un JSON es un registro reescrito en su lugar, y
  quitarla rompería su estructura. La pantalla y el certificado lo dicen («El archivo es JSON…»).
- El tope viaja dentro de la política si la exportas, y también lo respeta [Velo local](#11-velo-en-tu-equipo-la-consola-las-bases-de-datos-y-la-api):
  la misma política da los mismos bytes en la web y en tu equipo.

**Los topes y el tiempo.** Si la retícula —el producto de los pasos de todas las escaleras— pasa de
**20.000 combinaciones**, Velo no la recorre: la tabla dice «Sin calcular: la retícula pasa del
tope», las columnas salen **intactas** y el balance lo pone primero. Con menos columnas en el
reparto o con escaleras más cortas, la retícula cabe. Con 500.000 filas y 6 columnas la búsqueda
tarda unos 10 a 30 segundos según el equipo; ocurre en segundo plano, así que la página no se
congela, y corre **dos veces**: al comparar y al transformar.

**Lo que queda escrito.** El certificado gana la sección **«Cómo se llegó al k · La generalización
óptima»**: cada columna con su escalera y el nivel que se eligió, el k y la ℓ medidos, cuántas
combinaciones se revisaron y las fuentes de las escaleras de fábrica con su fecha.

#### Ruido con garantía: privacidad diferencial local

El desplegable de cada columna trae tres técnicas más, que agregan **ruido**: un cambio al azar,
medido, en cada celda. Las tres necesitan la llave del proyecto (la frase de paso de más arriba),
porque el azar sale de ella. «Garantía», aquí, es el nombre del panel y quiere decir **un ε medido
con su alcance**; no es una promesa de que el archivo sea anónimo. Los parámetros aparecen debajo
del menú:

| Técnica                      | Para qué sirve                         | Parámetros                                                                      | Qué cubre su ε                                                       |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| «Ruido de Laplace (ε)»       | Números (montos, edades, pesos)        | ε (0,1 · 0,5 · 1 · 2 · 4 · 8), mínimo y máximo **posibles** del dato, decimales | ε por valor de ese campo.                                            |
| «Respuesta aleatorizada (ε)» | Categorías, hasta 64 valores distintos | ε                                                                               | ε efectivo, siempre menor o igual al pedido, por valor de ese campo. |
| «Perturbar ±%»               | Números                                | Cuánto puede moverse el dato, de 1 a 50 %                                       | No tiene ε: **sin garantía formal**.                                 |

- **Ruido de Laplace.** A cada número se le suma ruido de un Laplace discreto. El rango que declaras
  es el que el dato **puede** tener (una edad, de 0 a 120), no el que tiene tu archivo: sacarlo de
  los datos ya delataría algo. Lo que cae fuera del rango se recorta antes del ruido y se cuenta; lo
  que no es un número se queda como está y también se cuenta; una celda vacía sigue vacía.
- **Respuesta aleatorizada.** Cada celda, a veces, responde un valor al azar entre los que tiene la
  columna. Los valores posibles salen del archivo: **que un valor aparezca en la columna no está
  protegido por ε.** Con más de **64 valores distintos Velo no la aplica**: la columna sale intacta
  y el balance lo dice primero.
- **Perturbar ±%.** Mueve cada número al azar hasta ±x %. No es privacidad diferencial: no tiene ε y
  no promete nada medible, y por eso la pantalla, el certificado y la bitácora la rotulan «sin
  garantía formal».

**Qué es ε, dicho sin fórmulas.** Mide cuánto puede aprender, de **un valor de un campo**, quien ve
el archivo. A menor ε, más protección y más ruido —el dato sale menos útil—; a mayor ε, menos ruido
y menos protección. «Local» quiere decir que el ruido entra en cada celda antes de que el
archivo salga de tu computador: el archivo que entregas ya lo lleva. **Velo no decide qué ε te
conviene ni dice que alguno sea «suficiente»**: depende de para qué es el archivo y a quién va. La
pantalla repite el ε y su alcance junto al menú de cada columna: «Privacidad diferencial local,
ε = X por valor de este campo».

**Después de transformar** aparece el panel **«Ruido con garantía · Privacidad diferencial
local»**, aparte del balance. Por columna dice el mecanismo, el ε efectivo (y el pedido, si
difieren), cuántas celdas recibieron ruido y las notas: cuántas celdas se recortaron, cuántas no
eran un número, de cuántos valores es el dominio. Al final, **«ε por fila»**: la suma de los ε de
las columnas con ruido, porque así se componen. Velo muestra el ε **redondeado hacia arriba**: se
equivoca por el lado de decir menos protección, no más. Si ninguna columna lleva ε (solo
perturbaste), el panel se llama **«Ruido sin garantía formal · Sin privacidad diferencial»** y no
habla de ε, en pantalla, en el certificado y en la bitácora: la perturbación no es privacidad
diferencial.

**Cuánto se movió cada número.** En el certificado, la tabla «Lo que el archivo perdió» mide la
información en bits, y los bits no ven el ruido: dicen si la columna todavía distingue una fila de
otra, y un número con ruido sigue distinguiéndola aunque haya quedado lejos del suyo. Por eso las
columnas con Laplace o con perturbación traen además su **error medio**: cuánto se alejó, en
promedio, cada valor del original, en las unidades de la columna. Se mide sobre las celdas que eran
un número antes y después. En un archivo de alto volumen esta tabla no se mide, y el certificado
lo dice.

**Lo que ε no cubre**, y el panel lo dice con todas sus letras:

- **Solo un valor de un campo.** No es el ε del archivo, ni de la persona entera: una persona con
  varias columnas con ruido gasta la suma, y esa suma es el «ε por fila».
- **Las demás columnas.** Las que no llevan ruido no están protegidas por ε, sino por lo que les
  hayas aplicado a ellas.
- **Las entregas repetidas.** Cada archivo distinto que entregues con los mismos datos gasta su
  propio ε, y los ε se suman. El mismo archivo con la misma llave y la misma técnica (el mismo ε,
  el mismo rango) da el mismo ruido, así que no se puede promediar corriéndolo dos veces; otro
  archivo, u otro ε u otro rango sobre el mismo archivo, da otro ruido, independiente, y gasta su
  propio ε.
- **El k.** El k se mide aparte, sobre el archivo, y **no se suma con ε**: son dos medidas distintas
  y Velo no inventa un número que las junte.

El ruido destruye información, como enmascarar: no hay bóveda que lo deshaga. El azar se genera con
un muestreo exacto, sin coma flotante (Canonne, Kamath y Steinke, NeurIPS 2020), y sale de la llave
del proyecto y de la huella del archivo. El certificado lleva una sección de privacidad con el ε
efectivo por columna, el ε por fila y el alcance, y la bitácora anota «ε = X por fila» con los
mecanismos (o «N columnas perturbadas, sin garantía formal»). Esto es ruido sobre las celdas de tu
archivo: Velo no produce tablas de conteos con privacidad diferencial.

---

### 5. La bóveda: para poder deshacerlo

Un seudónimo, por sí solo, **no vuelve**: es un HMAC, no un cifrado, y ningún algoritmo lo revierte.
La vuelta la da una tabla que diga qué seudónimo salió de qué valor — y eso es la **bóveda**.

**Cómo se pide.** En el paso 1, debajo de la técnica de cada columna que sea un seudónimo, aparece
la casilla **«Poder deshacerlo con una bóveda»**. Márcala en las columnas que quieras poder
recuperar. Solo los seudónimos la admiten, y no es una limitación de esta versión: enmascarar
(`103***89`), generalizar (`30-39`) y agregar ruido **destruyen** información, así que no hay tabla
que lo deshaga — los dígitos que faltan ya no existen en ninguna parte. La pantalla te nombra las
columnas enmascaradas, generalizadas o quitadas que no van a volver; las que llevan ruido tampoco.
**Con un JSON la casilla funciona igual:** el regreso (la sección 6) también lee JSON.

**Cómo se guarda.** Al transformar aparece el paso 9, «la bóveda». Escribes una frase de paso —**puede y debería
ser distinta de la del proyecto**— y Velo prepara un archivo `.velo` cifrado que te descargas.

Tres cosas sobre ese archivo, y las tres importan:

- **Lleva tus datos originales.** Es el archivo más sensible que sale de Velo: una tabla de
  identificadores sin nada alrededor. Guárdalo donde guardarías el original.
- **Nunca junto al anonimizado.** Si los dos viajan en el mismo correo, quien reciba el correo tiene
  el archivo sin anonimizar. La bóveda es tuya; el anonimizado es lo que entregas.
- **Sin la frase no hay recuperación.** Ni Velo, ni nadie. Es la contrapartida de que nadie más pueda
  abrirla. Apúntala en tu gestor de contraseñas antes de cerrar la pestaña.

Va cifrada con AES-GCM y una llave derivada de tu frase con 600.000 vueltas de PBKDF2. En el disco
no hay un solo valor original legible.

---

### 6. El regreso: recuperar lo que entregaste

Cuando el consultor, la empresa o la IA te devuelvan el archivo trabajado, entra a **`/regreso`** (el
enlace está en ese mismo paso 9, y la ruta funciona sola: no necesitas tener nada cargado).

1. **Carga la bóveda** y escribe su frase. Velo te enseña su huella, cuántas correspondencias trae y
   qué columnas puede devolver.
2. **Carga el archivo devuelto.** Tiene que ser un CSV o un JSON (un arreglo, JSON Lines o NDJSON);
   si te lo devolvieron en Excel, ábrelo y guárdalo como CSV. Puede venir con las filas en otro
   orden, con columnas nuevas del tercero, sin las que él borró y con valores corregidos a mano:
   nada de eso estorba.
3. **Lee el aviso antes de confirmar.** Si la bóveda tiene seudónimos ambiguos, Velo te dice cuántos
   **antes** de que pulses, no después.
4. **Restaura** y llévate el archivo restaurado y su informe.

**Por qué sobrevive a que el tercero trabaje.** La restauración es **por valor, jamás por posición**:
Velo busca cada valor en la correspondencia de su columna. Y reconoce las columnas por su
**contenido**, no por su nombre — si el tercero renombró `cedula` a `ID_PACIENTE`, se reconoce igual.

**Si lo que entregaste fue un JSON.** El regreso lo lee igual que a un CSV —un arreglo de objetos,
JSON Lines o NDJSON— y restaura **ruta por ruta**, por valor. Lo que vuelve conserva la estructura
y el orden de las claves del archivo que te devolvieron, y las columnas que en tu original eran
todas números vuelven **sin comillas**, como números. Si el tercero no tocó nada, el JSON
restaurado es **tu original, byte por byte**, salvo lo que nunca tuvo vuelta (lo enmascarado,
generalizado, quitado o con ruido, y los seudónimos que no marcaste como reversibles). Una
salvedad: Velo escribe compacto, un registro por línea, así que ese «byte por byte» vale si tu
original ya estaba escrito así; las sangrías y los espacios que tuviera no se conservaron en la
ida y no vuelven. El archivo se llama `velo-restaurado-<8 caracteres>.json` (`.jsonl` si es JSON
Lines o NDJSON); con un CSV, `velo-restaurado-<8 caracteres>.csv`. Los ocho caracteres son el
principio del SHA-256 del archivo que te devolvieron.

**Las cuatro cosas que le pueden pasar a una celda**, y Velo las cuenta todas:

|                          | Qué pasó                                               | Qué sale en el archivo     |
| ------------------------ | ------------------------------------------------------ | -------------------------- |
| **Restaurada**           | su seudónimo estaba en la bóveda con un único original | el valor original          |
| **Ambigua**              | su seudónimo corresponde a **dos** originales          | **el seudónimo, intacto**  |
| **La cambió el tercero** | el valor no está en la bóveda                          | tal como él la dejó        |
| **Fuera de alcance**     | su columna no estaba en la bóveda                      | la columna entera, intacta |

> **Sobre las ambiguas.** Un seudónimo con formato —cédula, NIT, un PESEL o un Steuer-IdNr— tiene que caber en muchos menos
> valores que un hash completo, así que a veces dos valores distintos reciben el mismo. Velo **no
> elige por ti**: deja el seudónimo puesto, te dice cuántas celdas son y las declara en el informe.
> Escribir uno de los dos candidatos te devolvería el dato de otra persona sin que nada lo indicara.

**El informe del regreso** dice qué volvió y qué no, con las salvedades **antes** del porcentaje —
igual que el certificado del tratamiento. No lleva ninguna celda: solo nombres de columna, cifras y
huellas. El archivo restaurado sí lleva tus datos: trátalo como el original, porque lo es.

---

### 7. La bitácora: acordarte dentro de seis meses

El certificado prueba **un** tratamiento ante quien lo recibe. La bitácora contesta otra pregunta, y
es tuya para ti: **«¿qué he hecho yo con mis archivos?»** — meses después, cuando alguien te
pregunte qué entregaste, cuándo y con qué criterio.

**Cómo se anota.** Al final del taller, después de generar el archivo, aparece **«Anotar en mi
bitácora»**. Te lleva a la bitácora con la anotación lista: eliges una frase de paso y Velo te
entrega el archivo cifrado. Si ya tenías una, la abres primero ahí mismo y la anotación **se añade
al final**, sin tocar las anteriores.

**Qué queda anotado:** el nombre del archivo, la fecha, las técnicas que aplicaste —**sin decir a
qué columnas**—, el hash de la política, las dos huellas, y la proporción de registros únicos antes
y después. Si usaste ruido, la anotación guarda también «ε = X por fila» con sus mecanismos (la
suma de los ε de las columnas con ruido, como en el panel de la sección 4) o, si solo perturbaste,
cuántas columnas quedaron «sin garantía formal».

**La limpieza de un PDF o una imagen también se anota.** Después de limpiar aparece el mismo botón,
**«Anotar en mi bitácora»**, y la entrada queda en el mismo archivo `.velolog`, con las demás. Lleva
el nombre del archivo, la fecha, el formato, cuántos campos con nombre tenía, cuántos bloques se
quitaron, cuántas versiones anteriores (en un PDF) y las dos huellas. **No lleva cifras de riesgo
—no hay filas que medir— ni ningún valor de los metadatos**, y la entrada recuerda que el contenido
no se tocó.

> **Las dos proporciones, y no la resta entre ellas.** Es deliberado. «Bajó del 30 % al 2 %» es
> cierta y puede engañar, y una bitácora se lee meses después sin ninguna pantalla al lado que la
> matice. Si aquella medición llevaba salvedades que la descalificaban, la entrada también lo dice.

**Va cifrada, y la razón importa:** un nombre de archivo cuenta de qué va su contenido antes de que
nadie lo abra. `pacientes-oncologia-2026.csv` ya dice demasiado. Una bitácora es una lista de esos
nombres con sus fechas — el resumen de a qué te dedicas y sobre quién trabajas — así que en claro no
puede estar.

**Es un archivo aparte de la bóveda,** con **su propia frase de paso**. Termina en `.velolog` y no
en `.velo`. Tres razones: existe aunque el tratamiento no tenga columnas reversibles; la bóveda es
por trabajo y la bitácora crece durante meses; y mezclarlas haría que perder una fuera perder las
dos.

> **Son tres secretos con tres alcances distintos** —la frase del proyecto, la de la bóveda y la de
> la bitácora— y **no conviene que sean la misma**: reusarlas convierte la filtración de una en la
> filtración de todo. Velo no las comparte ni las rellena entre sí.
>
> Y como con la bóveda: **perder la frase de la bitácora es perder la bitácora.** No hay
> recuperación, y decirlo antes es parte del trato.

**Cuando abras la que ya tienes**, la verás de la anotación más reciente a la más antigua; cada una
se despliega con un clic. Si te equivocas de archivo y abres la bóveda, Velo te lo dice —«esa es la
bóveda»— en vez de mandarte a probar frases.

Medido: **2.000 anotaciones se abren y se pintan sin una sola tarea larga** en el hilo principal.

---

### 8. PDF e imágenes: limpiar lo que el archivo dice de sí mismo

Una foto o un PDF dicen cosas de sí mismos que nadie ve en pantalla: la cámara y su número de serie,
la posición GPS, el autor, el programa con que se hizo, las fechas, un identificador que ata la copia
a su original, la miniatura de cómo se veía la foto antes de recortarla, las versiones anteriores de
un documento. Eso son los **metadatos**. Velo los lee, te enseña qué encontró y te entrega una copia
sin ellos. Todo ocurre dentro de la pestaña, como con una tabla.

> **El límite, dicho primero.** Velo limpia lo que el archivo dice de sí mismo; **no toca el texto
> de las páginas ni lo que se ve en la imagen.** Un nombre escrito en un párrafo, una cara, un
> letrero o una placa de fondo siguen ahí exactamente como estaban. Si el contenido en sí es
> sensible, edítalo antes —tapa el nombre, recorta la imagen— y limpia después esa copia. Velo dice
> esto arriba del diagnóstico, otra vez en el resultado y en el certificado, con el mismo peso que
> lo que sí hace.

**Cómo se usa**

1. **Suelta el archivo** en la pantalla principal, como cualquier otro. Velo lo reconoce por su
   contenido: PDF, JPEG, PNG, WebP, HEIC, AVIF o el video de una Live Photo (MOV). Si la extensión miente (un `.jpg` que es un PNG), lo trata por
   lo que es y lo avisa.
2. **Lee el diagnóstico de metadatos.** Tiene cuatro partes:
   - **«Qué limpia Velo y qué no toca»**: el límite de arriba, con lo que cambia y lo que no según
     sea PDF o imagen.
   - **«Qué dice el archivo de sí mismo»**: los campos con nombre, uno por fila. Cada uno dice
     **dónde vive** (EXIF —datos de la cámara—, GPS, XMP, IPTC, texto de PNG, un comentario, la
     información del PDF o una versión anterior del PDF), **qué revela** (autoría, ubicación,
     dispositivo, programa, fecha, identificador, descripción) y una **muestra enmascarada**: Velo
     no muestra más de la mitad de un valor, y uno corto sale como `***`. El valor completo no sale
     de la pestaña. La última columna dice **qué reconoce Velo** con los mismos validadores de la
     sección 2: si un campo es una cédula, un correo o unas coordenadas, y con la misma cautela
     (una cédula es «por su forma», no «confirmada»). Cuando lo reconocido está **dentro** del
     valor y no es el valor entero —el autor `Ana Pérez · CC 1032456789`—, la fila dice
     «Contiene: cédula»: aquí dentro hay una, no esto es una.
   - **«Qué se quita y qué se conserva»**: los bloques del archivo, con su tamaño. Más abajo, cómo
     se decide.
   - **«Lo que hay que saber antes de limpiar»**: los avisos (más abajo). En un PDF, además,
     **«La historia del PDF»**: cuántas versiones guarda dentro, cuántos objetos reemplazó una
     edición y si trae un identificador de documento.
3. **Pulsa «Limpiar este archivo»** y, en la pantalla siguiente, **«Limpiar»**. No hay opciones que
   elegir: se quita todo lo que no hace falta para ver el archivo, y el diagnóstico ya dijo qué era.
   Velo reescribe el archivo y **lo vuelve a leer** para comprobarlo.
4. **Lee el resultado**, «Esto es lo que Velo quitó»: cuántos campos con nombre tenía, cuántos
   bloques se quitaron, cuántas versiones anteriores (en un PDF), el tamaño antes y después, la
   lista de lo que se quitó y de lo que se conservó, y —otra vez— lo que no cambió. En un PDF
   limpio, el identificador nuevo del documento.
5. **Llévate la copia limpia** con **Guardar**. Se llama `velo-limpio-<8 caracteres>.pdf` (o
   `.jpg`, `.png`, `.webp`, `.heic`, `.avif`, `.mov`, según su contenido). Los ocho caracteres son el principio del SHA-256
   del archivo **que entró**; no repite el nombre del original, que ya cuenta de qué trata el
   archivo. **El original no se toca.**
6. **Llévate el certificado de la limpieza** (`velo-limpieza-<8 caracteres>.html`, `velo-cleaning-….html` en
   inglés). Como todo documento de Velo, puedes verlo antes de descargarlo. Empieza por el límite
   (qué se limpió y qué no) y lleva las **dos huellas SHA-256** —la del original y la de la copia
   limpia—, lo que se quitó y se conservó, los campos que tenía el archivo con sus valores
   **enmascarados**, la comprobación posterior y los avisos. No lleva ningún valor completo de los
   metadatos ni nada del contenido. Quien lo reciba verifica la copia como en la sección 3:

   ```bash
   # macOS
   shasum -a 256 velo-limpio-3f9a1c2e.jpg
   ```

   Si la cadena que sale es la huella de la copia limpia, el archivo es exactamente el que
   produjo esa limpieza. Si no coincide, **el certificado no habla de esa copia**: puede ser
   inocente —un programa la abrió y la volvió a guardar, y al guardar pudo escribir metadatos
   nuevos— o no serlo.

7. **Anótala en la bitácora** si quieres que quede constancia ([sección 7](#7-la-bitácora-acordarte-dentro-de-seis-meses)).

**Cómo decide Velo qué quitar.** La limpieza es por **lista blanca**, no por lista negra: se
conserva lo mínimo para ver la imagen o abrir el documento, y **todo lo demás se quita, aunque
Velo no lo reconozca**. La lista de campos que ves en el diagnóstico es lo que Velo sabe _nombrar_;
la limpieza no depende de ella. Por eso «Velo no encontró campos con nombre» no es lo mismo que
«este archivo no tiene metadatos»: lo que no sabe nombrar se quita igual, y el diagnóstico lo dice.

- **En un JPEG, un PNG o un WebP** no se toca ningún píxel ni se vuelve a codificar: no se pierde
  calidad. Se quitan el EXIF, el GPS, el XMP, el IPTC, los comentarios, el texto de un PNG y su fecha de
  modificación, las miniaturas, las notas privadas del fabricante de la cámara, los datos de
  procedencia del contenido (C2PA), los bloques que Velo no reconoce y los **bytes que sobran tras
  el final de la imagen** —algunos programas dejan ahí restos de lo que recortaste—. Se conserva
  lo que hace falta para verla, el **perfil de color** y la **orientación**: si la foto no está en
  posición normal, Velo escribe un bloque EXIF mínimo con solo ese dato, para que la copia limpia
  no se abra girada. Si el archivo
  traía imágenes adicionales dentro (por ejemplo, el mapa de ganancia de una foto HDR), se
  quitan, y el aviso lo dice.
- **En una foto HEIC o AVIF** (la del iPhone, o la de un teléfono o editor que guarda en AVIF) el archivo también se **reescribe**, porque quitar un bloque
  cambia dónde queda todo lo demás, pero los datos de la imagen se copian tal cual: Velo no
  decodifica la foto ni la convierte, y la copia limpia sigue siendo un HEIC —o un AVIF—. Se quitan el EXIF
  (ubicación, cámara, fechas, autor), el XMP, las descripciones y etiquetas que alguien escribió
  sobre la foto, los nombres internos de sus piezas, los bloques que Velo no reconoce, los datos sin
  uso que una edición pudo dejar dentro y los **bytes que sobran al final**. Se conservan la
  imagen, el **perfil de color**, la **orientación** (en un HEIC va aparte del EXIF, así que no
  hace falta escribir uno), la miniatura y las imágenes auxiliares —un mapa de profundidad, un mapa
  de realce HDR—, que son píxeles. De ahí un aviso propio: los datos que describen el realce HDR
  se quitan con el XMP, y en una pantalla HDR la foto puede verse con menos rango.
- **En una secuencia HEIC o AVIF, y en el video de una Live Photo (`.mov`)** el archivo **no se
  reescribe: se limpia en su lugar.** Estos archivos traen un índice de tiempos y posiciones que
  apunta a cada cuadro del video, y moverlo todo para quitar un bloque arriesgaría romperlos. Velo
  deja **cada byte de imagen, de video y de audio exactamente donde estaba**, y borra solo los
  bloques de metadatos: los reemplaza por un bloque vacío **del mismo tamaño**. Se quitan la
  ubicación (también la que viaja como una pista de metadatos con una posición por cuadro, cuyas
  muestras quedan en ceros), la marca y el modelo del equipo, el programa, los títulos y descripciones, el
  EXIF y el XMP de la secuencia, el código de tiempo de una cámara (la hora del día en que empezó
  a grabar, que pasa a cero, y el rótulo de su carrete), y las fechas de creación y modificación del
  contenedor, que pasan a cero. La copia limpia se reproduce igual: se comprobó decodificando antes
  y después con las herramientas del sistema y comparando cuadro por cuadro, y el resultado es el
  mismo.
- **La Live Photo, dicha sin adornos.** Una Live Photo son **dos archivos**: la foto y un video corto
  (`.mov`). Cada uno se limpia por separado, y **el número que los empareja se conserva solo en el
  video**: es un identificador al azar, no un dato tuyo. En la foto ese número viaja dentro de la
  nota privada del fabricante, que se quita con el resto del EXIF. Se comprobó con una foto sintética que trae esa nota: en la copia limpia no queda ni el número ni la nota. **Consecuencia: la foto y el
  video limpios ya no aparecen juntos como una sola Live Photo en Fotos.** Velo lo avisa en el
  diagnóstico y en el certificado. Si necesitas que sigan emparejados, no los limpies con Velo.
- **En un PDF** el archivo se **reescribe entero**, y las páginas y su contenido se copian tal cual.
  Se quitan el diccionario de información (autor, programa, fechas), el XMP, los datos de la
  aplicación que lo creó, la fecha de la última edición de cada página, las miniaturas de página y
  los objetos huérfanos. Y se quitan las
  **versiones anteriores**: cada vez que un programa «guarda» sumando cambios al final, la versión
  anterior se queda dentro del archivo aunque no se vea —un texto reemplazado, un autor anterior,
  una página borrada—. La copia limpia guarda **una sola versión**. El identificador del documento
  (`/ID`), que ata una copia a su original y sobrevive a cada edición, se cambia por uno **nuevo**,
  calculado solo a partir del contenido limpio: el mismo archivo da siempre el mismo.

**Los avisos: lo que Velo no limpia, o limpia con un costo.** Salen en el diagnóstico antes de que
pulses nada, y se repiten en el certificado:

| Aviso                                 | Qué significa                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Anotaciones con autor (PDF)           | Velo las enseña pero **no las limpia**: el nombre de quien comentó sigue dentro de la copia limpia.                              |
| Archivos adjuntos (PDF)               | **No los limpia**: cada uno puede llevar sus propios metadatos.                                                                  |
| Campos de formulario (PDF)            | Sus nombres y valores **quedan como están**: lo que alguien escribió en ellos sigue en la copia limpia.                          |
| JavaScript incrustado (PDF)           | **No lo toca**: puede contener datos o direcciones, y sigue en la copia limpia.                                                  |
| PDF firmado                           | Reescribirlo **invalida la firma**: la copia limpia ya no la conserva.                                                           |
| Versiones en flujos comprimidos (PDF) | Se quitan, pero Velo no puede listar qué decían.                                                                                 |
| Extensión distinta del contenido      | El archivo se trató por lo que es, no por lo que dice su nombre.                                                                 |
| Orientación conservada (imagen)       | Un bloque EXIF mínimo con solo ese dato, para que la foto no se gire.                                                            |
| Imágenes adicionales (imagen)         | Había más imágenes dentro del archivo; se quitan con lo demás.                                                                   |
| Imágenes auxiliares (HEIC)            | Se conservan (son píxeles), pero se quitan los datos que las describen: en una pantalla HDR la foto puede verse con menos rango. |
| Identificador de Live Photo (video)   | El video conserva el número que lo empareja con su foto (un UUID al azar); la foto limpia ya no lo lleva y Fotos no los junta.   |
| Texto comprimido (imagen)             | Se quita sin leerlo, así que no aparece en la tabla de campos.                                                                   |

**Lo que Velo se niega a hacer.**

- **Un PDF protegido con contraseña no se abre.** Velo no pide contraseñas, y un PDF cifrado no se
  puede leer ni reescribir sin ella. El mensaje dice qué hacer: quita la protección con el programa
  que lo creó —abriéndolo y guardando una copia sin contraseña— y suelta esa copia.
- **Una foto HEIC o AVIF con piezas que Velo no sabe reescribir sin romperla no se toca.** Es el
  caso de una foto con partes protegidas, con datos guardados fuera del archivo o con una propiedad
  desconocida que el archivo declara imprescindible. (Las secuencias y los videos de una Live Photo
  ya no están aquí: se limpian en su lugar.)
  Velo dice «Esa foto usa una parte del formato que Velo no reescribe» y no entrega nada: antes que
  una copia rota, ninguna. Exporta la foto como imagen fija —en HEIC, AVIF o JPEG— desde el programa de
  fotos y suelta esa copia.
- **Si la comprobación encuentra algo, no entrega el archivo.** Después de limpiar, el mismo lector
  que hizo el diagnóstico corre sobre la copia. Si encuentra **un solo** campo con nombre, o (en un
  PDF) más de una versión, Velo dice «No se entregó ningún archivo»: una limpieza que no se
  comprueba es una promesa, y Velo no entrega promesas. No uses un archivo que Velo no pudo dejar
  limpio: genera una copia nueva desde su origen —imprime el documento a PDF o exporta la imagen
  otra vez— y límpiala. Lo que sí se entrega lleva la cifra de la comprobación («**0 campos con
  nombre**») en el resultado y en el certificado.
- Un PDF o una imagen dañados, cortados o con una estructura que Velo no sabe leer se rechazan sin
  repetir nada de lo que hay dentro, y el mensaje dice qué hacer.

**Una limitación de la comprobación, dicha:** la hace el **mismo lector** que hizo el diagnóstico.
Es una prueba de que lo que Velo sabe leer ya no está, no un segundo par de ojos. Si quieres una
segunda opinión, pásale a la copia limpia otra herramienta de metadatos.

---

### 9. Archivos enormes: el modo de alto volumen

Una tabla de millones de filas no cabe entera en la memoria de una pestaña. Cuando un CSV pasa de
**20.000.000 de celdas** —filas × columnas—, Velo no intenta cargarlo: **lo lee por pasadas**. Una
para el diagnóstico, otra para medir lo que va a salir, otra para escribirlo, y en cada una vuelve a
calcular la huella del archivo para comprobar que sigue siendo el mismo. Es el mismo motor de
siempre; lo que cambia es de dónde saca las cuentas. Y todo ocurre, como siempre, dentro de tu
navegador.

El tope no depende de tu equipo ni de la hora: **el mismo archivo toma el mismo camino** en
cualquier computador.

**Qué verás.** Mientras lee, la etapa dice «Modo alto volumen: el archivo se lee por pasadas». Al
terminar, el diagnóstico abre con un panel, **«Este archivo se leyó por pasadas»**, antes de
cualquier cifra: _«Pasa de 20.000.000 celdas, lo que Velo guarda en memoria, así que lo leyó por
pasadas, sin tenerlo entero en la pestaña. El riesgo de abajo es exacto: sale de todas las filas.»_ Y
sigue con lo que cambia.

**Lo que no cambia**

- **El riesgo sigue siendo exacto.** Se cuenta sobre todas las filas, no sobre una muestra.
- **El archivo que sale es el mismo, byte por byte,** que saldría si cupiera en memoria (mismo
  archivo, misma política, misma llave, mismo idioma). Una prueba automática los compara en cada
  cambio del programa.
- **La bóveda y el regreso funcionan igual** ([sección 5](#5-la-bóveda-para-poder-deshacerlo) y
  [sección 6](#6-el-regreso-recuperar-lo-que-entregaste)). Si el archivo que te devuelven también
  pasa de 20.000.000 de celdas, se restaura por pasadas.
- **Nada sale de tu computador.**

**Lo que cambia, y Velo lo dice**

- **La clasificación mira las primeras 5.000 filas.** En un archivo más chico, Velo clasifica sobre
  una muestra repartida por todo el archivo; aquí mira el principio, en orden. Por eso lo que
  encuentre puede diferir de lo que daría el mismo archivo si cupiera en memoria.
- **Una columna con demasiados valores distintos dice «más de N valores distintos»** en la tabla,
  en vez de una cifra que no sería cierta.
- **El consejero de cruces combina solo los cuasi-identificadores.** Las columnas que habría mirado
  quedan listadas con su motivo.
- **No se mide lo que el archivo perdió** (la utilidad): medirlo exige comparar las dos tablas
  enteras. El certificado lo dice con todas sus letras —«En este archivo no se midió»— y no estima
  la cifra.
- **Las colisiones de seudónimo se cuentan solo donde el diccionario de la columna cabe.** Es el
  aviso del balance de la [sección 4](#4-transforma-el-taller): dos valores distintos pueden recibir
  el mismo seudónimo. En una columna que se trata valor por valor (más de 1.048.576 valores
  distintos) Velo no las cuenta y el balance no avisa de ellas: que no diga nada no significa que no
  haya. Si ocurre, el regreso las declara como ambiguas.

**Los topes, y lo que no cabe se dice.** Cada tope es una constante del programa, no una medida de
tu equipo. Cuando algo no cabe, Velo lo dice y se detiene o lo deja intacto; **jamás lo estima**:

| Qué                                                     | Tope                           | Qué pasa si se pasa                                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valores distintos en una columna                        | 1.048.576 (2²⁰)                | La columna se trata valor por valor, con la misma salida, y el diagnóstico dice «más de N valores distintos». Si era reversible, no hay bóveda para ella: Velo se detiene y pide quitar la casilla o dividir el archivo.      |
| Valores distintos en todas las columnas juntas          | 4.194.304 (2²²)                | Lo mismo.                                                                                                                                                                                                                     |
| Filas del reparto (Mondrian o la generalización óptima) | 16.000.000                     | Velo se detiene: generaliza esas columnas con una técnica por columna, o divide el archivo.                                                                                                                                   |
| Combinaciones distintas de cuasi-identificadores        | 16.777.215 (2²⁴ − 1)           | Velo dice «Demasiadas combinaciones para medir el riesgo exacto» y no estima: generaliza antes alguna de esas columnas (la fecha a año, el municipio a departamento) y suéltalo otra vez.                                     |
| Valores distintos de una columna del archivo devuelto   | 1.048.576 (2²⁰), como a la ida | Si la columna no trae nada de la bóveda, sale intacta y el informe dice «de al menos N valores». Si trae seudónimos de la bóveda, el regreso se detiene: divide el archivo en partes y restaura cada una con la misma bóveda. |

La respuesta aleatorizada, que ya no se aplica con más de 64 valores distintos, dice «más de N» en
vez de una cifra falsa, y la columna sale intacta.

**Dónde se guarda.** Aquí hay una diferencia entre navegadores, y la pantalla te dice cuál te toca:

- **En Chrome, Edge y similares**, el botón **«Elegir dónde guardarlo»** abre el selector de
  archivos del sistema. Velo escribe el archivo **por trozos, directo en el que elijas**, sin
  armarlo entero en la memoria de la pestaña, y al terminar dice «Guardado en tu equipo: …». Es una
  descarga por tu acción explícita: los bytes van a tu disco y a ningún otro lado. Si algo falla a
  la mitad, no queda un archivo a medias.
- **En Firefox y Safari** no hay selector de destino. Velo lo dice —«este navegador no deja elegir
  un archivo de destino»— y, al pulsar **«Preparar el archivo»**, entrega el CSV **por la descarga de
  tu navegador, por trozos y sin armarlo entero en la memoria de la pestaña**: el archivo se va
  guardando en tu carpeta de descargas mientras Velo lo escribe, y la pantalla dice «Enviado a la
  descarga de tu navegador: …». Por debajo hay un _service worker_ propio de Velo, que solo atiende
  la dirección de esa descarga: **no guarda ningún dato, no pide nada a la red y no ve más
  que lo que Velo le pasa**, que es el archivo ya anonimizado, los mismos bytes que se guardarían de
  cualquier otra forma. Lo único que queda en tu navegador es el registro del propio _service
  worker_ (un archivo de Velo, sin datos tuyos), que puedes quitar desde la configuración del
  navegador. La pantalla no puede saber cuándo termina de escribir el navegador:
  **revisa que la descarga haya terminado antes de cerrar la pestaña.** Si cancelas la descarga a
  la mitad, Velo lo nota, deja de escribir y dice «No se pudo escribir el archivo» (y nombra que
  pudiste haberla cancelado); no ofrece un archivo a medias y puedes volver a pulsar «Preparar el
  archivo», que esta vez sale entero. Se probó con un archivo de 100.000 filas, cancelando a la mitad:
  en Chromium en cada cambio (prueba automática; además, 10 corridas seguidas antes de cerrar el
  sprint, las 10 bien), y en Firefox y en el WebKit de Playwright con una sonda a mano (en WebKit,
  6 corridas seguidas con la sonda final, y en las 6 apareció la alerta; una corrida anterior, con
  una versión previa de la sonda, no llegó a comprobarla y no se investigó).
  En Safari de verdad no se probó.
- **Si tu navegador no permite ese service worker** (una ventana privada que lo bloquea, una
  política de empresa, un navegador muy antiguo), Velo cae al **respaldo por partes**: arma el CSV
  en la memoria y, si pesa más de 256 MB, lo entrega **cortado en partes** —**«Guardar la parte 1
  de 5»**, y así—, cortadas entre filas y **sin repetir el encabezado**. Pegadas en orden, una detrás
  de otra, dan **exactamente** el archivo completo, el mismo que certifica la huella SHA-256. Junto a
  las partes hay un **manifiesto** (`….json`) que lista cada una con su tamaño y su SHA-256, y la
  huella del todo, para comprobar que las juntaste bien:

  ```bash
  # macOS o Linux: pegar las partes en orden y comprobar la huella del todo
  cat velo-anonimizado-3f9a1c2e-parte-*-de-5.csv > velo-anonimizado-3f9a1c2e.csv
  shasum -a 256 velo-anonimizado-3f9a1c2e.csv
  ```

  El respaldo por partes es **solo para CSV**: un JSON o JSON Lines de alto volumen sin selector ni
  _service worker_ sale en un solo archivo armado en memoria, y si es muy grande puede no caber;
  entonces usa Chrome o Edge.

- **El archivo restaurado del regreso siempre va por el camino de la memoria,** también en Chrome y
  Edge: se arma en la memoria y se baja, sin streaming ni partes.

**Un defecto que se corrigió.** Un CSV de más de 10 MB con una letra con tilde justo en el borde de
uno de los trozos en que se lee salía con «�» en lugar de la letra. Pasaba también en el camino en
memoria, no solo en este modo, y ya no pasa en ninguno. Tu original nunca se tocó; el defecto
estaba en lo que Velo escribía.

**Lo medido: una referencia, no una promesa.** Un CSV de **5.000.000 de filas × 24 columnas
(1,36 GB)**, con la política Habeas Data y una llave, en Chromium con la versión de producción y en
un Mac del autor. Guardado por el camino de la memoria, sin el selector de destino, y de regreso con
su bóveda:

| Paso                          | Tiempo | Pico de memoria de la pestaña |
| ----------------------------- | ------ | ----------------------------- |
| Diagnóstico                   | 83 s   | 3,2 GB                        |
| Transformar y medir           | 280 s  | 4,2 GB                        |
| Escribir                      | 261 s  | 4,5 GB                        |
| Bóveda y descargas            | 3 s    | 2,0 GB                        |
| Regreso: abrir la bóveda      | 1 s    | 0,1 GB                        |
| Regreso: leer el devuelto     | 71 s   | 2,5 GB                        |
| Regreso: restaurar y escribir | 132 s  | 1,3 GB                        |

Son unos 10 minutos de ida y unos 3,4 de regreso, y **hacen falta varios GB de memoria libre**:
cierra otras pestañas y programas pesados antes. El pico es el de todo el proceso de la pestaña,
medido cada medio segundo; cuenta memoria que el navegador aún no había liberado, así que es un
techo y no lo que se usa de verdad. El trabajo ocurre en un hilo aparte, como siempre. El regreso se
comprobó con ese mismo archivo: la columna restaurada volvió al valor original y las otras 23
columnas quedaron iguales a las del archivo anonimizado. Entre corridas iguales el pico cambia
alrededor de ±0,6 GB (la primera corrida de ese archivo dio 109 s, 283 s, 267 s y 4,9 GB).

**El pico no se bajó, y es un límite conocido de esta versión, no un descuido.** Casi 1,1 GB son los
diccionarios exactos de las columnas casi únicas; el motor de JavaScript deja la basura sin recoger
hasta unas dos veces eso, y el navegador suma lo suyo. Bajar el pico a 2,5 GB obligaría a cambiar el
riesgo exacto por uno estimado, y Velo no cambia una cifra exacta por una estimada por su cuenta
(ver «Lo que Velo NO afirma»). Si eso se decide algún día, se dirá aquí.

**Cuánta memoria pide según el tamaño del archivo.** La misma política, el mismo Mac, una corrida
por celda; el pico es el del proceso más pesado del navegador, en el paso que más pidió (ida y
regreso). Hasta 20.000.000 de celdas el archivo se arma en memoria; de ahí en adelante va por
pasadas.

| Filas (× 24 columnas)   | Chromium | Firefox    | WebKit (motor de Safari) |
| ----------------------- | -------- | ---------- | ------------------------ |
| 100.000                 | 1,0 GB   | 0,8 GB     | 1,3 GB                   |
| 500.000                 | 3,1 GB   | 1,6 GB     | 3,4 GB                   |
| 1.000.000 (por pasadas) | 3,2 GB   | 2,4–2,6 GB | 3,9–4,8 GB               |
| 5.000.000 (por pasadas) | 4,5 GB   | no medido  | no medido                |

Lee la tabla como un orden de magnitud: con una corrida por celda, una diferencia de medio GB entre
dos celdas no es una conclusión. Firefox pide bastante menos que los otros dos a estos tamaños; a
5.000.000 de filas solo se midió Chromium.

**Velo local en esos tamaños.** El mismo archivo y la misma política, por la consola
([sección 11](#11-velo-en-tu-equipo-la-consola-las-bases-de-datos-y-la-api)), en el mismo Mac y
midiendo la memoria residente del proceso: con 1.000.000 de filas, 146,5 s y 3,1 GB; con
5.000.000 de filas, 1.207 s (unos 20 minutos) y 3,9 GB. **Velo local no es más
rápido que la pestaña** (a 5.000.000 de filas tarda el doble: la ida sola, 10 minutos en Chromium) **y
usa casi lo mismo de memoria** (algo menos a 5.000.000: 3,9 contra 4,5 GB). Lo que cambia es otra
cosa: no depende de una pestaña abierta que el navegador pueda cerrar si se queda sin memoria, se
deja corriendo en una terminal sin mirarla, se repite con un comando, y en WebKit a 1.000.000 de
filas le gana al navegador (3,1 GB contra 3,9–4,8 GB). Una regla práctica: hasta unas 500.000 filas
la pestaña basta (con otras pestañas cerradas, porque ahí ya pide 3 GB en Chromium y WebKit); si tu
archivo pasa de eso, o tu equipo tiene poca memoria libre, o vas a repetirlo, usa Velo local.

**En Firefox y Safari (sin selector de destino).** Un CSV de **1.000.000 de filas × 24 columnas**
(24.000.000 de celdas, ya en alto volumen), la misma política, en el Firefox y el WebKit de
Playwright (el motor de Safari, no Safari mismo) y en el mismo Mac. Comparan la descarga por trozos
con el camino anterior, el de armar el archivo en la memoria. Pico de memoria de todos los procesos
del navegador, por pasada (una corrida por celda):

| Navegador | Cómo sale el archivo   | Diagnóstico | Transformar y medir | Escribir |
| --------- | ---------------------- | ----------- | ------------------- | -------- |
| Firefox   | por trozos (descarga)  | 1,8 GB      | 2,3 GB              | 2,4 GB   |
| Firefox   | armado en la memoria   | 1,8 GB      | 2,5 GB              | 2,6 GB   |
| WebKit    | por trozos, sin latido | 4,0 GB      | 4,0 GB              | 3,9 GB   |
| WebKit    | por trozos, con latido | 3,0 GB      | 4,0 GB              | 4,5 GB   |
| WebKit    | armado en la memoria   | 4,6 GB      | 4,8 GB              | 3,8 GB   |

**Lo honesto de esa tabla: a 1.000.000 de filas, la descarga por trozos no baja el pico de memoria
de forma que se pueda distinguir del ruido.** Las dos primeras pasadas hacen lo mismo con o sin ella
y aun así cambian entre corridas (en Firefox, el diagnóstico midió entre 1,8 y 2,2 GB en tres
corridas iguales; en WebKit, entre 3,0 y 4,6 GB); la diferencia al escribir (2,4 contra 2,6 GB en
Firefox) cabe en esa variación, y en WebKit la escritura por trozos salió _más_ alta las dos veces
(3,9 y 4,5 contra 3,8 GB). Con una sola corrida por celda no se afirma una mejora. Lo que sí cambia, y es el motivo de
este camino, es que el archivo de salida **ya no tiene que caber en la memoria de la pestaña**
para poder guardarse: eso se probó con el CSV de 1.000.000 de filas y con uno ancho de 421 MB en
Firefox, y los bytes que bajan son los del certificado (Chromium; en Firefox y Safari de verdad,
ver la guía). La medida con el latido al _service worker_ se repitió en Firefox y en WebKit (la fila «con latido»
es la segunda corrida de WebKit; la primera fue antes de que existiera). Safari de verdad no se midió: habilitar su automatización pide la contraseña de
administrador del Mac, y queda como parada del ensayo general.

**JSON y JSON Lines.** Un JSON con más de 20.000.000 de celdas (registros × rutas distintas)
también se lee por pasadas. Una primera pasada descubre las rutas —las columnas— y la estructura sin
guardar ningún valor; las demás recorren los registros de uno en uno. Lo que sale es el **mismo
archivo, byte por byte,** que saldría si cupiera en memoria: un arreglo sale como arreglo y JSON
Lines como JSON Lines, con la misma reescritura fiel de [la sección 1](#si-tu-archivo-es-un-json)
(claves en su orden, números exactos, compacto). La bóveda y el regreso funcionan igual, y un JSON
devuelto que no cabe en memoria se restaura por pasadas, también como JSON. Pesa mucho más que un
CSV porque cada celda lleva su clave: 21.000.000 de celdas son unos 316 MB. Lo que cambia respecto
a la memoria (la clasificación mira las primeras 5.000 filas, la utilidad no se mide) vale igual
aquí. Los demás topes de un JSON siguen deteniéndolo, y lo dice; y las listas siguen sin tratarse.

**Lo que sigue con su tope**

- **Excel conserva su tope de 150 MB:** el lector de Excel del navegador no puede leer por partes.
- **El archivo restaurado no se escribe directo a disco,** como se explicó arriba.

---

### 10. La política RGPD

Es la **tercera política de fábrica**, junto a Habeas Data y HIPAA. En el taller se elige con el
botón **«RGPD · GDPR (UE)»**. Se apoya en el Reglamento (UE) 2016/679: el artículo 4 (qué es un
dato personal y qué es seudonimizar), el 9 (categorías especiales), el 10 (condenas e infracciones
penales) y el considerando 26.

> **La idea central: Velo seudonimiza, no anonimiza.** El artículo 4.5 llama _seudonimización_ a
> tratar los datos de modo que no puedan atribuirse a una persona sin información adicional, que se
> guarda aparte. Aquí esa información adicional es tu llave y tu bóveda. Y el considerando 26 dice
> que un dato seudonimizado que podría atribuirse a una persona con esa información adicional debe
> considerarse información sobre una persona identificable. Por eso **el archivo que sale sigue
> siendo dato personal para quien tenga la llave y la bóveda**, y por eso el certificado dice
> «Seudonimizado», nunca «anónimo».

Si para otra persona —una que no tiene ni la llave ni la bóveda— ese archivo deja de ser un dato
personal, depende de los medios razonablemente utilizables para identificar a alguien y del
contexto (considerando 26). Ese análisis lo hace quien trata los datos; un programa que solo ve una
tabla no puede hacerlo, y Velo no lo hace.

**Qué hace con cada cosa**

| Qué hay en la columna                                                                           | Qué hace Velo                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identificadores directos** (art. 4.1): nombres, correo, tarjeta de pago, documentos           | Un **seudónimo** con tu llave, **reversible con la bóveda**. Si Velo reconoce el documento, el seudónimo lleva el formato de su país; si no, es un seudónimo hexadecimal. |
| **Categorías especiales** (art. 9) y **condenas e infracciones penales** (art. 10)              | Se **suprimen**: la columna no sale. Una política general no puede saber si hay una base lícita (art. 9.2) para tratarlas.                                                |
| **Cuasi-identificadores**: fecha de nacimiento, código postal, sexo, nacionalidad, dirección IP | Se **generalizan hasta k = 5**. Ese 5 es una elección de Velo, no del RGPD —el reglamento no fija ningún k—, y se puede cambiar.                                          |
| Otras fechas, que por sí solas no identifican                                                   | Se recortan al **mes**.                                                                                                                                                   |
| Lo que no es personal                                                                           | Se deja como está.                                                                                                                                                        |

Con esta política la reversibilidad la marca la política, no tú: todos los identificadores directos
salen reversibles, y el paso de la bóveda lo dice así —«Hay N columnas reversibles»—. Si no quieres
la bóveda para alguna, la quitas columna por columna. Lo que Velo no puede reconocer por el
contenido de la columna —un diagnóstico como «J45.9»— lo sospecha, si acaso, por el nombre del
encabezado, con la certeza «sin confirmar». Y un código propio de tu organización (historia
clínica, afiliado, contrato) no tiene forma reconocible: ese lo marcas tú.

**Los ocho documentos que reconoce por su algoritmo.** Como las cédulas y los NIT colombianos, cada
uno se comprueba con su dígito o letra de control oficial, y se ignoran los espacios, puntos y
guiones, y las mayúsculas:

| Documento                   | Qué comprueba Velo                                                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IBAN**                    | ISO 13616, con el control mod 97-10                                                                                                                                                                                                             |
| **DNI** (España)            | La letra de control: el número módulo 23 indexa una tabla de letras                                                                                                                                                                             |
| **NIE** (España)            | Lo mismo, con X, Y y Z valiendo 0, 1 y 2; no admite otro prefijo. Solo el NIE de 9 caracteres (X, 7 dígitos y una letra): **el anterior a julio de 2008 (X y 8 dígitos) no se reconoce**, porque ninguna fuente oficial abierta trae su fórmula |
| **NIR** (Francia)           | La clave: 97 menos los 13 primeros dígitos módulo 97 (con 2A y 2B de Córcega); sexo 1 o 2 y mes entre 01 y 12                                                                                                                                   |
| **Codice fiscale** (Italia) | El carácter de control (tablas de posiciones impares y pares, módulo 26); una letra de mes y un día posibles                                                                                                                                    |
| **Steuer-IdNr** (Alemania)  | La cifra de control sobre las 10 primeras cifras; sin 0 al inicio y con la estructura de cifras repetidas que fija la norma                                                                                                                     |
| **BSN** (Países Bajos)      | La prueba del 11; un BSN de 8 cifras se lee con un cero a la izquierda; no admite todo ceros                                                                                                                                                    |
| **PESEL** (Polonia)         | El dígito de control (pesos 1-3-7-9) y que la fecha de nacimiento que lleva exista                                                                                                                                                              |

**«Confirmado por el algoritmo»** quiere decir dos cosas: el control cuadra y la estructura es
posible (un mes que existe, un prefijo que el documento admite). **No** quiere decir que el número
exista ni que sea de alguien: un número inventado también puede cuadrar. Velo los marca
«Confirmado» en la tabla del diagnóstico, con el nombre del documento, su país y la fuente de su
algoritmo. Por ejemplo, `12345678Z` es un DNI de ejemplo —la letra que corresponde a 12345678 es la
Z—; sirve para explicar el algoritmo y no es de nadie.

**Cómo quedan los seudónimos de esos documentos**

- **Pasan el control oficial de su país.** Un seudónimo de DNI es un DNI con la letra que cuadra; uno de
  NIR, un NIR con su clave. Así, un sistema que revise el formato no tiene por qué rechazarlo.
- **Nunca es el dato original.** Si por casualidad el seudónimo saliera igual al original, Velo lo
  calcula de nuevo (sigue dependiendo solo del valor y de la llave), y si no lo consigue, se detiene
  en vez de entregarte el dato.
- **No conserva nada del original,** ni el departamento, ni el año, ni el sexo: esos campos son
  cuasi-identificadores, y heredarlos sería dejar la mitad del dato a la vista.
- **El IBAN es la excepción parcial:** conserva el país, el largo, qué posiciones son dígitos y cuáles
  letras, y el agrupado de a cuatro si venía agrupado. Pasa el control ISO 13616 y, en España y
  Francia, **recalcula las claves nacionales que van dentro** (el CCC español, la clave RIB
  francesa); **las de los demás países no se recalculan**, así que un destino que las valide puede
  rechazarlo.
- **Los números que salen son sintéticos, pero Velo no comprueba que no existan.** Pasan el control
  de su documento y no conservan nada del original, pero Velo no puede saber qué números están
  asignados a personas reales: un seudónimo puede ser, por casualidad, el número real de otra
  persona, y en los documentos con pocos valores posibles frente a la población (el DNI, el PESEL,
  el BSN, el Steuer-IdNr) esa casualidad no es rara. No lo trates como inocuo.
- **Pueden repetirse.** Velo sortea cada PESEL entre unos 250 millones de valores y cada Steuer-IdNr entre unos
  150 millones; en un archivo grande dos originales distintos pueden recibir el mismo seudónimo. El
  balance cuenta cuántos, no lo esconde (salvo en una columna de [alto
  volumen](#9-archivos-enormes-el-modo-de-alto-volumen) que no cabe en su diccionario), y el regreso los declara
  como ambiguos ([sección 6](#6-el-regreso-recuperar-lo-que-entregaste)).
- **Una celda que no se parece al formato** igual sale con él: una columna marcada como IBAN con un
  texto libre recibe un IBAN sintético con forma española, porque pediste IBAN y Velo no puede
  inventar un país a partir de un texto cualquiera.

**Nombres de columna en otras lenguas.** Velo también lee encabezados en alemán, francés, italiano,
neerlandés, polaco, portugués e inglés —nombres, direcciones, fecha de nacimiento, código postal,
sexo, nacionalidad, salud, creencias, condenas—, además del español. Busca **palabras completas**,
no pedazos de palabra, y se apoya **solo en el encabezado**: es una sospecha, y la certeza queda
«sin confirmar», igual que con los nombres en español.

**Lo que muestra la pantalla.** Al elegir la política verás su advertencia —_«Es la interpretación
de Velo del texto, aplicada a las columnas que Velo reconoció. No es una certificación de
cumplimiento…»_— y la lista **«Qué cubre, artículo por artículo»**. Cada línea trae el artículo,
cómo lo ve Velo (por el contenido de la columna, solo por su nombre, o «Velo no lo reconoce»), la
fuente —el Reglamento (UE) 2016/679 en el Diario Oficial de la UE, L 119, 4.5.2016— y la fecha en
que se consultó: el 2 de noviembre de 2026. Si tocas una regla, Velo dice que ya no es la política de
fábrica, y el certificado describe lo que se hizo, no la plantilla.

**Lo que dice el certificado.** Abre con **«Seudonimizado (art. 4.5 RGPD)»**: cuántas columnas pasaron
a un seudónimo, que el archivo sigue siendo dato personal para quien tenga la llave y la bóveda, qué
se generalizó y qué se quitó. Y cierra con su **«Qué NO afirma Velo»**: que no declara el archivo
anónimo, que no hace el análisis del considerando 26 y que no certifica cumplimiento.

**Lo que esta política no hace**

- **No hace el análisis de «medios razonables»** del considerando 26, no decide la base lícita del
  tratamiento (art. 6 y art. 9.2), no hace una evaluación de impacto y **no certifica
  cumplimiento**: ninguna autoridad emite esa certificación y la política es la lectura que Velo
  hace del texto.
- **No valida otros documentos:** ni los de otros países, ni teléfonos europeos, ni números de IVA, ni
  formatos postales. Lo que Velo no reconoce, lo marcas tú, como en las otras políticas.
- **Los nombres en otras lenguas** cubren los campos comunes, solo desde el encabezado.
- **El k = 5 y las escaleras de generalización son de Velo,** no del reglamento.
- **Las fuentes no se verificaron todas igual de a fondo.** El DNI y el NIE se validan con el
  algoritmo del módulo 23, el de uso universal. El NIE se reconoce solo en su forma de 9 caracteres (el
  anterior a julio de 2008 no, porque ninguna fuente oficial abierta trae su fórmula). Pero la página del Ministerio del Interior de
  España que describe el cálculo no pudo abrirse al verificarlo: el algoritmo se tomó de los
  extractos que de ella cita un buscador y se comprobó a mano. Los otros documentos se
  reprodujeron con ejemplos oficiales, salvo el codice fiscale, cuyo decreto no trae ninguno. El
  detalle, documento por documento, está en el ADR-016 (`decisions/016-rgpd.md`).

---

### 11. Velo en tu equipo: la consola, las bases de datos y la API

**Velo local es el mismo motor de la web, como un programa de tu computador.** No es un servicio:
no hay nadie al otro lado. Lo corres tú, con Node 22, desde el repositorio (`pnpm install` y luego
`pnpm velo …`). Está para lo que la pestaña del navegador no puede hacer: leer una tabla directo de
una base de datos, ofrecerle una API a otro programa tuyo y tratar archivos tan grandes como el
disco aguante. El motor es el mismo: **el mismo archivo, con la misma política, la misma frase y la
misma sal, da los mismos bytes** que en la web (un par de pruebas automáticas lo comparan en cada
cambio, una de ellas con Chromium de verdad).

**Tus datos no salen de tu equipo.** Velo local no se conecta a nada salvo a la base de datos que tú
configuras, no manda telemetría y solo escribe donde tú le dices. No pisa nada: si el archivo de
salida ya existe, se niega.

**Las órdenes**

| Orden                              | Qué hace                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm velo diagnosticar <archivo>` | El mismo diagnóstico de la web (CSV, JSON, JSON Lines). `--json` lo entrega como JSON.        |
| `pnpm velo anonimizar <archivo>`   | Anonimiza con `--politica` (`habeas-data`, `hipaa`, `rgpd` o un archivo exportado de la web). |
| `pnpm velo restaurar <archivo>`    | Restaura un archivo devuelto con `--boveda`.                                                  |
| `pnpm velo puente …`               | Lo mismo, sobre una tabla de PostgreSQL o SQL Server.                                         |
| `pnpm velo api`                    | Levanta la API local.                                                                         |

`--salida` elige la carpeta (tiene que existir: si no, Velo local lo dice antes de pedirte ninguna frase), `--sal` fija la sal de la llave (para que mañana los seudónimos
coincidan con los de hoy), `--bitacora` anota el tratamiento en tu bitácora e `--idioma es|en`
cambia el idioma de los mensajes y de los documentos. Salen el anonimizado, **el certificado** y,
si pediste columnas reversibles, **la bóveda**, con las mismas huellas que en la web. Un JSON entra
y un JSON sale; uno demasiado grande para la memoria se trata
[por pasadas](#9-archivos-enormes-el-modo-de-alto-volumen), igual que en la web. Si una corrida
falla a medias, Velo local deshace lo que escribió; si no logra borrar un archivo (un disco lleno o
sin permisos), te dice cuál con «No pude borrar…», y lo borras tú: no lo dejes por bueno.

**Las frases y la conexión nunca van en una orden.** La frase de la llave sale de `VELO_FRASE` o de
la consola, sin eco; la de la bóveda, de `VELO_FRASE_BOVEDA`; la de la bitácora, de
`VELO_FRASE_BITACORA`; la conexión a la base, de `VELO_DB_URL` o de la consola, sin eco. Un
argumento quedaría en el historial de tu terminal. Ni la frase ni la conexión salen en un mensaje de
error.

**El puente a bases de datos**

`pnpm velo puente --tabla esquema.tabla --politica <…>` lee una tabla de **PostgreSQL** o de **SQL
Server** (el motor sale de la conexión: `postgres://` o `mssql://`) y escribe el resultado en una
**tabla nueva, `<tabla>__velo`**. Lo que cumple, y cómo se comprueba:

- **La tabla original no se toca.** Velo calcula la huella de su contenido antes y después, y el
  resultado dice que son la misma. Todo ocurre en una sola transacción; si algo falla, se deshace y
  no queda nada.
- **Sin llave primaria, Velo se niega.** Sin ella no hay un orden estable de las filas y, sin orden
  estable, no puede prometer los mismos bytes. Lo dice y no trata la tabla.
- **Los nombres de tabla y de columna solo entran a una consulta si existen en la base,** y los
  valores viajan siempre como parámetros: un nombre de tabla armado a propósito no se ejecuta.
- **El vacío y el `NULL` son lo mismo para Velo.** La tabla nueva guarda el vacío como `NULL` y suma
  una columna, `__velo_fila`, que numera las filas para poder restaurarlas.
- **No reemplaza una tabla que ya existe** salvo que lo pidas con `--reemplazar`.
- **El certificado, la bóveda y la bitácora se escriben antes de confirmar la transacción:** si no
  se pueden escribir, la tabla nueva tampoco aparece, y lo que alcanzó a escribirse se borra. Las
  frases de paso se piden antes de escribir nada, así que una que falta no deja archivos a medias.

Para volver: `pnpm velo puente --restaurar --tabla esquema.tabla__velo --boveda archivo.velo` escribe
`<tabla>__restaurada`. **Esa tabla lleva los valores originales, en claro**, y la puede leer cualquiera
con permiso sobre el esquema: Velo te lo recuerda al terminar. Dásela solo a quien podía ver la
original, y bórrala cuando ya no la necesites. Sin una base propia donde ensayar, `pnpm kit:base` levanta en tu equipo, en
`127.0.0.1:5433`, un PostgreSQL embebido con una tabla sintética (`public.clientes`); se cierra con
Ctrl-C. No instala nada.

**La API local**

`pnpm velo api` escucha **solo en `127.0.0.1:3301`**. Al arrancar muestra, **una vez**, un token
nuevo que hay que mandar como `Authorization: Bearer …`; muere con el proceso. Rechaza lo que no
viene de tu equipo: sin token (401), con un `Host` que no sea el suyo (421; así no la alcanza una
página web que engañe al navegador) y con cabecera `Origin` (403; no hay CORS: un navegador no puede
usarla). El cuerpo tiene tope (413) y los errores salen con su clave, nunca con un trozo de tu
archivo. La llave se deriva una sola vez al arrancar: jamás viaja en una petición.

| Ruta                    | Qué hace                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `GET /v1/salud`         | Responde si está viva, con la huella de la llave.                                       |
| `POST /v1/diagnosticar` | El cuerpo es el archivo; responde el diagnóstico y el riesgo exacto.                    |
| `POST /v1/anonimizar`   | Responde el archivo, el certificado y la bóveda sellada. Siempre mide el riesgo.        |
| `POST /v1/restaurar`    | El cuerpo es el archivo devuelto; `X-Velo-Boveda` es la ruta de la bóveda en tu equipo. |

La cabecera `X-Velo-Nombre` dice el nombre del archivo, y su extensión decide el formato: `.csv`, o
`.json`, `.jsonl` o `.ndjson` para JSON. El contrato completo está en `docs/api/velo-local.yaml`.

**Lo que Velo local no hace.** No habla con MySQL, Oracle ni SQLite. No parte un Excel por pasadas
(conserva su tope de 150 MB). No sustituye la web: para una persona que solo quiere anonimizar un
archivo, la pestaña del navegador sigue siendo lo más simple.

---

## Lo que Velo NO afirma

Esta sección es tan parte del producto como las otras.

- Velo **mide** el riesgo de reidentificación; no lo elimina y **no declara anónimo** ningún
  archivo. El modelo k-anonimato es atacable incluso sin información auxiliar, y se degrada a
  medida que se añaden columnas.
- «No reconocimos datos personales» **no es lo mismo** que «este archivo es anónimo». Velo detecta
  lo que sabe detectar: documentos, contactos, ubicaciones y atributos demográficos. Un código
  interno de tu organización, un número de historia clínica o una combinación propia de tu dominio
  pueden seguir señalando a una persona sin que ningún algoritmo público lo note.
- La detección de tipos se hace sobre una **muestra de hasta 5.000 valores por columna**,
  repartidos a lo largo de todo el archivo (en un archivo de
  [alto volumen](#9-archivos-enormes-el-modo-de-alto-volumen), sobre sus primeras 5.000 filas). Las
  cifras de riesgo, en cambio, se calculan sobre el archivo completo.
- El consejero de cruces evalúa un **subconjunto acotado** de combinaciones y lo declara en
  pantalla. No es el universo entero de cruces posibles.
- **Limpiar los metadatos de un PDF o una imagen no los vuelve anónimos.** Velo limpia lo que el
  archivo dice de sí mismo; el texto de las páginas y lo que se ve en la imagen (un nombre, una
  cara, una placa, un letrero) quedan como estaban, y pueden identificar a alguien por sí solos.
- **Un archivo limpio puede volver a ensuciarse.** Un programa que abra la copia limpia y la guarde
  otra vez puede escribirle metadatos nuevos. El certificado habla de los bytes exactos que Velo
  entregó —por eso lleva la huella—, no de lo que ocurra con el archivo después.
- **La lista de campos es lo que Velo sabe nombrar,** y la comprobación la hace el mismo lector que
  la escribió. La limpieza quita además todo lo que no está en su lista blanca, pero «sin campos con
  nombre» no es lo mismo que «sin metadatos», y Velo no afirma que ninguna otra herramienta, en
  ningún formato que exista, encuentre nada.
- **En un PDF, Velo avisa de las anotaciones con autor, los archivos adjuntos, los campos de
  formulario y el JavaScript incrustado, pero no los limpia:** el nombre de quien comentó (y la
  fecha que la anotación traiga) o lo que alguien escribió en un formulario sigue en la copia limpia. Un PDF firmado pierde su firma al
  limpiarse, y uno protegido con contraseña no se abre.
- **En un JSON, las listas no se tratan:** salen del archivo tal cual, aunque lleven correos,
  teléfonos o documentos, y la política no las alcanza. Velo lo declara en pantalla, con la ruta y
  los nombres de los campos que vio dentro; tratarlas, o quitarlas, queda de tu lado. Y lo que
  sale es una reescritura fiel, no una copia byte por byte: compacta, un registro por línea.
- **El ε de la privacidad diferencial local es de UN valor de UN campo, no del archivo.** Dice cuánto
  puede aprender quien ve el archivo sobre un solo valor de una columna con ruido. No cubre las demás
  columnas; no cubre las entregas repetidas —cada archivo distinto que entregues con los mismos
  datos gasta su propio ε, y los ε se suman—; y **no se compone con el k**: el k se mide aparte, sobre
  el archivo, y Velo no suma ni promedia los dos en un solo número. La perturbación ±% no tiene ε ni
  garantía formal. Y Velo no dice qué ε es «suficiente»: esa decisión es tuya y depende de para qué
  es el archivo.
- **La comparación de la generalización óptima se mide sobre las columnas del reparto, no sobre el
  archivo entero.** El k, la ℓ, el riesgo y los bits de la tabla «Los dos caminos, lado a lado»
  hablan solo de las columnas que marcaste con «Generalizar hasta alcanzar el k»; otras columnas
  pueden partir esos grupos, y el balance completo llega al transformar. «Óptima» es la mejor
  combinación de las escaleras que le diste, no la mejor generalización posible.
- **Seudonimizado no es anónimo.** Con la política RGPD, y con cualquier seudónimo reversible, el
  archivo sigue siendo dato personal para quien tenga la llave y la bóveda (art. 4.5). Velo no
  hace el análisis de los «medios razonables» del considerando 26, no decide la base lícita del
  tratamiento y **no certifica cumplimiento**: la política de fábrica es su lectura del texto,
  aplicada a las columnas que reconoció, y el k = 5 es una elección suya, no del reglamento. Un
  documento «confirmado» por su algoritmo tiene el control bien calculado y una estructura
  posible; no quiere decir que el número exista ni que sea de alguien. Y en el DNI y el NIE, la
  página oficial del Ministerio del Interior no pudo abrirse al verificar el algoritmo
  ([sección 10](#10-la-política-rgpd), ADR-016).
- **En un archivo de alto volumen, no todo se mide.** El riesgo sigue siendo exacto, pero no se mide
  lo que el archivo perdió, el consejero de cruces combina solo los cuasi-identificadores y las
  colisiones de seudónimo no se cuentan en las columnas que no caben en su diccionario. Lo que no cabe en los topes se dice; no se estima
  ([sección 9](#9-archivos-enormes-el-modo-de-alto-volumen)).

---

## Preguntas que salen siempre

**¿Mis datos llegan a algún servidor?**
No. Y no es una promesa a ciegas: hay una prueba automática que intercepta _todas_ las peticiones
del navegador durante el flujo completo con un archivo cargado, y falla si aparece una sola que
lleve datos. Además, la propia página le prohíbe al navegador conectarse a cualquier sitio que no
sea el suyo.

**¿Por qué se pierde todo al recargar?**
Porque nunca se guardó nada. Es la contrapartida de la promesa.

**¿Velo usa inteligencia artificial?**
No, y no es una limitación: es el diseño. Todo lo que hace es determinista — el mismo archivo con la
misma política y la misma llave produce siempre el mismo diagnóstico **y el mismo archivo de
salida**, byte por byte, y por eso el resultado es auditable. Hay un control automático que impide
que entre al proyecto cualquier librería de IA generativa, y otro que corre el motor dos veces y
compara los bytes.

**Entregué un archivo el mes pasado. ¿Cómo consigo los mismos seudónimos?**
Con la **misma frase de paso y la misma sal**. La frase la guardas tú; la sal te la enseña Velo al
derivar la llave. **No viaja dentro de la política exportada**, pero sí dentro de la bóveda,
cifrada con todo lo demás: quien conserva la bóveda y recuerda la frase puede volver a derivar la
misma llave. Si no guardaste bóveda —porque no marcaste ninguna columna como reversible—, cópiala a
tu gestor de contraseñas junto a la frase. **Ojo:** en la web cada llave nueva estrena su propia
sal y la pantalla no deja escribir una; para repetir los seudónimos de un archivo a otro, la
puerta es Velo local con `--sal` (la misma frase y la misma sal dan los mismos seudónimos).

**¿Puedo usar Velo en inglés?**
Sí, entero: las cinco pantallas, los avisos de las llaves, el certificado, el informe del regreso y
el brochure. Cambia con los botones **ES** / **EN** del encabezado. El inglés está redactado, no
traducido palabra por palabra, y dice lo mismo con la misma cautela: lo estimado va marcado como
estimado en los dos idiomas.

**Si uso Velo en inglés, ¿reconoce datos personales de otros países?**
Depende del país, no del idioma. Los reconocedores propios de un país son los colombianos —una
cédula, un NIT, un celular o una placa— y los ocho documentos europeos de
[la sección 10](#10-la-política-rgpd) (IBAN, DNI y NIE de España, NIR de Francia, codice fiscale de
Italia, Steuer-IdNr de Alemania, BSN de los Países Bajos y PESEL de Polonia). Todos se detectan
igual en las dos pantallas, y los universales —correo, tarjeta de pago, dirección IP, coordenadas,
fechas— también. Un documento de otro país que no esté en esa lista no se reconoce, y lo marcas tú.
El idioma cambia lo que lees, no lo que Velo sabe detectar.

**¿Por qué Velo dice «seudonimizado» y no «anónimo»?**
Porque son cosas distintas, y el RGPD las distingue. Un seudónimo se puede volver a atar a la
persona con información adicional —aquí, tu llave y tu bóveda—, y mientras ese camino exista el
archivo sigue siendo dato personal para quien lo tenga (art. 4.5 y considerando 26). Que un archivo
deje de serlo para otra persona depende de los medios razonablemente utilizables para
identificarla, y esa evaluación la hace quien trata los datos, con su contexto. Velo no la hace, así
que no declara anónimo ningún archivo. Está explicado en
[la sección 10](#10-la-política-rgpd).

**¿Por qué mi IBAN seudonimizado lo rechaza mi banco o mi sistema?**
Porque el IBAN que sale pasa el control general (ISO 13616, mod 97-10) y conserva el país, el largo
y el agrupado. En España y Francia, Velo también recalcula las claves nacionales que van dentro (el
CCC español, la clave RIB francesa); en los demás países **no las recalcula**, y un destino que las
valide lo rechaza. Si es tu caso, ese seudónimo no le servirá: entrega esa columna de otra forma (un seudónimo hexadecimal, que no finge ser un IBAN, o
sin la columna).

**Tengo una foto en HEIC o AVIF, la de mi teléfono. ¿Puedo limpiarla?**
Sí. Suéltala como cualquier otra imagen. Velo le quita el EXIF (ubicación, cámara, fechas, autor), el
XMP y las descripciones que alguien escribió sobre la foto, y te devuelve un HEIC o un AVIF: no la
convierte a JPEG. Conserva la imagen, el perfil de color, la orientación, la miniatura y los mapas auxiliares
(de profundidad o de realce HDR); por eso, en una pantalla HDR, la foto puede verse con menos rango,
y Velo te lo avisa. Una Live Photo son dos archivos, la foto y su video (`.mov`): se limpian por separado, y los
dos limpios ya no aparecen juntos en Fotos. Una ráfaga o un video `.mov` también se limpian. Si
trae partes que Velo no sabe reescribir, no la toca y te dice qué hacer: exportarla como imagen fija. Los detalles, en
[la sección 8](#8-pdf-e-imágenes-limpiar-lo-que-el-archivo-dice-de-sí-mismo).

**En «Ruido con garantía», ¿qué ε elijo?**
Velo no lo decide por ti y no te da un número «seguro», porque no existe. Un ε menor da más
protección y más ruido —el dato sale menos útil—; uno mayor da menos ruido y menos protección. Qué
balance conviene depende de para qué es el archivo y a quién va. Y recuerda de qué es el ε: de UN
valor de UN campo, no del archivo, y cada entrega distinta con los mismos datos gasta el suyo. Las
opciones van de 0,1 a 8, y la pantalla muestra siempre el ε que quedó, redondeado hacia arriba.

**Limpié los metadatos de una foto. ¿Ya puedo publicarla?**
Se fueron la ubicación, la cámara, el autor y las fechas, y Velo lo comprobó releyendo la copia. Lo
que se ve en la foto no cambió: si hay una cara, una placa o un letrero, siguen ahí. Léelo en
[la sección 8](#8-pdf-e-imágenes-limpiar-lo-que-el-archivo-dice-de-sí-mismo) antes de decidir.

**¿Funciona sin internet?**
La primera vez necesitas cargar la página. Después, el análisis ocurre entero en tu computador.
El reporte descargado se abre sin conexión, siempre.

**¿Qué pasa con un archivo de 500.000 filas?**
Funciona. Está medido: 500.000 filas × 24 columnas (unos 130 MB) se procesan en unos pocos
segundos sin que la pestaña se congele, porque el trabajo pesado ocurre en un hilo aparte.

**¿Por qué mi archivo de 5 millones de filas tarda minutos?**
Porque pasa de 20.000.000 de celdas y Velo lo lee por pasadas en vez de cargarlo entero: una para
el diagnóstico, otra para medir y otra para escribir
([sección 9](#9-archivos-enormes-el-modo-de-alto-volumen)). En el archivo que se midió —5.000.000 de
filas × 24 columnas, 1,36 GB, en un Mac del autor— fueron 83 s, 280 s y 261 s (unos 10 minutos), y la
pestaña llegó a pedir hasta 4,5 GB de memoria. Es una referencia, no una promesa: depende de tu
equipo, y conviene cerrar otras pestañas. A cambio, el riesgo sigue siendo exacto y el archivo que
sale es el mismo, byte por byte, que saldría si cupiera en memoria.

---

## Lo que viene

**Nada de lo que este manual describía como futuro sigue pendiente, salvo una decisión.** El
certificado, la bitácora y el riesgo estimado —las tres cosas que aquí se prometieron— están arriba,
cada una con su sección. Lo único abierto es el pico de memoria del alto volumen (4,5 GB a
5.000.000 de filas): bajarlo a la mitad exigiría cambiar el riesgo exacto por uno estimado, y esa
decisión de producto no está tomada.

Lo que Velo **no** hace hoy vive en «Lo que Velo NO afirma» y en los topes declarados: no lee bases
de datos desde la web (solo [Velo local](#11-velo-en-tu-equipo-la-consola-las-bases-de-datos-y-la-api),
y solo PostgreSQL y SQL Server), no genera `.xlsx` de salida, no trata las listas que van dentro de un JSON, no limpia las
anotaciones, los adjuntos ni los formularios de un PDF, y no usa —ni usará— inteligencia artificial
generativa en ninguna parte del producto.
