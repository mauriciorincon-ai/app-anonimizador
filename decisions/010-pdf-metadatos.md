# ADR-010 — PDF: pdf-lib in the worker, pruned from the Root, with a new /ID

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 006 (H-2, sprint 2)
- **Decides:** how Velo rewrites a PDF so that its metadata, its previous revisions and the
  identifiers that link it to the original are gone — which library does the rewriting, what it is
  and is not allowed to do, and what Velo says it cannot do.

## Context

Sprint 6 adds metadata cleaning for PDF and images (JPEG, PNG, WebP) next to the table formats. The
images are plain segment/chunk formats and get their own small readers. The PDF is different: a
file that has been edited keeps what it replaced.

1. **Incremental updates keep earlier revisions** (ISO 32000-1 § 7.5.6). An editor that "saves" a
   PDF appends a new body, a new cross-reference section and a new trailer; the old bytes stay in the
   file. A metadata cleaner that only blanks the `Info` dictionary leaves the earlier author, the
   earlier text, a deleted page.
2. **The file identifiers link a copy to its original** (§ 14.4 `/ID`; XMP `xmpMM:DocumentID`,
   `xmpMM:InstanceID`). The first element survives every edit by design.
3. **Hard rules apply unchanged.** Rule 1 (no AI), rule 2 (everything in the browser, the page never
   reads the bytes), rule 3 (the output is a pure function of the input: no date, no `Producer`, no
   random `/ID`), rule 7 (the file is opened in `src/workers/`, a hostile PDF is a message key, never
   a hang).

Measured in a spike (scratch directory, not in the repo) with a hand-built PDF of two revisions:
an `Info` with a (synthetic) national id in `Author`, an XMP stream with both `xmpMM` ids, an object
freed in the second revision but still present in the bytes, an inherited `/ID`.

|                                       | `pdf-lib` 1.17.1                                                | `@cantoo/pdf-lib` 2.11.1                                  | own reader/writer                                                                  |
| ------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Bundle (esbuild, minified / gzip)     | 431 KB / 178 KB                                                 | not measured                                              | ≈ 15–25 KB (estimate)                                                              |
| Dependencies                          | 4 (`pako`, `tslib`, `@pdf-lib/standard-fonts`, `@pdf-lib/upng`) | adds `culori`, an HTML parser, `fflate`, with `>=` ranges | none                                                                               |
| `eval` / `new Function` / WebAssembly | none / none / none                                              | not measured                                              | none                                                                               |
| `npm audit`                           | 0 vulnerabilities                                               | not measured                                              | n/a                                                                                |
| Last release                          | 2021-11-06 (unmaintained)                                       | 2026-09                                                   | n/a                                                                                |
| Build cost                            | one dynamic import                                              | one dynamic import                                        | ≈ 700 lines: xref tables and streams, object streams, Flate predictors, serializer |

The chunk loads only inside the worker and only when a PDF is dropped, so the per-route script
budget (`perf-budget.json`, 350 KB) does not see it, and the CSP needs no change (`worker-src 'self'
blob:`, no `unsafe-eval`, no `wasm-unsafe-eval`).

What the spike showed about `pdf-lib`:

- Loading with `updateMetadata: false` writes no date and no `Producer`. **Without that option the
  output carries a `ModDate`**, which would break rule 3: the option is mandatory.
- It loads sequentially and keeps the last definition of each object, so the earlier `Author` is
  gone from its view — but it **keeps the "freed" orphan object**, and `save()` writes every object
  in its context. Dropping revisions therefore needs an explicit pruning step.
- Pruning by reachability from the trailer `/Root` (iterative walk with a visited set, deleting
  `/Metadata`, `/PieceInfo` and `/Thumb` keys on the way and every unreachable object after) removed
  the orphan, the `Info` and the XMP. The output had one `%%EOF`, no `/Prev`, no `/Info`, no
  `/Metadata`, none of the sentinel strings, the page content stream byte-equal, and re-opened.
- Saving without `/ID`, hashing that output, and saving again with the first 16 bytes of the hash
  as both elements gives a **new, content-derived `/ID`**; two runs produced identical bytes.

## Decision

1. **`pdf-lib` 1.17.1, pinned exact, used only inside `src/workers/`** through a dynamic import, and
   only for three things: load (`updateMetadata: false`), prune, save (`useObjectStreams: false`).
   Never in `src/engine/` and never in the page.
2. **Cleaning = rewrite, not edit.** Prune from `/Root`; drop `Info` from the trailer and the
   `/Metadata`, `/PieceInfo`, `/Thumb` keys everywhere; set the new `/ID` in two steps. Pages and
   content streams are copied as they are: no pixel and no page is touched.
3. **An own byte scanner (no library) reports what the rewrite removes**: how many revisions the file
   had (`%%EOF`, `startxref`, `/Prev`, repeated `N G obj` definitions), the earlier `Info` values in
   revisions stored uncompressed, and the identifiers (`/ID`, `xmpMM:DocumentID`, `InstanceID`,
   `OriginalDocumentID`). What sits inside compressed object streams of an older revision is outside
   the scanner and is said so.
4. **Refuse or warn, never silently pass:** `/Encrypt` is refused (message key `pdf-cifrado`); a
   signature (`/Sig`) is warned about because rewriting invalidates it; annotation authors (`/T`),
   attachments, form fields and JavaScript are **reported, not cleaned**.
5. **Post-check:** the metadata reader runs on the output, and the certificate states how many
   fields it found there (none, except what is kept and declared).
6. **The honest limit travels with the file:** the text of the pages and what is drawn in them were
   not touched, and the certificate says so.

## Consequences

- One dependency with no maintainer. Mitigations: exact pin and lockfile, `pnpm audit --audit-level
high` in CI, `gate:anti-ia` over the whole lockfile, and a surface limited to three calls behind
  one worker module. If it ever needs replacing, the own reader above is the estimate.
- The cleaned PDF is larger or smaller than the original (full rewrite, no object streams): the
  certificate lists both SHA-256 and sizes instead of promising anything about them.
- Documents whose earlier revisions live in compressed object streams are cleaned the same (the
  rewrite drops them) but the diagnosis cannot list what they held.

## Rejected

- **`@cantoo/pdf-lib`**: maintained, but it brings an HTML parser and unpinned `>=` ranges for
  features (form fields, HTML to PDF) that Velo does not use; the surface is bigger than the use.
- **Own reader/writer now**: about 700 lines of parser for untrusted input in a sprint that also
  ships JSON and three image formats; kept as the documented fallback.
- **Blanking `Info` and `/Metadata` in place (incremental update)**: it would add a revision that
  contains the cleaned values on top of the ones it claims to remove.
