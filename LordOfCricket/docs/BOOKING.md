# Ground Booking System — Multi-Ground, Team & Player Conflict Engine (Phase 24/25)

## Overview

Phase 14/18 built a working, single-ground, walk-in-only booking engine (`ground_bookings`, `groundBooking.service.js`) whose core guarantee is a Postgres `EXCLUDE USING gist` constraint: two overlapping `CONFIRMED` bookings can never both commit, independent of any application-level check. It has no concept of teams, players, or more than one ground.

Phase 24/25 generalizes that same engine — rather than replacing it — into a real multi-ground marketplace with team- and player-aware conflict checking and a full match-proposal ("looking for an opponent") lifecycle. The walk-in flow (`groundBooking.service.js`, mounted at `/bookings`) is untouched and still owns its own bookings end to end; every new capability lives in `bookingConflict.service.js` (direct MATCH/PRACTICE bookings) and `matchProposal.service.js` (proposals), mounted at `/grounds/:publicGroundId/bookings` and `/grounds/:publicGroundId/proposals`.

## Core invariant

> No two active bookings may overlap on the same ground, the same team, or any participating player — and this must hold under real concurrency, not just sequentially.

## The mechanism: one state machine, three EXCLUDE-constrained tables

`ground_bookings` remains the parent row (now `ground_id`-aware — its own EXCLUDE constraint is partitioned per ground). Two new tables extend the exact same mechanism to the team and player axes:

- `booking_team_slots(booking_id, team_id, time_range)` — `EXCLUDE USING gist (team_id WITH =, time_range WITH &&)`
- `booking_player_slots(booking_id, player_id, time_range)` — `EXCLUDE USING gist (player_id WITH =, time_range WITH &&)`

A booking's parent row + every team-slot + every player-slot row are inserted **together, in one transaction** (`bookingConflict.service.js#insertBookingWithSlots`). If any EXCLUDE constraint anywhere fires, the whole transaction rolls back — one atomic all-or-nothing check across ground, team(s), and every player, immune to the same class of race the original ground-only constraint already proved out. Postgres reports exactly which constraint fired (`err.constraint`), translated to a specific error code — `GROUND_SLOT_UNAVAILABLE` / `TEAM_TIME_CONFLICT` / `PLAYER_TIME_CONFLICT` — never one generic "conflict".

Rows in the two slot tables exist **only while the parent booking is in a blocking status**. `ground_bookings.status` now has a full state machine (`domain/booking/bookingStatus.js`):

```
Blocking (occupy the slot):     HOLD, PROPOSED, PENDING, CONFIRMED
Non-blocking (release the slot): REJECTED, CANCELLED, EXPIRED, COMPLETED, NO_SHOW
```

Leaving a blocking status (cancel, reject, expire, no-show, complete) deletes the booking's slot rows in the same transaction as the status change — that deletion IS "releasing the slot", mechanically.

`booking_participants(booking_id, player_id, added_at, removed_at)` is a **separate, permanent, never-deleted** table — the historical snapshot a cancelled/completed booking must still honestly show. It is intentionally decoupled from the live `booking_player_slots` table: cancelling a booking deletes the *slot* row (releases the conflict) but never the *participant* row (preserves history).

## Direct MATCH/PRACTICE bookings (`bookingConflict.service.js`)

- Goes straight to `CONFIRMED` on success — no extra HOLD round-trip when the team/players/time are all given in one request (a deliberate product decision; see the Phase 24 plan record for the alternative considered).
- **A direct booking can only ever commit ONE real team's slot.** A two-team match can only be created through proposal *acceptance* (below) — letting one team's single request silently commit a second real team's slot without that team's consent is exactly the loophole proposals exist to close.
- Any player currently on a team (`players.team_id = X`) may act for it — `teams` has no owner/captain column, so this is the only authority model the existing schema supports without inventing one.
- Participants are validated as real players but are **not** required to belong to the booking's team — the schema only supports one team per player today, and this matches the "friends playing"/"net practice" use case without fighting that constraint.

## Match proposals (`matchProposal.service.js`)

An OPEN proposal's ground/team/time reservation **is** its linked `ground_bookings` row (`status='PROPOSED'`, `booking_purpose='MATCH'`, one `booking_teams` row with `role='HOME'`) — `match_proposals` is thin metadata (who proposed, expiry, who accepted) layered on top, never a second reservation mechanism. This is why a proposal blocks the ground/team/players from the moment it's created, for free, through the exact same constraints direct bookings use.

### Acceptance — the safety-critical path

```
1. CLAIM  — proposalRepo.claimProposal: one conditional UPDATE
            (WHERE status='OPEN' AND proposal_expires_at > NOW())
            Only one concurrent caller can ever see 1 row affected —
            Postgres's own row-level locking on the UPDATE serializes
            every other simultaneous acceptance attempt for free.
2. ATTACH — only the claim's winner inserts the accepting team's
            booking_teams(role='AWAY')/booking_team_slots/participants
            through the SAME EXCLUDE-constrained path every other
            booking uses.
3. If step 2 fails (accepting team/player unavailable), the WHOLE
   transaction — including the claim — rolls back. The proposal is
   left exactly as OPEN as it was before the attempt.
4. Only if both steps succeed: booking PROPOSED -> CONFIRMED.
```

A same-team retry of an already-won acceptance is treated as an idempotent no-op (returns the confirmed state rather than erroring) — but two *different* users/teams racing for the same proposal is expected to produce exactly one success and one clean, specific failure (`PROPOSAL_ALREADY_ACCEPTED`), matching the brief's own distinction between a client retry and a genuine race.

### Expiry — no external scheduler required for correctness

Postgres's EXCLUDE constraints can't reference `NOW()` — a constraint's blocking predicate is evaluated once, at write time, not continuously. A real sweep (`bookingEngine.repository.js#sweepExpiredHolds`) is therefore run **first, inside the same transaction**, at the start of every proposal- or booking-creating write (the "lazy sweep on contention" pattern) — this is what actually guarantees an expired `PROPOSED`/`HOLD` row can never block a ground slot forever just because nothing has proactively swept it yet. `matchProposal.service.js#expireStaleProposals` is also exported as a proactive entry point for a future scheduler; **not currently wired to an automatic interval** — an explicit, flagged scope decision, not a silent gap, since the lazy path already guarantees correctness on its own.

A proposal's `proposal_expires_at` is always clamped to at most its own match `startTime` — an OPEN proposal can never outlive the match it's for.

### Cancellation

- `matchProposal.service.js#cancelMatchProposal` — proposing-team members only, OPEN proposals only. A `CONFIRMED` proposal must be withdrawn through the ordinary booking-cancel endpoint (`bookingConflict.service.js#cancelTeamBooking`, which any team on the match — not just the original proposer — is already authorized to use), never silently reopened back to OPEN.
- `cancelTeamBooking` keeps `match_proposals.status` in sync whenever it cancels a proposal-linked booking (`booking.proposal_id != null`) — a proposal is never left pointing at `CONFIRMED` after its booking has actually been cancelled.

## Authorization

Reuses the existing two-plane RBAC, no third system invented:

- **Player/team actions** (create/cancel a MATCH/PRACTICE booking, create/accept/cancel a proposal): `requireAuth` + `players.team_id` membership check.
- **Ground-staff actions** (staff-cancel, check-in, no-show): `requireGroundPermission('BOOKING_MANAGE')` (new permission, delegable to `GROUND_ADMIN`; `GROUND_OWNER` has implicit access) — the exact same middleware pattern the canteen/staff routes already use.
- **Booking ID security**: every booking read/write re-verifies ownership/team-membership/staff-permission server-side; a Ground A staff member cannot act on a Ground B booking even knowing its id (`findTeamBookingByPublicId`'s `groundId` tenancy check).
- **Proposal discovery is deliberately public** (no auth required to browse/read) — proposals are explicitly meant to be discoverable by any team looking for an opponent, the same posture as the walk-in flow's public `GET /bookings/availability`. This is a design choice, not an oversight.

## Known, explicitly deferred scope

- **Proposal field editing** (change ground/time/format after creation) is not implemented — cancel and recreate, which reuses fully-tested code paths, is the safe substitute. Flagged as a real gap, not silently skipped.
- **Automatic expiry scheduling** — `expireStaleProposals()` exists but isn't wired to a cron/interval; the lazy per-transaction sweep is the actual correctness guarantee, so this is a "nice to have" for tidiness, not a gap.
- **Booking-limit checks** (`MAX_ACTIVE_BOOKINGS_PER_TEAM`/`_PLAYER`, `MAX_OPEN_PROPOSALS_PER_TEAM`) are count-based pre-checks, not EXCLUDE-constraint-enforced — a small check-then-act race window is an accepted tradeoff (the same class already accepted for the walk-in flow's match-day pre-check), since the real non-negotiable guarantee for actual double-booking is the EXCLUDE constraints, not these limits.
