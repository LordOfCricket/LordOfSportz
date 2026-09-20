// Domain tests — pure, no database. Two layers exercised: (1) the aggregation
// math directly against synthetic per-innings performance objects, and (2) a
// full replayInnings() log through extractBattingPerformance/
// extractBowlingPerformance, proving the statistics layer reads real replay
// output rather than re-deriving cricket rules independently.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replayInnings } from '../scoring/replay.js'
import { extractBattingPerformance, aggregateBatting, battingStrikeRate } from './battingStats.js'
import { extractBowlingPerformance, aggregateBowling, computeMaidens, bowlingEconomy } from './bowlingStats.js'
import { aggregateFielding } from './fieldingStats.js'

const SEED = { battingTeamId: 'team-a', bowlingTeamId: 'team-b' }

function buildLog() {
  let seq = 0
  const log = []
  return {
    delivery(input) {
      seq += 1
      const id = `d${seq}`
      log.push({
        kind: 'delivery',
        id,
        logSequence: seq,
        isDeadBall: false,
        batRuns: 0,
        illegal: null,
        extra: null,
        wicket: null,
        swapStrikerNonStriker: false,
        bowlerMatchPlayerId: 'bowler1',
        ...input,
      })
      return id
    },
    event(eventType, payload) {
      seq += 1
      const id = `e${seq}`
      log.push({ kind: 'event', id, logSequence: seq, eventType, payload, voided: false })
      return id
    },
    get log() {
      return log
    },
  }
}

function seatOpeners(b, striker = 'rahul', nonStriker = 'aman') {
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: striker })
  b.event('batsman-in', { end: 'nonStrikerEnd', matchPlayerId: nonStriker })
}

// ---------------------------------------------------------------------------
// aggregateBatting
// ---------------------------------------------------------------------------

test('aggregateBatting: average is runs/dismissals, not runs/innings (not-outs must not deflate it)', () => {
  const career = aggregateBatting([
    { runs: 42, balls: 30, fours: 4, sixes: 1, notOut: true },
    { runs: 8, balls: 10, fours: 1, sixes: 0, notOut: false },
    { runs: 20, balls: 15, fours: 2, sixes: 0, notOut: false },
  ])
  assert.equal(career.innings, 3)
  assert.equal(career.notOuts, 1)
  assert.equal(career.runs, 70)
  // dismissals = 2, not 3 -> average = 35, not 23.33
  assert.equal(career.average, 35)
})

test('aggregateBatting: zero dismissals returns a null average, never Infinity', () => {
  const career = aggregateBatting([{ runs: 42, balls: 30, fours: 4, sixes: 1, notOut: true }])
  assert.equal(career.average, null)
})

test('aggregateBatting: never batted returns null highest score and null strike rate, not zeros', () => {
  const career = aggregateBatting([])
  assert.equal(career.innings, 0)
  assert.equal(career.highestScore, null)
  assert.equal(career.strikeRate, null)
  assert.equal(career.average, null)
})

test('aggregateBatting: highest score prefers the not-out innings on a tie', () => {
  const career = aggregateBatting([
    { runs: 84, balls: 60, fours: 8, sixes: 2, notOut: false },
    { runs: 84, balls: 55, fours: 9, sixes: 1, notOut: true },
    { runs: 31, balls: 20, fours: 3, sixes: 0, notOut: false },
  ])
  assert.deepEqual(career.highestScore, { runs: 84, notOut: true })
})

test('aggregateBatting: duck is a dismissal for 0, not a not-out 0', () => {
  const career = aggregateBatting([
    { runs: 0, balls: 3, fours: 0, sixes: 0, notOut: false },
    { runs: 0, balls: 1, fours: 0, sixes: 0, notOut: true },
  ])
  assert.equal(career.ducks, 1)
})

test('aggregateBatting: 30s/50s/100s are non-overlapping ranges', () => {
  const perf = (runs) => ({ runs, balls: runs, fours: 0, sixes: 0, notOut: false })
  const career = aggregateBatting([perf(49), perf(50), perf(99), perf(100), perf(151)])
  assert.equal(career.thirties, 1)
  assert.equal(career.fifties, 2)
  assert.equal(career.hundreds, 2)
})

test('battingStrikeRate: zero balls faced returns null, never NaN/Infinity', () => {
  assert.equal(battingStrikeRate(10, 0), null)
  assert.equal(battingStrikeRate(0, 0), null)
})

// ---------------------------------------------------------------------------
// aggregateBowling
// ---------------------------------------------------------------------------

test('aggregateBowling: zero wickets returns null average and null strike rate', () => {
  const career = aggregateBowling([{ legalBalls: 24, runs: 30, wickets: 0, maidens: 0, ballsPerOver: 6 }])
  assert.equal(career.average, null)
  assert.equal(career.strikeRate, null)
  assert.notEqual(career.economy, null, 'economy only needs legal balls bowled, not wickets')
})

test('aggregateBowling: never bowled returns null economy, not a division by zero', () => {
  const career = aggregateBowling([])
  assert.equal(career.economy, null)
  assert.equal(career.average, null)
  assert.equal(career.bestBowling, null)
})

test('aggregateBowling: best bowling picks most wickets, tie-broken by fewer runs conceded', () => {
  const career = aggregateBowling([
    { legalBalls: 24, runs: 18, wickets: 3, maidens: 0, ballsPerOver: 6 },
    { legalBalls: 24, runs: 30, wickets: 4, maidens: 0, ballsPerOver: 6 },
    { legalBalls: 24, runs: 22, wickets: 4, maidens: 0, ballsPerOver: 6 },
    { legalBalls: 24, runs: 8, wickets: 2, maidens: 0, ballsPerOver: 6 },
  ])
  assert.deepEqual(career.bestBowling, { wickets: 4, runs: 22 })
})

test('aggregateBowling: mixed balls-per-over economy uses equivalent overs, not a naive 6-ball assumption', () => {
  // Spell A: 6-ball over format, 1 over (6 legal balls) for 6 runs -> economy 6.00 alone.
  // Spell B: 5-ball over format, 1 over (5 legal balls) for 5 runs -> economy 6.00 alone (5/(5/5)=5... wait compute).
  const career = aggregateBowling([
    { legalBalls: 6, runs: 6, wickets: 0, maidens: 0, ballsPerOver: 6 }, // 1.0 equivalent over, 6 runs
    { legalBalls: 5, runs: 10, wickets: 0, maidens: 0, ballsPerOver: 5 }, // 1.0 equivalent over, 10 runs
  ])
  // total runs 16 over 2.0 equivalent overs = 8.00, NOT runs/(11 balls/6)=8.7272..
  assert.equal(career.economy, 8)
})

test('bowlingEconomy: zero legal balls returns null', () => {
  assert.equal(bowlingEconomy(10, 0, 6), null)
})

test('computeMaidens: a full over with zero bowler-attributable runs counts; byes are excluded from the bowler but a single run does not', () => {
  const b = buildLog()
  seatOpeners(b)
  // Over 1 (balls 1-6): a bye run (fielding-side run, doesn't count against bowler) — still a maiden.
  for (let i = 0; i < 5; i++) b.delivery({ bowlerMatchPlayerId: 'bowlerA' })
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', extra: { type: 'bye', runs: 1 } })
  // Over 2 (balls 7-12): one run actually conceded by the bowler -> not a maiden.
  for (let i = 0; i < 5; i++) b.delivery({ bowlerMatchPlayerId: 'bowlerA' })
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', batRuns: 1 })

  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  assert.equal(computeMaidens(state.deliveries, 'bowlerA', 6), 1)
})

test('computeMaidens: a partial (unfinished) over never counts even at zero runs conceded', () => {
  const b = buildLog()
  seatOpeners(b)
  for (let i = 0; i < 4; i++) b.delivery({ bowlerMatchPlayerId: 'bowlerA' }) // only 4 of 6 balls
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  assert.equal(computeMaidens(state.deliveries, 'bowlerA', 6), 0)
})

// ---------------------------------------------------------------------------
// extractBattingPerformance / extractBowlingPerformance against a real replay
// ---------------------------------------------------------------------------

test('extractBattingPerformance: DNB is null, distinct from a batted-but-scored-zero innings', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 1 })
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  assert.equal(extractBattingPerformance(state, 'someone-who-never-batted'), null)
  assert.notEqual(extractBattingPerformance(state, 'rahul'), null)
})

test('extractBattingPerformance: wide does not count as a ball faced, no-ball does — matches replay.js exactly', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ illegal: { type: 'wide', runs: 1 } })
  b.delivery({ illegal: { type: 'no-ball', runs: 1 }, batRuns: 2 })
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  const perf = extractBattingPerformance(state, 'rahul')
  assert.equal(perf.balls, 1, 'only the no-ball counted as a ball faced')
  assert.equal(perf.runs, 2)
})

test('extractBattingPerformance: a clean dismissal never credits batsman runs for that ball', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ wicket: { type: 'bowled' } })
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  const perf = extractBattingPerformance(state, 'rahul')
  assert.equal(perf.runs, 0)
  assert.equal(perf.notOut, false)
})

test('extractBowlingPerformance: run-out is never credited to the bowler, bowled/caught/lbw/stumped/hit-wicket are', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', wicket: { type: 'run-out', dismissedMatchPlayerId: 'rahul', runsCompleted: 0 } })
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'batsman3' })
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', wicket: { type: 'caught', fielderMatchPlayerId: 'fielder1' } })
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  const perf = extractBowlingPerformance(state, 'bowlerA', 6)
  assert.equal(perf.wickets, 1, 'only the caught dismissal is credited, not the run-out')
})

test('extractBowlingPerformance: byes/leg-byes are excluded from runs conceded, wides/no-balls are included', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', extra: { type: 'bye', runs: 4 } })
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', illegal: { type: 'wide', runs: 1 } })
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  const perf = extractBowlingPerformance(state, 'bowlerA', 6)
  assert.equal(perf.runs, 1, 'the bye run is excluded; the wide penalty run is included')
})

test('extractBowlingPerformance: never bowled a ball returns null', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ bowlerMatchPlayerId: 'bowlerA', batRuns: 1 })
  const state = replayInnings(b.log, SEED, { ballsPerOver: 6 })
  assert.equal(extractBowlingPerformance(state, 'bowlerB', 6), null)
})

// ---------------------------------------------------------------------------
// aggregateFielding
// ---------------------------------------------------------------------------

test('aggregateFielding: catches/stumpings/run-outs attributed correctly, including a secondary run-out fielder', () => {
  const myIds = new Set(['mp-keeper', 'mp-fielder1', 'mp-fielder2'])
  const wickets = [
    { dismissal_type: 'caught', fielder_match_player_id: 'mp-fielder1', secondary_fielder_match_player_id: null },
    { dismissal_type: 'stumped', fielder_match_player_id: 'mp-keeper', secondary_fielder_match_player_id: null },
    { dismissal_type: 'run-out', fielder_match_player_id: 'mp-fielder2', secondary_fielder_match_player_id: 'mp-keeper' },
    { dismissal_type: 'bowled', fielder_match_player_id: null, secondary_fielder_match_player_id: null },
    { dismissal_type: 'caught', fielder_match_player_id: 'mp-someone-else', secondary_fielder_match_player_id: null },
  ]
  const fielding = aggregateFielding(wickets, myIds)
  assert.equal(fielding.catches, 1)
  assert.equal(fielding.stumpings, 1)
  // both mp-fielder2 (primary) and mp-keeper (secondary/relay) get run-out credit
  const runOutCredit = wickets.filter((w) => w.dismissal_type === 'run-out' && (myIds.has(w.fielder_match_player_id) || myIds.has(w.secondary_fielder_match_player_id)))
  assert.equal(runOutCredit.length, 1)
  assert.equal(fielding.runOuts, 1)
})
