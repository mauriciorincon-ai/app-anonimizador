# Aprovisionamiento — runbook [TÚ]/[CLAUDE] (plantilla del kit, v1.6.4)

> Plantilla nacida del S1 de Innmobiliaria (`app-inmobiliaria/docs/APROVISIONAMIENTO.md` —
> implementación de referencia: Supabase cloud + Cloudflare Workers, cero fricción de
> coordinación). **Cuándo se usa:** en todo sprint que aprovisione servicios externos, el builder
> escribe `docs/APROVISIONAMIENTO.md` de su app siguiendo esta estructura; la orden de
> construcción lo referencia.

## Convención (no negociable)

- **[TÚ]** = solo puede hacerlo el dueño de las cuentas (navegador, logins, aprobaciones de
  pago). Cada paso [TÚ] dice: dónde entrar, qué valores usar, cuánto toma.
- **[CLAUDE]** = comando NO interactivo que corre el agente. Cada paso [CLAUDE] es
  copiable/ejecutable tal cual.
- **Regla de oro:** claves privilegiadas (service keys, contraseñas) JAMÁS se pegan en un chat
  ni se commitean — van a `.env.local` (gitignored) o al gestor de secrets del servicio. El
  hook de gitleaks vigila, pero la regla es no llegar ahí.
- **Verificación en vivo POR BLOQUE:** cada bloque termina con una prueba observable ("el
  registro aparece en la tabla", "el cron quedó verde") antes de pasar al siguiente. Nada de
  "configurar todo y probar al final".

## Estructura del runbook

1. **Mapa del despliegue** — tabla pieza · servicio · qué es. El ORDEN de los bloques importa y
   se justifica (p. ej.: primero la BD, sin ella la app no tiene dónde escribir).
2. **Con qué cuenta entrar a cada servicio** — tabla servicio · identidad · por qué.
   **Regla de identidad:** SSO (GitHub/Google) para servicios satélite; **credencial de primera
   mano + 2FA para la casa de la infraestructura** (quien sostenga dominio/DNS/almacenamiento no
   debe caer si el SSO falla). Identificar el punto único de falla (el correo raíz) y exigirle
   2FA.
3. **Bloques numerados** ([TÚ]/[CLAUDE] intercalados, con tiempos estimados y verificación al
   cierre de cada uno).
4. **Al terminar** — checklist observable + qué queda pendiente para fases futuras (p. ej. lo
   que solo aplica al publicar de verdad: dominio, correos reales, quitar noindex).
5. **Problemas conocidos y su solución** — tabla síntoma · causa probable · fix (se alimenta
   DURANTE el aprovisionamiento, no de memoria después).

## Bloque OBLIGATORIO si el servicio es Supabase free (kit v1.8.1)

**El proyecto free se pausa tras ~7 días sin actividad de API** — con la app viva. Ningún
aprovisionamiento de Supabase termina sin su keep-alive; va en el MISMO sprint que crea el
proyecto, no "después":

1. **[CLAUDE]** aplicar la migración `ping()` (SQL al final de
   `docs/supabase-keep-alive.plantilla.yml`): función `stable` que no lee ni escribe tablas,
   con `execute` otorgado solo a `anon`.
2. **[CLAUDE]** copiar esa plantilla a `.github/workflows/supabase-ping.yml` (cadencia
   **lunes y jueves** — jamás semanal: el umbral es de 7 días y los crons de GitHub se
   retrasan horas).
3. **[TÚ]** cargar los secrets del repo `SUPABASE_URL` y `SUPABASE_ANON_KEY`
   (Settings → Secrets and variables → Actions), ~2 min.
4. **Verificación en vivo del bloque** (regla de oro de esta plantilla): disparar el workflow
   a mano (`gh workflow run supabase-ping.yml`) y confirmar que termina **verde con respuesta
   2xx real** — no basta con que exista. El summary del sprint registra esa corrida.

**Trampa de segundo orden a declarar en la deuda:** GitHub deshabilita los workflows
programados de un repo **sin actividad por 60 días** — una app que el portafolio deja quieta
pierde su keep-alive y luego su proyecto (quedan 90 días para reactivar desde el dashboard).
**Cuándo dejar de parchear:** al pasar a comercial con usuarios reales (G-Release), el pause
deja de ser molestia y es punto único de falla del negocio → el plan Pro se evalúa como costo
de operación y se declara en el `BLUEPRINT.html`.
