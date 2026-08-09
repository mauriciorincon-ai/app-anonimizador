---
description: Auto-review de los cambios recientes como si fueras un staff engineer senior, antes de crear PR.
---

# /self-review

Revisa todos los cambios en la working copy (git diff) como un **staff engineer estricto** haría antes de aprobar un PR.

## Criterios de revisión

Analiza para cada archivo modificado:

### TypeScript y tipos
- [ ] ¿`any` usado sin justificación explícita en comentario?
- [ ] ¿Tipos exportados correctamente?
- [ ] ¿Discriminated unions usadas donde aplica en vez de booleans anidados?
- [ ] ¿Errores de runtime potenciales que los tipos no cubren?

### Manejo de errores
- [ ] ¿Cada promise tiene catch o está dentro de try/catch?
- [ ] ¿Errores loggeados con contexto suficiente?
- [ ] ¿Respuestas de error al usuario son amigables (no filtran stack traces)?

### Testing
- [ ] ¿Tests añadidos para el nuevo código?
- [ ] ¿Edge cases cubiertos (empty, null, límites numéricos)?
- [ ] ¿Tests son deterministas (sin `setTimeout` arbitrarios, seeds fijas)?

### Seguridad
- [ ] ¿Secrets hardcodeados?
- [ ] ¿Inputs de usuario sanitizados antes de ir a DB/LLM/shell?
- [ ] ¿Rate limiting en endpoints nuevos?
- [ ] ¿Auth validada server-side (no solo client)?

### Performance
- [ ] ¿Queries N+1?
- [ ] ¿`useEffect` con dependencias incorrectas?
- [ ] ¿Imágenes optimizadas (next/image)?
- [ ] ¿Bundle size impactado?

### Accesibilidad
- [ ] ¿Nuevos elementos interactivos tienen label/aria?
- [ ] ¿Focus visible?
- [ ] ¿Contraste AA?
- [ ] ¿Navegación por teclado funciona?

### Observabilidad
- [ ] ¿Nuevos endpoints loggean request?
- [ ] ¿Errores capturados por Sentry?
- [ ] ¿Events de PostHog si es user action significativa?

### Código limpio
- [ ] ¿Funciones <50 líneas?
- [ ] ¿Nombres descriptivos (no `data`, `temp`, `foo`)?
- [ ] ¿Sin código comentado ni console.logs olvidados?
- [ ] ¿Sin duplicación?

## Output esperado

Un reporte estructurado:

```
### ✅ OK
- archivo.ts: ...

### ⚠️ Issues (requieren fix antes de PR)
- archivo.ts:42 — descripción del problema + sugerencia

### 💡 Suggestions (opcionales, mejora)
- archivo.ts:80 — sugerencia

### 📊 Métricas
- Tests añadidos: N
- Cobertura afectada: +X%
- Bundle impact: +Y KB
```

Al final, decide: **"Listo para PR"** o **"Arreglar antes de PR"**. Sé estricto.
