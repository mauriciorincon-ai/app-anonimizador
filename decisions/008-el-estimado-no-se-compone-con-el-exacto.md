# ADR-008 — El estimado no se compone con el exacto, y a veces no hay estimado

- **Estado:** aceptada
- **Fecha:** 2026-08-13
- **Sprint:** 004 · Fase 3
- **Decide:** qué estimadores entran, cómo se impide que se mezclen con la cifra exacta del S1, y
  cuándo Velo **se niega** a dar un número.

## Contexto

Desde el S1, `riesgo.ts` marca cada resultado como `naturaleza: "exacto"` y su comentario de cabecera
anuncia que algún día llegarían los estimadores poblacionales «etiquetados estimado». Ese día es
este. Son planos distintos: el exacto habla de **tu archivo** contando registros; el estimado habla
de **la población** bajo un modelo y un supuesto que el usuario declara.

Es la tercera aplicación del patrón `la-composicion-de-verdades-puede-mentir`, y la más delicada:
las dos cifras son ciertas, están bien calculadas, y **componerlas produce una tercera que no lo
es**. «Riesgo 12 %» sin decir cuál de los dos es ya miente.

## 1. Los dos estimadores, y por qué estos

|                            | Riesgo individual                                                             | Únicos poblacionales                                            |
| -------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Fuente**                 | Benedetti & Franconi (1998) — el de μ-ARGUS y sdcMicro                        | Zayatz (1991), CENSUS/SRD/RR-91/08, **§III**                    |
| **Pregunta**               | «si alguien intenta emparejar esta fila, ¿qué probabilidad tiene de acertar?» | «de mis filas únicas, ¿cuántas lo serían en toda la población?» |
| **Modelo**                 | `F_k \| f_k ~ f_k + NB(f_k, p)`; el riesgo es `E[1/F_k]`                      | clases de equivalencia + Bayes con muestreo hipergeométrico     |
| **Vale con fracción baja** | sí                                                                            | **no** (ver §4)                                                 |

El informe de Zayatz trae **dos** métodos propios. El §II usa submuestreo y habría necesitado azar,
que el gate de determinismo veta en `engine/`; el §III usa la distribución de tamaños de las clases
de equivalencia, que es exactamente lo que `riesgo.ts` ya calcula desde el S1. Se implementa el §III,
y encaja sin forzar nada.

Las fórmulas se verificaron **contra la fuente primaria**, no de memoria: el modelo de
Benedetti–Franconi está citado textualmente en el código desde Rinott & Shlomo (2007) §2.2, y la
hipergeométrica de Zayatz se comprueba contra los **20 valores publicados en la Tabla 4** del informe.

## 2. La regla vive en el tipo, no en la pantalla

El S2 aprendió que una regla de honestidad que vive en la vista es una regla que tres vistas pueden
olvidar; por eso `reduccion` viaja con sus salvedades. Aquí se aplica lo mismo un paso más allá:

**Las cifras estimadas no son `number`.** Son `CifraEstimada` —un objeto con su valor y su
intervalo—, así que `exacto.riesgoPromedio + estimado.maximo` **no compila**. No es un truco de
tipos: es la forma correcta de que la cifra nunca circule sin lo que la califica, y de paso
convierte la composición prohibida en un error que un test puede ver (`@ts-expect-error`).

## 3. El promedio no lleva intervalo, y eso es la respuesta

`maximo` sí lo lleva: es el riesgo de un registro concreto, que depende de una `F` que nadie conoce,
y el modelo da sus cuantiles. `promedio` **no**, y no por falta de ganas: es la **esperanza** del
modelo. Fijada la fracción de muestreo, su valor es el que es. Lo que puede fallar ahí es el modelo
entero, y el error de un modelo no cabe en un intervalo de confianza.

Poner una banda igualmente habría sido más tranquilizador y falso. `Intervalo` es por eso una unión
con una variante `no-derivable` **que trae su razón** — un hueco con explicación, no un hueco.

## 4. Cuándo Velo se niega, y con qué autoridad

Dos negativas, las dos con su frase en pantalla y **ninguna devolviendo cero**:

- **Sin población declarada** no hay estimador posible: Velo solo ve el archivo. Inventar un
  supuesto por defecto sería la mentira exacta que este repo persigue. Se dice, y se aclara que el
  riesgo exacto no depende de ese dato.
- **Con fracción de muestreo bajo el 10 %, Zayatz no da cifra.** El umbral no se eligió a ojo: sale
  de la evaluación del propio informe. Su Tabla 6 sobreestima siempre y cada vez más al bajar la
  fracción (46,754 % contra 39,073 % reales con 0,1); su Tabla 8, con 1/100, llega a errar por un
  factor de 10. Devolver ese número con una nota al pie sería devolver un número débil.

Consecuencia aceptada: **muchos archivos reales no verán esta segunda cifra**, porque un archivo
suele ser una fracción pequeña de su población. Es correcto. Benedetti–Franconi sí contesta ahí, y
esa asimetría —un estimador habla y el otro calla— es información sobre los datos, no un defecto que
haya que uniformar.

## 5. Un supuesto de la fuente que cambia cómo se testea

Zayatz declara una sola suposición sobre los datos: que sean **reales**, y advierte que el método
puede no funcionar «on simulated data sets with odd equivalence class structures». Los fixtures de
este repo son sintéticos **por regla dura** (repo público, jamás un dato real).

O sea: la fuente dice con todas las letras que este estimador **no se puede verificar comparándolo
con la verdad de un fixture generado**. Por eso los tests no preguntan «¿acierta sobre nuestro
fixture?» sino cuatro cosas que no dependen de él: coincidencia con una implementación independiente,
con los valores publicados, con los límites que el modelo obliga (en censo el estimado cae encima del
exacto) y con las invariantes de la propia derivación.

## Consecuencias

- La población se declara **junto al estimado y no en la política**: es contexto de una medición, no
  una decisión de tratamiento, y no toca el hash de la política.
- La UI (fase 4) tiene que enseñar modelo y supuesto **en la misma línea** que la cifra, y mantener
  al exacto como titular.
- Si algún día entra un tercer estimador, hereda la misma puerta: fuente citada en el código,
  dominio de validez declarado, y silencio honesto fuera de él.
