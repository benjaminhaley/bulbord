# Labs

Labs are small, independent experiments that happen to live in the Bulbord
repo and deploy with it. Each one is as close to a separate app as is
reasonable: it shares as little as possible with Bulbord and with other labs,
and **nothing a lab does should ever be able to affect Bulbord**. (Ben,
2026-10-26/27: "strongly sandboxed", "independent experiments with minimal
sharing".)

Members reach them only through Account → Labs (`web/src/labs/LabsPage.tsx`, a
list of plain links).

## What a lab is made of

A lab called `<name>` has at most these parts, and nothing else:

| Part | Where | Notes |
|---|---|---|
| Docs | `labs/<name>/README.md` | Everything about the lab: what it does, its API, its data, its history. Bulbord's CLAUDE.md doesn't describe labs. |
| Page | `web/public/labs/<name>/` | Plain HTML/JS/CSS, no build step. Served at `/labs/<name>/`. |
| Server code (optional) | `api/src/labs/<name>/` | Exports one `Lab` object. Mounted at `/labs/<name>/…` on the API. |
| Data (optional) | Postgres schema `lab_<name>` | Reached only through the lab's own database login. |
| Link | One row in `web/src/labs/LabsPage.tsx` | |
| Registration | One entry in `LABS` in `api/src/labs/sandbox.ts` | Only for a lab with server code. |

## The rules

`scripts/check-lab-isolation.mjs` enforces the first three in CI and in the
pre-push hook. The database rule is set up by the sandbox and tested by
`api/src/labs/sandbox.test.ts`.

1. **A lab's server code imports nothing from Bulbord.** Its own folder, npm
   packages, and `import type { Lab, LabContext } from '../sandbox.js'` only.
   Everything it gets from Bulbord comes through `LabContext`:
   - `memberId(request)`: the signed-in, approved member's id, or null;
   - `databaseUrl()`: a login for its own schema (if it declares
     `database: true`);
   - `schema`: that schema's name.
   Need something else from Bulbord? Add it to `LabContext` deliberately; don't
   import it.
2. **Bulbord imports nothing from a lab.** Only `api/src/app.ts` touches labs,
   via the one `registerLabs(app)` line.
3. **A lab page loads files only from its own folder** (or full `https://`
   URLs). Never `/assets/…` from the app, never another lab's files, and
   `web/src` never imports from `web/public`. Plain `<a href="/">` links back
   to the app are fine. The one thing a page may read from Bulbord is the
   sign-in token in `localStorage['bulbord_session_token']`, which it sends to
   its own API routes. The page picks the API base by hostname: localhost →
   `http://localhost:3001` (or `localStorage.labsApiPort`), otherwise the
   production API URL.
4. **Its data is walled off.** `sandbox.ts` gives each database lab its own
   Postgres login, `lab_<name>`, that owns the schema `lab_<name>` and can do
   nothing else. It can't read or write Bulbord's tables or any other lab's.
   The password is derived from `SESSION_SECRET`, so there's nothing to set up
   per lab: the login and schema are created on the lab's first database use,
   locally, in CI and in production. The lab creates its own tables with
   idempotent `CREATE TABLE IF NOT EXISTS` in its own code. Its tables are
   outside Bulbord's Drizzle migration chain (this overrides CLAUDE.md's
   "schema changes go through migrations" rule, for `lab_*` schemas only). No
   foreign keys to Bulbord tables: store a member id as a plain uuid. A lab
   keeps its own history (e.g. soft-deleted rows) and never writes to
   `events_log`.
5. **A broken lab stays broken alone.** The API mounts each lab in its own
   Fastify scope (its hooks can't reach app routes); a lab that throws while
   loading is logged and skipped, and the app boots anyway. A lab sets up its
   database connection on first request, not at boot, and uses its own small
   pool (max 2) so it can't starve the app's.

## What's still shared, on purpose

Labs run inside the same API process and share its deploy pipeline and CI.
A lab that crashes the whole process (an infinite loop, runaway memory) would
still take Bulbord down with it, and a lab that fails typecheck or tests
blocks Bulbord's deploys. That's acceptable for small, simple labs. A lab
that does heavier or riskier work (scraping, AI calls, background jobs)
should become its own Railway service instead.

## Starting a lab

1. `labs/<name>/README.md`.
2. `web/public/labs/<name>/index.html`, plus a row in `LabsPage.tsx`.
3. If it needs a server: `api/src/labs/<name>/lab.ts` exporting
   `export const <name>: Lab = { name: '<name>', database: true, plugin }`,
   and add it to `LABS` in `sandbox.ts`.

## Removing a lab

Delete its three folders, its `LABS` entry and its `LabsPage` row. If it had
data: `DROP SCHEMA lab_<name> CASCADE; DROP ROLE lab_<name>;`.

## Current labs

- [Soccer Math](soccer-math/README.md): times-tables game, no server.
- [Tracker](tracker/README.md): "when's the next one?" and project logs, members only.
