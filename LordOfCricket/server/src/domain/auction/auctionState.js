// Pure, dependency-free auction/lot state rules. Lives in domain/ with a
// colocated test file, matching every other domain/* module.
//
// Phase A defines the full state vocabulary and the legal transitions between
// states. The transitions Phase B needs for live bidding (NOMINATED/BIDDING
// and the LIVE-only auction states) are declared here now so the table is the
// single source of truth from the start — Phase B wires them to endpoints
// rather than re-deriving which transitions are legal.

export const AUCTION_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  READY: 'READY',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
})

export const LOT_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  NOMINATED: 'NOMINATED',
  BIDDING: 'BIDDING',
  SOLD: 'SOLD',
  UNSOLD: 'UNSOLD',
})

// COMPLETED and CANCELLED are terminal: no key, so no transition out of them.
const AUCTION_TRANSITIONS = Object.freeze({
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['DRAFT', 'LIVE', 'CANCELLED'],
  LIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['LIVE', 'COMPLETED', 'CANCELLED'],
})

// UNSOLD -> NOMINATED is the re-auction path: an unsold lot can be brought back
// for another round. SOLD is terminal — a sold player is never re-auctioned,
// which is what keeps "one winning team per lot" true for the whole auction.
const LOT_TRANSITIONS = Object.freeze({
  AVAILABLE: ['NOMINATED'],
  NOMINATED: ['BIDDING', 'UNSOLD', 'AVAILABLE'],
  BIDDING: ['SOLD', 'UNSOLD'],
  UNSOLD: ['NOMINATED'],
})

export function isTerminalAuctionState(state) {
  return state === AUCTION_STATES.COMPLETED || state === AUCTION_STATES.CANCELLED
}

export function canTransitionAuction(from, to) {
  return (AUCTION_TRANSITIONS[from] ?? []).includes(to)
}

export function canTransitionLot(from, to) {
  return (LOT_TRANSITIONS[from] ?? []).includes(to)
}

// Configuration (participants, lots, timer) is only mutable before the auction
// goes live. Once LIVE, the roster is frozen — otherwise a team could be added
// mid-auction with a full purse after others have already spent theirs.
export function isConfigurable(state) {
  return state === AUCTION_STATES.DRAFT || state === AUCTION_STATES.READY
}

// An auction needs at least two bidding teams and at least one player to be a
// meaningful auction. Enforced when leaving DRAFT, not at creation, so an
// auction can be built up incrementally.
export const MIN_PARTICIPANTS = 2
export const MIN_LOTS = 1

export function readinessErrors({ participantCount, lotCount }) {
  const errors = []
  if (participantCount < MIN_PARTICIPANTS) {
    errors.push(`An auction needs at least ${MIN_PARTICIPANTS} participating teams.`)
  }
  if (lotCount < MIN_LOTS) {
    errors.push(`An auction needs at least ${MIN_LOTS} player in the pool.`)
  }
  return errors
}
