---
app: anonimizador
sprint: 002
titulo: "El disfraz — Velo transforma, y lo demuestra"
branch: sprint-002/el-disfraz
pr: 4
cerrado: 2026-08-11
---

# Sprint 002 · El disfraz — resumen

**Velo ya actúa.** Se elige qué se le hace a cada columna —o se aplica **Habeas Data** o **HIPAA
Safe Harbor** de un clic—, se ve el antes y el después, y se descarga el archivo tratado con un
documento que dice **qué se le hizo**. Todo en la pestaña, sin servidor, y con el mismo resultado
byte por byte cada vez que se repita con la misma política y la misma llave.

Lo que **no** hace es la vuelta: un seudónimo de hoy es irreversible a propósito, porque la bóveda
que guarda la correspondencia es del S3. Está dicho en la portada, en el manual y en el README —
después de que la auditoría del cierre descubriera que los tres seguían anunciando el alcance del
sprint pasado.

13 commits · 58 archivos · +10.457 / −167 líneas.

---

## Lo que quedó en `main`

| Pieza                           | Qué es                                                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El taller** (`/transformar`)  | Seis pasos en secuencia —política, llave, vista previa, balance, archivo, documento—, cada uno apareciendo cuando el anterior tiene sentido.                                                                                                                               |
| **Motor de políticas**          | Una política es un documento con **hash SHA-256** como identidad: mismo hash ⇒ mismo tratamiento. Se exporta e importa como archivo, jamás a `localStorage` (lleva nombres de columna del usuario).                                                                        |
| **Las dos de fábrica**          | **Habeas Data** (Ley 1581 + Decreto 1377, técnicas de la guía AGN+SIC) y **HIPAA Safe Harbor** (45 CFR §164.514(b)(2)), cada una **citando su fuente** y declarando cuántos de sus puntos reconoce Velo solo, cuántos por el nombre y cuántos tiene que marcar el usuario. |
| **Cuatro familias de técnicas** | Enmascarar · seudonimizar (HMAC-SHA256, llave por PBKDF2-600k) · seudonimizar **conservando el formato**, con el dígito de verificación oficial recalculado · generalizar (rango, fecha, prefijo) · suprimir.                                                              |
| **Mondrian**                    | k-anonimato greedy (LeFevre et al., ICDE 2006) sobre las columnas marcadas, con **l-diversity** y **t-closeness** medidas y reportadas. 500k × 8 QIs en **1,4 s**.                                                                                                         |
| **El balance**                  | El antes y el después con el motor de riesgo del S1 corrido dos veces, y **la regla de honestidad metida en el tipo**, no en la pantalla.                                                                                                                                  |
| **El archivo y su documento**   | CSV con cinco reglas declaradas (coma, `\n`, sin BOM), escrito por el navegador en trozos, más el reporte del tratamiento.                                                                                                                                                 |

---

## Las reglas duras, como gate mecánico

| Regla                          | Cómo se blinda                                                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cero IA generativa**         | Gate `anti-ia` sobre `package.json` **y lockfile**. Cero dependencias nuevas en todo el sprint: HMAC, PBKDF2 y AES son Web Crypto nativo (ADR-004 lo midió antes de decidir).                                                                                                |
| **Los datos jamás salen**      | E2e que intercepta **toda** la red durante el flujo completo **incluida la transformación y la descarga**. Y la frontera del ADR-005: el worker construye el `Blob`, la página lo convierte en URL y **su referencia se pierde ahí** — no es que no lo lea, es que no puede. |
| **Determinismo byte-idéntico** | Dos corridas ⇒ mismo SHA-256 del archivo de salida. Y **la otra dirección**: llave distinta ⇒ salida distinta, k distinto ⇒ archivo distinto. Sin ella, un HMAC que devolviera una constante pasaría la primera.                                                             |
| **Honestidad medida**          | Ver abajo: es donde el sprint casi se cae.                                                                                                                                                                                                                                   |
| **Ni un dato real**            | Todo del generador sintético seeded. El perfil nuevo `mediana-repetida` se añadió **sin tocar el hash del fixture del S1**, verificado contra `HEAD~1`.                                                                                                                      |
| **La llave, núcleo de UX**     | La frase entra al worker y no vuelve a salir; a la página llega una huella de 12 hex que es el HMAC de una constante. Test dedicado: la frase no aparece en el estado publicado.                                                                                             |

---

## Definition of Done (6+1)

| Estándar           | Estado | Evidencia                                                                                                                                                                                                            |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Testing**        | ✅     | **541 unitarias** (98,5 % sentencias · 93,9 % ramas; motor y `lib` por encima del 80 % exigido) + **70 e2e**, 2 saltadas por diseño y declaradas.                                                                    |
| **CI/CD**          | ✅     | Los cuatro jobs verdes y requeridos en la ruleset. El job `lighthouse` se desdobló (una colección, dos asserts) y **nació con su demo en rojo**, registrada con su salida literal.                                   |
| **Determinismo**   | ✅     | `determinismo-transformacion.test.ts`, en las dos direcciones.                                                                                                                                                       |
| **Observabilidad** | ✅     | El sanitizador de `reportError` se amplió a **política y llave** en el mismo commit en que nacieron los tipos.                                                                                                       |
| **Seguridad**      | ✅     | `pnpm audit` limpio · doble cinturón gitleaks activo en cada commit del sprint · CSP sin `unsafe-eval` (y Zod configurado `jitless` para no violarla).                                                               |
| **Performance**    | ✅     | Lighthouse móvil: `/` **93 · 100 · 100 · 100** · `/transformar` **91 · 100 · 100 · 100**. Presupuesto de `perf-budget.json` en verde en las dos rutas.                                                               |
| **UX + A11y**      | ⏳     | axe limpio en **dos temas × dos tamaños** · teclado completo en la tabla editable · `prefers-reduced-motion` con e2e que mide **opacidad calculada**. **Falta el gate visual ⭐ del usuario — diferido, ver abajo.** |
| **IA embebida**    | ✅     | **N/A estructural**, por ausencia verificada.                                                                                                                                                                        |
| **Guía + manual**  | ✅     | `docs/GUIA-DE-PRUEBA.html` **v2 acumulativa: 82 pruebas** (44 heredadas + 38 nuevas, ninguna eliminada) · `docs/MANUAL-DE-USO.md` · `README.md`.                                                                     |
| **Auditoría**      | ✅     | Registrada abajo.                                                                                                                                                                                                    |

---

## El gate ⭐ — **diferido**, y qué significa que lo esté

El gate ⭐ de este sprint **no se corrió**: se acumula al del sprint de cierre, que es el default del
método v1.12.0. La guía v2 lo refleja donde importa: **el filtro ⭐ muestra el acumulado del ciclo**
—las 8 del S1 más las 6 del S2, **14 pruebas, ~40 minutos**—, no solo lo nuevo. Una ⭐ diferida que
desaparece del filtro es una prueba perdida.

Los **dos contrapesos mecánicos** que el método exige a cambio se cumplieron y no son opcionales:
la **pasada de capturas** (cada bloque leído como imagen, animaciones cuadro a cuadro) y el **e2e de
`reduced-motion`** con aserción de visibilidad real. La pasada de capturas encontró tres cosas que
ningún test veía, y una de ellas era un defecto de producto (ver auditoría).

**Y una consecuencia que el S3 tiene que presupuestar.** Al cerrar la Fase 5 el usuario preguntó por
qué en ningún momento se le pidió aprobar el diseño. La respuesta de proceso es correcta —el
`design-system.md` nació en el S1, la orden del S2 lo declara base cerrada, y el gate visual está
diferido— y es **incompleta**: la personalidad, la metáfora rectora, la paleta y la tipografía las
decidió el builder solo, y llevan **dos sprints de UI encima sin que el usuario las haya visto**. El
diferimiento explica por qué no se pidió el gate _en el cierre_; no explica por qué no se mostró
antes, que se podía hacer cualquier día sin gastar el ⭐.

Decisión del usuario: **no se corrige en este sprint**, y el ajuste al método lo hace la planeadora.
Lo que queda anotado para el S3: **el gate ⭐ del cierre no será la primera revisión de las pantallas
nuevas — será la primera vez que el usuario juzga el sistema de diseño entero.** Si algo de la base
no convence, la corrección alcanza a las once pantallas del ciclo, no a las cinco de este sprint.

---

## `/audita-sprint` — hallazgos y pagos

Dos fases, con las **tres preguntas del patrón** `la-composicion-de-verdades-puede-mentir` puestas
sobre cada pantalla y cada documento que afirma cifras. **Tres hallazgos Alto, tres Medio, dos
Bajo.** Ninguno es un cálculo equivocado: **los tres Alto son composición** — exactamente lo que el
patrón predice, y lo que 519 pruebas verdes no podían ver. Los dos primeros se confirmaron con una
**sonda desechable antes** de escribir una línea de arreglo.

| #      | Hallazgo                                                                                                                                                                                                                                    | Pago                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A1** | El editor pintaba `kObjetivo ?? 5` mientras la política guardaba `null`, y prometía en futuro un reparto que el motor no hacía: **las columnas salían intactas** y `pendientesDeMondrian` las registraba sin llegar al balance.             | Elegir la opción **fija el k en la política**. Y si aun así falta —una política importada puede traerlo—, salvedad **descalificante** `reparto-sin-k`, delante de «quedan únicos» porque explica de dónde salen.               |
| **A2** | El reporte del tratamiento **existía, estaba probado y no lo llamaba nadie**: 6 de los 9 campos del resultado no tenían consumidor. El usuario se llevaba el CSV anonimizado y el único documento a mano describía el archivo **original**. | Cableado en `/transformar`, con e2e que lo lee dentro del `iframe`. Y la trampa heredada que el arreglo destapó: la huella SHA-256 del reporte es **la del archivo que entró** — ahora el documento lo dice con esas palabras. |
| **A3** | La muestra decidía **por columna** una regla que es **del valor**: las filas que una generalización deja intactas salían **completas** porque una vecina había cambiado. En una columna del art. 5, eso es un dato sensible en claro.       | La comparación pasa al par. La función se mudó a `src/engine/muestra.ts`, donde sí se puede probar — en el worker no la miraba nadie.                                                                                          |
| **M1** | «N de M columnas cambian» salía de **6 filas** y se leía como cifra exacta; y una columna sensible que cambiara fuera de esas 6 se escondía como intacta.                                                                                   | Se mide el archivo entero, **cortando en la primera diferencia**.                                                                                                                                                              |
| **B1** | Los 8 caracteres del nombre del archivo son el hash de la política, y eso estaba en el código y en ningún texto.                                                                                                                            | Dicho en pantalla; el hash completo va en el reporte.                                                                                                                                                                          |
| **M2** | La **sal no viaja con la política**: repetir los seudónimos el mes que viene depende de un copiar-pegar.                                                                                                                                    | **Deuda declarada · pago en el S3**, con la bóveda. Documentado en el manual.                                                                                                                                                  |
| **B2** | `mondrian`, `diversidad` y `colisiones` cruzan la frontera **y además** vienen plegados en `balance.salvedades`.                                                                                                                            | **Deuda declarada · pago en el S3**, cuando el certificado obligue a revisar qué necesita cada consumidor.                                                                                                                     |

**Y dos hallazgos tardíos, fuera de la auditoría formal**, que valen tanto como los de dentro:

- **Escribir la guía obligó a releer la portada, y decía «Todavía no transforma el archivo».** El
  manual y el README llevaban la misma frase. El texto más leído de la app describía el sprint
  pasado. La auditoría no lo cazó porque miró lo que el S2 **construyó**, no lo que el S2 dejó
  **caduco**.
- **El `/deploy-check` corrió el e2e en local (con `retries: 0`) y tres pruebas se pasaron de 30 s.**
  El `timeout: 180_000` estaba en `webServer`, no en las pruebas, que usaban el default de
  Playwright. En CI no se veía porque `retries: 2` las reintentaba: **el gate dependía de sus
  propios reintentos para taparse.**

---

## Decisiones registradas

- **ADR-004 · HMAC con Web Crypto.** El spike midió en el navegador `crypto.subtle` en lotes contra
  un HMAC síncrono sobre el `Sha256` que ya existía, y verificó que las dos dan el mismo digest
  antes de elegir. La orden decía «Web Crypto»; el ADR es la forma que la propia orden señala para
  desviarse, y aquí confirmó la orden con números.
- **ADR-005 · La frontera y la descarga.** El `Blob` como **asa opaca**: la página recibe una cadena,
  no un objeto sobre el que se pudiera llamar `.text()`. Incluye el descarte razonado de la File
  System Access API (ausente en Firefox y Safari).
- **FPE sigue prohibido** (FF3 roto, NIST en flux): el formato se preserva con HMAC → dígitos → DV
  oficial recalculado, y el código dice por qué.
- **`.xlsx` de salida, fuera de alcance con su razón:** un `.xlsx` es un zip y sus entradas llevan
  fecha, así que un archivo byte-idéntico exigiría fijar timestamps dentro de SheetJS. El CSV sí
  puede cumplir la promesa.

---

## Deuda técnica declarada

| Deuda                                                                                                                              | Pago                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| La sal no viaja con la política exportada (M2)                                                                                     | S3, con la bóveda                                             |
| Carga duplicada en el contrato del worker (B2)                                                                                     | S3                                                            |
| **Lighthouse mide `/transformar` VACÍA** — sin archivo no hay editor ni 24 desplegables, así que el gate nunca ve el estado pesado | Declarado; medirlo exigiría que Lighthouse cargara un archivo |
| El e2e de 500k corre en un solo proyecto (`desktop-chromium`)                                                                      | Declarado, igual que en el S1 y por la misma razón            |
| **Deployment Protection sigue apagada** (heredado del S1): la preview responde 200 sin sesión                                      | Decisión del usuario                                          |

---

## Para el gate ⭐ del ciclo (S3)

- **Preview:** https://app-anonimizador-git-sprint-002-el-disfraz-mauricio-rincon.vercel.app
- **Guía:** `docs/GUIA-DE-PRUEBA.html` — filtro **«Gate mínimo ⭐ del ciclo»**: **14 pruebas, ~40
  min**. Entró solo lo que ninguna automatización puede verificar: el juicio sobre el lenguaje y el
  diseño, el peso relativo entre la advertencia y la cifra en el balance, el segundo que tarda la
  llave, el archivo tratado abierto **en tu propia hoja de cálculo**, el reporte abierto **con el
  wifi apagado**, y si el taller a 500k **se siente** fluido.

---

## Sugerencias de mejora al método

1. **El cierre necesita una casilla de «qué frases caducaron».** Una feature nueva no solo añade
   pantallas: **vuelve falsas afirmaciones de las viejas**. La portada, el manual y el README de
   Velo anunciaban «todavía no transforma» en el sprint que transformó, y ni la auditoría de dos
   fases lo cazó, porque auditó lo construido. La pregunta —_¿qué afirmaba la app antes que ya no es
   cierto?_— es barata y no está en ninguna checklist.
2. **Un motor probado no es un producto probado.** Dos de los tres hallazgos Alto tenían el motor
   perfecto y el cable suelto: A1 tenía la salvedad bien construida sobre una entrada que nadie le
   pasaba; A2 tenía el documento entero escrito y probado **sin un solo llamador**. Vale la pena una
   comprobación mecánica de **campos del contrato sin consumidor** — habría encontrado A2 en
   segundos: 6 de 9 campos huérfanos.
3. **Un gate con reintentos puede estar tapándose a sí mismo.** El e2e pasaba en CI porque
   `retries: 2` reintentaba lo que un timeout mal puesto rompía. Merece la pena que el CI **reporte
   los reintentos** en vez de solo el verde final: un suite que necesita su segundo intento está
   avisando de algo.
4. **La verificación tiene que ser el comando del CI, no uno parecido.** Verifiqué la Fase 5 con
   `vitest run` en vez de `pnpm test`, leí el porcentaje global —cierto— y no las cuatro líneas de
   ERROR por glob que venían después. El CI se puso rojo con las 502 pruebas en verde.
