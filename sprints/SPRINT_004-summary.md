---
app: anonimizador
sprint: 004
titulo: "El cierre — la evidencia, la memoria y el ciclo completo"
branch: sprint-004/el-cierre
pr: 9
cerrado: 2026-08-15
gate_estrella: aplazado-indefinidamente
cierra_ciclo: H1
---

# Sprint 004 · El cierre — resumen

**Velo deja constancia.** Los tres sprints anteriores construyeron capacidades: ver, transformar,
devolver. Este no añade una cuarta — añade **lo que convierte un trabajo hecho en un trabajo
defendible**. El certificado responde _«¿y esos datos cómo viajaron?»_ ante quien pregunte, con las
**dos huellas** y el comando para comprobarlas. La bitácora cifrada responde _«¿qué he hecho yo con
mis archivos?»_ meses después. Y el riesgo estimado completa la única cifra que el producto venía
prometiendo a medias.

Es el **sprint 4 de 4 y cierra el ciclo H1**: lleva además el `BLUEPRINT.html` as-built y el gate ⭐
acumulado de las cuatro pantallas.

La regla que gobernó el sprint entero, y que ahora está escrita donde no se puede olvidar: **una
cifra estimada jamás usa la tipografía del titular exacto**, y el estimado **no se compone** con el
exacto en ningún sitio. Cuando la muestra no permite estimar, Velo **se niega y dice por qué** — no
devuelve un número débil.

11 commits · 59 archivos · +10.568 / −1.567 líneas · **cero dependencias nuevas** (las cuatro del
ciclo).

---

## Lo que quedó en `main`

| Pieza                                                                 | Qué es                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El certificado** (`engine/reporte.ts` + `descarga-del-certificado`) | El informe del S2 **evolucionó**: gana la huella de **salida** —calculada en el worker sobre los mismos trozos que forman el `Blob`, sin segunda pasada sobre 130 MB— y una sección **«cómo verificar»** con el comando literal para macOS/Linux y Windows. Sin esa sección la huella es un adorno.   |
| **La bitácora** (`engine/bitacora.ts` + `lib/bitacora-archivo.ts`)    | Archivo `.velolog` cifrado, aparte de la bóveda (ADR-007). Cada entrada guarda fecha, archivo, hash de política, técnicas, riesgo antes/después y **las dos huellas** — lo que la hace comprobable contra un certificado. **Append lógico**: añadir la N+1 deja las N anteriores byte-idénticas.      |
| **El sobre cifrado** (`lib/archivo-cifrado.ts`)                       | Lo común entre bóveda y bitácora, extraído: AES-GCM-256, PBKDF2-600k, cabecera de 37 bytes autenticada, iteraciones **dentro del archivo**. Los 28 tests de ida y vuelta de la bóveda son la prueba de que la extracción no cambió nada.                                                              |
| **Los estimadores** (`engine/riesgo-estimado.ts`)                     | **Benedetti–Franconi (1998)** —el de µ-ARGUS/sdcMicro— y **únicos poblacionales de Zayatz (1991)**, cada uno con su fuente citada en el código y sus tests de **límites** (censo → 1, muestra → 0, monótono entre medias). `naturaleza: "estimado"`, hermano del `"exacto"` que esperaba desde el S1. |
| **La ruta `/bitacora`**                                               | Quinta pantalla, con estado y worker propios (el patrón que dejó probado el S3), carga diferida desde que nació y alcanzable **desde la portada**, no solo por URL.                                                                                                                                   |
| **`docs/BLUEPRINT.html`**                                             | As-built de toda la infraestructura, autocontenido, con SVG embebido. **Escrito consultando cada servicio, no recordando.**                                                                                                                                                                           |

Y dos ADRs: **007** (la bitácora es archivo propio) y **008** (el estimado no se compone con el exacto).

---

## Las reglas duras, como gate mecánico

| Regla                          | Cómo se blinda                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cero IA generativa**         | Gate `anti-ia` verde. **Cero dependencias nuevas**: los dos estimadores son estadística clásica con su paper citado, no un modelo. Y `.env.example` perdió la línea heredada que prometía «el proveedor LLM y sus keys» — era falsa para siempre bajo la regla dura 1.                              |
| **Los datos jamás salen**      | El e2e de garantía de red **se extendió al certificado, la bitácora y el estimado**, con un `.velolog` sellado y reabierto dentro del test. El certificado se barre con una cédula del fixture: no aparece.                                                                                         |
| **Determinismo byte-idéntico** | Dos certificados con la misma fecha inyectada son idénticos — el test del S2 sigue verde sin tocarlo. La excepción del cifrado sigue razonada en el ADR-006 y se mide **en claro**, herencia que el ADR-007 hereda explícitamente.                                                                  |
| **Ni un dato real**            | Generador sintético seeded. Los dos archivos _golden_ del test nuevo se sellaron con una frase de prueba escrita en el propio test.                                                                                                                                                                 |
| **Honestidad medida**          | La regla del sprint, verificada en los **tres** sitios donde podía romperse: el certificado lleva solo cifras exactas **y lo dice** (_«por registro — no estimadas»_); la entrada de bitácora guarda únicos exactos; la pantalla los separa en paneles con tipografía distinta y un test lo vigila. |
| **La frase no existe**         | Ni la del vault ni la de la bitácora cruzan a la página. Entran al worker y no vuelven.                                                                                                                                                                                                             |

---

## Definition of Done (6+1)

| Estándar           | Estado | Evidencia                                                                                                                                                                                                                                                                |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Testing**        | ✅     | **732 unitarias** (95,83 % sentencias · 91,56 % ramas · `engine/` al **98,77 %**) + **117 e2e**, 3 saltadas por diseño. **Cero flaky.**                                                                                                                                  |
| **CI/CD**          | ✅     | Los cuatro jobs verdes y requeridos en la ruleset `main-protegida`. `/diagnostico` y `/bitacora` **entraron al gate de Lighthouse** en la Fase 0 — antes no se medían.                                                                                                   |
| **Determinismo**   | ✅     | Certificado byte-idéntico con fecha inyectada; serialización de la bitácora en claro estable tras cada append.                                                                                                                                                           |
| **Observabilidad** | ✅     | Los errores de la bitácora descartan el texto de la excepción: un mensaje puede citar contenido descifrado.                                                                                                                                                              |
| **Seguridad**      | ✅     | `pnpm audit --audit-level high` limpio · gitleaks en cada commit · cero deps nuevas · cero `any` y cero `@ts-ignore` nuevos.                                                                                                                                             |
| **Performance**    | ✅     | Lighthouse móvil en las **cinco** rutas: `/` **93** · `/diagnostico` **92** · `/transformar` **95** · `/regreso` **93** · `/bitacora` **93**, con a11y, best-practices y SEO en 100. Bundle **+3,9 %** vs `main`. Bitácora de **2.000 entradas: 0 tareas largas, 0 ms**. |
| **UX + A11y**      | ⏳     | axe limpio en **dos temas × dos tamaños**, con dos escenarios nuevos · teclado completo · `reduced-motion` con visibilidad real. **Falta el gate visual ⭐ — pendiente, ver abajo.**                                                                                     |
| **IA embebida**    | ✅     | **N/A estructural**, por ausencia verificada.                                                                                                                                                                                                                            |
| **Guía + manual**  | ✅     | `GUIA-DE-PRUEBA.html` **v4 acumulativa: 125 pruebas** (114 heredadas + 11 nuevas, ninguna eliminada) · `MANUAL-DE-USO.md` con las dos secciones nuevas y **sin una sola promesa viva**.                                                                                  |
| **Auditoría**      | ✅     | Registrada abajo. Los tres Alto, pagados.                                                                                                                                                                                                                                |

**Bundle, medido de verdad** (`.next/static`, build de producción en las dos ramas):

|                 | `main` (84324c8) | rama (da9a92a) | Δ          |
| --------------- | ---------------- | -------------- | ---------- |
| JS              | 1.870,5 KB       | 1.943,1 KB     | **+3,9 %** |
| CSS             | 35,3 KB          | 36,4 KB        | +3,0 %     |
| `static/` total | 2.304 KB         | 2.392 KB       | +3,8 %     |

Presupuesto: +10 %. Y el sprint añadió una ruta entera, un motor de estimación, un generador de
certificados y 19 iconos SVG inline.

---

## El gate ⭐ — **aplazado indefinidamente**, y lo que se hizo a cambio

**El gate no se corrió y no tiene fecha.** Es decisión explícita del usuario, tomada con el sprint
ya construido, la preview desplegada y el PR mergeado — hay otras apps en curso. Se registra aquí,
no se disimula: el ciclo H1 queda **entregado y verificado por máquina, con el visto bueno humano
sin emitir**.

**Y es la cuarta vez seguida en esta app.** Velo es el caso origen de la regla del método sobre el
diseño (`claude-design-bajo-demanda`, 2026-08-11): llegó al S2 sin que el usuario viera **un solo
artefacto visual**, con la directiva _«que no se vuelva a repetir»_. Los cuatro sprints difirieron
su ⭐ al cierre, y el cierre lo aplazó otra vez. **Un gate que compite con 90 minutos de la vida del
usuario pierde siempre**, y llamarlo «pendiente» un sprint más no lo cambia.

### El gate corto ⭐⭐ — 6 paradas · ~20 min

Construido **después** del cierre, cuando el aplazamiento pasó de «unas semanas» a indefinido. No
reemplaza al largo ni lo cancela: es **el piso**, lo que se pierde de verdad si el largo no ocurre
nunca.

El criterio no es «las más rápidas» sino **aquellas cuyo veredicto solo puede ser humano**:

| #   | Parada                              | Qué solo puede decidir una persona                                                                    |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `a4` · la aduana en reposo          | si Velo **se entiende** en 30 segundos sin saber nada                                                 |
| 2   | `i1` · los dos temas                | si el claro y el oscuro se leen **cómodos**, no solo si pasan contraste                               |
| 3   | `r5` · el eje reversible            | si se comprende, **en el momento de marcar la casilla**, que no marcarla es irreversible para siempre |
| 4   | `s2` · los tres avisos de la bóveda | si dicen **sin rodeos** que la frase no se recupera                                                   |
| 5   | `x3` · el riesgo estimado           | si un lector **distingue** una cifra exacta de una estimada — el riesgo de honestidad del S4          |
| 6   | `z1` · las cinco pantallas          | si se sienten **la misma app**                                                                        |

**Las 20 que deja fuera no se borran** —siguen enteras en el filtro ⭐— y la guía dice por qué se
van: son en su mayoría _compruébalo tú_ (recalcular la huella, la pestaña Red, el `.velo` ilegible,
el reporte sin wifi). Valen para que la confianza sea del usuario y no mía, pero **el CI ya las
verifica por otro camino**. Un recorte silencioso habría sido deuda; declarado, es un piso.

El orden de las seis **es el del recorrido real por la app** —portada → temas → eje → bóveda →
estimado → veredicto—, así que el filtro las numera 1→6 sin reordenar nada.

Lo que sí se hizo, que es todo lo exigible del lado del constructor:

- **La guía v4 lo deja listo y ordenado.** El filtro ⭐ muestra el **ciclo completo** —22 heredadas
  - 4 nuevas = **26 paradas**, numeradas 1→26 de corrido— como **un solo recorrido**, no como cuatro
    listas pegadas. Un modo «recorrido» propio, con el chip «Parada N de 26» en cada bloque.
- **La última milla, corrida antes de pedir los 90 minutos** (regla 13): las cinco rutas responden
  **200 sin sesión**, y el flujo entero funciona sobre lo desplegado — cargar → diagnosticar →
  transformar → estimar → descargar → certificar → anotar → sellar → reabrir.
- **La ⭐ `w3` hecha a máquina, para saber que se puede hacer a mano**: las dos huellas recalculadas
  **fuera de la app** con `node:crypto` sobre los archivos descargados, y encontradas en el HTML del
  certificado.
- **Pasada de capturas del builder** en los dos temas, que encontró tres defectos que ningún test ve.
- **Una ⭐ dedicada al riesgo de honestidad de este sprint**: que un lector distinga el exacto del
  estimado.

**Consecuencia asumida:** si el gate devuelve cambios de diseño de base, se pagan en un sprint de
ajuste del H2. No se cierra el ciclo fingiendo que no hay deuda visual — se cierra diciendo que el
juicio humano todavía no se ha emitido.

---

## Revisión de diseño (checklist `diseno-ui` § 4)

Corrida sobre `/bitacora` entera, el certificado en el taller, el panel del riesgo estimado — y
después de la auditoría, sobre **las cinco pantallas**, por los dos arreglos que pidió el usuario.

| Ítem                                         | Estado                                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fiel a `design-system.md`                    | ✅ **y el documento por fin es fiel al código**: el A1 de la auditoría lo encontró congelado en el S1. §3 rehecho con 5 primitivas + 16 compuestos, §4 con las tres pantallas que faltaban, §5 de 4 reglas a 7. |
| Checklist entero por **cada tema**           | ✅ claro y oscuro, en móvil y escritorio.                                                                                                                                                                       |
| Jerarquía: qué importa se ve en <3 s         | ✅ el estimado en **panel aparte**, nunca en la misma unidad visual que el exacto.                                                                                                                              |
| **Los 5 estados diseñados**                  | ✅ bitácora: sin archivo · creando la primera · abierta con N · frase incorrecta · entrada seleccionada. Certificado: el estado **«todavía no»** es una pantalla explicada, no un botón gris sin razón.         |
| Densidad y ritmo de espaciado                | ✅ **y aquí estaba el defecto que vio el usuario**: tres rieles distintos (768/896/1152) sin borde izquierdo común. Todo a `max-w-4xl`.                                                                         |
| Motion sutil y desactivable                  | ✅ `prefers-reduced-motion` con e2e de visibilidad real sobre `/bitacora`.                                                                                                                                      |
| Microcopy en español llano                   | ✅ **cero inglés residual, por fin de verdad**: `/bitacora` era la única de las cinco con el `input[type=file]` crudo, y por tanto la única mostrando «Choose File / No file chosen».                           |
| Cero anti-patrones del § 2                   | ✅ los 19 iconos son **de trazo, monocromos, `currentColor`**, nunca sustituyen al texto y van `aria-hidden`. Sin emojis como iconografía.                                                                      |
| Responsive real **360–420 y ≥1024**          | ✅ sin desplazamiento horizontal a 420 px ni a 360.                                                                                                                                                             |
| **El usuario aprobó la preview visualmente** | ⏳ **pendiente con el gate ⭐.**                                                                                                                                                                                |

---

## `/audita-sprint` — hallazgos y pagos

Dos fases, con el patrón `un-gate-de-fase-no-ve-lo-que-la-fase-no-toca` como lente principal —
porque **este es el último sprint: lo que ninguna fase miró, ya no lo mira nadie** — y las tres
preguntas de `la-composicion-de-verdades-puede-mentir` sobre cada documento con cifras.

**Cobertura de alcance:** de los diez criterios de la orden, **ocho Completo**, uno **No
implementado** (`/design-sync`, skill reservada al usuario) y uno **Parcial** (§9, frases caducadas
por promesa aplazada — de ahí salieron dos de los tres Alto).

**Tres Alto, tres pagados. Y los tres, otra vez, fuera del código del sprint** — es la tercera
auditoría final seguida que encuentra ahí sus hallazgos principales; ya no es casualidad.

| #      | Hallazgo                                                                                                                                                                                                                      | Pago                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | **`design-system.md` congelado en el S1.** Cero menciones de `taller`, `transformar`, `regreso`, `certificado`. Declaraba 5 componentes canon cuando `src/components/` tiene 21. Y prometía que lo estimado «llega en el S2». | §3 rehecho (5 primitivas + 16 compuestos por pantalla, cada uno con su archivo verificado), §4 con las tres pantallas nuevas, §5 de 4 a 7 reglas. |
| **A2** | **`CLAUDE.md` decía que la app está en el Sprint 001** y que «en S1 NO se transforma nada». Sin tocar desde el estampado.                                                                                                     | Estado as-built del H1: cuatro sprints, cinco rutas, 14 funcionalidades, con puntero al BLUEPRINT.                                                |
| **A3** | **Ningún test abría un archivo cifrado _golden_.** El sprint refactorizó la cripto del S3 a `lib/archivo-cifrado.ts`; la cabecera no cambió —leída byte a byte del diff— pero **nada lo comprobaba**.                         | `tests/unit/formato-de-archivo-cifrado.test.ts`, con un `.velo` y un `.velolog` sellados el 2026-08-15 en base64.                                 |

### Por qué A1 era el más grave, aunque no toque código

`/design-sync` —entregable de cierre de ciclo— habría publicado como _«design system consolidado»_
un documento que describe **1 de 5 pantallas**. El gate ⭐ pide juzgar el sistema entero contra él.
Y `/deploy-check` §7 exige «fidelidad a design-system.md». **La regla de diseño que este sprint
inventó no estaba escrita en ninguna parte**: vivía en un comentario y un test.

Lo bueno que también dijo el hallazgo: **los §1 y §2 —personalidad y tokens— llegaron intactos desde
el S1**. Cada token que el código usa está declarado, cuatro sprints después. **Envejeció el
inventario, no los cimientos.**

**A2 tiene la consecuencia más larga:** `CLAUDE.md` se auto-carga en **cada** sesión de este repo.
Sin ese pago, la primera sesión del H2 habría arrancado leyendo que Velo no transforma.

### El test golden, y la prueba de que sirve

Un test de regresión que no falle cuando debe no prueba nada. Se comprobó **rompiendo el formato a
propósito** —la sal de 16 bytes a 15— y midiendo quién se entera:

|                                              | Con la cabecera rota |
| -------------------------------------------- | -------------------- |
| `formato-de-archivo-cifrado.test.ts` (nuevo) | **2 en rojo** ✅     |
| `boveda.test.ts` — los 28 de ida y vuelta    | **28 en verde** ❌   |

Ese contraste **es** el hallazgo: sellar y abrir con el mismo código no puede detectar un cambio de
formato, porque el cambio se aplica a los dos lados a la vez. El archivo lo dice donde hará falta
leerlo: _si este test se pone rojo, la pregunta no es «cómo arreglo el test», es «acabo de romper
todos los archivos de los usuarios, ¿lo hago a propósito?»_

---

## Después de la auditoría — dos arreglos que pidió el usuario

Fuera del alcance del sprint, pedidos al mirar la interfaz ya construida. Se registran porque el
segundo terminó tocando el sistema de diseño.

**Los párrafos no eran el problema: eran tres rieles.** El síntoma era «el texto está demasiado a la
izquierda». La causa: la portada a `max-w-3xl`, las otras cuatro rutas a `max-w-4xl`, el encabezado y
el pie a `max-w-6xl`. **Nada compartía borde izquierdo.** Todo a `4xl`, y fuera el `max-w-prose` que
recortaba a 81 % de una columna que ya era medida de lectura.

**Un icono en cada botón, con tres reglas que no son de gusto** — y que ahora son la sexta primitiva
del design system: de **trazo y monocromos** (`currentColor`, nunca color propio, porque un icono
multicolor en el primer botón contaría una mentira sobre el producto); **el texto nunca se va**; y el
icono va `aria-hidden`.

El cambio destapó dos defectos: las etiquetas de formulario eran `inline`, así que la frase de paso
estaba pegada a su etiqueta en cuatro pantallas; y **`/bitacora` era la única de las cinco con el
`input[type=file]` crudo**, y por tanto la única con inglés a la vista. Ese texto es chrome del
navegador —sigue el idioma del NAVEGADOR, no el `lang` de la página— y no se puede traducir ni desde
CSS ni desde el pseudo-elemento `file:`. Se escondió detrás de un botón propio con el patrón ya
probado en `/regreso`, **conservando el `aria-label`**: el input sigue siendo real y navegable por
teclado, las seis referencias de los tests siguen intactas, y **cambió una sola línea de test**.

---

## Deuda declarada, con pago asignado

| Sev.      | Deuda                                                                                                                                                                                                                                                                                                                            | Pago                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Medio** | `src/lib/bitacora.ts` al **25,49 %** de sentencias y **0 % de ramas**. Pasa el umbral porque se mide sobre el agregado de `lib` (87,02 %). Cero ramas = ninguna ruta de error del store tiene test unitario, y son justo las que el usuario encuentra meses después. Cubierto por e2e: es hueco de prueba, no de comportamiento. | Primer sprint del H2                        |
| **Bajo**  | `layout.tsx` metadata no nombra el certificado ni la bitácora. No es falsa, está incompleta — y es lo que ve un buscador o un enlace compartido.                                                                                                                                                                                 | Primer sprint del H2                        |
| **Bajo**  | `next/font` con dependencia de red en tiempo de build (2 casos, heredado del S3).                                                                                                                                                                                                                                                | Primer sprint del H2, con `next/font/local` |

**Deuda del ciclo, saldada aquí:** B2 del S2 (carga duplicada en el contrato del worker, con
aserción de forma exacta para que no se repita) y `esDeLaMismaLlave` del S3 (borrada con su test —
un exportado sin llamador es lo que la regla §5 existe para impedir).

---

## Los dos entregables de cierre de ciclo

|                           | Estado                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`docs/BLUEPRINT.html`** | ✅ Abre **sin internet** (0 peticiones externas), SVG embebido, 14 filas —las 6 que dicen NINGUNO llevan su razón, no un guion—, costo real **US$0,00** con el margen de cada free tier, y el **punto único de falla: la frase de paso del usuario, y por qué no puede tener mitigación técnica**. |
| **`/design-sync`**        | ⏸ **Lo corre el usuario.** Desviación declarada: la skill tiene `disable-model-invocation` y su propio texto prohíbe replicar su flujo por otros medios. La conexión a Claude Design **se verificó funcionando** al empezar la Fase 5, como exigía el riesgo 7 del plan.                           |

### Lo que el BLUEPRINT obligó a mirar, y nadie había mirado en cuatro sprints

**Se escribió consultando cada servicio, no recordando.** Por eso apareció lo que no estaba en
ninguna cabeza: tres reglas de la ruleset que no conocía, y que el **plan Hobby de Vercel no permite
uso comercial** — un dato que no cambia nada hoy y lo cambia todo el día que Velo cobre.

---

## Lo que este sprint aprendió, dicho para el que venga

**Lo que ninguna fase toca, no lo mira nadie.** Seis fases con su gate, todas verdes, y los tres Alto
estaban en `design-system.md`, en `CLAUDE.md` y en un test que no existía. Los gates de fase miran lo
que la fase construye; **la auditoría final es lo único que mira el producto entero** — y en el
último sprint del ciclo, es la última oportunidad.

**Un documento que se congela mientras el código avanza es peor que no tenerlo.** `design-system.md`
no estaba mal escrito: estaba **desactualizado con autoridad**. Y era la entrada de dos gates
distintos. La lección operativa: todo documento que un gate consulta necesita su propia casilla de
«¿sigue siendo cierto?» en la auditoría, no solo el código.

**Sellar y abrir con el mismo código no prueba el formato.** Es la trampa de verificación más
silenciosa del ciclo: 28 tests verdes con la cabecera rota. La única defensa es un archivo _golden_
sellado en el pasado — y la única forma de saber que sirve es romperlo a propósito y ver quién grita.

**Una queja de usuario rara vez nombra su causa.** «Los párrafos están muy a la izquierda» era «hay
tres rieles distintos y nada comparte borde izquierdo». Arreglar el síntoma habría movido párrafos;
mirar la causa alineó las cinco pantallas.

**Y la que solo se ve dibujando:** cinco defectos de maquetación del SVG del BLUEPRINT —texto
saliéndose de sus cajas— no los encuentra ningún linter ni ningún test. Se encontraron renderizando
el documento y **mirándolo**.

---

## Cierre del ciclo H1

Cuatro sprints, cinco rutas, **14 funcionalidades** de las 22 de la VISION. Velo **ve** (S1),
**transforma** (S2), **devuelve** (S3) y **deja constancia** (S4).

La tesis del brief —_«el mercado hace la mitad del viaje»_— dejó de ser una promesa: hay una
herramienta 100 % navegador, con round-trip, localizada para Colombia y con certificado verificable
desde fuera. **Y sin una sola línea de IA generativa**, comprobado por ausencia en cada commit.

**Lo que falta para dar el ciclo por cerrado del todo:** el gate ⭐ del usuario (26 paradas) y
`/design-sync`. Ambos son suyos, y ambos están listos para correrse.
