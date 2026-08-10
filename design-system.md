# Sistema de diseño de Velo — «bóveda serena»

> Fuente de verdad visual de la app. Nace en el Sprint 001 y **toda pantalla posterior lo obedece**:
> se extiende por ADR, nunca se contradice en silencio. Los tokens viven implementados en
> `src/app/globals.css`; aquí se explica **por qué** son esos y no otros.

---

## 1. Personalidad

**Precisa · serena · cómplice.**

- **Precisa** porque el producto entero se sostiene en que el número que enseña es el número que es.
  Cifras tabulares, alineación óptica, cero adorno que compita con un dato.
- **Serena** porque Velo aparece en el momento en que alguien está a punto de entregar datos de
  personas reales a un tercero. Una interfaz nerviosa contagia; una interfaz serena deja pensar.
- **Cómplice** porque Velo está del lado del usuario, no del lado del cumplimiento. Le muestra lo
  que un atacante vería, no lo regaña por tenerlo.

**Nunca alarmista · nunca clínica · nunca ostentosa.**

- **Nunca alarmista**: rojo de semáforo, iconos de peligro y signos de admiración están vetados.
  El riesgo alto se comunica con jerarquía y con la cifra exacta, no con susto. Un producto que
  grita pierde la autoridad justo cuando más la necesita.
- **Nunca clínica**: el gris-sobre-blanco de dashboard empresarial es la estética del que no se
  hace responsable. Aquí el fondo es papel cálido y la tipografía tiene voz.
- **Nunca ostentosa**: sin gradientes decorativos, sin sombras pesadas, sin animaciones que
  celebren. La sobriedad **es** el argumento de confianza.

### La metáfora rectora: papel y bóveda

Dos materiales, y cada uno tiene un trabajo.

- **El papel** (fondo claro, cálido, `--papel`) es donde se **lee**: la lista de columnas, el
  informe, la explicación. Tiene la temperatura de un documento, no de una pantalla.
- **La bóveda** (fondo oscuro, verde-negro, `--papel` en tema oscuro) es donde los datos **están**.
  El tema oscuro de Velo no es "el mismo diseño en negativo": es la sensación de estar adentro.

Y un tercer elemento que no es material sino promesa: **el sello**.

### El sello «nada sale de aquí» — elemento de identidad

Una marca circular de lacre, dibujada en SVG inline (jamás una imagen externa: una petición a un
CDN rompería literalmente lo que el sello afirma), presente en el encabezado de **todas** las
pantallas y en el pie del informe exportado.

Reglas del sello:

- Va acompañado siempre de la frase, nunca solo: **«Nada sale de este navegador»**.
- No es decorativo ni clicable: es una declaración. No cambia de color con el riesgo, no parpadea,
  no se anima. Es lo único de la interfaz que nunca reacciona a nada — porque nunca deja de ser
  cierto.
- Es el único lugar donde se usa `--acento` en superficie amplia.

---

## 2. Tokens

Implementados como variables CSS en `:root` + `@media (prefers-color-scheme: dark)` y expuestos a
Tailwind 4 vía `@theme inline`. **Prohibido un valor mágico en un componente**: si un color, un
espacio o una duración no está aquí, no se usa.

### 2.1 Color — roles, no nombres

Cada token es un **rol**. `--acento` no significa "verde": significa "lo confirmado, lo seguro, el
sello". Cuando el tema cambia, el rol se mantiene y el valor se mueve.

| Rol                | Claro (papel) | Oscuro (bóveda) | Para qué                                           |
| ------------------ | ------------- | --------------- | -------------------------------------------------- |
| `--papel`          | `#FBF9F4`     | `#0F1411`       | Fondo de la página                                 |
| `--papel-hundido`  | `#F2EEE5`     | `#0A0E0C`       | Zonas de reposo, cabeceras de tabla, código        |
| `--superficie`     | `#FFFFFF`     | `#171D19`       | Tarjetas y paneles                                 |
| `--borde`          | `#E2DCCF`     | `#2A322D`       | Separación entre bloques (decorativa)              |
| `--borde-control`  | `#7E8783`     | `#606B66`       | Límite de **controles** — ≥3:1, exigido por 1.4.11 |
| `--tinta`          | `#1A211D`     | `#EDE8DC`       | Texto principal                                    |
| `--tinta-suave`    | `#4F5A55`     | `#AAB3AD`       | Texto secundario                                   |
| `--tinta-tenue`    | `#626B66`     | `#8B948E`       | Metadatos, notas al pie                            |
| `--acento`         | `#0D6B57`     | `#5CC7A6`       | Sello, confirmado, acción principal                |
| `--acento-tenue`   | `#E4F0EB`     | `#12312A`       | Fondo de insignia de acento                        |
| `--alerta`         | `#9E3222`     | `#EF8E78`       | Identificador directo · riesgo alto                |
| `--alerta-tenue`   | `#F8E9E5`     | `#35201B`       | Fondo de insignia de alerta                        |
| `--aviso`          | `#7C5209`     | `#DDA945`       | Cuasi-identificador · riesgo medio                 |
| `--aviso-tenue`    | `#F6EEDB`     | `#322816`       | Fondo de insignia de aviso                         |
| `--sensible`       | `#71355C`     | `#DC98C0`       | Dato sensible (Ley 1581 art. 5)                    |
| `--sensible-tenue` | `#F4E9F0`     | `#2F1E2A`       | Fondo de insignia de sensible                      |

**Contraste medido** (WCAG 2.1, script en la bitácora, no estimado a ojo): todo texto ≥ 4.5:1 sobre
sus tres fondos posibles en ambos temas — el peor caso es `--tinta-tenue` sobre `--papel-hundido`
con **4.75:1** (claro) y **5.48:1** (oscuro). `--borde-control` alcanza **3.19:1** (claro) y
**3.09:1** (oscuro) en su peor fondo. Texto sobre `--acento` sólido: 6.13:1 / 9.02:1.

**El acento se gasta con avaricia.** En una pantalla puede aparecer en el sello, en la acción
principal y en nada más. Si el acento está en tres sitios, dos están mal.

**Los cuatro colores de categoría son un sistema cerrado**, uno por categoría de la Ley 1581, y
**nunca se reasignan**: alerta = identificador directo, aviso = cuasi-identificador, sensible =
dato sensible, tinta-tenue = no personal. El color no es la única señal: cada insignia lleva su
texto (requisito 1.4.1 — la categoría no puede depender del color).

### 2.2 Tipografía

Tres familias, cada una con un oficio. Todas self-hosteadas por `next/font` en build: **cero
peticiones a Google en tiempo de ejecución**, que en esta app no es una optimización sino la regla.

| Familia           | Token            | Oficio                                                                     |
| ----------------- | ---------------- | -------------------------------------------------------------------------- |
| **Fraunces**      | `--font-display` | Títulos y la cifra grande del riesgo. Serif variable, cálida y con voz.    |
| **IBM Plex Sans** | `--font-sans`    | Todo el texto de interfaz. Humanista con ingeniería: precisa sin ser fría. |
| **IBM Plex Mono** | `--font-mono`    | Cifras, nombres de columna, muestras enmascaradas, fuentes citadas.        |

Por qué estas: Fraunces trae la calidez editorial que impide que el producto se lea como un panel
de control; Plex Sans fue dibujada para hablar de tecnología con seriedad y tiene una cursiva y una
`ñ` que no delatan a un default; Plex Mono empareja con ella por construcción y hace legible una
tabla de cifras. **Inter en todo es la firma del look genérico** y está descartada por eso.

Escala (con `text-wrap: balance` en títulos y `pretty` en párrafos):

| Uso                 | Tamaño / línea                                  | Familia y peso           |
| ------------------- | ----------------------------------------------- | ------------------------ |
| Cifra de riesgo     | `clamp(2.75rem, 9vw, 4rem)` / 1                 | display 600              |
| Título de pantalla  | `clamp(1.875rem, 5vw, 2.75rem)` / 1.1           | display 600              |
| Título de sección   | `1.25rem` / 1.3                                 | sans 600                 |
| Cuerpo              | `1rem` / 1.65                                   | sans 400                 |
| Cuerpo secundario   | `0.9375rem` / 1.6                               | sans 400                 |
| Metadato / nota     | `0.8125rem` / 1.5                               | sans 400                 |
| Etiqueta de sección | `0.75rem` / 1, `0.18em` de tracking, versalitas | mono 500                 |
| Dato tabular        | `0.875rem` / 1.5                                | mono 400, `tabular-nums` |

**Toda cifra lleva `font-variant-numeric: tabular-nums`.** Una columna de porcentajes que baila al
actualizarse contradice la palabra "preciso" más rápido de lo que cualquier copy la sostiene.

### 2.3 Espacio, radios, sombras

- **Espacio**: la escala de Tailwind (múltiplos de 4px) **es** el token de espacio; no se declara
  una escala paralela que haya que mantener sincronizada. El ritmo de la app usa cinco saltos —
  `2` (8px), `3` (12px), `6` (24px), `10` (40px), `16` (64px)— y los intermedios se justifican.
- **Radios**: `--radio-1` 4px (controles), `--radio-2` 8px (insignias, celdas), `--radio-3` 12px
  (tarjetas y paneles), `--radio-lleno` 999px (solo el sello). **Nada de `rounded-2xl` uniforme**:
  el radio pequeño lee como instrumento, el radio enorme lee como app de consumo.
- **Sombras**: casi ninguna. La separación la hace el borde, como en un documento impreso.
  `--sombra-1` (elevación mínima de tarjeta) y `--sombra-2` (elemento que flota sobre el resto,
  p. ej. la zona de arrastre activa). Nada más. Sombra pesada = ostentosa = vetada.
- **Densidad decidida por pantalla**: la aduana (`/`) es **aireada** — una sola decisión, mucho
  aire alrededor. El diagnóstico (`/diagnostico`) es **denso** — es una mesa de trabajo y el
  usuario vino a leer datos. Los mismos tokens sirven a las dos.

### 2.4 Motion

| Token     | Duración                     | Para qué                                                     |
| --------- | ---------------------------- | ------------------------------------------------------------ |
| `--mov-1` | 150 ms                       | Micro-reacción: hover, foco, presión                         |
| `--mov-2` | 220 ms                       | Entrada de un elemento, cambio de estado de la zona de carga |
| `--mov-3` | 320 ms                       | Aparición de un panel completo                               |
| `--curva` | `cubic-bezier(0.2, 0, 0, 1)` | Salida rápida, llegada suave: física, no rebote              |

**El movimiento explica causalidad.** El panel de riesgo entra desde abajo porque viene del
archivo que acabas de soltar. Nada se anima porque sí, nada rebota, nada celebra.

**Cinturón de `prefers-reduced-motion`** en `globals.css`: una regla global que anula duraciones y
`animation` para todo el documento. No se confía en que cada componente se acuerde. La barra de
progreso conserva su cambio de ancho (es información, no decoración) pero pierde la transición.

---

## 3. Componentes canon

Construidos a mano sobre los tokens. **No hay shadcn/ui sin personalizar en esta app**: los cuatro
componentes que el S1 necesita son demasiado propios para heredar un default.

| Componente        | Archivo                        | Uso permitido                                                                                       |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Sello**         | `components/sello.tsx`         | Encabezado de toda pantalla y pie del informe. Nunca decorativo suelto.                             |
| **Zona de carga** | `components/zona-de-carga.tsx` | Solo en `/`. Arrastre **y** `<input type="file">` real y accesible.                                 |
| **Insignia**      | `components/insignias.tsx`     | Categoría de la Ley 1581 y nivel de certeza. Color + texto, siempre los dos.                        |
| **Panel**         | `components/panel.tsx`         | Contenedor de sección con título y nota al pie opcional.                                            |
| **Botón**         | `components/boton.tsx`         | Variantes `principal` (acento sólido) y `discreto` (borde). Una sola acción principal por pantalla. |

**Foco visible, sin excepción**: `outline: 2px solid var(--acento); outline-offset: 2px`. Nunca
`outline: none` sin reemplazo — y el reemplazo tiene que medir ≥3:1 contra lo que lo rodea.

---

## 4. Los cinco estados, diseñados

El estado vacío es la primera impresión de Velo, no un hueco por llenar.

| Pantalla       | Vacío                                                                                                                        | Cargando                                                                                         | Error                                                                                              | Éxito / contenido                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/`            | La aduana en reposo: promesa, «cómo funciona» en 3 pasos, zona de arrastre. **Es la pantalla principal, no un placeholder.** | Progreso **real** del worker con fase nombrada («leyendo», «clasificando», «midiendo el riesgo») | Formato no soportado · archivo vacío · Excel por encima del tope, con la salida (guardar como CSV) | Navega a `/diagnostico`                                                                    |
| `/diagnostico` | **Sin datos cargados** (recarga directa): «No quedó nada, y es a propósito» + volver a la aduana                             | — (el trabajo ya ocurrió)                                                                        | —                                                                                                  | Con hallazgos · **sin hallazgos** («no encontramos datos personales» ≠ «está anonimizado») |

**Microcopy**: español llano de Colombia, sin jerga legal innecesaria y sin inglés residual. Los
errores dicen **qué hacer**, no qué falló. Y las tres frases prohibidas de la regla dura nº4
—"anonimato garantizado", "100% seguro", "imposible de reidentificar"— no aparecen en ningún copy,
ni en un tooltip.

---

## 5. Cómo se presenta un número (regla propia de esta app)

Velo es un instrumento de medición; la tipografía tiene que distinguir lo que mide de lo que
supone.

1. **Lo exacto se presenta desnudo**: la cifra, grande, y debajo qué se contó. Sin adjetivos.
2. **Lo estimado llevará siempre la palabra «estimado» adjunta a la cifra** (llega en el S2). Nunca
   en una nota al pie que se pueda perder: pegada al número.
3. **Todo número enseña su denominador.** «412 registros únicos» sin «de 3.000» no es información,
   es alarma.
4. **Los topes se declaran donde se aplican.** Si el advisor miró 6 columnas y no 24, lo dice en el
   panel, no en la documentación.

---

## 6. Anti-patrones vetados (auto-auditoría del gate)

Contra la lista del skill `diseno-ui`, y con los propios de esta app:

- ❌ shadcn/ui sin personalizar · ❌ gradiente violeta/azul · ❌ emojis como iconografía ·
  ❌ grid de tarjetas idénticas como respuesta a todo · ❌ sombras pesadas · ❌ hero centrado con
  dos botones · ❌ radios XL uniformes · ❌ inglés residual o texto de plantilla.
- ❌ **Rojo de semáforo para el riesgo** (alarmista: el lacre `--alerta` lo reemplaza).
- ❌ **Iconos de candado, escudo o llave** como refuerzo de la promesa: el sello ya lo dice, y el
  candado es el cliché exacto de la seguridad que no se sostiene con hechos.
- ❌ **Barras de progreso falsas**: si no hay medida real del worker, no hay barra.
- ❌ **Valores completos del usuario en pantalla**: toda muestra va enmascarada, y las columnas
  sensibles no llevan muestra.

---

## 7. Gate de revisión (se corre sobre la preview real, por cada tema)

- [ ] Fiel a este documento: cero valores mágicos, componentes canon, tokens respetados.
- [ ] Checklist completo en **claro Y oscuro** (un gate mono-tema deja pasar contrastes rotos).
- [ ] Jerarquía: en menos de 3 segundos se ve qué es lo importante de la pantalla.
- [ ] Los cinco estados existen y están diseñados.
- [ ] Densidad y ritmo consistentes; alineación óptica revisada; `tabular-nums` en toda cifra.
- [ ] Motion sutil y desactivable; `prefers-reduced-motion` verificado con e2e.
- [ ] Microcopy en español llano; cero frases prohibidas por la regla de honestidad medida.
- [ ] Cero anti-patrones del § 6.
- [ ] Responsive real: 360–420 y ≥1024 revisados a mano.
- [ ] El usuario aprobó la preview visualmente (su feedback se anota en la bitácora).
