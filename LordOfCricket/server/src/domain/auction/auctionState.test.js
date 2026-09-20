import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUCTION_STATES,
  LOT_STATES,
  canTransitionAuction,
  canTransitionLot,
  isConfigurable,
  isTerminalAuctionState,
  readinessErrors,
  MIN_PARTICIPANTS,
} from './auctionState.js'

test('auction happy path DRAFT -> READY -> LIVE -> COMPLETED is legal at every step', () => {
  assert.equal(canTransitionAuction('DRAFT', 'READY'), true)
  assert.equal(canTransitionAuction('READY', 'LIVE'), true)
  assert.equal(canTransitionAuction('LIVE', 'COMPLETED'), true)
})

test('an auction cannot skip READY and go straight from DRAFT to LIVE', () => {
  assert.equal(canTransitionAuction('DRAFT', 'LIVE'), false)
})

test('a COMPLETED auction is terminal — it can never restart or be cancelled afterwards', () => {
  assert.equal(isTerminalAuctionState('COMPLETED'), true)
  assert.equal(canTransitionAuction('COMPLETED', 'LIVE'), false)
  assert.equal(canTransitionAuction('COMPLETED', 'READY'), false)
  assert.equal(canTransitionAuction('COMPLETED', 'CANCELLED'), false)
})

test('a CANCELLED auction is terminal too', () => {
  assert.equal(isTerminalAuctionState('CANCELLED'), true)
  assert.equal(canTransitionAuction('CANCELLED', 'LIVE'), false)
  assert.equal(canTransitionAuction('CANCELLED', 'DRAFT'), false)
})

test('a LIVE auction can be paused and resumed without passing through READY again', () => {
  assert.equal(canTransitionAuction('LIVE', 'PAUSED'), true)
  assert.equal(canTransitionAuction('PAUSED', 'LIVE'), true)
  assert.equal(canTransitionAuction('PAUSED', 'READY'), false)
})

test('READY can drop back to DRAFT so a roster mistake is fixable before going live', () => {
  assert.equal(canTransitionAuction('READY', 'DRAFT'), true)
})

test('every non-terminal auction state can be cancelled', () => {
  for (const state of ['DRAFT', 'READY', 'LIVE', 'PAUSED']) {
    assert.equal(canTransitionAuction(state, 'CANCELLED'), true, `${state} should be cancellable`)
  }
})

test('an unknown auction state never transitions anywhere, and never throws', () => {
  assert.equal(canTransitionAuction('NOT_A_STATE', 'LIVE'), false)
  assert.equal(canTransitionAuction(undefined, 'LIVE'), false)
  assert.equal(canTransitionAuction(null, 'LIVE'), false)
})

test('configuration is allowed only before the auction goes live', () => {
  assert.equal(isConfigurable('DRAFT'), true)
  assert.equal(isConfigurable('READY'), true)
  assert.equal(isConfigurable('LIVE'), false)
  assert.equal(isConfigurable('PAUSED'), false)
  assert.equal(isConfigurable('COMPLETED'), false)
  assert.equal(isConfigurable('CANCELLED'), false)
})

test('lot happy path AVAILABLE -> NOMINATED -> BIDDING -> SOLD is legal at every step', () => {
  assert.equal(canTransitionLot('AVAILABLE', 'NOMINATED'), true)
  assert.equal(canTransitionLot('NOMINATED', 'BIDDING'), true)
  assert.equal(canTransitionLot('BIDDING', 'SOLD'), true)
})

test('a SOLD lot is terminal — a sold player is never re-auctioned', () => {
  assert.equal(canTransitionLot('SOLD', 'NOMINATED'), false)
  assert.equal(canTransitionLot('SOLD', 'BIDDING'), false)
  assert.equal(canTransitionLot('SOLD', 'UNSOLD'), false)
  assert.equal(canTransitionLot('SOLD', 'AVAILABLE'), false)
})

test('an UNSOLD lot can be re-auctioned by going back to NOMINATED', () => {
  assert.equal(canTransitionLot('UNSOLD', 'NOMINATED'), true)
})

test('a lot cannot jump straight from AVAILABLE to SOLD, bypassing bidding', () => {
  assert.equal(canTransitionLot('AVAILABLE', 'SOLD'), false)
  assert.equal(canTransitionLot('AVAILABLE', 'BIDDING'), false)
})

test('a nominated lot with no bids can go UNSOLD without ever entering BIDDING', () => {
  assert.equal(canTransitionLot('NOMINATED', 'UNSOLD'), true)
})

test('an unknown lot state never transitions anywhere, and never throws', () => {
  assert.equal(canTransitionLot('NOT_A_STATE', 'SOLD'), false)
  assert.equal(canTransitionLot(undefined, 'SOLD'), false)
})

test('readinessErrors: a fully-populated auction has no errors', () => {
  assert.deepEqual(readinessErrors({ participantCount: 2, lotCount: 1 }), [])
})

test('readinessErrors: fewer than the minimum teams is reported', () => {
  const errors = readinessErrors({ participantCount: MIN_PARTICIPANTS - 1, lotCount: 5 })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /at least 2 participating teams/)
})

test('readinessErrors: an empty player pool is reported', () => {
  const errors = readinessErrors({ participantCount: 4, lotCount: 0 })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /at least 1 player/)
})

test('readinessErrors: both problems are reported together, not just the first', () => {
  assert.equal(readinessErrors({ participantCount: 0, lotCount: 0 }).length, 2)
})

test('state constants are frozen so no caller can mutate the vocabulary', () => {
  assert.equal(Object.isFrozen(AUCTION_STATES), true)
  assert.equal(Object.isFrozen(LOT_STATES), true)
})
