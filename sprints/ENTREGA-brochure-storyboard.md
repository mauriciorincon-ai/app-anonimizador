---
id: pieza-brochure-velo-storyboard
titulo: Storyboard — El brochure vivo de Velo («El viaje de ida y vuelta»)
arquetipo: app
elemento_tipo: entregable
rigor: completo
capa: producto
version: 1.0.0
fecha: 2026-08-21
estado: aprobado # el usuario aprobó el guion el 2026-08-21 y dio el «construye»
objetivo: "El viaje de la aduana contado con motion sobrio: todo lo que aparece se desvela, todo dato que se muestra se vela — y nada cruza el borde."
depende_de: [SPRINT_004-summary.md]
relacionado_con:
  [docs/BROCHURE.html, docs/brochure-export.json, design-system.md]
tags: [pieza, storyboard, brochure, entrega]
---

# Storyboard — El brochure vivo de Velo

> **El contrato de la regla cero.** Sin este documento aprobado no se toca el HTML. Si el
> usuario no reconoce aquí su idea, se corrige **aquí** — el punto más barato de la pieza.
> Cobertura: **todos los mensajes del brochure (10/10)** y **todas las funcionalidades
> (14/14)** — agrupar sí, omitir jamás.

## La narrativa

Alguien tiene que mandar una tabla afuera —a una IA, a un proveedor, a un consultor— y sabe
que dentro van personas. Abre el brochure. Lo primero que ve **no es un eslogan: son sus
datos**, o unos que se les parecen mucho — y se velan delante de él, uno a uno, antes de que
termine de leer el titular. La promesa no se anuncia: se demuestra en la primera pantalla.

De ahí baja por el viaje que hará en la app: mirar lo que delata, decidir qué se le hace,
velar con exactitud, medir el riesgo de verdad. En el margen, mientras lee, **el sello de
Velo se va dibujando**: la confianza no se declara, se completa leyendo.

Antes del final baja la voz para decir lo que casi nadie dice — que nada ha salido, que hay
una frontera y que se puede comprobar. Y entonces llega el clímax: **el círculo completo**.
El archivo velado cruza la frontera, el tercero trabaja, el archivo vuelve, y en su mesa los
originales se desvelan mientras el trabajo del tercero se queda. Una y otra vez, idéntico,
porque es determinista. Eso es lo que nadie más hace.

Cierra con la letra pequeña dicha con dignidad —qué NO afirma— y con el **14** contándose
solo junto al sello ya cerrado.

## Cabecera de la pieza

### Dial `MOTION_INTENSITY` = **«documento sereno»**

Coreografía sobria y constante: desplazamientos cortos (≤18 px), curvas del design-system,
**cero rebote**. El drama se concentra en UNA escena —el clímax, la única con loop—. Es
«bóveda serena» hecho motion: precisión y confianza sin frialdad clínica. Un documento vivo,
no un show.

### Identidad en una frase

> **«La página hace lo que el producto hace: todo lo que aparece se desvela, todo dato que se
> muestra se vela — y nada cruza el borde.»**

El reveal del scroll **es** desvelar. Todo dato de ejemplo va velado y es sintético.

### El riesgo registrado

**La portada abre con DATOS, no con un eslogan.** Bajo el titular hay una mini-tabla
sintética (cédula · nombre · diagnóstico) cuyos valores **se velan solos** al cargar. Un
brochure que abre con una tabla es raro; pero la tabla es la protagonista del producto, y
verla velarse **es** la promesa. Se juzga en la sala de proyección.

### Excepciones declaradas a solo-`transform`/`opacity`

1. **`grid-template-rows`** en la apertura de tarjeta — un disparo por clic.
2. **`stroke-dashoffset`** para **dibujar** iconos de trazo y el anillo del sello — SVG
   decorativo `aria-hidden`, un disparo (el anillo, mapeado a scroll).
3. **`filter: blur(3px→0)`** al **enfocar** el titular — solo en apertura, jamás en scroll, y
   con **opacidad siempre 1** (el LCP nace pintado).

### Motion-system de la pieza (derivado del design-system)

- **Curvas:** `--curva: cubic-bezier(0.2, 0, 0, 1)` (la del DS) · `--asentar: cubic-bezier(0.22, 1, 0.36, 1)`.
- **Duraciones:** las del DS (150 / 220 / 320 ms) + escala de escena `--dur-escena: 600ms` ·
  `--dur-viaje: 2.6s` (clímax).
- **Vocabulario:** _velar_ (el valor se cubre) · _desvelar_ (aparece) · _alzar_ (sube y se
  asienta) · _dibujar_ (el trazo se completa) · _viajar_ (cruza la frontera) · _sellar_ (el
  anillo se cierra).
- **Stagger con jerarquía**, jamás uniforme.

### Tipografía (trade-off declarado del molde)

Fraunces no viaja en un archivo autocontenido. Display = **Georgia/serif** (pariente visual
de Fraunces) · cuerpo = **system-ui** · cifras y etiquetas = **ui-monospace** (el acento
tipográfico de Velo: la clase `etiqueta` se replica). Tokens de color copiados de
`design-system.md` (papel/tinta/acento/bordes, claro **y** oscuro vía `prefers-color-scheme`;
separación por borde, no por sombra). El brochure no lleva selector de tema — Velo tampoco lo
tiene: coherente.

### Estado declarado

**BROCHURE INICIAL** — chip discreto bajo el eyebrow: «Brochure inicial — se sella con el
cierre de pruebas». Se repite en el cierre (E09).

## Las tarjetas (capa 1) y la regla de conteo — N = 14

El corte sigue **el viaje de la aduana** (el orden de uso, que es el argumento):

| #   | Tarjeta (verbo humano)                      | Funcionalidades                                                                           | Manual §     |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| 1   | **«Mira lo que te delata»**                 | C1 carga CSV/Excel · C13 modo auditoría + reporte · C2 detección Ley 1581                 | §1 · §2 · §3 |
| 2   | **«Decide qué se le hace»**                 | C3 política por campo = archivo · C14 Habeas Data + HIPAA Safe Harbor                     | §4           |
| 3   | **«Vela con exactitud»**                    | C4 cuatro familias · C10 formato + DV conservados · C9 los cruces sobreviven              | §4           |
| 4   | **«Mide el riesgo de verdad»**              | C5 k-anonimato + consejero · C6 exacto/estimado, dos planos · C7 antes-después + utilidad | §2 · §4      |
| 5   | **«Entrega, recupera, deja constancia»** ⭐ | C8 el regreso ⭐⭐ · C11 certificado · C12 bitácora cifrada                               | §5 · §6 · §7 |

3 + 3 + 3 + 3 + 2 → **14 / 14**. El pie declara N = 14 y el summary lleva la tabla de mapeo
completa (funcionalidad → manual → tarjeta) y **qué NO cuenta**: los 4 diferenciadores B1–B4
(identidad transversal, no features), las 8 de roadmap (no existen), y el propio brochure /
`/conoce` / export (se documentan, no se documentan a sí mismos).

**Desviación declarada al molde («la estrella primera»):** la estrella —el regreso— va en la
tarjeta 5, no en la 1. Razón: **el regreso no se entiende sin haber entendido velar**; el
viaje es el argumento y su orden es la jerarquía. La estrella no pierde trono: se lleva **el
clímax entero** (E07), el lugar más fuerte de la pieza.

## Inventario de escenas

### E01 · Apertura — la tabla que se vela _(el riesgo de la pieza)_

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | «Entrega tus datos sin entregar a tu gente» — y la prueba se ve antes de leerse: los datos se velan delante de ti.                                                                                                                                                                                                                                                                                                    |
| **Gramática**                        | G3                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Técnica**                          | Titular **enfoca** palabra por palabra (blur 3px→0, spans `aria-hidden`, texto íntegro en `aria-label`, **opacidad 1**) · debajo, mini-tabla sintética 3×3 donde cada valor **se vela**: crossfade + `translateY(4px)` al valor tratado (`1.035.873.389` → `CC-4f7a91b2`; `María…` → `███`), en cascada de 300 ms · tagline **alza** al final: _Velo para entregar. Desvelo para recuperar._ · chip INICIAL estático. |
| **Cómo el motion cuenta el mensaje** | La transformación **es** el producto; verla ocurrir en la primera pantalla es la demo sin pedir permiso. El titular que se enfoca = el archivo que pasa de borroso (riesgo) a nítido (control).                                                                                                                                                                                                                       |
| **Assets + origen**                  | Datos sintéticos estilo `kit-de-prueba` (INVENTADOS, jamás reales — regla dura 5); tabla HTML con mono.                                                                                                                                                                                                                                                                                                               |
| **Peso estimado**                    | ~2 KB                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Frame budget**                     | `transform`/`opacity` + excepción blur declarada (solo apertura).                                                                                                                                                                                                                                                                                                                                                     |
| **Reduced-motion**                   | Titular nítido desde el primer frame; la tabla aparece **ya velada**, con una fila mostrando origen→velado en estático. El mensaje completo sin un frame de movimiento.                                                                                                                                                                                                                                               |

### E02 · El sello que se completa _(G1 serena)_

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | «Nada sale de este navegador» no es un pie de página: se construye mientras recorres.                                                                                                                                                                                                                                                                                         |
| **Gramática**                        | **G1 serena** — mapeo puro scroll→progreso, sin pin, sin tocar la rueda.                                                                                                                                                                                                                                                                                                      |
| **Técnica**                          | En el margen (≥1024 px; en móvil vive solo en E09), el **anillo de la MarcaDeSello** (anillo + anillo punteado + barras) se **dibuja** con el avance: `stroke-dashoffset` interpolado en un solo rAF con inercia (lerp 0.14, se apaga al asentarse; medidas cacheadas en `resize`). Al 100 % aparecen las barras interiores: el sello queda completo junto al conteo del pie. |
| **Cómo el motion cuenta el mensaje** | La confianza no se declara: se completa leyendo. Tu recorrido termina el sello.                                                                                                                                                                                                                                                                                               |
| **Assets + origen**                  | La `MarcaDeSello` **real** de `src/components/sello.tsx` — el mismo SVG, sin desincronizarse.                                                                                                                                                                                                                                                                                 |
| **Peso estimado**                    | ~1,5 KB de JS                                                                                                                                                                                                                                                                                                                                                                 |
| **Frame budget**                     | `stroke-dashoffset` (excepción declarada, decorativo `aria-hidden`) + `transform`. Cero layout en el tick.                                                                                                                                                                                                                                                                    |
| **Reduced-motion**                   | El sello no existe como animación: aparece completo y quieto en el pie.                                                                                                                                                                                                                                                                                                       |

### E03 · Las cinco puertas

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Qué hace Velo, en 5 grupos que son un viaje — y se nota la mano (esto no es plantilla).                                                                                                                                                                                                                                                                         |
| **Gramática**                        | G3                                                                                                                                                                                                                                                                                                                                                              |
| **Técnica**                          | Tarjetas **alzan y se asientan** (18 px, `--asentar`) con stagger jerárquico: la 1 entra sola un beat antes, las demás a ~70 ms · el icono de trazo de cada una **se dibuja** al entrar (los reales del DS: lupa · transformar · barras · volver · archivador; `pathLength` + `stroke-dashoffset`, un disparo) · el hairline bajo el h2 se extiende (`scaleX`). |
| **Cómo el motion cuenta el mensaje** | El orden de entrada **es** el viaje. El trazo dibujándose = «hecho a mano», el anti-genérico — y son LOS MISMOS iconos que verá en la app.                                                                                                                                                                                                                      |
| **Assets + origen**                  | `src/components/iconos.tsx` (5 elegidos, copiados idénticos).                                                                                                                                                                                                                                                                                                   |
| **Peso estimado**                    | ~2 KB                                                                                                                                                                                                                                                                                                                                                           |
| **Frame budget**                     | `transform`/`opacity` + `stroke-dashoffset` declarada.                                                                                                                                                                                                                                                                                                          |
| **Reduced-motion**                   | Tarjetas e iconos completos desde el primer frame.                                                                                                                                                                                                                                                                                                              |

### E04 · La tarjeta abierta _(G2)_

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Nadie lee lo que no pidió; cuando pides, te sirven en orden.                                                                                                                                                                                                                                                                                                                                                         |
| **Gramática**                        | G2                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Técnica**                          | Apertura `grid-rows 0fr→1fr` + **`visibility` en la transición** (lo cerrado queda FUERA del árbol de a11y) · las funcionalidades interiores **alzan** en fila (stagger 40 ms) · presión táctil `scale(0.99)` · apertura anunciada con un destello sutil de borde en el acento · **dirección del recorrido**: al bajar pueden abrirse solas (con anclaje cuidado), el toque SIEMPRE manda, al subir quedan cerradas. |
| **Cómo el motion cuenta el mensaje** | Progressive disclosure con oficio: el detalle se sirve, no se vuelca.                                                                                                                                                                                                                                                                                                                                                |
| **Assets + origen**                  | Patrón del molde + banco §3.                                                                                                                                                                                                                                                                                                                                                                                         |
| **Peso estimado**                    | ~1,5 KB                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Frame budget**                     | `transform`/`opacity` + `grid-template-rows` declarada.                                                                                                                                                                                                                                                                                                                                                              |
| **Reduced-motion**                   | Abre instantánea, con todo en pose final.                                                                                                                                                                                                                                                                                                                                                                            |

### E05 · El respiro — velar en dos segundos

| Campo                                | Valor                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Así se ve velar: conserva la forma, pierde la identidad — y el mes que viene, el mismo seudónimo.                                                                                                                                                                                               |
| **Gramática**                        | G3 (una corrida al entrar en viewport).                                                                                                                                                                                                                                                         |
| **Técnica**                          | Franja en `papel-hundido`: una cédula grande en mono; un velo (rect del acento-tenue) la cruza y a su paso el valor cambia a un seudónimo **con forma de cédula** (dígito de verificación incluido) · debajo, dos chips «marzo» y «abril» revelan **el mismo** seudónimo. Leyenda de una línea. |
| **Cómo el motion cuenta el mensaje** | La mecánica madre sin un párrafo: el velo pasa, la forma queda. Dos meses, un seudónimo: los cruces sobreviven a la vista.                                                                                                                                                                      |
| **Assets + origen**                  | Tipografía + un rect; valores sintéticos.                                                                                                                                                                                                                                                       |
| **Peso estimado**                    | ~1 KB                                                                                                                                                                                                                                                                                           |
| **Frame budget**                     | `transform`/`opacity` (el cambio de texto es un swap bajo el velo).                                                                                                                                                                                                                             |
| **Reduced-motion**                   | Cuadro final estático: original → velado con flecha, chips ya iguales, la misma leyenda.                                                                                                                                                                                                        |

### E06 · La aduana en tu navegador _(privacidad — voz baja antes del clímax)_

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Mientras todo esto pasa, nada ha salido: no hay servidor que reciba, y la propia página le prohíbe al navegador llamar afuera.                                                                                                                                                                                                                                                                                                                                  |
| **Gramática**                        | G3 (una corrida).                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Técnica**                          | Marco de navegador dibujado en trazo 1,5 (estilo de los iconos); adentro, la tabla mini trabaja (dos valores se velan); tres flechas intentan salir hacia iconos de nube/servidor y **se cortan en el borde** del marco (el trazo se detiene y se desvanece). El texto de la garantía va **visible** debajo, copiado del manual: la prueba automática que intercepta todas las peticiones y la CSP que prohíbe conectarse a cualquier sitio que no sea el suyo. |
| **Cómo el motion cuenta el mensaje** | La frontera es literal: lo que intenta cruzar muere en el borde. Es el e2e de red + la CSP vueltos imagen.                                                                                                                                                                                                                                                                                                                                                      |
| **Assets + origen**                  | SVG propio nuevo, trazo 1,5. **Sin candados ni escudos** (regla 1 de los iconos del DS): se muestra la FRONTERA, no la criptografía.                                                                                                                                                                                                                                                                                                                            |
| **Peso estimado**                    | ~2 KB                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Frame budget**                     | `transform`/`opacity` + `stroke-dashoffset` declarada (las flechas que se cortan).                                                                                                                                                                                                                                                                                                                                                                              |
| **Reduced-motion**                   | Composición estática: flechas ya cortadas en el borde, mismo texto íntegro.                                                                                                                                                                                                                                                                                                                                                                                     |

### E07 · EL CLÍMAX — el círculo completo

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | _Velo para entregar. Desvelo para recuperar._ La única herramienta que hace el viaje completo — entregas sin entregar, y recuperas.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gramática**                        | G3 con **loop ambiental** (el único de la pieza), pausado fuera de viewport y bajo `document.hidden`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Técnica**                          | Escena propia, texto **visible** (jamás acordeón). Dos territorios separados por una frontera vertical: «tu mesa» (papel) y «el tercero» (papel-hundido). Ciclo ~10 s: (1) el archivo se **vela** en tu mesa; (2) **viaja** cruzando la frontera — lo ÚNICO que la cruza; (3) del otro lado el tercero trabaja: aparece una columna nueva y las filas se reordenan; (4) **vuelve**; (5) en tu mesa, junto al chip de la bóveda, se **desvela**: los originales vuelven — y la columna del tercero se queda. El loop recomienza tras una pausa: la repetición **es** el mensaje. |
| **Cómo el motion cuenta el mensaje** | El mercado hace la mitad del viaje; aquí el círculo se cierra a la vista, una y otra vez, idéntico — porque es determinista. La bóveda aparece como lo que es: la única llave de la vuelta.                                                                                                                                                                                                                                                                                                                                                                                     |
| **Assets + origen**                  | Chips de tabla + iconos de archivador/volver del DS; valores sintéticos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Peso estimado**                    | ~3 KB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Frame budget**                     | Solo `transform`/`opacity` (el viaje es `translateX`; velar/desvelar son crossfades).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Reduced-motion**                   | El diagrama completo estático con las 3 estaciones visibles (velado → el tercero trabajó → desvelado con su columna nueva), numeradas, mismo texto. El mensaje entero sin movimiento.                                                                                                                                                                                                                                                                                                                                                                                           |

### E08 · Lo fino — la voz baja

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Qué mide y qué **no** afirma · requisitos y limitaciones · el mapa de la app.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Gramática**                        | G3 + G2 (acordeones).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Técnica**                          | Tres acordeones que **alzan** con el reveal general; al abrir, el cuerpo alza una vez. Nada más — después del clímax la página baja la voz. Contenidos: (1) «Lo que Velo NO afirma», copiado del manual (k-anonimato atacable, muestra de 5.000, consejero acotado); (2) requisitos y límites honestos (Excel 150 MB → CSV, 500k medido, **tres frases de paso irrecuperables — y por qué eso es garantía**); (3) mapa: 5 rutas + `/conoce`, con **enlaces relativos** — cero URLs absolutas. |
| **Cómo el motion cuenta el mensaje** | Ritmo: si toda escena es clímax, ninguna lo es.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Assets + origen**                  | Molde.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Peso estimado**                    | ~0,3 KB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Frame budget**                     | `transform`/`opacity`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Reduced-motion**                   | Apertura instantánea completa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### E09 · El cierre — el 14 que se cuenta solo

| Campo                                | Valor                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensaje**                          | Están las 14, ninguna por fuera — y tu recorrido completó el sello.                                                                                                                                                                                                                                                                                 |
| **Gramática**                        | G3 (+ remate del G1 de E02).                                                                                                                                                                                                                                                                                                                        |
| **Técnica**                          | El **14** se cuenta 0→14 (~700 ms, rAF, `tabular-nums`, ancho fijo en `ch`; el texto accesible dice «14 funcionalidades» desde el primer byte) · el sello del margen llega completo y sus barras se **dibujan** (en móvil el sello vive solo aquí y se dibuja al entrar) · nota del conteo cuadrado + historial del brochure + declaración INICIAL. |
| **Cómo el motion cuenta el mensaje** | El dato duro dramatizado + la metáfora del sello cerrada: leerlo todo también fue sellar.                                                                                                                                                                                                                                                           |
| **Assets + origen**                  | Reutiliza E02.                                                                                                                                                                                                                                                                                                                                      |
| **Peso estimado**                    | ~0,5 KB                                                                                                                                                                                                                                                                                                                                             |
| **Frame budget**                     | `transform`/`opacity`; el contador sin layout thrash.                                                                                                                                                                                                                                                                                               |
| **Reduced-motion**                   | «14» quieto desde siempre; sello completo estático.                                                                                                                                                                                                                                                                                                 |

## Cuadre de mensajes — 10 / 10

| Mensaje                                              | Escena(s)               |
| ---------------------------------------------------- | ----------------------- |
| Promesa e identidad («entrega sin entregar»)         | E01                     |
| El sello / la confianza que se construye             | E02 · E09               |
| Qué hace — 5 grupos, 14 funcionalidades              | E03 · E04               |
| La mecánica madre (velar conserva la forma) + cruces | E05                     |
| Privacidad arquitectónica (nada sale)                | E06 + acordeón 1 de E08 |
| **La promesa mayor: el round-trip**                  | **E07 (clímax)**        |
| Honestidad medida (qué NO afirma)                    | E08                     |
| Requisitos y limitaciones                            | E08                     |
| Mapa de la app                                       | E08                     |
| Conteo completo + brochure vivo INICIAL              | E09 + chip en E01       |

**Peso total estimado:** ~55–75 KB autocontenido.

## Lo que esta pieza NO hace (por regla)

- **No promete anonimato absoluto.** Ni «anonimato garantizado», ni «100 % seguro», ni
  «imposible de reidentificar» — en ninguna escena, ni siquiera en el clímax.
- **No muestra un solo dato real.** Todos los valores son sintéticos e inventados aquí.
- **No publica ninguna URL de producción o preview** (regla 14 del CLAUDE.md): los enlaces
  del mapa son relativos.
- **No pide nada.** Sin formularios, sin correo, sin analítica, sin peticiones externas.
