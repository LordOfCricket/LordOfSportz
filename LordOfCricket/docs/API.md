# LOC API Overview

Base path: `/api`. All request/response bodies are JSON. Authenticated routes expect
`Authorization: Bearer <jwt>`.

Legend: **Public** = no auth required · **Auth** = any logged-in user · **Staff** = `role='staff'`
· **Scorer** = staff OR an approved umpire (`role='player'` and `player_type='umpire'`) ·
**Owner** = the authenticated user acting on their own resource (staff may act on behalf of others
where noted).

## Error responses (Phase 19)

Every error response is JSON with at minimum a `message` field. A domain-coded error (scoring,
booking, tournament) additionally carries `code` and, where relevant, `details`
(e.g. `{ code: 'BOOKING_CONFLICT', message: '...', details: { alternatives: [...] } }`) — callers
should branch on `code` when present, never parse `message`. An unexpected server error (a bug, an
infra failure) always returns exactly `{ "message": "Internal Server Error" }` with HTTP 500 — the
real error is logged server-side only and never appears in the response, regardless of what caused
it. (The canteen endpoints under `/api/canteen/*` are the one exception — they return `{ "error":
"..." }` instead of `{ "message": "..." }`, a pre-existing, internally-consistent convention from
before the rest of this API standardized on `{ message }`; see `docs/TECHNICAL_DEBT.md`.)

## Rate limiting (Phase 19)

Applied per-IP via `express-rate-limit`; a limited response is `429` with `{ "message": "..." }`.
Not applied to every route — only the classes below, chosen because they're either public/no-login
(the main abuse surface) or expensive per call:

| Class | Limit | Applies to |
|---|---|---|
| OTP request | 10 / 15 min, per IP | `POST /auth/send-otp`, `POST /auth/register/player`, `POST /auth/register/umpire` |
| OTP verify | 20 / 15 min, per IP | `POST /auth/verify-otp` |
| OTP request, per identifier | 5 / hour | any of the three OTP-request routes above, keyed by the identifier itself (real Postgres read — correct under horizontal scaling; see `docs/AUTH.md`) |
| Ground registration writes | 10 / 10 min | `POST /grounds`, `POST /ground-owner-requests` |
| AI | 30 / 15 min | every `GET/POST .../ai-insight*` route |
| Booking writes | 30 / 10 min | `POST /bookings`, `POST /bookings/:id/cancel`, `POST /bookings/staff/block` |
| Public search | 120 / 5 min | `GET /players` (search), `GET /teams/discover` |
| Commentary | 300 / 5 min | `GET /matches/:id/commentary` |
| Analytics | 120 / 5 min | every `.../analytics` and `/compare` route |
| MFA verify (Phase 6) | 10 / 15 min, per user | `/auth/mfa/*/verify`, `/auth/mfa/webauthn/register/verify` — the ceremony/verification-attempt endpoints |
| MFA manage (Phase 6) | 20 / 15 min, per user | `/auth/mfa/status`, enroll/disable/regenerate/remove endpoints |
| Step-up (Phase 6) | 15 / 15 min, per user | `/auth/step-up/options`, `/auth/step-up/verify` |

## Auth (`/api/auth`)

Unified OTP login/registration (Phase 3/4 — see `docs/AUTH.md`, `docs/ACCOUNT_CREATION.md`) is the only
login/signup path — the legacy email+password `/signup`/`/login` routes were removed in Phase 8 (zero
reachable frontend callers; see `docs/AUTH.md`'s "Legacy JWT" section).

| Method & Path | Access | Notes |
|---|---|---|
| `POST /send-otp` | Public | `{ identifier }` (email or phone). Always returns a generic success message — never reveals whether an account exists. |
| `POST /register/player` | Public | `{ name, identifier }`. `409` if the identifier already has a real account (unlike `/send-otp`, this does reveal that). |
| `POST /register/umpire` | Public | Same shape as `/register/player`; completing it also files a pending umpire request. |
| `POST /verify-otp` | Public | `{ identifier, code }`. Completes whichever of the three requests above created the pending code (branches on its `purpose`) — logs in, registers a Player, or registers an Umpire, then sets the session cookie. |
| `POST /logout` | Public | Revokes the current session, clears the cookie. |
| `GET /me` | Auth | Current user |
| `PATCH /role` | Auth | `role` = `'player'` \| `'staff'` |
| `PATCH /player-type` | Auth | `playerType` = `'team_player'` \| `'umpire'`; selecting `'umpire'` files an umpire request |

### MFA / step-up (`/api/auth/mfa`, `/api/auth/step-up`) — Phase 6

Mandatory for SUPER_ADMIN/GROUND_OWNER only — see `docs/MFA.md` for the full policy, factor lifecycle, and
step-up scope list. `GET /me` above gained a new top-level `mfa: {enrolled, required, verified}` key
alongside the unchanged `user` key.

| Method & Path | Access | Notes |
|---|---|---|
| `GET /mfa/status` | Auth | Factors + `{enrolled, required, verified}` |
| `POST /mfa/webauthn/register/options` | Auth | Registration challenge |
| `POST /mfa/webauthn/register/verify` | Auth | Bootstrap-or-step-up-gated (`WEBAUTHN_ADD`) |
| `DELETE /mfa/webauthn/:credentialId` | Auth | Step-up-gated (`WEBAUTHN_REMOVE`), last-factor-protected |
| `POST /mfa/totp/enroll` | Auth | Returns a QR code; not yet active |
| `POST /mfa/totp/verify` | Auth | Activates enrollment (bootstrap-or-step-up-gated, `TOTP_ENABLE`) |
| `POST /mfa/totp/disable` | Auth | Step-up-gated (`TOTP_DISABLE`), last-factor-protected |
| `POST /mfa/recovery-codes/regenerate` | Auth | Step-up-gated (`RECOVERY_CODES_REGENERATE`) |
| `POST /mfa/disable` | Auth | Ground Owner only (`403` for Super Admin — non-disableable by design), step-up-gated (`MFA_DISABLE`) |
| `POST /mfa/verify/options` \| `/mfa/verify` | Auth | Baseline MFA verification — sets `sessions.mfa_verified_at` |
| `POST /step-up/options` \| `/step-up/verify` | Auth | `{ actionScope }` — short-lived, single-use grant for one of the 10 gated scopes |

## Ground Owner Requests (`/api/ground-owner-requests`) — Phase 4

Request/approval flow for becoming a Ground Owner — see `docs/ACCOUNT_CREATION.md` for the full transaction
detail. `POST /api/grounds` (requireAuth) is a thin repoint into the same `submitRequest`, using the
session user as the applicant.

| Method & Path | Access | Notes |
|---|---|---|
| `POST /` | Public | Submits a request; no ground or membership is created yet |
| `GET /status/:publicRequestId` | Public | `{ status, rejectionReason?, moreInfoNotes? }` only — never `reviewedBy` or any internal id |
| `GET /` | Super Admin | `?status=` filter |
| `GET /:publicRequestId` | Super Admin | Full detail; auto-transitions `PENDING` → `UNDER_REVIEW` on first view |
| `POST /:publicRequestId/approve` | Super Admin | Creates the ground (`ACTIVE`) + `GROUND_OWNER` membership, atomically. `409` if already decided. NOT step-up-gated (intentional exemption, 2026-08-24) — see `docs/MFA.md`. |
| `POST /:publicRequestId/reject` | Super Admin | `{ reason }` required |
| `POST /:publicRequestId/request-information` | Super Admin | `{ notes }` required, sets `MORE_INFORMATION_REQUIRED` |

## Ground Owner — Staff & Permissions (`/api/ground-owner/grounds/:publicGroundId/staff`) — Phase 4/5

Ground-scoped staff (`GROUND_ADMIN` \| `CANTEEN_STAFF`), distinct from the platform-wide `POST /staff`
below. See `docs/ACCOUNT_CREATION.md` for the find-or-create/no-invitation-token rationale and
`docs/AUTHORIZATION.md` for the full permission model.

| Method & Path | Access | Notes |
|---|---|---|
| `GET /` | `STAFF_VIEW` permission (or Owner/Super Admin) | Lists staff for the ground, each row including its current `permissions: string[]` |
| `POST /` | Owner-only (hardcoded, never delegable) | `{ name, identifier, role }`. Reuses an existing account's identity without changing its `role`; `409` if that person already holds that exact role at this ground. |
| `POST /:membershipId/permissions` | Owner-only | `{ permissionKey }`. `400` unknown key, `404` `membershipId` not on this ground, `409` already granted. Step-up-gated (`PERMISSION_GRANT`, Phase 6). |
| `DELETE /:membershipId/permissions/:permissionKey` | Owner-only | `404` if not currently active (never a silent no-op). Never step-up-gated — revoking only reduces privilege. |
| `PATCH /:membershipId/disable` | Owner-only | Deactivates the membership — every permission-gated check re-verifies `is_active` fresh on every request, so this takes effect immediately, no re-login needed. Step-up-gated (`STAFF_DISABLE`, Phase 6). |
| `GET /api/ground-owner/permissions/catalog` | `requireAuth` only | `{ permissions: [{key, description}] }` — the static 4-entry catalog, not ground-scoped. |

Every other route under `/api/ground-owner/grounds/:publicGroundId/...` (matches, umpire slots, proposals,
umpire-operations-summary) is gated by one of `MATCH_VIEW`/`MATCH_MANAGE`/`UMPIRE_MANAGE` — see
`docs/AUTHORIZATION.md`'s full API authorization matrix for the exact route-by-route mapping. The Ground
Owner of that ground always passes regardless of grants (ownership is itself the grant); Super Admin
bypasses every ground-scoped check unconditionally.

## Self-service profile (`/api/me`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /player` | Auth | The caller's own player profile (`{ player: null }` if none linked — not a 404) |
| `PATCH /player` | Auth | Creates the profile on first save if none exists |
| `GET /stats` | Auth | Official career stats for the caller's own linked player — **404** if no player is linked (an accurate "resource doesn't exist" for staff/umpire-only accounts, not a bug) |

## Umpire requests (`/api/umpire-requests`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /me` | Auth | The caller's own latest request |
| `GET /` | Staff | All pending requests |
| `PATCH /:id` | Staff | Approve/reject |

## Teams (`/api/teams`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /discover` | Public | Search + paginated team list (card DTO) |
| `GET /` | Public | Unbounded lightweight team list (used by filter dropdowns) |
| `GET /:id/profile` | Public | Full public team profile — squad, official record, recent form, recent/upcoming/live matches, top performers |
| `GET /:id` | Auth | Raw team row (staff/roster-management use) |
| `GET /:id/players` | Auth | Current roster |
| `POST /:id/players` | Staff | Phase 13 — add a player (`{ publicPlayerId }`) to this team's roster. `players.team_id` is a single FK, so a player already on another team is moved, not duplicated; `409` if already on this team |
| `DELETE /:id/players/:publicPlayerId` | Staff | Phase 13 — remove a player from this team's roster (clears `team_id`); `404` if the player isn't currently on this team |

## Players (`/api/players`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /` | Public | Search/discovery, paginated |
| `GET /:publicPlayerId` | Public | Public profile |
| `GET /:publicPlayerId/stats` | Public | Official career stats (finalized matches only) |

## Leaderboards (`/api/stats`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /leaderboards/:metric` | Public | `role`/`teamId` filters, paginated; qualification rules centralized in `domain/statistics/leaderboardConfig.js` |

## Matches (`/api/matches`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /discover` | Public | `category` (`LIVE`\|`UPCOMING`\|`RESULTS`, required) + `limit`/`offset` |
| `GET /home` | Public | Homepage feed: featured live + bounded upcoming/results |
| `GET /` | Public | Unbounded match list (staff match-creation flows) |
| `POST /` | Scorer | Create a match |
| `GET /:id` | Public | Raw match + team names |
| `GET /:id/summary` | Public | Full public Match Summary DTO; `tournamentContext` is `null` unless the match is tournament-linked (Phase 15) |
| `GET /:id/live-state` | Public | Lightweight spectator live-state DTO, meant to be polled |
| `GET /:id/commentary` | Public | Deterministic commentary feed (Phase 12) — `inningsId` (default: latest), `before`/`limit` (pagination cursor, newest-first), `type` (one `COMMENTARY_TYPES` value) query params |
| `PATCH /:id/toss` | Scorer | |
| `POST /:id/start` | Scorer | Requires toss + minimum Playing XI on both sides |
| `POST /:id/finalize` | Scorer | One-way lock; only reachable from `completed` |

## Match setup & scoring (`/api/matches/:matchId/...`, `/api/innings/:inningsId/...`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /matches/:matchId/match-players` | Public | Roster for this match |
| `POST /matches/:matchId/match-players` | Scorer | Add a player to the Playing XI |
| `GET /matches/:matchId/innings` | Public | |
| `POST /matches/:matchId/innings` | Scorer | Innings 2+ must reverse innings N-1's batting/bowling teams |
| `GET /innings/:inningsId/state` | Public | Full replayed state |
| `GET /innings/:inningsId/timeline` | Public | |
| `GET /innings/:inningsId/wagon-wheel` | Public | |
| `POST /innings/:inningsId/deliveries` | Scorer | `expectedVersion` + `clientActionId` required for concurrency/idempotency |
| `POST /innings/:inningsId/events` | Scorer | `batsman-in`, `bowler-change`, `retire`, `penalty-runs`, etc. |

## Match availability / RSVP (`/api/matches/:matchId/availability`, `/api/me/availability/:matchId`) — Phase 14 Part 1

| Method & Path | Access | Notes |
|---|---|---|
| `GET /me/availability/:matchId` | Auth | The caller's own RSVP; `{eligible: false, status: null}` if not on either team |
| `PATCH /me/availability/:matchId` | Auth | Body `{status: 'AVAILABLE'\|'NOT_AVAILABLE'}`; own player only, never an arbitrary `playerId`; `409` once the match is no longer `upcoming` |
| `GET /matches/:matchId/availability` | Scorer | Every eligible player (both teams), `PENDING` default — organizer read view, informational only |

## Corrections (`/api/innings/:inningsId/corrections`)

| Method & Path | Access | Notes |
|---|---|---|
| `POST /preview` | Scorer | No write — reports exactly which downstream deliveries/dismissals would change |
| `POST /` | Scorer | Applies the correction inside a transaction, bumps `innings.version` |
| `GET /` | Scorer | Correction history |
| `POST /:correctionId/undo` | Scorer | Creates a new, reversing correction row — never mutates the original |

## Realtime (Socket.IO, same origin as the API — `VITE_SOCKET_URL`)

One shared Socket.IO server. Public, unauthenticated — matches the public-read posture of the
Match Summary/live-state HTTP endpoints (Part 4 of the Phase 11 spec: subscribing to a match's
live state is not a privileged action). Scoring/correction writes always go through the
authenticated HTTP endpoints above — there is no socket-based write path (Part 45).

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `join-match` | client → server | `{ matchId }` | Server validates the match exists before joining the `match:{matchId}` room; the client never controls the raw room string |
| `leave-match` | client → server | `{ matchId }` | |
| `match:state` | server → room | the same live-state DTO `GET /matches/:id/live-state` returns, plus `{ matchId, reason }` | `reason` is informational only (`delivery`\|`event`\|`correction`\|`correction_undo`\|`lifecycle`\|`match_completed`) — never branch client logic on it |
| `match:commentary` | server → room | `{ matchId, inningsId, inningsVersion, mode, entries }` (Phase 12) | `mode` is `append` (entries = newly-persisted commentary rows) or `resync` (entries = `[]` — client refetches `GET /:id/commentary`) |
| `match:error` | server → client | `{ message }` | Invalid/missing matchId, or match not found |
| `join-booking-date` / `leave-booking-date` | client → server | `{ dateStr }` | Phase 14 — joins room `booking:{dateStr}` |
| `booking:updated` | server → room | `{ dateStr }` | A refresh signal only (no payload data) — clients re-fetch `GET /bookings/availability`. Correctness never depends on this delivering (Part 42) |

Canteen realtime events (`join-staff-room`, `join-order-room`, `join-user-room`,
`menu.updated`/`menu-updated`, `order-created`, `order-status-updated`, `order-completed`) are
unrelated and unchanged — see `docs/ARCHITECTURE.md` §10.

## Canteen (`/api/canteen/menu`, `/api/canteen/orders`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /menu` | Public | Today's live menu |
| `GET /menu/master` | Public | Full master item catalogue |
| `GET /menu/today/config` | Public | |
| `PATCH /menu/today` | Staff | Updates today's active menu |
| `POST/PATCH/DELETE /menu/master...` | Staff | Menu item CRUD, image upload |
| `POST /orders` | Auth | Places an order for the caller |
| `GET /orders/active/:userId` | Auth (owner or staff) | |
| `GET /orders/history/:userId` | Auth (owner or staff) | |
| `GET /orders`, `GET /orders/lookup`, `GET /orders/:id`, `PATCH /orders/:id/status` | Staff | |

## Ground Booking (`/api/bookings`) — Phase 14 Part 3

PostgreSQL is authoritative (see docs/ARCHITECTURE.md's Phase 14 section); Google Calendar is
sync-only, never queried for availability.

| Method & Path | Access | Notes |
|---|---|---|
| `GET /availability?date=YYYY-MM-DD` | Public | Slot grid for one ground-local date; `reason` is `null` unless the caller is staff (Part 47 — public view only ever sees AVAILABLE/UNAVAILABLE) |
| `POST /` | Auth | Body: `{startTime}` (an ISO instant from `GET /availability`, preferred) or `{date, hour, minute}`, plus `purpose`/`expectedPlayers`/`contactPhone`/`clientActionId` (optional). `409 BOOKING_CONFLICT` with `{details: {alternatives}}` on a lost race |
| `GET /my` | Auth | The caller's own bookings |
| `POST /:publicBookingId/cancel` | Auth (owner or staff) | Releases the slot immediately (the DB exclusion constraint excludes `CANCELLED` rows) |
| `GET /staff/schedule?from=&to=` | Staff | Every booking + staff block in range |
| `POST /staff/block` | Staff | Same body shape as `POST /`, `bookingType` forced to `STAFF_BLOCK`; body may include `blockType` (Phase 18 — one of `GRASS_MAINTENANCE`/`PITCH_MAINTENANCE`/`CLEANING`/`ELECTRICAL_WORK`/`WATER_MAINTENANCE`/`PITCH_ROLLING`/`PITCH_WATERING`/`PRIVATE_EVENT`/`FESTIVAL`/`RAIN`/`EMERGENCY`/`OTHER`), otherwise `null` |
| `DELETE /staff/block/:publicBookingId` | Staff | `404` if that reference isn't actually a staff block |
| `GET /history?q=&status=&bookingType=&from=&to=&limit=&offset=` | Staff | Phase 18 Feature 10 — search/filter/paginate every booking+block. `{pagination, items: [{..., displayStatus}]}` |

Every booking/block response also carries `displayStatus` (Phase 18): `APPROVED` (confirmed, still
upcoming), `COMPLETED` (confirmed, slot has passed), or `CANCELLED` — see docs/ARCHITECTURE.md §18.5
for why LOC has no separate PENDING/REJECTED state.

## Team Bookings & Match Proposals (`/api/grounds/:publicGroundId/bookings`, `/proposals`) — Phase 24/25

Multi-ground, team/player-aware conflict engine — see `docs/BOOKING.md` for the full design. Distinct
from the legacy walk-in flow above; a `booking_purpose` of `MATCH`/`PRACTICE` (never `WALK_IN`).
`teamId` authorization is always derived from the caller's own current `players.team_id`, never
trusted from the request body.

| Method & Path | Access | Notes |
|---|---|---|
| `POST /grounds/:publicGroundId/bookings` | Auth | Body: `{bookingPurpose: 'MATCH'\|'PRACTICE', startTime, endTime, teamId?, participantPlayerIds, matchFormat?, purpose?, notes?, clientActionId?}`. `teamId` required for `MATCH`. Straight to `CONFIRMED`; `409 GROUND_SLOT_UNAVAILABLE`/`TEAM_TIME_CONFLICT`/`PLAYER_TIME_CONFLICT` names the specific axis that lost |
| `GET /grounds/:publicGroundId/bookings/:publicBookingId` | Auth (owner, teammate, or ground staff with `BOOKING_VIEW`/`BOOKING_MANAGE`) | `404` for a WALK_IN booking, a wrong-ground booking, or an unauthorized viewer — same shape either way |
| `POST /grounds/:publicGroundId/bookings/:publicBookingId/cancel` | Auth (owner or any team on the booking) | |
| `POST /grounds/:publicGroundId/bookings/:publicBookingId/staff-cancel` \| `/check-in` \| `/no-show` | `requireGroundPermission('BOOKING_MANAGE')` | Ground-scoped staff/owner only; tenancy-checked against the booking's real `ground_id`, not just the URL |
| `GET /grounds/:publicGroundId/proposals` | Public | Every OPEN, unexpired proposal at this ground — discovery is deliberately public, same posture as `GET /bookings/availability` |
| `GET /grounds/:publicGroundId/proposals/:publicProposalId` | Public | |
| `POST /grounds/:publicGroundId/proposals` | Auth | Same body as a MATCH booking; `teamId` required. Reserves the ground + proposing team/players immediately (`status: 'PROPOSED'`) |
| `POST /grounds/:publicGroundId/proposals/:publicProposalId/accept` | Auth | Body: `{teamId, participantPlayerIds}`. Atomic claim-then-attach (only one concurrent acceptor can ever win); `409 PROPOSAL_ALREADY_ACCEPTED`/`PROPOSAL_EXPIRED`/`PROPOSAL_CANCELLED`, `400 SELF_ACCEPT_NOT_ALLOWED` |
| `POST /grounds/:publicGroundId/proposals/:publicProposalId/cancel` | Auth (proposing-team member) | OPEN proposals only — a `CONFIRMED` one must be withdrawn via the ordinary booking-cancel route above |

## Ground Operations (`/api/ground`) — Phase 18

Every read here derives from the SAME `ground_bookings` table (+ the existing read-only LOC-match
occupancy link) the booking endpoints above already use — no second occupancy source. `/timeline` is
public (same posture as `GET /bookings/availability`); every other endpoint is staff-only.

| Method & Path | Access | Notes |
|---|---|---|
| `GET /timeline?date=YYYY-MM-DD` | Public | `{date, segments: [{startTime, endTime, type: 'BOOKING'\|'BLOCK'\|'MATCH'\|'FREE', label}]}` — the day's full ordered schedule, gap-free (Feature 8) |
| `GET /dashboard` | Staff | Today's snapshot: ground status, today's matches/bookings/blocks, upcoming maintenance (next 7 days), upcoming tournament fixtures, `pendingRequestsCount` (always 0 — no approval workflow exists), and the day's timeline (Feature 7) |
| `GET /reports?from=&to=` | Staff | `{totalBookings, completed, cancelled, busyDays: [{date_str, count}], peakHours: [{hour, count}]}` (Feature 11) |
| `GET /utilization?from=&to=` | Staff | `{totalHours, bookedHours, blockedHours, matchHours, freeHours, bookedPercentage, blockedPercentage, matchPercentage, utilizedPercentage}` — exact formula in docs/ARCHITECTURE.md §18.12 (Feature 12) |
| `GET /audit-log?entityType=&entityId=` or `?limit=&offset=` | Staff | Every booking/block CREATED/CANCELLED/GOOGLE_SYNC event, full before/after snapshots (Feature 16) |
| `GET /notifications?limit=&offset=` | Auth | `{notifications, total, unreadCount}` — the caller's own in-app notifications only |
| `POST /notifications/:id/read` | Auth | Marks one notification read |
| `POST /notifications/read-all` | Auth | Marks every notification read |

## Tournament Management (`/api/tournaments`) — Phase 15

Tournament fixtures link to real matches, scored through the unchanged `/api/matches` /
`/api/innings` endpoints above. No tournament-specific scoring/replay endpoint exists.

| Method & Path | Access | Notes |
|---|---|---|
| `GET /` | Public | Discovery; `category` = `LIVE`\|`UPCOMING`\|`COMPLETED` |
| `GET /:publicTournamentId` | Public | Tournament identity/lifecycle/champion |
| `GET /:publicTournamentId/teams` | Public | Registered teams (+ group, for Groups+Knockout) |
| `GET /:publicTournamentId/squad` | Public | Historical squad — survives a later player transfer |
| `GET /:publicTournamentId/fixtures` | Public | Every fixture, `awaitingResolution: true` on a finalized tie/no-result knockout match nobody has manually resolved yet |
| `GET /:publicTournamentId/standings` | Public | `{overall}` for LEAGUE, `{groupA, groupB}` for GROUPS_KNOCKOUT, `null` for KNOCKOUT (the bracket is the standings) |
| `GET /:publicTournamentId/statistics` | Public | Top run scorers / wicket takers, scoped to this tournament's finalized matches only |
| `POST /` | Staff | Create (`name`, `format`, `startDate`, `endDate`, `oversPerInnings`, `maxTeams`, `maxSquadSize`) — starts `DRAFT` |
| `POST /:publicTournamentId/open-registration` | Staff | `DRAFT` → `REGISTRATION` |
| `POST /:publicTournamentId/teams` | Staff | Register an existing team (`teamId`, optional `groupName`); `409 TEAM_ALREADY_REGISTERED` / `409 TOURNAMENT_FULL` |
| `DELETE /:publicTournamentId/teams/:teamId` | Staff | Only while `REGISTRATION` |
| `POST /:publicTournamentId/squad` | Staff | Add a player to a registered team's squad; `409 PLAYER_ALREADY_REGISTERED` if already in this tournament (any team), `409 SQUAD_FULL` |
| `DELETE /:publicTournamentId/squad/:teamId/:playerId` | Staff | Only while `REGISTRATION` |
| `POST /:publicTournamentId/fixtures/generate` | Staff | Round-robin/groups/knockout generation; `REGISTRATION` → `SCHEDULED`; `409 FIXTURES_ALREADY_GENERATED` on a repeat call (idempotent) |
| `PATCH /:publicTournamentId/fixtures/:fixtureId/schedule` | Staff | Creates the real LOC match (`matchDate`, `venue`), inheriting the tournament's overs/balls-per-over |
| `POST /:publicTournamentId/fixtures/:fixtureId/resolve` | Staff | Manual `winnerTeamId` override for a finalized tie/no-result knockout match — LOC has no Super Over engine, so this is never automatic |
| `POST /:publicTournamentId/complete` | Staff | LEAGUE only — champion = final standings winner; requires every league fixture finalized first |

Errors follow the same structured `{code, message, details}` shape as scoring/booking
(`domain/tournament/errors.js`): `TOURNAMENT_NOT_FOUND`, `INVALID_TOURNAMENT_STATE`,
`TEAM_ALREADY_REGISTERED`, `TEAM_NOT_REGISTERED`, `PLAYER_ALREADY_REGISTERED`, `SQUAD_LOCKED`,
`SQUAD_FULL`, `TOURNAMENT_FULL`, `FIXTURES_ALREADY_GENERATED`, `INVALID_FIXTURE_STATE`,
`FIXTURE_NOT_FOUND`, `KNOCKOUT_RESULT_UNRESOLVED`, `INVALID_TEAM_COUNT`, `VALIDATION_ERROR`,
`FORBIDDEN`.

## AI Insight (`/api/matches/:id/ai-insight`, `/api/players/:publicPlayerId/ai-insight`, `/api/teams/:id/ai-insight`) — Phase 16

Every GET here returns HTTP 200 with `{available: boolean, ...}` — "no insight yet" is never an
error. `available: false` carries a `reason`: `NOT_CONFIGURED` (no `AI_API_KEY`), `INSUFFICIENT_DATA`
(match not finalized yet, or player/team has zero eligible matches), `PROVIDER_ERROR` (timeout/
network/5xx), `DECLINED` (provider safety refusal), or `INVALID_OUTPUT` (malformed/out-of-schema
provider response — never trusted). A genuine 404 only ever means the match/player/team itself
doesn't exist.

| Method & Path | Access | Notes |
|---|---|---|
| `GET /matches/:id/ai-insight` | Public | `{available, insight: {headline, summary, keyMoments[], standoutPerformers[]}, generatedAt, cached}` once available. Generated only for FINALIZED matches. |
| `GET /players/:publicPlayerId/ai-insight` | Public | `{available, insight: {headline, summary, highlights[]}, ...}`. Scoped to official (finalized-only) career stats. |
| `GET /teams/:id/ai-insight` | Public | Same shape as player insight, scoped to the official team record. |
| `POST /matches/:id/ai-insight/regenerate` | Staff | Forces regeneration, bypassing the cache. Not a normal spectator control. |
| `POST /players/:publicPlayerId/ai-insight/regenerate` | Staff | Same, for a player. |
| `POST /teams/:id/ai-insight/regenerate` | Staff | Same, for a team. |

See `docs/ARCHITECTURE.md`'s Phase 16 section for the full context-builder/fingerprint/caching/
guardrail design.

## Advanced Cricket Analytics (`/api/players/:publicPlayerId/analytics`, `/api/teams/:id/analytics`, `/api/matches/:id/analytics`, `/api/tournaments/:publicTournamentId/analytics`, `/api/players/compare`, `/api/teams/compare`) — Phase 17

Every endpoint here is a public, unauthenticated GET — analytics are derived read-only views over
already-public cricket data (same posture as Match Summary/Player/Team profiles). No AI involved;
every number is deterministically computed from PostgreSQL. See `docs/ARCHITECTURE.md`'s Phase 17
section for exact formulas (boundary %, dot-ball %, phase boundaries, etc.).

| Method & Path | Notes |
|---|---|
| `GET /players/:publicPlayerId/analytics?recent=5&tournamentId=` | `{player, recentMatchesConsidered, recentForm[], battingTrend[], bowlingTrend[], consistency, boundaryAnalysis, dotBallAnalysis, dismissalBreakdown[], tournamentBreakdown}`. `recent` clamped 1–20 (default 5). `tournamentId` optional, scopes `tournamentBreakdown` to one tournament. 404 for an unknown player. |
| `GET /teams/:id/analytics?recent=5` | `{team, recentMatchesConsidered, recentForm[], battingFirstVsChasing, averageScore, averageConceded, runRateTrend[], tournamentPerformance[], topContributors}`. 404 for an unknown/non-numeric team id. |
| `GET /matches/:id/analytics` | `{available, match, teams, innings: [{inningsId, inningsNumber, progression[], phaseMetrics, highestPartnership}], scoreComparison}`. `available: false, reason: 'INSUFFICIENT_DATA'` before any innings exists (never an error). `phaseMetrics` is `null` for a match with fewer than 3 overs per innings. 404 for an unknown match. |
| `GET /tournaments/:publicTournamentId/analytics` | `{tournament, totalFixtures, finalizedMatches, totalRuns, totalWickets, averageFirstInningsScore, highestTeamTotal, lowestTeamTotal, topRunScorers[], topWicketTakers[]}`. `topRunScorers`/`topWicketTakers` reuse Phase 15's `tournamentStats.service.js` unmodified. 404 for an unknown tournament. |
| `GET /players/compare?p1=&p2=` | `{playerA: {player, career}, playerB: {player, career}}` — side-by-side official career stats, no composite winner ever computed. 400 if `p1 === p2`; 404 if either player is unknown. |
| `GET /teams/compare?t1=&t2=` | `{teamA: {team, record, averageScore}, teamB: {...}, headToHead: {matchesPlayed, teamAWins, teamBWins, ties, noResults, recentMeetings[]}}`. `headToHead` uses each match's historical `team_a_id`/`team_b_id` — a player transfer after the match never affects it. 400 if `t1 === t2`; 404 if either team is unknown. |

## Ground/marketing content (`/api/ground-photos`, `/api/amenities`, `/api/advertisements`, `/api/partners`)

| Method & Path | Access |
|---|---|
| `GET /` | Public |
| `POST /`, `POST /upload`, `DELETE /:id` | Staff |

## External widget (`/api/india-match`)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /featured` | Public | Proxies CricAPI for an unofficial "India match" homepage widget. Returns `null` (never a 500) if unconfigured/unavailable — this is NOT LOC's own cricket data. |

## Health (Phase 20)

| Method & Path | Access | Notes |
|---|---|---|
| `GET /health` | Public | Liveness — checks nothing external, always `{"status":"ok"}` if the process is up. |
| `GET /health/ready` | Public | Readiness — a real Postgres query. `200` + `{"status":"ready","postgres":"connected","optional":{"mongodb":...,"googleCalendar":...,"ai":...}}` if it succeeds, `503` + `{"status":"not_ready",...}` if it fails. The `optional` block is informational only — MongoDB/Calendar/AI state never affects the status code, since none of them are hard dependencies. |
| `GET /canteen/health` | Public | Legacy canteen-specific health check, pre-dates the two above. |

---

**Response conventions** (current state, not fully uniform — see docs/TECHNICAL_DEBT.md if
standardizing this becomes a priority): most endpoints return either the resource directly wrapped
in a named key (`{ match }`, `{ team }`, `{ players }`) or, for the newer public read-model
endpoints (match discovery, match summary, live state, team profile), the DTO directly at the top
level. Errors are `{ message }` or, for scoring/correction domain errors, the structured
`{ code, message, details }` shape from `domain/scoring/errors.js`.
