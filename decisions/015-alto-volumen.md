# ADR-015 — High volume: the same engine over passes, and the file the user chooses

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 008 (H-2, sprint 4)
- **Decides:** how a CSV bigger than what fits in the tab is diagnosed, anonymized and restored
  without its whole table in memory; where the output is written; what is not measured and says so.

## Context

In memory, Velo keeps the whole table: one `Uint32` code per cell plus each column's dictionary.
With millions of rows and near-unique columns (cédulas, e-mails, names) the dictionaries alone
exceed what a tab can hold, and the output used to be one `Blob` assembled from strings that all
lived in memory at once. The hard rules do not bend for size: nothing leaves the browser (rule 2),
the output is a pure function of the input, the policy, the key and the language (rule 3), the
risk is exact or not given (rule 4), and raw data stays in the worker (rule 7).

Facts measured before deciding:

1. Mondrian cuts on positional medians over rows, unweighted (`mondrian.ts:283-323`), and writes
   its labels per row. OLA already groups the base classes once. Every per-value technique maps each
   value on its own (`transformarDiccionario`); collisions are counted over the dictionary but do
   not change the output. Noise depends on the absolute row index and the input's hash.
2. The return decides every column on its returned column's DICTIONARY and only counts per row
   (`restaurar.ts`).
3. PapaParse's `FileStreamer` decodes each 10 MB slice with `readAsText` on its own: a UTF-8
   character split by a slice boundary came out as U+FFFD in any CSV over 10 MB. That was a defect
   of the in-memory path too.
4. A V8 `Map` cannot hold more than 2²⁴ entries.

## Decision

1. **The same engine; only where the counts come from changes.** Each technique runs with the SAME
   function as in memory, over what it would see in memory: a per-value technique over the column's
   dictionary in first-appearance order (or over one value, when the dictionary does not fit),
   noise cell by cell with the absolute row index, and Mondrian and the optimal generalization over
   a REAL table holding only the partition and ℓ columns (`aplicarPolitica`, unchanged). Equality
   with the in-memory output is by construction, and a gate checks it byte for byte
   (`tests/unit/alto-volumen.test.ts`). **Mondrian is not rewritten with weights**, as the sprint
   order suggested: its median is positional, and a weighted rewrite would risk the bytes. That is a
   deviation from the order, taken on purpose.
2. **When.** The in-memory reader counts cells; past `TOPE_DE_CELDAS_EN_MEMORIA` (20,000,000, a
   build constant in `src/lib/archivo.ts`, the same number as the JSON cell cap of ADR-011) it drops
   the half table and reads the file again in passes. Not a measure of the machine or the clock: the
   same file takes the same road everywhere. Tests pass lower caps to force the road.
3. **The passes** (`src/workers/alto-volumen.ts`), each one re-checking the input's SHA-256:
   - **A, diagnosis:** per-column dictionaries with exact counts, up to a cap; classification on the
     first 5,000 rows (in memory it is a strided sample of the whole file, so the diagnosis may
     differ, and the screen says so); the projection of the quasi-identifiers over every row, from
     which the risk comes EXACT.
   - **B, the partition** (only with one): a real table of the partition and ℓ columns, and the
     unchanged `aplicarPolitica` over it. Reused by the comparison of the two roads.
   - **M, measure:** the transformed rows, not written: the risk after, the ℓ, whether each column
     changed in ANY cell, the preview rows and the noise counters.
   - **C, write:** row by row, with `filaDeCsv`, the same rule as `filasDeCsv`.
   - **The return:** R1 builds the returned columns' dictionaries and decides with
     `decidirRestauracion`; R2 counts (for the summary) and, at save time, writes.
4. **One shared CSV reader** (`src/workers/csv.ts`), in memory and in high volume: the same byte
   slices, one streaming `TextDecoder`, PapaParse fed as a stream with one config and a first chunk of
   the same 10 MB, so the delimiter and the line ending are guessed exactly as before. It fixes the
   U+FFFD defect for both roads (`tests/unit/lector-csv.test.ts` shows the old path corrupting the
   character).
5. **Where it is written.** Where the browser has `showSaveFilePicker` (Chromium), the delivery asks
   for the file inside the click, the page posts the `FileSystemFileHandle` to the worker, and the
   worker writes with `createWritable()` the very bytes it hashes. It commits nothing until `close()`
   and is aborted on failure, so no half file stays. It is a download by explicit user action, as
   rule 2 allows (ADR-005): the bytes go to the user's disk, nowhere else. Elsewhere the output is a
   `Blob` built from per-chunk `Blob`s, never one string, and the screen says that a very large file
   may not fit. The page never reads what is written: `createWritable`, `getWriter`, `getReader` and
   `getFile` are vetoed outside `src/workers/` (`tests/unit/privacidad.test.ts`). OPFS stays vetoed.
6. **What does not fit is said, never estimated.** All caps are below 2²⁴: a column's dictionary
   (2²⁰), all dictionaries together (2²²), the partition rows (16,000,000), the risk histogram (2²⁴
   − 1 combinations). A reversible column whose dictionary did not fit has no vault
   (`alto-volumen-boveda-no-cabe`); too many partition rows, too many combinations for the exact
   risk, or a returned column too large to restore each have their own reason and text. A column
   that did not fit reports "more than N distinct values", and a randomized-response domain that did
   not fit reports "more than N" (`dominioAlMenos`), not a false figure.
7. **What high volume does not measure, and says.** The utility (it needs both whole tables): the
   certificate says it was not measured. The advisor combines only the quasi-identifiers; the
   columns it would have looked at are listed with their reason. Collisions of a pseudonym computed
   per value are not counted.

## Measured

Outside the CI (`tmp/medir-5m.mjs`, not versioned), on the builder's Mac, production build in
headless Chromium: the generator's `clinico` CSV, 5,000,000 rows × 24 columns, 1.36 GB, Habeas Data
with a key, saved the `Blob` way (`showSaveFilePicker` removed). The memory is the RSS of the tab's
process (page and worker), sampled every 500 ms; it counts garbage not yet collected, so it is a
ceiling, not the live heap.

| Pass                     | Time  | Peak RSS |
| ------------------------ | ----- | -------- |
| A, diagnosis             | 109 s | 3.6 GB   |
| M, transform and measure | 283 s | 4.9 GB   |
| C, write                 | 267 s | 4.9 GB   |

Halving the dictionary caps (2²¹ → 2²⁰ per column, 2²³ → 2²² in total) moved the diagnosis
peak from 3.5 GB to 3.6 GB: the dictionaries are not what weighs. The caps stay at the halved
values, the ones that went end to end. The return of that file was not measured at 5 M rows; the
e2e takes a 21-million-cell file there and back. Lowering the peak is pending, with this table
as its baseline.

## Rejected

- **DuckDB-WASM.** A second engine of several megabytes whose output would have to match Velo's
  byte for byte, with its own ordering and quoting; and its memory is still the tab's.
- **Sampling.** The risk would stop being exact, which is what rule 4 forbids presenting as exact.
- **OPFS or IndexedDB as scratch space.** Browser storage, vetoed by rule 2 since S1.
- **A Service Worker streaming download.** It needs `fetch` to a synthetic URL, vetoed in `src/`,
  and the network gate would see it.
- **A weighted Mondrian over the histogram.** See decision 1.

## Consequences

- A CSV of any weight goes forward and back, within the declared caps (the manual's section 9 lists them); the e2e takes a 21-million-cell file there and back and
  compares the restored file with the original by SHA-256.
- **JSON in high volume is not built** (the plan's third cut): reading it in passes means rewriting
  the synchronous per-leaf JSON writer around asynchronous per-cell work (noise, per-value
  pseudonyms). A JSON over 20 million cells still stops with its cap and says so. Pending the
  owner's decision, not discarded.
- Excel keeps its 150 MB cap (ADR-003): SheetJS has no streaming reader in the browser.
- The restored file in high volume goes the `Blob` way; the chosen-file way is for the anonymized
  file only.
