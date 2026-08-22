# Velo — la aduana de tus datos

> _Velo para entregar. Desvelo para recuperar._

Velo revisa tus tablas antes de que salgan hacia una IA, una herramienta en la nube o el computador
de un tercero: te dice **qué datos personales llevan dentro**, **a cuánta gente alcanzan a señalar
con el dedo**, y te las devuelve **anonimizadas**.

Todo ocurre **dentro del navegador**. No hay servidor, no hay carga, no hay copia.

- ✨ **Conoce Velo en 3 minutos:** [el brochure](docs/BROCHURE.html) — se abre con doble clic, y en
  la aplicación desplegada vive en la ruta `/conoce`.
- 📖 [Manual de uso](docs/MANUAL-DE-USO.md) · 🧪 [Guía de prueba](docs/GUIA-DE-PRUEBA.html) ·
  🎨 [Sistema de diseño](design-system.md)

> **Acceso.** Velo está desplegado y funcionando, pero todavía **no se publica su dirección**: el
> acceso va por **lista de espera** mientras se completa la ronda de pruebas. Mientras tanto, se
> corre en local con las instrucciones de más abajo.

---

## Las cuatro reglas que definen este producto

No son preferencias de estilo. Cada una es un **gate mecánico** que puede poner el CI en rojo.

| Regla                                   | Cómo se hace cumplir                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cero IA generativa, para siempre**    | `scripts/gate-anti-ia.mjs` audita `package.json` **y el lockfile** contra tres familias vetadas de SDKs; una dependencia transitiva cuenta igual que una directa. Es un job propio del CI y un check requerido para mergear. ([ADR-001](decisions/001-cero-ia.md))                                                                                          |
| **Los datos jamás salen del navegador** | Un e2e intercepta _todas_ las peticiones durante el flujo completo con un archivo cargado y falla si aparece una sola fuera del propio origen, con cuerpo, o con un nombre de columna en la URL. Además, la CSP le prohíbe al navegador conectarse a cualquier otro sitio, y un test de código fuente veta `fetch`, `localStorage`, `indexedDB` y compañía. |
| **Determinismo byte-idéntico**          | El mismo archivo produce el mismo diagnóstico, siempre. Hay un test que lo corre dos veces y compara la salida serializada, otro que verifica que el tamaño de los trozos del parser no cambia el resultado, y un barrido del código del motor que prohíbe `Math.random`, `Date.now`, `new Date()` y `localeCompare`.                                       |
| **Honestidad medida**                   | Las cifras exactas se presentan como exactas y llevan su denominador; los topes se declaran donde se aplican. Un test barre la interfaz buscando las frases prohibidas («anonimato garantizado», «100 % seguro», «imposible de reidentificar»).                                                                                                             |

Y una quinta que gobierna el repositorio: **ni un dato real, en ninguna parte**. Todos los archivos
de prueba salen del generador sintético con semilla (`docs/kit-de-prueba/`).

---

## Qué hace hoy

**Sprints 001–004 · El diagnóstico, el disfraz, el regreso y el cierre.** Velo lee, mide,
**transforma, devuelve** y ahora **deja constancia**. El círculo está cerrado —entregas sin
entregar, y recuperas— y además queda por escrito.

Sobre la reversibilidad, dicho con precisión: un seudónimo **sigue siendo irreversible por sí
mismo** — es un HMAC, no un cifrado. Lo que el S3 añade es que puedes pedirle a Velo que guarde la
correspondencia en una **bóveda cifrada aparte**, un archivo que tú custodias. Sin esa bóveda y su
frase de paso, el seudónimo no vuelve; con ella, sí.

- **El regreso**: cargas la bóveda y el archivo que te devolvieron, y los valores originales
  vuelven. Por **valor**, no por posición: sobrevive a que el tercero reordene filas, añada
  columnas, borre otras y corrija valores a mano — y su trabajo se respeta.
- **Carga** de CSV (sin tope) y Excel (hasta 150 MB, medido) con arrastre y con teclado.
- **Detección por columna** con validadores que **citan su fuente oficial en el código**: NIT con el
  mod 11 de la DIAN, tarjetas con Luhn (ISO/IEC 7812-1), IBAN con el 97-10 (ISO 13616), celulares y
  fijos de la CRC, placas, cédula (estructural — no existe dígito de verificación público),
  correo, IP, coordenadas y fechas.
- **Tres niveles de certeza** —confirmado por algoritmo · reconocido por su forma · sin confirmar—
  porque afirmar todo con la misma seguridad sería exagerar.
- **Cuatro categorías de la Ley 1581 de 2012** en su sentido exacto: identificador directo,
  cuasi-identificador, dato sensible del art. 5, no personal.
- **Riesgo de reidentificación exacto** (modelo _prosecutor_): k mínimo, riesgo máximo, promedio y
  porcentaje de registros únicos, contados sobre el archivo completo.
- **Consejero de cruces**: qué combinaciones de columnas delatan, con su k real — y qué quedó fuera
  del análisis, con su motivo.
- **Reporte HTML autocontenido** con la huella SHA-256 del archivo, para que quien lo reciba pueda
  comprobar que habla de esa copia exacta.
- **Certificado de tratamiento** con **las dos huellas** —la del archivo que entró y la del que
  sale— y las órdenes exactas para recalcularlas en macOS, Linux y Windows. Con la segunda, quien
  recibe el archivo puede **comprobar** que el documento habla de su copia, en vez de creerlo.
- **Bitácora cifrada** (`.velolog`): qué trataste, cuándo, con qué política y con qué riesgo antes y
  después. Archivo propio, aparte de la bóveda, con su propia frase de paso — va cifrada porque el
  nombre de un archivo ya cuenta de qué va su contenido.
- **Riesgo poblacional estimado**, etiquetado como estimado y **jamás compuesto con el exacto**: el
  riesgo individual de Benedetti–Franconi (1998) y los únicos poblacionales de Zayatz (1991), cada
  uno citando su fuente en el código, con su modelo y su supuesto en la misma línea que la cifra. Si
  la muestra no da para estimar, **lo dice** en vez de devolver un número débil.
- **Política por columna** —o **Habeas Data** / **HIPAA Safe Harbor** de un clic, cada una citando su
  fuente— que se exporta e importa como archivo y lleva su propio **hash SHA-256** como identidad.
- **Cuatro familias de técnicas**: enmascarar, seudonimizar (HMAC-SHA256 con llave derivada por
  PBKDF2-600k), seudonimizar **conservando el formato** (con el dígito de verificación oficial
  recalculado — no es FPE, y el código dice por qué), generalizar y suprimir.
- **k-anonimato con Mondrian** (LeFevre et al., ICDE 2006) sobre las columnas que se marquen, con
  **l-diversity** y **t-closeness** medidas y reportadas.
- **Balance antes/después** con una regla dura: si algo quedó sin tratar, **eso se lee antes que
  cualquier porcentaje de reducción**, y la cifra pierde el tratamiento de titular.
- **Archivo CSV anonimizado** escrito por el navegador —nunca por un servidor— y su **reporte del
  tratamiento**, que declara qué se le hizo y que su huella es la del archivo que _entró_.

Rendimiento medido: **500.000 filas × 24 columnas (130 MB) en unos 5 segundos** para el diagnóstico
y **~1,4 s** para el reparto de Mondrian sobre 8 cuasi-identificadores, con **cero tareas largas** en
el hilo principal.

---

## Cómo correrlo

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Necesitas Node 22+ y pnpm (la versión la fija `packageManager` en el `package.json`).

### Archivos de prueba

```bash
pnpm kit:generar -- --filas 3000 --seed 42 --perfil clinico --salida tmp/clinico.csv
```

Perfiles: `clinico` (24 columnas, con columnas-trampa), `limpio`, `trampas`, `sin-personales`.
Misma semilla ⇒ mismo archivo, byte por byte.

### Verificación

```bash
pnpm test            # unitarias + integración, con cobertura
pnpm test:e2e        # Playwright: flujo completo, garantía de red, 500k, axe, rendimiento
pnpm gate:anti-ia    # el gate de la regla dura nº1
pnpm typecheck && pnpm lint && pnpm build
```

---

## Cómo está hecho

```
src/
├─ app/            Next.js App Router — la aduana (/) y el diagnóstico (/diagnostico)
├─ components/     interfaz, sin lógica de negocio
├─ engine/         motores puros y deterministas: validadores, clasificador, riesgo, reporte
├─ workers/        el worker: LA FRONTERA — los datos crudos viven aquí y solo aquí
└─ lib/            sesión en memoria, formato, SHA-256, observabilidad
docs/kit-de-prueba/  generador sintético con semilla — la única fuente de datos de prueba
decisions/           ADRs
sprints/             bitácora y resumen de cada sprint
```

**La frontera.** El archivo se lee, se clasifica y se mide **dentro del worker**. Hacia la interfaz
solo cruzan conteos, nombres de columna, proporciones y muestras ya enmascaradas — nunca el
dataset. Cuando la sesión se descarta, el worker se termina y con él muere la única copia.

**Sin backend.** No hay base de datos, ni API con datos, ni servicio externo. Vercel sirve la
aplicación; los datos viven y mueren en la pestaña.

---

## Licencia y datos

Repositorio público. **Nunca subas un archivo real de una persona**, ni siquiera para probar: para
eso está el kit sintético.
