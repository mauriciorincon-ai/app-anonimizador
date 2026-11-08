# ADR-016 — GDPR: pseudonymised, not anonymous; national identifiers with their official check

- **Status:** accepted
- **Date:** 2026-11-02
- **Sprint:** 008 (H-2, sprint 4)
- **Decides:** what the GDPR factory policy does and what it refuses to say, which European
  identifiers Velo validates and how their pseudonyms keep their format, how column names in other
  languages are read, and which sources back every line and when they were consulted.

## Context

The VISION roadmap asks for a "GDPR policy". Three hard rules frame it. Rule 4 (honest
measurement): Velo reduces risk and measures it, it does not promise anonymity. Rule 3
(determinism, no FPE): a pseudonym is HMAC → digits → the official check recomputed, never a
reversible cipher of the format. And the validator pattern of the app: each validator cites the
official source of its algorithm, and a number with a wrong check, an impossible date or an
impossible structure must be refused.

The legal point decides the design. GDPR art. 4(5) defines pseudonymisation as processing personal
data so that it can no longer be attributed to a data subject without additional information,
provided that information is kept separately and protected. Recital 26 says pseudonymised data
"which could be attributed to a natural person by the use of additional information should be
considered to be information on an identifiable natural person", and that only information that
does not relate to an identifiable person, or data rendered anonymous so that the person is not or
no longer identifiable, is outside the principles of data protection — judged over "all the means
reasonably likely to be used". A program that only sees a table cannot make that judgement. So
Velo's GDPR output is **pseudonymised**, and the certificate says so.

## Decision

1. **The policy `rgpd`** (`src/engine/politicas-de-fabrica.ts`), the third factory policy:
   - Direct identifiers (art. 4(1)) → a pseudonym under the project key, **with the format of the
     country when a validator recognizes it** (`seudonimizar-con-formato`), otherwise a hexadecimal
     pseudonym; both **reversible with a vault**, which is the "additional information kept
     separately" of art. 4(5).
   - Special categories (art. 9) and criminal data (art. 10) → **removed**. A general policy cannot
     know whether there is a lawful basis (art. 9(2)) to process them.
   - Quasi-identifiers (date of birth, postal code, sex, nationality) → generalized up to k, even
     when they have a rule by type. **k = 5 is Velo's choice, not the GDPR's**: the regulation sets no
     k. It is editable, and the policy's warning says so.
   - Dates that are not personal by themselves are trimmed to the month, as in Habeas Data.
   - Every line of the coverage table carries its article, its source and the date it was consulted
     (`articulo`, `fuente`, `consultada`, optional fields, so the two older policies do not move).
     The screen lists them ("what it covers, article by article").
2. **The certificate** says **"Pseudonymised (GDPR art. 4(5))"** and that the file is still personal
   data for whoever holds the key and the vault, says what was generalized and removed, and says what
   Velo does NOT claim: it does not declare the file anonymous, it does not run the recital 26
   analysis, and it does not certify compliance. Four things never appear: "anonymous under the
   GDPR", "complies with the GDPR", "GDPR compliant" and their Spanish forms (`tests/unit/copy.test.ts`,
   with its self-test, sweeps `src/` and the manuals).
   - The sentence is also true after the CJEU judgment in C-413/23 P (below): it speaks of whoever
     _holds the key and the vault_, and it says nothing about a recipient who has neither. For that
     recipient the answer depends on the circumstances of the case, and the certificate leaves it to
     the controller.
3. **Seven validators** (`src/engine/validadores/europeos.ts`) join the IBAN that already existed.
   All are `algoritmo-oficial` and `identificador-directo`; separators (spaces, dots, hyphens) and
   case are ignored when validating; each cites its official source in a comment:

   | Validator      | Check                                                                        | Refused even if the check matches                                                |
   | -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
   | DNI            | number mod 23 → letter table                                                 | not 8 digits + letter; a letter outside the table                                |
   | NIE            | X, Y, Z = 0, 1, 2, then the DNI rule                                         | prefix other than X, Y, Z                                                        |
   | NIR (France)   | 97 − (first 13 digits mod 97); Corsica 2A = 19, 2B = 18                      | sex other than 1 or 2; month outside 01–12                                       |
   | Codice fiscale | odd/even position tables, mod 26 → letter                                    | month letter outside `ABCDEHLMPRST`; day outside 01–31 / 41–71; omocodia handled |
   | Steuer-IdNr    | ISO 7064 MOD 11,10                                                           | leading 0; not exactly one repeated digit; three in a row; no digit missing      |
   | BSN            | the 11-test (9a + 8b + … + 2h − 1i); 8 digits read with a leading zero (S10) | all zeros                                                                        |
   | PESEL          | weights 1-3-7-9, mod 10                                                      | a birth date that does not exist (century coded in the month)                    |

   How far each one was verified differs, and each validator's comment says it. See "Algorithm
   sources" below.

4. **Format-preserving pseudonyms** (`src/engine/tecnicas/formato-europeo.ts`): HMAC → symbols →
   the check digit or letter **recomputed with the same function the validator uses**, so a
   pseudonym passes the official check of its country (tested in 1 000 inputs per format).
   - **Everything is synthesized, nothing is inherited**, except what an IBAN needs to stay of its
     country: its country code, its length and the class (digit or letter) of each position, and its
     grouping in fours if it came grouped. The DNI, NIR, codice fiscale… that come out keep nothing
     of the original — not the department, the year or the sex — because those fields are
     quasi-identifiers. The numbers are synthetic: they pass the check, but **Velo does not verify
     that they do not exist**. A pseudonym can be another person's real number, and where the
     space is small next to the population (DNI, PESEL, BSN, Steuer-IdNr) that is not rare. The
     manual and the certificate say so (audit finding A1).
   - **The national keys inside a BBAN are not recomputed**: an IBAN pseudonym passes ISO 13616
     (mod 97-10), not the internal check digits some countries add (the Spanish CCC, the French RIB
     key). A destination that validates those would refuse it. The certificate and the manual say so.
   - **Never equal to the input.** A pseudonym equal to its input would be a leak dressed as a
     pseudonym. The chance per value is about 10⁻⁸, but "almost never" is not a guarantee: if the
     candidate equals the input (ignoring separators and case) it is drawn again with the next
     attempt _of the same value_, so it still depends only on the value and the key, never on what
     else is in the file (the reason ADR from S1 gives for not re-hashing on collisions). After eight
     attempts it fails loudly instead of handing the data back. The guard is exercised by a test
     that forces the first candidate to equal the input (`tests/unit/seudonimo-europeo-igual.test.ts`);
     removing the guard makes its four tests fall.
   - **Symbols:** 32 bits of the HMAC per symbol, modulo the number of options (bias below 10⁻⁸). A
     format needing more than 8 symbols (an IBAN, a codice fiscale) takes more HMAC blocks, each the
     HMAC of the value with a counter. No FPE (hard rule 3).
   - **Collisions are counted, not hidden** (same rule as the NIT): a PESEL has ~2.5×10⁸ values, a
     Steuer-IdNr ~1.5×10⁸, so a large file can repeat a pseudonym; the report says how many.
   - **A value that does not look like the format** still comes out in format: an IBAN column with a
     free-text value gets a synthetic Spanish-shaped IBAN, because the user asked for IBANs and a
     country cannot be invented from arbitrary text.
5. **The list of formats is one constant** (`FORMATOS_DE_SEUDONIMO`, `politica.ts`): the policy
   schema, the pseudonym engine and the editor's drop-down all come from it. Before, the editor
   spelled the two Colombian formats by hand in four places.
6. **Column names in other languages** (`src/engine/nombres-multilingues.ts`): German, French,
   Italian, Dutch, Polish, Portuguese and English, for the common personal fields (names, address,
   date of birth, postal code, sex, nationality, health, beliefs, convictions). **Whole words only**
   — the name is split into words, accents are stripped, and a word (or a sequence of up to three)
   must match; `steps`, `stage`, `cap` and `sexton` are not flagged. The Spanish rules run first and
   are unchanged. As with them, this is a suspicion from the header, never a confirmation: the
   certainty stays "unconfirmed".
7. **Fixtures:** the kit gets the profile `europeo` with synthetic numbers whose check is computed in
   the generator (not by the code under test) and, on request, deliberately wrong ones.

## What this does not do, and says

- It does not run the recital 26 analysis, does not decide a lawful basis (art. 6, art. 9(2)),
  does not do a data protection impact assessment, and does not certify anything.
- Other national identifiers, European phone numbers, VAT numbers and postal formats are not
  validated. A column Velo does not recognize is the user's to mark, as in the other policies.
- The multilingual rules cover the common fields only, and only from the header.
- The quasi-identifier k and the generalization ladders are Velo's, not the GDPR's.

## Sources

Consulted on **2026-11-02** by a read-only agent, on the source named. The agent could not open the
EUR-Lex pages (they returned an empty page to the fetch tool); it read the same acts from the
Publications Office of the EU, from which EUR-Lex is served. The product therefore cites the
**Official Journal**, which it did read, and not EUR-Lex. The five quotations were transcribed in
fragments and should be compared by eye with the Official Journal page before being treated as
frozen.

| Source                                                                                          | Taken                                                                                                                                                                                                                                                                                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regulation (EU) 2016/679, OJ L 119, 4.5.2016 — art. 4(1)                                        | personal data, identifiable person, "identifier such as a name, an identification number, location data, an online identifier"                                                                                                                                                                                                                                                          | Publications Office copy, ES and EN                                                                                                                                                                                                                                                                                                                                                               |
| Same — art. 4(5)                                                                                | pseudonymisation, additional information "kept separately"                                                                                                                                                                                                                                                                                                                              | same                                                                                                                                                                                                                                                                                                                                                                                              |
| Same — art. 9(1)                                                                                | the eight special categories                                                                                                                                                                                                                                                                                                                                                            | The Spanish text of the original OJ had a typo ("las orientación sexuales"); Corrigendum OJ L 127, 23.5.2018 fixes it ("la orientación sexual") and does not touch arts. 4, 10 or recital 26. The 2021 corrigendum (OJ L 74, 4.3.2021) could not be opened; from a search snippet it seems to touch only art. 9(2)(b) — that it leaves arts. 4, 9(1), 10 and recital 26 alone is **not verified** |
| Same — art. 10, first sentence                                                                  | criminal convictions and offences "only under the control of official authority" or authorised by law with safeguards                                                                                                                                                                                                                                                                   | same                                                                                                                                                                                                                                                                                                                                                                                              |
| Same — recital 26                                                                               | pseudonymised data is information on an identifiable person; the "means reasonably likely to be used" test; anonymous information                                                                                                                                                                                                                                                       | same                                                                                                                                                                                                                                                                                                                                                                                              |
| EDPB, _Guidelines 01/2025 on Pseudonymisation_, adopted 16 January 2025                         | pseudonymised data that could be attributed with additional information is personal data, **even if the pseudonymised data and the additional information are not in the same hands**; deleting the additional information does not by itself make data anonymous                                                                                                                       | **Version for public consultation** (every page footer says so). The EDPB page lists the consultation as 17 January to 14 March 2025 while its press release says 28 February: the two official sources disagree. A final version was **not found** (not "does not exist"). Cited here, not in the product text                                                                                   |
| CJEU, judgment of 4 September 2025, _EDPS v SRB_, C-413/23 P (First Chamber), CELEX 62023CJ0413 | pseudonymised data is not personal data "in every case and for every person" (para. 86); for the controller who holds the additional information it stays personal (para. 76); for a recipient it depends on whether it can reasonably attribute the data, for example by cross-referencing (paras. 77, 85); the General Court's judgment is set aside and the case returned (T-557/20) | The **ECLI is not verified** and is not cited. The text read stops at paragraph 101. It interprets Regulation (EU) 2018/1725, not the GDPR directly                                                                                                                                                                                                                                               |

### Algorithm sources

Consulted on **2026-11-02** by a read-only agent, then reproduced by the official examples in
`tests/unit/validadores-europeos.test.ts` (all pass, and a deliberately wrong modulus or Corsica
rule makes them fall). Three grades of verification:

| Identifier         | Source and what it gave                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Official examples                                                                                                   | Not verified                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NIR**            | INSEE, _Identifiant d'individus : NIR_ (the `nir.xsd` v2.0 page, no date on it): layout, sex 1/2, month 01–12, `2A`/`2B`, key = complement to 97                                                                                                                                                                                                                                                                                                                                                                  | `1510246102043` key 25; `278112B050002` key 86                                                                      | key range 01–97 (inference); sex 3, 4, 7, 8 and months 20, 30–42, 50–99 are mentioned without a list                                                                                                                                                                  |
| **Steuer-IdNr**    | Bayerisches Landesamt für Steuern / ELSTER, _Prüfung der Steuer- und Steueridentifikationsnummer…_ (Stand 02.09.2026), ch. 2.2; StIdV § 1; AO § 139a                                                                                                                                                                                                                                                                                                                                                              | `86095742719`, `47036892816`, `65929970489`, `57549285017`, `25768131411` (illustration only); TestID `02476291358` | **§ 139b AO and the BZSt page were not opened**; "ISO 7064 MOD 11,10" is Velo's name for the procedure; "never directly consecutive" is ambiguous (the official `65929970489` has two adjacent 9s), read as "not all three in a row"                                  |
| **BSN**            | RvIG, _Logisch ontwerp BRPk_ (2024.Q1); _Richtsnoeren Identificatie en verificatie van persoonsgegevens_ (BWBR0033181); RvIG UC 27                                                                                                                                                                                                                                                                                                                                                                                | `123456782` (sum 154 = 11 × 14)                                                                                     | a second official example; rijksoverheid.nl and the Belastingdienst were not opened                                                                                                                                                                                   |
| **PESEL**          | gov.pl, _Czym jest numer PESEL_ (updated 18.03.2026); Interior Ministry regulation of 4.01.2012, § 7; Ministerstwo Cyfryzacji                                                                                                                                                                                                                                                                                                                                                                                     | `02070803628`; partial templates `810203PPP6K`, `142112PPPPK`                                                       | whether the 2012 regulation is still in force in 2026; the article of the act; that the day must exist is Velo's logical consequence                                                                                                                                  |
| **Codice fiscale** | DM of 23 December 1976 (Allegati), read in the Gazzetta Ufficiale web reproduction; Agenzia delle Entrate FAQ and hearing of 10.2.2016                                                                                                                                                                                                                                                                                                                                                                            | **none**: the decree has no example and no blog example is used                                                     | digitization errata (the omocodia table prints "4 = O", the convention is "Q"; a lowercase "r" where the even-position value 19 / "T" goes) — the Q is corroborated only by secondary sources; whether omocodia accepts any subset of the 7 digits (Velo accepts any) |
| **DNI / NIE**      | **Official page not opened** (Ministry of the Interior, _Cálculo del dígito de control del NIF/NIE_: HTTP 403 to the checker, in every variant). The algorithm (number mod 23 into `TRWAGMYFPDXBNJZSQVHLCKE`; X, Y, Z = 0, 1, 2) comes from the excerpts a search engine quotes from that page, and was checked by hand: 12345678 = 23 × 536768 + 14, index 14 is "Z". AEAT (_Composición del NIF_, 10.9.2026), Royal Decree 1065/2007 arts. 19–20 and Order INT/2058/2008 confirm the format and give no formula | `12345678Z` (from the excerpts)                                                                                     | **the Ministry page itself.** To close it: open that page from a client that does not get a 403                                                                                                                                                                       |

The DNI/NIE gap is the one to look at first: the algorithm is the universally used one and agrees with
every excerpt, but the line "if Velo marks it, the official algorithm confirms it" rests there on a
page nobody on this side opened.

## Consequences

- `Politica.origen` gains `rgpd` and `rgpd-editada`; `version` stays 1 (additive). A policy exported
  with Velo S8 will not import in an older Velo.
- `TipoDetectado` gains seven ids; the diagnosis labels them with the name of the document and its
  country, and cites the source of its check.
- The vault is offered by default in this policy (all direct identifiers are reversible). The user
  can untick it column by column.
- In high volume (ADR-015) the pseudonyms go through the same `transformarDiccionario`, so the
  output is the same bytes.
