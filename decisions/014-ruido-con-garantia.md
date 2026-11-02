# ADR-014 — Noise with a guarantee: local differential privacy, exact sampling, randomness from the key

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 007 (H-2, sprint 3)
- **Decides:** which noise techniques Velo offers and what each one promises, how the noise is
  sampled, where its randomness comes from without breaking hard rule 3, and how ε is said.

## Context

The VISION roadmap asks for perturbation and differential privacy. Two hard rules frame it: rule 3
(same input, policy, key and language ⇒ the same file, byte for byte; `Math.random` is banned in
`src/engine/`) and rule 4 (honest measurement: nothing is "guaranteed"). The G-Plan defaults hold:
noise is deterministic from the HMAC, "differential privacy" is said only where it can be proved,
and Mondrian stays the default for k. Counting queries with differential privacy were excluded by
the sprint order.

## Decision

1. **Three per-cell techniques** (`src/engine/ruido/`), all requiring the project key:
   - `laplace { epsilon, minimo, maximo, decimales }` — **local** differential privacy, ε per value
     of this field. The value is clipped to the range the user **declares** (a range taken from the
     data would itself leak), moved to the integer grid of its decimals, given discrete Laplace noise
     of scale (max − min)/ε, and clipped again (post-processing, free in privacy). Clipped and
     non-numeric cells are counted and said.
   - `respuesta-aleatorizada { epsilon }` — **local** differential privacy over the column's
     distinct values (up to 64). With probability w a cell answers a uniform value of the domain.
     The effective ε = ln(1 + m(1 − w)/w) is exact and ≤ the one asked. **The domain comes from the
     file**, and that is said: appearing in it is not protected by ε. Over 64 values it is not
     applied, the column comes out untouched and the balance says so first.
   - `perturbar { porcentaje }` — ±x % uniform. **No formal guarantee**, and labelled so everywhere.
2. **ε from a fixed list** {0.1, 0.5, 1, 2, 4, 8}, so every ε is a rational and the Laplace scale
   is a quotient of integers.
3. **Exact sampling, no floating point** — Canonne, Kamath and Steinke, _The Discrete Gaussian for
   Differential Privacy_, NeurIPS 2020, algorithms 1 (Bernoulli(exp(−γ))) and 2 (discrete Laplace),
   over an exact uniform integer source. This answers Mironov, _On Significance of the Least
   Significant Bits for Differential Privacy_, CCS 2012: floating-point Laplace leaks through its
   low bits. Randomized response picks w = W/2³² with W computed in BigInt from a **rational lower
   bound** of e^ε, so no engine's `Math.exp` rounding can change which cells are randomized and the
   effective ε is never above the one asked.
4. **Randomness from the key.** Each cell's seed is
   HMAC-SHA256(key, `velo-ruido-v1` ‖ 0 ‖ input-file SHA-256 ‖ 0 ‖ field ‖ 0 ‖ row); further words
   come from SHA-256(seed ‖ counter) with the repo's own FIPS 180-4 implementation (the key is not
   extractable and Web Crypto is asynchronous, so the HMAC gives the seed and the rest is expanded
   synchronously). The label separates this domain from the pseudonyms', which do not change.
   - **The input file's hash is in the seed** (a refinement of the stream approved in the plan,
     which had field, row and block only). Without it, two different files with rows in the same
     order — March's and April's export of the same customers — would get the same noise per row,
     and whoever knew one month's value would solve the noise and read the other month exactly.
     With it, the same file and key give the same noise (it cannot be averaged by re-running), and
     two different files get independent noise, so each delivery spends its own ε and they add up.
5. **How ε is said.** Every figure carries its ε and its scope: "local differential privacy,
   ε = X per value of this field". The panel after transforming is **apart from the balance**: k
   and ε are two different guarantees and do not add up. The ε per row is the sum over the
   columns with ε (sequential composition). ε is shown **rounded up** to three decimals: a smaller
   ε promises more, so the figure read is never smaller than the one that holds. The certificate
   has the same section; the logbook stores the ε per row and the mechanisms, without column names.
   The forbidden copy now includes «privacidad garantizada» and «guaranteed privacy» and variants.

## Consequences

- Tests (`tests/unit/ruido.test.ts`, seeded so they pass or fail the same way every run):
  Bernoulli(exp(−γ)) against its exact value, the discrete Laplace mean and variance, the e^ε ratio
  on a small grid, the randomized-response truth rate, effective ε ≤ ε for every m ≤ 64 and every
  ε, the rational bounds below e^ε. Determinism with noise twice, across parser chunk sizes and in
  both languages, and different with another key or another file. Red demo seen: `Math.random`
  in `src/engine/ruido/` fails both the banned-API gate and the byte-identity gate.
- Per-cell noise costs one HMAC per non-empty cell (≈ 0.7 s per 500,000 cells, ADR-004) plus a few
  SHA-256 blocks.
- A JSON column that receives noise is written back as strings (the JSON writer quotes changed
  cells); restoring numbers unquoted is done only on the return trip. Left for the hito's batch.

## Rejected

- **`crypto.getRandomValues` or `Math.random`** — break rule 3 and allow averaging the noise away
  by re-running.
- **Floating-point Laplace** — Mironov 2012.
- **A range or domain computed from the file for Laplace** — it leaks; the range is declared.
- **Calling perturbation "differential privacy"** — it has no ε.
