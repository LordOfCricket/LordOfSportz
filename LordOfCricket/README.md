# Lord Of Cricket (LOC)

Lord Of Cricket is the digital home of a real grassroots cricket ground: match
scoring, official career statistics, and a public spectator experience, built
on top of a from-scratch, backend-authoritative cricket scoring engine — plus
the ground's own booking/canteen/facilities site.

Short name: **LOC**. (Never "CricVerse" — that name is retired.)

## Core capabilities

- **Authentication** — email/password accounts (player, staff, umpire roles), JWT sessions.
- **Player Profiles** — self-service profile setup, public player discovery and public profiles.
- **Teams** — team rosters, public team discovery and public team profiles with official records.
  Staff manage roster membership (add/remove a player from a team) directly from the team profile
  page — see `docs/ARCHITECTURE.md`'s Phase 13 notes.
- **Match Creation & Setup** — team selection, Playing XI (with captain/wicketkeeper), toss. Staff
  and approved umpires both reach match creation/setup/scoring through a single "Match Operations"
  hub (`/umpire`, linked from the account menu as "Manage Matches") — no manual URL typing needed.
- **Player Match Availability / RSVP** — a player marks AVAILABLE/NOT AVAILABLE for an upcoming
  match; the organizer sees every response while building the roster. Informational only — it
  never automatically sets the Playing XI, which remains fully organizer-authoritative.
- **Scoring Engine & Replay** — every delivery/event is persisted and the innings state is always
  reconstructed by replaying that log — never accumulated by a stateful counter.
- **Wagon Wheel** — shot-by-shot placement recorded per delivery.
- **Edit Score / Corrections** — a full correction-preview → apply → undo audit trail that replays
  history rather than patching totals.
- **Match Lifecycle** — upcoming → live → completed → finalized, with target/chase, innings break,
  and roster-aware result derivation (wins/losses/ties).
- **Career Statistics & Leaderboards** — official stats derived only from finalized matches.
- **Public Match Discovery** — a public `/matches` page (Live / Upcoming / Results) and a homepage
  feed, all reading the same authoritative data.
- **Professional Match Summary** — a full public scorecard/timeline/wagon-wheel view of any match.
- **Spectator Live Updates** — the open Match Summary page for a live match updates itself in
  real time over Socket.IO (one room per match, authoritative state only — never a client-computed
  delta), with visibility-aware/offline-aware HTTP polling as an automatic resilience fallback
  whenever the socket is disconnected — no manual refresh needed either way.
- **Professional Commentary** — a deterministic, template-based ball-by-ball commentary feed (dots,
  boundaries, extras, wickets, milestones, over/innings/match lifecycle), generated purely from the
  authoritative replay engine — never AI, never a second cricket engine — persisted in PostgreSQL,
  correction-aware (a historical Edit Score regenerates the affected commentary automatically), and
  live over the same Socket.IO room as the score.
- **Canteen** — a merged food-ordering system (menu, orders, live order status) for the ground,
  PostgreSQL-backed since the MongoDB cleanup (Phase 5). "One active order per user" is enforced by
  a PostgreSQL partial unique index, not just a same-process check — two near-simultaneous order
  requests can never both succeed (originally proven with MongoDB's equivalent index in Phase 14
  Part 2; the same guarantee, same mechanism, now on PostgreSQL).
- **Ground Booking** — a real availability/reservation system for the ground itself: a public
  calendar (`GET /api/bookings/availability`), a homepage booking flow, "My Bookings," and staff
  schedule/blocking tools. PostgreSQL is authoritative (a `tstzrange` `EXCLUDE` constraint makes
  overlapping confirmed reservations impossible at the database level — see docs/ARCHITECTURE.md's
  Phase 14 section for the exact guarantee), with optional, best-effort Google Calendar
  synchronization that can never cause a double-booking even if it's misconfigured or down.
- **Tournament Management** — League/Round-Robin, Groups + Knockout, and Direct Knockout
  competitions built entirely ABOVE the existing match system: a tournament fixture links to one
  real LOC match, which is scored/replayed/finalized through the unchanged scoring engine.
  Server-authoritative points/Net Run Rate/standings/qualification/knockout progression (a
  finalized match automatically advances a bracket winner and, eventually, crowns a champion —
  never a frontend calculation), a public tournament hub (`/tournaments`), and a staff organizer
  dashboard. See docs/ARCHITECTURE.md's Phase 15 section for the exact NRR formula and the
  no-fake-winner tie/no-result policy.
- **AI Match/Player/Team Insight** — a short, clearly-labeled "✨ AI Insight" narrative on the Match Summary, Player Profile, and Team Profile pages, generated from a compact, bounded, deterministic projection of the same authoritative data those pages already show. AI never decides cricket truth — it only explains already-computed facts, its output is schema-validated before anything is shown, and it never writes to PostgreSQL. Optional infrastructure: with no API key configured the server boots and every page works exactly as before, just without the AI section. See docs/ARCHITECTURE.md's Phase 16 section.
- **Advanced Cricket Analytics** — deterministic, server-computed analytics for players, teams,
  matches, and tournaments: recent-form/batting/bowling trends, boundary and dot-ball analysis,
  batting consistency, dismissal breakdown, batting-first-vs-chasing splits, scoring averages,
  run-rate trends, match score/run-rate progression and format-aware phase breakdowns, player-vs-
  player and team-vs-team comparison (no AI, no predictions, no composite "rating" — every number is
  mathematically reproducible from PostgreSQL's authoritative cricket history). New Analytics
  tabs/sections on Player Profile, Team Profile, and Match Summary, plus `/players/compare` and
  `/teams/compare`. See docs/ARCHITECTURE.md's Phase 17 section for exact formulas.
- **Ground Operations & Management** — turns Phase 14's ground booking into a complete single-ground
  operations system, without redesigning it: one central availability engine (bookings + staff
  blocks + LOC matches — the SAME `ground_bookings` table and EXCLUDE constraint Phase 14 already
  proved, extended with a named `block_type` taxonomy for maintenance/private-events/rain/emergency,
  never a second concurrency mechanism), a daily ground timeline, a staff operations dashboard
  (today's matches/bookings/maintenance, upcoming tournament fixtures), booking history
  (search/filter/pagination), deterministic reports (busy days, peak hours, ground utilization %),
  an append-only audit log, and real in-app notifications (booking confirmed/cancelled — no email/
  SMS). A public "Today's Availability" preview on the homepage needs no login. See
  docs/ARCHITECTURE.md's Phase 18 section for the exact utilization formula and why blocks reuse
  Phase 14's table instead of a new one.
- **Production Hardening** — a full-app audit (auth/authorization, input validation, error handling,
  rate limiting, structured logging, security headers, CORS, secrets/config, database, caching,
  frontend states, dependencies, bundle size) with every real, measured finding fixed: standard
  security headers (`helmet`), rate limiting on login/AI/booking/search/commentary/analytics,
  sanitized error responses (an unexpected server error never leaks its raw message), a 404 page and
  a route-level error boundary (neither existed before), and route-based code-splitting (one 870KB JS
  chunk became per-page chunks, largest now 300KB). No new user-facing features, no architecture
  rewrites. See `docs/ARCHITECTURE.md` §19 and `docs/DEPLOYMENT.md`.
- **Production Release** — deployment infrastructure and real verification that LOC boots from a
  fresh install: `GET /api/health` (liveness) and `GET /api/health/ready` (real Postgres check +
  Mongo/Calendar/AI state), fail-fast startup validation for missing required environment variables,
  response compression, SPA-fallback routing config (Vercel + Netlify/Render), an optional backend
  `Dockerfile`, a tunable PostgreSQL connection pool, and a real dry run (fresh `npm ci` + boot from
  an isolated directory containing only what a container build would have) that caught and removed a
  dead, self-referential `file:..` package dependency that would have broken any containerized build.
  See `docs/ARCHITECTURE.md` §20 and `docs/DEPLOYMENT.md`.
- **Umpire Requests** — a request/approval flow for umpire status.
- **Practice / Umpire Testing sandbox** (`/testing`) — an intentionally separate, client-only
  scoring engine for practicing scoring without touching real match data.

**Not implemented yet** (do not assume these exist): AI-enriched/AI-generated commentary wording
(Phase 12's commentary is deterministic and template-based, never AI — see
`docs/ARCHITECTURE.md` §12.10), an AI chatbot/assistant or score predictions (Phase 16's AI Insight
only narrates already-decided official facts, never predicts or chats), fantasy cricket, an
auction/draft system, guest (non-account) booking, custom-duration bookings (every booking is
currently one fixed-length slot), tournament formats beyond League/Groups+Knockout/direct
Knockout, and Super Over (a tied/no-result knockout match requires an explicit staff resolution —
see `docs/TECHNICAL_DEBT.md`), a manual booking approval workflow (Phase 14's auto-confirm design —
every booking is either confirmed immediately or rejected by the EXCLUDE constraint; there is no
PENDING queue for staff to review), payments, and multi-ground support (LOC manages exactly one
physical ground, by design — see docs/ARCHITECTURE.md's Phase 18 section).

## Architecture overview

```
Browser (React)
      │
      ▼
Express API (/api)
      │
      ▼
Services  (orchestration, transactions)
      │
      ▼
Domain    (pure cricket rules — replay, statistics, corrections; zero I/O)
      │
      ▼
PostgreSQL   (official cricket truth: teams, players, matches, innings,
              deliveries, wickets, wagon wheel, corrections, statistics —
              PLUS commentary_entries, a deterministic PROJECTION of that
              truth, Phase 12 — never a second source of it)

MongoDB cleanup (Phases 1-6): gallery images, the AI Insight cache, and the
entire canteen module (menu items, today's menu, orders) all moved to
PostgreSQL. MongoDB is no longer part of the runtime — the server doesn't
connect to it at boot. It's retained only as a rollback/historical source
and for the migration scripts themselves (`npm run migrate:*`).

Socket.IO (one shared server, since before Phase 11 — canteen order/menu
updates) now ALSO carries cricket spectator updates via match:{id} rooms:
match:state (the authoritative live-state DTO) and match:commentary (Phase
12's deterministic commentary feed) — both published only after a
scoring/correction write has committed.
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full data-flow, replay/correction
design, the realtime transport (Socket.IO + polling fallback) design, and the commentary projection
(§12).

## Tech stack

- **Backend**: Node.js (ESM), Express, `pg` (PostgreSQL driver, no ORM), `jsonwebtoken`, `bcryptjs`,
  Socket.IO (canteen order/menu updates + cricket spectator match rooms + booking availability
  refresh), Cloudinary (uploads), `googleapis` (optional ground-booking Google Calendar sync,
  service-account auth), `@anthropic-ai/sdk` (optional AI Insight narrative generation, server-only),
  Node's built-in test runner (`node --test`). Mongoose/MongoDB remain a dependency only for the
  Phase 1-6 migration scripts and rollback tooling — not part of the running server.
- **Frontend**: React 19, React Router 7 (data router), Vite, Tailwind CSS 4, axios,
  `socket.io-client`, lucide-react icons, `eslint-plugin-react-hooks` with the React Compiler rule set.
- **Database**: PostgreSQL — the sole production database (cricket truth, users, canteen, ground
  bookings, tournaments, gallery, AI Insight cache). MongoDB is retired from the runtime (Phase 6)
  and kept only as a historical/rollback source.

## Project structure

```
LordOfCricket/
├── client/                 React SPA
│   └── src/
│       ├── pages/          route-level screens
│       ├── components/     presentational + feature components, grouped by domain
│       ├── hooks/          data fetching, polling, auth, canteen sockets
│       ├── services/       one thin axios wrapper per API area
│       ├── models/         small pure display/formatting helpers (labels, enums)
│       ├── routes/         React Router config + auth guards
│       └── context/        AuthContext
├── server/                 Express API
│   └── src/
│       ├── routes/         Express routers (thin — just method+path→controller wiring)
│       ├── controllers/    request/response glue only
│       ├── services/       orchestration, transactions, cross-cutting rules
│       ├── domain/         pure cricket logic — scoring replay, statistics, corrections,
│       │                   match discovery/live-state DTOs, matchSummary, commentary generation,
│       │                   ground-booking availability/overlap/recommendation rules (booking/),
│       │                   tournament fixture generation/points/NRR/standings/qualification/
│       │                   progression rules (tournament/), AI context builders/fingerprinting/
│       │                   output validation (ai/). Zero PostgreSQL imports.
│       ├── ai/             AI provider abstraction (aiProvider.js + providers/), centralized
│       │                   system prompts, structured-output schemas — the ONLY place that
│       │                   imports the Anthropic SDK (see docs/ARCHITECTURE.md's Phase 16 section)
│       ├── realtime/       Socket.IO cricket room join/leave + authoritative state/commentary
│       │                   publication, plus booking availability refresh rooms (transport only —
│       │                   zero cricket/booking rules, see docs/ARCHITECTURE.md)
│       ├── repositories/   parameterized SQL for the scoring/correction/commentary/booking/
│       │                   tournament domain
│       ├── scripts/        one-off maintenance scripts (e.g. commentary backfill/rebuild)
│       ├── models/         parameterized SQL for teams/players/matches/users (pre-Phase-3 naming;
│       │                   same role as repositories/)
│       ├── middlewares/    auth, role/scorer guards, centralized error handler
│       ├── config/         db pools, CORS allowlist, uploads, migrate/seed scripts
│       └── tests/integration/   real-PostgreSQL integration tests
├── docs/                   ARCHITECTURE.md, TECHNICAL_DEBT.md, API.md
└── package.json            root convenience script to run client+server together
```

## Local setup

Prerequisites: Node.js 20+, a PostgreSQL database. A MongoDB database is only needed if you're
running the Phase 1-6 migration scripts (`npm run migrate:*`) or their rollback-path tests against a
pre-migration database — the running application no longer connects to MongoDB (see `MONGO_URI` below).

```bash
git clone <repo>
cd LordOfCricket
npm install --prefix server
npm install --prefix client
```

### Environment variables

Copy the example files and fill in real values — **never commit real secrets**:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env`:

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `NODE_ENV` | Set to `production` in production — gates the `JWT_SECRET`/env-validation startup checks below |
| `PG_USER`, `PG_HOST`, `PG_DATABASE`, `PG_PASSWORD`, `PG_PORT` | PostgreSQL connection. **Required in production** — the server refuses to start with a clear error naming exactly which is missing (see `server/src/config/validateEnv.js`) |
| `PG_POOL_MAX` | Optional — max pool connections (default 10, pg's own default) |
| `CLIENT_ORIGIN` | Comma-separated list of allowed CORS origins. **Required in production**, same fail-fast check as above |
| `TRUST_PROXY` | Optional — set to `1` only when a real reverse proxy sits in front of this process (controls rate-limit/logging IP attribution) |
| `JWT_SECRET` | Session-signing secret. **Required in production** — the server refuses to start in production without it (see `server/src/utils/jwt.js`) |
| `CRICAPI_KEY` | Optional — powers the homepage's external "India match" widget only; the widget degrades gracefully with no key |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Canteen menu-item image uploads |
| `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Optional — ground-calendar sync (Phase 14); booking works fully without it |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | Optional — AI Match/Player/Team Insight (Phase 16). With `AI_API_KEY` unset the server boots normally and every AI Insight endpoint returns `{available:false, reason:'NOT_CONFIGURED'}`; every other page is completely unaffected. Never exposed to the client. |
| `MONGO_URI` | **Migration tooling only** (MongoDB cleanup, Phase 6). The server no longer connects to MongoDB at boot — every feature that used to live there (gallery, AI insight cache, canteen menu/today's menu/orders) is PostgreSQL-backed as of Phases 1-5. Only needed to run `npm run migrate:*`/`npm run backup:mongo` against a pre-Phase-6 database, or the rollback-path integration tests. |

See `docs/DEPLOYMENT.md` for the full production checklist, health checks, Google Calendar/AI setup
steps, and backup/disaster-recovery guidance.

`client/.env`:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the Express API |
| `VITE_SOCKET_URL` | Base URL for the shared Socket.IO connection (canteen orders/menu + cricket spectator match rooms) |

Never put server secrets in a `VITE_`-prefixed variable — anything prefixed `VITE_` is bundled
into the public client build.

### Database setup

```bash
npm run db:migrate --prefix server   # creates/updates all tables (idempotent, see docs/ARCHITECTURE.md)
npm run db:seed --prefix server      # test accounts — refuses to run if NODE_ENV=production
npm run db:seed:players --prefix server
```

### Run

```bash
# from the repo root — runs client and server together
npm run dev

# or individually
npm run dev --prefix server
npm run dev --prefix client
```

### Tests

```bash
npm test --prefix server              # pure domain/unit tests — no database needed
npm run test:integration --prefix server   # real-PostgreSQL integration tests
npm test --prefix client              # the practice/umpire-testing sandbox's client-side scoring engine
```

Current verified baseline: server **304 / 304** unit, client **9 / 9**. (The integration count predates
the MongoDB cleanup — Phases 1-6 added ~70 new integration tests for the migrated features, so the old
**251 / 255** figure is stale; a fresh baseline count is worth taking as its own documentation pass.)
Since the MongoDB cleanup (Phase 6), the server no longer connects to MongoDB at boot — the only
integration tests that still open a MongoDB connection are the Phase 1-6 migration-idempotency tests
and `canteenOrderConcurrency.integration.test.js` (a rollback-path check against the retired Mongoose
model), and they skip (not fail) if MongoDB isn't reachable.
The integration suite occasionally shows a single non-reproducible count-assertion flake on a full
parallel run (different file each time) — root-caused to `node --test`'s default concurrent file
execution racing against the shared dev database, not a real regression; see `docs/TECHNICAL_DEBT.md`.

### Production build

```bash
npm run build --prefix client
npm start --prefix server
```

### Maintenance scripts

```bash
npm run commentary:rebuild --prefix server   # regenerate commentary for every innings (idempotent)
```

## Important architectural principles

1. **PostgreSQL is the only source of official cricket truth.** Deliveries and non-scoring events
   are appended to an immutable log; every derived figure (score, wickets, batting/bowling figures,
   career stats, team records, the live spectator view) is *replayed* from that log, never
   accumulated independently.
2. **Corrections rewrite history safely, not totals.** Editing a historical delivery re-runs the
   replay from that point forward inside one transaction and bumps a version counter — nothing
   downstream (career stats, team records, the live view) can go stale.
3. **The frontend never computes cricket truth.** Run rates, targets, results, and win/loss
   determination are always server-computed; React only formats strings for display.
4. **PostgreSQL is the only production database.** MongoDB was, at various points before the Phase
   1-6 cleanup, used for the canteen's flexible order-lifecycle data, gallery metadata, and the AI
   Insight cache — but never for cricket truth, and as of Phase 6 it's retired from the runtime
   entirely (kept only as a historical/rollback source and for the migration scripts themselves).
5. **Public reads are explicit DTOs, never raw database rows** — no email/password/OTP/internal
   IDs are ever exposed by a public endpoint.
6. **Realtime publishes truth, never a delta.** A Socket.IO broadcast only ever happens *after* a
   scoring/correction transaction has committed, and it always carries the full, freshly-replayed
   authoritative state (the same DTO the HTTP live-state endpoint serves) — never a client-side
   "+4 runs" style delta, which a later historical correction would make unsafe to apply.
7. **Commentary describes cricket, it never decides it.** The commentary projection
   (`commentary_entries`) is generated purely from `replayInnings()` output — no shot type, ball
   line/length, or fielder is ever invented beyond what's authoritatively recorded — and if it ever
   disagrees with the replay engine, the projection is regenerated, never the cricket truth.
8. **Tournament logic sits ABOVE match truth, never beside it.** A tournament fixture links to one
   real `matches` row, scored through the same unmodified scoring/replay/finalize pipeline every
   other match uses. Standings/NRR/qualification/knockout progression only ever read a FINALIZED
   match's official result — never a second scoring engine, and never a fabricated winner for a
   tie/no-result LOC has no Super Over flow to resolve (see docs/ARCHITECTURE.md §15).
9. **AI narrates cricket truth, it never decides it.** AI Insight (Phase 16) is fed a bounded,
   pre-computed fact set built from the same public DTOs the page already renders — it cannot query
   PostgreSQL, invent a score/player/delivery, or override an official result, and its output is
   schema-validated before anything is shown. The only thing it ever writes is an upsert into the
   `ai_insights` cache table (MongoDB before the Phase 6 cleanup, PostgreSQL since) — it never
   touches any cricket-authoritative table (see docs/ARCHITECTURE.md §16).
10. **Analytics derives, it never decides.** Advanced Cricket Analytics (Phase 17) is a pure-function
    layer over already-authoritative data (career stats, team records, replayed innings state) — it
    never recalculates a score/wicket/result differently than the existing scoring/statistics
    engines, adds zero new PostgreSQL tables, and every shared metric is cross-checked in tests to
    agree EXACTLY with the existing Phase 7/10 read models it derives from (see docs/ARCHITECTURE.md
    §17).
11. **One ground, one availability engine, one concurrency guarantee.** Ground Operations (Phase 18)
    never introduces a second "is this slot occupied" computation or a second concurrency mechanism —
    ground blocks/maintenance reuse the EXACT SAME `ground_bookings` table and `EXCLUDE` constraint
    Phase 14 already proved correct under real concurrent requests, just with a richer `block_type`
    taxonomy layered on top. Every new read (timeline, dashboard, reports, utilization) derives from
    that one table plus the existing read-only match-occupancy link — never a duplicated truth (see
    docs/ARCHITECTURE.md §18).
12. **The backend is the only authority on validity and safety — the client is advisory only.**
    Production Hardening (Phase 19) re-verified this rather than introduced it: every mutation
    re-validates server-side regardless of what the client already checked, every unexpected server
    error is sanitized before it reaches a response, every numeric route id and pagination parameter
    is shape-checked before it reaches SQL, and the small set of endpoints worth rate-limiting
    (login, AI, booking writes, public search, commentary, analytics) are — all without adding a new
    framework or redesigning a single working module (see docs/ARCHITECTURE.md §19).
13. **Every optional integration degrades, never blocks — and that's verified live, not just read
    from code.** Production Release (Phase 20) confirmed this end-to-end against the real running
    server: a booking created with no Google Calendar credentials configured still succeeds fully
    (`googleSyncStatus: "NOT_CONFIGURED"`), and an AI Insight request against a real finalized match
    with no AI key configured still returns a clean `200` (`{available:false,
    reason:'NOT_CONFIGURED'}`) rather than an error. Readiness (`GET /api/health/ready`) reports
    Mongo/Calendar/AI state for visibility, but PostgreSQL is the only dependency that can ever make
    an instance report not-ready (see docs/ARCHITECTURE.md §20).

See `docs/ARCHITECTURE.md` for the full data-flow diagram and the correction-engine/realtime/
commentary walkthroughs. See `docs/DEPLOYMENT.md` for the production environment-variable and
deployment checklist.
