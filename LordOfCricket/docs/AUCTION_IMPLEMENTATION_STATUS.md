# LOC Auction — Implementation Status

**Last updated**: 2026-09-11 (end of Phase A)

## Current Status

```
DESIGN            COMPLETE
DATABASE          COMPLETE   (6 tables, migrated, constraints verified)
BACKEND           PARTIAL    (lifecycle + roster done; bid engine is Phase B)
API               PARTIAL    (14 endpoints; no bidding endpoints yet)
AUTHORIZATION     COMPLETE   (reuses ground_users membership, no parallel RBAC)
TRANSACTIONS      NOT STARTED (no multi-row write exists yet — Phase B)
REALTIME          NOT STARTED
WEB UI            NOT STARTED
MOBILE UI         NOT STARTED
E2E               NOT STARTED
```

## Architecture

```
Client
  ↓
routes/auction.routes.js          two mount points (ground-scoped, auction-scoped)
  ↓
middlewares/auth.js#requireAuth
  ↓
middlewares/groundAccess.js#requireGroundRole   (ground known from URL)
middlewares/auctionAccess.js                    (ground resolved via auction row)
  ↓
controllers/auction.controller.js  thin: parse → service → shape
  ↓
services/auction.service.js        state rules, validation, audit
  ↓
domain/auction/{auctionState,money}.js   pure, unit-tested
  ↓
repositories/prisma/auction.prisma-repository.js   queries only
  ↓
Postgres (CHECK constraints + partial unique index enforce invariants)
```

## Database

Migration: `prisma/migrations/9_auction_system/migration.sql` (applied).

| Table | Purpose |
|---|---|
| `auctions` | Auction root; ground-scoped, state, timer |
| `auction_participants` | Team + initial purse + current spend |
| `auction_lots` | Player in the pool + base price + sale outcome |
| `auction_bids` | Bid history; one winning bid per lot |
| `auction_events` | Realtime event log (Phase C consumer) |
| `auction_audit_logs` | Actor/action/target audit trail |

Money is `NUMERIC(12,2)` everywhere — never float.
Ids are `VARCHAR(30)` cuid, not sequential ints, since auction ids appear in URLs and future socket room names.

### Invariants enforced by the database (all verified against the real DB)

- `auctions.state` restricted to the 6 known states; `timer_seconds > 0`
- A team cannot join the same auction twice
- `initial_purse > 0`; `0 <= current_spent <= initial_purse` → **remaining purse can never be negative**
- A player cannot be listed twice in one auction; `lot_number` unique per auction
- `SOLD` requires both winner and final price; any other state must have neither → **no half-written sale**
- `final_price >= base_price`; `current_bid >= base_price`
- **At most one winning bid per lot** (partial unique index) → **double sale impossible even under a race**
- Deleting an auction cascades to lots, bids, events, audit logs

## API

All routes require `requireAuth` first.

| Method | Route | Access | Status |
|---|---|---|---|
| POST | `/api/grounds/:publicGroundId/auctions` | GROUND_OWNER | Implemented |
| GET | `/api/grounds/:publicGroundId/auctions` | GROUND_OWNER | Implemented |
| GET | `/api/auctions/:auctionId` | Ground member | Implemented |
| GET | `/api/auctions/:auctionId/lots` | Ground member | Implemented |
| GET | `/api/auctions/:auctionId/purse` | Ground member | Implemented |
| POST | `/api/auctions/:auctionId/participants` | Auction manager | Implemented |
| DELETE | `/api/auctions/:auctionId/participants/:participantId` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/lots` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/ready` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/start` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/pause` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/resume` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/complete` | Auction manager | Implemented |
| POST | `/api/auctions/:auctionId/cancel` | Auction manager | Implemented |

Not yet built (Phase B): nominate, place bid, sell, mark unsold, re-auction.

## State Machine

Auction: `DRAFT ⇄ READY → LIVE ⇄ PAUSED → COMPLETED`; any non-terminal state → `CANCELLED`.
`COMPLETED` and `CANCELLED` are terminal.

Lot: `AVAILABLE → NOMINATED → BIDDING → SOLD`; `NOMINATED|BIDDING → UNSOLD → NOMINATED` (re-auction).
`SOLD` is terminal — a sold player is never re-auctioned.

Lot transitions are declared now but only exercised in Phase B.

## Business Rules Confirmed

- Configuration (participants, lots, timer) is frozen once the auction is `LIVE`
- `DRAFT → READY` requires ≥2 participating teams and ≥1 player
- `lot_number` is assigned server-side from pool size, never accepted from the client
- Purse is always derived (`initial - spent`), never stored as a third drift-prone column
- Money parsing rejects >2 decimals, negatives, `NaN`/`Infinity`, and thousands separators

## Security Posture

- **Authorization**: reuses `findActiveMembershipForAnyRole` + Super-Admin bypass + MFA gate. No parallel RBAC.
- **Ground scope**: the auction's ground comes from the auction row, never from the request body.
- **IDOR**: auction ids are cuid; access is decided by a membership row keyed on `req.user.id`.
- **Mass assignment**: controllers read named fields only; `req.body` is never spread into a write.
- **Numeric safety**: integer-paise arithmetic; `NUMERIC(12,2)` columns.
- **SQL injection**: all access via Prisma (parameterised).
- **Error leakage**: only `AuctionError` (code + safe message) reaches the client; everything else falls through to the existing handler, which returns a generic 500 and logs the stack server-side.

## Tests

| Suite | Result |
|---|---|
| New auction domain unit tests | 34/34 pass |
| Backend unit suite (`npm test`) | 512/512 pass (478 baseline + 34 new) |
| Frontend suite (`npm test`) | 139/139 pass (unchanged) |
| DB constraint verification vs. real Postgres | 16/16 pass |
| Backend integration suite | **Pre-existing failures — see below** |

### Pre-existing integration failures (NOT caused by Phase A)

`npm run test:integration` was captured **before** any auction change and already
had failures, including:
- `phase23EndToEnd.integration.test.js` — expected 409, got 201 on a duplicate umpire slot assignment
- a `PRICE_UNAVAILABLE` failure in a booking-related scenario

These are a pre-existing baseline defect, unrelated to auction. An earlier audit
report in this repo claimed the full suite was green; that claim was wrong and is
corrected here.

## Remaining Work

### Phase B — Bid engine (next)
1. **Transaction helper first.** No `prisma.$transaction` usage exists anywhere in this codebase yet. Phase B must add `SELECT ... FOR UPDATE` on the lot row inside a transaction before any bid write.
2. `nominatePlayer`, `placeBid`, `sellPlayer`, `markUnsold`, `reauctionPlayer`
3. Bid validation: base price, minimum increment, remaining purse, participant eligibility, auction/lot state, stale/duplicate bid
4. Server-authoritative timer + expiry
5. Idempotency for `placeBid` / `sellPlayer`
6. Concurrency tests: two simultaneous bids must yield exactly one winner

### Phase C — Realtime
Socket events, authorization on subscription, reconnect state recovery.

### Phase D/E — Web UI, Mobile UI

### Phase F — E2E + security audit

## Exact Next Phase

**Phase B: transactional bid engine.** Start by adding a transaction boundary
helper around `prisma.$transaction` with row-level locking on `auction_lots`,
then implement `placeBid` on top of it. Every other Phase B operation depends on
that boundary existing first.
