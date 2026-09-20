# Deployment

Operational reference for running LOC in production. For the reasoning behind each hardening
decision below, see `docs/ARCHITECTURE.md` §19 (Phase 19 — Production Hardening) and §20 (Phase 20 —
Production Release).

## Environment variables

All variables are documented with inline comments in `server/.env.example` — copy it to `server/.env`
and fill in real values before deploying. Summary by category:

| Variable | Required? | Notes |
|---|---|---|
| `PORT` | No (defaults 5000) | |
| `NODE_ENV` | **Yes, set to `production`** | Gates the `JWT_SECRET` safety check (below) and disables dev-only fallbacks. |
| `CLIENT_ORIGIN` | **Yes** | Comma-separated allowed CORS origins. An empty/unset value fails CORS *closed* (blocks every origin), not open — verified. |
| `TRUST_PROXY` | Only if behind a reverse proxy | Set to `1` only when a real reverse proxy (Nginx/Render/Railway/etc) terminates TLS and sets `X-Forwarded-For`. Leaving this on with no real proxy in front lets a client spoof its own IP and bypass rate limiting entirely. |
| `PG_*` | **Yes** | PostgreSQL connection — the authoritative datastore. `PG_POOL_MAX` is optional (defaults to 10, pg's own default). |
| `DATABASE_URL` | **Yes, as of Phase 2A** | Same Postgres instance as `PG_*`, expressed as one connection string because that's what Prisma's `datasource` block requires (`postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`). The pre-existing `pg` Pool (`config/db.js`) is untouched and keeps reading the discrete `PG_*` vars above — this is additive, consumed only by `prisma/schema.prisma` and `config/prisma.js`. See `docs/DATABASE.md`. |
| `MONGO_URI` | No | Optional cache/secondary store (canteen menu, AI insight cache). The server boots and every core feature works without it — a connection failure logs a warning, never blocks startup. |
| `JWT_SECRET` | **Yes in production** | Legacy email+password login, kept alive during the Phase 3 OTP migration window (see `docs/AUTH.md`). The server **refuses to boot** in production without this set (`utils/jwt.js`) — it will never silently sign real sessions with the public dev fallback secret. Use a long, random value. |
| `SESSION_COOKIE_SECRET` | **Yes in production, as of Phase 3** | Signs the new OTP-login session cookie (separate secret from `JWT_SECRET` — the two auth mechanisms don't share a compromise). Same fail-fast pattern as `JWT_SECRET` (`app.js`). |
| `OTP_LENGTH` / `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_SECONDS` / `SESSION_TTL_DAYS` | No | Phase 3 OTP tuning — sane defaults if unset (`domain/otpAuth/otp.js`). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_API_KEY` / `TWILIO_API_SECRET` / `TWILIO_VERIFY_SERVICE_SID` | No | Phase 3 phone OTP delivery via Twilio Verify, Standard API Key auth (not the Account Auth Token). All four required together; if any is missing, the console dev-provider is used instead (logs the code server-side, never sends a real SMS) — see `docs/AUTH.md`. Never exposed to the client. |
| `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` | No | Phase 3 email OTP delivery via SendGrid. Both required together; if either is missing, the console dev-provider is used instead. Never exposed to the client. |
| `CRICAPI_KEY` | No | Optional external India-match widget; degrades gracefully without it. |
| `CLOUDINARY_*` | Only if canteen menu images are used | |
| `GOOGLE_CALENDAR_ID` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | No | Optional ground-calendar sync. Booking works fully without it. |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | No | Optional AI Insight feature. Every page works without it (`{available:false}`). Never exposed to the client — every AI call originates server-side only. |
| `GROUND_*` | No | Ground operating policy (hours, slot length, booking horizon) — sensible defaults in `domain/booking/policy.js`. |

**Missing required variables fail fast, with a clear message.** `config/validateEnv.js` runs at
startup and, in production, refuses to boot if `JWT_SECRET`, `SESSION_COOKIE_SECRET`, any `PG_*`, or
`CLIENT_ORIGIN` is unset
— the error names exactly which variable(s) are missing rather than surfacing as an opaque downstream
connection error several layers removed from the actual cause. Every other variable in the table
above is genuinely optional by design (the app boots and every core feature works without it) and is
deliberately NOT part of this check — making an optional integration mandatory here would be a
regression, not hardening.

## Health checks

- `GET /api/health` — **liveness**. Checks nothing external (no DB query) — "is the process up at
  all". Use this for a container/orchestrator's liveness probe.
- `GET /api/health/ready` — **readiness**. Checks a real PostgreSQL query; returns `503` if it fails,
  `200` if it succeeds. Also reports (informationally — never affects the status code) whether
  MongoDB, Google Calendar, and AI are currently connected/configured, e.g.:
  ```json
  { "status": "ready", "postgres": "connected", "optional": { "mongodb": "connected", "googleCalendar": "configured", "ai": "configured" } }
  ```
  Use this for a load balancer/orchestrator's readiness probe — an instance with Mongo down is still
  fully able to serve cricket scoring, booking, and tournaments, so readiness never depends on the
  optional services.

## Database setup

1. Create a PostgreSQL database (any host — Render/Railway/Fly.io/Supabase/a self-managed instance
   all work identically, since the app only needs standard `pg` connectivity).
2. Set `PG_USER`/`PG_HOST`/`PG_DATABASE`/`PG_PASSWORD`/`PG_PORT` in the environment.
3. Run `npm run db:migrate --prefix server` — applies `server/src/config/schema.sql`. Idempotent
   (every `CREATE TABLE`/`CREATE INDEX` is `IF NOT EXISTS`, migrations are additive `ALTER TABLE ...
   ADD COLUMN IF NOT EXISTS` style) — safe to re-run against an already-migrated database.
4. MongoDB is optional. If you want the canteen menu's flexible catalog storage and the AI Insight
   cache to actually persist (both degrade gracefully without it — see docs/ARCHITECTURE.md), set
   `MONGO_URI` to a real Atlas/self-hosted connection string and make sure the deploying environment's
   outbound IP is allow-listed on the Atlas cluster (the single most common real-world cause of
   "MongoDB connection failed" in this app's logs).
5. Set `DATABASE_URL` (Phase 2A onward) to the same Postgres instance and run
   `npx prisma migrate deploy --schema=server/prisma/schema.prisma` once, against a fresh deployment
   target that already has `schema.sql` applied — see `docs/DATABASE.md` for the full Prisma migration
   strategy and why this is a controlled, explicit step rather than something run automatically at
   container startup.

## Google Calendar setup (optional)

Booking works completely without this — only follow these steps if you want confirmed bookings to
appear on a real Google Calendar automatically.

1. In Google Cloud Console, create a **service account** (not OAuth — this is a server-owned
   operational calendar, never a customer's personal account) and enable the Calendar API for the
   project.
2. Generate a JSON key for the service account; take `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   and `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
3. `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` must be pasted as a single line with literal `\n` sequences —
   the app unescapes them at runtime (a raw multi-line PEM can't survive a single-line `.env` value
   otherwise).
4. Create (or reuse) a Google Calendar for the ground, share it with the service account's email
   (Calendar settings → "Share with specific people" → grant "Make changes to events"), and set
   `GOOGLE_CALENDAR_ID` to that calendar's id (Calendar settings → "Integrate calendar").
5. Verify: create a real booking and confirm `googleSyncStatus` on the response is not
   `NOT_CONFIGURED`. If it's `CANCEL_FAILED`/an error string, check the service account actually has
   write access to that specific calendar.

## AI setup (optional)

Every page works completely without this (`{available:false, reason:'NOT_CONFIGURED'}`) — only
follow these steps if you want the AI Insight narrative sections to actually generate.

1. Get an Anthropic API key (console.anthropic.com).
2. Set `AI_PROVIDER=anthropic`, `AI_API_KEY=<your key>`, `AI_MODEL=claude-sonnet-5` (or another
   current Claude model id).
3. Never set an `AI_*` variable on the client (`client/.env*`) — every AI call originates
   server-side only; the key must never reach the browser.
4. Verify: `GET /api/matches/:id/ai-insight` for a finalized match should return
   `{"available":true, ...}` instead of `NOT_CONFIGURED`.

## Deploying — platform notes

LOC is a standard Node/Express API + a static Vite SPA + PostgreSQL. Current architecture:

```
Frontend (Vite SPA) → Backend (Node/Express API) → PostgreSQL
```

No container platform or orchestrator is required. Run the backend as a plain Node process
(`npm ci`, then `npm start` → `node src/server.js`) and serve the frontend as a static build
(`npm run build`, output directory `dist`) from any static host.

- **Frontend (static SPA) — Vercel**: `client/vercel.json` sets the build/output directory and
  rewrites every path to `index.html` (required for client-side routing — without it, a direct visit
  to e.g. `/matches` 404s at the host level before React Router ever loads).
- **Frontend (static SPA) — Netlify / Render Static Site**: `client/public/_redirects` (copied
  verbatim into `client/dist` by the Vite build) provides the same SPA-fallback rewrite; both
  platforms auto-detect this file.
- **Backend**: any platform that runs a plain Node process (Railway / Fly.io / Render Web Service /
  self-hosted). Build command `npm ci`, start command `npm start`.

## Pre-deploy checklist

- [ ] `NODE_ENV=production` and a real, random `JWT_SECRET` are set — the server will refuse to start otherwise.
- [ ] `CLIENT_ORIGIN` lists the real deployed frontend origin(s), no trailing slashes, no wildcards.
- [ ] `TRUST_PROXY=1` set **only if** a real reverse proxy is in front of this process.
- [ ] `PG_*` point at the production database; `npm run db:migrate --prefix server` has been run against it.
- [ ] `npm test --prefix server`, `npm run test:integration --prefix server`, and `npm test --prefix client` all pass.
- [ ] `npm run build --prefix client` completes with no chunk-size warning.
- [ ] `npm run lint --prefix client` is clean.
- [ ] `GET /api/health/ready` returns `200` with `"postgres":"connected"` once deployed.
- [ ] SPA fallback routing verified: a direct browser visit to a non-root path (e.g. `/matches`) loads the app, not a 404 from the static host.
- [ ] Confirm `server/.env` and `client/.env*` are not committed (already gitignored — `client/.env.production` is the one intentional exception, and it holds no secret, only the public API URL).
- [ ] If Google Calendar / AI are intended to be live, confirm their `optional` state in `/api/health/ready` shows `configured`, not just that env vars are set (a bad key still shows as configured but will fail on first real use — see each section's own "Verify" step above).

## Backup & restore

**PostgreSQL is the sole source of truth for every core feature** (scoring, players, teams,
tournaments, booking) — see `docs/ARCHITECTURE.md` principle #1.

**Phase 8 — a real, working backup/restore mechanism now exists**, replacing this section's previous
prose-only guidance. `npm run backup:postgres [outDir]` (`server/src/scripts/backupPostgres.js`) does a
real logical backup over a plain `pg` connection — every table in `public`, discovered dynamically via
`information_schema` (never a hand-maintained table list), dumped to one timestamped JSON file.
Deliberately not a `pg_dump` wrapper: many managed Postgres providers don't grant shell access to run
`pg_dump` at all, but always grant a normal connection.

`npm run restore:postgres <backup.json> <targetSchema>` (`server/src/scripts/restorePostgres.js`)
restores into a caller-named Postgres **schema** (via `search_path`), never directly into `public` —
schema reconstruction replays `schema.sql` (already the authoritative, idempotent schema source; see
`docs/DATABASE.md`), then inserts the backed-up rows, resolving foreign-key insert order by retrying
whatever doesn't yet satisfy a constraint until a full pass makes no further progress (rather than a
hand-maintained topological table order). For a genuine disaster-recovery restore into a **fresh, empty
database**, pass `public` as the schema.

**Actually tested, not just described** (2026-08-17, against this project's own dev database): backed
up 60 tables / 3,647 rows (~1.5s), restored into a disposable schema (~3s including schema
reconstruction), then verified — all 59 restorable tables' row counts matched the source exactly (the
60th, `_prisma_migrations`, is Prisma's own migration-bookkeeping table, not application data, and isn't
recreated by a schema.sql replay), zero orphaned foreign keys (every restored session's `user_id`
resolved to a restored user), a sampled session row matched the source byte-for-byte, and a query
against the restored schema in the exact shape the app itself would run succeeded. The disposable schema
was dropped immediately after — `public` was never touched.

- **RPO**: as tight as you can afford to run `backup:postgres` on a schedule — the mechanism itself has
  no inherent lag (it's a live snapshot read at invocation time), so RPO is purely "how often you run
  it," not a property of the tool. For continuous point-in-time recovery instead of periodic snapshots,
  use the managed-provider option below.
- **RTO**: ~3 seconds to restore this project's current dataset size (3,647 rows). This will grow with
  data volume — the restore inserts row-by-row inside per-table transactions, not via `COPY`, so a
  production-scale dataset (millions of rows) would need a `COPY`-based rewrite for acceptable RTO; not
  needed at this project's current scale, called out here so it isn't forgotten later.
- **Limitations found during testing**: `_prisma_migrations` isn't restorable via this mechanism
  (documented above — not application data); JSON/JSONB columns needed explicit re-serialization before
  re-insertion (`pg` encodes a bound JS array/object parameter as a Postgres ARRAY/ROW literal by
  default, not JSON — fixed in the script, not a residual gap).
- **Managed Postgres (Render/Railway/Supabase/RDS/etc)**: enabling the provider's own automated daily
  backups and point-in-time recovery (almost always a dashboard toggle) is still the recommended
  primary mechanism for continuous protection — `backup:postgres`/`restore:postgres` are the
  portable, always-available fallback that works with nothing but a connection string, and what this
  phase's restore test actually exercised.
- **MongoDB**: optional and non-authoritative (canteen menu catalog, AI insight cache — both are
  either re-enterable by staff or regenerable on demand). Losing it is an inconvenience, never a data
  -loss incident for LOC's actual cricket record. Back it up if convenient (most managed Atlas tiers
  include automated backups by default); not a release blocker if you don't.
- **Uploaded files** (`server/uploads/` — canteen images, ground photos not served via Cloudinary):
  local disk on whatever host runs the server. If the platform's filesystem is ephemeral (most
  container platforms are — a redeploy wipes it), these are lost on redeploy today. Not addressed in
  this phase (see Known Limitations) — Cloudinary already exists as the intended path for images that
  need to survive redeploys; this is only relevant for the subset of uploads that bypass it.

### Known migration-safety limitation (found during the restore test, 2026-08-17)

`schema.sql` replays its full multi-phase history top-to-bottom on every run, including several
tables' CHECK constraints being defined narrow-then-widened-again in later blocks (e.g.
`account_audit_log_event_type_check` is first added with only the Phase 4/5 event names, then dropped
and re-added later in the same file with the full Phase 6 MFA/step-up list added). Confirmed via direct
reproduction: replaying the full file against a database whose `account_audit_log` **already contains**
rows using the later (Phase 6) event names fails at the earlier, narrower `ADD CONSTRAINT` — the
narrower definition rejects data that only the final definition (moments later in the same file) was
ever meant to allow. This only manifests when re-running `schema.sql` from scratch against an
**already-populated** database (a genuine disaster-recovery-from-total-loss scenario, or the restore
test above run against a target schema that already had rows) — it does **not** affect the normal path
of applying `schema.sql` incrementally as each phase adds to it, and does **not** affect a restore into
a schema that starts empty (schema creation completes before any data is inserted). Confirmed
Postgres's simple-query-protocol transaction batching means a failed multi-statement run of `schema.sql`
rolls back cleanly with zero partial state — a failed re-run cannot corrupt an already-correct schema.
**Deferred, not fixed this phase**: consolidating each such constraint to a single, final definition
(rather than replaying its full historical narrow-then-widen sequence) needs a careful pass across the
whole file with the same attention to historical-DDL correctness as the rest of `schema.sql` already
gets — a dedicated task, not a same-session patch. Tracked as a real, documented finding, not silently
absorbed.

A related, smaller fix **was** made and verified safe: every such guarded
`DROP CONSTRAINT`/`RENAME COLUMN IF EXISTS`-style check in `schema.sql` queried
`information_schema.table_constraints`/`columns` without a `table_schema` filter — harmless when only
one schema exists, but a false-positive risk if another schema with identically-named tables exists in
the same database (exactly the restore-into-a-disposable-schema scenario above). Every such check now
filters on `table_schema = current_schema()`; re-verified against the real `public` schema via
`npm run db:migrate` with no behavior change (resolves to `public` there, identical to before).

## Disaster recovery

- **Postgres is down / unreachable**: `GET /api/health/ready` reports `503`. The server itself
  refuses to start at all if Postgres is unreachable at boot (`connectPostgres()` exits the process)
  — a process manager restarting it in a loop is the correct behavior until Postgres is back, not a
  bug to silence.
- **The server process crashes** (an uncaught exception): logged in full (`utils/logger.js`) then the
  process exits — run it under a supervisor (pm2/systemd/the platform's own restart policy) so it
  comes back up automatically into a known-good state rather than continuing in a corrupted one.
- **MongoDB / Google Calendar / AI go down**: no recovery action needed — every core feature already
  works without them, by design (see docs/ARCHITECTURE.md). `/api/health/ready`'s `optional` block
  shows their state for visibility, but never fails readiness because of them.
- **A bad deploy needs rolling back**: this app has no in-place schema-downgrade tooling (migrations
  are additive/idempotent, not reversible) — roll back by redeploying the previous known-good build
  artifact/image against the same database. A migration that only ever adds tables/columns (this
  project's established pattern — see `schema.sql`'s `IF NOT EXISTS` style throughout) is safe to
  leave applied even after rolling the application code back.

## Release checklist

1. Run the full pre-deploy checklist above.
2. Tag the release in git.
3. Deploy the backend first, then the frontend (the frontend is a static build that only ever calls
   the backend's already-stable API surface — deploying backend-first avoids a brief window where a
   newer frontend calls an older backend for a route that doesn't exist yet; this app has never
   needed strict version-lockstep between them beyond that ordering).
4. Confirm `GET /api/health/ready` is `200` in production.
5. Smoke-test the deployed frontend: homepage loads, login works, one public page (e.g. `/matches`)
   loads with real data.
6. Watch the server logs for the first few minutes after traffic starts flowing — `utils/logger.js`
   surfaces anything unexpected as a structured `error`-level line.

## Logging

Every log line is a single JSON object on stdout (`info`/`warn`) or stderr (`error`) —
`utils/logger.js`. No external log service is wired up; pipe stdout/stderr to whatever the hosting
platform already collects (most PaaS providers do this automatically). Never logs passwords, tokens,
or secrets. What gets logged: server startup, Postgres/Mongo connect success/failure, the Postgres
pool's idle-client errors, uncaught exceptions and unhandled promise rejections (then the process
exits on an uncaught exception — let your process manager/orchestrator restart it into a known-good
state), AI provider failures, Google Calendar sync failures, booking conflicts, audit-log/notification
write failures, and every rate-limit trip.

## Rate limiting — single-instance caveat

`express-rate-limit`'s default in-memory store is correct for LOC's current single-instance
deployment. **If you ever run more than one server instance behind a load balancer**, the in-memory
store no longer works correctly (each instance counts independently, so the effective limit
multiplies by instance count) — you would need to swap in a shared store (e.g. a Redis-backed store)
at that point. Not needed today; noted here so it isn't rediscovered the hard way.

## Process management

The server exits the process (`process.exit(1)`) on: a failed Postgres connection at startup, or an
uncaught exception at runtime. Both are deliberate — continuing in either state is worse than a clean
restart. Run the process under a supervisor (pm2, systemd, or your platform's equivalent) so it comes
back up automatically.

## What this app does not need

No CDN configuration, no server-side rendering, no separate build step for the API beyond `npm ci`.
The client is a static Vite build (`npm run build` → `client/dist`) servable from any static host or
the same origin as the API. No secrets are ever needed on the client beyond the two public
`VITE_*` values already documented in `client/.env.example`.
