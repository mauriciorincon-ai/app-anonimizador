# ADR-013 — The optimal generalization: OLA over nested ladders, next to Mondrian

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 007 (H-2, sprint 3)
- **Decides:** which globally optimal k-anonymity search Velo uses, what a generalization ladder
  is and why its levels are nested by construction, where the Colombian factory ladders come from,
  what the search may not do (suppress rows), and how large a lattice it walks.

## Context

Mondrian (ADR-002) cuts the file by medians and generalizes each region differently: fast, local,
and with labels that change from one region to the next. The VISION roadmap asks for the other
family: every column climbs its own **ladder** (age → five-year group → broad group) to one level,
the **same across the whole file**, and the search picks the combination of levels (a node of the
lattice) that meets k while losing the least information. The two answer different questions, so
the screen shows both side by side and the user chooses; Mondrian stays the default.

The product's hard rules hold: the search runs in the worker (rules 2 and 7), its output is a pure
function of file, policy and ladders (rule 3), and what it cannot do is said (rule 4).

## Decision

1. **OLA, not FLASH** (El Emam et al., _A Globally Optimal k-Anonymity Method for the
   De-Identification of Health Data_, JAMIA 16(5), 2009). Its optimality argument is direct and
   short enough to test: with nested ladders the set of k-anonymous nodes is closed upwards; the
   loss is monotone; so the cheapest node is among the **k-minimal** ones, and OLA's binary search
   on sub-lattices with predictive tagging collects all of them. In Velo every node check is a
   pass over the data, so the algorithm that checks fewest nodes is the one to want (the comparison
   reported by Prasser et al., 2014, as read when this sprint was planned). FLASH's primary text
   (Kohlmayer et al., PASSAT 2012) could not be retrieved during the sprint, and it was not chosen
   on claims nobody read.
2. **The loss is entropy in bits**, column by column: Σ (H(column) − H(generalized column)). It is
   OLA's non-uniform entropy divided by the number of rows, it is monotone (the entropy of a
   function of X never exceeds that of X), and it is the same figure the balance already reports,
   so what is minimized is what the user sees. Ties break fixed: loss (two losses within 1e-9 bits
   are the same loss, not rounding noise) → lower sum of levels → lexicographically smaller vector
   in the table's column order.
3. **Ladders are declared as steps, and level j is step j applied to level j−1**, never to the
   original value (`src/engine/jerarquias/index.ts`). Nesting is therefore true by construction,
   not by each ladder being written carefully: two cells equal at one level cannot split at the
   next. Computing every level from the original broke it on real files — a `5-9` the file already
   carried stayed `5-9` while a `7` climbed `5-9` → `0-9` — and the pruning would no longer be
   safe. Each step also accepts what the previous step produces (a five-year group, a CIIU group).
   The last level is `*` for every cell; intermediate levels keep the empty cell empty and leave a
   value they cannot place as it is (a text in an age column is never given an invented range).
4. **Factory ladders cite their source and date** (`src/engine/jerarquias/fabrica/*.meta.json`,
   `fuentes.ts`; downloaded once by hand on 2026-11-02 and derived by
   `scripts/jerarquias/derivar.mjs`; a gate checks the SHA-256 of every derived table):
   - **DIVIPOLA** — municipality → department → region. DANE, "DIVIPOLA — Códigos municipios",
     cut-off 2024-12-30 (datos.gov.co `gdxc-w37w`, CC BY-SA 4.0): 33 departmental entities and
     1,122 entries with a 5-digit code (1,103 municipalities, 1 island, 18 non-municipalized areas).
     A municipality name that exists in two departments is **not guessed**. Regions: **Ley 2056 de
     2020, art. 45** (regions of the Sistema General de Regalías), because the Plan Nacional de
     Desarrollo 2022-2026 carries no department-to-region table; headings kept verbatim.
   - **Age** — age → five-year group → broad group. DANE's current projections (PPED, July 2025):
     the five-year groups add up its single-year series (0 to 99 and an open "100 años y más"),
     the broad groups are those of its technical note (table 3): 0-14, 15-59, 60+. Ages above 122
     are not ages and stay as written.
   - **CIIU Rev. 4 A.C.** — class → group → division → section. DANE, detailed structure, 2022
     update (Resolución 2306 de 2022): 21 sections, 88 divisions, 246 groups, 502 classes,
     cross-checked against DANE's PDF of the same revision. Three digits are read as a class that
     lost its leading zero (`141` → `0141`).
5. **No row suppression.** OLA admits a suppression budget; Velo does not delete anybody's record
   on its own (the same doctrine as Mondrian). If no node meets k (or the l asked for), the top node
   is applied and the balance says "not reached".
6. **Optional distinct l** over sensitive columns outside the partition: it is monotone under
   merging classes, so it prunes the same way as k. Only the optimal search enforces it; Mondrian's
   l is measured, not enforced.
7. **A lattice over 20,000 nodes is not walked.** Its columns come out untouched and the balance
   says so before any figure (`reticula-excede-tope`); the comparison says "not computed".
8. **The policy carries the choice** as an optional `generalizacion` field: absent means Mondrian,
   so no S6 policy changes its hash (golden vectors in `tests/unit/politica.test.ts`).

## Measured

500,000 rows of the kit's `clinico` profile, in Node (the worker runs the same engine), 2026-11-02:

| Lattice                | k   | Nodes checked | Time   | Per node |
| ---------------------- | --- | ------------- | ------ | -------- |
| 4 columns, 240 nodes   | 5   | 58            | 2.3 s  | 40 ms    |
| 4 columns, 240 nodes   | 50  | 47            | 2.0 s  | 42 ms    |
| 6 columns, 8,640 nodes | 5   | 457           | 31.7 s | 69 ms    |
| 6 columns, 8,640 nodes | 50  | 165           | 11.6 s | 70 ms    |

OLA checked 2 % to 24 % of each lattice. The evaluator groups rows once by their base equivalence
classes and measures each node over those classes, not over the rows. All of it runs in the
worker: the main thread is never blocked. At the 20,000-node limit, a few thousand checks at
≈ 70 ms would take minutes; that is the order of magnitude the limit bounds.

## Consequences

- The screen gains "How to reach k" under k in the policy editor, the certificate a section with
  each column's ladder and level, the k and l measured and the sources of the factory ladders.
- Tests: OLA equals an independent brute force on 120 seeded tables with and without l (a broken
  OLA fails them); every offered ladder is nested over a corpus that includes already-grouped
  values; the factory tables match their `.meta.json`; output byte-identical twice, across parser
  chunk sizes and in both languages.
- The optimal search runs twice on a large file (once to compare, once to transform): ≈ 30 s each
  for six columns at 500,000 rows. Reusing the comparison is left for the hito's batch.

## Pending the owner's decision (not discarded)

- **Row suppression** inside the search (OLA's suppression budget) — it contradicts "Velo does not
  delete rows" today.
- **CIIU Rev. 5 A.C.** — Resolución 992 de 2026 (2026-08-06) establishes it and repeals Resolución
  2306 de 2022, with two years to implement it; Rev. 4 A.C. codes keep circulating meanwhile. Velo
  ships Rev. 4 A.C.; adding Rev. 5 A.C. as a second ladder is the owner's call.
- **The census broad groups** (0-14, 15-64, 65+, CNPV 2018) as an alternative to the projections'
  (0-14, 15-59, 60+).
- **Another regionalization** than the Sistema General de Regalías's.

## Rejected

- **FLASH** — see decision 1.
- **Computing each level from the original value** — see decision 3: it breaks nesting on files
  that already carry grouped values.
- **Downloading the factory tables at run time** — the app never uses the network (rule 2).

## Addendum — Sprint 011 (2026-11-08): what changed after the owner's decision

The owner built two of the items above in the H-2 (plan approval "apruebo · 1a"). Decisions 5 and the
"Deferred" list stay as written for what they described; this is what is true now:

- **Suppression (replaces decision 5 only when the user asks).** `generalizacion.supresionMaxima`
  (0–100 % of the rows, optional) lets the search drop, from the OUTPUT file only, the rows of classes
  that miss k or l, up to that cap, when that loses less information. The default is 0 and 0 is
  normalised away, so a policy without the cap hashes and outputs exactly as before. Velo still never
  deletes a row on its own, and the original file is never touched. The loss is not monotone in the
  cap, so the search is a branch-and-bound that stays exact (checked against brute force on seeded
  tables). A JSON does not admit the cap (each row is a record rewritten in place): it is reported as
  not applied.
- **CIIU Rev. 5 A.C.** ships next to Rev. 4 (`ciiu5.json` + `ciiu5.meta.json`, with source, consultation
  date and SHA-256). The revision is detected from the codes that exist in only one of them, and a
  selector lets the user override it. DANE's Rev. 4 → Rev. 5 correspondence table is many-to-many, so
  Velo does not recode between revisions.
