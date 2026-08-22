---
entrega: brochure-conoce
app: anonimizador (Velo)
tipo: entrega puntual (no es sprint — orden ENTREGA-BROCHURE de la planeadora, kit v1.19.0)
estado: construida y verificada en local (740 unit · 137 e2e · typecheck · lint · build). Falta CI verde en el PR → **sala de proyección del usuario sobre la preview** → merge → última milla.
fecha: 2026-08-21
rama: entrega/brochure-conoce
---

# Entrega puntual — El brochure vivo de Velo (`/conoce`) · Summary

> Lo que la casa planeadora necesita para registrar el **cierre 1 de Velo — el acto de
> construcción** como COMPLETO. El acto 2 (el sello: gate ⭐⭐ de 6 paradas → brochure SELLADO)
> queda a ritmo del usuario y esta entrega no lo espera.

## Qué se entregó

1. **`docs/BROCHURE.html`** — el brochure canónico, autocontenido: cero CDNs, cero `fetch`, cero
   `src`/`href` externos. Abre con doble clic sin internet, en claro y en oscuro. **98.330 bytes**
   (el piloto del pipeline: 122 KB).
2. **Ruta pública `/conoce`** sirviendo ese mismo archivo, por el mecanismo probado en habla:
   `scripts/copiar-brochure.mjs` lo copia a `public/conoce.html` encadenado en `dev` y `build`
   (la copia va gitignorada) y un `rewrites` de `next.config.ts` le da la ruta limpia. La CSP
   actual lo sirve sin tocarla.
3. **`docs/brochure-export.json`** — la ficha para la vitrina, adoptando el **contrato
   `brochure-export` v1.0.0** del portafolio.
4. **`sprints/ENTREGA-brochure-storyboard.md`** — el guion aprobado, en el repo como contrato
   versionado de la pieza.
5. **Dos gates nuevos**: `tests/unit/brochure-export.test.ts` (el contrato) y
   `tests/e2e/conoce.spec.ts` (20 pruebas, incluida la de reduced-motion obligatoria).
6. **Fase 0 — barrido de cero enlaces**, con las reglas 13 y 14 incorporadas al `CLAUDE.md`.

## Fase 0 — registro del barrido

El inventario de la orden decía 8 fugas y el grep encontró **exactamente esas 8**: el repositorio
no se había movido desde el barrido de la planeadora. (Lección de ds registrada igual: el
inventario es punto de partida, **el gate es el comando**.)

| #   | Dónde                          | Qué quedó                                                                                  |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | `README.md:11`                 | El enlace de producción sale; entra el brochure como contenido y un CTA de lista de espera |
| 2   | `SPRINT_001-summary.md:124`    | «no se publica en el repositorio (registro privado en la orden de la planeadora)»          |
| 3   | `SPRINT_002-summary.md:167`    | Ídem                                                                                       |
| 4   | `docs/BLUEPRINT.html:327`      | Texto del SVG → «subdominio \*.vercel.app (registro privado)»                              |
| 5   | `docs/BLUEPRINT.html:638-639`  | Ancla retirada; texto sin URL                                                              |
| 6   | `docs/BLUEPRINT.html:769`      | Ídem, sin el subdominio literal                                                            |
| 7   | `docs/GUIA-DE-PRUEBA.html:450` | La caja de URL se vacía: la dirección la entrega la orden, y se llena EN USO               |
| 8   | Campo `homepage` del repo      | `gh repo edit … --homepage ""` → `homepageUrl: ""`                                         |

**Verificación:** el grep de la orden sale vacío y `gh repo view --json homepageUrl` devuelve `""`.
Lo único que queda con la cadena `vercel.app` es el patrón genérico sin dirección del BLUEPRINT,
que es el reemplazo aprobado.

> ⚠️ **Limpieza RECURRENTE, no puntual.** La GitHub App de Vercel **reescribe el campo `homepage`
> tras cada deploy de producción** (confirmado en vivo en habla). Se limpió aquí, hay que
> **re-limpiarlo tras el deploy del merge**, y volverá a ensuciarse con cada deploy futuro a
> `main`. No hay interruptor en la API y automatizarlo exigiría un PAT de administración como
> secret en un repo público — descartado. Queda declarado como tarea recurrente del cierre de
> cada sprint que despliegue.

Además, el gate de honestidad medida (`tests/unit/copy.test.ts`) **ahora barre también el
brochure**: es el documento más público del repositorio y donde el impulso de vender aprieta más.

## La regla de conteo — N = 14, con su tabla de mapeo

El pie del brochure declara **14 funcionalidades** y el export declara el mismo 14; hay un test
que falla si se desincronizan. Contadas contra `docs/MANUAL-DE-USO.md`:

| Tarjeta del brochure                          | Funcionalidad                                        | Sección del manual                          |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| 1 · **Mira lo que te delata**                 | C1 · Carga de CSV y Excel, arrastre y teclado        | 1. Trae tu tabla                            |
|                                               | C2 · Detección por columna, Ley 1581 + 3 certezas    | 2. Lee el diagnóstico · Columna por columna |
|                                               | C13 · Reporte autocontenido con huella SHA-256       | 3. Llévate el reporte                       |
| 2 · **Decide qué se le hace**                 | C3 · Política por columna, exportable                | 4. El taller · La política                  |
|                                               | C14 · Habeas Data y HIPAA Safe Harbor                | 4. El taller · La política                  |
| 3 · **Vela con exactitud**                    | C4 · Cuatro familias de técnicas                     | 4. El taller · Antes y después              |
|                                               | C10 · Formato conservado y DV recalculado            | 4. El taller · La política                  |
|                                               | C9 · Seudónimos estables entre entregas              | 4. El taller · La llave                     |
| 4 · **Mide el riesgo de verdad**              | C5 · k-anonimato con Mondrian + consejero            | 2. El consejero de cruces                   |
|                                               | C6 · Riesgo exacto y estimado, separados             | 4. El taller · El riesgo estimado           |
|                                               | C7 · Balance antes/después con la advertencia arriba | 4. El taller · Antes y después              |
| 5 · **Entrega, recupera, deja constancia** ⭐ | C8 · La bóveda cifrada y el regreso ⭐⭐             | 5. La bóveda · 6. El regreso                |
|                                               | C11 · Certificado con las dos huellas                | 4. El taller · El certificado               |
|                                               | C12 · Bitácora cifrada                               | 7. La bitácora                              |

**3 + 2 + 3 + 3 + 3 = 14 / 14.** Agrupar sí, omitir jamás.

**Qué NO cuenta, y por qué:**

- **Los 4 diferenciadores B1–B4 de la VISION** — son identidad transversal (cero IA, todo en el
  navegador, determinismo, honestidad medida), no funcionalidades. Aparecen en la pieza donde
  corresponde: E06 (la frontera), E07 (el determinismo) y el acordeón «Lo que Velo NO afirma».
- **Las 8 del roadmap H2** — no existen. Contarlas sería contar promesas.
- **El propio brochure, la ruta `/conoce` y el export** — documentan la app; no se documentan a sí
  mismos. Tampoco entran al manual.

## Decisiones de la pieza

- **Dial `MOTION_INTENSITY` = «documento sereno».** Desplazamientos cortos (≤18 px), curvas del
  design-system, cero rebote, y **un solo loop en toda la pieza** — el del clímax. Es «bóveda
  serena» hecho motion.
- **El riesgo registrado: la portada abre con datos, no con un eslogan.** Una mini-tabla sintética
  se vela sola al cargar, con las tres técnicas visibles a la vez (seudonimizar, suprimir,
  generalizar). Un brochure que abre con una tabla es raro; pero la tabla es la protagonista del
  producto y verla velarse **es** la promesa. Va al gate visual.
- **La estrella va última, y es una desviación declarada al molde** («la estrella primera»). El
  regreso no se entiende sin haber entendido velar: el viaje es el argumento y su orden es la
  jerarquía. La estrella no pierde trono — se lleva el clímax entero (E07), con escena propia y
  texto visible.
- **Tipografía, trade-off declarado:** Fraunces, IBM Plex Sans y IBM Plex Mono no viajan en un
  autocontenido. Display = Georgia, cuerpo = system-ui, cifras y etiquetas = ui-monospace, que
  conserva el acento tipográfico real de la app (la clase `etiqueta`). Los tokens de color se
  copiaron de `design-system.md` con sus valores exactos, en claro y oscuro.
- **Sin iconos de nube ni de servidor en E06.** El storyboard los proponía tachados; el
  design-system los veta de plano («nada que sugiera subida ni nube»). La lámina muestra la
  **frontera** y deja el otro lado vacío, con los destinos solo nombrados en texto. El mensaje
  sale más fuerte y la regla queda intacta.
- **El NIT en vez de la cédula para demostrar C10.** La cédula colombiana no tiene dígito de
  verificación público —lo dice el propio validador del repo— así que demostrar «el DV se
  recalcula» con una cédula habría sido una maqueta que miente. El NIT del ejemplo lleva su DV
  real, calculado con el mod 11 de la DIAN.
- **Las tarjetas no se abren solas.** El molde lo permite y la primera llegó a hacerlo como
  invitación; se quitó al releer el criterio 3 de la orden y, sobre todo, el copy de la propia
  portada: _«cada tarjeta se abre solo si tú quieres»_. Hay un e2e que recorre la página entera y
  falla si alguna se abrió sin que la tocaran.

## Lo que solo se vio MIRANDO — la pasada de capturas

Cuatro defectos que ningún gate automático habría cazado, todos encontrados leyendo las capturas
como imagen y las animaciones cuadro a cuadro:

1. **El respiro (E05) no tenía espera.** El velo empezaba a cruzar en el primer frame, así que el
   NIT original nunca se llegaba a leer: una transformación cuyo punto de partida nadie vio no
   cuenta nada. Se añadió un cuarto de ciclo de reposo.
2. **Los cruces de valores se leían como un borrón.** Dos cifras monoespaciadas del mismo largo a
   media opacidad, en la misma celda, se superponen. Velar y desvelar pasaron a ir **en serie** —
   uno se apaga entero antes de que el otro encienda— en la portada y en el clímax.
3. **Las flechas de E06 leían como conexiones.** Llegaban enteras hasta la frontera y el ojo
   completaba el trayecto: la lámina contaba justo lo contrario del texto de al lado. Ahora el
   trazo se desvanece antes del borde.
4. **Las filas que el tercero reordena se atravesaban.** Se apagan para cruzarse.

Y una que sí cazó un gate, pero no el que se esperaba: **el sello del margen era invisible al
principio del recorrido** (nace en cero por diseño), y la frase quedaba huérfana. Se le puso un
anillo de fondo tenue: ahora el sello está desde el primer frame y lo que ocurre al leer es que
**se completa**.

## Hallazgos de accesibilidad (axe, en los dos temas, con todo abierto)

- **Faltaba el landmark `<main>`.** Corregido; el pie queda fuera para conservar su `contentinfo`.
- **`.chip-boveda` daba 3,27:1** en claro y 3,63:1 en oscuro: bajaba de opacidad dentro del ciclo
  del clímax y usaba `--tinta-tenue`. Pasó a `--tinta-suave` con un piso de opacidad más alto.
- **El pie se leía «1414 funcionalidades»**: el número accesible y el visible estaban partidos.
  Ahora la frase entera va dos veces —una para el lector de pantalla con el número completo desde
  el primer byte, otra a la vista con la cifra que se cuenta sola.
- **El sello del margen entero fuera del árbol de accesibilidad**: su frase se oía duplicada con la
  del pie, que es la que lleva la promesa de verdad.

## El export y su test, demostrado en rojo primero

`docs/brochure-export.json` adopta el contrato v1.0.0: `_schema` copiado tal cual, `estado:
"inicial"` con `sellado_en: null`, **12 métricas cada una con su `fuente`**, y `enlaces.produccion:
null` con la razón de lista de espera. La privacidad se **tradujo, no se calcó**: no lleva el
`local_only` del ejemplo —Velo se sirve de la web; lo local son los datos— sino
`red_saliente_con_datos`, `datos_persisten_en_servidor` y `usa_ia`, que son los tres que Velo puede
afirmar con verdad. El export se generó **de último**, con las cifras medidas al momento.

El test del contrato se demostró rojo en sus cuatro afirmaciones antes de dejarlo verde:

| Se rompió a propósito                    | Qué falló                             |
| ---------------------------------------- | ------------------------------------- |
| `total` = 15 con 14 features listadas    | la suma **y** el conteo del pie       |
| una métrica con `fuente: "segun-parece"` | la procedencia válida                 |
| `enlaces.produccion` con una URL         | el barrido de cero enlaces (regla 14) |
| 13 features y `total` = 13               | el pie del brochure contra la ficha   |

## Verificación

| Comprobación                                  | Resultado                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                   | **740 pruebas** en 42 archivos (1 archivo y 1 prueba omitidos por diseño) · cobertura de líneas 96,17 % |
| `pnpm test:e2e`                               | **137 pruebas** (3 omitidas), 20 de ellas de `/conoce`                                                  |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | limpios                                                                                                 |
| `pnpm gate:anti-ia`                           | cero SDKs de IA generativa                                                                              |
| Barrido de cero enlaces + `homepageUrl`       | vacío · `""`                                                                                            |
| Frases prohibidas en la pieza                 | ninguna (el gate de honestidad ya barre el brochure)                                                    |
| Datos reales                                  | ninguno: todos los valores son sintéticos e inventados aquí                                             |
| Abre con doble clic sin internet              | sí, en claro y en oscuro                                                                                |
| Impacto en el bundle de la app                | **cero** — el brochure es un archivo estático; lo único que cambia en el código es un `rewrites`        |

## Deuda declarada

- **Los enlaces del mapa son relativos a la raíz** (`/diagnostico`, `/regreso`…), que es lo
  correcto para la ruta servida y lo que verifica el e2e. Abierto como archivo con doble clic, esos
  enlaces no llevan a ninguna parte: el documento sigue siendo legible y completo, pero no
  navegable hacia la app. Es el precio de tener una sola fuente para las dos vidas, y se acepta.
- **La limpieza del campo `homepage` es recurrente** (arriba, fase 0). Vuelve a ensuciarse con cada
  deploy a `main`.
- **`eslint.config.mjs` ganó tres ignorados** (`.ds-sync/`, `ds-bundle/`, `public/conoce.html`). Los
  dos primeros son andamiaje de `/design-sync` que dejaba `pnpm lint` inservible en local con 14
  errores de reglas de hooks sobre el React empaquetado del bundle; en la CI nunca se vio porque
  están gitignorados y el runner arranca de un checkout limpio.

## Lo que falta, y es del usuario

1. **CI verde en el PR** — cada check requerido con conclusión propia `success`.
2. **La sala de proyección**: el gate visual sobre la preview, en rondas y no en sí/no. Lo primero
   que conviene juzgar es el riesgo registrado (la portada que abre con una tabla) y si el clímax
   se siente como el clímax.
3. **Merge**, y después: probar `/conoce` de producción **desde afuera y sin sesión**, y
   **re-limpiar el campo `homepage`** que el deploy habrá vuelto a llenar.
4. Más adelante y sin fecha: el **gate ⭐⭐ de 6 paradas**. Cuando cierre, el brochure pasa de
   **INICIAL a SELLADO** — se cambia el chip de la cabecera, `app.estado` y `sellado_en` en el
   export, y se añade la línea al historial del pie.
