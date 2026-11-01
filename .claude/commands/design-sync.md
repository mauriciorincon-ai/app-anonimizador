---
description: Publica el design system de esta app en Claude Design, incrementalmente, desde el bundle versionado del repo.
disable-model-invocation: true
---

# /design-sync

Publica el design system de esta app en **Claude Design** (tool `DesignSync`) de forma
**incremental**: solo lo que cambió, nunca un reemplazo masivo.

> Origen: piloto de `app-ds` (2026-08-15), adoptado al kit en v1.17.0 tras la fricción de su
> cierre de ciclo H1 — el método ordenaba publicar y **no definía cómo**, así que cada sesión
> improvisaba con el tool crudo y el bundle vivía en el scratchpad efímero.

## Las tres piezas y su jerarquía

1. **`design-system.md`** — la **fuente de verdad** (prosa + tokens). Manda sobre todo.
2. **`design-sync/`** — el **bundle publicable, VERSIONADO en el repo**. Espejo 1:1 de lo
   publicado (`README.md`, `styles.css`, `components/<grupo>/<tarjeta>.html`). **Deriva** del
   design-system; jamás lo contradice.
3. **El proyecto en Claude Design** — la **vitrina**. Se escribe desde el bundle y **nunca se
   edita allí directamente**: no hay camino de vuelta al repo.

El destino vive en **`design-sync/project.json`** (`projectId`, `name`, `publishedFiles`,
`lastPublished`). **Léelo — no busques con `list_projects` ni crees proyectos.** Si el archivo
falta o el proyecto no existe, **detente y pregunta al usuario**: la cuenta tiene varios
proyectos y dos con nombre genérico, así que adivinar el destino es publicar en el sitio
equivocado.

## Procedimiento

1. **Actualiza el bundle EN EL REPO** (`design-sync/`), jamás en el scratchpad. Reglas de tarjeta:
   - **Primera línea EXACTA:** `<!-- @dsCard group="<Grupo>" name="<Nombre>" -->` — así indexa
     Claude Design sus tarjetas; **sin ella la tarjeta no aparece**.
   - HTML **autocontenido** (CSS inline, cero CDNs), `lang="es"`, tokens/hex de la paleta canónica
     del `design-system.md`.
   - Grupos: usa la categorización del propio design system (p. ej. `Fundamentos` ·
     `Componentes` · `Componentes · SN`).
2. **El diff ES el plan:** `git status design-sync/` dice exactamente qué publicar. Nada más.
3. **Publica** con el tool `DesignSync` (schema diferido: cárgalo con `ToolSearch`
   `select:DesignSync`):
   - `list_files` — verifica el estado remoto (barato, sin prompt de permiso).
   - **Comprueba que el conteo remoto coincide con `publishedFiles` de `project.json`
     (kit v1.17.0).** Si NO coincide, **detente y avisa al usuario**: alguien editó en Claude
     Design y el repo diverge en silencio; publicar encima lo pisaría sin dejar rastro. *(Sin
     esta comprobación, «nunca se edita allí» es una buena intención sin mecanismo.)*
   - `finalize_plan` con `writes` = SOLO los paths cambiados, `deletes` = los eliminados
     (**el campo es obligatorio aunque vaya `[]`**), `localDir` = el `design-sync/` del repo.
     **Este es el punto de control humano**: el usuario ve la lista exacta de rutas y el
     directorio de origen, independiente de lo que tú le cuentes.
   - `write_files` con `localPath` — el contenido sube desde disco y no pasa por tu contexto.
4. **Cierra el registro:** actualiza `lastPublished` y `publishedFiles` en `project.json`, anota
   en la bitácora del sprint qué se publicó y por qué, y commitea. *(El `projectId` es un UUID de
   proyecto, no un secreto — pero en `project.json` no va NINGÚN token.)*

## Cuándo

- **En todo sprint que tocó UI: el bundle se actualiza EN EL MISMO PR** (kit v1.17.0). Son
  archivos del repo, cuestan nada y entran a la revisión con todo lo demás. **Publicar puede
  esperar** al cierre de ciclo: así el cierre es un delta pequeño y **nunca una reconstrucción**.
- **Publicar es OBLIGATORIO en el cierre de ciclo** (CLAUDE.md § Cierre de CICLO).
- Los cambios visuales que salgan de un gate ⭐ se reflejan en `design-system.md` **primero**,
  luego en el bundle, y solo entonces se publican.

## Quién — EL USUARIO INVOCA, EL CONSTRUCTOR EJECUTA (kit v1.18.0)

Este comando lleva `disable-model-invocation`: **solo el usuario lo escribe** — el disparador es
suyo, y con él decide el CUÁNDO. Una vez invocado, **tú (el constructor) ejecutas TODO el
trabajo** con la herramienta `DesignSync`: verificar/crear el proyecto, armar el bundle, planear,
publicar, registrar. *Lo reservado es el disparador, no el trabajo* (demostrado en Velo,
2026-08-15). Y siempre en **la sesión de ESTA APP**, no la planeadora: el bundle, el
`project.json` y este comando viven aquí, donde ella no escribe — su `/cierre-sprint` **solo
verifica** que `lastPublished` no esté rancio.

**Cuándo se invoca en un cierre de ciclo: DESPUÉS del gate ⭐⭐ corto** — la publicación es de un
sistema que el usuario ya juzgó, nunca de uno que no ha visto.

## Por qué el bundle vive en el repo (la lección que lo originó)

En el cierre H1 de ds el bundle se construyó en el scratchpad de sesión (efímero). Al retomar días
después quedaban **4 de 13 archivos**: el diff incremental era imposible y hubo que reconstruir la
copia local bajando del proyecto remoto archivo por archivo. Versionado en `design-sync/`, el
bundle **sobrevive a las sesiones**, el diff es `git status`, la revisión ocurre en el PR y
gitleaks lo escanea como a todo lo demás. *Un entregable de ciclo que vive fuera del repo no tiene
versión, ni diff, ni revisión, ni supervivencia.*
