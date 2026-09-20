-- Auction System — Phase A (database foundation)
--
-- Monetary columns are NUMERIC(12,2), never float: purse/bid arithmetic must be
-- exact. 12 digits total allows up to 9,999,999,999.99 which comfortably covers
-- any realistic team purse while keeping the column narrow.
--
-- Ids are VARCHAR(30) to hold Prisma cuid() values, matching how the client
-- generates them (@default(cuid())). Existing LOC tables use serial ints; the
-- auction tables deliberately differ because auction ids are exposed in URLs and
-- socket room names, where a guessable sequential id is a weaker default.

CREATE TABLE auctions (
  id            VARCHAR(30) PRIMARY KEY,
  ground_id     INTEGER     NOT NULL REFERENCES grounds(id) ON DELETE CASCADE,
  created_by    INTEGER     NOT NULL REFERENCES users(id),
  state         VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  timer_seconds INTEGER     NOT NULL DEFAULT 120,
  started_at    TIMESTAMPTZ(6),
  ended_at      TIMESTAMPTZ(6),
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT auctions_state_check
    CHECK (state IN ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT auctions_timer_positive_check
    CHECK (timer_seconds > 0)
);

CREATE INDEX idx_auctions_ground_state ON auctions (ground_id, state);
CREATE INDEX idx_auctions_state ON auctions (state, created_at DESC);

CREATE TABLE auction_participants (
  id            VARCHAR(30) PRIMARY KEY,
  auction_id    VARCHAR(30) NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  team_id       INTEGER     NOT NULL REFERENCES teams(id),
  initial_purse NUMERIC(12,2) NOT NULL,
  current_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- A team cannot enter the same auction twice.
  CONSTRAINT auction_participants_auction_team_unique UNIQUE (auction_id, team_id),
  CONSTRAINT auction_participants_initial_purse_check
    CHECK (initial_purse > 0),
  -- The core purse invariant, enforced by the database rather than only by the
  -- service layer: spend can never exceed the purse, so remaining >= 0 always.
  CONSTRAINT auction_participants_spend_within_purse_check
    CHECK (current_spent >= 0 AND current_spent <= initial_purse)
);

CREATE INDEX idx_auction_participants_auction ON auction_participants (auction_id);

CREATE TABLE auction_lots (
  id              VARCHAR(30) PRIMARY KEY,
  auction_id      VARCHAR(30) NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  player_id       INTEGER     NOT NULL REFERENCES players(id),
  base_price      NUMERIC(12,2) NOT NULL,
  lot_number      INTEGER     NOT NULL,
  state           VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  winning_team_id INTEGER     REFERENCES teams(id),
  final_price     NUMERIC(12,2),
  current_bid     NUMERIC(12,2),
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- A player appears at most once per auction, so no player can be sold twice
  -- in the same auction.
  CONSTRAINT auction_lots_auction_player_unique UNIQUE (auction_id, player_id),
  CONSTRAINT auction_lots_auction_lot_number_unique UNIQUE (auction_id, lot_number),
  CONSTRAINT auction_lots_state_check
    CHECK (state IN ('AVAILABLE', 'NOMINATED', 'BIDDING', 'SOLD', 'UNSOLD')),
  CONSTRAINT auction_lots_base_price_check
    CHECK (base_price > 0),
  -- SOLD is the only state that may carry a winner/final price, and it must
  -- carry both. Every other state must carry neither. This makes a half-written
  -- sale (winner set, price missing) impossible at the storage layer.
  CONSTRAINT auction_lots_sold_consistency_check CHECK (
    (state = 'SOLD' AND winning_team_id IS NOT NULL AND final_price IS NOT NULL)
    OR
    (state <> 'SOLD' AND winning_team_id IS NULL AND final_price IS NULL)
  ),
  CONSTRAINT auction_lots_final_price_at_least_base_check
    CHECK (final_price IS NULL OR final_price >= base_price),
  CONSTRAINT auction_lots_current_bid_at_least_base_check
    CHECK (current_bid IS NULL OR current_bid >= base_price)
);

CREATE INDEX idx_auction_lots_state ON auction_lots (auction_id, state);

CREATE TABLE auction_bids (
  id             VARCHAR(30) PRIMARY KEY,
  lot_id         VARCHAR(30) NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
  participant_id VARCHAR(30) NOT NULL REFERENCES auction_participants(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  is_winning     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT auction_bids_amount_check CHECK (amount > 0)
);

CREATE INDEX idx_auction_bids_lot ON auction_bids (lot_id, created_at DESC);
CREATE INDEX idx_auction_bids_participant ON auction_bids (participant_id);

-- At most one winning bid per lot. A partial unique index expresses "only rows
-- where is_winning is true participate in the uniqueness", which a plain UNIQUE
-- constraint cannot do. This is what makes a double sale impossible even if two
-- transactions raced past the service-layer checks.
CREATE UNIQUE INDEX idx_auction_bids_one_winner_per_lot
  ON auction_bids (lot_id) WHERE is_winning;

CREATE TABLE auction_events (
  id         VARCHAR(30) PRIMARY KEY,
  auction_id VARCHAR(30)  NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_events_auction ON auction_events (auction_id, created_at DESC);

CREATE TABLE auction_audit_logs (
  id          VARCHAR(30)  PRIMARY KEY,
  auction_id  VARCHAR(30)  NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  actor_id    INTEGER      NOT NULL REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id   VARCHAR(100),
  metadata    JSONB,
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_audit_logs_auction ON auction_audit_logs (auction_id, created_at DESC);
