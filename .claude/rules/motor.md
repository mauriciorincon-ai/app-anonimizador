---
paths:
  - "src/engine/**"
  - "src/workers/**"
  - "src/lib/**"
  - "velo-local/**"
  - "tests/unit/**"
---

# Patrones de dominio del motor de Velo

- **Validador con fuente:** cada validador de `src/engine/validadores/` (`colombianos.ts`, `universales.ts`, `europeos.ts`) cita en comentario la fuente oficial de su algoritmo (DIAN mod 11, CRC +57, Luhn ISO/IEC 7812-1, IBAN ISO 13616…): si lo marca, es porque el algoritmo oficial lo confirma; los fixtures sintéticos traen casos FUERA de rango (NIT con DV inválido, cédulas imposibles, columnas trampa que parecen sensibles y no lo son). Un seudónimo con formato jamás coincide con la entrada.
- **El worker es la frontera** (regla dura 7): los datos crudos viven en el worker; hacia la UI solo viajan agregados, muestras enmascaradas y metadatos. En Velo local la frontera es el proceso: nada sale de él salvo hacia la base configurada y los archivos que el usuario indica.
- **Determinismo verificable** (regla dura 3): desempates fijados (orden de columnas, medianas estables), cero aleatoriedad sin semilla y el test byte-idéntico como regresión permanente; por trozos = en memoria y Velo local = navegador, byte a byte.
- **Muestras siempre enmascaradas:** cuando la UI muestra un valor de ejemplo va parcialmente enmascarado (`1032456789` → `103***89`, `src/engine/mascara.ts`): ni el diagnóstico expone datos completos innecesariamente.
