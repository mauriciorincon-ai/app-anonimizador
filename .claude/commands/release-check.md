---
description: Checklist pre-merge a main del PERFIL ESCRITORIO (Tauri) — ≤ 10 casillas MANUALES; sustituye a /deploy-check. Todo lo demás lo corre la CI; si no está en la CI, no es casilla.
---

# /release-check

**Todo lo demás lo corre la CI (`quality` · `e2e` · `build-escritorio`); si no está en la CI, no es
casilla.** Aquí mergear no publica nada: la app se distribuye como binario. Se corre después de
`/audita-sprint`, antes de abrir el PR. Las pruebas `hardware` las corrió la CI; las `en_vivo_*` solo con
la matriz de la regla 24 y su «sí», o se declaran aplazadas con fecha.

- [ ] 1. **La app arranca** (`pnpm tauri dev`) y el flujo principal funciona; es usable SIN permisos
      concedidos (estado explícito, no crash).
- [ ] 2. **Capturas leídas como imagen** de las pantallas tocadas: ambos temas, un idioma (el otro al hito),
      los tamaños de ventana del `playwright.config.ts`, ningún desborde.
- [ ] 3. **Binario construido** (`pnpm tauri build`, manual: exige el Mac del usuario) **si entró un lote de
      dependencias** o es el cierre del hito; tamaño del bundle anotado en el cierre; tests que dependen del
      binario corridos con `--release` si el sprint los tocó.
- [ ] 4. **Permisos TCC con matriz:** cada permiso que la app pide (micrófono · pantalla y audio del sistema ·
      accesibilidad) tiene su `NS*UsageDescription` en ES y EN, su estado en la UI con símbolo + texto +
      color, y su fila de matriz con el «sí» del usuario si este sprint lo tocó.
- [ ] 5. **Ventana protegida** (si aplica): `content_protected: true` con test unitario; la parada «la
      ventana NO aparece en la pantalla compartida» está en la guía para el gate humano del hito.
- [ ] 6. **No persistencia 4-T** (solo `captura_terceros: true`): tras una sesión completa, cero archivos
      nuevos fuera de la carpeta de notas; un término plantado en la sesión no aparece en ningún log;
      salidas a red = 0 en modo local (`verify:ephemeral` estático lo corre la CI; esto es la corrida real).
- [ ] 7. **`cargo audit` limpio** en `src-tauri/` (o ADR con la excepción) — manual porque la CI no lo corre.
- [ ] 8. **`docs/MANUAL-DE-USO.md` actualizado** y **cierre ejecutivo** ≤ 40 líneas con la salida de
      `node scripts/horas-sprint.mjs` y la sección Auditoría (deuda M/B con `archivo:línea`; cero C/A abiertos).
- [ ] 9. **Checks `quality` · `e2e` · `build-escritorio` con conclusión propia `success`** al final
      (`gh pr checks <N>`), y **cero enlaces**: `node scripts/cero-enlaces.mjs --homepage "$(gh repo view --json
      homepageUrl -q .homepageUrl)"` en verde (dominios de `cero-enlaces.json`; en escritorio se suma
      `releases/download`: ningún enlace de descarga del binario — la app se muestra, no se entrega).
- [ ] 10. **Protecciones del sistema enseñadas:** toda acción del sprint sobre Llavero, TCC, launchd, ítems
      de inicio, Touch ID o Automatización tiene su matriz y su «sí» en el cierre; el comando de pruebas por
      defecto no abrió ninguna. Si no hubo: «n/a».

## Output

`✅ Pasa (n/10)` · `❌ Falla (n/10) — bloquea merge` (con su fix) · `Decisión: MERGE OK | NO MERGE`.
Si NO MERGE, termina ahí. Si MERGE OK, el merge (squash) lo hace el usuario — no mergees tú.
