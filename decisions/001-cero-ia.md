# ADR-001 — Cero IA generativa en el runtime, para siempre

- **Estado:** aceptada
- **Fecha:** 2026-08-09
- **Sprint:** 001 · Fase 0
- **Decide:** que Velo no incorpore ninguna IA generativa en el producto, y que esa ausencia se
  verifique por máquina en cada PR.

## Contexto

El pipeline AI-APPs construye apps con IA generativa adentro; el estándar 7 la regula y la regla
"código primero" exige un ADR para _activarla_. Velo es el primer caso del portafolio que necesita
el ADR para lo contrario: **justificar por qué jamás se activa.**

No es una limitación técnica ni de presupuesto. Es la propuesta de valor:

1. **Reproducible ⇒ auditable.** El producto promete que el mismo archivo, con la misma política y
   la misma llave, da la misma salida byte por byte, y emite un certificado con huellas SHA-256
   que alguien puede verificar. Un modelo generativo —con temperatura cero incluida— no ofrece esa
   garantía a través de versiones, proveedores ni actualizaciones de pesos. Con IA en el camino, el
   certificado dejaría de significar algo.
2. **El mercado ya está lleno de lo otro.** La investigación de mercado (F1) encontró que la
   categoría entera se mueve hacia detección con NER y modelos: Presidio, Nymiz, Private AI, los
   prototipos de HN con BERT local. Todos comparten el mismo defecto para este usuario: si el
   detector _estima_, el usuario no puede saber si lo que quedó sin marcar era inocuo o fue un
   falso negativo. Velo dice: si lo marqué, es porque el algoritmo oficial lo confirmó — el DV del
   NIT según la DIAN, Luhn según ISO 7812-1, el mod 97-10 del IBAN.
3. **Coherencia con la regla de privacidad.** Los datos jamás salen del navegador. Una API de LLM
   es, por definición, datos saliendo del navegador. Y un modelo local (transformers.js, ONNX,
   WebLLM) reintroduce la adivinanza y varios cientos de MB de descarga en una app cuyo argumento
   es que abres una URL y arrastras un archivo.
4. **Deuda regulatoria.** La Circular Externa 002/2024 de la SIC ya regula el tratamiento de datos
   personales en sistemas de IA. Una herramienta de cumplimiento que use IA para decidir qué es un
   dato personal hereda esa carga sin necesidad.

## Decisión

**Cero IA generativa en el runtime del producto, sin excepciones ni "solo para esta feature".**

El veto cubre tres familias, no solo las APIs remotas:

| Familia                     | Ejemplos                                                                                    | Por qué también está vetada                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| SDK de proveedor de LLM     | `openai`, `@anthropic-ai/*`, `@google/genai`, `groq-sdk`, `@aws-sdk/client-bedrock-runtime` | los datos saldrían del navegador                                                   |
| Framework de orquestación   | `ai`, `langchain`, `@ai-sdk/*`, `llamaindex`                                                | son el cableado de lo anterior                                                     |
| Runtime de inferencia local | `@xenova/transformers`, `@mlc-ai/web-llm`, `onnxruntime-web`, `@tensorflow/tfjs`            | no sale nada, pero vuelve a _adivinar_: rompe la reproducibilidad, que es el punto |

**La IA como herramienta de DESARROLLO no está vetada.** Este repo lo escribe Claude Code. Lo
prohibido es que el producto que corre en el navegador del usuario dependa de un modelo.

## Cómo se hace cumplir (el gate, no la promesa)

`scripts/gate-anti-ia.mjs` audita `package.json` **y `pnpm-lock.yaml`** —una dependencia
transitiva cuenta igual que una directa— y sale con código 1 nombrando al culpable y su familia.
Corre como **job propio de CI** (`anti-ia`, sin `needs` y sin `pnpm install`: ~10 s, se pone rojo
de inmediato) y está registrado como **check requerido en la ruleset `main-protegida`** desde la
Fase 0 — un gate que no bloquea el merge no es un gate.

El gate se prueba a sí mismo (`tests/unit/gate-anti-ia.test.ts`, 10 casos): que ponga en rojo un
SDK directo, uno colado en `devDependencies`, uno **transitivo** con el manifiesto limpio; y que
NO confunda `@aws-sdk/client-s3` ni `aidan` con IA. Un gate que nunca ha visto un rojo es una
promesa disfrazada.

## Consecuencias

- **Aceptadas:** la detección se limita a lo que un algoritmo determinista puede confirmar. El
  texto libre (una columna "observaciones" con nombres adentro) queda **fuera de alcance
  declarado**, no resuelto a medias. Es un límite honesto y así se comunica.
- **A favor:** costo de runtime US$0, sin latencia, sin proveedor del que depender, sin política de
  privacidad que explicar, y un producto que funciona igual dentro de diez años.
- **Si alguna vez se quisiera revertir:** exigiría un ADR nuevo que explique cómo se preserva el
  certificado reproducible — y, hasta hoy, no existe una forma de hacerlo.

## Fuentes

- `portafolio/anonimizador/VISION.md` y `brief.md` (planeadora) — la regla de producto.
- `investigacion/2026-08-09-mercado.md` §2 — la categoría "sanitización pre-LLM" y sus actores.
- Circular Externa 002 del 21-ago-2024, SIC — tratamiento de datos personales en sistemas de IA.
