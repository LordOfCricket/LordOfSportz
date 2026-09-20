# Database & Data Access Architecture

## PostgreSQL

PostgreSQL is the only database LOC uses. There is no MongoDB on the live request path — see
`docs/ARCHITECTURE.md`'s note on the (fully migrated) canteen/gallery/AI-insight tables, and the "Mongoose"
section below for what remains and why.

LOC already runs a real, active **multi-ground architecture**. `grounds`, `ground_users` (ground-scoped
membership/roles), and `ground_id` foreign keys on `matches`, `canteens`, `ground_photos`, and `amenities`
have existed and been in use since Phases 8–12/21. `docs/ARCHITECTURE.md` §18.1 previously stated LOC was
"deliberately single-ground with zero `ground_id` columns anywhere" — that sentence was accurate only at
the point Phase 18 was written and is now factually wrong; it has been corrected in place. Any future
schema/data-access work should treat the actual schema as ground truth, not that historical paragraph.

The authoritative schema definition remains **`server/src/config/schema.sql`** — one hand-maintained,
idempotent SQL file (every statement is `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`), applied via
`npm run db:migrate`. This does not change in Phase 2A. Prisma is introduced *alongside* it, not instead
of it.

## Prisma (introduced Phase 2A)

- **Version**: `prisma`/`@prisma/client` pinned at `6.19.3` (not the newly-released `7.x` — Prisma 7
  replaced the classic `datasource { url = env(...) }` connection model with a driver-adapter +
  `prisma.config.ts` setup, which is a materially bigger architectural commitment than this phase calls
  for; 6.19.3 is the latest release on the conventional, well-documented connection model this project
  uses).
- **Schema file**: `server/prisma/schema.prisma` — produced by `prisma db pull` (introspection) against
  the live, already-populated database. It is a *representation* of `schema.sql`, not a hand-authored
  redesign. 48 tables, all foreign keys/indexes/unique constraints captured correctly. PostgreSQL `CHECK`
  and the one `EXCLUDE` constraint (`ground_bookings_no_overlap`, the booking-overlap guard) are not
  understood by Prisma Client's own validation layer — Prisma flags this with a comment on each affected
  model, but **the constraints themselves remain fully defined and enforced at the database level**;
  nothing about them changed.
- **Client**: `server/src/config/prisma.js` exports a single shared `prisma` instance (same singleton
  pattern as the existing `pool` in `config/db.js`) — never instantiate `PrismaClient` per request.
- **Connection**: `DATABASE_URL` env var (see `.env.example`), additive alongside the existing discrete
  `PG_USER`/`PG_HOST`/`PG_DATABASE`/`PG_PASSWORD`/`PG_PORT` vars, which the raw `pg` Pool keeps using
  unchanged.
- **Boot behavior**: `server.js` calls `connectPrisma()` right after the existing `connectPostgres()`
  check, but a Prisma-specific connectivity failure only logs a warning and continues — it is **not**
  fatal, because no live request path depends on Prisma yet. `connectPostgres()` remains the one hard
  boot dependency, unchanged.

## Migration strategy: introspection-first, not schema-first

Because the database already existed and already held real production data, adopting Prisma followed the
**baseline-an-existing-database** workflow, not a from-scratch `prisma migrate dev`:

1. `prisma db pull` — read-only introspection of the live schema into `schema.prisma`. No DDL executed.
2. `prisma generate` — generates the Prisma Client from that schema. No DB access at all.
3. `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` — produces
   `prisma/migrations/0_init/migration.sql`, the SQL that *would* create the current schema from nothing.
   This file is written for documentation/history purposes only; it was never executed.
4. `prisma migrate resolve --applied 0_init` — tells Prisma's own migration-history table
   (`_prisma_migrations`, created by this step) that migration `0_init` is already reflected in the
   database, without running any of its SQL. This is Prisma's officially documented procedure for
   adopting migrations against an existing database.

Verified before and after every step: identical row counts across `users`, `grounds`, `teams`, `players`,
`matches`, `ground_users`, `umpire_requests`, and others — nothing was created, dropped, or modified.

**Going forward**, any *new* table/column introduced by a later phase should go through a normal
`prisma migrate dev` (locally) → committed migration file → `prisma migrate deploy` (in each real
environment) cycle. `prisma migrate deploy` is explicitly a controlled, manually-triggered step — it is
**not** wired into any container `CMD`, Kubernetes startup probe, or `npm start`. Never run
`prisma migrate reset` or `prisma db push --force-reset` against an environment holding real data.

## Repository layer

`server/src/repositories/prisma/` holds the first Prisma-backed repository functions
(`ground.prisma-repository.js`, `staffRole.prisma-repository.js`) — read-only mirrors of the equivalent
functions already in `server/src/models/ground.model.js` and `server/src/models/staffRole.model.js`.

**Deliberately not yet wired into any controller/service.** Each function's output was directly compared
against its raw-SQL equivalent against the real database and confirmed identical field-for-field. The
existing `models/`/`repositories/` raw-SQL files remain the live data-access path for every route,
including all authentication endpoints — Phase 2A changes zero request-time behavior. Adopting one of
these Prisma repositories in a live route is a deliberate, separately-reviewed step for a later phase, not
something this foundation does on its own.

Naming note: the existing codebase already has a `server/src/repositories/` folder used for the
scoring/booking/tournament domain (raw SQL, same role as `models/` under a different name — a
pre-existing, already-documented naming inconsistency, not something Phase 2A introduces or fixes). The
new Prisma files live under `repositories/prisma/` specifically so they're never confused with that
existing raw-SQL folder.

## Phase 4 tables: a deliberate exception to "new table → Prisma"

`ground_owner_requests` and `account_audit_log` (Phase 4 — see `docs/ACCOUNT_CREATION.md`) are both
brand-new tables, but are raw SQL (`models/groundOwnerRequest.model.js`, `models/accountAuditLog.model.js`),
not Prisma repositories, breaking the "new table → Prisma" default this doc established above. Reason: the
Ground Owner approval flow must atomically write to `users`/`grounds`/`ground_users` (raw `pg` Pool) and
these two tables in a single transaction. Prisma and the raw `pg` Pool are separate connections/pools —
true cross-table atomicity requires one access pattern for every write in a transaction, not two. Two
Prisma repository files for these tables were written first, then deleted once this was recognized, in
favor of raw SQL functions that accept the same optional trailing `client` parameter every other
transaction-aware model in this codebase uses (see `ground.model.js#createGround`,
`groundUser.model.js#createMembership`, both extended the same way in Phase 4 for the same reason).

`otp_codes` (Phase 3, Prisma-managed, unaffected by the above) gained two additive columns in Phase 4: a
widened `purpose` CHECK (`LOGIN` → `LOGIN | REGISTER_PLAYER | REGISTER_UMPIRE`) and a nullable
`metadata JSONB` column (stages the one field — `name` — collected at registration time, before the
identifier is verified and the real account can be created).

## Phase 5 tables: `permissions` / `staff_permissions` — same exception, same reason

Granular Staff permissions (`docs/AUTHORIZATION.md`) add two more brand-new tables, also raw SQL
(`models/permission.model.js`), for the identical reason as Phase 4's tables above: granting/revoking a
permission must transact atomically with an `account_audit_log` insert.

- **`permissions`** — the catalog (`id, key UNIQUE, description, is_active, created_at`), seeded via
  `INSERT ... ON CONFLICT (key) DO NOTHING` with the 4 keys `MATCH_VIEW`/`MATCH_MANAGE`/`UMPIRE_MANAGE`/
  `STAFF_VIEW`.
- **`staff_permissions`** — grants, tied to `ground_users.id` (not a redundant `user_id`+`ground_id` pair) so
  a grant is structurally impossible without an existing membership row. `idx_staff_permissions_active_unique`
  (partial unique on `(ground_user_id, permission_id) WHERE revoked_at IS NULL`) is both the "no duplicate
  active grant" guarantee and the index the hot per-request authorization check uses.

`account_audit_log.event_type`'s CHECK was widened again (`PERMISSION_GRANTED`, `PERMISSION_REVOKED`,
`STAFF_DISABLED`) using this file's own established idempotent drop-and-recreate-constraint pattern (a bare
`CREATE TABLE IF NOT EXISTS` is a no-op once the table already exists, as it did from Phase 4 onward).

## Error handling

`server/src/middlewares/errorHandler.js` now recognizes Prisma's `PrismaClientKnownRequestError` shape
(identified by the `clientVersion` field Prisma always attaches, which no existing domain error carries)
and maps the common cases to safe, generic client-facing messages before they could ever reach a response:

| Prisma code | Meaning | HTTP status | Client message |
|---|---|---|---|
| `P2002` | Unique constraint violation | 409 | "A record with these details already exists." |
| `P2003` | Foreign key constraint violation | 409 | "This action references a record that no longer exists." |
| `P2025` | Record not found | 404 | "The requested record was not found." |
| (any other) | — | 500 | "A database error occurred." (full detail logged server-side only) |

No SQL, connection string, or Prisma/driver internal detail is ever included in a client response, in
either the Prisma-specific branch or the pre-existing generic 500 fallback.

## Mongoose — status, not yet removed

`mongoose` remains a listed dependency. It is **not** part of the live runtime request path (`server.js`
never calls `connectMongo()` at boot — that was already true before Phase 2A). It is still genuinely used
by: 5 legacy model files (`*MongoLegacy.model.js`), the one-time `migrate:*ToPostgres.js`/`backup:mongo`
npm scripts, and several integration tests that spin up disposable Mongo fixtures to verify migration
idempotency. Because real scripts and tests still depend on it, it was **not** removed in Phase 2A — Step
12's own instruction was to remove it only "if confirmed completely unused," and it isn't. Removing it
cleanly (dependency + legacy models + migration scripts + those specific tests) is a good candidate for a
dedicated later cleanup pass once nobody needs the Mongo→Postgres rollback path anymore.

## Docker / Kubernetes

`server/Dockerfile` now installs full dependencies (needed for the `prisma` CLI to run `generate`), copies
`prisma/`, runs `npx prisma generate`, then `npm prune --omit=dev` to drop the CLI back out of the final
image — the generated client itself survives the prune (it lives under `@prisma/client`, a regular
dependency). No `prisma migrate` command of any kind runs during the Docker build or container startup.

Kubernetes manifests (`k8s/loc-backend-deployment.yaml`) require no structural change — they already pull
every backend env var generically from the `loc-backend-env` Secret via `envFrom`. That Secret (created
out-of-band, not committed to this repo, consistent with existing practice) now additionally needs a
`DATABASE_URL` key alongside the existing `PG_*`/`JWT_SECRET`/etc. keys — see `docs/DEPLOYMENT.md`.

## What Phase 2A deliberately does not touch

No authentication behavior, no RBAC/role model changes, no OTP/MFA/passkeys, no session redesign, and no
live route was switched to use Prisma. Those are later, separately-scoped phases (see
`docs/ARCHITECTURE.md` / the Auth-RBAC redesign initiative notes) — labeled as planned, not implemented.
