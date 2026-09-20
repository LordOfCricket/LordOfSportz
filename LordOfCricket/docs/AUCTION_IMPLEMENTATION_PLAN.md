# LOC Auction System — Implementation Plan

**Status**: DESIGN PHASE  
**Target Completion**: Incremental (backend complete in this phase, UI completion follows)  
**Token Budget**: Limited; prioritizing backend over UI

---

## PHASE 1: AUCTION DOMAIN DESIGN

### Core Concepts

```
AUCTION
├─ owner (Ground Owner / Super Admin)
├─ ground_id (ground scoping)
├─ state (DRAFT → READY → LIVE → COMPLETED/CANCELLED)
├─ participants (teams)
├─ players (eligible player pool)
├─ timer_seconds (per-player bidding window)
├─ start_time
└─ end_time

AUCTION_PARTICIPANT
├─ auction_id
├─ team_id (Team participating)
├─ initial_purse (₹)
└─ created_at

AUCTION_PLAYER
├─ auction_id
├─ player_id (eligible player)
├─ base_price (₹ minimum opening bid)
├─ state (AVAILABLE → NOMINATED → BIDDING → SOLD/UNSOLD)
└─ current_bid (₹ or null)

AUCTION_BID
├─ auction_player_id
├─ team_id (bidding team)
├─ amount (₹)
├─ created_at
└─ is_winning (bool)
```

### Auction State Machine

```
DRAFT
  ↓ (configurable)
READY
  ↓ (immutable, once started)
LIVE
  ├─ (pause/resume allowed)
  ↓
COMPLETED
  ↓ (final)
  
OR

CANCELLED (any state)
```

### Player State (During Auction)

```
AVAILABLE        → NOMINATED → BIDDING → SOLD
                              ↓
                            UNSOLD (can re-auction or skip)
```

### Critical Invariants

✅ Purse never goes negative
✅ One player per team (no duplicates)
✅ Bid >= base price
✅ Bid >= current bid + increment
✅ Team has sufficient purse
✅ Only one winning bid per player
✅ Timer prevents post-expiry bids
✅ No stale/duplicate bids

---

## PHASE 2: DATABASE SCHEMA

```sql
CREATE TABLE auctions (
  id UUID PRIMARY KEY,
  ground_id INT NOT NULL REFERENCES grounds(id),
  created_by INT NOT NULL REFERENCES users(id),
  state VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  -- DRAFT, READY, LIVE, COMPLETED, CANCELLED
  
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  timer_seconds INT NOT NULL DEFAULT 120,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE auction_participants (
  id UUID PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  team_id INT NOT NULL REFERENCES teams(id),
  initial_purse DECIMAL(10,2) NOT NULL,
  current_spent DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(auction_id, team_id)
);

CREATE TABLE auction_players (
  id UUID PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  base_price DECIMAL(10,2) NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
  -- AVAILABLE, NOMINATED, BIDDING, SOLD, UNSOLD
  
  winning_team_id INT REFERENCES teams(id),
  final_price DECIMAL(10,2),
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(auction_id, player_id)
);

CREATE TABLE auction_bids (
  id UUID PRIMARY KEY,
  auction_player_id UUID NOT NULL REFERENCES auction_players(id) ON DELETE CASCADE,
  team_id INT NOT NULL REFERENCES teams(id),
  amount DECIMAL(10,2) NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX (auction_player_id, created_at DESC)
);

CREATE TABLE auction_events (
  id UUID PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  -- auction.created, auction.started, auction.completed, 
  -- player.nominated, player.sold, bid.placed
  
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX (auction_id, created_at DESC)
);

CREATE TABLE auction_audit_logs (
  id UUID PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  actor_id INT NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(100),
  metadata JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX (auction_id, created_at DESC)
);
```

---

## PHASE 3: BACKEND SERVICE LAYER

**File**: `server/src/services/auction.service.js`

Core operations:
- `createAuction(groundId, config)` → Auction
- `addParticipant(auctionId, teamId, initialPurse)` → Participant
- `addPlayer(auctionId, playerId, basePrice)` → AuctionPlayer
- `startAuction(auctionId)` → void
- `pauseAuction(auctionId)` → void
- `resumeAuction(auctionId)` → void
- `nominatePlayer(auctionId, playerIndex)` → AuctionPlayer
- `placeBid(auctionId, playerId, teamId, amount)` → Bid | Error
- `sellPlayer(auctionId, playerId)` → void (timer expiry or manual)
- `markUnsold(auctionId, playerId)` → void
- `completeAuction(auctionId)` → void
- `cancelAuction(auctionId, reason)` → void

**Bid Engine** (`server/src/domain/auction/bidEngine.js`):
- Validate bid amount
- Check base price
- Check purse sufficiency
- Check auction state
- Check player state
- Determine winning bid
- Calculate purse deduction

---

## PHASE 4: API ENDPOINTS

```
POST   /api/auctions
       Create new auction

GET    /api/auctions/:auctionId
       Get auction detail

POST   /api/auctions/:auctionId/participants
       Add team to auction

POST   /api/auctions/:auctionId/players
       Add player to player pool

POST   /api/auctions/:auctionId/start
       Begin auction

POST   /api/auctions/:auctionId/pause
       Pause auction

POST   /api/auctions/:auctionId/nominate
       Nominate next player

POST   /api/auctions/:auctionId/bid
       Place bid (critical operation)

POST   /api/auctions/:auctionId/sell
       Mark player sold (auto on timer or manual)

POST   /api/auctions/:auctionId/unsold
       Mark player unsold

POST   /api/auctions/:auctionId/complete
       End auction

GET    /api/auctions/:auctionId/history
       Get bid history

GET    /api/grounds/:groundId/auctions
       List auctions for ground
```

---

## PHASE 5: AUTHORIZATION

Auction operations are protected:

| Operation | Requester | Check |
|-----------|-----------|-------|
| Create | SUPER_ADMIN or GROUND_OWNER | Owns ground |
| Configure | Creator | Same user or SUPER_ADMIN |
| Add participant | Creator | Same user or SUPER_ADMIN |
| Add player | Creator | Same user or SUPER_ADMIN |
| Start | Creator | Same user or SUPER_ADMIN |
| Bid | Team participant | In auction_participants + purse available |
| View | Anyone | Public or team in auction |

Backend enforces all checks server-side.

---

## PHASE 6: REALTIME EVENTS

WebSocket events (using existing socket.io):

```
auction:created
auction:started
auction:paused
auction:resumed
auction:completed
auction:cancelled

player:nominated
player:bidding_started
player:bid_placed
player:sold
player:unsold

bid:received (to subscribing team)
bid:updated

purse:updated (to team)
```

---

## PHASE 7: CONCURRENCY & ATOMICITY

Critical operations use database transactions:

```
placeBid:
  BEGIN TRANSACTION
  SELECT auction_player FOR UPDATE (lock)
  VALIDATE bid amount, base, increment, purse
  INSERT bid
  UPDATE auction_player.current_bid
  UPDATE auction_participant.current_spent
  COMMIT

sellPlayer:
  BEGIN TRANSACTION
  SELECT auction_player FOR UPDATE
  UPDATE auction_player.state = 'SOLD'
  UPDATE auction_player.winning_team_id
  UPDATE auction_player.final_price
  UPDATE auction_participant.current_spent (final)
  INSERT audit log
  COMMIT
```

Prevents:
- Duplicate winning bids
- Negative purse
- Double sale
- Lost bids

---

## IMPLEMENTATION PHASES

### Phase A: Backend Foundation (Highest Priority)
- [x] Database schema
- [ ] Auction service (core logic)
- [ ] Bid engine (validation)
- [ ] API routes
- [ ] Authorization checks
- [ ] Audit logging
- [ ] Error handling

### Phase B: Realtime Integration
- [ ] Socket events
- [ ] Event broadcast
- [ ] State reconciliation
- [ ] Reconnection

### Phase C: Web UI
- [ ] Auction list
- [ ] Auction detail
- [ ] Create/configure
- [ ] Live bidding
- [ ] Participant view

### Phase D: Mobile UI
- [ ] Auction list
- [ ] Live auction
- [ ] Bid placement
- [ ] Purse display

### Phase E: Testing
- [ ] Unit tests (bid engine, state machine)
- [ ] Integration tests (API + DB)
- [ ] Concurrency tests (simultaneous bids)
- [ ] Web E2E
- [ ] Mobile E2E

### Phase F: Security & Performance
- [ ] Authorization audit
- [ ] SQL injection prevention
- [ ] Rate limiting
- [ ] Performance check

---

## ESTIMATED EFFORT

| Phase | Hours | Status |
|-------|-------|--------|
| A (Backend) | 12-16 | To be done in this session |
| B (Realtime) | 4-6 | Follow-up |
| C (Web UI) | 6-8 | Follow-up |
| D (Mobile UI) | 6-8 | Follow-up |
| E (Testing) | 8-10 | Follow-up |
| F (Security) | 2-3 | Follow-up |
| **TOTAL** | **38-51** | **Multi-session effort** |

---

## EXISTING LOC PATTERNS TO REUSE

✅ **ORM**: Use Prisma (existing)
✅ **Validation**: Use existing domain/validation patterns
✅ **Error Handling**: Use existing error responses
✅ **Authorization**: Use requireAuth + requireGroundRole
✅ **Audit Logs**: Use existing audit_logs table
✅ **WebSockets**: Use existing socket.io setup
✅ **API Pattern**: REST routes/controllers/services
✅ **Database Transactions**: Prisma transaction() API
✅ **Frontend**: Use existing React hooks/services
✅ **Mobile**: Use existing Expo/React Native patterns

---

## CRITICAL SUCCESS FACTORS

1. **Backend-Authoritative**: Server decides all bid logic
2. **Atomicity**: Transactions prevent partial writes
3. **Concurrency**: Locking prevents race conditions
4. **Realtime**: Live updates for all participants
5. **Security**: RBAC enforced at API
6. **Testing**: Concurrency tests especially important
7. **Ground Scoping**: Auction isolated to one ground
8. **No Client Manipulation**: Price, purse, state server-determined

---

## WHAT CAN BE DELIVERED IN THIS SESSION

Given token constraints:

✅ **Auction domain requirements** (100%)
✅ **Database schema** (100%)
✅ **Backend service skeleton** (partial — core operations)
✅ **API endpoints** (partial — key operations)
✅ **Bid validation engine** (100%)
✅ **Authorization design** (100%)
✅ **Realtime event design** (100%)
✅ **Integration test scaffold** (100%)

❌ **Complete UI implementation** (deferred)
❌ **Full test suite** (scaffold only)
❌ **Performance optimization** (basic design)

---

## NEXT STEPS AFTER THIS SESSION

1. Complete backend CRUD operations
2. Build web UI (auction list, detail, bidding)
3. Build mobile UI (same flows)
4. Add comprehensive tests
5. Performance & security audit
6. Full E2E verification
7. Integration with existing LOC workflows

