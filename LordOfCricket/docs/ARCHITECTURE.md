# LOC Architecture

## 1. Layering

```
routes/          Express Router wiring only (method + path -> controller). No logic.
controllers/     Extract/validate request shape, call one service function, shape the response.
services/        Orchestration: transactions, cross-cutting rules, calls into domain/ + repositories/.
domain/          Pure functions. No pg/mongoose imports. Independently unit-testable.
repositories/    Parameterized SQL for the Phase 3+ scoring/correction domain (innings, deliveries,
  & models/      match_events, wickets, wagon_wheel_shots, score_corrections). `models/` holds the
                 same role for teams/players/matches/users (an earlier naming convention, kept as-is
                 rather than renamed for aesthetics — see docs/TECHNICAL_DEBT.md).
```

Controllers are intentionally thin everywhere in this codebase — none of them contain SQL or
cricket-rule branching.

## 2. Data flow (the authoritative path)

```
Scorer records a delivery
        │
        ▼
POST /api/innings/:id/deliveries   (requireAuth + requireScorer)
        │
        ▼
scoring.service.js#recordDelivery
   1. lock the innings row (SELECT ... FOR UPDATE)
   2. idempotency check (clientActionId)
   3. optimistic-concurrency check (expectedVersion vs innings.version)
   4. load the full delivery/event log for this innings
   5. replayInnings(log)                      <- pure domain function
   6. validateDeliveryInput(...)               <- pure domain function
   7. insert the new delivery row
   8. replayInnings(log + newDelivery)         <- SAME pure function, re-run
   9. write back the derived/cache columns on `innings` (runs, wickets,
      legal_balls, striker/non-striker/bowler, is_free_hit_next) and bump version
  10. commit
        │
        ▼
Every reader (live scorer, Match Summary, public match cards, career stats,
team records, the spectator live-state endpoint) either reads those cache
columns directly, or calls the SAME getInningsState()/replayInnings() path
to recompute a richer view. There is exactly one cricket engine
(`server/src/domain/scoring/replay.js`) — every read model is a projection
of its output, never a second implementation of cricket rules.
```

## 3. The replay engine

`server/src/domain/scoring/replay.js` exports `replayInnings(log, seed, format)` — a pure
fold over a chronologically ordered array of delivery/event entries. Given the same log, seed,
and format, it always produces the same derived state (runs, wickets, legal balls, striker/
non-striker, batting/bowling figures, fall of wickets, partnerships, free-hit state). No
database access happens inside it.

Key properties:

- **Bowler is authoritative input, not derived** — each delivery entry carries its own
  `bowlerMatchPlayerId`, stamped by the scorer at record time. Correcting an earlier delivery's
  runs/wicket never reassigns who bowled a later over, because bowler was never computed from
  anything.
- **Striker/non-striker are purely mechanical** — a function of run-parity and explicit
  `batsman-in`/wicket events.
- **`ballsPerOver` is a format parameter everywhere**, never hardcoded — the production engine
  supports non-6-ball overs.
- **All-out threshold is roster-aware**: `battingTeamPlayingXiCount - 1`, not a hardcoded 10 — LOC
  supports non-11-a-side club matches.

## 4. The correction engine (Edit Score)

```
Original delivery (several balls/overs in the past)
        │
        ▼
POST /corrections/preview   -> previewCorrection(log, seed, format, entryId, patch)
   patches ONE entry, re-runs replayInnings on the patched log,
   diffs before/after to report exactly which downstream deliveries/
   dismissed players actually changed (never a blind "everything after
   this index changed")
        │
        ▼
POST /corrections            -> applyCorrection (correction.service.js)
   same replay, inside a transaction: writes the corrected delivery/event,
   re-derives every cache column on `innings`, bumps `version`,
   inserts an immutable score_corrections audit row
        │
        ▼
Every subsequent read (scorer, Match Summary, live spectator state, career
stats once finalized) is simply a fresh replay/read of the now-authoritative
log — there is no separate "apply a delta" step anywhere.
```

`score_corrections` rows are append-only (an undo creates a NEW row with before/after swapped and
`undoes_correction_id` set — the original correction is never mutated or deleted), so the full
correction history of a match is always reconstructable.

## 5. Match & innings lifecycle

```
matches.status:   upcoming -> live -> completed -> finalized
innings.status:   not_started -> live -> completed
```

- `live` covers BOTH "an innings is being bowled" and "innings break" (innings 1 finished, innings
  2 not yet started) — the break is a *derived* sub-state, not a separate persisted status.
- A match becomes `completed` the instant innings 2's result is decided (`maybeCompleteInnings` in
  `scoring.service.js`), in the SAME transaction as the delivery/correction that decided it.
- `finalized` is a one-way lock (no un-finalize path) — reachable only from `completed`.
  `correction.service.js` refuses any correction once `finalized`.
- Result derivation (win/loss/tie, margin) lives in one pure function,
  `domain/scoring/matchResult.js`, reused by both the live completion path and the correction
  re-derivation path — never duplicated.

## 6. Statistics (career & team)

Both **official player career statistics** (Phase 7) and **official team records** (Phase 10 Part
2) apply the identical rule: **finalized matches only**. A completed-but-unfinalized match is
visible in public match discovery/results, but contributes to no official statistic until
finalized — verified explicitly by integration tests (`STATS S9`, and the Part 2 finalization
tests).

Team-scoped statistics ("top run scorer for this team", win/loss/win%) are derived from
**historical match participation** (`match_players.team_id` as recorded at match time), never from
a player's *current* team (`players.team_id`) — a player who transfers teams keeps their historical
per-team stats attached to whichever team they actually represented in each finalized match.

## 7. Public read models

| Concern | Endpoint | Notes |
|---|---|---|
| Match discovery list | `GET /api/matches/discover` | Category (LIVE/UPCOMING/RESULTS) + pagination; reads `innings` cache columns, no replay |
| Homepage feed | `GET /api/matches/home` | Featured live + bounded upcoming/results previews |
| Full match summary | `GET /api/matches/:id/summary` | Full scorecard/timeline/wagon-wheel; one replay per innings |
| Spectator live state | `GET /api/matches/:id/live-state` | Lightweight HOT-data-only DTO, meant to be polled every ~3s |
| Team discovery/profile | `GET /api/teams/discover`, `GET /api/teams/:id/profile` | Current squad vs. historical participation kept explicitly separate |
| Player discovery/profile/stats | `GET /api/players`, `/:publicPlayerId`, `/:publicPlayerId/stats` | Public, finalized-only stats |
| Leaderboards | `GET /api/stats/leaderboards/:metric` | Qualification rules centralized in `domain/statistics/leaderboardConfig.js` |

Every one of these is an explicit DTO built by a `domain/**/build*.js` pure function — never a raw
`SELECT *` row handed to the client. None of them expose `email`/`user_id`/`password`/OTP/canteen
data (enforced by dedicated privacy tests in `tests/integration/*`).

## 8. Data classification for the live spectator view (Phase 10 Part 3)

| Class | Examples | Refresh cadence |
|---|---|---|
| HOT | score, wickets, overs, striker/non-striker/bowler, this over, chase | ~3s while live, via `useLiveMatch` |
| WARM | full scorecard, timeline, partnerships, fall of wickets | on page load + on lifecycle transition (innings break, second innings, completion) — never every 3s |
| COLD | teams, venue, format, toss, Playing XI, wagon wheel | fetched once |

The `/matches` LIVE tab refreshes every ~20s while visible; the homepage every ~30s. All cadences
pause while the browser tab is hidden and refresh immediately on becoming visible again.

## 9. Spectator live transport (Phase 11: Socket.IO primary, HTTP polling fallback)

```
client/src/hooks/useSocketMatchTransport.js     <- Socket.IO transport (join/leave match:{id},
   (connect/disconnect, join-match/leave-match,     receive match:state, report connected/data)
    match:state -> data, tagged by matchId)
        │
        ├──────────────────────────────────────────────┐
        ▼                                                ▼
client/src/hooks/useVisibilityAwarePolling.js     (still exists, unchanged internals)
   active ONLY while the socket is disconnected — the resilience fallback
        │                                                │
        └──────────────────────┬─────────────────────────┘
                                ▼
client/src/hooks/useLiveMatch.js   <- merges both transports: whichever is
   verifiably NEWER by (inningsId, version) wins (isNewer()); cadence
   selection, stop-on-terminal-status; still zero cricket math
        │
        ▼
client/src/components/live-match/*   <- presentational only, UNCHANGED from
                                         Phase 10 Part 3 (Part 25 target met:
                                         no component ever touches socket.io)
```

`useLiveMatch`'s public contract — `{ liveState, loading, connectionStatus, lastUpdatedAt, refresh,
isPolling }` — is **exactly the same shape** it was under pure polling. Every consumer
(`LiveMatchPanel` and its children) needed zero changes.

## 10. Socket.IO — one shared server, two feature domains

`server/src/server.js` creates ONE Socket.IO server (`io`), attached to every request as `req.io`.
Two independent, additive `io.on('connection', ...)` registrations share it:

- **Canteen** (pre-existing): `join-staff-room` / `join-order-room` / `join-user-room`, emitted
  from `canteenOrder.controller.js` / `canteenMenu.controller.js`. Untouched by Phase 11.
- **Cricket** (`server/src/realtime/cricketRealtime.js#registerCricketRealtime`): `join-match` /
  `leave-match` / `match:state` / `match:error`, on `match:{matchId}` rooms.

Socket.IO fires every registered `connection` listener for each new socket, so adding the cricket
listener required zero changes to the canteen listener's own code — verified by a full regression
pass with no canteen behavior change.

## 11. Cricket realtime implementation

### 11.1 Files

- `server/src/realtime/cricketRealtime.js` — `registerCricketRealtime(io)` (join/leave validation)
  and `publishMatchState(io, matchId, reason)` (the one centralized publication boundary — Part 77).
  Zero cricket rules; `publishMatchState` re-reads state via the exact same
  `liveMatch.service.js#getLiveMatchState` the HTTP endpoint uses.
- `server/src/server.js` — registers the module alongside the existing canteen handlers.
- `server/src/controllers/{scoring,correction,match}.controller.js` — call `publishMatchState`
  (fire-and-forget, after `res.json(...)`) once their service call has returned successfully.
- `server/src/services/{scoring,correction}.service.js` — additive `matchId` field on
  `recordDelivery`/`recordEvent`/`applyCorrection`'s existing return objects (the controller needs
  it to know which room to publish to; nothing about the cricket logic itself changed).
- `client/src/hooks/useSocketMatchTransport.js` — the Socket.IO client transport.
- `client/src/hooks/useLiveMatch.js` — merges socket + polling (Section 9).
- `client/src/services/socket.js` — the shared `socketUrl` constant (canteen's
  `canteenOrderStatus.model.js` now re-exports from here instead of defining its own copy).

### 11.2 Files deliberately NOT touched

`domain/scoring/replay.js`, `domain/liveMatch/buildLiveMatchState.js`,
`services/liveMatch.service.js` (its exported function is called, not modified),
`components/live-match/*` (all presentational, zero socket awareness),
`GET /api/matches/:id/live-state` (still exists, still the resilience-fallback data source).

### 11.3 Event contract (exactly what ships — no delta events)

| Event | Direction | Payload |
|---|---|---|
| `join-match` | client → server | `{ matchId }` |
| `leave-match` | client → server | `{ matchId }` |
| `match:state` | server → room | the live-state DTO (`match`, `result`, `target`, `currentInnings`) plus `{ matchId, reason }` |
| `match:error` | server → client | `{ message }` — invalid/missing matchId, match not found |

`reason` ∈ `delivery | event | correction | correction_undo | lifecycle | match_completed` — set by
the calling controller, **informational only** (visible in dev tooling/future logging). The client
never branches on it (Part 7) — `useSocketMatchTransport` stores whatever `match:state` payload
arrives, full stop. No `run:added`/`wicket:taken`-style per-outcome events exist — a wide, a six, a
wicket, and a full historical correction all produce the identical shape of message: the complete
current truth.

### 11.4 Transaction boundary (verified commit points)

- Deliveries/events: `scoring.service.js#recordDelivery` / `#recordEvent` — `publishMatchState` is
  called from the CONTROLLER, which only runs after `await scoringService.recordDelivery(...)`
  has already returned (i.e. strictly after that function's internal `COMMIT`). A thrown
  `ScoringError` (validation failure, version conflict) never reaches the publish call.
  Idempotent replays (`result.idempotentReplay === true`) are explicitly skipped — Part 36.
- Corrections/undo: same pattern via `correction.service.js#applyCorrection`.
- Lifecycle: `match.service.js#startMatch` / `#finalizeMatch` — publishes once the updated match
  row is returned.

`publishMatchState` itself independently RE-READS the state from PostgreSQL (via
`getLiveMatchState`) rather than trusting anything the write path had in memory — so even if two
writes' publishes overlap in flight, each broadcast reflects genuinely fresh data at the moment it
runs, never a stale snapshot.

### 11.5 Idempotency

Verified by integration test (`R36`): retrying an already-applied `clientActionId` returns
`{idempotentReplay: true}` from the service, and the controller's `maybePublish` helper skips
publishing entirely for that case — a network retry never produces a second visible broadcast.

### 11.6 Versioning / out-of-order protection

`currentInnings.version` (and `currentInnings.id` for the innings-transition case) is exposed in
every `match:state` payload. `useLiveMatch#isNewer()` is the ONE place both transports (socket and
polling fallback) get reconciled: whichever has the higher `(inningsId, version)` wins, regardless
of which transport it arrived through or when. An innings-1 → innings-2 transition (version resets
to a small number) is handled correctly because a *different* `inningsId` always wins outright,
never compared against the old innings' version number.

### 11.7 Post-commit publish failure

`publishMatchState` wraps its work in try/catch and only `console.error`s on failure — it never
throws back to the controller. A dead socket server, a transient read failure, anything: the
scoring/correction HTTP response the scorer sees is completely unaffected (Part 78/79), verified by
`R8`/`R9` (a null `io` and a publish for a nonexistent match are both safe no-ops).

### 11.8 Room isolation & no server-side spectator state

Verified by integration test `R5`: publishing to `match:101` never reaches a socket only in
`match:202`'s room. No `Map`/global registry of "who's watching what" is kept anywhere — Socket.IO's
own room membership is the only such state, and it's automatically cleaned up on disconnect
(`R6b`/Part 6/43).

## 12. Commentary projection (Phase 12)

```
      PostgreSQL (deliveries, match_events, innings, matches)
                        │
                  replayInnings() (unchanged, Section 3)
                        │
          domain/commentary/generateInningsCommentary()
             (pure — reads replay output, invents nothing)
                        │
                commentary_entries (PostgreSQL)
                        │
             ┌──────────┴──────────┐
             │                     │
   GET /matches/:id/commentary   match:commentary
      (commentary.service.js)   (cricketRealtime.js,
                                  same match:{id} room)
             └──────────┬──────────┘
                        │
              useMatchCommentary (client)
                        │
                 CommentaryPanel
```

### 12.1 Database decision: PostgreSQL, not MongoDB

Commentary rows are tied 1:1 (or a small fixed multiple, for milestones/lifecycle) to a specific
`deliveries`/`match_events` row, ordered by the SAME `log_sequence` axis, and regenerated
transactionally as a unit whenever a correction changes that ordering. That's a relational,
foreign-keyed, single-transaction-replace shape — exactly what PostgreSQL is for. Colocating it with
the cricket history it describes means:

- `ON DELETE CASCADE` (via `innings_id`/`source_delivery_id`/`source_event_id`) — deleting a
  fixture's test data, or an innings, cannot leave orphaned commentary anywhere, with no
  application-level cleanup code.
- A correction's "delete every row for this innings, regenerate, insert" (Section 12.6) is one
  ACID transaction in the SAME database the cricket write itself used — no cross-database
  eventual-consistency window to reason about.
- Query patterns are relational from the start: "commentary for innings X, newest-first, paginated"
  is a plain indexed `WHERE innings_id = $1 ORDER BY sequence DESC LIMIT $2`.

MongoDB was **not** chosen. "Commentary is fluctuating text" is not, by itself, a reason to reach for
a document store (see the Phase 12 brief's explicit warning against that reasoning) — the actual
shape of the data (strongly relational, correction-rewritable as a transactional unit, ordered by an
existing integer axis) points at PostgreSQL. MongoDB remains exactly what it was before Phase 12:
canteen-only, never a second source of cricket truth (Architectural Principle 4).

### 12.2 Commentary is a PROJECTION, never truth

`commentary_entries` cannot disagree with `deliveries`/`wickets`/`match_events` and remain
authoritative — if it ever does (a bug, a partial write), the fix is `rebuildInningsCommentary()`
regenerating it from the replay engine, never patching cricket truth to match a wrong sentence. The
domain layer (`server/src/domain/commentary/*`) imports only `domain/scoring/replay.js` and
`domain/scoring/eventTypes.js` — no `pg`, no Socket.IO, no Express, same purity discipline as
`replay.js` itself.

### 12.3 Structured entry shape (`commentary_entries` table)

`id, match_id, innings_id, entry_key, sequence, type, source_delivery_id, source_event_id,
over_number, ball_in_over, ball_label, text, tags (JSONB array), score_runs, score_wickets,
innings_version, created_at, updated_at`, unique on `(innings_id, entry_key)`.

`type` is one of `DELIVERY | WICKET | MILESTONE | OVER_END | INNINGS_END | INNINGS_BREAK |
MATCH_RESULT | MATCH_EVENT` (`domain/commentary/entryTypes.js`) — a small, closed taxonomy;
secondary classification (`FOUR`, `SIX`, `WICKET`, `BOWLED`, `FIFTY`, `DROPPED_CATCH`, ...) lives in
`tags`, not in a growing list of types.

`entry_key` is a deterministic, content-derived identity, never a surrogate: `d:{deliveryId}` (one
per delivery, DELIVERY or WICKET), `m:{deliveryId}:{50|100|wkts3|wkts5|partnership50|...}:{subjectId}`
(milestones), `oe:{overNumber}` / `oe:{overNumber}:maiden` (over end), `ie:{inningsId}` /
`ib:{inningsId}` (innings end/break), `mr:{matchId}` (match result), `is:{inningsId}` (second-innings
chase start), `e:{eventId}` (catch-dropped/retire/penalty-runs). Replaying the same log twice — a
retried request, or a rebuild after a correction — always maps to the same key, so persistence is
either an idempotent no-op insert (append path) or a full delete-and-replace (rebuild path); it never
accumulates duplicates.

`sequence` is assigned by `generateInningsCommentary`'s fold over the log (its position in the
generated output array), **never `created_at`** — so a correction that changes what happens after
the edited point re-derives a fully consistent order every time, not whatever order rows happened to
be written in.

### 12.4 Determinism (Part 14 — no `Math.random()`)

Where a case has more than one phrasing (`domain/commentary/templateSelect.js`), the template is
chosen by an FNV-1a hash of the delivery/event id — stable identity, never re-derived per call. The
SAME log always produces byte-identical commentary, refresh/restart/replay/correction after
correction (`generateInningsCommentary.test.js`'s determinism test asserts this directly).

### 12.5 Two call sites, one generator, zero drift

`generateInningsCommentary({ log, seed, format, innings, roster, shotsByDeliveryId, teamNames, match
})` is a pure function of the WHOLE log-to-date — it does not maintain incremental state between
calls. Two service functions call it identically:

- **`appendCommentaryForInnings(inningsId)`** (normal delivery/event path) — regenerates the full
  array (cheap at club scale, Section 12.8), but only PERSISTS the entries whose `sourceIndex` is the
  newest log entry, via `INSERT ... ON CONFLICT (innings_id, entry_key) DO NOTHING`. Returns only
  what was actually newly inserted.
- **`rebuildInningsCommentary(inningsId)`** (correction/undo/backfill path) — `DELETE FROM
  commentary_entries WHERE innings_id = $1` then bulk `INSERT`, inside one transaction. Used for
  corrections, `npm run commentary:rebuild` (pre-Phase-12 match backfill, idempotent — safe to run
  twice), and ad-hoc repair.

Because both call the SAME generator over the SAME log shape, there is no second implementation to
drift out of sync — the append path's output for entry *i* is byte-identical to what a full rebuild
would produce for that same entry.

### 12.6 Transaction boundary & failure isolation (Part 38/78/79)

Commentary generation/persistence is a SEPARATE step from the cricket write, called from the
CONTROLLER only after the scoring/correction service call has already returned (i.e. after that
service's own `COMMIT`) — same discipline as `publishMatchState` (Section 11.4). Wrapped in its own
try/catch: a commentary failure is logged and never rolls back an already-committed delivery, never
surfaces to the scorer's HTTP response, and never blocks the `match:state` broadcast beside it.
`rebuildInningsCommentary` only ever reads deliveries/match_events/innings/matches and only ever
writes `commentary_entries` — corrections/deliveries/wickets/innings truth are never touched by any
commentary code path.

### 12.7 Realtime: `match:commentary` (same room, new event)

Reuses the exact `match:{matchId}` room Phase 11 already established (`realtime/cricketRealtime.js`
now also exports `publishCommentary`) — no second room. Two modes:

| mode | when | payload |
|---|---|---|
| `append` | a normal delivery/event added new commentary | the newly-persisted entries |
| `resync` | a correction/undo may have changed many entries at once | `entries: []` — client refetches over HTTP (Part 40: safer than trying to prove only one line changed) |

Persist-then-publish: the broadcast only fires with entries that are already durably in
`commentary_entries`. Client (`useMatchCommentary.js`) treats a reconnect exactly like a `resync` —
refetches the first page rather than assuming any missed `append` will replay (Part 43).

### 12.8 Performance (measured, real dev server + real PostgreSQL)

- `GET /matches/:id/commentary` (30 entries, ~120 deliveries deep into the innings): **2-3ms**.
- Full-innings rebuild (120 deliveries + lifecycle entries, 148 rows regenerated): **146-174ms**.
- Commit → `match:commentary` socket frame (real WebSocket frame inspection): **18-85ms, avg
  ~46ms** across 5 runs.
- `match:commentary` payload size for one new entry: **283 bytes**.

The generator replays `log.slice(0, i)` for every index (Section 12.5) rather than folding
incrementally — an `O(n²)` cost in the number of prior log entries, deliberately: correctness first
(Part 30), and the measured numbers above show it's nowhere near a real bottleneck at club-cricket
innings lengths (~120-150 balls). Documented as a known limitation for a much longer format — see
`docs/TECHNICAL_DEBT.md`.

### 12.9 Backfill/repair

`npm run commentary:rebuild --prefix server` (`server/src/scripts/rebuildCommentary.js`) calls
`rebuildInningsCommentary` for every innings in the database — idempotent, read-only against cricket
truth, safe to run against matches that existed before Phase 12 (no commentary yet) or to repair a
suspected drift.

### 12.10 No AI

Commentary is 100% template-based, deterministic, offline. No LLM/AI API is called anywhere in this
phase. The structured facts each entry carries (`type`, `tags`, `score`, `deliveryId`/`eventId`,
`sequence`) are deliberately AI-enrichment-ready for a future phase, but nothing in Phase 12 depends
on or calls any AI service.

## 13. Player Match Availability / RSVP (Phase 14 Part 1)

`match_availability` (`match_id`, `player_id`, `status` — `PENDING`/`AVAILABLE`/`NOT_AVAILABLE`,
unique on `(match_id, player_id)`) is a real table, not a projection — a player's RSVP is genuine
input, not derived from anything else. Eligibility is computed from `players.team_id` matching one
of the match's two teams, not `match_players` — RSVP happens *before* the Playing XI exists
(`services/matchAvailability.service.js`). Authorization is structural: every write resolves the
caller's own player via `findPlayerByUserId(req.user.id)` — there is no `playerId` parameter
anywhere in the write path for a player to substitute another player's id into. Availability is
purely informational: nothing in this phase writes to `match_players`, and the roster UI only
*displays* a status badge next to each player — it never auto-selects or auto-excludes anyone.

## 14. Ground Booking (Phase 14 Part 3)

### 14.1 Database choice: PostgreSQL, not MongoDB

Bookings need relational references (users, and the `matches` table for occupancy checks),
overlapping-time-range queries, and a hard concurrency guarantee — PostgreSQL's native range types
and exclusion constraints are built for exactly this; MongoDB has no equivalent. No existing data
moved between databases — `ground_bookings` is a new, additive PostgreSQL table (Phase 13's own
precedent: new features default to Postgres unless they're genuinely document-shaped, like canteen).

### 14.2 The concurrency guarantee (the non-negotiable requirement)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE ground_bookings (
  ...
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  ...
  CONSTRAINT ground_bookings_no_overlap EXCLUDE USING gist (
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status = 'CONFIRMED')
);
```

Two transactions concurrently inserting overlapping `[start_time, end_time)` ranges with
`status = 'CONFIRMED'` cannot both commit — PostgreSQL enforces this at the index level, the same
way a unique index enforces "no two rows with the same value," except over a *range* comparison
(`&&`, overlap) instead of equality. This is a genuine database-level guarantee, independent of any
application code, row lock, or pre-check — verified directly (not just unit-tested) by firing two
real concurrent `INSERT`s from two separate connections and confirming exactly one succeeds
(`server/src/tests/integration/groundBooking.integration.test.js`). The losing transaction receives
Postgres error `23P01`, translated by `groundBooking.service.js` into `BookingError` code
`BOOKING_CONFLICT` → HTTP `409`, with freshly-computed alternatives attached. `CANCELLED` rows are
excluded from the constraint via the `WHERE` clause, so a cancelled booking's slot becomes bookable
again immediately — no separate "release the slot" step exists because none is needed.

Staff-created blocks (`booking_type = 'STAFF_BLOCK'`) live in the *same* table and participate in
the *same* constraint, so a block and a customer booking mutually exclude each other for free — no
separate "is this time blocked OR booked" merge query anywhere.

LOC match occupancy is different in kind: `matches.match_date` is a single `TIMESTAMP` column with
no end time (confirmed by audit — no duration is derivable, even from `overs_per_innings`, which can
be `null`). Rather than fabricate a duration, a live/upcoming match blocks its **entire calendar
day** for booking purposes — a coarse, explicit, honestly-documented policy
(`groundBooking.repository.js#listMatchDatesInRange`), checked inside the same transaction as the
booking attempt, not layered on as an afterthought.

### 14.3 Timezone

No timezone library is added — `Asia/Kolkata` has a fixed, non-DST `+05:30` offset year-round, so
plain offset arithmetic (`domain/booking/timezone.js`) is exact, not an approximation. Every booking
timestamp is stored as a true UTC instant (`TIMESTAMPTZ`); "today," slot boundaries, and the
next/previous-day math for recommendations all go through this one module — nothing computes a date
boundary ad hoc, and nothing trusts the browser's or the server process's local timezone.

### 14.4 Slot policy

`domain/booking/policy.js` centralizes opening/closing hours and slot duration (env-overridable,
sensible defaults) — every booking is exactly one fixed-width slot in v1, no custom-duration picker.

### 14.5 Nearby-slot recommendations

`domain/booking/recommendations.js` is a pure function: given a requested slot and an
availability-lookup callback, it returns up to 5 alternatives in priority order (same-day nearest
earlier → same-day nearest later → next-day same time → other nearby days), each independently
verified AVAILABLE under the exact same rules as the original request — never a stale guess, and
never AI.

### 14.6 Google Calendar — sync only, never source of truth

`services/googleCalendar.service.js` authenticates as a **service account** against the ground's own
operational calendar (never a customer's personal OAuth). It follows the exact "optional dependency,
degrade gracefully" shape `config/db.js` already established for MongoDB: `isCalendarConfigured()`
gates every call, nothing it exports ever throws, and a booking's HTTP success/failure is 100%
decided before this module is ever touched — `groundBooking.service.js` calls it *after* the booking
row has already committed, and a sync failure only ever changes `google_sync_status` (`PENDING` →
`SYNCED`/`FAILED`/`NOT_CONFIGURED`), never the booking's own `status`. Idempotency is structural: the
booking's own `google_calendar_event_id` column is the only thing that decides whether a sync has
already happened, checked exactly once, at the one call site that ever creates an event — there is
no retry loop that could double-create one. A Google outage can never cause a double-booking,
because Google Calendar is never consulted for availability in the first place (Section 14.2's
constraint is the only source of truth).

### 14.7 Realtime

`realtime/bookingRealtime.js` mirrors `cricketRealtime.js`'s shape exactly (one additive
`io.on('connection', ...)` registration, one room-per-date, one fire-and-forget broadcast) — a
convenience refresh signal only. Exactly like cricket realtime, correctness never depends on it
being delivered: every client still performs its own authoritative check when it presses Confirm.

## 15. Tournament Management (Phase 15)

### 15.1 The one non-negotiable architectural rule

```
Tournament
    ↓
Tournament Fixture  (tournament_fixtures — 1 row)
    ↓
Existing LOC Match  (matches — 1 row, UNIQUE(match_id) on the fixture)
    ↓
Existing Scoring Engine / Replay Engine / Match Lifecycle   ← completely unmodified
    ↓
Existing Authoritative Match Result  (matches.status = 'finalized')
    ↓
Tournament Competition Engine   (domain/tournament/*, tournamentStandings.service.js)
    ↓
Standings / Qualification / Knockout Progression
    ↓
Champion
```

`tournament_fixtures.match_id` is the ONLY coupling point. Nothing in `domain/tournament/` imports
`domain/scoring/`; nothing in `domain/tournament/` re-derives a run rate, a wicket, an over, or a
winner from raw deliveries — every fact this layer consumes (`innings.runs`/`wickets`/`legal_balls`,
`matches.winner_team_id`/`result_type`) is read straight from the same cache columns the scoring
replay engine already writes. The one intentional exception — `nrr.js` importing
`allOutThreshold` from `domain/scoring/matchResult.js` — is a reuse of the one existing pure
definition, not a second one.

### 15.2 Database schema

`tournaments`, `tournament_teams`, `tournament_squad_players`, `tournament_fixtures` (schema.sql's
Phase 15 section has the full DDL + rationale comments). Deliberately does **not** include a
`tournament_standings` or `tournament_groups` table — audited first, per the spec's "don't blindly
create every table" instruction:

- **No `tournament_standings`**: points/NRR are cheap to compute fresh from `tournament_fixtures` +
  `matches` + `innings` on every read (a tournament has, at most, a few dozen fixtures) — the same
  "replay, never accumulate" principle career stats/leaderboards already use (README principle #1).
  A cache table would only add a staleness class of bug this design has zero need for.
- **No `tournament_groups`**: V1's group format is fixed at exactly two groups (`'A'`/`'B'`), so
  `group_name` is just a `CHAR(1)` column on `tournament_teams`/`tournament_fixtures`, not a registry
  table with nothing to register beyond two literal values.

`tournament_squad_players` mirrors `match_players`' documented historical-snapshot principle exactly
(schema.sql's Phase 3 comment): `UNIQUE(tournament_id, player_id)` — not
`(tournament_team_id, player_id)` — is what structurally guarantees a player can't represent two
different teams in the same tournament, and nothing here ever reads `players.team_id` to answer "who
did this player play for in this tournament" (Section 15.4).

`tournament_fixtures.round`/`bracket_slot` drive deterministic knockout pairing (slot *i* and *i+1*
feed the next round's slot ⌈*i*/2⌉) — no self-referencing "source fixture" FK needed anywhere.
`manual_result_winner_team_id`/`manual_result_by`/`manual_result_at` are the persisted, authorized
override for Section 15.9's tie/no-result policy.

### 15.3 Lifecycle

```
DRAFT → REGISTRATION → SCHEDULED → LIVE → COMPLETED
```

Server-enforced only (`tournament.service.js`/`tournamentFixture.service.js`), never a frontend
choice:

- `DRAFT → REGISTRATION`: staff calls `POST /open-registration`.
- `REGISTRATION → SCHEDULED`: staff calls `POST /fixtures/generate` — this is also the point
  registration/squad edits lock (`SQUAD_LOCKED` past this point).
- `SCHEDULED → LIVE`: automatic, the instant the FIRST fixture's linked match actually starts
  (`matchService.startMatch` → `tournamentFixture.service.js#onMatchStarted`, hooked from
  `match.controller.js`) — never merely because a date passed.
- `→ COMPLETED`: automatic for `GROUPS_KNOCKOUT`/`KNOCKOUT` the instant the FINAL fixture's match is
  finalized and resolved (Section 15.8); one explicit staff action (`POST /complete`) for `LEAGUE`,
  since a pure league has no single "final match" to hook into (Section 15.10).

Both lifecycle hooks in `match.controller.js` are wrapped in `.catch(console.error)` — a tournament-
progression failure can never fail the underlying match start/finalize HTTP response, and since
finalize is a one-way lock, progression can always be safely retried later if it ever does throw.

### 15.4 Team registration & historical squads

Tournament teams/squads always reference *existing* LOC teams/players — never a tournament-private
copy. Registering a team: `TEAM_ALREADY_REGISTERED` (409) on a duplicate, `TOURNAMENT_FULL` (409)
past `max_teams`, both DB-backed (`UNIQUE(tournament_id, team_id)`) as well as service-checked.

**Transfer safety (the critical property, Part 78 of the spec):** a tournament squad entry captures
`tournament_team_id` — a snapshot of which registered-team row a player belonged to — at add time. If
`players.team_id` changes later (a real transfer), nothing in this table changes, because nothing
here ever re-reads `players.team_id` to answer historical questions; `tournament.service.js#listSquad`
always joins through `tournament_squad_players.tournament_team_id`, never through the player's
current team. Verified directly by
`tests/integration/tournament.integration.test.js`'s "CRITICAL TRANSFER TEST".

### 15.5 Supported formats & fixture generation

`domain/tournament/fixtures.js` — pure, deterministic, unit-tested for 2/3/4/5/6 teams:

- **LEAGUE**: single round-robin via the standard "circle method" (`generateRoundRobinRounds`) — one
  team held fixed, the rest rotate each round. An odd team count is padded with a `null` BYE seat
  that never produces a real pair (Part 12's "odd-team bye behavior"), never randomness.
- **GROUPS_KNOCKOUT**: exactly two groups, even team count (min 4). If the organizer hasn't assigned
  `group_name` on every registered team, generation deterministically alternates by registration
  order (`teams[0]→A, teams[1]→B, teams[2]→A, ...`) and **persists** that assignment — never
  re-guessed per read. Round-robin runs independently within each group; SEMI_FINAL/FINAL fixtures
  are generated *later*, once the group stage resolves (Section 15.8), not upfront.
- **KNOCKOUT**: exact power-of-two sizes only — 2, 4, or 8 registered teams (`SUPPORTED_KNOCKOUT_SIZES`).
  Any other count is a `INVALID_TEAM_COUNT` validation error, never a silently-wrong bracket. First
  round uses standard "1 vs last" seeding (`generateKnockoutFirstRound`) to keep top seeds apart as
  long as possible.

**Idempotency**: `generateFixtures` locks the tournament row (`SELECT ... FOR UPDATE`) inside a
transaction, re-checks `status === 'REGISTRATION'`, and transitions to `SCHEDULED` in the same
transaction — a concurrent second call sees `SCHEDULED` and gets `FIXTURES_ALREADY_GENERATED` (409),
backstopped by `UNIQUE(tournament_id, fixture_number)` /
`UNIQUE(tournament_id, stage, bracket_slot)` at the database level. Verified with a real
`Promise.allSettled` concurrent-call integration test.

### 15.6 Match integration & format inheritance

`tournamentFixture.service.js#scheduleFixture` is the ONLY place a tournament fixture gets a real
match: it calls `matchService.createMatch` (completely unmodified) with `oversPerInnings`/
`ballsPerOver` copied from the tournament row — the frontend never supplies cricket rules for a
tournament match. From that point on, toss/roster/innings/scoring/corrections/finalize all go
through the existing, untouched match endpoints — `GET /matches/:id/summary` for a tournament match
returns the identical DTO shape as any other match, plus one additive field (`tournamentContext`,
Section 15.13).

### 15.7 Points policy

Centralized in `domain/tournament/points.js`, never duplicated: **WIN = 2, TIE = 1, NO_RESULT = 1,
LOSS = 0**. Not user-configurable in V1 (deliberate scope decision under the deadline-execution
directive). `NO_RESULT` is defined in the schema/domain but is never actually produced by the current
scoring engine (no rain-abandonment flow exists) — documented as a real limitation in
`docs/TECHNICAL_DEBT.md`, not a guess.

### 15.8 Net Run Rate — the non-negotiable formula

`domain/tournament/nrr.js`:

```
NRR = (runs scored / overs faced) − (runs conceded / overs bowled)
```

"Overs" is **never** a decimal parse of a displayed score (`18.4` ≠ `18.4` mathematically) — always
`legalBalls / ballsPerOver`, expressed as "runs per `ballsPerOver`-ball over" without the value ever
passing through a wrong decimal-overs number. `inningsBallsForNrr()` computes the legal-ball
denominator per innings from `innings.legal_balls`/`wickets` (the same replay-written cache columns
scoring.service.js maintains).

**All-out exception** (the standard tournament convention): if the batting side is bowled out before
facing its full allocated quota, BOTH that innings' terms — the batting side's "faced" balls *and*
the bowling side's "bowled" balls, for that same innings — are taken as the FULL allocated quota, not
the actual legal balls delivered. A successful chase in fewer overs gets **no** such adjustment — the
exception is specifically "bowled out early," never "finished early." `allOutThreshold()` is imported
from `domain/scoring/matchResult.js`, never redefined.

9 dedicated unit tests (`nrr.test.js`) cover: normal completed innings, the 18.4-overs proof, all-out
early (both sides of the same innings), a successful chase (no adjustment), batting-second
attribution, multi-match aggregation, a tied innings, and zero-matches (neutral `0`, never NaN).
`tournamentStandings.service.js`'s own integration test additionally cross-checks a REAL scored
match's NRR against an independent recomputation from the raw committed `innings` rows — never a
seeded/fabricated value.

### 15.9 Standings sorting & qualification

`domain/tournament/standings.js`: **Points DESC → NRR DESC → Wins DESC → team id ASC** (the
deterministic final tie-break; no head-to-head rule in V1). `tournamentStandings.service.js` computes
this fresh from `tournament_fixtures` + `matches` + `innings` scoped to whichever stage/group is
being asked about — `getTournamentStandings()` decides what "standings" even means per format:
`{overall}` for LEAGUE, `{groupA, groupB}` for GROUPS_KNOCKOUT, `null` for pure KNOCKOUT (the bracket
IS the standings, Part 44).

`domain/tournament/qualification.js#crossGroupSemiFinalPairing` implements the spec's exact worked
example — Group A/B's top two, seeded **A1 vs B2** and **B1 vs A2** — the only qualification rule V1
supports, centralized in one pure function.

### 15.10 Knockout progression & champion

`tournamentFixture.service.js#advanceTournament` is the single, idempotent orchestrator (locks the
tournament row, safe to call repeatedly):

1. **GROUPS_KNOCKOUT**: once every GROUP fixture is resolved (Section 15.11) and no SEMI_FINAL exists
   yet, computes both groups' standings and inserts the two semi-finals via the qualification
   pairing above.
2. **KNOCKOUT/GROUPS_KNOCKOUT**: once a round's fixtures are all resolved and the next round doesn't
   exist yet, `domain/tournament/fixtures.js#nextRoundSlotPairing` derives which two bracket slots
   feed the next round's slot — pure adjacent-slot arithmetic, reused identically for
   QUARTER_FINAL→SEMI_FINAL, SEMI_FINAL→FINAL, and GROUPS_KNOCKOUT's SEMI_FINAL→FINAL.
3. Once exactly one FINAL fixture exists and is resolved, `tournaments.champion_team_id` and
   `status = 'COMPLETED'` are set in the same transaction.

Champion for a pure **LEAGUE** tournament is standings position 1 (Section 15.9's tie-break),
assigned only by the explicit `POST /complete` staff action once every league fixture is finalized
(Part 37 — never merely because dates passed).

### 15.11 Tie / no-result — never a fabricated winner

`domain/tournament/progression.js#isFixtureResolved`: a finalized `TIE` or `NO_RESULT` (or a
still-live/completed-not-finalized match) is **never** resolved automatically — LOC has no
authoritative Super Over/tie-break engine, so no code path here ever invents a winner. Such a fixture
blocks its round's progression and is surfaced via `awaitingResolution: true`
(`tournament.controller.js#serializeFixture`) — the organizer dashboard's "Tie-Break Resolution
Required" panel. `POST /fixtures/:id/resolve` is the one honest way forward: a staff member records
who actually won (e.g. after a real, off-app Super Over bowled at the ground) via
`manual_result_winner_team_id` — explicit, authorized (staff-only), and persisted. Progression only
ever *reads* this override; it is never written by anything except that one staff-authorized action.

### 15.12 Correction/finalization safety

Standings/progression only ever read `matches.status = 'finalized'` results — and finalize is a
one-way lock (`match.service.js#finalizeMatch`'s existing comment: "no un-finalize path"; corrections
are rejected once finalized, `MATCH_LOCKED`). This makes "the bracket goes stale after a correction"
structurally impossible: a correction can only ever happen *before* finalization
(`recomputeMatchResultIfDecided` already keeps the *pre-finalize* `completed` result in sync), and
once finalized, the result — and therefore anything tournament progression derives from it — can
never change again. Verified directly: `tests/integration/tournament.integration.test.js`'s
"CORRECTION SAFETY" test scores a match, applies a real correction that flips the winner, finalizes,
and asserts standings reflect the corrected (not the original) result.

### 15.13 Cross-navigation & statistics

`matchSummary.service.js` gained one additive field — `tournamentContext` (`null` for the vast
majority of matches; `{publicTournamentId, name, stage, groupName, round}` for a tournament-linked
one) — a plain lookup via `tournament.repository.js#findFixtureByMatchId`, never touching
scoring/replay. The public Match Summary page shows a small badge linking back to the tournament only
when this is non-null (Part 55 — "never clutters a non-tournament match").

`tournamentStats.service.js` reuses the EXACT SAME replay-derived batting/bowling domain functions
(`extractBattingPerformance`/`extractBowlingPerformance`/`aggregateBatting`/`aggregateBowling`)
career stats/leaderboards already trust — scoped to this tournament's finalized fixtures only, with
each innings replayed via `scoringService.getInningsState` exactly ONCE regardless of how many
players appeared in it (a shared per-innings cache, avoiding the N+1 replay Part 67 warns against).

### 15.14 Ground booking interaction

No booking code was touched. `groundBooking.repository.js#listMatchDatesInRange` already blocks a
whole calendar day for any match with `status IN ('upcoming', 'live')` — a tournament fixture's
scheduled match is a completely ordinary row in `matches`, so it automatically participates in the
existing Phase 14 whole-day blocking policy with zero additional code (Section 14.2).

### 15.15 Privacy & authorization

Public tournament endpoints (`tournament.controller.js`'s serializers) never select
`email`/`password_hash`/`user_id` — verified directly by a repository-level integration test that
inspects every returned row's keys. All mutating endpoints require `requireAuth` +
`requireRole('staff')` (the exact same middleware every other staff-only feature in this app already
uses — no new authorization mechanism introduced).

## 16. AI Match/Player/Team Insight (Phase 16)

### 16.1 The one non-negotiable rule

```
PostgreSQL (authoritative cricket truth)
        ↓
Existing, UNMODIFIED services (matchSummary.service.js / statistics.service.js / publicTeam.service.js)
        ↓
domain/ai — pure, bounded context builders (buildMatchAIContext.js / buildPlayerAIContext.js / buildTeamAIContext.js)
        ↓
ai/aiProvider.js — the ONE abstraction application code depends on
        ↓
ai/providers/anthropicProvider.js — the ONLY file that imports the Anthropic SDK
        ↓
Structured JSON response
        ↓
domain/ai/validateStructuredOutput.js — schema validation + post-processing (candidateId/playerId
cross-checked against the supplied context, never trusted blindly)
        ↓
MongoDB `AiInsight` cache (generated narrative only — never cricket truth)
        ↓
GET /matches/:id/ai-insight, /players/:id/ai-insight, /teams/:id/ai-insight
```

AI is never on the write path of anything cricket-authoritative. `aiInsight.service.js` (the one
place all of this is orchestrated) never issues an `UPDATE`/`INSERT` against any PostgreSQL table —
its only write, ever, is an upsert into the MongoDB `AiInsight` cache document. Verified directly by
an integration test (`RESULT TRUTH TEST`) that feeds a fake provider a response contradicting the
real match result and confirms `matches`/`innings` are byte-for-byte unchanged afterward.

### 16.2 Provider abstraction

`ai/aiProvider.js` exports one function, `generateStructuredInsight({systemPrompt, factsPayload,
taskInstruction, schema, maxTokens})`, and `isAIConfigured()`. Every service call goes through this
— never a vendor SDK import outside `ai/providers/`. Swapping providers later means adding a new
file under `providers/` and changing one `if` branch here, never touching a controller, a service,
or the React client. Mirrors the exact "optional dependency, degrade gracefully" shape
`googleCalendar.service.js` (Phase 14) already established: `isAIConfigured()` ↔
`isCalendarConfigured()`, both gate every call, neither ever throws past their own boundary.

### 16.3 Provider selection

Audited first (Part 1 of the spec): no AI/LLM code, no AI SDK dependency, and no `AI_*`/OpenAI/
Gemini/Anthropic env vars existed anywhere in the repository before this phase. One provider was
implemented — **Anthropic (`@anthropic-ai/sdk`)** — the environment this project already runs
inside, with no second paid API required. Default model is `claude-sonnet-5` (env-overridable via
`AI_MODEL`): this is short, bounded, template-shaped narrative generation from an already-computed
fact set — not open-ended reasoning or agentic work — so the cost/latency profile of a mid-tier
model was chosen deliberately over the largest available one, consistent with the deadline
execution mode's "simple, bounded, production-safe" directive. Structured outputs
(`output_config.format` with a JSON Schema) constrain the model's response shape server-side;
`domain/ai/validateStructuredOutput.js` independently re-validates the parsed result regardless
(Part 47 — "never trust provider JSON blindly").

### 16.4 Environment configuration

`AI_PROVIDER` (currently only `'anthropic'`), `AI_API_KEY`, `AI_MODEL` — see `server/.env.example`.
Names only, values are secrets and never logged/exposed; never a `VITE_`-prefixed variable, so the
key can never reach the React bundle. With `AI_API_KEY` unset, `isAIConfigured()` returns `false`,
every AI endpoint returns `{available:false, reason:'NOT_CONFIGURED'}`, and the server boots exactly
as it does today — verified directly (`NOT_CONFIGURED` integration test, and this environment's own
real backend smoke test, which genuinely has no key configured).

### 16.5 Database / persistence

No new PostgreSQL tables. One new MongoDB collection, `AiInsight` (`models/aiInsight.model.js`):
`sourceType` (`MATCH`/`PLAYER`/`TEAM`), `sourceId`, `sourceFingerprint`, `provider`, `model`,
`payload` (the validated structured insight), `generatedAt` — unique on `(sourceType, sourceId)`.
MongoDB is the right home for exactly the reason the Phase 15/16 spec calls out: this is
generated/unstructured narrative content, not a second source of cricket truth (README principle
#4/#9) — deleting the whole collection loses nothing authoritative, unlike any PostgreSQL table in
this app. Consistent with MongoDB's existing "optional, canteen-only until now" role: with Mongo
unreachable, `aiInsight.service.js` simply skips caching (calls the provider fresh every time,
verified via the `NOT_CONFIGURED` test's environment, where Mongo was also unreachable throughout
this session) rather than failing.

### 16.6 Match AI context

`domain/ai/buildMatchAIContext.js` — pure, zero I/O. Input is the SAME public Match Summary DTO
(`matchSummary.service.js#getMatchSummary`, completely unmodified) plus the match's Phase 12
commentary rows. Bounds: top 3 batters/bowlers per innings by runs/wickets, at most 15 candidate key
moments. Nothing here re-derives a score, wicket, or result — every number is read straight off the
already-replay-derived summary DTO.

### 16.7 AI Match Summary & key moments

**Key moments are never invented by the model.** Candidates come from the EXISTING deterministic
Phase 12 commentary projection (`commentary_entries`), filtered to `WICKET`/`MILESTONE` rows and
`FOUR`/`SIX`-tagged deliveries — reusing a real, already-tested cricket-evidence source rather than
building a second one. Each candidate gets an application-assigned `candidateId` (`"km-1"`,
`"km-2"`, ...); the schema only ever asks the model to reference a `candidateId` and write an
`explanation` — it can never fabricate a `deliveryId`. After validation,
`aiInsight.service.js#postProcessMatchInsight` maps the model's chosen `candidateId`s back to their
real `deliveryId`/`type`/`label` via a server-side lookup, and silently drops any `candidateId` the
model referenced that isn't actually in the supplied candidate list (Part 11/48 — "prefer
deterministic application code to attach IDs after AI selection"). `standoutPerformers` are
filtered the same way against `FACTS.allowedPlayerIds`.

### 16.8 Player / Team AI context

`domain/ai/buildPlayerAIContext.js` / `buildTeamAIContext.js` — pure projections of
`statistics.service.js#getPlayerCareerStats` and `publicTeam.service.js#getPublicTeamProfile`
(both unmodified, both already finalized-only per Phase 7's rule). No ratings, predictions, or
personality judgments are ever *possible* to produce — the boundary is structural (those fields
never exist in the context or the schema), not something the model is merely asked not to do.

### 16.9 Structured output & validation

Two schemas (`ai/schemas/`): `MATCH_INSIGHT_SCHEMA` (`headline`, `summary`, `keyMoments[]`,
`standoutPerformers[]`) and `PERSON_INSIGHT_SCHEMA` (`headline`, `summary`, `highlights[]`, shared by
player and team — structurally identical shapes). `domain/ai/validateStructuredOutput.js` is a
small, hand-rolled JSON-Schema subset (type/required/properties/items/min-maxItems/maxLength/
enum/additionalProperties) — no schema library exists anywhere in this repo's dependencies, and
these three schemas don't justify adding one. Malformed/out-of-schema output is rejected wholesale
(`INVALID_OUTPUT`), never partially trusted.

### 16.10 Hallucination guardrails

1. Bounded, pre-computed context (never raw DB rows, never unlimited history).
2. Structured output, schema-validated both server-side (`output_config.format`) and independently,
   defensively, in this codebase.
3. Key-moment/player references are cross-checked against the exact candidate set supplied — a
   reference to anything else is silently dropped, never trusted.
4. AI cannot override or restate a different result than `matches.winner_team_id`/`result_type` as
   truth anywhere the UI treats as authoritative — the AI's prose is always rendered in a visually
   distinct, clearly-labeled card, never merged into the deterministic scorecard.
5. AI never writes to PostgreSQL — structurally impossible, not merely avoided (§16.1).
6. Bounded output (`maxLength`/`maxItems` on every field) and a bounded 30-second request timeout
   (`ai/providers/anthropicProvider.js`).

### 16.11 Privacy

Context builders only ever read already-public DTOs (the same ones the page itself renders) — no
email/phone/password/token/booking/canteen field is ever selected into a context object, verified
directly by an integration test that inspects the EXACT payload sent to the (fake) provider.

### 16.12 Prompt-injection resilience

`domain/ai/buildPromptPayload.js#buildUserContent` has exactly one templated slot: `JSON.stringify`
of the context object, always followed by the fixed task instruction. A hostile string embedded in
a team/player name (e.g. `"Ignore previous instructions..."`) can only ever land inside that
JSON-serialized value — it structurally cannot alter the system prompt, inject a second top-level
JSON object, or merge into the task instruction. Verified by a unit test constructing exactly this
adversarial input. **What this does NOT prove**: whether a live model actually resists following
such text once it reaches it — that requires a real API call this environment has no credentials
for (see `docs/TECHNICAL_DEBT.md`). The system prompt (`ai/prompts/systemPrompts.js`) additionally
instructs the model explicitly to treat the FACTS block as inert data, never instructions.

### 16.13 Caching & source fingerprinting

`domain/ai/computeSourceFingerprint.js` — a deterministic SHA-256 hash of a small, explicit "what
would make this insight stale" fact set. For a match, that's `matchId`/`status`/`resultType`/
`winnerTeamId` plus **every innings' `version` number** — the exact optimistic-concurrency counter
every scoring correction already bumps (schema.sql's Phase 3 comment), so ANY correction
invalidates the cached insight, even one that happens to leave final totals unchanged (e.g.
correcting who took a catch). For a player/team, the fingerprint is the aggregated career/record
object itself — since `getPlayerCareerStats`/`getPublicTeamProfile` already fully re-derive from
current authoritative data on every call, hashing their own output is sufficient and simpler.

`aiInsight.service.js#getOrGenerate`: on each request, compute the current fingerprint, compare
against the cached document's `sourceFingerprint`. A match → regenerate; a match → serve the cached
payload with `cached: true`, never calling the provider again. **A stale cached document is never
served** — a mismatch always regenerates before returning.

### 16.14 Correction invalidation — the mandatory test

Real corrections can only ever apply to a `completed` (not yet `finalized`) match — finalize is a
documented one-way lock (`match.service.js`), so a genuinely finalized match's underlying rows can
never be touched by a correction again. Two integration tests cover this honestly:

- **`REAL CORRECTION, PRE-FINALIZE`** — the real, legitimate flow: score a match, apply a real
  correction via `correctionService.applyCorrection` while still `completed`, finalize, then
  generate the insight. Asserts the context sent to the (fake) provider reflects the CORRECTED
  result (winner/margin), never the pre-correction one.
- **`CRITICAL CORRECTION TEST`** — directly exercises the fingerprint/staleness MECHANISM: generate
  and cache an insight for a finalized match, then bump `innings.version` (the same counter a real
  correction always bumps) to simulate the only kind of state change that could ever reach an
  already-finalized match's rows, and verify the next request detects the mismatch, regenerates
  (never serves the stale cached payload), and persists a new fingerprint.

Together these prove the fingerprint mechanism is correct (test 2) and that it's fed by data that
genuinely reflects reality end-to-end through the real correction pipeline (test 1) — without
faking a scenario ("correct an already-finalized match") the app's own rules make impossible.

### 16.15 Failure / timeout behavior

Every failure mode — unconfigured, provider timeout/network/5xx, safety refusal, malformed/
out-of-schema JSON — is caught inside `aiInsight.service.js#getOrGenerate` and turned into
`{available:false, reason}`. Nothing ever propagates as a thrown error the controller has to turn
into a 500; a `GET .../ai-insight` request is always HTTP 200. Verified directly (`PROVIDER FAILURE`
integration test: a fake provider that throws, confirmed the underlying Match Summary read stays
fully usable) and structurally true in this environment throughout the whole phase (no `AI_API_KEY`
was ever configured here, and the server booted and served every page normally the entire time).
Requests are bounded to a 30-second timeout (`ai/providers/anthropicProvider.js`); no custom retry
logic was added (the SDK's own small default retry is sufficient — Part 27's "avoid aggressive
retries").

### 16.16 Concurrent generation

An in-process `Map` in `aiInsight.service.js` de-dupes concurrent requests for the same
`sourceType:sourceId` to a single in-flight provider call — N spectators opening the same finalized
Match Summary at once trigger exactly one generation, not N (verified with a real
`Promise.all` concurrent-request integration test). Deliberately not Redis (explicitly out of scope
for this phase) — a single Node process is this app's actual current scale, the same assumption
every other in-memory cache in this codebase already makes.

### 16.17 Frontend integration

One shared component, `components/ai/AIInsightSection.jsx`, mounted independently (its own
`useAIInsight` hook, its own loading/error/unavailable state) on Match Summary, Player Profile, and
Team Profile — never blocking the page's primary, deterministic content, which always renders
first. Clearly labeled "✨ AI Match/Performance/Team Insight" in a visually distinct card; every
unavailable state (`NOT_CONFIGURED`/`INSUFFICIENT_DATA`/`PROVIDER_ERROR`/...) fails soft to a plain
sentence, never an error banner. Live/upcoming matches simply show `INSUFFICIENT_DATA` — no fake
analysis is ever generated for a match that hasn't been finalized (Part 39), and no commentary
architecture (Phase 12, still fully deterministic, still the only thing driving the live spectator
feed) was touched.

## 17. Advanced Cricket Analytics (Phase 17)

### 17.1 The one non-negotiable rule

```
PostgreSQL (authoritative cricket truth: matches, innings, deliveries, wickets — all UNCHANGED)
        ↓
Existing, UNMODIFIED services/domain (statistics.service.js / publicTeam.service.js /
matchSummary.service.js / tournamentStats.service.js / scoring.service.js#getInningsState /
domain/scoring/selectors.js / domain/scoring/matchResult.js)
        ↓
domain/analytics — pure, dependency-free derivation functions (never a second replay/scoring rule)
        ↓
repositories/analytics.repository.js — a handful of cheap, batch SQL aggregates over the SAME
innings-table replay-written cache columns scoring.service.js already trusts (no new replay for
most metrics)
        ↓
services/{player,team,match,tournament,comparison}Analytics.service.js
        ↓
Public GET APIs (routes/analytics.routes.js, mounted onto existing /players, /teams, /matches,
/tournaments prefixes)
        ↓
New Analytics tabs/sections + /players/compare + /teams/compare
```

This phase is explicitly NOT AI (Part 84 — Phase 16's AI Insight continues to consume the same
existing statistics it always has; nothing here makes AI mandatory, and AI being unconfigured has
zero effect on any analytics endpoint). Every number is mathematically reproducible from
PostgreSQL — no LLM, no fuzzy inference, no invented metric.

### 17.2 Audit-first: what already existed, what's genuinely new

Audited before writing any code (grep sweep across both `server/` and `client/` for
`analytics|trend|comparison|runRate|dotBall|boundary|powerplay|phase|headToHead|partnership`):
already-correct primitives were found and reused verbatim, never reimplemented —
`domain/scoring/selectors.js#calculateRunRate/calculateRequiredRunRate/formatOvers` (the one legal-
ball-based run-rate formula), `domain/scoring/replay.js`'s enriched `state.deliveries` array
(`over`, `batRuns`, `illegal`, `wicket`, `isLegalDelivery`, `totalRuns` — everything phase/dot-ball/
progression analytics need), `state.bowlers[id].dots` (already computed by the replay engine's
`updateBowler`, just never previously exposed past `bowlingStats.js`), `domain/statistics/
battingStats.js`/`bowlingStats.js` (`extractBattingPerformance`/`aggregateBatting`/etc.),
`domain/team/teamRecord.js`/`teamTopPerformers.js`, and `matchSummary.service.js`'s already-built
`partnerships`/`fallOfWickets`/`overs` arrays. No chart library exists anywhere in this repo
(`client/package.json` audited in full) — see §17.16.

Genuinely new: boundary-runs-percentage, dot-ball-percentage (batting side — the bowling side's
dot count already existed, just unexposed), the three-phase Opening/Middle/Closing split, batting
consistency (mean/median/threshold counts), score/run-rate progression reshaped for a chart,
dismissal-type breakdown, batting-first-vs-chasing, team run-rate trend, and player/team comparison
— none of these existed in any form before this phase.

### 17.3 Official data eligibility

Identical to Phase 7/10's rule, reused without modification: `matches.status = 'finalized'` only.
`'completed'` (result decided, still correctable) is explicitly excluded everywhere — confirmed via
`statistics.repository.js`'s existing `WHERE m.status = 'finalized'` clauses, reused as-is by every
Phase 17 repository/service function. Match Analytics (a single match's own page) is the one
deliberate exception: it renders for any match with at least one innings (including still-`live`),
mirroring Match Summary's own live tolerance — the frontend only exposes the Analytics tab once a
match has real deliveries, and no career/team-aggregate number is ever affected by a non-finalized
match.

### 17.4 Domain layer (`domain/analytics/`)

Ten pure, zero-I/O files, each with 100% unit coverage (39 tests): `matchPhases.js` (phase
boundary computation), `phaseMetrics.js` (per-phase runs/wickets/legalBalls/fours/sixes/dotBalls,
reconciling exactly with the innings total — Part 56), `inningsProgression.js` (over-by-over
cumulative score + run rate + required run rate), `scoreComparison.js` (two-innings worm-chart
reshape), `battingAnalytics.js` (boundary %, batting dot count/%), `bowlingAnalytics.js` (bowling
dot %), `consistency.js` (mean/median/threshold counts — deliberately no composite rating, Part 14),
`dismissalBreakdown.js` (authoritative-dismissal-type grouping), `teamSplitAnalytics.js`
(batting-first vs. chasing), `teamAverages.js` (mean innings score), `headToHead.js` (team vs. team
record). Every function takes already-fetched data in, returns a plain DTO out — no `pg`/`fetch`
import anywhere in this directory, exactly like every existing `domain/` file in this codebase.

### 17.5 Legal-ball math, never decimal overs

Non-negotiable, and never re-derived: every run-rate/required-run-rate number in this phase calls
`domain/scoring/selectors.js#calculateRunRate`/`calculateRequiredRunRate` directly — the exact same
functions Match Summary and the live scorer already trust — never a second formula, never a parse
of a displayed "18.4" string. `inningsProgression.js`'s doc comment states this explicitly. Format
awareness (`ballsPerOver` never hard-coded to 6) is threaded through every function signature,
mirroring the established convention from `bowlingStats.js`'s `equivalentOvers`.

### 17.6 Match phases — deliberately NOT hard-coded Powerplay/Death overs

`selectors.js#getMatchPhase` already exists and is used for the LIVE scoring UI's phase label
(`'Powerplay'`/`'Middle Overs'`/`'Death Overs'`, hard-coded to a T20-style "first 6 / last 5"
convention) — left completely untouched, since it's a reasonable heuristic for that specific
in-play UX. Phase 17's analytics feature deliberately does NOT reuse it: the brief itself warns
against "blindly hard-coding T20 phase boundaries for every match" (LOC supports arbitrary
overs-per-innings club matches, not just 20-over games). `domain/analytics/matchPhases.js` instead
computes a generic, deterministic, proportional three-way split — Opening/Middle/Closing, each
roughly a third of the innings (`third = round(oversPerInnings / 3)`) — named generically so
nothing here claims an official Powerplay/Death-overs rule LOC does not actually store. Matches
with fewer than 3 overs per innings, or no overs limit at all (`oversPerInnings === null` — LOC
supports unlimited-overs matches), return `null`: phase analytics is simply "not available" for
that innings, never a guessed fallback split. Verified by a unit test that every over from 1 to
`oversPerInnings` lands in exactly one phase for a range of match lengths (3–50 overs) — no gaps,
no double-counting.

### 17.7 Player Analytics

`services/playerAnalytics.service.js` — recent form/batting trend/bowling trend are a thin,
chart-ready reshaping of `statistics.service.js#getPlayerCareerStats`'s `matchHistory.items`
(Phase 7, completely unmodified) — zero new career derivation. Only the genuinely new metrics do
their own bounded work: dot-ball analysis replays exactly the *recent-N* matches being requested
(never the player's whole career) via `scoring.service.js#getInningsState` — the same trusted
function Phase 7 itself uses — reading `state.bowlers[id].dots` directly (an already-computed
field, zero new bowling math) and `domain/analytics/battingAnalytics.js#countBattingDots` against
`state.deliveries` for the batting side. Dismissal breakdown queries `wickets.dismissal_type`
directly (career-wide, cheap SQL, no replay — §17.4/17.11). Tournament breakdown (optional
`?tournamentId=`) scopes the same `extractBattingPerformance`/`aggregateBattting` primitives to
just that tournament's finalized matches for this player, via `tournamentRepo.
listFinalizedTournamentParticipation` (Phase 15, unmodified).

### 17.8 Boundary and dot-ball definitions (exact formulas)

- **`boundaryRunsPercentage`** = `(fours×4 + sixes×6) / totalRuns × 100` — `null` (not `0`) when
  `totalRuns === 0`, since 0/0 is undefined, not "0% boundary reliance."
- **Batting dot ball** = a delivery this player faced, using the EXACT "ball faced" convention
  `replay.js#updateBatsman` already uses (a wide never counts as faced, a no-ball does), on which
  `batRuns === 0`. A bye/leg-bye scored on an otherwise-dot ball still counts as a batting dot — the
  batter didn't score off their own shot, the standard cricket convention.
- **Bowling dot ball** — the count itself is never recomputed; `state.bowlers[id].dots` (from
  `replay.js#updateBowler`, predicate `totalRuns === 0 && !wicket`) is read directly. Both
  percentages return `null` for zero balls faced/bowled (never `NaN`/`Infinity`), matching
  `battingStrikeRate`/`bowlingEconomy`'s existing null-for-zero convention.

### 17.9 Team Analytics

`services/teamAnalytics.service.js` — `analytics.repository.js#listTeamInningsForFinalizedMatches`
is ONE query returning both innings' cache columns (`innings.runs`/`.wickets`/`.legal_balls` — the
same replay-written columns `scoring.service.js` already trusts as authoritative post-finalization)
per finalized match this team played, joined to `matches` for opponent/result — no replay call
needed for average score/conceded, batting-first-vs-chasing, or the run-rate trend; batting-first is
determined by the REAL `innings.innings_number === 1` row, never assumed from `team_a_id`/
`team_b_id` column order (Part 18). Top contributors reuses `publicTeam.service.js#
buildTopPerformers` directly (exported additively for this purpose — see §17.13) rather than a
second player-stat replay path. Tournament performance queries every tournament this team
registered in (`analytics.repository.js#listTournamentsForTeam`, a new query — `tournament_teams`
has no existing "by team" lookup) and reuses `tournamentStandings.service.js#
getTournamentStandings` (Phase 15, unmodified) for each one's standings row, plus `tournaments.
champion_team_id` for the champion flag.

### 17.10 Match Analytics

`services/matchAnalytics.service.js` reuses `matchSummary.service.js#getMatchSummary` (Phase 9,
unmodified) for partnerships (picking the highest via a trivial `reduce`, since no such picker
existed before) and makes its OWN bounded, single-match replay pass (`scoring.service.js#
getInningsState` — at most 2 calls, one per innings) for the score/run-rate progression and phase
breakdown, which need the raw delivery array Match Summary's own DTO doesn't expose. This is a
deliberate, bounded exception to "never replay twice" — a single match detail page paying for its
own innings' replay twice (once inside `getMatchSummary`, once here) is not the N+1-across-many-
matches problem §17.14 guards against; it's the same "replay fresh, never cache" cost every existing
Match Summary page load already pays. `available: false, reason: 'INSUFFICIENT_DATA'` (never an
error) before any innings exists, exactly mirroring Phase 16's AI Insight response shape.

### 17.11 Dismissal breakdown is honestly derivable

`wickets.dismissal_type` is a CHECK-constrained, 1:1-FK'd-to-`deliveries` authoritative column
(schema.sql) — `commentary_entries` is explicitly documented as "a projection of authoritative
cricket history, never a second truth" (Phase 12). Dismissal-breakdown analytics therefore reads
straight off `wickets`, never parses or infers from commentary text (Part 15's explicit
requirement).

### 17.12 Comparison — no composite winner, ever

`services/comparisonAnalytics.service.js#comparePlayers`/`compareTeams` return two side-by-side DTOs
built from existing, unmodified services (`statistics.service.js#getPlayerCareerStats`,
`team.repository.js#listFinalizedMatchesForTeam` + `domain/team/teamRecord.js#buildTeamRecord`) —
structurally, no field resembling a score/rating/winner exists anywhere in either response (Part
33). Comparing an id to itself is a `400`, not a silently-degenerate result. `compareTeams`'
`headToHead` uses each match's HISTORICAL `team_a_id`/`team_b_id` (a team's own identity is fixed at
match time and never changes — unlike a player, a team is never "transferred" — so this is
inherently transfer-safe with no extra bookkeeping needed, verified by an integration test that
transfers a player mid-test and confirms zero effect on the head-to-head record).

### 17.13 One additive export, zero behavior change

`services/publicTeam.service.js#buildTopPerformers` was changed from an internal (unexported)
function to an exported one — purely additive, no logic touched, every existing caller and test
unaffected — specifically so Team Analytics' "Top Contributors" section reuses it directly instead
of a second replay path (Part 23's explicit instruction).

### 17.14 Performance — batch SQL, bounded replay

Team/tournament aggregate metrics (averages, run-rate trend, batting-first split, tournament
scoring totals) read `innings`' own replay-written cache columns via a handful of batch SQL queries
(`repositories/analytics.repository.js`) — zero replay calls. Player/match analytics that genuinely
need ball-level detail (dot-balls, phase breakdown) replay only the specific bounded set of matches
being requested — recent-N for a player (clamped 1–20), one tournament's matches for a tournament
breakdown, one match's own (at most 2) innings for Match Analytics — never a full career or an
unbounded "everything" query. No new PostgreSQL index was added; none of the new queries showed a
measurable latency problem at this club's data scale during testing (Part 47 — "only add indexes
after measuring a real query problem").

### 17.15 Database changes

None. Zero new PostgreSQL tables, zero new columns, zero new Mongo collections. Every Phase 17
endpoint is a pure read over existing schema (Part 47's explicit "prefer zero schema changes").

### 17.16 Frontend: no chart library, hand-built SVG/CSS charts

`client/package.json` was audited in full before writing any frontend code — no chart library
(`recharts`/`chart.js`/`victory`/`d3`/etc.) exists anywhere in this repository, and the three simple
chart types this phase needs (a line/worm chart, a bar chart) don't justify adding one (Part 39).
`components/analytics/LineChart.jsx` is a small `viewBox`-based SVG line chart (scales to its
container at any width, never a fixed pixel size) with a native `<title>` per point for hover
tooltips, plus a visually-hidden (`sr-only`) plain-text summary of the same values for
non-hover/screen-reader access (Part 41/42). `BarChart.jsx` is plain HTML/CSS (flexbox bars with
always-visible text values, never a hover-only number) — deliberately not SVG, so every value is
readable without interaction. Both follow the same hand-built-SVG precedent this codebase already
established for the wagon wheel (`components/wagon-wheel/`).

**Bug found and fixed by the mobile/tablet E2E sweep**: `LineChart.jsx`'s original accessibility
fallback was a `<table className="sr-only">`. An HTML `<table>`'s default `table-layout: auto`
computes its own intrinsic content width from its cells regardless of an explicit `width` — Tailwind
`sr-only`'s `width: 1px` couldn't override this — and that oversized intrinsic width still
contributed to the page's scrollable area even though the table itself was visually clipped,
producing a real horizontal-scroll regression on Match Summary's new Analytics tab at 390×844 and
768×1024 (a 424px/54px overflow, respectively — caught by the mobile/tablet checks, not by
lint/build/unit/integration tests). Fixed by replacing the `<table>` with a single `sr-only` `<p>`
containing the same data as a plain joined text string — a text node has no such auto-sizing
behavior. Re-verified: 0px overflow at both breakpoints afterward.

### 17.17 Frontend integration

`hooks/useAnalytics.js` — a generic hook mirroring Phase 16's `useAIInsight.js` shape exactly
(independently loading, never blocking the page's primary content, the same `window.setTimeout(fn,
0)` deferred-load pattern required by this codebase's `react-hooks/set-state-in-effect` lint rule).
New `ANALYTICS` tabs on Player Profile and Match Summary, a new "Analytics" section on Team Profile
(always below the existing deterministic content, never replacing it — same rule Phase 16's AI
Insight already established), and an analytics summary block added to Tournament's existing
Statistics tab (not a new tab — Part 73's "enhance existing... rather than a disconnected
duplicate page"). `/players/compare` and `/teams/compare` are new pages with a debounced
name-search picker (reusing the existing `searchPlayers`/`fetchPublicTeams` public discovery
endpoints, never a second search backend — Part 71/72) and URL-state persistence (`?p1=&p2=`/
`?t1=&t2=`) so a shared/refreshed link keeps the same comparison. Both are linked from the Players/
Teams discovery pages via a "Compare" button.

## 18. Ground Operations & Management (Phase 18)

### 18.1 Mission and scope

This phase turns LOC from "a cricket scoring platform with a booking module bolted on" into a
complete operations system for **one physical ground** — at the time this phase was written, no
`ground_id` column existed anywhere, so every query implicitly meant "the one ground this deployment
manages."

**Update (Phase 2A audit, corrected in place):** this is no longer true and should not be read as
current architecture. Later phases (Phase 8 grounds/canteens, Phase 9 `ground_users` ground-scoped RBAC,
Phase 12 ground_id on ground_photos/amenities, Phase 21 matches.ground_id) built a real, active
multi-ground platform on top of this original single-ground design. See `docs/DATABASE.md` for the
current, accurate state. **Update 2 (Phase 24, corrected in place):** `ground_bookings` also gained a
`ground_id` column — the one remaining single-ground holdout described above no longer holds; see
`docs/BOOKING.md` for the full multi-ground booking/team/player conflict engine this enabled.
`advertisements`/`partners`/`gallery_images`/`ai_insights` remain deliberately global/ground-less by
design, not by oversight.

The mandate was explicit: reuse Phase 14's existing booking architecture, never redesign a working
module, never touch scoring or the tournament engine. Every decision below follows directly from
that constraint.

### 18.2 Audit-first: what already existed

Audited before writing any code: `ground_bookings` (Phase 14) already has a `tstzrange` `EXCLUDE`
constraint (`ground_bookings_no_overlap`) proving booking-vs-booking AND booking-vs-staff-block
mutual exclusion under real concurrent requests (`groundBooking.integration.test.js`'s CONCURRENCY
and STAFF BLOCK tests, unmodified and still passing); a pure `domain/booking/availability.js`
(`computeDayAvailability`) that already IS a small central availability engine, fed by
`groundBooking.service.js#buildOccupiedRanges`; a service-account Google Calendar integration
(`googleCalendar.service.js`) that syncs bookings/blocks post-commit, best-effort, never blocking;
a read-only occupancy link from `matches` into booking availability
(`groundBooking.repository.js#listMatchDatesInRange`) that already treats a friendly match and a
tournament fixture's linked match identically. No audit log, no notification system, no
report/utilization/dashboard/timeline surface, and no richer booking-status model existed anywhere.
Full findings in the session record; the design decisions below cite the exact precedent each one
reuses.

### 18.3 The central rule — one availability engine, reused, not rebuilt

```
PostgreSQL: ground_bookings (Phase 14, UNCHANGED table + EXCLUDE constraint)
  ├─ booking_type = 'CUSTOMER'    — a real reservation
  └─ booking_type = 'STAFF_BLOCK' — maintenance/private-event/rain/emergency/... (Phase 18: + block_type)
        ↓
PostgreSQL: matches (read-only — status IN ('upcoming','live') already blocks booking, Phase 14)
        ↓
domain/booking/availability.js#computeDayAvailability (Phase 14, UNCHANGED — the one slot-grid engine)
domain/booking/timeline.js#buildDailyTimeline (Phase 18 — the one daily-schedule reshaping)
domain/booking/utilization.js#computeUtilization (Phase 18 — the one utilization formula)
domain/booking/bookingStatus.js#deriveDisplayStatus (Phase 18 — the one status-display rule)
        ↓
groundBooking.service.js (Feature 1/2, extended) / groundTimeline.service.js / groundDashboard.service.js / groundReport.service.js
        ↓
GET /bookings/*, GET /ground/*
        ↓
Public homepage widget, Staff Ground Operations hub (Schedule/Timeline/Dashboard/History/Reports)
```

"Everything asks this service" (Feature 1) is satisfied structurally: bookings, blocks, and matches
all live in exactly two tables (`ground_bookings`, `matches`), and every new Phase 18 read
(timeline/dashboard/reports/utilization) is built by querying those same two tables through new,
additive repository functions — never a duplicated "is this slot occupied" computation, never a
cache table that could drift from the source of truth.

### 18.4 Ground Blocks are NOT a new table

The single most important architectural decision in this phase: Feature 3 asked for a richer,
named block/maintenance taxonomy (grass/pitch/electrical/rolling/watering/private-event/festival/
rain/emergency/other), but the existing `booking_type = 'STAFF_BLOCK'` row (Phase 14) already models
"this occupies the ground and isn't a customer booking" — sharing the exact same `EXCLUDE`
constraint, the exact same Google Calendar sync path, the exact same cancellation flow. Building a
second `ground_blocks` table would have meant building a SECOND concurrency mechanism (Postgres
`EXCLUDE` constraints can't span two tables) to keep two tables' occupancy mutually exclusive —
solving, badly, a problem the existing schema already solves for free. Instead, one nullable,
independently `CHECK`-constrained `block_type` column was added to `ground_bookings` (never required
for a `CUSTOMER` row):

```sql
ALTER TABLE ground_bookings ADD COLUMN IF NOT EXISTS block_type VARCHAR(30)
  CHECK (block_type IN (
    'GRASS_MAINTENANCE', 'PITCH_MAINTENANCE', 'CLEANING', 'ELECTRICAL_WORK', 'WATER_MAINTENANCE',
    'PITCH_ROLLING', 'PITCH_WATERING', 'PRIVATE_EVENT', 'FESTIVAL', 'RAIN', 'EMERGENCY', 'OTHER'
  ));
```

This is why Feature 2 (double-booking protection) required zero new code for blocks: a block IS a
`ground_bookings` row, so it inherits the EXCLUDE constraint's non-negotiable guarantee automatically.
`domain/booking/blockTypes.js` (`GROUND_BLOCK_TYPES`, `isValidBlockType`, `blockTypeLabel`) is the
one place the taxonomy is defined; `groundBooking.service.js#createBooking`/`createStaffBlock`
validate it before insert (an unknown type is a `400`, never silently stored). Omitting `blockType`
entirely still works exactly as it did before this phase — fully backward compatible.

### 18.5 Booking status — an honest, derived model (Feature 9)

Feature 9 asked for `Pending/Approved/Rejected/Cancelled/Completed/Expired`. LOC's actual booking
model (Phase 14, deliberate) has no manual approval step — every booking is either confirmed
immediately or rejected by the EXCLUDE constraint at INSERT time. Rather than bolt on a fake
approval workflow that would sit unused, `domain/booking/bookingStatus.js#deriveDisplayStatus`
honestly derives exactly the states that exist in this system:

- `CANCELLED` — the stored `status = 'CANCELLED'`.
- `COMPLETED` — stored `CONFIRMED`, but `end_time` has already passed (a read-time computation, never
  a separate stored state — nothing writes `COMPLETED` to the database).
- `APPROVED` — stored `CONFIRMED`, still upcoming. Auto-confirm **is** the approval in this system.

`PENDING`/`REJECTED`/`EXPIRED` never occur and are not displayed — documented here and in
`docs/TECHNICAL_DEBT.md` as an intentional scope decision, not an oversight. `isValidStatusTransition`
documents the one real transition (`CONFIRMED → CANCELLED`); `COMPLETED` is never a transition
target, only ever a derived read.

### 18.6 Double-booking protection (Feature 2)

Unchanged from Phase 14, and re-verified: the `ground_bookings_no_overlap` EXCLUDE constraint is
the actual, non-negotiable guarantee (`groundBooking.integration.test.js`'s CONCURRENCY test —
two genuinely simultaneous requests, `Promise.allSettled`, exactly one succeeds). Because blocks
share the table (§18.4), this guarantee now covers booking-vs-booking, booking-vs-block, AND
block-vs-block automatically, with zero new code. Re-proven for the real, running server (not just
`node:test`) during this phase's E2E pass: two genuinely simultaneous `POST /bookings` HTTP
requests for the same slot returned exactly one `201` and one `409 BOOKING_CONFLICT`.

### 18.7 Ground Timeline (Feature 8)

`domain/booking/timeline.js#buildDailyTimeline(entries, dayStart, dayEnd)` — pure, zero I/O. Takes
a flat list of `{startTime, endTime, type, label}` entries and returns an ordered, gap-free day
schedule, inserting `FREE` segments for every uncovered interval. `groundTimeline.service.js`
builds that entry list from exactly two existing repository reads: `listConfirmedInRange`
(bookings + blocks, already existed, now also selects `block_type`) and the new
`listMatchEntriesInRange` (matches joined to `teams`/`tournament_fixtures`/`tournaments` for a real
label like "LOC Strikers vs Riverside Warriors (Summer Cup)" instead of a bare flag). A match is
still rendered as one whole-operating-window segment — `matches.match_date` has no end time (Phase
9's documented reason, unchanged), so this only enriches the LABEL, never fabricates a narrower
time range the data doesn't actually support.

### 18.8 Staff Dashboard (Feature 7)

`groundDashboard.service.js#getStaffDashboard` — pure composition via `Promise.all` of already-
existing reads (today's timeline, today's confirmed bookings/blocks, today's matches, blocks in the
next 7 days, tournament-linked matches in the next 7 days). Zero new occupancy truth. `groundStatus`
is a derived label (`MATCH_DAY` > `PARTIALLY_BLOCKED` > `BOOKED` > `OPEN`, first match wins).
`pendingRequestsCount` is always `0`, reported honestly (§18.5 — there is no approval queue in this
system) rather than omitted or faked.

### 18.9 Booking History (Feature 10)

`groundBooking.repository.js#searchBookings` — one parameterized query (`ILIKE` on
customer_name/purpose, exact-match status/bookingType filters, a date range, `COUNT(*) OVER()` for
pagination in a single round trip — the same pattern `team.repository.js#listPublicTeams` already
established). `groundReport.service.js#searchBookingHistory` clamps limit/offset and attaches each
row's derived `displayStatus`. Staff-only (`GET /bookings/history`).

### 18.10 Deterministic Reports (Feature 11)

`groundReport.service.js#getBookingReport` — three new, cheap, indexed aggregate queries
(`countBookingsByStatus`, `countBookingsByDate` "busy days", `countBookingsByHour` "peak hours",
grouped in ground-local time via Postgres's own `AT TIME ZONE` — not JS timezone math, since the
existing `domain/booking/timezone.js` deliberately never depends on a tz-database library, and
Postgres's own tz support handles the SQL-side grouping correctly). No revenue analytics — this app
has no payment integration, so there is no revenue figure to report.

### 18.11 Ground Utilization (Feature 12) — exact formula

```
utilizedPercentage = (bookedHours + blockedHours + matchHours) / totalHours × 100
```

`totalHours` = (number of ground-local calendar days in range) × (`GROUND_CLOSING_HOUR` −
`GROUND_OPENING_HOUR`) — the ground's REAL daily operating window (Phase 14's existing policy
constants), never a fabricated 24-hour day. `bookedHours`/`blockedHours` are the real, summed
durations of `CONFIRMED` bookings/blocks (`SUM(EXTRACT(EPOCH FROM (end_time - start_time)))`) — safe
to sum without double-counting because the EXCLUDE constraint already guarantees they never overlap
each other, and the existing match-day pre-check (Phase 14) already guarantees neither can exist on
a day `matches` occupies. `matchHours` uses the same whole-operating-window convention as the
timeline (§18.7). `domain/booking/utilization.js#computeUtilization` is the one pure function that
turns these four numbers into percentages — `null` (not a `NaN`/`Infinity`) when `totalHours` is 0.

### 18.12 Tournament & Match Integration (Feature 13/14) — deliberately read-only

The phase brief explicitly forbade touching the tournament engine or the scoring architecture.
`tournamentFixture.service.js#scheduleFixture` calls the completely unmodified
`match.service.js#createMatch`, which is how a fixture's linked match already existed. That match's
`status IN ('upcoming','live')` has blocked ground bookings since Phase 14
(`listMatchDatesInRange`) — this is the "reservation" Feature 13 asks for, and it already existed;
Phase 18's contribution is exposing it PROPERLY everywhere staff actually look (§18.7's real
per-match timeline label, §18.8's dashboard "Today's Matches"/"Upcoming Tournament Fixtures"
sections, both driven by the new `listMatchEntriesInRange` join). "Deleting a fixture releases the
reservation" is true automatically and for free: once a fixture's match is no longer
`upcoming`/`live`, `listMatchDatesInRange`/`listMatchEntriesInRange` simply stop returning it — no
separate release step was ever needed. **Deliberately NOT implemented**: a write-side check that
would reject creating a match/fixture on top of an existing CONFIRMED booking. Adding that check
inside `match.service.js#createMatch` — the one function both plain matches and every tournament
fixture funnel through — was assessed as carrying real regression risk against the tournament
engine and match-creation code path the brief explicitly said not to touch (many existing tests
create matches at concurrent/overlapping real-world timestamps), for a scenario (staff scheduling a
match on top of their own already-confirmed ground booking) that is a self-inflicted staff error,
not a customer-facing double-booking risk. Documented honestly in `docs/TECHNICAL_DEBT.md` as a
known, deliberate boundary rather than silently left undone.

### 18.13 Google Calendar (Feature 4)

Fully reused, unmodified authentication/config (`googleCalendar.service.js`'s service-account JWT —
Feature 4 explicitly said not to build an OAuth UI if the existing integration already uses service
credentials, and it does). The only change: `groundBooking.service.js#createBooking`'s calendar
event summary now says "Ground Block: <reason>" instead of "Ground Booking — <name>" specifically
for `STAFF_BLOCK` rows, so the ground's real Google Calendar reads correctly at a glance. No new
sync function was needed — creation and cancellation already covered every Phase 18 occupancy type,
since blocks are `ground_bookings` rows (§18.4). Matches/tournament fixtures are deliberately NOT
synced to Google Calendar in this phase — they were never synced before Phase 18 either, and adding
that is a genuinely new capability outside "reuse existing architecture," not a gap this phase
introduced.

### 18.14 Smart Slot Recommendation (Feature 5)

Already existed (`domain/booking/recommendations.js#findNearbyAlternatives`, Phase 14) — every
`BOOKING_CONFLICT` response already includes up to `MAX_RECOMMENDATIONS` (5) genuinely-available
alternative slots, computed from the same `computeDayAvailability` the availability engine itself
uses (never fabricated). Reused unmodified for both customer bookings and staff blocks.

### 18.15 Public Availability (Feature 6)

`GET /bookings/availability` already existed and already returns exactly `AVAILABLE`/`UNAVAILABLE`
with no `reason` for an unauthenticated caller (Phase 14 Part 47). Phase 18's contribution is
surfacing it where a visitor can actually see it without navigating into the booking modal:
`components/booking/PublicAvailabilityPreview.jsx` on the homepage shows today's next few open
slots, calling the exact same public endpoint. `GET /ground/timeline` is also public (same posture),
for a staff-quality daily view without exposing any customer PII (names/phone/email are never part
of a timeline segment's `label` for a `BOOKING`-type entry beyond its purpose string).

### 18.16 Audit Log (Feature 16)

`ground_audit_log` mirrors `score_corrections`' proven shape (Phase 4): append-only,
`CREATED`/`CANCELLED`/`GOOGLE_SYNC` actions, full `previous_value`/`new_value` JSONB snapshots
(never a diff), actor attribution via `actor_user_id` (`ON DELETE SET NULL` — the trail survives
even if the actor's account is later deleted, matching `ground_bookings.user_id`'s own convention),
indexed for reverse-chronological reads per entity. Written from `groundBooking.service.js` at
every create/cancel, strictly after the triggering transaction has already committed — logging can
never cause a booking/cancellation to fail (`groundAuditLog.service.js#logEvent` catches and logs
its own failures rather than propagating them, the same "best-effort side effect" posture Google
Calendar sync already established in Phase 14).

### 18.17 Notifications (Feature 17)

In-app only — no email/SMS integration, exactly as scoped. `ground_notifications`: one row per
addressed notification, `is_read` tracked directly (no separate read-receipt table — a single
ground, modest booking volume). Created from the same two places as the audit log
(`groundBooking.service.js#createBooking`/`cancelBooking`), same best-effort posture. `BOOKING_
APPROVED` fires the moment a `CUSTOMER` booking confirms (§18.5 — auto-confirm is the approval);
`BOOKING_CANCELLED` fires on cancellation; a staff block never notifies anyone (no customer to
notify). `BOOKING_REJECTED` was deliberately not implemented as a notification type — there is no
rejection state to notify about (§18.5). `components/layout/NotificationBell.jsx` (previously a
hardcoded, non-functional stub — confirmed by audit before this phase) now reads real data via
`useNotifications.js`, with an unread-count badge and mark-read/mark-all-read actions.

### 18.18 Security (Feature 18)

Unchanged principle, re-affirmed: every new staff-only endpoint uses the exact same `requireAuth` +
`requireRole('staff')` middleware every other staff feature in this app already uses; every mutation
(`createBooking`/`createStaffBlock`/`cancelBooking`) re-validates server-side regardless of what the
client's own availability check showed — the EXCLUDE constraint is the final word, not a UI
convenience. `GET /ground/timeline` and `GET /bookings/availability` are the only intentionally
public reads, and both are structurally incapable of leaking customer PII (a timeline `BOOKING`
segment's label is the booking's `purpose` string, never `customerName`/`contactPhone`/
`contactEmail`).

### 18.19 Frontend

`StaffBookingPage.jsx` became a tabbed "Ground Operations" hub (Schedule / Timeline / Dashboard /
History / Reports), matching this codebase's existing tabbed-staff-dashboard convention (the
canteen `StaffDashboardPage`) rather than five separate routes. `TimelineView.jsx` renders the day
schedule as a proportional colored bar PLUS a readable list underneath (Part 41/42 — never
color-only). New hooks (`useGroundOps.js`, `useNotifications.js`) all follow this codebase's
established `window.setTimeout(load, 0)`-deferred-effect pattern. `NotificationBell.jsx` is wired to
real data; `PublicAvailabilityPreview.jsx` adds the homepage widget.

## 19. Production Hardening (Phase 19)

Mission: audit every subsystem for real production risk and close what's actually found — no new
user-facing features, no architecture rewrites, no new frameworks beyond what a specific, named
finding justified. Every change below traces back to something the audit actually observed (a
missing header, an unguarded param, a single 870KB chunk in the build's own warning output), not a
speculative "best practice" applied blind. See `docs/DEPLOYMENT.md` for the operational checklist
this phase produces, and `docs/TECHNICAL_DEBT.md` for what was found but deliberately left alone.

### 19.1 Security headers & CORS

`helmet()` is now the first middleware in `app.js`, ahead of `cors()` — standard headers (HSTS,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, a same-origin CSP) on every
response. `crossOriginResourcePolicy` is relaxed to `cross-origin` so the client (a different origin)
can still load images served from `/uploads`. CORS itself (`config/corsOrigins.js`) was already
correct and unchanged: `allowedOrigins` comes only from `CLIENT_ORIGIN`, and an unset/empty env var
produces an empty allow-list — fails closed, not open. Verified with a real request from a
disallowed origin (`productionHardening.integration.test.js`): no `Access-Control-Allow-Origin`
header comes back.

### 19.2 Rate limiting

New `middlewares/rateLimit.js` (`express-rate-limit`, in-memory store — correct for LOC's current
single-instance deployment; a multi-instance deployment would need a shared store, see
`docs/DEPLOYMENT.md`). Six named limiters, applied to exactly the endpoint classes the brief calls
out: `authLimiter` (login/signup — brute-force protection), `aiLimiter` (every AI insight read and
regenerate route — real per-call cost), `bookingWriteLimiter` (create booking/block, cancel),
`searchLimiter` (player/team public search+discover, no-login so the main abuse surface),
`commentaryLimiter` (generous — legitimate live-match polling must not be throttled, this blunts
scripted scraping only), `analyticsLimiter` (compare + per-resource analytics reads). Every limiter
logs a `warn` on trip (`logger.js`), not silently. `app.set('trust proxy', 1)` is gated behind
`TRUST_PROXY=1` (unset by default) — trusting `X-Forwarded-For` with no real proxy in front would let
a client spoof its own IP and bypass every limiter above for free.

### 19.3 Input validation

Audited every `:id`-shaped and pagination-shaped public parameter. Two real, reproducible gaps found
and fixed:
- Numeric route params (`teams.id`, `matches.id` — the internal serial ids, as opposed to the
  `public_*_id` strings used everywhere a resource is meant to be referenced externally) were passed
  straight into parameterized SQL with no shape check. A non-numeric value (`GET /teams/abc`) wasn't
  rejected until Postgres itself refused the cast — an unhandled 500, not a clean 400. New
  `middlewares/validateParams.js#requireIntParam(name)` (a regex shape check, not a lookup — "not
  found" for a well-formed but nonexistent id is still each route's own job) is now on every
  numeric-id route: `/teams/:id*`, `/matches/:id*`, and the Phase 16/17 routes mounted on the same
  ids (`ai-insight`, `analytics`).
- `tournament.service.js#listPublicTournaments`'s pagination clamp (`Math.max(1, Math.min(limit,
  50))`) silently propagated `NaN` when `limit`/`offset` were non-numeric, because `Math.min(NaN, x)`
  is `NaN`, not `x` — a malformed `?limit=abc` reached Postgres as `LIMIT NaN`. Fixed with an explicit
  `Number.isFinite` guard before the clamp (one line, matches the pattern already correct everywhere
  else in this codebase). Every other paginated public endpoint audited
  (`publicMatch.service.js#listPublicMatches`, `publicTeam.service.js#listPublicTeams`,
  `statistics.service.js#getLeaderboard`/`searchPlayers`, `groundReport.service.js
  #searchBookingHistory`, `canteenOrder.controller.js`) was already correctly clamped against
  negative/NaN/oversized values — verified line-by-line, not assumed.

### 19.4 Error handling — never leak internals

`middlewares/errorHandler.js` had one real gap: an error with no `.code` (domain-coded) and no
`.statusCode` (an intentional, vetted service throw) fell through to `res.status(err.statusCode ||
500).json({ message: err.message })` — meaning any genuinely unexpected error (a raw Postgres driver
error, a programming bug) sent its raw `.message` straight to the client. Now split three ways: (1)
domain-coded errors — unchanged, full structured shape; (2) an error that already carries an
intentional `.statusCode` (every deliberate `err.statusCode = 4xx` throw already used throughout the
services layer) — message passed through unchanged, since it was already vetted for the client; (3)
anything else — logged server-side in full (`message` + `stack`), client gets a bare `{"message":
"Internal Server Error"}`. Verified both via direct unit-style calls against `errorHandler` and a
real HTTP request (`GET /teams/abc/profile` before its `requireIntParam` guard would have hit exactly
this path). `config/db.js`'s `pool` now also has an `.on('error', ...)` listener — node-postgres
emits this when an idle pooled client is dropped by the backend, and an unhandled listener there is
an uncaught exception that kills the whole process; one flaky connection must never take the API
down. `server.js` adds `process.on('uncaughtException'|'unhandledRejection', ...)` — logs full detail,
then exits on an uncaught exception (a process manager's restart is safer than continuing in
whatever state caused it) rather than crashing silently or hanging.

### 19.5 Structured logging

New `utils/logger.js` — one JSON line per call (`{ts, level, message, meta}`) to stdout/stderr, no
dependency (pino/winston would be genuine overkill for this project's actual log volume; the brief's
own "do not introduce unnecessary frameworks" applies here). Replaces `console.log`/`console.error`
at every site the brief names by name: server startup/shutdown, Postgres/MongoDB connect
success/failure, the pool's idle-client error, AI provider failures (invalid JSON output, schema
mismatch, provider errors — previously silent, only ever surfaced as `{available:false}` to the
caller with nothing logged), Google Calendar create/cancel failures, booking conflicts (the
`23P01` exclusion-violation path — the actual concurrency guarantee firing), audit-log and
notification write failures, and every rate-limit trip. Never logs a password, token, or secret —
every call site above already only had a message string and identifying ids to hand it.

### 19.6 Configuration & secrets

Audited `.env.example` against every `process.env.*` read in the codebase — complete, no drift.
Verified `.env`/`client/.env` are gitignored and were never committed (`git log` has no history for
either path); `client/.env.production` IS tracked, correctly — it holds only the public
`VITE_API_URL`/`VITE_SOCKET_URL` build-time values, which end up in the shipped bundle regardless, so
there's nothing to protect by hiding them. No hardcoded credential literal found anywhere in
`server/src` or `client/src` (grepped for common key/token shapes). Added `TRUST_PROXY` (§19.2) and
`NODE_ENV=production` to `.env.example`. The pre-existing `JWT_SECRET` production guard
(`utils/jwt.js` — refuses to boot with the known dev fallback secret when `NODE_ENV=production`) was
already correct and predates this phase; re-verified, unchanged.

### 19.7 Database

Indexes audited against every hot lookup path: `users.email`, `players.public_player_id`,
`ground_bookings.public_booking_id`, `tournaments.public_tournament_id` are all `UNIQUE` (Postgres
backs every `UNIQUE` constraint with an index automatically) — no missing index found on any
externally-looked-up column. No speculative index added — the brief says "only add indexes if
measured," and nothing in this audit measured a slow query. Transaction safety re-verified: every
multi-statement write already goes through `client.connect()` / `BEGIN` / `COMMIT` /
`ROLLBACK`-on-catch / `client.release()`-in-`finally` (the booking service's pattern, unchanged) —
the one new addition is the pool-level `.on('error', ...)` listener in §19.4. MongoDB is unchanged:
still fully optional, `isMongoReady()` gates every call site, `connectMongo()` degrades to a warning
log rather than a boot failure.

### 19.8 Performance — bundle size (measured, not speculative)

The production build's OWN output flagged this: one 870KB JS chunk, over Vite's 500KB warning
threshold, because `AppRoutes.jsx` eagerly imported every page component regardless of which single
route a visitor actually landed on. Converted every route (except the tiny structural `Layout`,
`RequireAuth`, `CanteenEntryRedirect`) to `React.lazy(() => import(...))` behind a shared `<Suspense>`
fallback (`RouteFallback` — a small centered spinner, styled consistently with this app's existing
`role="status"` loading convention). Purely a build-time/network-time change — no component's own
logic touched. Re-measured after: the largest remaining chunk is 300KB (95KB gzipped), every other
page is its own small chunk fetched only when visited, and the build's size warning is gone.
Verified live (not just via the build log) with a Playwright pass over 7 routes — zero console
errors, no page stuck on the Suspense fallback.

### 19.9 Caching

Two caches exist, both audited, neither changed: `utils/cache.js` (a simple in-memory TTL map, used
for the external CricAPI India-match lookup — single-instance-correct, same caveat as the rate
limiter's store) and the AI insight Mongo cache (`AiInsight` model). The AI cache was already
correction-safe by design before this phase:
`domain/ai/computeSourceFingerprint.js` keys the cached insight on a hash of the exact authoritative
facts (including `innings.version`, the existing optimistic-concurrency counter every scoring
correction already bumps), so a correction that changes the underlying match state — even one that
happens not to change final totals — can never silently serve a stale insight. Re-verified this
reasoning against the current code; no change needed.

### 19.10 Frontend hardening

Two real gaps found and fixed: (1) no catch-all route — `AppRoutes.jsx` had no `path: '*'`, so an
unmatched URL (stale bookmark, typo, dead link) rendered nothing inside `Layout`'s `<Outlet/>`, a
blank page with no way back. New `pages/not-found/NotFoundPage.jsx` + a `path: '*'` route fixes this.
(2) no `errorElement` — an uncaught render/loader error on any route fell through to React Router's
own unstyled default error screen. New `routes/RouteErrorBoundary.jsx` (reload + back-to-home
actions, dev-only error detail) is now the root route's `errorElement`. Every existing page's own
loading/error/empty states (`StatsErrorState` and the per-page skeleton/empty-state components) were
already present and consistent across the app — audited, not touched.

### 19.11 Dependency audit

`npm audit` on the server: 0 vulnerabilities. On the client: one HIGH-severity advisory
(`GHSA-qwww-vcr4-c8h2`, "React Router RSC Mode CSRF Bypass") affecting the installed
`react-router-dom@7.18.2`. Investigated rather than blindly patched: the vulnerability is specific to
React Router's RSC/server-actions mode; LOC is a plain Vite SPA using `createBrowserRouter` with zero
RSC or server actions, so this vulnerability class doesn't apply to how this app actually uses the
library. The only available fix is patched in `>=8.3.0` (a major-version jump) or a breaking
downgrade to `7.11.0` (`npm audit fix --force`'s own suggestion, flagged `isSemVerMajor`) — both carry
real regression risk this phase's own "do not introduce unnecessary frameworks / rewrites" mandate
argues against gambling on unbudgeted. Documented in `docs/TECHNICAL_DEBT.md` as a tracked,
assessed-low-risk item for a dedicated future upgrade with its own regression pass, not silently
absorbed here. No unused/deprecated dependency found in either `package.json` — both are lean, and
every declared package is imported somewhere.

### 19.12 Tests & load testing

10 new integration tests (`productionHardening.integration.test.js`): errorHandler sanitization
(direct calls, both the "leaks nothing" and "passes through intentional messages unchanged" cases),
a malformed numeric param over real HTTP, the 404 shape, malformed-pagination degradation, security
headers present on a real response, CORS fail-closed for a disallowed origin, an unauthenticated
staff-only request, and the auth rate limiter actually tripping at 429 within 25 rapid real HTTP
attempts. A local concurrent load test (40 simultaneous requests per burst) against public match
discovery, player search, the leaderboard, and tournament listing — 0 failures, sub-200ms average
latency, server fully responsive immediately after every burst.

## 20. Production Release (Phase 20)

Mission: take LOC from "hardened" (Phase 19) to "actually deployable" — infrastructure, deployment
config, environment separation, and real verification that the whole stack boots and works from a
fresh install. No new product features; every change here is either a genuine deployment blocker
found during audit, or documentation. See `docs/DEPLOYMENT.md` for the operational guide this phase
produces.

### 20.1 Dead config found and removed

Both `server/package.json` and `client/package.json` depended on `"lord-of-cricket": "file:.."` — a
self-referential link back to the monorepo root's own `package.json` (which exports nothing;
`grep`-confirmed zero real imports from it anywhere in either `src/` tree). Harmless in this
repository's own dev environment (npm just symlinks it), but a genuine **deployment blocker**: any
build process whose context doesn't include the parent directory — a Docker build using `server/` as
its build context, most platforms' isolated build environments — fails to resolve `file:..` at all.
Removed from both `package.json`s; verified with a real `npm ci` from a clean lockfile afterward (0
vulnerabilities, clean install). Also removed `server/src/config/mongo.js` — a fully dead, unused,
pre-`db.js`-refactor duplicate of `connectMongo()` whose own error path (`process.exit(1)` on Mongo
failure) actively contradicted the established "Mongo is optional" architecture; confirmed zero
imports before deletion.

### 20.2 Environment configuration (Feature 1)

New `config/validateEnv.js`, called at the top of `server.js`: in production, refuses to boot with a
single clear error listing every missing required variable (`JWT_SECRET`, every `PG_*`,
`CLIENT_ORIGIN`) instead of letting a missing var surface later as an opaque, unrelated failure
several layers downstream (a missing `PG_HOST` previously showed up as a raw driver error like
"getaddrinfo ENOTFOUND undefined"). Deliberately narrow — every optional integration (Mongo, Google
Calendar, AI, Cloudinary, CricAPI) stays optional here too; this is not the place to make an optional
feature mandatory. `JWT_SECRET`'s own pre-existing check (`utils/jwt.js`) is unchanged and unified
conceptually, not merged in code — see the comment in `server.js` for why (ES module import
hoisting means textual ordering between them doesn't actually control which fires first; both fail
fast with a clear message regardless of order). `.env.example` audited against every `process.env.*`
read in the codebase — complete, `TRUST_PROXY`/`NODE_ENV`/`PG_POOL_MAX` added.

### 20.3 PostgreSQL production (Feature 2)

Connection pooling made explicit and tunable: `max` (env `PG_POOL_MAX`, defaults to 10 — pg's own
default, unchanged behavior unless explicitly set) and `connectionTimeoutMillis: 10000` (pg's own
default is 0 — no timeout, i.e. a query can hang forever if Postgres is unreachable; a bounded
timeout is the correct production default so an outage surfaces as a fast, clear error instead of a
hung request). Migration process (`npm run db:migrate` → `schema.sql`) re-verified idempotent —
every `CREATE TABLE`/`CREATE INDEX` is `IF NOT EXISTS`, every schema addition across every phase has
used `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — safe to re-run against an already-migrated
database, which the deployment dry run (§20.11) exercises for real. Indexes/constraints/transaction
safety were already fully audited in Phase 19 §19.7 — not re-litigated, confirmed still accurate.

### 20.4 MongoDB production (Feature 3)

Confirmed unchanged and correct: `connectMongo()` degrades to a warning log on failure, never blocks
startup; `isMongoReady()` gates every call site (canteen menu, AI insight cache). Indexes
re-confirmed present on both collections that need them (`AiInsight`'s `{sourceType,sourceId}`
unique compound index, `CanteenOrder`'s partial unique index on `{userId,hasActiveOrderFlag}` for the
real concurrency guarantee behind "one active order per user"). New `/api/health/ready` (§20.6)
surfaces live Mongo connection state for the first time — previously only visible in server logs.

### 20.5 Google Calendar & AI configuration (Features 4/5)

No credentials configured in this environment (no service account, no Anthropic key) — real
provider integration could not be exercised end-to-end here. What WAS verified live: a real booking
created via the running server correctly reports `googleSyncStatus: "NOT_CONFIGURED"` and still
succeeds fully (calendar sync failure/absence never blocks or degrades the booking itself); a real
`GET /matches/:id/ai-insight` against a real, freshly-created finalized match (not merely an empty
DB) correctly returns `{"available":false,"reason":"NOT_CONFIGURED"}` — both are the exact
already-established graceful-degradation contract (Phase 14/16), re-confirmed against the live
server rather than only read from code. Concrete setup steps for both (service account creation,
calendar sharing, API key acquisition) are now documented in `docs/DEPLOYMENT.md` — previously only
implied by `.env.example` comments.

### 20.6 Health checks (Feature 6)

`GET /api/health` (liveness — checks nothing external, so a slow dependency can never make an
orchestrator kill a healthy process) and new `GET /api/health/ready` (readiness — a real `SELECT 1`
against Postgres; `503` if it fails, `200` if it succeeds, plus an informational `optional` block
reporting live Mongo/Calendar/AI state that never itself affects the status code, since none of them
are hard dependencies). `controllers/health.controller.js` reuses the exact existing
`isMongoReady()`/`isCalendarConfigured()`/`isAIConfigured()` helpers each subsystem already exposed —
no new state, no new truth.

### 20.7 Deployment configuration (Feature 7)

- **Compression**: `compression()` added to `app.js` — API responses were previously sent
  uncompressed entirely (verified: no `Content-Encoding` header on any response before this).
  Verified live: a 50-item player search response now comes back `Content-Encoding: gzip`.
- **SPA routing**: `client/public/_redirects` (Netlify/Render Static Site) and `client/vercel.json`
  (Vercel) both rewrite every path to `index.html` — without one of these, a direct browser visit to
  any client-side route (`/matches`, `/players/:id`, etc.) 404s at the static host before React
  Router ever loads. Verified the `_redirects` file survives into `client/dist` after `npm run build`.
- **Containerization**: `server/Dockerfile` (+ `.dockerignore`) — optional (Railway/Render both also
  auto-detect a plain Node app), included for platforms/workflows that want a container. `docker
  build` itself could not be executed in this environment (no running Docker daemon) — see §20.11 for
  what WAS verified instead.
- **Cache headers**: every `/api/*` response now sets `Cache-Control: no-store` (§20.9) — nothing
  under this API benefits from HTTP caching, and several routes return per-user data.
- Build/start commands audited and documented in `docs/DEPLOYMENT.md` — `npm run build` → `dist/`
  (frontend, static), `npm start` → `node src/server.js` (backend) — both already correct,
  pre-existing.

### 20.8 Logging (Feature 8)

Completed Phase 19's structured-logging migration: every remaining `console.log`/`console.error` in
code that runs as part of the live server process (controllers, realtime modules, `server.js`'s
socket connect/disconnect logs) now goes through `utils/logger.js`. Deliberately left AS-IS: the
one-off CLI scripts (`config/seed.js`, `config/seedPlayers.js`, `config/migrate.js`,
`scripts/rebuildCommentary.js`) — these are read directly by a human operator running them in a
terminal, and structured JSON-line output would make that *worse*, not more production-ready; "no
debug spam" applies to the running server process, not an operator-invoked one-shot script.

### 20.9 Security headers (Feature 9)

Helmet/CORS/rate-limiting/JWT were fully audited in Phase 19 §19.1 — re-confirmed unchanged and
correct. New this phase: `Cache-Control: no-store` on every `/api/*` response (Express's default
auto-generated `ETag` combined with no explicit cache directive meant a shared proxy/cache in front
of the API had no explicit instruction not to store a response containing per-user data). Cookies:
confirmed, again, that this app uses none anywhere (`grep`-verified zero `document.cookie`/
`res.cookie` usage) — auth is a bearer JWT in `localStorage`, so cookie-specific concerns
(SameSite/Secure/HttpOnly) don't apply to this architecture.

### 20.10 Error pages & performance (Features 10/11)

404 and the render-error boundary were built in Phase 19 (§19.10), unchanged. New this phase: a
global `OfflineBanner.jsx` — `navigator.onLine` plus the two native `online`/`offline` window events,
no service worker, no offline caching (that would be new PWA infrastructure, out of scope) — verified
live with Playwright's real browser network emulation (`context.setOffline(true/false)`): appears
exactly when offline, disappears exactly when back online. "Maintenance mode" was deliberately NOT
built as a new admin-toggle feature (out of scope per this phase's own "no new features"); the
existing `RouteErrorBoundary` (Phase 19) already shows a friendly, branded message if the backend is
genuinely unreachable, which is what a maintenance page needs to communicate.

Performance: every measured API endpoint (Homepage discovery, Match Summary, Team/Player profile,
Analytics, Ground Operations timeline, Booking availability, AI Insight, Commentary) responded in
3–157ms against real data — no endpoint identified as measurably slow. The homepage's real
first-contentful-paint is ~230ms; an initial `networkidle`-based measurement showed several seconds,
traced to the homepage's embedded Google Maps iframe (already correctly marked `loading="lazy"` in
existing code) continuing background network activity well after the page was already visually
complete and interactive — a property of the `networkidle` metric being a pessimistic proxy, not an
actual unaddressed slowness; no code change was needed once this was measured properly. Bundle
splitting (Phase 19) re-confirmed still in effect.

### 20.11 Production dry run (Feature 12)

Real, not simulated: `npm ci --omit=dev` run in an isolated directory containing only what
`Dockerfile` actually `COPY`s (`package.json`, `package-lock.json`, `src/`) — this is exactly what
caught §20.1's `file:..` dead-dependency bug (a real fresh install from just those files, with no
parent directory present, would have failed before that fix). The server was then booted from that
same isolated directory against the real dev Postgres, on an alternate port, with no code or config
outside what a container would actually have — both `/api/health` and `/api/health/ready` responded
correctly. `docker build` itself could not be run (Docker Desktop's daemon is not running in this
environment) — noted honestly as a real limitation, not glossed over; recommend running `docker
build .` once as a final check before the first real container-based deploy.

### 20.12 Full E2E (Feature 13)

18/18 checks (Playwright + real HTTP) covering Authentication (valid/invalid login), Players
(discovery, real profile, compare), Teams (discovery, compare), Match Summary against a REAL
finalized match created through the actual scoring/finalize service pipeline (not an empty DB), 
Matches discovery, Tournaments, Leaderboards, Booking (real create + cancel), the Ground Operations
staff hub, Notifications (authenticated fetch), the homepage notification bell, and the new 404 page.
Match Scoring/Replay/Commentary/corrections themselves are exhaustively covered by the 251-test
integration suite (which exercises the identical real service layer this E2E's own fixture match was
built through) — not re-proven by hand here, which would be strictly weaker evidence than what
already exists. The fixture match, its teams, and its players were fully cleaned up after
verification (mirroring `tests/integration/fixtures.js`'s own cleanup ordering) — nothing left behind
in the dev database.
