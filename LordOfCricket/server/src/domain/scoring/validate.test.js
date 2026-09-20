import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replayInnings } from './replay.js'
import { validateDeliveryInput, validateEventInput } from './validate.js'
import { ScoringError } from './errors.js'

const SEED = { battingTeamId: 'team-a', bowlingTeamId: 'team-b' }
const FORMAT = { ballsPerOver: 6, oversPerInnings: 20 }

const MATCH_PLAYERS = new Map([
  ['rahul', { teamId: 'team-a' }],
  ['aman', { teamId: 'team-a' }],
  ['bowler1', { teamId: 'team-b' }],
  ['bowler2', { teamId: 'team-b' }],
  ['fielder1', { teamId: 'team-b' }],
])

function stateWithOpeningLineup() {
  const log = [
    { kind: 'event', id: 'e1', logSequence: 1, eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: 'rahul' }, voided: false },
    { kind: 'event', id: 'e2', logSequence: 2, eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: 'aman' }, voided: false },
  ]
  return replayInnings(log, SEED, FORMAT)
}

function baseCtx(overrides = {}) {
  return {
    state: stateWithOpeningLineup(),
    matchPlayersById: MATCH_PLAYERS,
    battingTeamId: 'team-a',
    bowlingTeamId: 'team-b',
    inningsStatus: 'live',
    ...overrides,
  }
}

function assertRejects(fn, code) {
  assert.throws(fn, (err) => err instanceof ScoringError && err.code === code)
}

test('rejects recording when the innings is not live', () => {
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 0, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx({ inningsStatus: 'paused' }) }),
    'INVALID_INNINGS_STATE'
  )
})

test('rejects a bowler from the batting team', () => {
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 0, bowlerMatchPlayerId: 'rahul' }, ...baseCtx() }),
    'INVALID_BOWLER'
  )
})

test('rejects a bowler id that is not part of this match at all', () => {
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 0, bowlerMatchPlayerId: 'ghost-player' }, ...baseCtx() }),
    'INVALID_MATCH_PLAYER'
  )
})

test('rejects the same bowler for two overs in a row', () => {
  const state = { ...stateWithOpeningLineup(), legalBalls: 6, previousOverBowlerId: 'bowler1', ballsPerOver: 6 }
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 0, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx({ state }) }),
    'INVALID_BOWLER'
  )
})

test('allows a different bowler for the next over', () => {
  const state = { ...stateWithOpeningLineup(), legalBalls: 6, previousOverBowlerId: 'bowler1', ballsPerOver: 6 }
  assert.doesNotThrow(() => validateDeliveryInput({ input: { batRuns: 0, bowlerMatchPlayerId: 'bowler2' }, ...baseCtx({ state }) }))
})

test('rejects bat runs on a wide', () => {
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 2, illegal: { type: 'wide', runs: 1 }, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx() }),
    'INVALID_RUN_CONFIGURATION'
  )
})

test('rejects byes/leg-byes on a wide', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { illegal: { type: 'wide', runs: 1 }, extra: { type: 'bye', runs: 1 }, bowlerMatchPlayerId: 'bowler1' },
        ...baseCtx(),
      }),
    'INVALID_EXTRA_CONFIGURATION'
  )
})

test('rejects a no-ball with illegal.runs other than 1', () => {
  assertRejects(
    () => validateDeliveryInput({ input: { illegal: { type: 'no-ball', runs: 2 }, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx() }),
    'INVALID_EXTRA_CONFIGURATION'
  )
})

test('rejects a no-ball with both bat runs and byes', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { illegal: { type: 'no-ball', runs: 1 }, batRuns: 4, extra: { type: 'bye', runs: 1 }, bowlerMatchPlayerId: 'bowler1' },
        ...baseCtx(),
      }),
    'INVALID_EXTRA_CONFIGURATION'
  )
})

test('allows a no-ball with bat runs only', () => {
  assert.doesNotThrow(() =>
    validateDeliveryInput({ input: { illegal: { type: 'no-ball', runs: 1 }, batRuns: 4, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx() })
  )
})

test('rejects bat runs together with byes on the same delivery', () => {
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 2, extra: { type: 'bye', runs: 1 }, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx() }),
    'INVALID_RUN_CONFIGURATION'
  )
})

test('rejects a dismissal type not allowed on this delivery (e.g. bowled on a wide)', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { illegal: { type: 'wide', runs: 1 }, wicket: { type: 'bowled' }, bowlerMatchPlayerId: 'bowler1' },
        ...baseCtx(),
      }),
    'INVALID_WICKET_COMBINATION'
  )
})

test('rejects a run-out with a dismissed player who is not currently at either end', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { wicket: { type: 'run-out', dismissedMatchPlayerId: 'ghost-player', runsCompleted: 0 }, bowlerMatchPlayerId: 'bowler1' },
        ...baseCtx(),
      }),
    'INVALID_DISMISSED_PLAYER'
  )
})

test('rejects an explicit dismissedMatchPlayerId on a non-run-out dismissal — it is always derived', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { wicket: { type: 'bowled', dismissedMatchPlayerId: 'rahul' }, bowlerMatchPlayerId: 'bowler1' },
        ...baseCtx(),
      }),
    'INVALID_WICKET_COMBINATION'
  )
})

test('rejects a fielder from the batting team', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { wicket: { type: 'caught', fielderMatchPlayerId: 'rahul' }, bowlerMatchPlayerId: 'bowler1' },
        ...baseCtx(),
      }),
    'INVALID_MATCH_PLAYER'
  )
})

test('rejects out-of-range wagon wheel coordinates', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { batRuns: 4, bowlerMatchPlayerId: 'bowler1', shot: { normalizedX: 1.5, normalizedY: 0, angleDegrees: 90, regionId: 'cover' } },
        ...baseCtx(),
      }),
    'INVALID_WAGON_WHEEL'
  )
})

test('rejects an unknown wagon wheel region', () => {
  assertRejects(
    () =>
      validateDeliveryInput({
        input: { batRuns: 4, bowlerMatchPlayerId: 'bowler1', shot: { normalizedX: 0.5, normalizedY: -0.5, angleDegrees: 90, regionId: 'deep-space' } },
        ...baseCtx(),
      }),
    'INVALID_WAGON_WHEEL'
  )
})

test('rejects recording another delivery while a batsman slot is still pending', () => {
  const log = [{ kind: 'event', id: 'e1', logSequence: 1, eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: 'rahul' }, voided: false }]
  const state = replayInnings(log, SEED, FORMAT) // no non-striker seated yet
  assertRejects(
    () => validateDeliveryInput({ input: { batRuns: 0, bowlerMatchPlayerId: 'bowler1' }, ...baseCtx({ state }) }),
    'INVALID_STRIKER_STATE'
  )
})

test('valid delivery input passes without throwing', () => {
  assert.doesNotThrow(() =>
    validateDeliveryInput({
      input: {
        batRuns: 4,
        bowlerMatchPlayerId: 'bowler1',
        shot: { normalizedX: 0.6, normalizedY: -0.3, angleDegrees: 250, regionId: 'cover' },
      },
      ...baseCtx(),
    })
  )
})

test('event validation rejects an unknown event type', () => {
  assertRejects(() => validateEventInput({ event: { eventType: 'teleportation', payload: {} }, ...baseCtx() }), 'INVALID_EVENT_TYPE')
})

test('event validation rejects a bowler-change to a batting-team player', () => {
  assertRejects(
    () => validateEventInput({ event: { eventType: 'bowler-change', payload: { matchPlayerId: 'rahul' } }, ...baseCtx() }),
    'INVALID_MATCH_PLAYER'
  )
})

test('event validation accepts a valid penalty-runs event', () => {
  assert.doesNotThrow(() =>
    validateEventInput({ event: { eventType: 'penalty-runs', payload: { runs: 5, awardedTo: 'batting' } }, ...baseCtx() })
  )
})
