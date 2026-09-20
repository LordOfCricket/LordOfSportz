# PHASE 5D.5 — MATCH PROPOSALS ARCHITECTURE AUDIT

**Date:** 2026-08-20  
**Status:** ✅ **ARCHITECTURE VERIFIED**

---

## EXECUTIVE SUMMARY

Discovery audit revealed that LOC already has a complete, production-grade backend infrastructure for match proposals (Phase 25). The system is fully functional and supports the required player/team workflow for creating, accepting, and cancelling match proposals. Mobile integration is the remaining gap.

**Architecture Classification:** Player/Team-to-Team Match Proposals (Ground-specific)

**Backend Status:** ✅ COMPLETE & VERIFIED
**Mobile Status:** ❌ MISSING (to be implemented in Phase 5D.5)

---

## EXISTING BACKEND ARCHITECTURE

### Database Table: match_proposals

**Schema:**
```sql
CREATE TABLE match_proposals (
  id SERIAL PRIMARY KEY,
  public_proposal_id VARCHAR(20) UNIQUE NOT NULL,
  ground_id INTEGER NOT NULL REFERENCES grounds(id),
  booking_id INTEGER NOT NULL UNIQUE REFERENCES ground_bookings(id) ON DELETE CASCADE,
  proposing_team_id INTEGER NOT NULL REFERENCES teams(id),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' 
    CHECK (status IN ('OPEN', 'ACCEPTED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  proposal_expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_team_id INTEGER REFERENCES teams(id),
  accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT match_proposals_teams_differ CHECK (
    accepted_by_team_id IS NULL OR accepted_by_team_id <> proposing_team_id
  )
);

CREATE INDEX idx_match_proposals_status ON match_proposals(status, proposal_expires_at);
CREATE INDEX idx_match_proposals_ground ON match_proposals(ground_id);
```

**Key Relationships:**
- Linked to ground_bookings (1:1, ON DELETE CASCADE)
- Linked to teams (proposing and accepting)
- Linked to users (creator and acceptor)
- Status transition machine enforced
- Team differentiation enforced (proposer ≠ acceptor)

### Backend Controllers & Services

**File:** server/src/controllers/matchProposal.controller.js (118 lines)
**Functions:**
- `createMatchProposal(req, res, next)` — Create proposal
- `listOpenProposals(req, res, next)` — List ground proposals
- `getMatchProposal(req, res, next)` — Get proposal detail
- `acceptMatchProposal(req, res, next)` — Accept proposal
- `cancelMatchProposal(req, res, next)` — Cancel proposal

**File:** server/src/services/matchProposal.service.js (350+ lines)
**Functions:**
- `createMatchProposal({...})` — Full validation, booking creation, transaction
- `acceptMatchProposal({...})` — Atomic claim + attach with concurrency safety
- `cancelMatchProposal(...)` — Status transition with validation
- `findProposalDetail(publicProposalId)` — Detail fetch
- `listOpenProposalsForGround(groundId)` — List query
- `expireStaleProposals()` — Batch expiry

### API Routes

**File:** server/src/routes/matchProposal.routes.js
**Base Path:** `/grounds/:publicGroundId/proposals`

**Endpoints:**

```
GET /
  - Public (no auth required)
  - Returns: { proposals: [...] }
  - Purpose: List open proposals for ground

GET /:publicProposalId
  - Public (no auth required)
  - Returns: { proposal: {...} }
  - Purpose: View proposal detail

POST /
  - Auth required
  - Body: { teamId, startTime, endTime, matchFormat?, participantPlayerIds?, purpose?, notes?, clientActionId?, expiresInHours? }
  - Returns: { proposal: {...} }
  - Purpose: Create proposal
  - Rate limit: bookingWriteLimiter

POST /:publicProposalId/accept
  - Auth required
  - Body: { teamId, participantPlayerIds? }
  - Returns: { proposal: {...} }
  - Purpose: Accept proposal (non-proposing team)
  - Rate limit: bookingWriteLimiter

POST /:publicProposalId/cancel
  - Auth required
  - Body: { reason?: string }
  - Returns: { proposal: {...} }
  - Purpose: Cancel proposal (proposing team only)
  - Rate limit: bookingWriteLimiter
```

---

## AUTHORIZATION MODEL — BACKEND VERIFIED

### Creating a Proposal

**Who can create:**
```
actingUserId (from req.user.id)
    ↓
engine.resolveActingPlayer(actingUserId)
    ↓ must have Player record
authenticated player
    ↓
engine.assertTeamAuthority(actingPlayer, teamId)
    ↓ verify: actingPlayer.team_id === teamId
player is MEMBER of Team A
    ↓
✅ Can create proposal for Team A
```

**Authorization Checks:**
- Player must exist (not just user account)
- Player must be current member of proposing team
- Team must exist
- Ground must be ACTIVE
- Time must be valid for ground
- No more than MAX_OPEN_PROPOSALS_PER_TEAM active proposals

**Result:** Backend-authoritative team membership, no client control

### Accepting a Proposal

**Who can accept:**
```
actingUserId (from req.user.id)
    ↓
engine.resolveActingPlayer(actingUserId)
    ↓
authenticated player
    ↓
engine.assertTeamAuthority(actingPlayer, acceptingTeamId)
    ↓
player is MEMBER of Team B
    ↓
assert: acceptingTeamId !== proposal.proposing_team_id
    ↓ (line 172: "A team cannot accept its own proposal")
Team B ≠ Team A
    ↓
✅ Can accept proposal
```

**Concurrency Safety:**
- Single atomic conditional UPDATE (WHERE status = 'OPEN' AND proposal_expires_at > NOW())
- Only one winner per proposal (Postgres serialization)
- Losing players get clean error
- Full transaction rollback if EXCLUDE constraints violated

**Result:** Only different teams can accept, backend enforces atomicity

### Cancelling a Proposal

**Who can cancel:**
```
actingUserId (from req.user.id)
    ↓
engine.resolveActingPlayer(actingUserId)
    ↓
authenticated player
    ↓
assert: actingPlayer.team_id === proposal.proposing_team_id
    ↓
player is MEMBER of proposing team
    ↓
✅ Can cancel proposal
```

**Status Requirement:**
- Only OPEN proposals can be cancelled
- CONFIRMED, CANCELLED, EXPIRED are terminal
- Confirmed matches cancelled via booking endpoint (different authorization)

**Result:** Only proposers can cancel, only before acceptance

---

## PROPOSAL LIFECYCLE STATE MACHINE

### Status Values

**OPEN**
- Initial state after creation
- Proposal is active and awaitable
- Accepting team can accept
- Proposing team can cancel
- Expires after proposal_expires_at

**CONFIRMED**
- Transitioned to after successful acceptance
- Terminal state (cannot revert)
- Match now has both teams committed
- Subsequent cancellation via booking endpoint (not proposal endpoint)

**CANCELLED**
- Proposal rejected or cancelled by proposer
- Terminal state
- Booking reverted (status='CANCELLED')

**EXPIRED**
- Reached by lazy sweep (per-transaction) or batch job
- Terminal state
- Proposal no longer acceptable

### Valid Transitions

```
OPEN
 ├→ CONFIRMED (via accept)
 ├→ CANCELLED (via cancel by proposer)
 └→ EXPIRED (by time)

CONFIRMED, CANCELLED, EXPIRED
 └→ (no further transitions)
```

### Invalid Transitions (Rejected)

- CONFIRMED → CANCELLED (use booking endpoint)
- CONFIRMED → REJECTED (not supported)
- CANCELLED → OPEN (not supported)
- EXPIRED → OPEN (not supported)

---

## PROPOSAL EXPIRY

### Default TTL
- Environment: PROPOSAL_EXPIRY_HOURS (default: 48 hours)
- Can be overridden per proposal

### Clamping Rule
- Proposal cannot outlive its match
- proposal_expires_at ≤ match_start_time
- Prevents acceptance after match start

### Expiry Mechanism
- Lazy expiry (per-transaction sweep on create/accept)
- Batch expiry (optional background job, not yet scheduled)
- Stateless (no scheduler required for correctness)

---

## DATABASE INTEGRATION

### Booking Relationship

**Critical Dependency:**
- Every proposal is backed by a PROPOSED ground_booking row
- Booking reserves ground/team/player slots
- Proposal is thin metadata layer on top
- ON DELETE CASCADE ensures consistency

**Booking Lifecycle:**
```
Create Proposal
    ↓
INSERT ground_booking (status='PROPOSED', purpose='MATCH')
    ↓
INSERT match_proposals (links to booking_id)
    ↓
ground_booking blocks ground slot immediately
    ↓
Accept Proposal
    ↓
UPDATE ground_booking SET status='CONFIRMED'
    ↓
booking_teams now has both HOME (proposer) and AWAY (acceptor)
    ↓
Match is active, locked in
```

### Participant Tracking

**Player Participation:**
- Proposer specifies initial participants
- Acceptor specifies their team's participants
- Backend validates both teams' roster and slot availability
- EXCLUDE constraints prevent double-booking

### Validation Shared with Bookings

Uses same validation as direct booking:
- `validateBookingTimeRange()` — Ground operating hours
- `assertBookingLimits()` — Per-team/player booking caps
- `insertTeamSlot()` — EXCLUDE conflict detection
- `insertPlayerSlot()` — EXCLUDE conflict detection

---

## CONCURRENCY & IDEMPOTENCY

### Race Condition Handling

**Duplicate Creation (clientActionId):**
- Client supplies unique clientActionId per proposal attempt
- Idempotent detection on create
- Same action replayed returns same proposal (200, not 201)

**Concurrent Acceptance:**
- Two teams try to accept same proposal simultaneously
- Postgres UPDATE serialization guarantees exactly one winner
- Loser gets clean error "This proposal has expired" (reloaded status)
- Loser's transaction fully rolled back

**Concurrent Cancellation & Acceptance:**
- Proposer cancels while another team accepts
- First actor to claim wins
- Second actor sees status change and fails cleanly
- No partial state

### Transaction Boundaries

All mutations are single atomic transactions:
- BEGIN
- Validation checks
- Database mutations
- COMMIT or full ROLLBACK

---

## EXISTING BACKEND LIMITATIONS

### What the Backend Does NOT Support (Yet)

1. **Automatic Expiry Scheduling** — Batch expiry is available but not automatically scheduled. Lazy expiry (per-transaction) is sufficient for correctness but not efficient at scale.

2. **Proposal Editing** — Proposals cannot be edited after creation. Must cancel and recreate.

3. **Proposal History** — Only current state stored. No audit trail of status changes (logging via auditLogService exists but not queryable).

4. **Proposal Countering** — Cannot counter-propose. Only accept/reject.

5. **Filters/Sorting** — listOpenProposalsForGround returns all open proposals unsorted. Mobile must handle filtering client-side if needed.

6. **Team Roster Integration** — Participants are raw lists. No validation that players actually belong to teams (yet).

---

## MOBILE EXPOSURE STATUS

**Current State:** ❌ NO MOBILE API
- No matchProposalApi.ts
- No useMatchProposals hook
- No proposal screens
- No proposal navigation

**Required Implementation:**
- Types for MatchProposal, MatchProposalsListResponse
- API service wrapping backend endpoints
- TanStack Query hooks
- Screens: list proposals, view detail, actions
- Navigation integration
- Error handling
- Caching strategy

---

## SECURITY ANALYSIS

### ✅ Authentication
- All write operations require session
- Session must contain valid req.user.id
- HTTP-only cookies prevent XSS

### ✅ Authorization
- Backend derives team membership from player record
- Client cannot specify or forge team_id
- Player must be member of team (backend-authoritative)
- proposing_team_id ≠ accepted_by_team_id (enforced)

### ✅ Ownership
- acceptor verified via actingPlayer.team_id
- proposer verified via actingPlayer.team_id
- Cannot accept own proposal
- Cannot cancel others' proposals

### ✅ IDOR Prevention
- proposal_id used in URL but validated against ground_id
- assertProposalBelongsToUrlGround() ensures ground match
- Proposal cannot be accessed via wrong ground
- Ground access itself is validated

### ✅ Data Integrity
- FK constraints on ground_id, booking_id, team_ids
- ON DELETE CASCADE prevents orphans
- Status transition machine enforced
- Unique constraint on public_proposal_id

### ✅ Concurrency Safety
- Atomic UPDATE with conditional (prevents double-acceptance)
- Full ROLLBACK on any constraint violation
- No partial state

### ⚠️ Potential Future Concerns
- No rate limiting on proposal creation (only bookingWriteLimiter)
- No quota per player (only per-team limit)
- No approval workflow (direct accept possible)

---

## EXISTING BACKEND CAPABILITIES — COMPREHENSIVE

The backend infrastructure supports:

✅ Create proposal (player, team, ground, date, format, participants)
✅ List open proposals (public, no auth)
✅ View proposal detail (public)
✅ Accept proposal (authenticated different team)
✅ Cancel proposal (authenticated proposer)
✅ Expiry (lazy + optional batch)
✅ Idempotency (clientActionId)
✅ Concurrency safety (atomic CAS + transaction)
✅ Conflict detection (EXCLUDE constraints via booking)
✅ Audit logging (via auditLogService)
✅ Notifications (creates PROPOSAL_ACCEPTED events)
✅ Role-based access (player/team-based, not ground-owner)
✅ Ground validation (must be ACTIVE)
✅ Participant validation (must exist, available slots)
✅ Booking integration (atomic, one booking per proposal)

---

## CONCLUSION

**The existing backend fully supports the required Phase 5D.5 functionality.** Players who are members of teams can:

1. Create proposals on grounds (reserves slots)
2. Accept proposals from other teams (confirms match)
3. Cancel own proposals (releases slots)

Mobile integration is straightforward API exposure with proper caching, error handling, and navigation.

---

## NEXT STEPS

**Phase 5D.5 Implementation:**
1. Create TypeScript types for MatchProposal
2. Create matchProposalApi.ts service
3. Create useMatchProposals hooks
4. Create proposal screens (list, detail)
5. Integrate into grounds navigation
6. Test authorization boundary cases
7. Verify cache invalidation
8. Regression test all features

**No architectural redesign required.** Proceed with mobile integration only.
