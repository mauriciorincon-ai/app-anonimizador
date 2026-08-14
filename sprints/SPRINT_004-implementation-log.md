# Sprint 004 · El cierre — bitácora de implementación

> Último sprint del ciclo H1. Velo ya ve, transforma y devuelve; este sprint entrega lo que hace el
> trabajo **defendible** — el certificado, la bitácora y los estimadores — más los dos entregables
> de cierre de ciclo y el gate ⭐ acumulado, que no se difiere.

Rama `sprint-004/el-cierre`, desde `origin/main` en `84324c8`.

---

## Fase 0 — Deuda del kit y del ciclo

### El delta del kit v1.15.2

El único punto: **el §4 se busca por promesa aplazada, no por la palabra de la feature.** Es la
regla que nació de mi propio S3, donde el inventario buscó «irreversible» y se le escaparon las dos
frases vivas porque decían «revertir» y «camino de vuelta». Aplicado abajo, y con una vuelta de
tuerca que el delta no traía y que este sprint necesitaba.

### Pago de deuda 1 · B2 — la carga duplicada del contrato

Declarada en el S2, aplazada al S3, aplazada al S4 «con el certificado». Se paga aquí, y **la
verificación previa importa tanto como el borrado**: `mondrian`, `diversidad`, `colisiones` y
`pendientesDeMondrian` cruzaban la frontera del worker con **cero lectores** en `components/`,
`app/` y `lib/`.

Lo que las hacía innecesarias no es que sobraran: es que **la frontera llevaba la materia prima y
la conclusión sacada de ella**. `balanceDelTratamiento` consume las cuatro **dentro del worker** y
de ahí salen las salvedades del balance, que son lo que la pantalla lee. Mandar además los insumos
era ofrecerle a la página que sacara sus propias conclusiones de datos que nadie había ordenado ni
clasificado.

De regalo cayó `ResumenDeMondrian` —el `Omit` que existía para que la tabla generalizada no
cruzara— y con él la proyección campo a campo del worker. **La defensa más barata contra que un
dato cruce sigue siendo que no cruce.**

**El pago no es el borrado, es la guardia.** En `tests/unit/taller.test.tsx`:

```ts
const CLAVES_DEL_RESULTADO: Record<keyof ResultadoDeTransformacion, true> = { … };
```

Un `Record<keyof …, true>` exige **todas** las claves y **solo** esas, así que añadir un campo al
contrato **rompe la compilación** y borrarlo también. Es más fuerte que la lista de claves en
tiempo de ejecución que el S3 puso sobre `ResumenDelRegreso`: aquella la puede esquivar un
`as unknown as` en el fixture —que es exactamente cómo estos cuatro campos sobrevivieron dos
sprints—, esta no. Cuando falle, la pregunta no es «¿cómo lo arreglo?» sino **«¿quién lee el campo
nuevo?»**.

### Pago de deuda 2 · `esDeLaMismaLlave`

**Borrada.** Se escribió en el S3 para el estado «esta bóveda es de otra llave» y nunca tuvo
llamador, porque no tenía segundo operando: en `/regreso` no hay llave HMAC cargada —el regreso
ocurre semanas después, en otra sesión, sin proyecto abierto—.

Y al mirarla de cerca, la función no solo era inútil: **habría sido peor que lo que ya existe.** La
pregunta que el usuario necesita respondida es «¿esta bóveda es de este archivo?», y la contesta
`restaurar()` con `reconocimiento: "ninguno"`, mirando el **contenido**. Una bóveda de la misma
llave y otro archivo distinto falla igual — y la comparación de huellas la habría dado por buena.

`huellaDeLlave` se queda en la bóveda y se sigue enseñando: sirve para que una persona reconozca de
qué proyecto es. Lo que no existe es la comparación automática que nadie pedía.

### `/diagnostico` y `/bitacora` entran al gate

`lighthouse-urls.json` era `["/", "/transformar", "/regreso"]`: **`/diagnostico` llevaba tres
sprints sin que el gate la mirara**, desde el sprint que la creó. Entra ahora, junto con la ruta
nueva.

`/bitacora` nace como andamio declarado —encabezado y un párrafo que dice «en construcción», sin
controles muertos ni esqueleto gris—, por la lección que el S2 y el S3 pagaron dos veces: un número
que aparece el día del PR llega tarde para arreglarlo. `/transformar` cayó a 0,88 por llevar el
motor en el bundle; `/regreso` a 0,90 por un salto de contenido de 0,107. Los dos se supieron
cuando ya había pantalla que rehacer.

**Números de partida, mediana de 3 corridas, con los dos asserts en verde:**

| Ruta           | Rendimiento | A11y | Best practices | SEO  |
| -------------- | ----------- | ---- | -------------- | ---- |
| `/`            | 0,95        | 1,00 | 1,00           | 1,00 |
| `/diagnostico` | **0,93**    | 1,00 | 1,00           | 1,00 |
| `/transformar` | 0,93        | 1,00 | 1,00           | 1,00 |
| `/regreso`     | 0,93        | 1,00 | 1,00           | 1,00 |
| `/bitacora`    | 0,93        | 1,00 | 1,00           | 1,00 |

**`/diagnostico` no nació en rojo**, que era la pregunta abierta del riesgo 6 del plan. Se anota
igual: llevaba tres sprints sin evidencia, y «probablemente está bien» no es una medición.

### §4 — el inventario de frases caducadas, con sus dos barridas

**Barrida 1, por vocabulario** (`todavía no`, `aún no`, `por ahora`, `de momento`, `mientras
tanto`, `próximamente`, `llega después`, `en esta versión`, `más adelante`, `no se puede`):
**limpia**. Los aciertos son comentarios de código, un mensaje de estado legítimo («la política pide
seudónimos y todavía no hay llave» describe un estado real y transitorio, no una promesa aplazada) y
límites declarados que siguen siendo ciertos.

**Barrida 2, por estructura** — y aquí está lo que la primera no puede ver. **Una sección entera
puede ser una promesa aplazada sin usar una sola palabra del vocabulario.** Dos encontradas:

| Dónde                                  | Qué es                                                                                                                  | Cuándo caduca |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------- |
| `docs/MANUAL-DE-USO.md § Lo que viene` | Promete «el certificado» y «la bitácora de tratamientos» como futuro. Ni un `todavía no` en todo el párrafo.            | Fases 1 y 4   |
| `README.md § Qué hace hoy`             | Enumera por sprint: «Sprints 001–003 · El diagnóstico, el disfraz y el regreso». Verdadero hoy, falso el día del merge. | Fase 4        |

**El corolario que este sprint añade al patrón, y que la Fase 0 no habría visto sin buscarlo:** hay
tres formas de prometer un futuro, no una. Por **vocabulario** («todavía no»), por **título de
sección** («Lo que viene») y por **enumeración con fecha implícita** («Sprints 001–003»). La tercera
es la más traicionera porque **no promete nada: se queda quieta mientras el producto avanza**, y una
lista que no se actualiza miente por omisión sin haber cambiado una letra.

Se pagan al final de la fase que las vuelva falsas, no al final del sprint — que es la corrección
que el S3 se ganó.

### Verificación de la Fase 0

| Criterio del plan                     | Resultado                                                              |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint`        | ✅ limpios                                                             |
| `pnpm test`                           | ✅ **644 verdes, 1 saltada**, con las dos guardias nuevas del contrato |
| `CI=1 pnpm test:e2e`                  | ✅ **88 passed, 2 skipped, cero flaky**                                |
| Los cinco números de partida anotados | ✅ arriba, con los dos asserts en verde                                |
| B2 pagada                             | ✅ cuatro campos fuera, con guardia de compilación                     |
| `esDeLaMismaLlave` pagada             | ✅ borrada, con su razón escrita en el hueco que dejó                  |
| Inventario §4 con su calendario       | ✅ dos barridas, dos hallazgos, ambos con fase asignada                |
