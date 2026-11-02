# ADR-011 — JSON: its own reader, the path is the column, lists are declared

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 006 (H-2, sprint 2)
- **Decides:** how a JSON file (an array of objects or JSON Lines) goes through the same customs as
  a table — how it is read, what a "column" is, what is NOT treated and says so, what is written
  back, and where the limits are.

## Context

A JSON is not a table. Records can be nested, can miss keys, can change the type of a key from one
record to the next, and can hold lists. The product's hard rules apply unchanged: the file opens in
the worker (rule 7), nothing leaves the browser (rule 2), the output is a pure function of the input
(rule 3), and limits are stated, not hidden (rule 4).

Facts measured in the code before deciding:

1. The table (`TablaColumnar`) stores **strings only**; code 0 is the empty cell. The column **name**
   is the key everywhere (policy, risk, utility, vault) by exact equality, and nothing splits it. A
   path such as `paciente.contacto.correo` works as an opaque name.
2. `JSON.parse` is not usable: it reorders integer-like keys (`{"2":…,"1":…}` becomes `1, 2`), turns
   numbers beyond 2^53 into a different number, keeps only the last of two equal keys, and its errors
   quote the content of the file.
3. The classifier ran its name rules over the **whole** column name, so a parent segment such as
   `salud.` or `paciente.` would have upgraded the category of every child.

## Decision

1. **An own strict RFC 8259 tokenizer, in `src/engine/json/`** (pure; the worker gives it text, see
   `src/workers/json.ts`). Numbers keep their raw text (`1E3`, `-0.0`, `12345678901234567890`), keys keep
   their order, a duplicate key inside one object is **refused** (`json-claves-duplicadas`: it cannot be
   written back), and every failure is a message key plus a line number — never a piece of the file.
   Depth is iterative, so a 100 000-deep bomb ends in `json-demasiado-profundo`, not in a stack
   overflow.
2. **One column per scalar path.** The name joins the keys with `.`; inside a key `\`, `.`, `[` and
   `]` are escaped with a backslash and an empty key is written `\_`, so the literal key `a.b` and
   the nested `{"a":{"b":…}}` are different columns. `ColumnaColumnar.ruta` keeps the unescaped
   segments, set only by this reader. With a `ruta`, the classifier reads the **last** segment (the last
   two for the cédula header context); a CSV header that merely contains dots classifies exactly as before.
3. **Lists are not columns and are not flattened.** `a.b[]` is declared on screen as untreated, with
   a loud warning, the field names seen inside it (names only) and in how many records it appears, and
   its raw text is copied untouched. Paths missing from some records, or whose type changes, are
   declared too. Nothing that Velo did not look at is presented as treated.
4. **Two passes over the original.** Pass 1 builds the table and the structure; pass 2, after the
   policy, re-tokenizes the same file and writes each record **compact, one per line, in its
   original key order**, with the transformed table in every leaf: `[\n rec,\n rec\n]\n` for an
   array, `rec\n` per line for JSON Lines. The worker re-computes the SHA-256 of the input while pass 2
   reads it and refuses to write if it differs from the one in the diagnosis, because the certificate
   ties its input fingerprint to that file.
5. **The transformed table is the truth.** A per-column class of cell (absent, text, number, true,
   false, null) only decides two things: how a cell that ended up empty is written (key omitted,
   `null`, `""`) and whether a cell that did **not** change is copied raw (so numbers stay unquoted).
   A changed cell is always a string (a generalized number becomes text, and the screen says so). A label
   written on a cell that was absent is appended at the end of its parent. A suppressed column
   disappears from every record and a parent left empty stays `{}`.
6. **Reversible pseudonyms are switched off for JSON.** The return flow reads only CSV, so a vault
   for a JSON would be a file that cannot be used; the editor says so instead of offering it.
7. **Limits, enforced in the worker and quoted from one constant (`TOPES_JSON`)**: 256 distinct paths,
   32 levels, keys of 256 characters, strings of 1 048 576 characters, and **20 000 000 cells**
   (records × paths).

Measured with the seeded kit (`--perfil anidado --formato json`) on Node 24: 500 000 records, 159 MB,
11 paths (5.5 M cells) — read 1.9 s, write 1.3 s, heap +353 MB (+51 MB in typed arrays), about 64 bytes
per cell on a fixture whose values are mostly unique. The builder measured a wide case too: 250
paths × 150 000 records (37.5 M cells) read in 6.3 s and wrote in 5.8 s with 236 MB in typed arrays.
The cap is 20 M cells because at the measured cost it keeps the worker near 1.3 GB; 40 M would not.
It is by cells and not by bytes for the same reason ADR-003 reasoned in bytes for Excel: it is what
occupies the memory. JSON Lines is recommended for big files for a different reason than memory (both
forms stream): a bad line is located by its number, and most tools write and read it.

## Consequences

- The file that leaves is a faithful rewrite, not a byte copy: whitespace between tokens is not
  preserved (the output is compact), strings that did not change keep their original escapes, and
  everything inside a declared list is untouched. The certificate carries both SHA-256 so nobody has
  to believe the claim.
- A list inside a record can still carry personal data. Velo says so, names the fields it saw there
  and does not look inside; treating list elements, or suppressing a whole list from the policy, is
  left as a documented next step.
- Language: nothing in this ADR depends on it, except the two words Mondrian writes into labels (ADR-009 §7).

## Rejected

- **`JSON.parse` and a re-serialization** — reorders keys, damages large numbers, hides duplicates and
  leaks content through its errors.
- **Flattening lists into `a.b[0]`, `a.b[1]`…** — a different number of columns per record, a policy
  that cannot name the "same" field twice, and a silent decision about which element is which.
- **Adding a language or format field to the policy** — it would change every existing policy hash
  (see the comment in `politica.ts`); the format is a property of the file, not of the treatment.
