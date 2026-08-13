---
app: anonimizador
sprint: 003
titulo: "El regreso — Velo cierra el círculo"
branch: sprint-003/el-regreso
pr: 7
cerrado: 2026-08-12
---

# Sprint 003 · El regreso — resumen

**Velo devuelve.** El usuario anonimiza marcando qué columnas quiere poder recuperar, guarda una
**bóveda cifrada** (`.velo`), entrega el archivo a quien sea —consultor, empresa, IA— y cuando se lo
devuelven trabajado, lo carga y **los valores originales vuelven**. Por valor y nunca por posición,
así que el tercero puede reordenar filas, añadir columnas, borrar otras y corregir a mano: la
restauración sobrevive a todo eso **y respeta su trabajo**.

Es la mitad que el S2 dejó fuera a propósito y la que justifica el producto entero. La tesis
—«el mercado hace la mitad del viaje»— deja de ser una promesa del brief y pasa a ser una ruta.

Lo que Velo sigue sin hacer: **no elige por ti**. Cuando un seudónimo corresponde a dos originales
—aritmética, no accidente: conservar el formato reduce el espacio— esa celda vuelve **sin resolver**,
con el seudónimo intacto, y el número se dice **antes** de restaurar.

9 commits · 39 archivos · +7.084 / −201 líneas · **cero dependencias nuevas**.

---

## Lo que quedó en `main`

| Pieza                                                | Qué es                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La bóveda** (`engine/boveda.ts`)                   | La correspondencia en **arreglos paralelos** —`seudonimos[i]` volvió de `originales[i]`—, ordenada por punto de código. Una colisión no es una excepción del formato: es una entrada con **dos originales**. Pura, síncrona y determinista.                                       |
| **El archivo `.velo`** (`lib/boveda-archivo.ts`)     | AES-GCM-256 con **IV único por sellado**, PBKDF2-600k, cabecera de 37 bytes como **datos autenticados**. Las iteraciones **viajan dentro**: endurecer el parámetro mañana no vuelve ilegible ninguna bóveda de hoy. Con tope, para que un archivo alterado no cuelgue la pestaña. |
| **El eje reversible** (`engine/politica.ts`)         | Una casilla por columna, solo sobre seudónimos. Irreversible por defecto. `reversible` es **opcional y no un booleano**: así el hash de toda política del S2 sigue valiendo.                                                                                                      |
| **El motor de restauración** (`engine/restaurar.ts`) | Puro, sobre el **diccionario** y no las filas. Columnas reconocidas por **contenido**, con umbral declarado (0,5) y mínimo de dos coincidencias, cada uno con su razón escrita. Cada celda queda **restaurada · ambigua · desconocida · fuera de alcance**.                       |
| **El informe del regreso** (`engine/reporte.ts`)     | Documento autocontenido, con las salvedades **arriba de la cifra** y la ambigüedad repetida en el pie porque el documento se lee fuera de contexto. Ni una celda del archivo dentro.                                                                                              |
| **La ruta `/regreso`**                               | Cuarta pantalla del mismo flujo, con worker propio: el regreso ocurre en otra sesión, sin original cargado. Carga diferida desde que nació.                                                                                                                                       |

---

## Las reglas duras, como gate mecánico

| Regla                               | Cómo se blinda                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cero IA generativa**              | Gate `anti-ia` sobre `package.json` y lockfile. **Cero dependencias nuevas** en todo el sprint: AES-GCM y PBKDF2 son Web Crypto nativo, igual que el HMAC del S2.                                                                                                                  |
| **Los datos jamás salen**           | El e2e de garantía de red **se extendió al sellado, la apertura de la bóveda y la restauración**. La bóveda entra al worker como `File` y **ningún componente la abre**: contiene los valores originales, que es exactamente lo que no puede pasar por la página.                  |
| **Determinismo byte-idéntico**      | Dos restauraciones del mismo par ⇒ misma tabla byte por byte; otra bóveda ⇒ resultado distinto. Y la excepción **razonada, no concedida**: el `.velo` cifrado **no** es reproducible porque AES-GCM exige IV único — el gate se mide sobre la serialización **en claro**. ADR-006. |
| **Ni un dato real**                 | Generador sintético seeded, con perfil nuevo `colisiones-de-formato` que **provoca** los choques en vez de esperarlos.                                                                                                                                                             |
| **Honestidad medida**               | La proporción de restauración viaja con sus salvedades **ya ordenadas** y con `esTitular` decidido **en el tipo**. Si hay ambigüedad, encabeza.                                                                                                                                    |
| **La frase no existe en la página** | Entra al worker y no vuelve; a la pantalla cruzan huellas y conteos. Test dedicado sobre el estado publicado, y una **aserción de forma exacta** que impide que un campo nuevo cruce sin que alguien lo mire.                                                                      |

---

## Definition of Done (6+1)

| Estándar           | Estado | Evidencia                                                                                                                                                                                                                              |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Testing**        | ✅     | **641 unitarias** (98 % sentencias · 93,5 % ramas; motor y `lib` sobre el 80 % exigido) + **88 e2e**, 2 saltadas por diseño. **Cero flaky.**                                                                                           |
| **CI/CD**          | ✅     | Los cuatro jobs verdes y requeridos en la ruleset. El reporter de Playwright pasó a `[["github"],["list"]]` y la línea `N flaky` **nació con su demo en rojo**, registrada con su salida literal.                                      |
| **Determinismo**   | ✅     | En las dos direcciones, y con su excepción criptográfica razonada en el ADR-006.                                                                                                                                                       |
| **Observabilidad** | ✅     | El error del worker del regreso **descarta el texto del evento**: un mensaje de excepción puede citar contenido de la bóveda.                                                                                                          |
| **Seguridad**      | ✅     | `pnpm audit --audit-level high` limpio · doble cinturón gitleaks en cada commit · cero deps nuevas · llave `extractable: false`.                                                                                                       |
| **Performance**    | ✅     | Lighthouse móvil: `/` **94 · 100 · 100 · 100** · `/transformar` **93** · `/regreso` **92**. Peor caso medido **antes de la UI**: 446.006 pares ⇒ 11,64 MB, 138 ms sellar, 123 ms abrir, 117 ms restaurar. Bundle **+5,6 %** vs `main`. |
| **UX + A11y**      | ⏳     | axe limpio en **dos temas × dos tamaños** en `/regreso` · teclado completo · `reduced-motion` con visibilidad real. **Falta el gate visual ⭐ — diferido, ver abajo.**                                                                 |
| **IA embebida**    | ✅     | **N/A estructural**, por ausencia verificada.                                                                                                                                                                                          |
| **Guía + manual**  | ✅     | `GUIA-DE-PRUEBA.html` **v3 acumulativa: 114 pruebas** (82 heredadas + 32 nuevas + 1 corregida, ninguna eliminada) · `MANUAL-DE-USO.md` con secciones 5 y 6 · `README.md`.                                                              |
| **Auditoría**      | ✅     | Registrada abajo.                                                                                                                                                                                                                      |

---

## El gate ⭐ — **diferido**, y qué se hizo a cambio

El gate ⭐ de este sprint **no se corrió**: se acumula al del sprint de cierre. La guía v3 lo refleja
donde importa: el filtro ⭐ muestra el **acumulado del ciclo** —las 8 del S1, las 6 del S2 y las 8 del
S3, **22 pruebas, ~70 minutos**—, no solo lo nuevo. Una ⭐ diferida que desaparece del filtro es una
prueba perdida.

Los **dos contrapesos exigibles** se cumplieron:

- **Pasada de capturas del builder.** Encontró lo que ningún test ve: con tres opciones de seudónimo,
  a 412 px «Seudónimo con forma de cédula» y «…de NIT» truncaban ambas a «Seudónimo con forma…» —
  **dos opciones distintas, indistinguibles**. Renombradas a etiquetas que caben.
- **E2e de `reduced-motion`** con aserción de visibilidad real sobre `/regreso`.

**El S4 hereda la advertencia del S2 y ahora con más peso:** el gate ⭐ del cierre será la primera vez
que el usuario juzgue el sistema de diseño entero de Velo, ya con **cuatro** pantallas encima. Este
sprint hizo un pago parcial de esa deuda por su cuenta: la sección nueva de la portada se enseñó al
usuario en el momento de escribirla, con sus capturas en los cuatro estados, en vez de esperar al
gate.

---

## `/audita-sprint` — hallazgos y pagos

Dos fases, con las **tres preguntas del patrón** `la-composicion-de-verdades-puede-mentir` sobre cada
pantalla y cada documento con cifras. **Tres hallazgos Alto, tres Medio, dos Bajo.**

Lo que distingue esta auditoría de la del S2: **ninguno de los tres Alto está en el código del
sprint.** Los tres están en lo que el sprint dejó de mirar. Las cinco fases pasaron su gate, y un
gate de fase no puede ver la portada del S1.

| #      | Hallazgo                                                                                                                                                                 | Pago                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | La **portada** decía «lo que todavía no hace es **la vuelta** — un seudónimo de hoy no se puede revertir». Falso desde este sprint, en la primera pantalla del producto. | Sección propia **«Y semanas después»**, con la reversibilidad dicha con precisión: sin bóveda el seudónimo sigue siendo irreversible, y eso es lo que lo hace seguro de entregar.  |
| **A2** | El **manual** abría diciendo que Velo «todavía no desanonimiza» **mientras sus secciones 5 y 6 explicaban cómo hacerlo**: el documento se contradecía a sí mismo.        | Apertura reescrita, con enlaces a las dos secciones.                                                                                                                               |
| **A3** | **`/regreso` no se alcanzaba desde la UI en una sesión nueva.** El único enlace vivía en el taller, después de sellar una bóveda en esa misma sesión.                    | Enlace en la portada + e2e que entra **por clic desde `/`**, sin nada cargado.                                                                                                     |
| **M1** | `sinAparecer` y `fueraDeAlcance` cruzaban la frontera **sin lector** — el mismo patrón que el A2 del S2, con §5 corriendo desde la Fase 1.                               | Fuera del contrato, y **aserción de forma exacta** sobre `ResumenDelRegreso` para que no pueda repetirse. El `as unknown as` del fixture era lo que los dejaba pasar el typecheck. |
| **M2** | El motivo del error del archivo devuelto se guardaba y **nadie lo leía**: a quien soltaba un archivo vacío se le decía que revisara el formato.                          | Tabla de motivos, con la guía a CSV para el Excel devuelto.                                                                                                                        |
| **M3** | `boveda-archivo.ts` decía que PBKDF2 «tarda del orden de un segundo» **doce líneas después** de decir que 5M de iteraciones son ~300 ms.                                 | El número medido (**36 ms**) y qué compra de verdad: no protege una frase corta; multiplica el costo de cada intento. La defensa real es la longitud.                              |

### A3, el hallazgo que importa

El caso real del producto es alguien que vuelve tres semanas después, quizá en otra máquina, y
aterriza en la portada sin nada cargado. Ese usuario leía que la vuelta no existe (A1) y no tenía
dónde hacer clic (A3). **Los dos hallazgos se agravaban entre sí.**

Los e2e no lo veían porque **todos** entraban con `goto("/regreso")` — incluido el que prueba «otra
sesión», que cierra el contexto y abre uno nuevo pero sigue navegando por URL. La prueba de que la
bóveda es **portable** era correcta; la de que la función es **alcanzable** no existía.

### Por qué §4 falló teniendo su sección

La Fase 2 corrió §4 y dejó su inventario en la bitácora: tres frases caducadas, las tres pagadas en
la Fase 5. El inventario se armó **buscando la palabra «irreversible»**, y las dos frases vivas nunca
la usan — dicen «no se puede **revertir**» y «el **camino de vuelta**».

§4 no falló por no correrse. Falló **por cómo se buscó**. La búsqueda que sí las saca es por
**promesa aplazada** (`todavía no`, `aún no`, `llega después`, `por ahora`, `mientras tanto`), y al
correrla apareció una tercera de propina: la guía de prueba decía que Velo «todavía no transforma»,
**caducada desde el S2**. Llevaba un sprint entero repitiéndose.

**Ajuste al método, para el S4: §4 se busca por promesa aplazada, no por la palabra de la feature.**

---

## Deuda declarada

| Deuda                                                                                                                                                                                                          | Pago asignado                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `esDeLaMismaLlave` exportada y probada, **sin llamador de producción**: en `/regreso` no hay llave HMAC contra la cual comparar, y «esta bóveda no es de este archivo» ya lo dice `reconocimiento: "ninguno"`. | S4: se usa o se borra.                                   |
| `deserializarBoveda` no valida el tipo de cada elemento de los arreglos paralelos. Declarado a propósito por tamaño (480k pares) y el contenido llega **autenticado por GCM**.                                 | Sin pago asignado; se revisa si el formato gana versión. |
| **B2 del S2** (carga duplicada en el contrato del worker).                                                                                                                                                     | S4, con el certificado.                                  |

---

## Lo que este sprint aprendió, dicho para el que venga

**Medir antes de construir cambia lo que se construye.** La orden exigía medir la bóveda del peor
caso antes de una sola pantalla. Salió 11,64 MB y 138 ms: **no hubo tope que declarar**, y toda la
UI se diseñó sabiendo que no había que racionar nada. De paso la medición desmintió una frase que
llevaba un sprint en el código —«PBKDF2 tarda del orden de un segundo»— y obligó a corregir tres
sitios, uno de ellos copy visible.

**Un riesgo bien entendido se disuelve en vez de pagarse.** El riesgo 5 del plan —extender
`ResultadoDeSeudonimo` tocando tres contratos— desapareció al construir la correspondencia sobre el
diccionario, que es donde las técnicas ya trabajaban: cero cambios de contrato, y las colisiones
salieron gratis.

**Un gate de fase no puede ver lo que la fase no toca.** Cinco fases con su gate, y los tres Alto de
la auditoría estaban en la portada, el manual y la navegación. La auditoría final no es un trámite
después de los gates: es lo único que mira el producto **entero**.

**Y la trampa de verificación más silenciosa que ha aparecido:** el comando de Lighthouse del CI corre
en bash, que separa `$URLS` en palabras; en zsh no, y las tres rutas llegan como una sola URL. Con
`assert` respondiendo «0 URLs» **sin fallar**. Un comando _parecido_ al del CI que no falla es peor
que uno que falla — este habría dejado pasar el sprint entero sin medir nada.
