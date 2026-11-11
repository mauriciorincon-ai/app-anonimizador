# ADR-017 — Velo local: the same engine as a process on the user's machine

- **Status:** accepted (owner's decision at the S9 G-Plan, 2026-11-07, «1 a»)
- **Date:** 2026-11-07
- **Sprint:** 009 (H-2, sprint 5)
- **Decides:** how the database bridge and the REST API, two features of the VISION roadmap, fit
  hard rule 2 («the user's data never leave the browser»), which they cannot meet as written; what
  changes in that rule, and what does not change in the web app.

## Context

The VISION roadmap asks for a **local bridge to databases** (PostgreSQL, SQL Server) and a **REST
API** for the user's pipelines. Both collide with hard rule 2 and with `connect-src 'self'`: a page
in a browser cannot open a TCP connection to a database, and an API is, by definition, something
other processes talk to. The constitution says that a feature that touches a hard rule is put to
the owner as a DECISION, with its ADR, before building. It was put at the S9 G-Plan.

Three shapes were possible:

1. **A hosted service** (Vercel functions, a server): the data would leave the user's machine.
   It contradicts the product's value proposition, not only rule 2. Rejected.
2. **The browser talking to a local helper** (the web page calls `http://127.0.0.1:…`): it would
   open `connect-src` and turn the page into a client of a local server, which is exactly what
   `tests/e2e/garantia-de-red.spec.ts` forbids. Rejected.
3. **A process on the user's machine** that runs the same engine without a page: a CLI and an API
   that listen only on loopback. The data still never leave the user's machine; they just do not
   pass through a browser. **Chosen.**

## Decision

1. **Hard rule 2 widens from «never leave the browser» to «never leave the user's machine».** In
   the web app it still means «never leave the browser», word for word and gate for gate: the CSP
   `connect-src 'self'`, the network veto over `src/`, the network e2e. None of them changes.
2. **`velo-local/` is a Node 22 process that imports `src/engine/`, `src/lib/` and the pass-based
   pipeline of `src/workers/alto-volumen.ts`, unchanged.** It is not a fork: it adds Node adapters
   for what the browser provides (`fs.openAsBlob` for `File`, a file opened with `wx` for
   `createWritable`). It picks the in-memory or the pass-based path of ADR-015 with the same rule as
   the web (the cell cap), so the same file takes the same road in both and the certificate matches
   too; the pass-based path is proven byte-equal to the in-memory one for the output. The restore
   is always by passes, which that proof allows. Two pieces that
   lived in the worker and in a component were moved into the engine so both sides call the same
   code: `resultadoDelAltoVolumen` (balance, preview, optimal generalization, noise report) and
   `privacidadDeLaEntrada` (the logbook entry).
3. **Network.** The API listens only on `127.0.0.1:3301`. Every request passes, before its body is
   read: a loopback socket, a `Host` equal to this loopback port (DNS rebinding), no `Origin` header
   and no CORS (a browser is never a client), the token of this start (32 random bytes, shown once,
   compared in constant time), and a body cap (413). The key is derived once at startup and never
   travels in a request. There is no Sentry and no telemetry. The only outgoing connection is to the
   database the user configures, and only from `velo-local/puente/`.
4. **Secrets are never arguments.** Passphrases come from `VELO_FRASE`, `VELO_FRASE_BOVEDA` and
   `VELO_FRASE_BITACORA`, the connection from `VELO_DB_URL`, or all of them from the console without
   echo. An argument stays in the shell history and in `ps`. Errors carry a key, never the raw text
   of an exception, which could carry a cell value or the connection string.
5. **The source table is never touched.** The bridge writes `<table>__velo` in one transaction and
   refuses if it exists (unless `--reemplazar`); its gate takes the fingerprint of the source table
   before and after.
6. **No fast mode.** `anonimizar`, by CLI or API, always measures the exact risk after the
   transformation and always returns the certificate with both fingerprints.
7. **Same bytes as the web app (rule 3).** Same file, policy, passphrase, salt and language give the
   same output byte for byte. The salt is accepted as `--sal` because it is not secret (the web app
   shows it on screen) and without it the same passphrase would derive another key. Gates:
   `tests/unit/determinismo-local.test.ts` (against the in-memory engine) and
   `tests/e2e/local-igual-navegador.spec.ts` (against Chromium).
   _Note (S13): the web app now also accepts a pasted salt, with the same validator
   (`SAL_VALIDA`, `normalizarSal` in `src/lib/llave.ts`), so both runtimes take the salt either way._

## Consequences

- Velo stops being only a tool for files: a data team can anonymize a table where it lives, and a
  pipeline can call Velo without a screen, with the same policies, key and certificate.
- Velo local is run from the repository (`pnpm velo`); publishing it as a package is H-4.
- `tests/unit/privacidad-local.test.ts` is the rule 2 gate for `velo-local/`: a code sweep, the five
  API refusals on a real server, and a full CLI run with `net.Socket.connect` spied (zero calls).
- If the web app ever needs to talk to Velo local, that is a new decision: it would change
  `connect-src`, and this ADR does not allow it.
