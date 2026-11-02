# ADR-012 — Metadata of images and PDFs: a whitelist of the container, a post-check, and a flow of its own

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 006 (H-2, sprint 2)
- **Decides:** how Velo cleans the metadata of a JPEG, PNG or WebP image (the PDF rewrite itself is
  ADR-010), how it knows the result is clean, what crosses the worker boundary, and how a file that
  is not a table moves through the screens, the certificate and the logbook.

## Context

A photo or a document says things about itself that nobody sees on screen: the camera and its serial
number, the GPS position, the author, the program, the dates, an id that ties the copy to its
original, a thumbnail of what the picture looked like before it was cropped. People hand these files
to third parties believing they hand over only what they see.

The product's hard rules apply unchanged: the file opens in the worker and nothing leaves the
browser (rules 2 and 7), the output is a pure function of the input (rule 3), and what Velo cannot
do is said, not hidden (rule 4). And the content (the text of the pages, what can be seen in the
picture) is out of scope: Velo cleans metadata, and says so before anything else.

## Decision

1. **The format is decided by the bytes** (`src/engine/metadatos/deteccion.ts`): JPEG, PNG, WebP or
   PDF by their signatures. The extension only routes the file to this flow; if it disagrees with
   the bytes, the file is treated by its bytes and the screen and the certificate say so
   (`extension-distinta`). Bytes that are none of the four are `formato-no-coincide`.
2. **Cleaning is a whitelist of the container, not a blacklist of tags.** Each reader keeps only
   what is needed to display the image — JPEG: SOF/DHT/DQT/DRI/DAC/SOS and the entropy data, APP0
   JFIF, APP2 ICC profile, APP14 Adobe; PNG: the critical chunks and the colour/transparency/
   physical-size ancillaries; WebP: VP8X/VP8/VP8L/ALPH/ICCP/ANIM/ANMF — and drops everything else,
   including blocks Velo cannot name, bytes after the end of the image (the aCropalypse class) and
   the MPF secondary images (an Ultra HDR gain map is lost, and that is declared). The pixel payload
   is copied byte for byte. Closed tag lists (EXIF, GPS, IPTC, XMP) exist only to **name** what was
   there; nothing depends on them to remove it.
3. **Orientation is the one tag kept.** Without it a portrait photo shows sideways. If EXIF
   orientation is not 1, the clean file carries a minimal EXIF with that single tag, listed as kept.
4. **Values cross the boundary masked.** A reader returns raw `CampoCrudo` values that stay in the
   worker; the page receives `CampoDeMetadato` with the key, where it lived, what it reveals, a
   sample masked by `mascara.ts`, and what a validator confirmed. The existing validators run on the
   value and, if it does not match as a whole, on its parts (`Ana Pérez · CC 1032456789` contains a
   cédula: `dentro: true`).
5. **Post-check, or no file.** After cleaning, the worker runs the same reader on the output. If it
   finds a single named field, an element still to remove or (PDF) more than one revision, the file
   is not delivered (`limpieza-incompleta`). The certificate states the post-check as a figure.
6. **A flow of its own, not a table with gaps.** The report is `InformeDeMetadatos`, sent by its own
   message and held in its own session phase (`metadatos`), so no table screen can receive one; the
   transformation screen becomes one action, «Limpiar». The certificate (`reporte-metadatos.ts`)
   reuses the styles, seal, escaping and verification commands of the table certificate. The logbook
   entry gains an optional `metadatos` block without a version bump: an entry without it serializes
   as before, so existing logbook fingerprints do not move.
7. **Caps by bytes**, as for Excel (ADR-003): a PDF and an image are opened whole. Both caps live in
   `src/lib/archivo.ts` and are checked on the page before the worker exists and again in the worker.
   **PDF: 50 MB**, measured — what costs memory in pdf-lib is the number of objects (≈ 1.5 KB of heap
   each), not the bytes: 10 MB with 34 000 objects peaked at 309 MB, 53 MB with 172 000 objects at
   735 MB, 107 MB with 343 000 objects at 1.26 GB (Node 24, cleaning, table in
   `src/workers/limpiar-pdf.ts`). So the worker adds two caps measured by the own scanner BEFORE
   pdf-lib runs: 200 000 objects and 64 MB inflated from object and xref streams. Without them a
   7 MB file with a million objects needed 0.9 GB and a 1 MB stream that inflates to 1 GB needed
   2 GB; with them both are refused in under 0.2 s as `pdf-ilegible`. **Image: 100 MB** — it lives
   twice (input and clean copy) with no object graph on top.

## Consequences

- Cleaning never re-encodes: no quality is lost and the result is deterministic, but nothing inside
  the pixels is touched (a face, a licence plate, text in a screenshot). The honest-limit panel and
  the certificate say it first.
- Clean files are named `velo-limpio-<first 8 hex of the input SHA-256>.<extension by content>`: the
  original name can be the most sensitive thing about the file, and it is not repeated.
- **HEIC (S7, decided by the owner on 2026-11-02).** See the section below.
- What the screens list is what Velo can name; what it removes is everything not on the whitelist.
  The gap between the two (an unknown block) is removed without a name, and said so.

## HEIC (amendment, S7)

A HEIC is a HEIF (ISO/IEC 23008-12) with HEVC images inside an ISO BMFF container (ISO/IEC
14496-12). Metadata are **items** like the image itself: `Exif` (a TIFF behind a 4-byte offset) and
`mime` with `application/rdf+xml` (XMP), tied to the picture by `cdsc` references; their bytes live in
`mdat` (or `idat`) at offsets that `iloc` declares. Removing one moves everything after it, so the
container is **rewritten**, with the same whitelist idea:

- **Kept:** `ftyp` as is; image items (`hvc1`, `hvt1`, `grid`, `iden`, `iovl`, `tmap`, `jpeg`) with
  their bytes copied untouched; the properties a decoder needs (`hvcC`, `ispe`, `irot`, `imir`,
  `clap`, `colr`, `pixi`, `auxC`, `pasp`, `rloc`, `lsel`, `clli`, `mdcv`, `cclv`, `amve`), with
  `ipma` re-indexed. Orientation lives in `irot`/`imir`, not in EXIF, so no minimal EXIF is needed.
  The thumbnail item (`thmb`) and auxiliary images (`auxl`: depth, HDR boost) are pixels and are kept,
  named in the certificate.
- **Removed and named:** `Exif`, `mime` and `uri ` items with their references; `udes` (a user
  description property: name, description, tags, read as fields); item names and the `hdlr` name;
  every top-level box other than `ftyp`, `meta` and `mdat` (`free`, `skip`, `uuid`…); bytes inside
  `mdat` or `idat` that no item uses (what an edit can leave behind); bytes after the last box. The
  XMP that describes an HDR gain map goes too, so the photo may show less range on an HDR screen; the
  screen says so.
- **Rewritten:** a canonical `hdlr` and `dinf`, a new `iinf`, `iref`, `iprp`, `idat` and `iloc`
  (4-byte offsets, recomputed), and one `mdat` with the kept extents in their original order.
- **Refused by name (`imagen-no-soportada`)** rather than broken: sequences and Live Photos (`moov`),
  protected items, data outside the file, items built from other items (`construction_method` 2), an
  image built from a non-image item, and an unknown property the file marks essential.

Detection is by `ftyp` brands (`heic`, `heix`, `heim`, `heis`); a HEIF with another codec (AVIF) is
not HEIC and is not treated. The browser cannot display a HEIC (only Safari), and Velo never decodes
one: the CI checks the container (HEVC bytes and properties byte-identical, `iloc` pointing at them,
every sentinel gone, idempotent, truncation at every byte), and the pixels were checked once on a Mac
with `sips` (the clean copy decodes to the same pixels as the input). The kit's HEIC is built around
`docs/kit-de-prueba/binarios/base.heic`, made once with `sips` and versioned with its `.meta.json`
(how, when, sha256), because the Linux CI cannot write HEIC.

## Rejected

- **Re-encoding through a canvas** — loses quality, changes every pixel, is not byte-reproducible
  across browsers, and the page CSP has no `blob:` in `img-src` for a reason.
- **A blacklist of known metadata tags** — a tag Velo does not know would survive.
- **A general XML parser for XMP** — a whole attack surface to read a packet that is removed whole
  anyway; properties are found by name, with bounded scans (a quadratic case was found by a test and
  fixed before merge).
- **Making `Informe` a union** — every table component would have to narrow it; a separate phase is
  the same type safety with no churn.
