# LOC Technical Debt

Originally produced by the pre-Phase-11 project-wide cleanup audit, kept up to date through Phase
20 (Production Release). Classified by priority. Items marked
**RESOLVED** were found and fixed during the cleanup audit (see git history around this file's
introduction for the exact diff).

Intentional design decisions are called out explicitly as such — they are not bugs, and should not
be "fixed" by a future pass without a real product reason.

## P0 — Critical

None open at the time of this audit.

**RESOLVED (Phase 20) — both `package.json`s depended on a dead, self-referential `file:..` package
that would break any containerized/isolated build.** `"lord-of-cricket": "file:.."` in both
`server/package.json` and `client/package.json` linked back to the monorepo root's own
`package.json`, which exports nothing real — zero actual imports from it existed anywhere. Harmless
in this repo's own dev environment (npm just symlinks it), but a genuine deployment blocker: a Docker
build using `server/` as its context (or any platform's isolated build environment) can't resolve
`file:..` outside that context and fails. Removed from both; verified via a real `npm ci` from an
isolated directory afterward (0 vulnerabilities, clean install, server boots correctly). Also removed
`server/src/config/mongo.js`, a fully dead, unused, pre-`db.js`-refactor duplicate `connectMongo()`
whose `process.exit(1)`-on-Mongo-failure behavior actively contradicted this app's established
"MongoDB is optional" architecture — confirmed zero imports before deletion.

**RESOLVED — five content-management route groups had NO server-side authorization at all.**
`ground-photos`, `amenities`, `advertisements`, `partners` (POST/`/upload`/DELETE), and
`canteen/menu` (`PATCH /today`, `POST/PATCH/DELETE /master...`) accepted writes from any caller,
authenticated or not — the corresponding `/admin/*` client pages had no route guard either, but
that's irrelevant: these were directly callable by anyone who knew the URL, with no token required
(`GET` listing endpoints were and remain intentionally public). Fixed by adding
`requireAuth, requireRole('staff')` to every write route, matching the pattern already used for
canteen orders, and wrapping `/admin/photos`, `/admin/amenities`, `/admin/partners` in
`<RequireAuth>` client-side (consistent with the existing `/canteen/staff` precedent — no
client-side role gate exists anywhere in this app, role enforcement is the backend's job by
design). Verified via direct API calls: unauthenticated write now returns 401, staff-authenticated
write still succeeds, public `GET` is unaffected.

**RESOLVED (Phase 19) — no security headers, and unexpected errors leaked internal detail to the
client.** Neither had been audited before. Fixed: `helmet()` now sets standard security headers
(HSTS, `X-Content-Type-Options`, `X-Frame-Options`, a same-origin CSP) on every response;
`middlewares/errorHandler.js` no longer forwards a raw, unvetted `err.message` for an error with no
intentional `.statusCode` (previously this could be a raw Postgres driver error) — it logs the full
detail server-side and returns a generic message. See `docs/ARCHITECTURE.md` §19.1/§19.4 for the full
reasoning and the numeric-route-param / pagination validation gaps fixed alongside it (§19.3).

**RESOLVED — JWT silently fell back to a hardcoded, public secret.**
`server/src/utils/jwt.js` signed every session with `process.env.JWT_SECRET ||
'dev-only-insecure-secret-change-me'`. A production deployment that forgot to set `JWT_SECRET`
would have silently signed real login sessions with a secret visible in this repository, letting
anyone forge a valid token for any user. Fixed: the module now throws at load time if
`NODE_ENV=production` and `JWT_SECRET` is unset. Dev/test behavior is unchanged. Covered by
`server/src/utils/jwt.test.js`.

**RESOLVED — canteen's Socket.IO rooms (`join-staff-room`/`join-user-room`/`join-order-room`) had
NO authentication at all.** `server.js`'s original inline connection handler trusted whatever the
client emitted — any connected socket, unauthenticated, could `join-user-room` with **any** user id
and silently receive that user's private order events (`order-created`/`order-status-updated`/
`order-completed` — name, items, seat, status), or `join-staff-room` and receive every staff
broadcast. This was the one place the REST layer's existing ownership check
(`getActiveOrder`/`getOrderHistory`'s `req.user.id !== userId && req.user.role !== 'staff'` → 403,
`canteenOrder.controller.js`) had no Socket.IO equivalent. Fixed by extracting the cookie-based
socket authentication `matchChatRealtime.js` (Phase 8) already established for this exact class of
problem into a shared `server/src/realtime/socketAuth.js` helper, and moving the three handlers into
their own `server/src/realtime/canteenRealtime.js` (matching the `register*Realtime(io)` convention
`cricketRealtime.js`/`bookingRealtime.js`/`matchChatRealtime.js` already use) so they authenticate the
same way every other route does: HttpOnly session cookie primary, legacy JWT bearer fallback (read
from the standard `socket.handshake.auth.token`, since these three events keep their existing
primitive payloads unchanged). `join-order-room` additionally checks the order's actual owner via a
new canteen-agnostic `findOrderByPublicId` (reuses `findOrderById`'s row-fetch shape — see that
model's own comment on why no `canteen_id` filter is needed there). `cricketRealtime.js`'s
`match:{id}` and `bookingRealtime.js`'s `booking:{date}` rooms are untouched — both are intentionally
public per those files' own comments. Covered by
`server/src/tests/integration/canteenRealtime.integration.test.js` (unauthenticated connect still
works; wrong-user/no-credential joins are rejected and never receive a leaked event; the real
owner/staff still receive them; the legacy JWT fallback still works). The frontend's two canteen
socket hooks (`useCanteenOrderStatus.js`, `useCanteenStaffDashboard.js`) now connect with
`withCredentials: true`, matching `useMatchChat.js`'s existing option — without it the browser never
attaches the session cookie to the handshake and both joins would be silently rejected.

*Correction to this file's own P2 entry below ("OTP/Twilio is not implemented... Auth is plain email
+ password + JWT"):* that description is stale — Phase 3 replaced password login with OTP (email or
phone) as the only reachable login path, and Phase 8 removed the password `/auth/login`/`/auth/signup`
routes entirely. JWT bearer auth still exists in `middlewares/auth.js#requireAuth` but only as a
fallback no real user can obtain a token for anymore (kept alive purely because the integration test
suite mints one directly via `signToken({id})` as an auth-fixture shortcut across 51 files). See
`docs/AUTH.md` for the current, accurate picture — that document, not the paragraph below, is
authoritative on auth going forward.

## P1 — Important

**RESOLVED (Phase 14 Part 1) — no per-match player availability/RSVP.** Fixed: `match_availability`
table + `/me/availability/:matchId` (player) + `/matches/:matchId/availability` (organizer/staff)
endpoints, surfaced on the player dashboard's Next Match card and the roster-building UI. See
`docs/ARCHITECTURE.md` §13.

**RESOLVED (Phase 14 Part 2) — canteen order placement's double-submission race window.**
`canteenOrder.model.js` now has a partial unique index on `{userId, hasActiveOrderFlag}`
(`hasActiveOrderFlag: true` only while an order is active) — MongoDB itself rejects a second
concurrent active order with a duplicate-key error (E11000), which `createOrder` translates into the
same `409` response as before. The `findOne` pre-check remains as a fast, friendly path, but the
index is now the actual source of correctness, verified by a real concurrent-insert integration test
(`canteenOrderConcurrency.integration.test.js`). No client-side submit lock was added — the fix is
authoritative at the database layer, matching this project's established idempotency approach.

**`react-router-dom` has a HIGH severity advisory** (RSC Mode CSRF Bypass Allows Action Execution
Before 400 Response — GHSA-qwww-vcr4-c8h2), reported by `npm audit` in `client/`, still open as of
`react-router-dom@7.18.2` (the current `latest` in the 7.x line — there is no patched 7.x release;
the fix lands only in `>=8.3.0`). Re-audited in Phase 19: this app is a client-only SPA
(`createBrowserRouter`/`RouterProvider`, no React Server Components / framework mode / server
actions), so the specific RSC-mode CSRF attack surface this advisory describes does not apply to how
this app actually uses the library. `npm audit fix --force` was again deliberately NOT run — its only
offer is a breaking downgrade to `7.11.0` (flagged `isSemVerMajor` by npm itself), and the non-breaking
fix requires a major-version jump to React Router 8. Both are real regression risk for a routing
library touching every page, unbudgeted in either cleanup pass. **Recommendation unchanged:** a
dedicated, tested upgrade to React Router 8.3.0+ with its own full regression pass, not bundled into
a hardening/cleanup pass.

**RESOLVED (Phase 19) — no rate limiting on `/api/auth/login` or `/api/auth/signup`.** Fixed:
`middlewares/rateLimit.js#authLimiter` (20 requests / 15 min per IP) is now on both routes, plus five
more limiters for the other endpoint classes flagged in the same audit (AI, booking writes, public
search, commentary, analytics reads) — see `docs/ARCHITECTURE.md` §19.2. The in-memory store is
correct for LOC's current single-instance deployment; see `docs/DEPLOYMENT.md`'s note on what a
multi-instance deployment would need instead.

**RESOLVED (Phase 20) — no health/readiness distinction, no response compression, no PostgreSQL
pool tuning, and missing production env vars failed with an opaque downstream error instead of a
clear one.** None of these had been audited before. Fixed: `GET /api/health` (liveness) +
`GET /api/health/ready` (real Postgres check + informational optional-service state);
`compression()` middleware (API responses were previously sent uncompressed entirely); `pg.Pool`'s
`max`/`connectionTimeoutMillis` made explicit and configurable (previously pg's implicit defaults,
including an unbounded connection timeout); `config/validateEnv.js` fails fast in production with a
message naming exactly which required variable is missing (`JWT_SECRET`/`PG_*`/`CLIENT_ORIGIN`).
See `docs/ARCHITECTURE.md` §20.2/20.3/20.6/20.7.

## P2 — Improvement

**The canteen module (`canteenMenu.controller.js`, `canteenOrder.controller.js`) uses its own
`res.status(500).json({ error: err.message })` pattern instead of `next(err)` + the central
`errorHandler`.** Found during the Phase 19 error-handling audit — every other controller in this app
consistently calls `next(err)` and lets `middlewares/errorHandler.js` shape the response (`{message}`
for a plain error, `{code,message,details}` for a domain error). The canteen module predates that
convention and is internally consistent with itself (every canteen response uses `{error}`, and the
frontend canteen client code already expects that shape). Deliberately NOT rewritten in Phase 19 —
the brief's own "do not rewrite working modules" applies directly here, and changing the response
*shape* on a heavily-used, already-tested module is a real behavioral change for its frontend
consumers, not a safe drive-by fix. The one thing Phase 19 did NOT need to fix here: these responses
were never a raw stack-trace leak, only a plain `err.message` string — the same category of exposure
the central `errorHandler` fix addresses elsewhere, just via a different (equally intentional, single
codebase-wide) convention split. Worth unifying in a dedicated pass that also updates the matching
frontend call sites, not bundled into a hardening pass.

**`NO_RESULT` is a supported database value the app can never produce.**
`matches.result_type` CHECK constraint allows `'NO_RESULT'`, but
`domain/scoring/matchResult.js#RESULT_TYPES` only defines `['WICKETS', 'RUNS', 'TIE']`, and no
abandoned/rain-affected-match lifecycle exists to ever produce it. This is a real schema/domain gap
(not a bug — nothing is broken today, since the value is simply never written), documented here as
a known future lifecycle extension. Same applies to `cancelled`/`abandoned` match statuses — the
schema has no CHECK constraint on `matches.status` restricting it, but no code path ever sets
anything other than `upcoming`/`live`/`completed`/`finalized`.

**No permanent, team-level captain/wicketkeeper concept.** `is_captain`/`is_wicketkeeper` exist
only on `match_players` (per-match). There is no `teams.captain_player_id` or similar. Team
Profile (Phase 10 Part 2) and Match Summary (Phase 9) both deliberately show match-specific
captain/keeper markers rather than inventing a permanent one — documented design decision, not a
gap to silently "fill in."

**Two ball/over indexing conventions coexist** in the Match Summary read model
(`domain/matchSummary/buildInningsSummary.js`): fall-of-wickets entries are 0-indexed (matching the
DB/replay convention), while per-delivery `over`/`ball` display values used elsewhere in the same
response are 1-indexed. Both are faithfully reused from their original call sites (documented in
Phase 9) rather than unified into a third convention — a real inconsistency, low risk, cosmetic only.

**Static scorecard/timeline/wagon-wheel do not refresh every ~3s** on a live Match Summary page —
only the hot live panel does; the rest refreshes on page load and on lifecycle transitions
(innings break, second innings, completion). This is a deliberate Phase 10 Part 3 architecture
decision (Section 8 of `docs/ARCHITECTURE.md`), not an oversight — flagged here only so it isn't
"fixed" by accident later without re-reading that rationale.

**Team Profile's live-match card is not auto-refreshed** (neither polling nor Socket.IO). It shows
the live match at whatever freshness the page loaded at; the spectator would need to open the
linked Match Summary for live updates. Explicitly out of scope for both Phase 10 Part 3 and Phase
11 (Homepage + `/matches` LIVE tab + Match Summary only — Part 51 of the Phase 11 spec).

**The `/matches` LIVE tab and homepage featured match still use HTTP polling, not Socket.IO.**
Deliberate (Phase 11 Part 50/97): joining a socket room per card in a list of N live matches
doesn't scale the way one room per open Match Summary page does. They keep their existing ~20s/~30s
bounded polling cadence from Phase 10 Part 3 unchanged. Only the single, detailed Match Summary
page is Socket.IO-backed.

**No Redis adapter — Socket.IO is single-process.** Fine at current scale (one Node process);
horizontally scaling the API to multiple instances would require the `@socket.io/redis-adapter` (or
similar) so a broadcast from one process reaches spectators connected to another. Deliberately not
added (Phase 11 Part 54 — "do not add Redis," revisit only with real scaling evidence).

**No automated client-side tests for the Socket.IO/commentary hooks** (`useSocketMatchTransport.js`,
`useLiveMatch.js`, `useMatchCommentary.js`, `CommentaryPanel.jsx`) — this project has no existing
frontend test framework to extend (Phase 11/12 both relied on real-browser manual E2E instead,
documented in each phase's completion report). Worth introducing a frontend test runner (Vitest +
Testing Library would fit the existing Vite setup) if the client's automated coverage becomes a
priority.

**`join-match` has no per-socket rate limiting.** A public, unauthenticated spectator can call
`join-match` for any match id repeatedly; server-side validation (matchId must be a positive
integer, match must exist) bounds the cost of each attempt to one indexed PK lookup, but there is no
throttle on attempt *frequency*. Phase 19 added HTTP-layer rate limiting (`middlewares/rateLimit.js`)
but deliberately did not extend it to Socket.IO events — `express-rate-limit` is HTTP-middleware-only,
and a Socket.IO-specific limiter would be new infrastructure the audit didn't find evidence of actual
abuse to justify. Revisit with real evidence.

**OTP/Twilio is not implemented at all** — not even mocked. Auth is plain email + password +
JWT. The `twilio` npm package was a dependency with zero actual usage anywhere in `server/src`;
it has been removed as part of this cleanup (see git history). If SMS/OTP verification becomes a
real requirement, it needs to be built from scratch, not "finished."

**`models/` (matches/teams/players/users) and `repositories/` (scoring/correction domain) hold the
same architectural role under two different directory names**, a naming split from before the
scoring domain existed. Not renamed in this cleanup (would touch a large number of import
statements for a purely cosmetic gain) — recommend `repositories/` as the convention for any new
persistence module.

**Commentary generation is `O(n²)` in the number of prior log entries** (Phase 12 —
`generateInningsCommentary` replays `log.slice(0, i)` for every index rather than folding
incrementally, see `docs/ARCHITECTURE.md` §12.8). Deliberate: correctness/zero-drift-between-append-
and-rebuild first, and the measured real numbers (146-174ms to regenerate 148 entries from a 120-ball
innings) are nowhere near a problem at club-cricket lengths. Revisit only if a much longer format
(e.g. multi-day) is ever supported.

**Commentary produces no line for most `match_events` types** (Phase 12 — only `catch-dropped`,
`retire`, `penalty-runs` get a commentary row; `batsman-in`, `bowler-change`, `strike-swap`,
`appeal`, `review`, `drinks-break`, `rain-delay`, `injury`, `match-paused`/`match-resumed` do not).
Deliberate (Part 6: a small, meaningful taxonomy, not one line per possible administrative event) —
revisit only if a real product need for narrating one of these surfaces.

**No ball line/length/shot-type commentary** ("yorker", "cover drive", etc.) — LOC's scorer UI does
not currently capture that data, only wagon-wheel region and outcome. Phase 12 deliberately never
invents it (Part 86: truth over dramatic language). A future scorer-input enhancement capturing
line/length/shot type would be the prerequisite, not a commentary-layer change.

**Captain/wicketkeeper can only be designated at the moment a player is first added to a match
roster (Phase 13).** `match_players` has no update path once a row exists (`createMatchPlayer` is a
plain insert, no upsert) — the new Captain/Wicketkeeper picker on Match Setup
(`MatchRosterPage.jsx`) can therefore only offer players that are selected but not yet locked into a
saved roster. A match whose Playing XI was already fully saved before this phase (or before the
organizer decides on a captain) cannot have captain/WK retrofitted through the UI today. A small
`PATCH /matches/:matchId/match-players/:id` endpoint would close this gap if it becomes a real
friction point.

**RESOLVED (Phase 15, found via real E2E) — `GET /tournaments/:publicTournamentId` omitted the
champion's team name.** `tournament.repository.js#findTournamentByPublicId` returned
`champion_team_id` but never joined the team's name, so a completed tournament's own detail page
would never actually render its "Champion" badge (the discovery list's separate query already did
this join correctly, masking the gap until a real browser test opened a specific tournament's page).
Fixed by adding the same `LEFT JOIN teams` used by `listPublicTournaments` to
`findTournamentByPublicId`.

**RESOLVED (Phase 14 Part 3) — ground/facility booking was marketing-only.** Fixed: a real
availability/reservation system (`ground_bookings`, PostgreSQL `EXCLUDE` constraint for the
concurrency guarantee, homepage booking flow, My Bookings, staff schedule/blocking). See
`docs/ARCHITECTURE.md` §14. The homepage's old `mailto:` CTA is now a real "Book Ground" button.

**Canteen staff "Order History" tab (Phase 13) shows all orders, not just completed/cancelled
ones.** `GET /api/canteen/orders` only distinguishes `status=active` from "everything" — there is no
server-side "history only" (completed + cancelled) filter, so the History tab fetches the unfiltered
list and lets staff narrow it with a client-side status filter within the current page. Good enough
to close the "no way to review a past order" gap the audit found; a dedicated `status=history` server
filter (excluding active statuses) would make pagination more useful if this becomes a high-traffic
screen.

**RESOLVED (Phase 14 Part 2, as a side effect) — `canteenOrder` (MongoDB) had no index on
`userId`.** The new partial unique index on `{userId, hasActiveOrderFlag}` (added for the
concurrency fix, see P1 above) has `userId` as its leading field, so it now also serves every
plain `userId`-filtered query (`getActiveOrder`, `getOrderHistory`) as a prefix index — no separate
index was needed.

**Ground booking is fixed-slot only (Phase 14 Part 3) — no custom start/duration.** Every booking is
exactly `GROUND_SLOT_DURATION_MINUTES` (default 2 hours) long, chosen from a fixed grid. Deliberate
v1 scope (Part 11: "implement a clean configurable... policy rather than scattering constants" — not
"build a general-purpose arbitrary-duration scheduler"). A real need for half-length or multi-slot
bookings would be a natural, bounded follow-up (allow selecting N contiguous grid slots), not a
redesign.

**LOC match occupancy blocks a whole calendar day, not the match's actual hours (Phase 14 Part 3).**
`matches.match_date` is a single `TIMESTAMP` with no end time and no reliable duration signal
(`overs_per_innings` can be `null`) — see `docs/ARCHITECTURE.md` §14.2. Blocking the whole day is the
smallest *safe* policy (never a false "available"), at the cost of being overly conservative on
match days. Would need a real `match_date` + duration (or explicit end time) on `matches` to narrow.

**Ground booking has no guest/non-account flow and no payment.** Booking requires login (Part 17's
chosen model: public availability, login to confirm — the smallest flow consistent with this app's
existing auth architecture, matching canteen ordering). No payment integration exists or was
requested; confirmation is immediate or fails, never "pending approval."

**Google Calendar sync could not be live-verified against a real calendar in this environment** — no
`GOOGLE_SERVICE_ACCOUNT_*` credentials were available. The adapter (`googleCalendar.service.js`) is
implemented against the current `googleapis` service-account JWT flow and exercised for its
*absence* (booking succeeds with `google_sync_status: 'NOT_CONFIGURED'`, never blocks/breaks
anything) — but a real event actually appearing on a real calendar has not been manually confirmed.
Do this once real credentials are provisioned, before relying on it operationally.

**Tournament formats are deliberately bounded (Phase 15).** `GROUPS_KNOCKOUT` supports exactly two
groups; `KNOCKOUT` supports exactly 2, 4, or 8 registered teams (a non-power-of-two count is a
validation error, never a silently-wrong bracket). No double elimination, Swiss format, or
auction/draft system. A real need for a 3-group or 16-team bracket would extend
`domain/tournament/fixtures.js`'s bracket-size table and `qualification.js`'s cross-pairing rule, not
require a redesign.

**Tied/no-result knockout matches require explicit staff resolution (Phase 15).** LOC has no
authoritative Super Over engine, so `domain/tournament/progression.js` never invents a winner for a
finalized `TIE`/`NO_RESULT` — see `docs/ARCHITECTURE.md` §15.11. `POST
/tournaments/:id/fixtures/:fixtureId/resolve` is the deliberate, honest way forward until a real
Super Over flow exists in the scoring engine.

**No permanent tournament-level captain/wicketkeeper.** Consistent with the existing per-match-only
captain/wicketkeeper design (see the Phase 13 item above) — a tournament squad entry is just
"this player represented this team in this tournament," nothing more.

**Tournament organizer UI (team registration, squad management, scheduling, tie resolution) was
verified via `npm run build`/`npm run lint` and a real-browser E2E pass for tournament
creation/registration/fixture-generation, but the squad-management sub-panel specifically was
exercised through its underlying API in the E2E run rather than clicked through in the browser
end-to-end** (the rest of the flow — including the full GROUPS_KNOCKOUT competition down to a
crowned champion — was driven through real browser clicks). The squad-management service/repository
logic itself has full integration-test coverage (duplicate/cross-team rejection, squad-size limits,
the transfer-safety test).

**AI Insight quality/behavior could not be live-verified against a real model in this environment
(Phase 16)** — no `AI_API_KEY` was available. `ai/providers/anthropicProvider.js` is implemented
against the current Anthropic Messages API structured-output shape and exercised for its *absence*
(every AI Insight endpoint returns `{available:false, reason:'NOT_CONFIGURED'}`, verified directly
against this environment's real, unconfigured backend — no page is blocked or degraded) — but actual
narrative quality, actual resistance to a prompt-injection payload when processed by a real model,
and actual end-to-end latency have not been manually confirmed. Everything upstream and downstream
of the provider call (context building, fingerprinting, schema validation, hallucination
post-processing, caching, single-flight concurrency, failure handling) was verified against a fake
provider (`aiFixtures.js#makeFakeProvider`) instead — see `docs/ARCHITECTURE.md` §16.12. Same
posture as the Google Calendar item above: do this once real credentials are provisioned, before
relying on AI Insight quality operationally.

**AI Insight has no user-facing "regenerate" affordance** — `POST .../ai-insight/regenerate` exists
and is staff-only (Part 24), but no UI button calls it yet. Deliberate v1 scope: the automatic
fingerprint-based invalidation (§16.13) already covers the only case that matters (a correction),
so a manual staff regenerate button is a natural, bounded follow-up rather than a gap in the core
mandate.

**RESOLVED (Phase 19) — no per-endpoint rate limiting on the AI Insight endpoints.** Fixed:
`middlewares/rateLimit.js#aiLimiter` (30 requests / 15 min per IP) is on every AI Insight route (get
+ regenerate, all three resource types). **No token-usage/cost tracking** remains unimplemented — at
current club scale, single-flight de-dup (§16.16) plus the fingerprint cache already keep provider
calls rare (one generation per finalized match/player/team per correction, not per page view).
Worth adding real usage metering before this ever runs at a scale where that stops being true.

**Tournament Analytics deliberately omits "most fours"/"most sixes" (Phase 17).** Computing them
would require a second full tournament replay pass duplicating `tournamentStats.service.js`'s
existing work (Part 46/90's "avoid duplicate replay" caution) for a metric outside the mandatory
Phase 17 list. A real need would be better served by adding `fours`/`sixes` fields to that existing
service's leader entries in a small, focused follow-up, not a second parallel replay path.

**Player Analytics' dot-ball/boundary metrics are bounded to the requested `recent` window (default
5, max 20 matches), not the full career (Phase 17).** Deliberate: computing them career-wide would
mean replaying every finalized match a player has ever appeared in on every profile-page load — the
exact N+1-across-many-matches cost Part 46 warns against — for a metric this app's existing
career-stats page (Phase 7) has never needed at full scope either. A real need for a career-wide
version would be a bounded, explicit "load full history" action, not the default page load.

**RESOLVED (Phase 19) — no rate limiting on the Analytics endpoints (Phase 17).** Fixed:
`middlewares/rateLimit.js#analyticsLimiter` (120 requests / 5 min per IP) is on every analytics and
compare route. **No caching layer** remains unimplemented and un-needed — each Analytics request
either reads cheap SQL aggregates over `innings`' own cache columns or replays a small, bounded set
of matches; nothing measured in either audit pass justified a cache. Revisit only with real evidence
at a larger scale.

**Chart accessibility is "value always in a native tooltip or visible text," not full ARIA chart
semantics (Phase 17).** `LineChart.jsx` exposes point values via SVG `<title>` (native hover
tooltip) plus a visually-hidden text summary of the same data (see `docs/ARCHITECTURE.md` §17.16
for the real `<table>`-auto-layout overflow bug this replaced); `BarChart.jsx` renders every value
as always-visible text next to its bar. Neither implements `role="img"` + a full structured ARIA
table or per-datapoint keyboard navigation — a reasonable v1 scope for three simple, small charts
with no chart library in this codebase, not a claim of full WCAG chart conformance.

**No manual booking-approval workflow — PENDING/REJECTED/EXPIRED are not real states in this system
(Phase 18).** Phase 14 deliberately auto-confirms every booking (the EXCLUDE constraint is the only
gate); Phase 18's Feature 9 asked for a fuller status lifecycle, but bolting on a fake PENDING queue
nothing would ever populate was judged worse than being honest about it. `domain/booking/
bookingStatus.js` derives exactly the states that ARE real (`APPROVED`/`COMPLETED`/`CANCELLED`) — see
`docs/ARCHITECTURE.md` §18.5. A genuine future need for staff pre-approval (e.g. large private
events) would be a real, additive feature, not something this phase should have faked.

**Scheduling a match/tournament fixture on top of an existing CONFIRMED ground booking is not
rejected (Phase 18).** The read direction has worked since Phase 14 (a live/upcoming match already
blocks new bookings — `listMatchDatesInRange`), but the reverse write-side check — reject
`match.service.js#createMatch` if the ground already has a confirmed booking that day — was
deliberately not added. `createMatch` is the one function both plain matches and every tournament
fixture (`tournamentFixture.service.js#scheduleFixture`) funnel through, and it's exercised by a
large number of existing tests that create matches at concurrent/overlapping real-world timestamps;
adding a hard availability gate there carried real regression risk against code the Phase 18 brief
explicitly said not to touch (scoring/tournament architecture). The realistic failure mode this
would prevent — staff double-booking their own ground against their own confirmed reservation — is
a self-inflicted scheduling error a human will notice immediately (both would show up on the
Ground Operations dashboard/timeline for that day), not a customer-facing double-booking. Worth
adding as a narrow, explicit check inside `tournamentFixture.service.js#scheduleFixture`/a new
staff match-creation guard specifically (never inside `createMatch` itself) if this ever becomes a
real operational problem.

**No revenue analytics in the booking reports (Phase 18).** Explicitly out of scope — this app has
no payment integration (see the existing "Ground booking has no guest/non-account flow and no
payment" item above), so there is no revenue figure any report could honestly show.

**`GET /ground/timeline`'s match-day entry is still whole-operating-window, not the match's real
start/end time (Phase 18).** Same root cause as Phase 14's own documented limitation two items
above: `matches.match_date` has no end time. Phase 18 only improved the LABEL (real team names/
tournament context instead of a bare flag); a real per-match time range would need a real
`match_date` + duration/end-time column on `matches`, unchanged since Phase 14 first documented
this gap.

**Registration's pre-check and account creation are not atomic with each other (Phase 4).**
`POST /auth/register/player`/`/register/umpire` 409s if the identifier already has a real account, but
that check and the actual account creation (at OTP-verify time) aren't one atomic operation — a second
registration attempt for the same identifier in the gap between them won't see the first attempt's account
yet. Handled defensively (`otpAuthService.verifyLoginOtp` re-checks for this race and falls back to an
ordinary login rather than double-creating or erroring, verified directly), not a data-integrity risk, but
worth knowing about. See `docs/ACCOUNT_CREATION.md`'s "Known limitation" section.

## P3 — Future

**No caching layer (Redis or otherwise).** Every measured endpoint (match discovery ~2ms, live
state ~5ms even 125 deliveries deep, home feed ~7ms) is fast enough at current club scale that a
cache would add complexity without a measured problem to solve. Revisit only with real evidence.

**No API versioning scheme** (`/api/...`, not `/api/v1/...`). Fine at current single-client scale;
worth deciding before a second consumer (e.g. a mobile app) appears.

**RESOLVED (Phase 19) — no code-splitting on the frontend build.** The bundle had grown to ~870KB
(over Vite's 500KB warning threshold) by Phase 18. Fixed: every route in `AppRoutes.jsx` is now
`React.lazy`-loaded behind a shared `<Suspense>` fallback. Largest remaining chunk is 300KB (95KB
gzipped); the build's size warning is gone.

**No OpenAPI/Swagger spec** — `docs/API.md` is a hand-maintained markdown overview. Sufficient for
the project's current size; consider generating a formal spec if the API surface keeps growing.

**The integration test suite occasionally shows a single count/pagination-assertion flake on a full
parallel run** (e.g. "total must be stable across pages" off by one) — observed across Phase 17, 18,
19, and 20's baseline/regression runs, always in a different file each time (`leaderboard`,
`publicMatch`, `publicTeam`), never reproducible when that one file is re-run in isolation immediately
after.
Root cause, confirmed in Phase 19: `node --test` runs the ~25 integration test files concurrently by
default, and every file shares the same dev PostgreSQL database (no per-test schema/transaction
isolation) — a count-based assertion in one file (e.g. "exactly N matches total") can observe rows a
*different* file's fixture setup/teardown is creating or deleting at that exact moment. Confirmed by
actually running `node --test --test-concurrency=1` (forces serial execution, so no file can
interleave with another): 255 tests, 251 pass, 4 skipped, **0 failures** — vs. ~46s parallel, the
serial run took 6m13s (≈8x slower). That trade is not worthwhile for the normal dev feedback loop.
**Not fixed in Phase 19** — the real fix is per-test database
isolation (a dedicated schema or transaction-per-test wrapper), which is a genuine test-infrastructure
project of its own, not a safe drive-by change to dozens of existing, working test files across many
phases. Recommendation: if CI ever needs a zero-flake signal, run `test:integration` with
`--test-concurrency=1` there specifically (accepting the slower run), and keep the default parallel
script for local dev.

**Uploaded files under `server/uploads/` are on local disk, not object storage.** Most container
platforms' filesystems are ephemeral — a redeploy wipes anything written to local disk. Cloudinary
already exists and is the intended path for images that need to survive redeploys (canteen menu item
photos); this only affects the subset of uploads that bypass it. Not addressed in Phase 20 (would be
a real architecture change — picking and wiring an object-storage provider — not a hardening fix).
Fine for a single, long-running host that isn't redeployed often; worth revisiting before deploying to
a platform with an ephemeral filesystem if this upload path is actually used in practice.

**`docker build` was never actually executed against `server/Dockerfile` (Phase 20)** — the audit
environment has the Docker CLI installed but no running daemon. What WAS verified instead: a real
`npm ci --omit=dev` run in an isolated directory containing exactly what the Dockerfile `COPY`s
(this is what caught the `file:..` dead-dependency bug above), and a real server boot from that same
isolated directory against the real dev database, with both health endpoints responding correctly.
**Recommendation:** run `docker build .` once as a final check before the first real
container-based deploy — everything the build itself would exercise beyond the isolated `npm ci`/boot
already verified is Docker-layer mechanics (base image pull, layer caching), not application
correctness.

## Explicitly NOT bugs (verified during this audit, noted so they aren't "rediscovered")

- **`POST /api/auth/signup`'s response does not leak `password_hash`.** It looked suspicious at a
  glance (unlike `login`, it doesn't call `toPublicUser()`), but `createUser()`'s `INSERT ...
  RETURNING` clause already scopes to public columns only — there was never a hash in the object
  to leak. Verified by reading `user.model.js`.
- **No SQL-injection-shaped code found.** Every dynamic `ORDER BY`/`SET` fragment in the codebase
  is built exclusively from small, internally controlled whitelists (e.g.
  `domain/matchDiscovery/categoryMapping.js`'s `DISCOVERY_ORDER`), never raw request input; every
  value is parameterized.
- **No route-ordering/shadowing bugs found** across `server/src/routes/*.js` — every
  static-segment route (`/discover`, `/home`, `/live-state`, `/profile`) that could collide with a
  `/:id`-shaped route is correctly registered before it.
- **No per-request database connections** — a single `pg.Pool` and a single Mongoose connection are
  created once at module load and reused everywhere.
- **The "india-match/featured 500" and "staff-without-linked-player 404" console errors** that
  appeared in every regression check throughout Phases 9–10 have been root-caused and addressed —
  see the "RESOLVED" section below. They were not silently accepted forever.

## RESOLVED during this cleanup (beyond JWT, above)

- **`GET /api/india-match/featured` returned a 500 whenever `CRICAPI_KEY` was unset or CricAPI was
  unreachable.** This is a genuinely external, unofficial widget (a different competition's score,
  unrelated to LOC's own cricket truth) — an outage or missing key is an expected degraded state,
  not a LOC server bug. `cricapi.service.js#getIndiaFeaturedMatch` now catches any failure and
  returns `null` (logged server-side only), which the existing frontend `IndiaMatchCard.jsx` already
  rendered identically to a failed request. No visible UI change; the noisy console 500 is gone.
- **Career stats requests for accounts with no linked player profile showed a misleading "Couldn't
  load career statistics" error with a Retry button that would always fail again.** `GET
  /api/me/stats` correctly 404s for such accounts (staff/umpire-only accounts legitimately have no
  player profile) — that HTTP status is correct REST semantics and was left unchanged.
  `useCareerStats.js` now distinguishes this specific 404 and both `CareerOverview.jsx` and
  `ProfilePage.jsx` render the existing `StatsEmptyState` instead of a misleading error+retry.
- **`OnboardingBanner.jsx`'s "Join a team" / "Respond to match invitations" / "Start building your
  cricket record" buttons, and the Navbar account menu's "My Teams"/"My Matches"/"My Statistics"
  links, silently did nothing** — they all `scrollIntoView`'d `#teams`/`#matches`/`#career`, but
  `PlayerDashboardPage.jsx` had no elements with those ids. Fixed by wrapping the corresponding
  dashboard sections with the expected ids.
- Stale **"Welcome to CricVerse."** branding text in `OnboardingBanner.jsx`, fixed to "Lord Of
  Cricket."
- **`.gitignore` was missing build outputs, `server/uploads`, logs, and OS junk** — hardened (no
  previously-tracked files were affected; verified via `git ls-files` before changing).
