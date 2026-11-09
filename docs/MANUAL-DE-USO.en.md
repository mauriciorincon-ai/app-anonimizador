# User manual — Velo

> _Veil it to hand it over. Unveil it to get it back._
> Updated in Sprint 008 · November 2, 2026
>
> Spanish version: [MANUAL-DE-USO.md](MANUAL-DE-USO.md)

Velo is the **customs checkpoint for your data**: what looks over your table, your JSON, your PDF or
your image before it goes out to an AI, a cloud tool or a third party's computer. This manual covers
everything Velo can do today.

---

## First things first, because it changes how you will use it

**Your file is not uploaded anywhere.** Velo has no server. When you drop in a file, it opens
inside the browser tab —on a separate thread, so nothing freezes— and stays there. There is no
upload, no database, no copy.

That has a consequence worth knowing up front: **if you reload the page, the diagnosis disappears**.
It is not a bug. It is the same reason your data does not leak: it was never saved anywhere.
Dropping the file in again takes as long as the first time.

And a word on scope, because it has grown: **Velo diagnoses, transforms, returns and leaves a
record**. You can mask, pseudonymize and generalize, take the treated file away together with its
certificate, and when the third party sends it back worked on, recover the original values. That
road back is the [vault](#5-the-vault-so-you-can-undo-it) and
[the return](#6-the-return-getting-back-what-you-handed-over). And what you did is written down in
[the log](#7-the-log-remembering-six-months-from-now), for six months from now. Each one has its
own section below.

And Velo works with **three kinds of file**, not one. **Tables** (CSV and Excel) and **JSON** (an
array of objects, or JSON Lines) go through the diagnosis and the workshop of sections 2 to 7; for
JSON, [how it is read and what is not treated](#if-your-file-is-a-json) is explained in section 1.
**PDFs and images** (JPEG, PNG, WebP, HEIC —the format iPhone photos come in—, AVIF and a Live Photo's video) are not tabular
data: Velo cleans their **metadata**, what the
file says about itself that nobody sees on screen (author, camera, location, dates, earlier
versions), and [section 8](#8-pdfs-and-images-cleaning-what-the-file-says-about-itself) explains it.
With the same caution in all three: **Velo cleans what the file says about itself; it does not touch
the text on the pages or what can be seen in the image.**

**Velo works in English and Spanish.** The header of every screen has two buttons, **ES** and
**EN**: the underlined one is the language in use. When it opens, Velo uses your browser's
language; if you prefer the other one, you switch it there and the whole screen changes with it
—including the certificate and the return report you download, which are written in whichever
language is selected at that moment—. If you copy the address after choosing, it carries `?lang=en`
or `?lang=es` and opens the same way for whoever receives it. **Velo does not remember your
choice**: like everything else, it lives only in the tab, so when you reload it goes back to your
browser's language (or the one in the address).

There are things the language does **not** change, and it is worth knowing which: what comes from
your files (column names, values, samples) is shown exactly as it is; the country-specific
recognizers are the same in both languages —the Colombian ones (cédula, NIT, mobile number,
license plate, with Law 1581 as the framework) and the eight European documents of
[section 10](#10-the-gdpr-policy), with the GDPR as the framework— because English is the language
of the interface, not of detection; and the
vault and the log are the same file whatever language you saved them in. A log entry keeps the date
exactly as it was written when you logged it. What Velo writes **inside the treated file** does follow the language you were using when you
asked for the transformation: the two words it uses when it generalizes (the " a " between the two
ends of a range and the " (o vacío)" of a group with empty cells) come out as " to " and " (or
empty)" if you were in English, and the certificate records it as the "Language of the job". The
same file, policy, key and language give the same bytes; with another language only those two words
change. The names of the files it saves (`velo-anonimizado-…`, `velo-limpio-…`,
`velo-boveda-…`, `velo-politica.json`) do not change. The certificate, the certificate for cleaning a
PDF or an image, and the return report follow the language you were using when you downloaded them.

To put it precisely, because the difference matters: **a pseudonym on its own is still
irreversible**. Whoever receives the treated file cannot undo it —that is what makes it safe to
hand over—. What undoes it is the vault, a separate encrypted file that only you have and that only
opens with your passphrase. If you did not mark any column as reversible when you transformed,
there is no vault and no way back: that is decided beforehand, not afterwards.

---

## How to use it

### 1. Bring your table

On the main screen you can **drag** the file onto the box or **choose** it with the button (which
works from the keyboard: reach it with the Tab key and open it with Enter). The box is titled
“Bring your table”, but it takes more than tables: a JSON, a PDF or an image too.

Velo reads:

| Format                                                                                                                                     | Limit               | Why                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV** (`.csv`)                                                                                                                           | no limit on weight  | It is read in parts; it never exists whole in memory. Above 20,000,000 cells, Velo reads it [in passes](#9-huge-files-high-volume-mode).                                                |
| **Excel** (`.xlsx`, `.xls`)                                                                                                                | **150 MB**          | An Excel file has to be opened whole to be read. Above that size the browser runs out of memory, so Velo rejects it **before** opening it.                                              |
| **JSON** (`.json`) and **JSON Lines** (`.jsonl`, `.ndjson`)                                                                                | no limit on records | The table Velo builds lives in memory up to 20,000,000 cells (records × distinct paths); above that, it reads the file [in passes](#9-huge-files-high-volume-mode) without building it. |
| **PDF** (`.pdf`)                                                                                                                           | **50 MB**           | A PDF cannot be rewritten in parts: it is opened whole in memory, and what weighs is how many pieces it holds. Velo rejects it **before** opening it.                                   |
| **Image**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`), HEIC (`.heic`, `.heif`), AVIF (`.avif`) and a Live Photo's video (`.mov`) | **100 MB**          | Same as the PDF: it is rewritten in one go.                                                                                                                                             |

The JSON limits are: **256 distinct paths**, **32 levels** of nesting inside a record, keys of up
to 256 characters and strings of up to 1,048,576 characters. Going past any of them is rejected with
a message that says which one and what to do. The number of records has no limit: past 20,000,000
cells, the JSON is read [in passes](#9-huge-files-high-volume-mode).

If your Excel file is over 150 MB: open it and save it as CSV. From 40 MB, Velo warns you that it
will take a while and offers the same way out. If your PDF is over 50 MB or your image over 100 MB: split the PDF
into parts with the program that made it, or export the image again at a lower weight (less
resolution, more compression), and drop that copy in.

Two more things about what Velo reads:

- **It decides what a PDF or an image is by its contents, not by its extension.** If a `.jpg` is
  really a PNG, it treats it as a PNG, says so in a notice, and the clean copy comes out with the
  extension that fits. If the contents are none of what Velo reads (a `.json` that is really a PDF,
  for instance), it is rejected with a message that says what to do.
- **It reads HEIC and AVIF**, the formats many phones save photos in (`.heic`, `.heif` and
  `.avif`), and **a Live Photo's video** (`.mov`), but only to clean their metadata, like any other
  image. Velo **does not convert** the photo or decode it: the clean copy is still the same format.
  What it removes, what it keeps and what it refuses is in
  [section 8](#8-pdfs-and-images-cleaning-what-the-file-says-about-itself).

While it works you will see where it is: **taking the file's fingerprint**, **reading the file**,
**recognizing what is in each column** and **measuring the re-identification risk**. The bar only
appears when there is something real to measure; in the stages that have no fraction to show, Velo
tells you the stage and does not draw a fake bar. With a huge CSV you will also see “High-volume
mode: the file is read in passes”, which [section 9](#9-huge-files-high-volume-mode) explains. With a PDF or an image there are no rows or
columns: Velo says “Reading what the file says about itself” and draws no bar, because it opens the
whole file in one go.

#### If your file is a JSON

A JSON is not a table: its records can be nested, miss keys, change type from one record to the next
and hold lists. Velo sends it through the same checkpoint as tables, but it declares what it cannot
treat instead of keeping quiet about it.

**What it reads.** Two shapes: an array of objects (`[{…}, {…}]`) and JSON Lines (one object per
line). Which of the two it is gets decided by the contents. JSON Lines is the better choice for big
files: a line is a record, so the line number Velo reports when something is wrong points at the
record. Velo does not use the browser's JSON reader —it would reorder some keys and change very
large numbers— but its own strict one. That is also why it rejects a record that repeats a key:
depending on who reads it, the first or the last one wins, and Velo will not choose for you which
value to keep.

**Every path is a column.** A value inside nested objects becomes a column named after the way to
reach it: `paciente.contacto.correo` (“patient.contact.email”). From there, the policy, the
diagnosis, the risk and the certificate work as they do with a table. To tell what each path is,
Velo looks at its **last segment** (`correo`, not `paciente`): a parent called `salud` (“health”)
does not make what is inside it sensitive. Where a table says “rows · columns”, the diagnosis says
“records · treated paths”.

**The “JSON structure” panel.** It shows up in the diagnosis only for a JSON. It says how many
records there are, how many paths are treated, the maximum depth and the shape of the file, and it
declares two things:

- **Lists are not treated.** A list inside a record (`contactos[]`, `etiquetas[]`) does not fit in a
  column: Velo neither flattens nor treats it, and it goes into the file **as it is**. The panel says
  so above the table, with a strong notice: it names the path, how many records it appears in and
  the **names** of the fields it saw inside (never the values). A list can hold emails, phone
  numbers or ID numbers, and **the policy you choose does not reach it**. Before handing the file
  over, treat those lists yourself or remove them at the source. Today Velo does not treat them.
- **Irregular paths.** The ones missing from some records or that change type from one to the next
  (sometimes a number, sometimes text or `null`). Where a record lacks the path, Velo does not
  create it. A cell that the policy changes comes out as text, even if the original was a number.

**What comes out.** A JSON goes in and a JSON comes out, of the same kind: an array comes out as
`velo-anonimizado-<8 characters>.json` and JSON Lines as `.jsonl`. It is a faithful rewrite, not a
byte-for-byte copy:

- Keys keep **their original order** and the structure is the same.
- It is written **compact, one record per line**: the spaces and line breaks between elements of
  the original are not kept.
- Numbers that did not change are copied with their exact digits (`12345678901234567890`, `1E3`),
  without going through a browser number that would round them.
- A cell the policy changed always comes out as text (a generalized `30-39` is already text). One
  that ended up empty is written the way the original had it: no key, `null` or `""`.
- A column the policy **suppresses** disappears from every record; if the object that held it is
  left with nothing, it stays as `{}`.
- What is inside a declared list is not touched.

The certificate carries both SHA-256 fingerprints, and Velo recomputes the original's while it
writes: if the file changed since the diagnosis, it does not hand it over.

**A way back.** A JSON can have a vault too: the “Make it undoable with a vault” box works just as
it does with a table, and when the third party sends the worked file back you recover it in
[the return](#6-the-return-getting-back-what-you-handed-over), which reads JSON and JSON Lines as
well as CSV. What is not a reversible pseudonym (masking, generalizing, removing a column, noise)
does not come back, just as in a table.

**If it is not valid JSON,** Velo tells you the line where it stopped (“the problem is there, or just
before it”) and does not echo anything from inside the file: not a piece of it, not the name of a
key. The other reasons —not a list of records, too many levels, too many distinct paths, a repeated
key, too big— also say what to do.

### 2. Read the diagnosis

The diagnosis screen has three parts. (That is the one for a table or a JSON. If you dropped a PDF or
an image, the diagnosis is a different one, explained in
[section 8](#8-pdfs-and-images-cleaning-what-the-file-says-about-itself).)

#### Re-identification risk

The big number answers a single question: **how many people in your table end up alone**. An
“alone” (or _unique_) record is a row whose combination of values nobody else shares — you could
point a finger at it.

| Figure                        | What it means                                                            |
| ----------------------------- | ------------------------------------------------------------------------ |
| **% unique**                  | What share of your records share their combination with no one else.     |
| **Smallest group (k)**        | How many people are in the smallest group. If it is 1, someone is alone. |
| **Risk for the most exposed** | “1 in 1” means that guessing who that person is is certain.              |
| **Average risk**              | The average of the risk over all records.                                |
| **Distinct groups**           | How many different combinations of values there are.                     |

**Every one of these figures is exact.** They are not an estimate or a projection: they were
counted record by record over your entire file. The panel says so in so many words (“Exact
figure”), and that label matters because in the workshop they sit alongside **estimated figures**
—the population-risk ones, further down—, which carry the word “estimated” attached to the number.
They are never added or averaged together: they speak about different things.

The model Velo uses is called **prosecutor**: it assumes that whoever is attacking already knows
the person is in your table and is only looking for which of the rows it is. It is the most adverse
of the scenarios that are studied, and the only one that can be calculated exactly.

#### Column by column

Each row of the table tells you what Velo found and, above all, **why**. That “why” has three
levels of certainty, and the difference between them is the difference between knowing and
suspecting:

| Level            | What it means                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Confirmed**    | An official check digit exists, and Velo recomputed it and it matches. This is the case for the NIT (the DIAN's mod 11), payment cards (Luhn), the IBAN and the European documents in [section 10](#10-the-gdpr-policy). |
| **By its shape** | There is no public checksum for this data type, so only its shape could be checked. This is the case for the Colombian cédula: the Registraduría does not publish a check digit.                                         |
| **Unconfirmed**  | The conclusion rests on the **column name**, not on the values. No calculation can look at “J45.9” and state that it is a health diagnosis; only the header suggests it.                                                 |

And each column falls into one of the **four categories of Colombia's Law 1581 of 2012**:

| Category                    | What it is                                                                                              | Examples                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Direct identifier**       | Points to the person without help from anything else.                                                   | cédula, NIT, name, email, mobile number, address        |
| **Sensitive data (art. 5)** | Health, racial or ethnic origin, beliefs, sex life, biometrics. The law protects them in a special way. | diagnosis, ethnic group, health insurer (EPS)           |
| **Quasi-identifier**        | On its own it does not identify; **combined with others, it does**.                                     | date of birth, sex, municipality, socioeconomic stratum |
| **Not personal**            | Does not point to a person.                                                                             | amount, branch, product code                            |

A clarification that is often needed: **a cédula is not “sensitive data”** in the sense of the law.
It is personal data and a direct identifier, which is different. Velo does not mix the two up, even
if painting everything red would be more eye-catching.

The **samples** shown in the last column are always masked (`103***89`), and sensitive-data columns
carry no sample at all: with three possible values, an asterisk hides nothing.

#### The crossing advisor

Here is the finding almost nobody expects: **columns that identify no one separately, together
point to half the table**. It is the classic result of Latanya Sweeney (2000) and its replication
by Philippe Golle (2006), applied to _your_ data.

The advisor shows two things:

- **The ones that give people away on their own**: columns that, by themselves, already leave
  almost everyone alone. This is often the most important thing in the file.
- **The most revealing combinations**, each with its **actual k** — not estimated.

And it declares its own scope: how many combinations it evaluated, over how many candidate columns,
with what limit, and which columns were left out and why. If Velo looked at 6 columns out of 24, it
says so right there and not in a footnote of the documentation.

### 3. Take the report with you

The **Download the report** button produces an HTML file that opens with a double click on any
computer, **with no internet and nothing to install**. Before downloading it you can see all of it
with “Preview before downloading”.

**What it carries:** column names, what was detected and why, the categories, the risk figures, the
file's fingerprint and the date.

**What it does not carry:** any row of your table. Samples are masked, and sensitive columns carry
not even a sample.

#### The SHA-256 fingerprint and what it is for

The report includes the **SHA-256** of the file you analyzed. It is a 64-character signature that
depends on every byte of the file: if a single cell changes, the whole fingerprint changes.

It lets whoever receives the report check that it speaks about **that exact copy** and not another
one. You verify it like this:

```bash
# macOS
shasum -a 256 my-file.csv

# Linux
sha256sum my-file.csv
```

```powershell
# Windows (PowerShell)
Get-FileHash my-file.csv -Algorithm SHA256
```

The text that comes out has to be identical to the one in the report.

---

### 4. Transform: the workshop

From the diagnosis, **Transform this file** takes you to the workshop. This is the part that really
changes the data, and it happens the same way the diagnosis does: inside this tab, with nothing
uploaded. (With a PDF or an image the button reads **Clean this file** and leads to a screen with no
options: [section 8](#8-pdfs-and-images-cleaning-what-the-file-says-about-itself).)

#### The policy: what happens to each column

One row per column, with a dropdown. You can choose column by column or start from a **built-in
policy**:

- **Habeas Data (Colombia)** — Colombia's Law 1581 of 2012 and Decree 1377 of 2013, with the
  techniques from the AGN + SIC anonymization guide. It declares a minimum-group target (k = 5).
- **HIPAA · Safe Harbor** — the 18 identifiers of 45 CFR §164.514(b)(2). Note: Safe Harbor requires
  **removing**, not pseudonymizing, because §164.514(c) rules out a code derived from the
  information.
- **RGPD · GDPR (UE)** — Regulation (EU) 2016/679. **It pseudonymizes, it does not anonymize**:
  [section 10](#10-the-gdpr-policy) tells the story. It declares a minimum-group target (k = 5)
  that is Velo's choice, not the regulation's.

All three say, right there, how many of their points Velo recognizes from the contents of the
column, how many only from the name, and **how many you have to mark yourself**. None is a
certification.

As soon as you touch a rule in a built-in policy, Velo says so: _“It's no longer Habeas Data”_ (or
whichever one it was). The official guidance does not back a decision it did not make.

The policy **is not saved anywhere**. If you want it for next month, **export it** — it is a JSON
file you can import again. It carries your column names, which are your data, and that is why it
does not go into this browser's memory.

#### “Generalize until k is reached”

It is the only technique you do not fully decide: you mark the columns and **Velo looks at them all
together** and decides where to cut until nobody is left in a group of fewer than _k_ records. When
you choose it, the **minimum group size** box appears, with 5 filled in — and from then on that 5
stays **inside the policy**, not just on the screen. The higher the k, the safer and the less
precise the data.

If you import a policy that asks for automatic generalization and **carries no k**, Velo tells you
so in red and leaves the box empty: without a k there is nothing to generalize up to, and those
columns would come out untouched. If you transform anyway, the balance puts it at the very top,
with their names.

There are two ways to reach that k —Mondrian, the usual one, and the optimal generalization— and the
workshop lets you compare them before you choose: it is explained at the end of this section, in
[“How to reach k”](#how-to-reach-k-mondrian-or-the-optimal-generalization).

#### The key, if you ask for pseudonyms

A pseudonym is calculated with a **passphrase that only you have**. Three things worth knowing
before you type it:

- **The same passphrase gives the same pseudonyms.** It is what lets you match March's file against
  April's without having the real data in front of you.
- **If you lose it, there is no going back.** Nobody can regenerate it; that is the trade-off for
  nobody else having it.
- **If it leaks, the pseudonyms become linkable.** Treat it like a password.

Deriving it costs 600,000 iterations of PBKDF2 (the minimum OWASP recommends), **and that cost is
the protection**: it makes every attempt to guess it equally expensive. How long it takes depends
on the machine —on a modern laptop it is an instant, on a low-end phone you notice it—; what is
guaranteed is the number of iterations, not the seconds. Save the passphrase **and the salt** that
Velo shows you: without both, next month's pseudonyms will not match.

#### Before and after

The preview shows, column by column, what the other person will receive. The values on the left are
**masked** because they are still your data; the ones on the right are shown in full **when that
value changed**. A sensitive column that did not change is not shown.

You will see masked values on the right inside columns that did change, and that is correct: a
generalization leaves untouched what was already in place —a prefix of 2 does not touch what is
already 2 long— and a value that did not change is still your data, so it is covered all the same.

Below it, the balance. And here is a product rule worth knowing: **if anything is left untreated,
that is read before any percentage**. A cédula left untouched next to a “risk reduced 87%” are two
true sentences whose sum says something false, so Velo puts the caveat at the top and does **not**
present the figure as the headline until nothing contradicts it.

What can show up there:

| Caveat                                 | What it means                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Untreated identifiers                  | There are columns that point to the person without help from any other, and the policy leaves them untouched.                                 |
| Records that are still alone           | After the treatment, someone is still unique in their combination of values.                                                                  |
| The requested k was not reached        | You asked for groups of N and the partitioning reached less. Velo **does not delete rows** to get there.                                      |
| The partitioning's k is not the file's | The generalized columns reached their k, but other columns that were not part of it split those groups. **The file's number is what counts.** |
| Homogeneous groups                     | There are groups where everyone shares the same sensitive value: finding the group is enough to know it.                                      |
| Pseudonym collisions                   | Preserving the format (cédula, NIT, a European document) shrinks the available space and two different values can collide.                    |

#### The file

**Prepare the file** writes it, and **Save** downloads it. It comes out as
`velo-anonimizado-<8 characters>.csv` (`.json` or `.jsonl` if what went in was a JSON, see
[“If your file is a JSON”](#if-your-file-is-a-json)) and does not repeat the original's name on purpose: a name
like `pacientes-2026.csv` tells what the contents are about before anyone opens it, and that name
travels in the subject line of an email.

Those eight characters **are not a serial number**: they are the start of the SHA-256 of the policy
you applied. Two files that share them received exactly the same treatment — and the certificate
carries the full hash, so you can verify it.

A CSV or an Excel file comes out as a comma-separated CSV, with a `\n` line break and **no BOM**. If
Excel on Windows asks you about the encoding, it is **UTF-8**. (Velo does not generate `.xlsx`: an `.xlsx` is a zip and its
entries carry dates, so two identical files would not come out identical byte for byte — and that
equality is precisely what Velo promises.)

#### The treatment certificate

The workshop also delivers a document, and it is not the same one as the diagnosis: besides what is
in the table, it says **what was done to it** — the balance with its caveats, the utility that was
lost and the full hash of the policy. Like every Velo document, you can **preview it before
downloading it**.

**It appears after the file, not before.** The certificate carries the fingerprint of the treated
file, and that fingerprint does not exist until the file does. In the meantime, in its place you
will see a note saying so.

Send it with the file. An anonymized CSV that arrives alone forces whoever receives it to take your
word for it; with the certificate next to it, they can **check it**.

> **It carries both fingerprints, and that is why it works.** One is the fingerprint of the file
> that **went into** Velo; the other, of the one you **download**. Whoever receives your file can
> recompute that second fingerprint with one command —the certificate itself explains how, with the
> exact command for macOS, Linux and Windows— and check that the document is about **that copy and
> not another**. If it does not match, the file is not the one the certificate describes.
>
> What a certificate is **not**: a digital signature. It proves that the document and the file
> correspond to each other, not who produced them.

#### The estimated risk: and across the whole population, how much?

Below the balance there is a second panel, and the difference between the two is the most important
thing to get across:

|                    | The balance               | The estimated risk                            |
| ------------------ | ------------------------- | --------------------------------------------- |
| What it is about   | **your file**             | the **population** it came from               |
| How it is obtained | counting record by record | with a statistical model and an assumption    |
| How it is labeled  | “Exact figure”            | “Estimated figure”, with its model next to it |

**They are never combined.** There is no “total risk” that averages the two, and they never appear
in the same typography. Adding an exact figure to an estimated one gives a number that is neither.

**It is optional, and you have to declare the population.** Velo only sees your file: it cannot
know whether those 2,000 rows come from a town of 40,000 residents or from a whole country, and it
**does not make it up**. Without that figure the estimate does not appear, and the exact risk does
not depend on it.

Once you declare it, two figures appear, each with its source cited:

- **If someone tries to match a row to a person, what are the odds they get it right?**
  (Benedetti–Franconi, 1998 — the μ-ARGUS estimator.)
- **Of your unique records, how many would also be unique in the population?** (Zayatz, 1991, from
  the U.S. Census Bureau.)

**And sometimes Velo refuses to give you the second one**, with this explanation: if your file is
under 10% of the population you declared, that method stops being useful — in the evaluation in
Zayatz's own report, with a 1% sample the estimates can be off by a factor of 10. We would rather
not give the figure than give a weak one. The first one still answers: the two models do not hold
on the same ground, and that difference is information.

One detail that falls out of the math on its own and is worth knowing: **if you declare that your
file is the entire population, the estimated figures land exactly on top of the exact ones.** It is
not a programmed exception; it is that there is nothing left to estimate.

#### How to reach k: Mondrian or the optimal generalization

When a column carries the “Generalize until k is reached” technique, the **“How to reach k”** panel
appears under the minimum-group-size box. There you choose between two roads to the same k:

- **Mondrian (the usual one)**, which is the one that comes selected. It cuts the file into regions
  and generalizes each one differently: it is fast and loses little where there is a lot of data.
- **The optimal generalization.** It moves each column up its own **ladder** to one level, **the
  same across the whole file**, and out of every combination of levels it picks the one that meets k
  while losing the least information, measured in bits. It is the OLA algorithm (El Emam et al.,
  _JAMIA_, 2009). **By default it does not delete rows**; if you ask it to, it may delete up to a cap
  (below).

Your choice is stored inside the policy, so it travels with it if you export it.

**Each column's ladder.** It is the list of steps, from the finest to the coarsest, that a column
climbs. Velo suggests one from the column's type and name; if it does not fit, you change it in the
“Generalization ladder for the column …” dropdown:

| Ladder                                                                 | What it does                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| “Ranges of 5, 10, 20 and 40”                                           | A number in ever wider ranges.                                  |
| “Ranges of 10, 100, 1,000 and 10,000”                                  | The same, for big figures.                                      |
| “Date: month, quarter, year”                                           | The quarter comes out as an interval (`1987-01/1987-03`).       |
| “First 3, 2 and 1 characters”                                          | A code that keeps fewer and fewer characters from the start.    |
| “The value or nothing”                                                 | The value as it is, or suppressed (`*`), with no steps between. |
| “Municipality, department, region (DIVIPOLA, DANE)”                    | Built in, with an official source.                              |
| “Age: five-year groups, broad groups (DANE)”                           | Built in, with an official source.                              |
| “Economic activity: group, division, section (ISIC Rev. 4 A.C., DANE)” | Built in, with an official source.                              |
| “Economic activity: group, division, section (ISIC Rev. 5 A.C., DANE)” | Built in, with an official source.                              |

The built-in ladders rest on official sources, and the certificate cites them with the date
they were consulted (November 2, 2026):

| Ladder                              | Source and version                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Municipality → department           | DANE, DIVIPOLA “Códigos municipios”, published on datos.gov.co (dataset gdxc-w37w), update cut off on December 30, 2024: 1,122 municipalities and areas, 33 departments.      |
| Department → region                 | Ley 2056 de 2020, article 45 (secretariasenado.gov.co): the 6 regions of the General Royalties System.                                                                        |
| Age → five-year group → broad group | DANE, Population Projections and Demographic Studies (PPED), July 2025 update: five-year groups from 0-4 to 95-99 and 100 and over; broad groups 0-14, 15-59 and 60 and over. |
| Economic activity (Rev. 4)          | DANE, CIIU Rev. 4 A.C. (ISIC Rev. 4 adapted for Colombia), 2022 update, adopted by Resolución 2306 de 2022: class, group, division, section.                                  |
| Economic activity (Rev. 5)          | DANE, CIIU Rev. 5 A.C., “Estructura detallada”, adopted by Resolución 992 de 2026: 22 sections, 87 divisions, 266 groups and 544 classes.                                     |

**Two revisions of the CIIU, side by side.** Velo ships **Rev. 4 A.C.** (2022) and **Rev. 5 A.C.**
(the one DANE adopted in 2026, with a two-year transition): one file may carry codes from either. They
are not interchangeable: **436 of Rev. 5's 544 classes also exist in Rev. 4 under the same number,
and 118 of those change section** (Rev. 4 puts divisions 58 to 63 in section J; Rev. 5 splits them
into J and K). The same code may climb to another letter depending on the revision, which is why it
matters which one you use.

- **How Velo decides which to suggest.** It looks at the column's codes: how many exist **only** in
  Rev. 4 and how many **only** in Rev. 5 (66 and 108 classes respectively; the rest are shared). If
  the exclusive ones all belong to one revision, it suggests that one, and under the dropdown it
  says how many of its codes exist only there. If there are some of each, or if **every** code is
  shared and none says which it is, it suggests Rev. 4 and says so. **The ladder dropdown is the
  selector: you choose.** Only those counts reach the page; the codes do not leave the file.
- **Velo does not translate from one revision to the other.** DANE's correspondence table
  (September 15, 2026) relates the codes of one to the other **many-to-many**: a code can split into
  several and several can merge into one. Velo **cites** it in the certificate but **does not use
  it**: turning one code into another would be inventing which activity each row belongs to. Each
  column climbs the ladder of the revision you chose, and a code that is not in that revision stays
  as it is in the middle steps and reaches `*` at the last one, like any code that is not found.

What a built-in ladder does not find —a code that does not exist, a municipality name that appears
in two departments— stays as it is in the middle steps and reaches `*` at the last one. Velo **does
not guess** which “La Unión” you mean: choosing one would be stating where someone lives.

**Distinct ℓ, when there is sensitive data in the partition.** A field appears, “Distinct ℓ
(optional) over …”, from 2 to 100. It asks that every group hold at least ℓ different values of the
sensitive data, so that being in the group does not give it away. **Only the optimal generalization
enforces it**; with Mondrian it is measured, not enforced. If the ℓ asked for is not reached, the
certificate says so; only with the suppression cap, which you set, does Velo delete rows to get there.

**Comparing them before you choose.** The **“Compare the two roads”** button works both out and puts
them in a table, “The two roads, side by side”:

| Row                            | What it says                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Does it reach the k asked for? | ✓ Yes or ✗ No, for each road.                                                       |
| Smallest group (k)             | The k that was actually reached.                                                    |
| Distinct ℓ                     | The one reached, if you asked for one.                                              |
| Distinct groups                | How many different combinations are left.                                           |
| Records alone in their group   | How many are still unique.                                                          |
| Risk of the most exposed       | The chance of picking the most exposed person correctly, over the measured columns. |
| Information left (bits)        | How much of the original detail survives: more bits, less loss.                     |
| How each column ends up        | Each one's level (with Mondrian, “local cuts”).                                     |
| Combinations checked           | “N of M”: how many of the possible ones the search walked through.                  |

The table says it right under its title, and it is worth reading: **it is measured over the columns
of the partition —the ones you marked “Generalize until k is reached”—, not over the whole file.**
Other columns that were not part of the partition can split those groups; the full balance, the one
that counts, arrives when you transform.

“Optimal” means the best combination of levels **from the ladders you gave it**, not the best
generalization that exists: with other ladders, or with another suppression cap, the result could be
different.

**Suppression cap: deleting rows, only if you ask.** Under the ladders there is a field
**“Suppression cap (optional), as a % of the rows”**. Empty, or at 0, Velo **deletes no row** and
everything works as before: the file comes out **byte for byte the same** as without the field. With
a number —say 2.5— the search may leave out of the output file the rows that sit in groups that do
not reach k (or ℓ), **as long as they are no more than that percentage of the rows**, in exchange
for generalizing the others less: sometimes deleting three stray rows saves climbing a whole column
one level. The search is still **exact**, not an approximation: it finds the combination with the
least loss among those that fit in the cap, and every deleted row counts as a total loss.

- **The table “The two roads, side by side”** gains a third column, **“Optimal, deleting up to N%”**,
  next to **“Optimal, deleting none”**, and a row **“Rows that leave the file”**: so you see, with
  the loss of each, how much the cap saves and what it costs.
- **The rows leave the output file, never your original.** The preview and the utility measures are
  computed over the rows that remain. The certificate and the report say **how many rows left and
  of what group sizes they were** (for instance “3 from groups of 1 · 4 from groups of 2”): counts,
  never values.
- **In a JSON the cap does not apply**: each row of a JSON is a record rewritten in place, and
  removing it would break its structure. The screen and the certificate say so (“The file is
  JSON…”).
- The cap travels inside the policy if you export it, and [Velo local](#11-velo-on-your-machine-the-console-databases-and-the-api)
  honors it too: the same policy gives the same bytes on the web and on your computer.

**The limit and the time.** If the lattice —the product of the steps of all the ladders— goes over
**20,000 combinations**, Velo does not walk through it: the table says “Not computed: the lattice is
over the limit”, the columns come out **untouched** and the balance puts that first. With fewer
columns in the partition, or shorter ladders, the lattice fits. With 500,000 rows and 6 columns the
search takes about 10 to 30 seconds depending on the machine; it happens in the background, so the
page does not freeze, and it runs **twice**: when you compare and when you transform.

**What gets written down.** The certificate gains the section **“How k was reached · The optimal
generalization”**: each column with its ladder and the level chosen, the k and ℓ measured, how many
combinations were checked, and the sources of the built-in ladders with their date.

#### Noise with a guarantee: local differential privacy

The dropdown of each column carries three more techniques, which add **noise**: a measured, random
change in each cell. All three need the project key (the passphrase described above), because the
randomness comes from it. “Guarantee”, here, is the name of the panel and means **a measured ε with
its scope**; it is not a promise that the file is anonymous. The parameters show up under the menu:

| Technique                 | What it is for                       | Parameters                                                                        | What its ε covers                                                       |
| ------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| “Laplace noise (ε)”       | Numbers (amounts, ages, weights)     | ε (0.1 · 0.5 · 1 · 2 · 4 · 8), the **possible** min and max of the data, decimals | ε per value of that field.                                              |
| “Randomized response (ε)” | Categories, up to 64 distinct values | ε                                                                                 | Effective ε, always at most the one asked for, per value of that field. |
| “Perturb ±%”              | Numbers                              | How far the data may move, from 1 to 50 %                                         | It has no ε: **no formal guarantee**.                                   |

- **Laplace noise.** Each number gets noise from a discrete Laplace distribution. The range you
  declare is the one the data **can** take (an age, from 0 to 120), not the one your file has:
  taking it from the data would already give something away. What falls outside the range is clipped
  before the noise and counted; what is not a number stays as it is and is counted too; an empty
  cell stays empty.
- **Randomized response.** Each cell, sometimes, answers a random value among the ones the column
  holds. The possible values come from the file: **that a value shows up in the column is not
  protected by ε.** With more than **64 distinct values Velo does not apply it**: the column comes
  out untouched and the balance says so first.
- **Perturb ±%.** It moves each number at random by up to ±x %. It is not differential privacy: it
  has no ε and promises nothing measurable, which is why the screen, the certificate and the log
  label it “no formal guarantee”.

**What ε is, without formulas.** It measures how much someone who sees the file can learn about
**one value of one field**. The lower the ε, the more protection and the more noise —the data comes
out less useful—; the higher the ε, the less noise and the less protection. “Local” means the noise
goes into each cell before the file leaves your computer: the file you hand over already carries
it. **Velo does not decide which ε suits you, nor does it call any of them “enough”**: it depends on
what the file is for and who it is going to. The screen repeats the ε and its scope next to each
column's menu: “Local differential privacy, ε = X per value of this field”.

**After you transform**, the **“Noise with a guarantee · Local differential privacy”** panel
appears, apart from the balance. For each column it gives the mechanism, the effective ε (and the
one asked for, if they differ), how many cells received noise and the notes: how many cells were
clipped, how many were not a number, how many values the domain has. At the end, **“ε per row”**:
the sum of the ε of the columns with noise, because that is how they compose. Velo shows the ε
**rounded up**: if it is off, it is off on the side of saying less protection, not more. If no
column carries an ε (you only perturbed), the panel is called **“Noise with no formal guarantee ·
No differential privacy”** and says nothing about ε, on screen, in the certificate and in the log:
perturbation is not differential privacy.

**What ε does not cover**, and the panel says so in so many words:

- **Only one value of one field.** It is not the file's ε, nor the whole person's: a person with
  several noisy columns spends the sum, and that sum is the “ε per row”.
- **The other columns.** The ones without noise are not protected by ε, but by whatever you applied
  to them.
- **Repeated deliveries.** Each different file you hand over with the same data spends its own ε,
  and the ε add up. The same file with the same key and the same technique (the same ε, the same
  range) gets the same noise, so it cannot be averaged away by running it twice; another file, or
  another ε or range on the same file, gets other noise, independent, and spends its own ε.
- **The k.** The k is measured apart, over the file, and **does not add up with ε**: they are two
  different measures and Velo does not make up a number that joins them.

Noise destroys information, like masking: there is no vault that can undo it. The randomness is
drawn by exact sampling, with no floating point (Canonne, Kamath and Steinke, NeurIPS 2020), and it
comes from the project key and the file's fingerprint. The certificate carries a privacy section
with the effective ε per column, the ε per row and the scope, and the log records “ε = X per row”
with the mechanisms (or “N perturbed columns, no formal guarantee”). This is noise over the cells of
your file: Velo does not produce counts tables with differential privacy.

---

### 5. The vault: so you can undo it

A pseudonym, on its own, **does not come back**: it is an HMAC, not encryption, and no algorithm
reverses it. The way back is given by a table that says which pseudonym came from which value — and
that is the **vault**.

**How you ask for it.** In step 1, under the technique of each column that is a pseudonym, the box
**“Make it undoable with a vault”** appears. Tick it on the columns you want to be able to recover.
Only pseudonyms accept it, and that is not a limitation of this version: masking (`103***89`),
generalizing (`30-39`) and adding noise **destroy** information, so there is no table that can undo
it — the missing digits no longer exist anywhere. The screen names the masked, generalized or
removed columns that will not come back; the ones with noise will not either. **With a JSON the box
works the same:** the return (section 6) reads JSON too.

**How it is saved.** After you transform, step 9 appears. You type a passphrase —**it can and
should be different from the project's**— and Velo prepares an encrypted `.velo` file for you to
download.

Three things about that file, and all three matter:

- **It holds your original data.** It is the most sensitive file that comes out of Velo: a table of
  identifiers with nothing around it. Keep it where you would keep the original.
- **Never next to the anonymized file.** If both travel in the same email, whoever receives that
  email has the un-anonymized file. The vault is yours; the anonymized file is what you hand over.
- **Without the passphrase there is no recovery.** Not by Velo, not by anyone. It is the trade-off
  for nobody else being able to open it. Write it in your password manager before closing the tab.

It is encrypted with AES-GCM and a key derived from your passphrase with 600,000 iterations of
PBKDF2. There is not a single readable original value on disk.

---

### 6. The return: getting back what you handed over

When the consultant, the company or the AI sends you back the worked file, go to **`/regreso`** (the
link is in the vault step of the workshop, and the route works on its own: you do not need to have
anything loaded).

1. **Load the vault** and type its passphrase. Velo shows you its fingerprint, how many mappings it
   holds and which columns it can restore.
2. **Load the returned file.** It has to be a CSV or a JSON (an array, JSON Lines or NDJSON); if it
   came back to you as Excel, open it and save it as CSV. It can come back with the rows in a
   different order, with new columns from the third party, without the ones they deleted and with
   values corrected by hand: none of that gets in the way.
3. **Read the notice before you confirm.** If the vault has ambiguous pseudonyms, Velo tells you how
   many **before** you press, not after.
4. **Restore the original values** and take the restored file and its report with you.

**Why it survives the third party working on it.** Restoring is **by value, never by position**:
Velo looks up each value in its column's mapping. And it recognizes columns by their **content**,
not by their name — if the third party renamed `cedula` to `ID_PACIENTE`, it is still recognized.

**If what you handed over was a JSON.** The return reads it just as it reads a CSV —an array of
objects, JSON Lines or NDJSON— and restores **path by path**, by value. What comes back keeps the
structure and the key order of the file that was returned to you, and the columns that were all
numbers in your original come back **without quotes**, as numbers. If the third party touched
nothing, the restored JSON is **your original, byte for byte**, except for what never had a way
back (what was masked, generalized, removed or noised, and the pseudonyms you did not mark as
reversible). One caveat: Velo writes compactly, one record per line, so that “byte for byte” holds
if your original was already written that way; any indentation or spacing it had was not kept on
the way out and does not come back. The file is named `velo-restaurado-<8 characters>.json`
(`.jsonl` for JSON Lines or NDJSON); with a CSV, `velo-restaurado-<8 characters>.csv`. The eight
characters are the start of the SHA-256 of the file that was returned to you.

**The four things that can happen to a cell**, and Velo counts all of them:

|                                | What happened                                         | What comes out in the file |
| ------------------------------ | ----------------------------------------------------- | -------------------------- |
| **Restored**                   | its pseudonym was in the vault with a single original | the original value         |
| **Ambiguous**                  | its pseudonym matches **two** originals               | **the pseudonym, intact**  |
| **Changed by the third party** | the value is not in the vault                         | exactly as they left it    |
| **Out of scope**               | its column was not in the vault                       | the whole column, intact   |

> **About the ambiguous ones.** A format-preserving pseudonym —cédula, NIT, a PESEL or a Steuer-IdNr— has to fit into many
> fewer values than a full hash, so sometimes two different values receive the same one. Velo
> **does not choose for you**: it leaves the pseudonym in place, tells you how many cells that is
> and states them in the report. Writing one of the two candidates would hand you back another
> person's data with nothing to show it.

**The return report** says what came back and what did not, with the caveats **before** the
percentage — just like the treatment certificate. It carries no cell: only column names, figures
and fingerprints. The restored file does carry your data: treat it like the original, because it
is.

---

### 7. The log: remembering six months from now

The certificate proves **one** treatment to whoever receives it. The log answers a different
question, and it is yours alone: **“what have I done with my files?”** — months later, when someone
asks you what you handed over, when and by what criteria.

**How you log it.** At the end of the workshop, after generating the file, **“Add to my log”**
appears. It takes you to the log with the entry ready: you choose a passphrase and Velo hands you
the encrypted file. If you already had one, you open it first right there and the entry is **added
at the end**, without touching the earlier ones.

**What gets logged:** the file name, the date, the techniques you applied —**without saying to
which columns**—, the policy hash, both fingerprints, and the share of unique records before and
after. If you used noise, the entry also keeps “ε = X per row” with its mechanisms (the sum of the ε
of the columns with noise, as in the panel in section 4) or, if you only perturbed, how many
columns were left with “no formal guarantee”.

**Cleaning a PDF or an image is logged too.** After cleaning, the same **“Add to my log”** button
shows up, and the entry goes into the same `.velolog` file, alongside the others. It carries the file
name, the date, the format, how many named fields it had, how many blocks were removed, how many
earlier versions (in a PDF) and both fingerprints. **It carries no risk figures —there are no rows
to measure— and no metadata value**, and the entry reminds you that the contents were not touched.

> **The two proportions, and not the subtraction between them.** It is deliberate. “It fell from
> 30% to 2%” is true and can mislead, and a log is read months later with no screen beside it to
> qualify it. If that measurement carried caveats that disqualified it, the entry says so too.

**It is encrypted, and the reason matters:** a file name tells what its contents are about before
anyone opens it. `pacientes-oncologia-2026.csv` already says too much. A log is a list of those
names with their dates — the summary of what you do and who you work on — so it cannot be in the
clear.

**It is a separate file from the vault,** with **its own passphrase**. It ends in `.velolog` and
not in `.velo`. Three reasons: it exists even if the treatment has no reversible columns; the vault
is per job while the log grows over months; and mixing them would mean that losing one is losing
both.

> **These are three secrets with three different scopes** —the project passphrase, the vault's and
> the log's— and **they should not be the same**: reusing them turns one leak into a leak of
> everything. Velo does not share them or fill them in for each other.
>
> And as with the vault: **losing the log's passphrase is losing the log.** There is no recovery,
> and saying so beforehand is part of the deal.

**When you open the one you already have**, you will see it from the most recent entry to the
oldest; each one expands with a click. If you pick the wrong file and open the vault, Velo tells
you —“that is the vault”— instead of sending you off to try passphrases.

Measured: **2,000 entries open and render without a single long task** on the main thread.

---

### 8. PDFs and images: cleaning what the file says about itself

A photo or a PDF says things about itself that nobody sees on screen: the camera and its serial
number, the GPS position, the author, the program it was made with, the dates, an identifier that
ties the copy to its original, the thumbnail of how the photo looked before it was cropped, the
earlier versions of a document. That is its **metadata**. Velo reads it, shows you what it found and
hands you a copy without it. It all happens inside the tab, as with a table.

> **The limit, said first.** Velo cleans what the file says about itself; **it does not touch the
> text on the pages or what can be seen in the image.** A name typed into a paragraph, a face, a sign
> or a license plate in the background stay exactly as they were. If the content itself is
> sensitive, edit it first —cover the name, crop the image— and then clean that copy. Velo says this
> above the diagnosis, again in the result and in the certificate, with the same weight as what it
> does do.

**How to use it**

1. **Drop the file** on the main screen, like any other. Velo recognizes it by its contents: PDF,
   JPEG, PNG, WebP, HEIC, AVIF or a Live Photo's video (MOV). If the extension lies (a `.jpg` that is a PNG), it treats the file as what it
   is and says so.
2. **Read the metadata diagnosis.** It has four parts:
   - **“What Velo cleans and what it leaves alone”**: the limit above, with what changes and what
     does not depending on whether it is a PDF or an image.
   - **“What the file says about itself”**: the named fields, one per row. Each one says **where it
     lives** (EXIF —camera data—, GPS, XMP, IPTC, PNG text, a comment, the PDF's information or an
     earlier version of the PDF), **what it reveals** (authorship, location, device, software, date,
     identifier, description) and a **masked sample**: Velo never shows more than half of a value,
     and a short one appears as `***`. The full value never leaves the tab. The last column says
     **what Velo recognizes** with the same validators as section 2: whether a field is a cédula, an
     email or coordinates, with the same caution (a cédula is “by its shape”, not “confirmed”). When
     what was recognized is **inside** the value and not the whole value —the author
     `Ana Pérez · CC 1032456789`— the row says “Contains: cédula”: there is one in here, not this
     is one.
   - **“What is removed and what is kept”**: the blocks of the file, with their size. More on how
     that is decided below.
   - **“What to know before cleaning”**: the notices (below). In a PDF, also **“The PDF's
     history”**: how many versions it keeps inside, how many objects an edit replaced and whether it
     carries a document identifier.
3. **Press “Clean this file”** and, on the next screen, **“Clean”**. There are no options to choose:
   everything not needed to display the file is removed, and the diagnosis already said what that
   was. Velo rewrites the file and **reads it again** to check it.
4. **Read the result**, “This is what Velo removed”: how many named fields it had, how many blocks
   were removed, how many earlier versions (in a PDF), the size before and after, the list of what
   was removed and what was kept, and —again— what did not change. In a clean PDF, the new document
   identifier.
5. **Take the clean copy** with **Save**. It is named `velo-limpio-<8 characters>.pdf` (or `.jpg`,
   `.png`, `.webp`, `.heic`, `.avif`, `.mov`, according to its contents). The eight characters are the start of the SHA-256
   of the file **that went in**; the original's name is not repeated, because it already says what
   the file is about. **The original is not touched.**
6. **Take the cleaning certificate** (`velo-limpieza-<8 characters>.html`, `velo-cleaning-….html` in English).
   Like every Velo document, you can preview it before downloading it. It opens with the limit
   (what was cleaned and what was not) and carries the **two SHA-256 fingerprints** —the
   original's and the clean copy's—, what was removed and what was kept, the fields the file had
   with their values **masked**, the check made afterwards and the notices. It carries no full
   metadata value and nothing from the contents. Whoever receives it verifies the copy as in
   section 3:

   ```bash
   # macOS
   shasum -a 256 velo-limpio-3f9a1c2e.jpg
   ```

   If the string that comes out is the clean copy's fingerprint, the file is exactly the one that
   cleaning produced. If it does not match, **the certificate is not about that copy**: it may be
   innocent —a program opened it and saved it again, and saving may have written new metadata— or
   it may not.

7. **Log it** if you want a record ([section 7](#7-the-log-remembering-six-months-from-now)).

**How Velo decides what to remove.** The cleaning works from an **allow list**, not a block list:
only what is needed to display the image or open the document is kept, and **everything else is
removed, even if Velo does not recognize it**. The list of fields you see in the diagnosis is what
Velo knows how to _name_; the cleaning does not depend on it. That is why “Velo found no named
fields” is not the same as “this file has no metadata”: what it cannot name is removed all the same,
and the diagnosis says so.

- **In a JPEG, a PNG or a WebP** no pixel is touched and nothing is re-encoded: no quality is lost. EXIF, GPS, XMP,
  IPTC, comments, PNG text, its modification date, thumbnails, the camera maker's private notes,
  content provenance data (C2PA), blocks Velo does not recognize and the **bytes left over after the
  end of the image** are removed —some programs leave there remnants of what you cropped—. What is
  kept is what is needed to display it, the **color profile** and the **orientation**: if the photo
  is not in its normal position, Velo writes a minimal EXIF block with only that tag, so the clean
  copy does not open sideways. If the file carried additional images inside (for example, the gain
  map of an HDR photo), they are removed, and a notice says so.
- **In a HEIC or AVIF photo** (the iPhone's, or a phone's or editor's that saves AVIF) the file is also **rewritten**, because removing one block
  changes where everything after it sits, but the image data is copied as it is: Velo does not
  decode the photo or convert it, and the clean copy is still a HEIC —or an AVIF—. EXIF (location, camera, dates,
  author), XMP, the descriptions and tags someone wrote about the photo, the internal names of its
  parts, blocks Velo does not recognize, unused data an edit may have left inside and the **bytes
  left over at the end** are removed. What is kept is the image, the **color profile**, the
  **orientation** (in a HEIC it lives apart from the EXIF, so none needs to be written), the
  thumbnail and the auxiliary images —a depth map, an HDR boost map—, which are pixels. Hence a
  notice of its own: the data describing the HDR boost goes with the XMP, and on an HDR screen the
  photo may show less range.
- **In a HEIC or AVIF sequence, and in a Live Photo's video (`.mov`)** the file is **not rewritten:
  it is cleaned in place.** These files carry an index of times and positions that points at every
  frame of the video, and moving everything to remove one block would risk breaking them. Velo
  leaves **every byte of image, video and audio exactly where it was**, and erases only the
  metadata blocks: it replaces them with an empty block **of the same size**. What goes is the
  location (including the one that travels as a metadata track with one position per frame, whose
  samples are zeroed), the make and model of the device, the program, titles and descriptions, the
  EXIF and XMP of the sequence, and the container's creation and modification dates, which are set
  to zero. The clean copy plays the same: it was checked by decoding before and after with the
  system's own tools and comparing frame by frame, and the result is identical.
- **The Live Photo, said plainly.** A Live Photo is **two files**: the photo and a short video
  (`.mov`). Each is cleaned separately, and **the number that pairs them is kept only in the
  video**: it is a random identifier, nothing about you. In the photo that number travels inside the
  manufacturer's private note, which goes with the rest of the EXIF. **The consequence: the clean
  photo and video no longer show up together as a single Live Photo in Photos.** Velo warns about
  this in the diagnosis and in the certificate. If you need them to stay paired, do not clean them
  with Velo.
- **In a PDF** the file is **rewritten whole**, and the pages and their content are copied as they
  are. The information dictionary (author, software, dates), the XMP, the data from the application
  that made it, the date each page was last edited, page thumbnails and orphan objects are removed.
  And so are the **earlier
  versions**: every time a program “saves” by adding changes at the end, the earlier version stays
  inside the file even though it cannot be seen —a replaced text, a previous author, a deleted
  page—. The clean copy keeps **a single version**. The document identifier (`/ID`), which ties a
  copy to its original and survives every edit, is replaced with a **new** one computed only from
  the clean content: the same file always gets the same one.

**The notices: what Velo does not clean, or cleans at a cost.** They show up in the diagnosis before
you press anything, and they are repeated in the certificate:

| Notice                               | What it means                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Annotations with an author (PDF)     | Velo shows them but **does not clean them**: the name of whoever commented stays inside the clean copy.                                      |
| Attached files (PDF)                 | **It does not clean them**: each one can carry its own metadata.                                                                             |
| Form fields (PDF)                    | Their names and values **stay as they are**: what someone typed into them is still in the clean copy.                                        |
| Embedded JavaScript (PDF)            | **It does not touch it**: it can contain data or addresses, and it stays in the clean copy.                                                  |
| Signed PDF                           | Rewriting it **invalidates the signature**: the clean copy no longer carries it.                                                             |
| Versions in compressed streams (PDF) | They are removed, but Velo cannot list what they said.                                                                                       |
| Extension differs from the contents  | The file was treated as what it is, not as what its name says.                                                                               |
| Orientation kept (image)             | A minimal EXIF block with only that tag, so the photo is not rotated.                                                                        |
| Additional images (image)            | There were more images inside the file; they are removed along with the rest.                                                                |
| Auxiliary images (HEIC)              | They are kept (they are pixels), but the data describing them is removed: on an HDR screen the photo may show less range.                    |
| Live Photo identifier (video)        | The video keeps the number that pairs it with its photo (a random UUID); the clean photo no longer carries it and Photos does not join them. |
| Compressed text (image)              | It is removed without being read, so it does not appear in the table of fields.                                                              |

**What Velo refuses to do.**

- **A password-protected PDF is not opened.** Velo does not ask for passwords, and an encrypted PDF
  cannot be read or rewritten without one. The message says what to do: remove the protection with
  the program that made it —by opening it and saving a copy without a password— and drop that copy
  in.
- **A HEIC or AVIF photo with parts Velo cannot rewrite without breaking it is left alone.** That is
  the case for a photo with protected parts, with data stored outside the file or with an unknown
  property the file declares essential. (Sequences and Live Photo videos are no longer here: they
  are cleaned in place.) Velo says “That photo
  uses a part of the format Velo does not rewrite” and hands nothing over: rather than a broken
  copy, none. Export the photo as a still image —HEIC, AVIF or JPEG— from your photos app and drop that
  copy in.
- **If the check finds anything, it does not hand the file over.** After cleaning, the same reader
  that made the diagnosis runs over the copy. If it finds **a single** named field, or (in a PDF)
  more than one version, Velo says “No file was handed over”: a cleaning that is not checked is a
  promise, and Velo does not hand over promises. Do not use a file Velo could not leave clean: make
  a fresh copy from its source —print the document to PDF or export the image again— and clean
  that. What is handed over carries the figure from the check (“**0 named fields**”) in the result
  and in the certificate.
- A PDF or image that is damaged, cut off or has a structure Velo cannot read is rejected without
  echoing anything from inside it, and the message says what to do.

**A limitation of the check, stated:** it is done by the **same reader** that made the diagnosis. It
is proof that what Velo knows how to read is gone, not a second pair of eyes. For a second opinion,
run another metadata tool on the clean copy.

---

### 9. Huge files: high-volume mode

A table of millions of rows does not fit whole in a tab's memory. When a CSV goes past
**20,000,000 cells** —rows × columns—, Velo does not try to load it: **it reads the file in
passes**. One for the diagnosis, one to measure what is going to come out, one to write it, and in
each one it computes the file's fingerprint again to check it is still the same file. It is the same
engine as always; what changes is where it gets its counts from. And everything still happens inside
your browser.

The limit does not depend on your machine or on the time of day: **the same file takes the same
road** on any computer.

**What you will see.** While it reads, the stage says “High-volume mode: the file is read in
passes”. When it finishes, the diagnosis opens with a panel, **“This file was read in passes”**,
ahead of any figure: _“It has more than 20,000,000 cells, what Velo keeps in memory, so it was read
in passes, without holding it whole in the tab. The risk below is exact: it comes from every row.”_
It then goes on to say what changes.

**What does not change**

- **The risk is still exact.** It is counted over every row, not over a sample.
- **The file that comes out is the same, byte for byte,** as the one that would come out if it fit
  in memory (same file, same policy, same key, same language). An automated test compares them on
  every change to the program.
- **The vault and the return work the same** ([section 5](#5-the-vault-so-you-can-undo-it) and
  [section 6](#6-the-return-getting-back-what-you-handed-over)). If the file that comes back to you
  is also over 20,000,000 cells, it is restored in passes too.
- **Nothing leaves your computer.**

**What changes, and Velo says so**

- **The classification looks at the first 5,000 rows.** In a smaller file, Velo classifies over a
  sample spread across the whole file; here it looks at the beginning, in order. So what it finds
  can differ from what the same file would give if it fit in memory.
- **A column with too many distinct values says “more than N distinct values”** in the table,
  instead of a figure that would not be true.
- **The crossing advisor combines only the quasi-identifiers.** The columns it would have looked at
  are listed with the reason.
- **What the file lost (its utility) is not measured:** measuring it requires comparing both whole
  tables. The certificate says so plainly —“It was not measured for this file”— and does not
  estimate the figure.
- **Pseudonym collisions are counted only where the column's dictionary fits.** That is the balance
  caveat from [section 4](#4-transform-the-workshop): two different values can receive the same
  pseudonym. In a column handled value by value (more than 1,048,576 distinct values) Velo does not
  count them and the balance does not warn about them: it saying nothing does not mean there are
  none. If it happens, the return reports those cells as ambiguous.

**The limits, and what does not fit is said.** Every limit is a constant of the program, not a
measurement of your machine. When something does not fit, Velo says so and either stops or leaves it
untouched; **it never estimates**:

| What                                               | Limit                              | What happens if it is exceeded                                                                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distinct values in one column                      | 1,048,576 (2²⁰)                    | The column is treated value by value, with the same output, and the diagnosis says “more than N distinct values”. If it was reversible, there is no vault for it: Velo stops and asks you to untick it or split the file. |
| Distinct values across all columns together        | 4,194,304 (2²²)                    | The same.                                                                                                                                                                                                                 |
| Rows in the partition (Mondrian or optimal)        | 16,000,000                         | Velo stops: generalize those columns with a per-column technique, or split the file.                                                                                                                                      |
| Distinct combinations of quasi-identifiers         | 16,777,215 (2²⁴ − 1)               | Velo says “Too many combinations to measure the exact risk” and does not estimate: generalize one of those columns first (the date to the year, the town to the region) and drop the file in again.                       |
| Distinct values in one column of the returned file | 1,048,576 (2²⁰), as on the way out | The return stops: split the file into parts and restore each one with the same vault.                                                                                                                                     |

Randomized response, which is already not applied with more than 64 distinct values, says “more than
N” instead of a false figure, and the column comes out untouched.

**Where it is saved.** Here browsers differ, and the screen tells you which case you are in:

- **In Chrome, Edge and similar browsers,** the **“Choose where to save it”** button opens the
  system's file picker. Velo writes the file **in chunks, straight into the one you pick**, without
  building it whole in the tab's memory, and when it finishes it says “Saved on your computer: …”.
  It is a download by your explicit action: the bytes go to your disk and nowhere else. If
  something fails halfway, no half-written file is left behind.
- **In Firefox and Safari** there is no destination picker. Velo says so —“this browser does not
  let you choose a destination file”— and, when you press **“Prepare the file”**, it hands the CSV
  to **your browser's download, in chunks and without building it whole in the tab's memory**: the
  file is saved in your downloads folder while Velo writes it, and the screen says “Sent to your
  browser's download: …”. Underneath there is a _service worker_ of Velo's own that serves only the
  address of that download: **it stores nothing in the browser, requests nothing from the network
  and sees only what Velo hands it**, which is the already-anonymized file, the same bytes that
  would be saved any other way. The screen cannot know when the browser finishes writing: **check
  that the download has finished before closing the tab.** If you cancel the download halfway, Velo
  notices and says “The file could not be written”.
- **If your browser does not allow that service worker** (a private window that blocks it, a company
  policy, a very old browser), Velo falls back to **parts**: it builds the CSV in memory and, if it
  weighs more than 256 MB, hands it over **cut into parts** —**“Save part 1 of 5”**, and so on—,
  cut between rows and **without repeating the header**. Joined in order, one after the other, they
  give **exactly** the whole file, the one the SHA-256 fingerprint certifies. Next to the parts there
  is a **manifest** (`….json`) listing each one with its size and SHA-256, and the fingerprint of the
  whole, so you can check you joined them right:

  ```bash
  # macOS or Linux: join the parts in order and check the fingerprint of the whole
  cat velo-anonimizado-3f9a1c2e-parte-*-de-5.csv > velo-anonimizado-3f9a1c2e.csv
  shasum -a 256 velo-anonimizado-3f9a1c2e.csv
  ```

  The fallback by parts is **for CSV only**: a high-volume JSON or JSON Lines with neither a picker
  nor a _service worker_ comes out as a single file built in memory, and if it is very large it may
  not fit; then use Chrome or Edge.

- **The restored file from the return always goes the memory way,** in Chrome and Edge too: it is
  built in memory and downloaded, with no streaming and no parts.

**A defect that was fixed.** A CSV over 10 MB with an accented letter right at the edge of one of
the chunks it is read in came out with “�” in place of the letter. It happened on the in-memory road
too, not only in this mode, and it no longer happens on either. Your original was never touched; the
defect was in what Velo wrote.

**What was measured: a reference, not a promise.** A CSV of **5,000,000 rows × 24 columns
(1.36 GB)**, with the Habeas Data policy and a key, in Chromium with the production build, on the
author's Mac. Saved the in-memory way, without the destination picker:

| Pass                  | Time  | Peak memory of the tab |
| --------------------- | ----- | ---------------------- |
| Diagnosis             | 109 s | 3.6 GB                 |
| Transform and measure | 283 s | 4.9 GB                 |
| Write                 | 267 s | 4.9 GB                 |

That is about 11 minutes in all, and **you need several GB of free memory**: close other tabs and
heavy programs first. The peak is that of the whole tab process, sampled every half second; it
counts memory the browser had not yet freed, so it is a ceiling and not what is really in use. The
work happens on a separate thread, as always. The return of that file was not measured at
5,000,000 rows; it was tested, there and back, with a 21,000,000-cell one, comparing the restored
file with the original by its SHA-256 fingerprint. Lowering the memory peak is pending.

**In Firefox and Safari (no destination picker).** A CSV of **1,000,000 rows × 24 columns**
(24,000,000 cells, already in high volume), the same policy, in Playwright's Firefox and WebKit
(Safari's engine, not Safari itself) on the same Mac. They compare the chunked download with the
previous way, building the file in memory. Memory peak of all the browser's processes, per pass (one
run per cell):

| Browser | How the file leaves  | Diagnosis | Transform and measure | Write  |
| ------- | -------------------- | --------- | --------------------- | ------ |
| Firefox | in chunks (download) | 1.8 GB    | 2.3 GB                | 2.4 GB |
| Firefox | built in memory      | 1.8 GB    | 2.5 GB                | 2.6 GB |
| WebKit  | in chunks (download) | 4.0 GB    | 4.0 GB                | 3.9 GB |
| WebKit  | built in memory      | 4.6 GB    | 4.8 GB                | 3.8 GB |

**The honest reading of that table: at 1,000,000 rows, the chunked download does not lower the
memory peak in a way you can tell apart from noise.** The first two passes do the same thing with or
without it and still change between runs (in Firefox, the diagnosis measured between 1.8 and 2.2 GB
across three identical runs; in WebKit, between 4.0 and 4.6 GB); the difference when writing (2.4
against 2.6 GB in Firefox) fits inside that variation, and in WebKit the chunked write came out
_higher_ (3.9 against 3.8 GB). With one run per cell, no improvement is claimed. What does change,
and is the reason for this path, is that the output file **no longer has to fit in the tab's
memory** to be saved: that was tested with the 1,000,000-row CSV and with a 421 MB wide one in
Firefox, and the bytes that come down are the certificate's (Chromium; in real Firefox and Safari,
see the guide). The measurement with the heartbeat to the service worker was repeated only in
Firefox; the WebKit one predates it. Real Safari was not measured: enabling its automation asks for
the Mac's administrator password, and it stays as a stop for the full rehearsal.

**JSON and JSON Lines.** A JSON with more than 20,000,000 cells (records × distinct paths) is also
read in passes. A first pass discovers the paths —the columns— and the structure without keeping any
value; the others walk the records one at a time. What comes out is **the same file, byte for
byte,** that would come out if it fit in memory: an array comes out as an array and JSON Lines as
JSON Lines, with the same faithful rewrite as [section 1](#if-your-file-is-a-json) (keys in their
order, exact numbers, compact). The vault and the return work the same, and a returned JSON that
does not fit in memory is restored in passes, as JSON too. It weighs much more than a CSV because
every cell carries its key: 21,000,000 cells are about 316 MB. What changes compared with memory
(classification looks at the first 5,000 rows, utility is not measured) holds here too. The other
JSON limits still stop it, and say so; and lists are still not treated.

**What keeps its limit**

- **Excel keeps its 150 MB limit:** the browser's Excel reader cannot read in parts.
- **The restored file is not written straight to disk,** as explained above.

---

### 10. The GDPR policy

It is the **third built-in policy**, next to Habeas Data and HIPAA. In the workshop you pick it with
the **“RGPD · GDPR (UE)”** button. It rests on Regulation (EU) 2016/679: article 4 (what personal
data is and what pseudonymisation is), article 9 (special categories), article 10 (criminal
convictions and offences) and recital 26.

> **The central idea: Velo pseudonymizes, it does not anonymize.** Article 4(5) calls
> _pseudonymisation_ processing data so that it can no longer be attributed to a person without
> additional information, kept separately. Here that additional information is your key and your
> vault. And recital 26 says pseudonymised data that could be attributed to a person by using
> additional information should be considered information on an identifiable person. That is why
> **the file that comes out is still personal data for whoever holds the key and the vault**, and
> why the certificate says “Pseudonymised”, never “anonymous”.

Whether the file stops being personal data for someone else —a person with neither the key nor the
vault— depends on the means reasonably likely to be used to identify anyone, and on the context
(recital 26). That analysis belongs to whoever processes the data; a program that only sees a table
cannot do it, and Velo does not.

**What it does with each thing**

| What is in the column                                                               | What Velo does                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct identifiers** (art. 4(1)): names, email, payment card, documents           | A **pseudonym** under your key, **reversible with the vault**. If Velo recognizes the document, the pseudonym takes its country's format; if not, it is a hexadecimal pseudonym. |
| **Special categories** (art. 9) and **criminal convictions and offences** (art. 10) | They are **removed**: the column does not come out. A general policy cannot know whether there is a lawful basis (art. 9(2)) to process them.                                    |
| **Quasi-identifiers**: date of birth, postal code, sex, nationality, IP address     | **Generalized up to k = 5**. That 5 is Velo's choice, not the GDPR's —the regulation sets no k— and it can be changed.                                                           |
| Other dates, which do not identify anyone on their own                              | Trimmed to the **month**.                                                                                                                                                        |
| What is not personal                                                                | Left as it is.                                                                                                                                                                   |

With this policy it is the policy, not you, that marks what is reversible: every direct identifier
comes out reversible, and the vault step says so —“There are N reversible columns”—. If you do not
want the vault for one of them, you untick it column by column. What Velo cannot recognize from the contents
of a column —a diagnosis such as “J45.9”— it suspects, at most, from the header, with “unconfirmed”
certainty. And an organization's own code (medical record, member, contract) has no recognizable
shape: you mark that one yourself.

**The eight documents it recognizes by their algorithm.** Like the Colombian cédula and NIT, each is
checked with its official check digit or letter; spaces, dots, hyphens and letter case are
ignored:

| Document                   | What Velo checks                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **IBAN**                   | ISO 13616, with the mod 97-10 check                                                                              |
| **DNI** (Spain)            | The check letter: the number modulo 23 indexes a table of letters                                                |
| **NIE** (Spain)            | The same, with X, Y and Z standing for 0, 1 and 2; no other prefix is accepted                                   |
| **NIR** (France)           | The key: 97 minus the first 13 digits modulo 97 (with Corsica's 2A and 2B); sex 1 or 2 and a month from 01 to 12 |
| **Codice fiscale** (Italy) | The check character (odd- and even-position tables, modulo 26); a possible month letter and day                  |
| **Steuer-IdNr** (Germany)  | The check digit over the first 10 digits; no leading 0 and the repeated-digit structure the rule sets            |
| **BSN** (Netherlands)      | The 11-test; an 8-digit BSN is read with a leading zero; all zeros are refused                                   |
| **PESEL** (Poland)         | The check digit (weights 1-3-7-9) and that the birth date it carries exists                                      |

**“Confirmed by the algorithm”** means two things: the check adds up and the structure is possible
(a month that exists, a prefix the document allows). It does **not** mean the number exists or
belongs to anyone: an invented number can add up too. Velo marks them “Confirmed” in the diagnosis
table, with the document's name, its country and the source of its algorithm. For example,
`12345678Z` is an example DNI —the letter that goes with 12345678 is Z—; it serves to explain the
algorithm and belongs to nobody.

**What the pseudonyms of those documents look like**

- **They pass their country's official check.** A DNI pseudonym is a DNI with a letter that adds
  up; an NIR pseudonym, an NIR with its key. So a system that checks the format has no reason to
  refuse it.
- **It is never the original value.** If by chance the pseudonym came out equal to the original,
  Velo computes it again (it still depends only on the value and the key), and if it cannot get a
  different one it stops instead of handing the value back to you.
- **It keeps nothing of the original:** not the department, not the year, not the sex. Those fields
  are quasi-identifiers, and inheriting them would leave half the value in plain sight.
- **The IBAN is the partial exception:** it keeps the country, the length, which positions are
  digits and which are letters, and the grouping in fours if it came grouped. It passes the ISO 13616
  check and, for Spain and France, **recomputes the national keys inside it** (the Spanish CCC, the
  French RIB key); **other countries' keys are not recomputed**, so a destination that validates them
  may refuse it.
- **The numbers that come out are synthetic, but Velo does not check that they do not exist.** They
  pass their document's check and keep nothing of the original, but Velo cannot know which numbers
  are assigned to real people: a pseudonym can be, by chance, another person's real number, and in
  the documents with few possible values compared with the population (the DNI, the PESEL, the BSN,
  the Steuer-IdNr) that chance is not rare. Do not treat it as harmless.
- **They can repeat.** Velo draws each PESEL from about 250 million values and each Steuer-IdNr from about 150
  million; in a large file two different originals can receive the same pseudonym. The balance counts
  how many and does not hide it (except in a [high-volume](#9-huge-files-high-volume-mode) column
  that does not fit in its dictionary), and the return reports them as ambiguous
  ([section 6](#6-the-return-getting-back-what-you-handed-over)).
- **A cell that does not look like the format** still comes out in it: a column marked as IBAN
  holding free text gets a synthetic Spanish-shaped IBAN, because you asked for IBANs and Velo
  cannot invent a country from arbitrary text.

**Column names in other languages.** Velo also reads headers in German, French, Italian, Dutch,
Polish, Portuguese and English —names, addresses, date of birth, postal code, sex, nationality,
health, beliefs, convictions—, besides Spanish. It looks for **whole words**, not pieces of words,
and relies **on the header alone**: it is a suspicion, and the certainty stays “unconfirmed”, just
as with Spanish names.

**What the screen shows.** When you pick the policy you will see its warning —_“This is Velo's
reading of the text, applied to the columns Velo recognized. It is not a certification of
compliance…”_— and the list **“What it covers, article by article”**. Each line carries the article,
how Velo sees it (by the contents of the column, only by its name, or “Velo does not recognize
it”), the source —Regulation (EU) 2016/679 in the Official Journal of the EU, L 119, 4.5.2016— and
the date it was consulted: November 2, 2026. If you touch a rule, Velo says it is no longer the
built-in policy, and the certificate describes what was done, not the template.

**What the certificate says.** It opens with **“Pseudonymised (GDPR art. 4(5))”**: how many columns
became a pseudonym, that the file is still personal data for whoever holds the key and the vault,
what was generalized and what was removed. And it closes with its **“What Velo does NOT claim”**:
that it does not declare the file anonymous, that it does not run the recital 26 analysis and that
it does not certify compliance.

**What this policy does not do**

- **It does not run the “means reasonably likely” analysis** of recital 26, does not decide the
  lawful basis for processing (art. 6 and art. 9(2)), does not do a data protection impact
  assessment and **does not certify compliance**: no authority issues that certification, and the
  policy is Velo's reading of the text.
- **It does not validate other documents:** not those of other countries, not European phone
  numbers, not VAT numbers, not postal formats. What Velo does not recognize, you mark, as in the
  other policies.
- **Names in other languages** cover the common fields, from the header alone.
- **The k = 5 and the generalization ladders are Velo's,** not the regulation's.
- **Not every source was verified equally deeply.** The DNI and the NIE are validated with the
  modulo-23 algorithm, the one in universal use. But the page of Spain's Ministry of the Interior
  that describes the calculation could not be opened when it was checked: the algorithm was taken
  from the excerpts a search engine quotes from it and verified by hand. The other documents were
  reproduced with official examples, except the codice fiscale, whose decree carries none. The
  detail, document by document, is in ADR-016 (`decisions/016-rgpd.md`).

---

### 11. Velo on your machine: the console, databases and the API

**Velo local is the web app's engine, as a program on your computer.** It is not a service: there is
nobody on the other end. You run it, with Node 22, from the repository (`pnpm install` and then
`pnpm velo …`). It exists for what a browser tab cannot do: read a table straight from a database,
offer an API to another program of yours, and process files as large as your disk can hold. The
engine is the same: **the same file, with the same policy, the same passphrase and the same salt,
gives the same bytes** as the web app (a couple of automated tests compare them on every change, one
of them with a real Chromium).

**Your data does not leave your machine.** Velo local connects to nothing except the database you
configure, sends no telemetry and writes only where you tell it to. It overwrites nothing: if the
output file already exists, it refuses.

**The commands**

| Command                         | What it does                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm velo diagnosticar <file>` | The web app's diagnosis (CSV, JSON, JSON Lines). `--json` prints it as JSON.                   |
| `pnpm velo anonimizar <file>`   | Anonymizes with `--politica` (`habeas-data`, `hipaa`, `rgpd` or a file exported from the web). |
| `pnpm velo restaurar <file>`    | Restores a returned file with `--boveda`.                                                      |
| `pnpm velo puente …`            | The same, over a PostgreSQL or SQL Server table.                                               |
| `pnpm velo api`                 | Starts the local API.                                                                          |

`--salida` picks the folder, `--sal` fixes the key's salt (so tomorrow's pseudonyms match today's),
`--bitacora` records the treatment in your log and `--idioma es|en` sets the language of messages
and documents. What comes out is the anonymized file, **the certificate** and, if you asked for
reversible columns, **the vault**, with the same fingerprints as in the web app. A JSON goes in and
a JSON comes out; one too big for memory is processed [in passes](#9-huge-files-high-volume-mode),
just like in the web app.

**Passphrases and the connection never go in a command.** The key's passphrase comes from
`VELO_FRASE` or from the console, without echo; the vault's, from `VELO_FRASE_BOVEDA`; the log's,
from `VELO_FRASE_BITACORA`; the database connection, from `VELO_DB_URL` or from the console, without
echo. An argument would stay in your terminal's history. Neither the passphrase nor the connection
appears in an error message.

**The database bridge**

`pnpm velo puente --tabla schema.table --politica <…>` reads a table from **PostgreSQL** or **SQL
Server** (the engine comes from the connection: `postgres://` or `mssql://`) and writes the result
to a **new table, `<table>__velo`**. What it keeps to, and how it is checked:

- **The original table is not touched.** Velo computes the fingerprint of its contents before and
  after, and the result says they are the same. Everything happens in a single transaction; if
  anything fails, it is rolled back and nothing is left.
- **Without a primary key, Velo refuses.** Without one there is no stable row order and, without a
  stable order, it cannot promise the same bytes. It says so and does not process the table.
- **Table and column names only enter a query if they exist in the database,** and values always
  travel as parameters: a table name crafted on purpose does not run.
- **Empty and `NULL` are the same for Velo.** The new table stores empty as `NULL` and adds one
  column, `__velo_fila`, which numbers the rows so they can be restored.
- **It does not replace a table that already exists** unless you ask for it with `--reemplazar`.
- **The certificate, the vault and the log are written before the transaction commits:** if they
  cannot be written, the new table does not appear either.

To go back: `pnpm velo puente --restaurar --tabla schema.table__velo --boveda file.velo` writes
`<table>__restaurada`. With no database of your own to rehearse on, `pnpm kit:base` starts, on your
machine at `127.0.0.1:5433`, an embedded PostgreSQL with a synthetic table (`public.clientes`); it
closes with Ctrl-C. It installs nothing.

**The local API**

`pnpm velo api` listens **only on `127.0.0.1:3301`**. On start it shows, **once**, a fresh token to
send as `Authorization: Bearer …`; it dies with the process. It rejects whatever does not come from
your machine: no token (401), a `Host` that is not its own (421; so a web page that tricks the
browser cannot reach it) and an `Origin` header (403; there is no CORS: a browser cannot use it).
The body has a limit (413) and errors come with their key, never with a piece of your file. The key
is derived once at start: it never travels in a request.

| Route                   | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `GET /v1/salud`         | Answers whether it is alive, with the key's fingerprint.                             |
| `POST /v1/diagnosticar` | The body is the file; answers the diagnosis and the exact risk.                      |
| `POST /v1/anonimizar`   | Answers the file, the certificate and the sealed vault. It always measures the risk. |
| `POST /v1/restaurar`    | The body is the returned file; `X-Velo-Boveda` is the vault's path on your machine.  |

The `X-Velo-Nombre` header gives the file name, and its extension decides the format: `.csv`, or
`.json`, `.jsonl` or `.ndjson` for JSON. The full contract is in `docs/api/velo-local.yaml`.

**What Velo local does not do.** It does not talk to MySQL, Oracle or SQLite. It does not split an
Excel file into passes (it keeps its 150 MB limit). It does not replace the web app: for someone who
only wants to anonymize one file, the browser tab is still the simplest thing.

---

## What Velo does NOT claim

This section is as much a part of the product as the others.

- Velo **measures** re-identification risk; it does not remove it and it **does not declare any
  file anonymous**. The k-anonymity model can be attacked even without auxiliary information, and
  it degrades as columns are added.
- “We did not recognize personal data” is **not the same** as “this file is anonymous”. Velo
  detects what it knows how to detect: ID documents, contact details, locations and demographic
  attributes. An internal code of your organization, a medical-record number or a combination
  specific to your field can still point to a person without any public algorithm noticing.
- Type detection is done on a **sample of up to 5,000 values per column**, spread across the whole
  file (in a [high-volume](#9-huge-files-high-volume-mode) file, over its first 5,000 rows). The
  risk figures, in contrast, are calculated over the complete file.
- The crossing advisor evaluates a **bounded subset** of combinations and says so on screen. It is
  not the whole universe of possible crossings.
- **Cleaning the metadata of a PDF or an image does not make it anonymous.** Velo cleans what the file
  says about itself; the text on the pages and what can be seen in the image (a name, a face, a
  license plate, a sign) stay as they were, and can identify someone on their own.
- **A clean file can get dirty again.** A program that opens the clean copy and saves it again can
  write new metadata into it. The certificate speaks about the exact bytes Velo handed over —that is
  why it carries the fingerprint—, not about what happens to the file afterwards.
- **The list of fields is what Velo knows how to name,** and the check is done by the same reader
  that wrote it. The cleaning removes on top of that everything not on its allow list, but “no
  named fields” is not the same as “no metadata”, and Velo does not claim that no other tool, in no
  format that exists, will find anything.
- **In a PDF, Velo warns about annotations with an author, attached files, form fields and embedded
  JavaScript, but does not clean them:** the name of whoever commented (and any date the annotation
  carries) or what someone typed into a form is still in the clean copy. A signed PDF loses its signature when cleaned, and a
  password-protected one is not opened.
- **In a JSON, lists are not treated:** they go into the file as they are, even if they hold emails,
  phone numbers or ID numbers, and the policy does not reach them. Velo declares it on screen, with
  the path and the names of the fields it saw inside; treating them, or removing them, is up to
  you. And what comes out is a faithful rewrite, not a byte-for-byte copy: compact, one record per
  line.
- **The ε of local differential privacy is for ONE value of ONE field, not for the file.** It says
  how much someone who sees the file can learn about a single value of a column with noise. It does
  not cover the other columns; it does not cover repeated deliveries —each different file you hand
  over with the same data spends its own ε, and the ε add up—; and it **does not compose with k**:
  k is measured apart, over the file, and Velo does not add or average the two into one number. The
  ±% perturbation has no ε and no formal guarantee. And Velo does not say which ε is “enough”: that
  decision is yours and depends on what the file is for.
- **The optimal generalization's comparison is measured over the columns of the partition, not over
  the whole file.** The k, ℓ, risk and bits in the “The two roads, side by side” table speak only
  about the columns you marked “Generalize until k is reached”; other columns can split those
  groups, and the full balance arrives when you transform. “Optimal” is the best combination of the
  ladders you gave it, not the best generalization possible.
- **Pseudonymised is not anonymous.** With the GDPR policy, and with any reversible pseudonym, the
  file is still personal data for whoever holds the key and the vault (art. 4(5)). Velo does not
  run the “means reasonably likely” analysis of recital 26, does not decide the lawful basis for
  processing and **does not certify compliance**: the built-in policy is its reading of the text,
  applied to the columns it recognized, and the k = 5 is its own choice, not the regulation's. A
  document “confirmed” by its algorithm has a check that adds up and a possible structure; it does
  not mean the number exists or belongs to anyone. And for the DNI and the NIE, the Ministry of the
  Interior's official page could not be opened when the algorithm was verified
  ([section 10](#10-the-gdpr-policy), ADR-016).
- **In a high-volume file, not everything is measured.** The risk is still exact, but what the file
  lost is not measured, the crossing advisor combines only the quasi-identifiers and pseudonym
  collisions are not counted in the columns that do not fit in their dictionary. What does not fit within the limits is said, not estimated
  ([section 9](#9-huge-files-high-volume-mode)).

---

## Questions that always come up

**Does my data reach any server?**
No. And it is not a blind promise: an automated test intercepts _all_ of the browser's requests
during the complete flow with a file loaded, and fails if even one carries data. In addition, the
page itself forbids the browser from connecting to any site that is not its own.

**Why is everything lost when I reload?**
Because nothing was ever saved. It is the other side of the promise.

**Does Velo use artificial intelligence?**
No, and it is not a limitation: it is the design. Everything it does is deterministic — the same
file with the same policy and the same key always produces the same diagnosis **and the same output
file**, byte for byte, and that is why the result is auditable. An automated check keeps any
generative-AI library from entering the project, and another one runs the engine twice and compares
the bytes.

**I handed over a file last month. How do I get the same pseudonyms?**
With the **same passphrase and the same salt**. You keep the passphrase; Velo shows you the salt
when it derives the key. **It does not travel inside the exported policy**, but it does travel
inside the vault, encrypted along with everything else: whoever keeps the vault and remembers the
passphrase can derive the same key again. If you did not save a vault — because you marked no
column as undoable — copy the salt to your password manager next to the passphrase.

**Can I use Velo in English?**
Yes, all of it: the five screens, the key notices, the certificate, the return report and the
brochure. You switch with the **ES** / **EN** buttons in the header. The English is written, not
translated word for word, and says the same thing with the same caution: what is estimated is
marked as estimated in both languages.

**If I use Velo in English, does it recognize personal data from other countries?**
It depends on the country, not the language. The country-specific recognizers are the Colombian
ones —a cédula, NIT, mobile number or license plate— and the eight European documents of
[section 10](#10-the-gdpr-policy) (IBAN, Spain's DNI and NIE, France's NIR, Italy's codice fiscale,
Germany's Steuer-IdNr, the Netherlands' BSN and Poland's PESEL). All of them are detected the same
way on both screens, and so are the universal ones —email, payment card, IP address, coordinates,
dates—. A document from another country that is not on that list is not recognized, and you mark it
yourself. The language changes what you read, not what Velo can detect.

**Why does Velo say “pseudonymised” and not “anonymous”?**
Because they are different things, and the GDPR tells them apart. A pseudonym can be tied back to the
person with additional information —here, your key and your vault—, and as long as that road exists
the file is still personal data for whoever holds it (art. 4(5) and recital 26). Whether a file
stops being personal data for someone else depends on the means reasonably likely to be used to
identify the person, and that assessment belongs to whoever processes the data, with their own
context. Velo does not run it, so it does not declare any file anonymous. It is explained in
[section 10](#10-the-gdpr-policy).

**Why does my bank or my system refuse the pseudonymised IBAN?**
Because the IBAN that comes out passes the general check (ISO 13616, mod 97-10) and keeps the
country, the length and the grouping. For Spain and France, Velo also recomputes the national keys
inside it (the Spanish CCC, the French RIB key); for other countries it **does not**, and a
destination that validates them will refuse it. If that is your case, the pseudonym will not serve it: hand that column over another way (a hexadecimal
pseudonym, which does not pretend to be an IBAN, or without the column).

**I have a photo in HEIC or AVIF, from my phone. Can I clean it?**
Yes. Drop it in like any other image. Velo removes the EXIF (location, camera, dates, author), the
XMP and the descriptions someone wrote about the photo, and gives you back a HEIC or an AVIF: it does
not convert it to JPEG. It keeps the image, the color profile, the orientation, the thumbnail and the
auxiliary maps (depth or HDR boost); that is why, on an HDR screen, the photo may show less range,
and Velo warns you. A Live Photo is two files, the photo and its video (`.mov`): they are cleaned
separately, and the two clean ones no longer show up together in Photos. A burst or a `.mov` video
is cleaned too. If it has parts Velo cannot rewrite, it leaves the file alone and tells you what to
do: export it as a still image. The details are in
[section 8](#8-pdfs-and-images-cleaning-what-the-file-says-about-itself).

**In “Noise with a guarantee”, which ε do I choose?**
Velo does not decide for you and does not hand you a “safe” number, because there is none. A lower ε
gives more protection and more noise —the data comes out less useful—; a higher one gives less noise
and less protection. Which balance suits depends on what the file is for and who it is going to. And
remember what the ε is for: ONE value of ONE field, not the file, and every different delivery with
the same data spends its own. The options run from 0.1 to 8, and the screen always shows the ε that
came out, rounded up.

**I cleaned the metadata of a photo. Can I publish it now?**
The location, the camera, the author and the dates are gone, and Velo checked it by reading the copy
again. What can be seen in the photo did not change: a face, a license plate or a sign is still
there. Read [section 8](#8-pdfs-and-images-cleaning-what-the-file-says-about-itself) before you
decide.

**Does it work without internet?**
The first time you need to load the page. After that, the analysis happens entirely on your
computer. The downloaded report opens offline, always.

**What happens with a file of 500,000 rows?**
It works. It is measured: 500,000 rows × 24 columns (about 130 MB) are processed in a few seconds
without the tab freezing, because the heavy work happens on a separate thread.

**Why does my 5-million-row file take minutes?**
Because it goes past 20,000,000 cells and Velo reads it in passes instead of loading it whole: one
for the diagnosis, one to measure and one to write
([section 9](#9-huge-files-high-volume-mode)). On the file that was measured —5,000,000 rows × 24
columns, 1.36 GB, on the author's Mac— it took 109 s, 283 s and 267 s (about 11 minutes), and the tab
asked for up to 4.9 GB of memory. It is a reference, not a promise: it depends on your machine, and
it helps to close other tabs. In exchange, the risk is still exact and the file that comes out is
the same, byte for byte, as the one that would come out if it fit in memory.

---

## What comes next

**Nothing this manual described as future is still pending, except lowering the memory peak.** The
certificate, the log and the estimated risk —the three things promised here— are above, each with
its own section; the memory peak of high volume (4.9 GB at 5,000,000 rows) remains pending the
owner's decision, not discarded.

What Velo does **not** do today lives in “What Velo does NOT claim” and in the declared limits: it does
not read databases from the web (only [Velo local](#11-velo-on-your-machine-the-console-databases-and-the-api),
and only PostgreSQL and SQL Server), it does not generate `.xlsx` output, it does not treat the lists inside a JSON,
it does not clean the annotations, attachments or forms of a PDF, and it does not use —and will not
use— generative artificial intelligence anywhere in the product.
