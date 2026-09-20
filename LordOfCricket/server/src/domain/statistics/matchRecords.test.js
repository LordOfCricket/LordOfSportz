// Domain tests — pure, no database. Exercises the Cricket Records shapers
// against synthetic repository rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CRICKET_RECORD_LIMIT,
  splitWinnerLoser,
  mapInningsTotal,
  mapMatchAggregate,
  mapVictoryMargin,
  mapSuccessfulChase,
  buildCricketRecords,
} from './matchRecords.js'

const matchRow = (over = {}) => ({
  match_id: 7,
  match_date: '2026-02-01T00:00:00.000Z',
  result_margin: 42,
  result_type: 'RUNS',
  result: 'Team A won by 42 runs',
  winner_team_id: 1,
  team_a_id: 1,
  team_a_name: 'Team A',
  team_a_short: 'TA',
  team_b_id: 2,
  team_b_name: 'Team B',
  team_b_short: 'TB',
  ...over,
})

const inningsRow = (over = {}) => ({
  runs: 180,
  wickets: 6,
  legal_balls: 120,
  batting_team_id: 1,
  bowling_team_id: 2,
  batting_team_name: 'Team A',
  batting_team_short: 'TA',
  bowling_team_name: 'Team B',
  bowling_team_short: 'TB',
  match_id: 7,
  match_date: '2026-02-01T00:00:00.000Z',
  ...over,
})

test('CRICKET_RECORD_LIMIT is a small honour-roll size', () => {
  assert.ok(CRICKET_RECORD_LIMIT >= 3 && CRICKET_RECORD_LIMIT <= 10)
})

test('splitWinnerLoser: winner is team A', () => {
  const r = splitWinnerLoser(matchRow({ winner_team_id: 1 }))
  assert.equal(r.winner.id, 1)
  assert.equal(r.loser.id, 2)
  assert.equal(r.winner.shortName, 'TA')
})

test('splitWinnerLoser: winner is team B', () => {
  const r = splitWinnerLoser(matchRow({ winner_team_id: 2 }))
  assert.equal(r.winner.id, 2)
  assert.equal(r.loser.id, 1)
})

test('splitWinnerLoser: null / unrelated winner id → null (never guessed)', () => {
  assert.equal(splitWinnerLoser(matchRow({ winner_team_id: null })), null)
  assert.equal(splitWinnerLoser(matchRow({ winner_team_id: 999 })), null)
})

test('mapInningsTotal: authoritative runs/wickets pass through, teams resolved', () => {
  const e = mapInningsTotal(inningsRow({ runs: 205, wickets: 4 }))
  assert.equal(e.runs, 205)
  assert.equal(e.wickets, 4)
  assert.equal(e.team.name, 'Team A')
  assert.equal(e.opponent.name, 'Team B')
  assert.equal(e.matchId, 7)
})

test('mapMatchAggregate: total passes through with both teams', () => {
  const e = mapMatchAggregate({
    total_runs: 372,
    team_a_id: 1,
    team_a_name: 'Team A',
    team_a_short: 'TA',
    team_b_id: 2,
    team_b_name: 'Team B',
    team_b_short: 'TB',
    match_id: 7,
    match_date: '2026-02-01T00:00:00.000Z',
  })
  assert.equal(e.totalRuns, 372)
  assert.equal(e.teamA.id, 1)
  assert.equal(e.teamB.id, 2)
})

test('mapVictoryMargin: carries margin + unit + winner/loser; drops unresolved winner', () => {
  const e = mapVictoryMargin(matchRow({ result_margin: 88, winner_team_id: 2 }), 'runs')
  assert.equal(e.margin, 88)
  assert.equal(e.marginUnit, 'runs')
  assert.equal(e.winner.id, 2)
  assert.equal(e.loser.id, 1)
  assert.equal(mapVictoryMargin(matchRow({ winner_team_id: null }), 'runs'), null)
})

test('mapSuccessfulChase: chaser is the batting side, defender the bowling side', () => {
  const e = mapSuccessfulChase(inningsRow({ runs: 164, wickets: 3, batting_team_id: 2, bowling_team_id: 1, batting_team_name: 'Team B', bowling_team_name: 'Team A' }))
  assert.equal(e.runs, 164)
  assert.equal(e.chaser.name, 'Team B')
  assert.equal(e.defender.name, 'Team A')
})

test('buildCricketRecords: assembles all five categories and filters unresolved victory rows', () => {
  const out = buildCricketRecords({
    highestTeamTotals: [inningsRow({ runs: 210 })],
    highestMatchAggregates: [{ total_runs: 400, team_a_id: 1, team_a_name: 'A', team_a_short: 'A', team_b_id: 2, team_b_name: 'B', team_b_short: 'B', match_id: 7, match_date: 'x' }],
    biggestWinsByRuns: [matchRow({ result_margin: 100 }), matchRow({ winner_team_id: null })],
    biggestWinsByWickets: [matchRow({ result_type: 'WICKETS', result_margin: 9, winner_team_id: 2 })],
    highestSuccessfulChases: [inningsRow({ runs: 175, batting_team_id: 2 })],
  })
  assert.equal(out.highestTeamTotals.length, 1)
  assert.equal(out.highestMatchAggregates[0].totalRuns, 400)
  assert.equal(out.biggestWinsByRuns.length, 1) // the null-winner row was dropped
  assert.equal(out.biggestWinsByRuns[0].marginUnit, 'runs')
  assert.equal(out.biggestWinsByWickets[0].margin, 9)
  assert.equal(out.highestSuccessfulChases[0].runs, 175)
})

test('buildCricketRecords: empty inputs → empty arrays, never fabricated rows', () => {
  const out = buildCricketRecords({
    highestTeamTotals: [],
    highestMatchAggregates: [],
    biggestWinsByRuns: [],
    biggestWinsByWickets: [],
    highestSuccessfulChases: [],
  })
  assert.deepEqual(out, {
    highestTeamTotals: [],
    highestMatchAggregates: [],
    biggestWinsByRuns: [],
    biggestWinsByWickets: [],
    highestSuccessfulChases: [],
  })
})
