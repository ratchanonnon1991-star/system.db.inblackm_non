# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

GameDB ("system.db.inblackm") — a Next.js 16 app that lets staff/admin build ad-hoc SQL query panels against PostgreSQL (multiple connections, including inblackm's own DB), with rich table UX (sorting, formulas, conditional coloring, grouping, cross-query merge, snapshots, cell-level editing) on top. It also hosts two separate sub-apps in the same repo/DB:

- `gameinfo` (`src/app/gameinfo/**`) — game info CMS pages.
- `projectm` (`src/app/projectm/**`) — a login skin + "itune" hub with its own admin data table, gated by a `projectmRole` independent from the GameDB role.

Full Thai-language feature documentation for the GameDB query panels lives in `README.md` — read it before touching panel/query/layout behavior, it documents exact semantics (formula language, coloring rules, template sharing precedence, cell-edit config, etc.) that aren't obvious from code alone. `projectm.md` has the (informal, partially in-progress) spec for the itune/admin page.

## Commands

```bash
npm run dev              # http://localhost:4183
npm run build
npm run start             # production, port 5589
npm run lint
npm test                  # node tests/run.mjs — runs every tests/*-tests.mjs suite
node --import ./tests/register.mjs tests/formula-tests.mjs   # run a single suite directly
npm run pm2:start / pm2:stop / pm2:restart / pm2:logs
```

`tests/run.mjs` spawns each `*-tests.mjs` suite in its own child process (via `tests/register.mjs`) so one suite's stubbed `pg` pool or module state can't leak into another. There is no test framework — suites are plain scripts that assert and print `N passed`; `tests/stubs/` holds fake `pg`/module stubs used to test server code without a real database. To debug one suite in isolation, run it directly with the `--import` flag shown above.

CI (`.github/workflows/deploy.yml`) runs lint → test → build on every push to `main`, then deploys via SSH + PM2 on the same job chain — treat lint/test/build passing locally as a prerequisite before pushing to `main`.

## Environment

Copy `.env.example` to `.env`. Key variables: `PG_HOST/PG_PORT/PG_DATABASE/PG_USER/PG_PASSWORD` (the primary Postgres, shared with the inblackm storefront — GameDB owns only the `gamedb_*` tables in it), `SESSION_SECRET` (signs the `gamedb_session` cookie — **hard-fails app boot in production if unset**, since the code fallback would let anyone forge an admin cookie), `GAMEDB_ENC_KEY` (encrypts saved DB connection passwords — never rotate, existing connections become undecryptable), `GAMEDB_ADMIN_USERNAME/PASSWORD` (seeds the first admin once, when `gamedb_users` is empty).

## Architecture

**Layers**: `src/app/**/route.js` (Next.js route handlers, thin) → `src/server/*.js` (repositories + business logic, talk to Postgres via `src/lib/db.js`) → `src/lib/*.js` (pure helpers: formula engine, identifier validation, formatting, SQL param binding). Client components live in `src/components/*.js`.

**Auth model** (`src/server/auth.js`, `src/lib/session.js`): GameDB has its own login, independent of inblackm — table `gamedb_users`, cookie `gamedb_session`, HMAC-signed (not JWT) via `signSessionToken`/`verifySessionToken`. Roles: `admin` (manage queries/connections/users, edit data), `staff`/`user` (run queries, manage own layout only). Role is re-read from the DB on every request (`requireAdmin`/`requireSuperAdmin`/`requireLayoutEditor`), so revoking access is immediate — never cache role off the cookie payload. `projectmRole` is a *separate* flag on the same user row, gating `/api/projectm/**` via `requireProjectmAdmin`; a GameDB "staff" account can independently hold projectm-admin.

**Multi-database connections**: The primary pool (`getPool()` in `src/lib/db.js`) hosts GameDB's own tables. Admins can register additional PostgreSQL connections (`gamedb_connections`), each gets a separate cached `Pool` via `getPoolForConnection()`, keyed by `id:updatedAt` so editing a connection transparently recycles its pool. Connection passwords are AES-256-GCM encrypted with `GAMEDB_ENC_KEY` before storage (`src/server/crypto.js`).

**Query execution safety** (`src/server/gamedb-query-runner.js`, `src/lib/gamedb-sql-params.js`): user-authored SQL is restricted to a single `SELECT`/`WITH` statement, keyword-filtered (checked outside string literals/comments), run inside a `READ ONLY` transaction with an 8s timeout and 1000-row cap. `:param` placeholders in SQL are parsed and bound as `$n` — never string-concatenated.

**Identifier safety** (`src/lib/gamedb-identifier.js`): everywhere a table/column name is assembled into SQL for *writes* (cell edits, row insert/delete — `src/server/gamedb-row-writer.js`, `gamedb-cell-writer.js`, `gamedb-insert-runner.js`), the name must come from saved admin config (never straight from a request) and passes through `isSafeIdentifier`/`quoteIdentifier`. The allowed character class is Unicode letters/marks/digits (not `[A-Za-z]`) because Thai column names are normal in this DB and Thai vowel/tone marks are combining characters — don't tighten this regex to ASCII.

**Layout/config storage**: all per-query UI config (columns, formulas, params, color rules, formatting, frozen columns, charts, refresh interval, edit-write config) lives in the `layout` JSONB column of `gamedb_queries` — deliberately, so the app never needs `ALTER TABLE` (the service DB user doesn't own the pre-existing tables). Service-owned tables (`gamedb_views`, `gamedb_user_layouts`, `gamedb_connection_flags`, `gamedb_snapshots`, `gamedb_edit_log`) were created by the app itself and don't need GRANTs; the original tables (`gamedb_users`, `gamedb_queries`, `gamedb_connections`) predate the app and need `GRANT`s documented in `README.md`. Personal layout overrides go in `gamedb_user_layouts` (visible only to their owner); admin "save for everyone" writes straight to `gamedb_queries.layout`. Display precedence: personal layout → screen template → query's own layout.

**Formula/value engine** (`src/lib/gamedb-formula.js`, `gamedb-values.js`): a small custom expression language (`+ - * / & = <> IF AND OR COALESCE TODAY() DAYSUNTIL ...`) evaluated per-row for computed columns; see `README.md` for the full function reference and date-parsing rules (`dd/mm/yyyy`, Buddhist-era years).

**Public sharing**: `/s/[token]` (`src/app/s/[token]/page.js`) and `/api/share/[token]/**` expose a read-only, token-scoped view of a query result without requiring login.

## Non-obvious constraints

- Never fall back to the in-code `DEV_SECRET` in production — `getSecret()` already throws if `SESSION_SECRET`/`OTP_SECRET` is missing and `NODE_ENV === "production"`; don't add a try/catch around it.
- Writes (cell edit, row insert, row delete) always re-read the target row with `SELECT ... FOR UPDATE` first and abort if it doesn't match exactly one row — preserve this pattern in any new write path.
- Data edits require both: the query has "อนุญาตให้แก้ไขข้อมูล" (edit) config AND the connection has "อนุญาตให้แก้ไขข้อมูล" enabled (off by default, including for the primary DB).
- Every successful edit/insert/delete is appended to `gamedb_edit_log` — keep this when adding new write paths.
- FK-lookup dropdowns (`src/server/gamedb-lookup.js`) only resolve table/column names from saved config, are admin-gated, and cap at 500 rows.
