# design-sync — notas de este repo

Velo **no es una librería de diseño**: es una app Next.js privada, sin `dist/`, sin `exports`, sin
Storybook. Todo lo raro de aquí sale de esa diferencia. `preparar.mjs` monta el paquete que el
converter espera; ejecútalo **siempre** antes del build, y con un `pnpm build` reciente (de ahí salen
las fuentes).

```sh
pnpm build                       # necesario: next/font descarga los .woff2 en build
node .design-sync/preparar.mjs
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

## Lo que costó descubrir (no lo vuelvas a pagar)

- **El paquete sintético no puede ser un symlink a `..`.** Crea `node_modules/app-anonimizador/node_modules/app-anonimizador/…` infinito y **revienta V8** con un stack dump de 130 líneas. Tiene que ser un directorio real.
- **`src/` se COPIA, no se enlaza.** esbuild resuelve los symlinks a su ruta real, y entonces la búsqueda de `node_modules` vuelve a la del repo — con lo que el stub de `next` anidado se ignora.
- **Los alias `@/…` se reescriben a rutas relativas en la copia.** esbuild **ignora `tsconfig.json` para archivos dentro de `node_modules`**, así que ahí los alias no existen (82 errores de resolución). Por eso `cfg.tsconfig` no está en la config: no serviría.
- **Solo las 6 primitivas entran a la copia.** El entry sintético re-exporta TODOS los archivos de `srcDir`; con los 16 compuestos dentro entran `next/navigation` y `next/dynamic`, y con ellos el runtime de Next: 28 `process.env.__NEXT_*` → «process is not defined» → `window.Velo` vacío → **las 26 tarjetas en blanco**. Podarlos bajó el bundle de **1.214 KB a 26 KB**.
- **`next/link` va con stub** en el `node_modules` anidado del paquete. Legítimo: renderiza un `<a>` y en el lienzo de diseño no hay router que preservar.
- **`cssEntry` está acotado al paquete por ruta REAL** — un symlink desde el paquete a `.design-sync/` NO cuela («resolves outside the package»). Por eso la salida de Tailwind va a `<pkg>/ds-styles/`. `extraFonts`, en cambio, sí acepta rutas del repo.
- **Las variables `--fuente-*` van al CSS principal, NO al de fuentes.** El converter extrae de `extraFonts` únicamente las reglas `@font-face` y descarta el resto del archivo. Puestas ahí, `--fuente-display` quedaba declarada en `@theme` pero sin valor y **todo lo que usa `font-display` caía a la fuente de sistema sin que nada lo señalara**. Se cazó mirando la preview de `ZonaDeCarga`, que es la única primitiva con titular grande.

## La trampa de Tailwind con las previews

Tailwind genera **solo** las utilidades que encuentra escaneando código. Las previews de
`.design-sync/previews/` **no se escanean**: la entrada `@source` no funcionó ni desde una hoja
dentro de `node_modules` ni con glob explícito sobre un directorio con punto. Consecuencia: cualquier
clase que uses en una preview y la app no use **no existe en la hoja compilada, y la celda renderiza
sin estilo sin que ningún flag falle**.

**Regla para escribir previews aquí:** usa clases que la app ya use (`text-tinta`, `text-acento`,
`size-4/5/6/8`, `flex`, `gap-3`), y para cualquier otra cosa —tamaños, layout de la demo— **`style`
en línea**. Es lo que hacen hoy las 26.

## Hallazgos que fueron al producto

- **Los iconos no escalan con `size-*` ni `h-*`/`w-*`.** El componente fija `h-[1.05em] w-[1.05em]`, que empata en especificidad, así que gana el orden del CSS. El tamaño lo manda el `font-size` del padre — que es justo lo que los mantiene del tamaño del texto. Documentado en `docs/iconos.md`.
- **`MarcaDeSello` sin clase de tamaño renderiza vacío**: el SVG no tiene dimensión propia y el componente solo acepta `clase`, no `style`.

## Known render warns

Ninguno pendiente. `MarcaDeSello` daba `[RENDER_THIN]` mientras su preview usaba clases inexistentes;
con tamaños reales dejó de darlo. Si vuelve a aparecer, sospecha primero de la hoja compilada.

## Alcance, y por qué

Se sincronizan **26 componentes de 6 archivos**: las primitivas de `design-system.md` § 3. Los 16
compuestos de pantalla (`taller`, `bitacora`, `editor-de-politica`…) quedan **fuera a propósito**:
están atados a los workers y al estado de sesión, no renderizan solos, y el propio sistema de diseño
dice que no se reutilizan fuera de su pantalla. Decisión del usuario el 2026-08-15.

## Re-sync risks

- **`src/` viaja como copia.** Si cambian los componentes, `preparar.mjs` la regenera — pero si alguien añade una primitiva nueva hay que **añadirla a la lista `PRIMITIVAS`** del script o no entrará.
- **Las fuentes salen de `.next/`**, así que el build tiene que ser reciente y de la misma versión de Next. Si `next/font` cambia de formato, el script falla ruidosamente (`sin @font-face en .next`), que es lo que se quiere.
- **`velo.css` se recompila cada vez**; si Tailwind cambia de mayor, revisa que las utilidades sigan saliendo con los mismos nombres.
- **`node_modules/app-anonimizador/` no sobrevive a un `pnpm install --frozen-lockfile`** que limpie node_modules. Es esperado: `preparar.mjs` lo reconstruye.
- **Las calificaciones de las 19 previews de icono se emitieron sobre una plantilla común**, verificando a fondo `IconoArchivador` y `IconoCertificado` más las dos hojas de contacto que muestran las 26 tarjetas. Si alguien cambia la plantilla, conviene mirar más de dos.

## Ajuste tras el ejercicio introspectivo (2026-08-15)

La pregunta «¿el agente puede rehacer el front con esto?» dio **no** en la primera versión, por tres
huecos, ya pagados:

- **El idioma de formularios no estaba** (y el taller es la mitad de la app): ahora vive en
  `conventions.md § Formularios` con las clases exactas verificadas, y como ejemplo imitable en la
  celda `Panel → LaLlaveDelProyecto`.
- **El patrón del selector de archivo** (input `sr-only` tras un `Boton discreto`): documentado en la
  misma sección.
- **`design-system.md` no viajaba**: `preparar.mjs` lo copia a `<pkg>/docs/` y el converter lo
  publica en `guidelines/` — los 5 estados del §4 y las reglas del §5 ahora son visibles al agente.
