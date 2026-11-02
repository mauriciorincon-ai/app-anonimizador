# User manual — Velo

> _Veil it to hand it over. Unveil it to get it back._
> Updated in Sprint 005 · November 1, 2026
>
> Spanish version: [MANUAL-DE-USO.md](MANUAL-DE-USO.md)

Velo is the **customs checkpoint for your data**: what looks over your table before it goes out to
an AI, a cloud tool or a third party's computer. This manual covers everything Velo can do today.

---

## First things first, because it changes how you will use it

**Your file is not uploaded anywhere.** Velo has no server. When you drop in a table, it opens
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
recognizers are still the Colombian ones —cédula, NIT, mobile number, license plate, and Law 1581
as the framework— because English is the language of the interface, not of detection; and the
vault and the log are the same file whatever language you saved them in. A log entry keeps the date
exactly as it was written when you logged it. What Velo writes **inside the treated file** does follow the language you were using when you
asked for the transformation: the two words it uses when it generalizes (the " a " between the two
ends of a range and the " (o vacío)" of a group with empty cells) come out as " to " and " (or
empty)" if you were in English, and the certificate records it as the "Language of the job". The
same file, policy, key and language give the same bytes; with another language only those two words
change. The names of the files it saves (`velo-anonimizado-…`, `velo-boveda-…`,
`velo-politica.json`) do not change. The certificate and the return report follow the language you
were using when you downloaded them.

To put it precisely, because the difference matters: **a pseudonym on its own is still
irreversible**. Whoever receives the treated file cannot undo it —that is what makes it safe to
hand over—. What undoes it is the vault, a separate encrypted file that only you have and that only
opens with your passphrase. If you did not mark any column as reversible when you transformed,
there is no vault and no way back: that is decided beforehand, not afterwards.

---

## How to use it

### 1. Bring your table

On the main screen you can **drag** the file onto the box or **choose** it with the button (which
works from the keyboard: reach it with the Tab key and open it with Enter).

Velo reads:

| Format                      | Limit      | Why                                                                                                                                        |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **CSV** (`.csv`)            | no limit   | It is read in parts; it never exists whole in memory.                                                                                      |
| **Excel** (`.xlsx`, `.xls`) | **150 MB** | An Excel file has to be opened whole to be read. Above that size the browser runs out of memory, so Velo rejects it **before** opening it. |

If your Excel file is over 150 MB: open it and save it as CSV. From 40 MB, Velo warns you that it
will take a while and offers the same way out.

While it works you will see where it is: **taking the file's fingerprint**, **reading the file**,
**recognizing what is in each column** and **measuring the re-identification risk**. The bar only
appears when there is something real to measure; in the stages that have no fraction to show, Velo
tells you the stage and does not draw a fake bar.

### 2. Read the diagnosis

The diagnosis screen has three parts.

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

| Level            | What it means                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirmed**    | An official check digit exists, and Velo recomputed it and it matches. This is the case for the NIT (the DIAN's mod 11), payment cards (Luhn) and the IBAN.                      |
| **By its shape** | There is no public checksum for this data type, so only its shape could be checked. This is the case for the Colombian cédula: the Registraduría does not publish a check digit. |
| **Unconfirmed**  | The conclusion rests on the **column name**, not on the values. No calculation can look at “J45.9” and state that it is a health diagnosis; only the header suggests it.         |

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
uploaded.

#### The policy: what happens to each column

One row per column, with a dropdown. You can choose column by column or start from a **built-in
policy**:

- **Habeas Data (Colombia)** — Colombia's Law 1581 of 2012 and Decree 1377 of 2013, with the
  techniques from the AGN + SIC anonymization guide. It declares a minimum-group target (k = 5).
- **HIPAA · Safe Harbor** — the 18 identifiers of 45 CFR §164.514(b)(2). Note: Safe Harbor requires
  **removing**, not pseudonymizing, because §164.514(c) rules out a code derived from the
  information.

Both say, right there, how many of their points Velo recognizes from the contents of the column,
how many only from the name, and **how many you have to mark yourself**. Neither is a
certification.

As soon as you touch a rule in a built-in policy, Velo says so: _“It's no longer Habeas Data”_. The
official guidance does not back a decision it did not make.

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
| Pseudonym collisions                   | Preserving the format (cédula, NIT) shrinks the available space and two different values can collide.                                         |

#### The file

**Prepare the file** writes it, and **Save** downloads it. It comes out as
`velo-anonimizado-<8 characters>.csv` and does not repeat the original's name on purpose: a name
like `pacientes-2026.csv` tells what the contents are about before anyone opens it, and that name
travels in the subject line of an email.

Those eight characters **are not a serial number**: they are the start of the SHA-256 of the policy
you applied. Two files that share them received exactly the same treatment — and the certificate
carries the full hash, so you can verify it.

It is a comma-separated CSV, with a `\n` line break and **no BOM**. If Excel on Windows asks you
about the encoding, it is **UTF-8**. (Velo does not generate `.xlsx`: an `.xlsx` is a zip and its
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

---

### 5. The vault: so you can undo it

A pseudonym, on its own, **does not come back**: it is an HMAC, not encryption, and no algorithm
reverses it. The way back is given by a table that says which pseudonym came from which value — and
that is the **vault**.

**How you ask for it.** In step 1, under the technique of each column that is a pseudonym, the box
**“Make it undoable with a vault”** appears. Tick it on the columns you want to be able to recover.
Only pseudonyms accept it, and that is not a limitation of this version: masking (`103***89`) and
generalizing (`30-39`) **destroy** information, so there is no table that can undo it — the missing
digits no longer exist anywhere. The screen tells you which ones will not come back.

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
2. **Load the returned file.** It can come back with the rows in a different order, with new columns
   from the third party, without the ones they deleted and with values corrected by hand: none of
   that gets in the way.
3. **Read the notice before you confirm.** If the vault has ambiguous pseudonyms, Velo tells you how
   many **before** you press, not after.
4. **Restore the original values** and take the restored file and its report with you.

**Why it survives the third party working on it.** Restoring is **by value, never by position**:
Velo looks up each value in its column's mapping. And it recognizes columns by their **content**,
not by their name — if the third party renamed `cedula` to `ID_PACIENTE`, it is still recognized.

**The four things that can happen to a cell**, and Velo counts all of them:

|                                | What happened                                         | What comes out in the file |
| ------------------------------ | ----------------------------------------------------- | -------------------------- |
| **Restored**                   | its pseudonym was in the vault with a single original | the original value         |
| **Ambiguous**                  | its pseudonym matches **two** originals               | **the pseudonym, intact**  |
| **Changed by the third party** | the value is not in the vault                         | exactly as they left it    |
| **Out of scope**               | its column was not in the vault                       | the whole column, intact   |

> **About the ambiguous ones.** A format-preserving pseudonym —cédula, NIT— has to fit into many
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
after.

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
  file. The risk figures, in contrast, are calculated over the complete file.
- The crossing advisor evaluates a **bounded subset** of combinations and says so on screen. It is
  not the whole universe of possible crossings.

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
No more than before. The country-specific recognizers are still the Colombian ones: a Colombian
cédula, NIT, mobile number or license plate is detected the same way on both screens, and another
country's social security number is not. The universal ones —email, payment card, IBAN, IP address,
coordinates, dates— work the same in both languages. The language changes what you read, not what
Velo can detect.

**Does it work without internet?**
The first time you need to load the page. After that, the analysis happens entirely on your
computer. The downloaded report opens offline, always.

**What happens with a file of 500,000 rows?**
It works. It is measured: 500,000 rows × 24 columns (about 130 MB) are processed in a few seconds
without the tab freezing, because the heavy work happens on a separate thread.

---

## What comes next

**Nothing this manual described as future is still pending.** The certificate, the log and the
estimated risk —the three things promised here— are above, each with its own section.

What Velo does **not** do, and is not planned for the short term, lives in “What Velo does NOT
claim” and in the declared limits: it does not read databases, JSON or PDF, it does not generate
`.xlsx` output, and it does not use —and will not use— generative artificial intelligence anywhere
in the product.
