# ADR-002 — Veredicto del spike de Mondrian: viable tal cual en JavaScript

- **Estado:** aceptada
- **Fecha:** 2026-08-09
- **Sprint:** 001 · Fase 0 (de-risk del Sprint 002)
- **Decide:** que el k-anonimato del S2 se implemente con Mondrian en TypeScript puro dentro del
  worker, sin WASM y sin rediseñar la representación de datos.

## Contexto

El S2 necesita k-anonimato (C5 del brief). Mondrian (LeFevre, DeWitt, Ramakrishnan, _Mondrian
Multidimensional K-Anonymity_, ICDE 2006 — [PDF](https://pages.cs.wisc.edu/~lefevre/MultiDim.pdf))
es el candidato: greedy top-down, corta por la dimensión de mayor rango, particiona por la mediana,
**O(n log n)** frente a lo exponencial del óptimo, que es NP-hard.

Pero la investigación F1 dejó un gap explícito: _"no existe benchmark publicado de Mondrian en JS a
500k filas; la viabilidad se infiere de la complejidad del paper. **Amerita spike de 1 día en el
primer sprint**"_. Construir el S2 encima de una inferencia habría sido apostar.

## Medición

Implementación desechable en `scripts/spikes/spike-c-mondrian.mjs` sobre el dataset sintético de
500.000 filas (`--seed 42`, perfil clínico, 24 columnas). Node 24 (mismo V8 del navegador), k=5,
categóricos proyectados a su código de diccionario ordenado alfabéticamente.

| QIs                                       | Tiempo de Mondrian | Proyección | Clases de equivalencia | Clase mínima | Heap del paso |
| ----------------------------------------- | ------------------ | ---------- | ---------------------- | ------------ | ------------- |
| 3 (sexo, municipio, estrato)              | **61 ms**          | 2 ms       | 203                    | 1.501        | ~0 MB         |
| 5 (+ grupo étnico, fecha nac.)            | **120 ms**         | 21 ms      | 58.576                 | 5            | 0,6 MB        |
| 8 (+ diagnóstico, fecha atención, correo) | **171 ms**         | 78 ms      | 65.433                 | 5            | ~0 MB         |

Cero clases por debajo de k en los tres escenarios. **Dos corridas consecutivas produjeron
particiones idénticas** (mismo número de clases, mismo mínimo) — el desempate fijado por índice de
dimensión hace la salida reproducible, que es requisito de producto, no una preferencia.

## Veredicto

**Viable tal cual.** No hace falta WASM, ni DuckDB-WASM, ni el patrón de chunks de SKALD, ni un
columnar más agresivo del que ya existe. El caso más pesado medido (8 QIs, 500k filas) corre en
**171 ms** — tres órdenes de magnitud por debajo del umbral de "congela la UI", y eso corriendo en
el hilo principal de Node; en el worker ni se nota.

El costo real está en la **proyección** de categóricos a dominio ordenado (78 ms con 8 QIs, y crece
con la cardinalidad: `correo` tiene 112.444 valores únicos), no en el algoritmo. Es el número a
vigilar en el S2, y se puede cachear por columna.

## Consecuencias para el Sprint 002

1. Mondrian entra en TypeScript puro a `src/engine/`, sobre la `TablaColumnar` que ya existe.
2. **Los planes B quedan archivados, no descartados**: si un dataset excediera la RAM de la
   pestaña, el patrón SKALD (estadísticas suficientes por chunk,
   [arXiv:2505.03529](https://arxiv.org/abs/2505.03529)) sigue siendo la salida. Hoy no hace falta.
3. **El desempate se documenta como parte del contrato**: dimensión de mayor rango, empate resuelto
   por menor índice de columna; partición por valor (≤ mediana | > mediana), no por posición —
   cortar por posición dejaría clases que violan el propio k cuando la mediana se repite mucho.
4. Lo que este spike **no** midió: l-diversity y t-closeness. Verificarlas sobre una partición ya
   formada es lineal (lo NP-hard es optimizarlas: [arXiv:0912.5426](https://arxiv.org/abs/0912.5426)
   y [Springer](https://link.springer.com/chapter/10.1007/978-3-642-37487-6_26)), así que el riesgo
   es bajo — pero queda declarado como no medido.
5. El código del spike **no entra al producto**: midió, dio su veredicto y su valor está aquí.

## Nota de honestidad

Estos números salen de una máquina de desarrollo con RAM holgada. Escalan con el tamaño del
dataset, no con la máquina, y el margen es tan amplio (171 ms) que ni un equipo diez veces más
lento cambiaría el veredicto. Aun así, el S2 debe medir en su propio gate de rendimiento en vez de
citar esta tabla.
