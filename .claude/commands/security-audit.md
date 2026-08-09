---
description: Corre una auditoría de seguridad OWASP sobre el estado actual del código.
---

# /security-audit

Ejecuta una pasada de auditoría de seguridad completa usando el skill `security-owasp` como guía.

## Pasos

1. **Scan de secrets:** revisa el working copy y la historia reciente de git por secrets potenciales (API keys, tokens, passwords). Usa patrones de gitleaks como referencia.
2. **Audit de dependencias:** corre `pnpm audit --audit-level high` y reporta vulnerabilidades críticas y altas.
3. **Review del código reciente** (último sprint) contra el checklist OWASP Top 10 de `security-owasp.md`:
   - A01 Broken Access Control — rutas autenticadas validan sesión server-side, RLS en DB.
   - A02 Cryptographic Failures — HTTPS, secrets en env, JWT con expiración.
   - A03 Injection — query builders, sanitización de prompts LLM, input validation con Zod.
   - A04 Insecure Design — rate limiting, least privilege.
   - A05 Security Misconfiguration — CSP headers, X-Frame-Options, mensajes de error sin stack traces.
   - A06 Vulnerable Components — audit + Dependabot.
   - A07 Auth Failures — OAuth preferente, MFA disponible, bloqueo tras N intentos.
   - A08 Data Integrity — lockfile, no deserialización insegura.
   - A09 Logging Failures — auth failures loggeados, errores en Sentry.
   - A10 SSRF — whitelist de dominios en fetches server-side.

4. **Prompt injection** (si la app usa LLM): revisa que haya sanitización en cualquier path que pase input de usuario al modelo. Verifica delimitadores claros en los prompts.

5. **Headers de seguridad** en `next.config.js`: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.

## Output esperado

Un reporte estructurado:

```
### 🔴 Critical (fix inmediato, bloquea deploy)
- tipo: [injection|secrets|auth|...]
- archivo:linea
- descripción + fix sugerido

### 🟡 High (fix antes de siguiente sprint)
- ...

### 🟢 Medium / Low (tracking como deuda técnica)
- ...

### ✅ OK
- áreas revisadas sin hallazgos

### 📊 Resumen
- Critical: N | High: N | Medium: N | Low: N
- Decisión: BLOQUEAR deploy | OK para deploy con deuda tracked
```

No apliques fixes automáticamente; lista y espera aprobación.
