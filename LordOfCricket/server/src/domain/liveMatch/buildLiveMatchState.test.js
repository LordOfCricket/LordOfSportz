import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replayInnings } from '../scoring/replay.js'
import { buildLiveInningsState, RECENT_DELIVERIES_LIMIT } from './buildLiveMatchState.js'

const SEED = { battingTeamId: 10, bowlingTeamId: 20 }
const FORMAT = { ballsPerOver: 6, oversPerInnings: 20 }
const ROSTER = new Map([
  ['rahul', { publicPlayerId: 'CVP-RAHUL', name: 'Rahul' }],
  ['aman', { publicPlayerId: 'CVP-AMAN', name: 'Aman' }],
  ['bowler1', { publicPlayerId: 'CVP-BOWL1', name: 'Bowler One' }],
])

function buildLog() {
  let seq = 0
  const log = []
  return {
    delivery(input) {
      seq += 1
      log.push({ kind: 'delivery', id: `d${seq}`, logSequence: seq, isDeadBall: false, batRuns: 0, illegal: null, extra: null, wicket: null, swapStrikerNonStriker: false, bowlerMatchPlayerId: 'bowler1', ...input })
    },
    event(eventType, payload) {
      seq += 1
      log.push({ kind: 'event', id: `e${seq}`, logSequence: seq, eventType, payload, voided: false })
    },
    get log() {
      return log
    },
  }
}
function withOpeners(b) {
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'rahul' })
  b.event('batsman-in', { end: 'nonStrikerEnd', matchPlayerId: 'aman' })
  return b
}
function innings(overrides = {}) {
  return { id: 1, innings_number: 1, version: 3, status: 'live', batting_team_id: 10, bowling_team_id: 20, ...overrides }
}

test('live mid-over: score/striker/non-striker/bowler/current-over all reflect replay state', () => {
  const b = withOpeners(buildLog())
  b.delivery({ batRuns: 4 })
  b.delivery({ batRuns: 1 })
  const state = replayInnings(b.log, SEED, FORMAT)

  const live = buildLiveInningsState({ innings: innings(), state, format: FORMAT, target: null, roster: ROSTER })
  assert.equal(live.runs, 5)
  assert.equal(live.wickets, 0)
  assert.equal(live.legalBalls, 2)
  assert.equal(live.oversLabel, '0.2')
  assert.equal(live.version, 3)
  // 4 then 1 -> strike swapped once (odd run), so non-striker end now has 'rahul'
  assert.equal(live.striker.player.name, 'Aman')
  assert.equal(live.nonStriker.player.name, 'Rahul')
  assert.equal(live.nonStriker.runs, 5)
  assert.equal(live.bowler.player.name, 'Bowler One')
  assert.equal(live.bowler.wickets, 0)
  assert.equal(live.currentOver.length, 2)
  assert.equal(live.currentOver[0].totalRuns, 4)
  assert.equal(live.currentOver[1].totalRuns, 1)
})

test('innings 1 (no target passed): chase is always null', () => {
  const b = withOpeners(buildLog())
  b.delivery({ batRuns: 0 })
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings(), state, format: FORMAT, target: null, roster: ROSTER })
  assert.equal(live.chase, null)
})

test('chase: runsNeeded/ballsRemaining/requiredRunRate reuse the exact selectors.js math', () => {
  const b = withOpeners(buildLog())
  for (let i = 0; i < 12; i++) b.delivery({ batRuns: i === 0 ? 4 : 0 }) // 2 overs bowled, 4 runs
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings({ innings_number: 2 }), state, format: FORMAT, target: 100, roster: ROSTER })
  // target 100, runs 4 -> need 96; ballsRemaining = 20*6 - 12 = 108; RRR = 96/(108/6) = 5.333...
  assert.equal(live.chase.runsNeeded, 96)
  assert.equal(live.chase.ballsRemaining, 108)
  assert.ok(Math.abs(live.chase.requiredRunRate - 5.3333) < 0.001)
})

test('target already reached: runsNeeded floors at 0, never negative', () => {
  const b = withOpeners(buildLog())
  b.delivery({ batRuns: 6 })
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings({ innings_number: 2 }), state, format: FORMAT, target: 5, roster: ROSTER })
  assert.equal(live.chase.runsNeeded, 0)
})

test('innings break (status completed): striker/nonStriker/bowler are all null, score/overs still shown', () => {
  const b = withOpeners(buildLog())
  b.delivery({ batRuns: 4 })
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings({ status: 'completed' }), state, format: FORMAT, target: null, roster: ROSTER })
  assert.equal(live.striker, null)
  assert.equal(live.nonStriker, null)
  assert.equal(live.bowler, null)
  assert.equal(live.runs, 4, 'the finished first-innings score is still reported')
})

test('after a wicket with no new batsman seated: striker is null, never fabricated', () => {
  const b = withOpeners(buildLog())
  b.delivery({ wicket: { type: 'bowled' } })
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings(), state, format: FORMAT, target: null, roster: ROSTER })
  assert.equal(live.striker, null, 'waiting for next batsman -> null, not a stale/fabricated player')
  assert.equal(live.wickets, 1)
})

test('before any ball is bowled: bowler is null ("awaiting next bowler"), never a stale previous bowler', () => {
  const b = withOpeners(buildLog())
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings(), state, format: FORMAT, target: null, roster: ROSTER })
  assert.equal(live.bowler, null)
  assert.deepEqual(live.currentOver, [])
})

test('recentDeliveries is bounded and newest-first, never grows with innings length', () => {
  const b = withOpeners(buildLog())
  for (let i = 0; i < 30; i++) b.delivery({ batRuns: 0 })
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings(), state, format: FORMAT, target: null, roster: ROSTER })
  assert.equal(live.recentDeliveries.length, RECENT_DELIVERIES_LIMIT)
  assert.equal(live.recentDeliveries[0].id, state.deliveries[state.deliveries.length - 1].id, 'newest delivery first')
})

test('wicket/illegal/extra facts round-trip into the compact ball-chip shape, wicket is boolean-only (no fielder detail leaked)', () => {
  const b = withOpeners(buildLog())
  b.delivery({ illegal: { type: 'wide', runs: 1 } })
  b.delivery({ wicket: { type: 'caught', fielderMatchPlayerId: 'someone' } })
  const state = replayInnings(b.log, SEED, FORMAT)
  const live = buildLiveInningsState({ innings: innings(), state, format: FORMAT, target: null, roster: ROSTER })
  assert.deepEqual(live.currentOver[0].illegal, { type: 'wide', runs: 1 })
  assert.equal(live.currentOver[0].isLegalDelivery, false)
  assert.equal(live.currentOver[1].wicket, true)
  assert.equal(live.currentOver[1].fielderMatchPlayerId, undefined, 'no fielder detail in the lightweight live DTO')
})
