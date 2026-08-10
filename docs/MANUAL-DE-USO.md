# Manual de uso — Velo

> _Velo para entregar. Desvelo para recuperar._
> Actualizado en el Sprint 001 · 9 de agosto de 2026

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

Y una advertencia sobre el alcance: **en esta versión Velo diagnostica, no transforma**. Te muestra
qué datos personales lleva tu tabla y a cuánta gente delata, pero todavía no enmascara, no
seudonimiza y no devuelve los datos a su forma original. Eso llega después.

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
No, y no es una limitación: es el diseño. Todo lo que hace es determinista — el mismo archivo
produce siempre el mismo diagnóstico, byte por byte, y por eso el resultado es auditable. Hay un
control automático que impide que entre al proyecto cualquier librería de IA generativa.

**¿Funciona sin internet?**
La primera vez necesitas cargar la página. Después, el análisis ocurre entero en tu computador.
El reporte descargado se abre sin conexión, siempre.

**¿Qué pasa con un archivo de 500.000 filas?**
Funciona. Está medido: 500.000 filas × 24 columnas (unos 130 MB) se procesan en unos pocos
segundos sin que la pestaña se congele, porque el trabajo pesado ocurre en un hilo aparte.

---

## Lo que viene

Transformar de verdad: enmascarar, seudonimizar de forma reversible y **devolver los datos a su
forma original** cuando el tercero te entregue el resultado. Ese viaje de ida y vuelta es la razón
de ser de Velo, y llega en los siguientes sprints.
