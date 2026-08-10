# ADR-003 — Excel: de dónde viene SheetJS y cuál es su tope

- **Estado:** aceptada
- **Fecha:** 2026-08-09
- **Sprint:** 001 · Fase 0 (spike B)
- **Decide:** (a) instalar SheetJS desde su CDN oficial y no desde el registro npm; (b) fijar el
  tope de `.xlsx` **por tamaño de archivo**, no por número de filas.

## Parte A — el suministro: `xlsx` del registro npm rompe el CI

SheetJS dejó de publicar en npm. La última versión que quedó allí es **0.18.5**, y arrastra dos
avisos de severidad **high** que `pnpm audit --audit-level high` —gate del estándar 4, en el job
`quality`— reporta sin ambigüedad. Verificado en un proyecto aislado, no supuesto:

```
high  Prototype Pollution in sheetJS         xlsx <0.19.3   → GHSA-4r6h-8v6p-xvw6
high  SheetJS Regular Expression DoS (ReDoS) xlsx <0.20.2   → GHSA-5pgg-2g8v-p4x9
```

Es un choque de reglas sin salida negociable: la orden exige Excel (acceptance criterion nº4) y el
estándar de seguridad no admite aflojar el umbral del audit. Las dos vulnerabilidades **están
corregidas** en versiones que existen — pero solo fuera de npm.

**Decisión:** instalar desde el tarball oficial de SheetJS, que es la vía que el propio proyecto
documenta:

```
pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

- `pnpm audit --audit-level high` → **limpio** (0.20.3 supera ambos rangos vulnerables).
- El lockfile fija el tarball **con su integridad sha512**, así que `--frozen-lockfile` en CI
  verifica el contenido; no es "descargar lo que haya en una URL".
- **Riesgo aceptado y declarado:** `pnpm install` en CI depende de que `cdn.sheetjs.com` responda.
  Es una dependencia de red más, como el propio registro npm, pero de un solo proveedor. Si el CDN
  cayera, el CI se queda sin instalar; el plan B es fijar el tarball en el repo o migrar a
  `exceljs`. No se activa hoy: no hay evidencia de inestabilidad.
- Alternativa evaluada y no elegida: **`exceljs`** (npm, mantenido). Se descarta porque `dense: true`
  de SheetJS y su lectura de XLSB son justo lo que la investigación F1 recomienda para archivos
  grandes, y porque el problema de npm es de _distribución_, no de calidad del código.

## Parte B — el tope: medido, y por tamaño de archivo

La investigación F1 documentaba crashes de SheetJS desde ~200k filas × 30 columnas
([issue #2211](https://github.com/SheetJS/sheetjs/issues/2211)) y ausencia de lectura en streaming
en el navegador ([issue #2757](https://github.com/SheetJS/sheetjs/issues/2757)). El spike midió el
techo real de ESTE stack, en Chromium, con el worker de Velo:

| Filas × 24 col | Peso del `.xlsx` | Lectura en el worker       | Tareas largas en el hilo principal |
| -------------- | ---------------- | -------------------------- | ---------------------------------- |
| 25.000         | 9,8 MB           | 0,7 s                      | 0                                  |
| 50.000         | 20 MB            | 1,4 s                      | 0                                  |
| 100.000        | 41 MB            | 2,9 s                      | 0                                  |
| 200.000        | 83 MB            | 5,9 s                      | 0                                  |
| 300.000        | 125 MB           | 8,8 s                      | 0                                  |
| 400.000        | 167 MB           | **11,7 s**                 | 0                                  |
| 500.000        | —                | **imposible de construir** | —                                  |

**Dos hallazgos que corrigen el supuesto de la investigación:**

1. **Leer 400k filas funciona** — el techo de ~200k que documentaba F1 no es el techo de este
   stack (worker + `dense: true` + Chromium actual). Bueno saberlo antes de escribir un aviso
   pesimista en la UI.
2. **El límite duro apareció en la ESCRITURA, no en la lectura:** SheetJS no pudo generar el
   fixture de 500k × 24 — `RangeError: Invalid string length`, el tope de longitud de string de V8
   (~512 MB), exactamente el mecanismo que la investigación anticipaba. El límite es estructural
   del formato en JS, no un bug puntual.

### Por qué el tope se declara por TAMAÑO y no por filas

Porque el número de filas de un `.xlsx` **no se conoce hasta haberlo abierto** — y abrirlo es
justamente la operación que puede tumbar la pestaña. `file.size`, en cambio, se conoce en el
instante en que el usuario suelta el archivo, sin leer un byte. Un tope por filas sería un aviso
que llega tarde.

**Tope declarado: 150 MB de `.xlsx`.** Por encima, Velo no lo intenta: avisa con honestidad y guía
a CSV. Entre 40 MB y el tope, avisa que puede tardar y menciona que el CSV es más liviano, pero
procesa. El corte en 150 MB queda por encima del caso medido con holgura (125 MB / 300k filas) y
por debajo del último que funcionó (167 MB), porque la medición es de una máquina de desarrollo con
RAM holgada y el usuario puede tener menos.

**CSV no tiene tope**: se lee en streaming y 500.000 filas (136 MB) se procesan en **2,7 s** con
cero tareas largas. Por eso el aviso guía a CSV en vez de rendirse — no es una excusa, es el camino
que sí escala.

## Consecuencias

- El aviso-Excel-grande es uno de los estados obligatorios de la pantalla de carga (P1, Fase 3), y
  su umbral vive en una constante con este ADR citado al lado.
- `import("xlsx")` es **dinámico dentro del worker**: SheetJS pesa ~900 KB y jamás debe entrar al
  bundle inicial de una página que quizá solo reciba CSV.
- Cuando la lectura falla igual, el worker responde `excel-excede-memoria` — **sin reenviar el
  mensaje de la excepción**, que podría citar contenido de la hoja.
- El generador del kit de prueba produce `.xlsx` hasta 400k filas (`--formato xlsx`); por encima no
  puede, y eso mismo es parte de la evidencia.
