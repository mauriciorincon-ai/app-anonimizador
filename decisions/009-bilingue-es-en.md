# ADR-009 — Velo in two languages: engines name, the interface says

- **Status:** accepted
- **Date:** 2026-11-01
- **Sprint:** 005 (H-2, sprint 1)
- **Decides:** how Velo speaks Spanish and English without weakening any hard rule — where the
  words live, who is allowed to write them, how the chosen language is remembered (it is not), and
  what a downloaded document means when it exists in two languages.

## Context

Velo was born Spanish-only (`<html lang="es-CO">`). The H-2 milestone requires the whole product in
both languages, and a certificate that is useful to an auditor or a client who does not read
Spanish. The constraints are the product's, not the framework's:

1. **Rule 2 — nothing is stored in the browser.** The usual i18n answer (remember the choice in
   `localStorage` or a cookie) is forbidden: `tests/unit/privacidad.test.ts` vetoes both in `src/`.
2. **Rule 3 — byte-identical determinism.** A certificate is a pure function of its inputs; a second
   language must not make it depend on anything the inputs do not name.
3. **Rule 4 — measured honesty.** A caveat that is strong in one language and soft in the other is
   two different products. Both faces of every sentence have to carry the same caution.
4. **Rule 7 — the worker is the frontier.** Whatever crosses it must stay data; a sentence in
   Spanish coming out of the worker is a sentence the English interface cannot fix.

## Decision

**1. Every text is born as `{ es, en }`, written side by side.** One catalog file per screen in
`src/lib/idioma/textos/`. The English is _drafted_, not translated after the fact, so a sentence
that wants two sentences in English is two sentences — the only things that must match are the
`{markers}` and the emphasis (`**bold**`, `` `code` ``, `!!warning!!`).

**2. Engines and the worker return `Mensaje { clave, datos }`, never a phrase.** The interface (or
the document builder) turns a message into text in the language being shown. Numbers travel raw and
are formatted with the language's conventions at the last moment. A single engine run therefore
serves both languages, and the worker never carries prose (rule 7).

**3. Two gates keep it honest.**

- `tests/unit/idioma.test.ts` (parity) walks every catalog: both faces present, same markers, same
  emphasis shape, and the English is not the Spanish pasted (the usual sign of "I forgot to write
  it"). Exceptions are listed with a reason and fail when they stop being needed.
- `tests/unit/idioma-barrido.test.ts` (sweep) parses `src/` with the TypeScript AST and fails on any
  hand-written phrase outside the catalogs: JSX text, `aria-label`/`title`/`placeholder`, and
  Spanish-looking strings in engines, the worker and libraries. It tests itself on synthetic code,
  so a silent gate cannot pass for a green one.
- `copy.test.ts` (rule 4) gains the English equivalents of every forbidden promise.

**4. The chosen language lives in memory and in `?lang=`.** The store follows the pattern of
`src/lib/sesion.ts` (`useSyncExternalStore`): it survives navigation between screens and dies on
reload. Priority: `?lang=` in the URL, then the browser's languages, then Spanish. Choosing writes
`?lang=` with `replaceState`, so a copied link opens the same way. Nothing is written anywhere else.

**5. Documents are per-language and deterministic.** `construirReporte` and
`construirInformeDeRestauracion` take `idioma` as data, like the date. Same report + same date +
same language ⇒ same bytes, checked once per language by running the engine twice. The language is
also written inside the document (`<html lang>`) and its file name. Both languages carry the same two
fingerprints and the same caveats _before_ the figure; that order is fixed by the builder, not by the
catalog. Text interpolated into a document is escaped; the catalog's own emphasis is converted to
HTML on the template _before_ data is filled in, so a column named `**x**` is a name, never markup.

**6. The language parameter of the number formatters is required.** `src/lib/formato.ts` takes
`idioma` with no default, so a call site that forgets it fails to compile instead of printing
`1.234` on an English screen.

**7. What Velo writes _into the output file_ follows the language of the job (amended in Sprint
006; Sprint 005 had left it Spanish).** The two words the Mondrian generalizer puts in cells —the
separator of a range and the suffix of a group that has blanks— were Spanish constants in the
engine. They are now catalog entries, resolved once per run with an `idioma` that the engine takes
as a required parameter (no default, for the same reason as §6) and that the page reads when the
user presses _transform_. Spanish bytes are identical to before; English uses ASCII tokens (`to`,
`(or empty)`) because a hyphen collides with negatives and ISO dates and a comma with CSV quoting.
The language is bound at transform time, not at download time, and the certificate states it as the
_language of the job_, written in the document's own language. It enters neither the policy (so the
policy hash, the `velo-anonimizado-<hash8>` name and the vault do not move) nor the file builder.
Determinism therefore reads: same input + same policy + same key + same language ⇒ same bytes. Only
those two tokens differ between languages, and a table transformed without generalization is
identical in both. Return and restore never read the tokens. The file names `velo-…` do not change.

**7. The brochure (`/conoce`) is bilingual inside its own file.** Spanish stays in the markup (it
reads the same without JavaScript); English lives in an in-page dictionary keyed by `data-t`. It has
its own switcher and the same no-storage rule, because it opens by double click as well.

## Consequences

- The certificate stops being a single byte sequence for a given input: it is one per language. The
  determinism test runs per language with the date injected.
- First paint is Spanish (server and prerender), and a visitor whose browser is English sees one
  repaint when the store reads the browser. There is no hydration error: that is what
  `getServerSnapshot` is for.
- A log entry keeps the date as written when it was annotated (ADR-007 is untouched): an old entry
  reads in the language it was written in.
- **Out of scope, and said so in the manual:** detection is still Colombian (`cédula`, `NIT`,
  `celular`, `placa`, Law 1581); the English is the interface's, not the detector's. What Velo writes _into the
  user's output file_ is covered by §7 (amended in Sprint 006).
- Tests and screenshots run in one language per sprint (Spanish this time, via `locale: "es-CO"` in
  Playwright); the other is covered at the close of the milestone.

## Rejected

- **Route-based locales (`/es`, `/en`) with a library such as `next-intl`.** It adds a dependency
  and a routing layer to an app with five screens and no server, and the URL already carries the
  choice as `?lang=`.
- **Remembering the choice in `localStorage` or a cookie.** Forbidden by rule 2; it would be the first
  thing Velo stores without being asked.
- **Translating at the worker boundary.** It would make worker output depend on the interface
  language and put prose across the frontier (rule 7).
- **Machine translation, at runtime or at build time.** Rule 1 keeps generative AI out of the
  product, and the point of the exercise is that the English is _written_.
