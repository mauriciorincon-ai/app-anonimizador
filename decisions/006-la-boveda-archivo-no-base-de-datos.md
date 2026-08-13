# ADR-006 — La bóveda es un archivo cifrado, y su determinismo se mide en claro

- **Estado:** aceptada
- **Fecha:** 2026-08-11
- **Sprint:** 003 · Fase 1
- **Decide:** dónde vive la correspondencia que permite el regreso, cómo se cifra, y por qué el gate
  de determinismo byte-idéntico **no** se aplica al archivo cifrado.

## Contexto

El S2 entregó el disfraz: HMAC-SHA256 sobre el valor, y el original no vuelve. El S3 entrega la
vuelta, y para eso hace falta guardar en algún sitio qué seudónimo salió de qué original. Ese «algún
sitio» contiene **los valores originales del usuario** — o sea, el material más sensible que Velo
llega a tener en las manos, más concentrado que el archivo de entrada: una tabla de identificadores
sin nada alrededor.

Tres decisiones que un lector futuro va a querer discutir, y por eso están aquí y no en un comentario.

## 1. Archivo portable, no base de datos del navegador

**IndexedDB queda descartado, incluso como caché de la sesión en curso.**

El gate de privacidad (`tests/unit/privacidad.test.ts`) veta `indexedDB` en todo `src/`, con una
nota que el S1 dejó escrita: «la bóveda cifrada es del S3, con llave del usuario y su ADR». Este es
ese ADR, y **usa la excepción para no usarla.**

- **No compra nada.** El artefacto durable tiene que ser el archivo de todas formas: la bóveda hay
  que poder llevársela a otro computador, guardarla con el archivo anonimizado y abrirla meses
  después. Una copia en IndexedDB sería una segunda fuente de la misma verdad.
- **Cuesta la promesa visible del S1.** «Al recargar la página no queda nada» es lo que el usuario
  ve y lo que el estado vacío del diagnóstico explica. Una caché que sobrevive a la recarga la
  vuelve falsa, aunque esté cifrada.
- **El precio de equivocarse es asimétrico.** Un archivo que el usuario perdió es un problema suyo,
  con consecuencia comunicada. Una copia de sus identificadores dormida en el navegador de un equipo
  compartido es un problema que él no sabe que tiene.

El gate se queda como está, sin excepción y sin lista de excepciones.

## 2. AES-GCM con IV único, y el determinismo medido en claro

**Esta es la parte que parece una contradicción y no lo es.**

La regla dura nº3 dice que mismo input + misma política + misma llave ⇒ misma salida, byte por byte,
y hay un gate de CI que lo comprueba. AES-GCM exige un **IV único por operación**: reusar el par
(llave, IV) permite recuperar la llave de autenticación y falsificar mensajes — es el fallo clásico
del modo, no un detalle. Así que **dos sellados de la misma bóveda dan bytes distintos, y tienen que
darlos**.

Un gate que exigiera `.velo` byte-idéntico solo se podría satisfacer fijando el IV, es decir
cometiendo ese error. Por eso:

> **El determinismo se mide sobre `serializarBoveda` —el texto en claro— y sobre el archivo
> restaurado. Jamás sobre el `.velo`.**

Y se mide de verdad: `tests/unit/boveda.test.ts` comprueba que dos serializaciones de la misma
bóveda son idénticas, que el orden en que llegan columnas y valores no cambia su huella, y —del otro
lado— que dos sellados **sí** difieren y aun así abren la misma bóveda. Las dos mitades juntas son
la afirmación completa; cualquiera de las dos sola se lee como otra cosa.

La huella que el usuario ve es el SHA-256 del claro, por la misma razón: una huella calculada sobre
el cifrado cambiaría cada vez que se guarda la misma bóveda.

## 3. El costo de derivación viaja DENTRO del archivo

La cabecera del `.velo` lleva las iteraciones de PBKDF2 en cuatro bytes:

```
[0..4)    "VELO"
[4]       versión del archivo
[5..9)    iteraciones de PBKDF2, entero de 32 bits big-endian
[9..25)   sal de PBKDF2
[25..37)  IV de AES-GCM
[37..]    texto cifrado + etiqueta de autenticación
```

Si el número viviera solo en el código, endurecerlo el año que viene volvería ilegible **toda bóveda
sellada antes** — y una bóveda que deja de abrirse es exactamente la pérdida total que el producto
existe para evitar. Cuatro bytes compran que el parámetro pueda subir sin orfanatos.

Con una consecuencia que hay que atender: la cabecera va en claro, así que un `.velo` manipulado
puede pedir cuatro mil millones de iteraciones y dejar la pestaña colgada un cuarto de hora sin que
nada parezca roto. Hay un **tope de 5.000.000** que se comprueba antes de derivar nada, con su test.

La cabecera entera va como datos autenticados adicionales (AAD): retocar la sal, la versión o las
iteraciones de un `.velo` ajeno rompe la etiqueta y el archivo se rechaza.

**La frase incorrecta la detecta el cifrado, no un control propio.** AES-GCM es autenticado: si la
llave derivada no es la que selló, la etiqueta no cuadra. No se guarda un testigo ni se compara un
hash de la frase — el modo ya lo hace, y hacerlo a mano sería añadir superficie para equivocarse.

## Medición del peor caso

Lo exigía la orden: medir **antes de que exista una sola pantalla**, porque el resultado podía
obligar a declarar un tope como el ADR-003 hizo con Excel. Se corre con
`MEDIR_BOVEDA=1 pnpm vitest run tests/unit/boveda-peor-caso.test.ts --coverage.enabled=false`.

Columna `cedula_titular` del perfil `clinico`, 500.000 filas del generador seeded (semilla 42), por
el camino real: diccionario → HMAC con formato → bóveda → serialización → cifrado → apertura.

| Qué                               | Cuánto                            |
| --------------------------------- | --------------------------------- |
| Valores distintos                 | **446.006**                       |
| Colisiones de formato             | **100** (teoría: n²/2·10⁹ ≈ 99,5) |
| `construirBoveda`                 | 289 ms                            |
| `serializarBoveda`                | 117 ms                            |
| **Tamaño en claro**               | **11,64 MB**                      |
| `huellaDeBoveda` (SHA-256 propio) | 255 ms                            |
| `sellarBoveda` (PBKDF2 + AES-GCM) | 138 ms                            |
| **Tamaño del `.velo`**            | **11,64 MB**                      |
| `abrirBoveda`                     | 123 ms                            |
| Heap al terminar                  | 240 MB                            |

**Cabe, y con holgura: no hay tope que declarar.** El peor caso del producto son 11,6 MB y menos de
un segundo de trabajo propio de la bóveda.

Dos notas sobre esas cifras:

- **El plan estimaba ~50 B por par ⇒ ~24 MB.** Medido: **26 B por par**. La diferencia es la forma
  de la estructura — arreglos paralelos (`seudonimos` + `originales`), como ya hace la tabla
  columnar, en vez de un arreglo de objetos que repetiría dos nombres de clave 446.006 veces.
- **Lo caro no es la bóveda: es el HMAC**, que en esta medición (Node) costó 3,99 s. El número del
  navegador es el del ADR-004 (0,68 s por 500.000 en Chromium); Node y Chromium no son comparables
  aquí, y por eso las dos cifras van con su origen.

## Lo que se decidió NO hacer

**No se comprime antes de cifrar.** Medido: gzip deja el claro en **3,78 MB (32 %)**, un ahorro
real de 3×. No entra porque 11,6 MB ya cabe sin apretar, y comprimir añade un paso y un modo de
fallo —un flujo truncado— cuyo síntoma sería una bóveda ilegible, que es el peor desenlace posible
del producto. Queda medido y disponible: si algún caso lo necesita, la cifra ya está y la decisión
se toma con ella, no de nuevo desde cero.

## Consecuencia que este ADR le deja al S3 y a quien siga

`ITERACIONES_PBKDF2` (600.000, mínimo de OWASP) **es una constante de compatibilidad desde el S2**,
no un parámetro. Subirla cambiaría la llave HMAC derivada de la misma frase y la misma sal, o sea
cambiaría **todos los seudónimos**, que es romper la consistencia referencial (C9) entre archivos de
meses distintos. Endurecerla exige una versión de llave y una migración.

Medido en Chromium (`tests/medicion/cripto-en-el-navegador.mjs`): **36 ms** con 600.000 iteraciones,
61 ms con un millón, 121 ms con dos. El comentario de `src/lib/llave.ts` afirmaba que «tarda del
orden de un segundo, y eso es lo que compra»; queda corregido. **La garantía es el número de
iteraciones, no los segundos** — el tiempo varía un orden de magnitud entre un portátil y un
teléfono de gama baja, y por eso el estándar se expresa en iteraciones y no en tiempo.
