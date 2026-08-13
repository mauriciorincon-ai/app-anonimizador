# Manual de uso — Velo

> _Velo para entregar. Desvelo para recuperar._
> Actualizado en el Sprint 002 · 11 de agosto de 2026

Velo es la **aduana de tus datos**: lo que revisa tu tabla antes de que salga hacia una IA, una
herramienta en la nube o el computador de un tercero. Este manual cubre todo lo que Velo sabe
hacer hoy.

---

## Lo primero, porque cambia cómo lo vas a usar

**Tu archivo no se sube a ningún lado.** Velo no tiene servidor. Cuando sueltas una tabla, se abre
dentro de la pestaña del navegador —en un hilo aparte, para que nada se congele— y ahí se queda.
No hay carga, no hay base de datos, no hay copia.

Eso tiene una consecuencia que conviene saber de antemano: **si recargas la página, el diagnóstico
desaparece**. No es un error. Es la misma razón por la que tus datos no se filtran: nunca se
guardaron en ningún sitio. Volver a soltar el archivo tarda lo mismo que la primera vez.

Y algo sobre el alcance, porque cambió: **Velo diagnostica, transforma y ahora también devuelve**.
Puedes enmascarar, seudonimizar y generalizar, llevarte el archivo tratado con su reporte, y cuando
el tercero te lo devuelva trabajado, recuperar los valores originales. Ese camino de vuelta es la
[bóveda](#5-la-bóveda-para-poder-deshacerlo) y
[el regreso](#6-el-regreso-recuperar-lo-que-entregaste), y tienen su sección cada uno más abajo.

Dicho con precisión, porque la diferencia importa: **un seudónimo sigue siendo irreversible por sí
solo**. Quien reciba el archivo tratado no puede deshacerlo —eso es lo que lo hace seguro de
entregar—. Lo que lo deshace es la bóveda, un archivo cifrado aparte que solo tienes tú y que solo
se abre con tu frase de paso. Si no marcaste ninguna columna como reversible al transformar, no hay
bóveda y no hay vuelta: eso se decide antes, no después.

---

## Cómo se usa

### 1. Trae tu tabla

En la pantalla principal puedes **arrastrar** el archivo hasta el recuadro o **elegirlo** con el
botón (que funciona con teclado: llega con la tecla Tab y se abre con Enter).

Velo lee:

| Formato                     | Tope       | Por qué                                                                                                                                                  |
| --------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV** (`.csv`)            | sin tope   | Se lee por partes; nunca existe entero en memoria.                                                                                                       |
| **Excel** (`.xlsx`, `.xls`) | **150 MB** | Un Excel hay que abrirlo completo para leerlo. Por encima de ese tamaño el navegador se queda sin memoria, así que Velo lo rechaza **antes** de abrirlo. |

Si tu Excel pesa más de 150 MB: ábrelo y guárdalo como CSV. Desde 40 MB Velo te avisa de que va a
tardar y te ofrece la misma salida.

Mientras trabaja verás en qué va: **tomando la huella** del archivo, **leyendo**, **reconociendo
las columnas** y **midiendo el riesgo**. La barra solo aparece cuando hay algo real que medir; en
las etapas que no tienen una fracción que mostrar, Velo te dice la etapa y no te dibuja una barra
falsa.

### 2. Lee el diagnóstico

La pantalla de diagnóstico tiene tres partes.

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
por registro sobre tu archivo completo. El panel lo dice con todas sus letras («Cifra exacta») y
esa marca importa, porque en versiones futuras convivirán con estimadores de población, que sí
llevarán la palabra «estimado» pegada al número.

El modelo que Velo usa se llama **prosecutor**: supone que quien ataca ya sabe que la persona está
en tu tabla y solo busca cuál de las filas es. Es el escenario más adverso de los que se estudian,
y el único que se puede calcular exacto.

#### Columna por columna

Cada fila de la tabla te dice qué encontró Velo y, sobre todo, **por qué**. Ese «por qué» tiene
tres niveles de certeza, y la diferencia entre ellos es la diferencia entre saber y sospechar:

| Nivel             | Qué quiere decir                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirmado**    | Existe un dígito de verificación oficial y Velo lo recalculó y cuadra. Es el caso del NIT (mod 11 de la DIAN), las tarjetas (Luhn) y el IBAN.                                         |
| **Por su forma**  | No existe checksum público para ese dato, así que solo se pudo comprobar la forma. Es el caso de la cédula colombiana: la Registraduría no publica un dígito de verificación.         |
| **Sin confirmar** | La conclusión se apoya en el **nombre de la columna**, no en los valores. Ningún cálculo puede mirar «J45.9» y afirmar que es un diagnóstico de salud; solo el encabezado lo sugiere. |

Y cada columna cae en una de las **cuatro categorías de la Ley 1581 de 2012**:

| Categoría                  | Qué es                                                                                                     | Ejemplos                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Identificador directo**  | Señala a la persona sin ayuda de nada más.                                                                 | cédula, NIT, nombre, correo, celular, dirección |
| **Dato sensible (art. 5)** | Salud, origen racial o étnico, convicciones, vida sexual, biometría. La ley los protege de forma especial. | diagnóstico, grupo étnico, EPS                  |
| **Cuasi-identificador**    | Por sí solo no identifica; **combinado con otros, sí**.                                                    | fecha de nacimiento, sexo, municipio, estrato   |
| **No personal**            | No apunta a una persona.                                                                                   | monto, sucursal, código de producto             |

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
datos de verdad, y ocurre igual que el diagnóstico: dentro de esta pestaña, sin subir nada.

#### La política: qué se le hace a cada columna

Una fila por columna, con un desplegable. Puedes elegir columna por columna o partir de una
**política de fábrica**:

- **Habeas Data (Colombia)** — Ley 1581 de 2012 y Decreto 1377 de 2013, con las técnicas de la guía
  de anonimización AGN + SIC. Declara un objetivo de grupo mínimo (k = 5).
- **HIPAA · Safe Harbor** — los 18 identificadores de 45 CFR §164.514(b)(2). Ojo: Safe Harbor manda
  **borrar**, no seudonimizar, porque §164.514(c) prohíbe un código derivado de la información.

Las dos dicen, ahí mismo, cuántos de sus puntos reconoce Velo por el contenido de la columna,
cuántos solo por el nombre y **cuántos tienes que marcar tú**. Ninguna es una certificación.

En cuanto tocas una regla de una política de fábrica, Velo lo dice: _«ya no es Habeas Data»_. La
guía oficial no respalda una decisión que no tomó.

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

#### La llave, si pides seudónimos

Un seudónimo se calcula con una **frase de paso que solo tú tienes**. Tres cosas que conviene saber
antes de escribirla:

- **La misma frase da los mismos seudónimos.** Es lo que te permite cruzar el archivo de marzo con
  el de abril sin tener los datos reales delante.
- **Si la pierdes, no hay vuelta atrás.** Nadie puede regenerarla; es la contrapartida de que nadie
  más la tenga.
- **Si se filtra, los seudónimos se vuelven enlazables.** Trátala como una contraseña.

Derivarla cuesta 600.000 vueltas de PBKDF2 (el mínimo que recomienda OWASP), **y ese costo es la
protección**: encarece por igual cada intento de adivinarla. Cuánto tarda depende del equipo — en un
portátil moderno es un instante, en un teléfono de gama baja se nota—; lo que se garantiza es el
número de vueltas, no los segundos. Guarda
la frase **y la sal** que Velo te enseña: sin las dos, los seudónimos del mes que viene no cuadran.

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
| Colisiones de seudónimo               | Conservar el formato (cédula, NIT) reduce el espacio disponible y dos valores distintos pueden chocar.                              |

#### El archivo

**Preparar el archivo** lo escribe, y **Guardar** lo baja. Sale como
`velo-anonimizado-<8 caracteres>.csv` y no repite el nombre del original a propósito: un nombre como
`pacientes-2026.csv` cuenta de qué va el contenido antes de que nadie lo abra, y ese nombre viaja en
el asunto de un correo.

Esos ocho caracteres **no son un número de serie**: son el principio del SHA-256 de la política que
aplicaste. Dos archivos que lo compartan recibieron exactamente el mismo tratamiento — y el reporte
lleva el hash completo, para que puedas comprobarlo.

Es un CSV separado por comas, con salto de línea `\n` y **sin BOM**. Si Excel en Windows te pregunta
por la codificación, es **UTF-8**. (Velo no genera `.xlsx`: un `.xlsx` es un zip y sus entradas
llevan fecha, así que dos archivos iguales no saldrían idénticos byte por byte — y esa igualdad es
justo lo que Velo promete.)

#### El reporte del tratamiento

El taller también entrega un documento, y no es el mismo del diagnóstico: además de lo que hay en la
tabla, dice **qué se le hizo** — el balance con sus advertencias, la utilidad que se perdió y el hash
completo de la política. Como todo reporte de Velo, puedes **verlo antes de descargarlo**.

Mándalo con el archivo. Un CSV anonimizado que llega solo obliga a quien lo recibe a creerte; con el
documento al lado, puede leer qué se hizo y con qué criterio.

> **Una advertencia que el propio documento repite:** la huella SHA-256 que lleva es la del archivo
> que **entró** a Velo, no la del que descargas. El archivo tratado es otro archivo y tiene otra
> huella. Si quien lo recibe corre `sha256sum` sobre el anonimizado y no le cuadra, no es que el
> reporte esté mal: es que esa huella identifica el original.

---

### 5. La bóveda: para poder deshacerlo

Un seudónimo, por sí solo, **no vuelve**: es un HMAC, no un cifrado, y ningún algoritmo lo revierte.
La vuelta la da una tabla que diga qué seudónimo salió de qué valor — y eso es la **bóveda**.

**Cómo se pide.** En el paso 1, debajo de la técnica de cada columna que sea un seudónimo, aparece
la casilla **«Poder deshacerlo con una bóveda»**. Márcala en las columnas que quieras poder
recuperar. Solo los seudónimos la admiten, y no es una limitación de esta versión: enmascarar
(`103***89`) y generalizar (`30-39`) **destruyen** información, así que no hay tabla que lo deshaga
— los dígitos que faltan ya no existen en ninguna parte. La pantalla te dice cuáles no van a volver.

**Cómo se guarda.** Al transformar aparece el paso 4. Escribes una frase de paso —**puede y debería
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
enlace está en el paso 4, y la ruta funciona sola: no necesitas tener nada cargado).

1. **Carga la bóveda** y escribe su frase. Velo te enseña su huella, cuántas correspondencias trae y
   qué columnas puede devolver.
2. **Carga el archivo devuelto.** Puede venir con las filas en otro orden, con columnas nuevas del
   tercero, sin las que él borró y con valores corregidos a mano: nada de eso estorba.
3. **Lee el aviso antes de confirmar.** Si la bóveda tiene seudónimos ambiguos, Velo te dice cuántos
   **antes** de que pulses, no después.
4. **Restaura** y llévate el archivo restaurado y su informe.

**Por qué sobrevive a que el tercero trabaje.** La restauración es **por valor, jamás por posición**:
Velo busca cada valor en la correspondencia de su columna. Y reconoce las columnas por su
**contenido**, no por su nombre — si el tercero renombró `cedula` a `ID_PACIENTE`, se reconoce igual.

**Las cuatro cosas que le pueden pasar a una celda**, y Velo las cuenta todas:

|                          | Qué pasó                                               | Qué sale en el archivo     |
| ------------------------ | ------------------------------------------------------ | -------------------------- |
| **Restaurada**           | su seudónimo estaba en la bóveda con un único original | el valor original          |
| **Ambigua**              | su seudónimo corresponde a **dos** originales          | **el seudónimo, intacto**  |
| **La cambió el tercero** | el valor no está en la bóveda                          | tal como él la dejó        |
| **Fuera de alcance**     | su columna no estaba en la bóveda                      | la columna entera, intacta |

> **Sobre las ambiguas.** Un seudónimo con formato —cédula, NIT— tiene que caber en muchos menos
> valores que un hash completo, así que a veces dos valores distintos reciben el mismo. Velo **no
> elige por ti**: deja el seudónimo puesto, te dice cuántas celdas son y las declara en el informe.
> Escribir uno de los dos candidatos te devolvería el dato de otra persona sin que nada lo indicara.

**El informe del regreso** dice qué volvió y qué no, con las salvedades **antes** del porcentaje —
igual que el reporte del tratamiento. No lleva ninguna celda: solo nombres de columna, cifras y
huellas. El archivo restaurado sí lleva tus datos: trátalo como el original, porque lo es.

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
  repartidos a lo largo de todo el archivo. Las cifras de riesgo, en cambio, se calculan sobre el
  archivo completo.
- El consejero de cruces evalúa un **subconjunto acotado** de combinaciones y lo declara en
  pantalla. No es el universo entero de cruces posibles.

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
derivar la llave y **hoy no viaja dentro de la política exportada** — cópiala a tu gestor de
contraseñas junto a la frase. (Que la sal viaje con la política llega con la bóveda.)

**¿Funciona sin internet?**
La primera vez necesitas cargar la página. Después, el análisis ocurre entero en tu computador.
El reporte descargado se abre sin conexión, siempre.

**¿Qué pasa con un archivo de 500.000 filas?**
Funciona. Está medido: 500.000 filas × 24 columnas (unos 130 MB) se procesan en unos pocos
segundos sin que la pestaña se congele, porque el trabajo pesado ocurre en un hilo aparte.

---

## Lo que viene

**El certificado.** Un documento firmado que declare, para una entrega concreta, qué se le hizo al
archivo y con qué política — pensado para adjuntarlo a un contrato o a una auditoría. Y la bitácora
de tratamientos, para que una organización pueda enseñar el historial de lo que entregó.
