import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMatchCard } from './buildMatchCard.js'

function baseRow(overrides = {}) {
  return {
    id: 501,
    status: 'upcoming',
    venue: 'LOC Community Ground',
    match_date: '2026-08-10T09:00:00.000Z',
    overs_per_innings: 20,
    balls_per_over: 6,
    winner_team_id: null,
    result_type: null,
    result_margin: null,
    result: null,
    team_a_id: 1,
    team_a_name: 'LOC Strikers',
    team_a_short: 'LOC',
    team_a_logo: null,
    team_b_id: 2,
    team_b_name: 'Riverside Warriors',
    team_b_short: 'RIV',
    team_b_logo: null,
    i1_id: null,
    i1_status: null,
    i1_batting_team_id: null,
    i1_runs: null,
    i1_wickets: null,
    i1_legal_balls: null,
    i2_id: null,
    i2_status: null,
    i2_batting_team_id: null,
    i2_runs: null,
    i2_wickets: null,
    i2_legal_balls: null,
    ...overrides,
  }
}

test('upcoming match with no innings rows: empty innings array, no crash', () => {
  const card = buildMatchCard(baseRow())
  assert.deepEqual(card.innings, [])
  assert.equal(card.isInningsBreak, false)
  assert.equal(card.chase, null)
  assert.equal(card.result, null)
  assert.equal(card.awaitingFinalization, false)
  assert.equal(card.isOfficial, false)
})

test('live match, first innings in progress: one innings entry, no chase', () => {
  const card = buildMatchCard(
    baseRow({ status: 'live', i1_id: 900, i1_status: 'live', i1_batting_team_id: 1, i1_runs: 42, i1_wickets: 2, i1_legal_balls: 30 })
  )
  assert.equal(card.innings.length, 1)
  assert.equal(card.innings[0].runs, 42)
  assert.equal(card.innings[0].oversLabel, '5.0')
  assert.equal(card.isInningsBreak, false)
  assert.equal(card.chase, null)
})

test('innings break: innings 1 completed, innings 2 not yet created', () => {
  const card = buildMatchCard(
    baseRow({ status: 'live', i1_id: 900, i1_status: 'completed', i1_batting_team_id: 1, i1_runs: 120, i1_wickets: 5, i1_legal_balls: 120 })
  )
  assert.equal(card.isInningsBreak, true)
  assert.equal(card.chase, null)
})

test('live chase: target/required run rate reuse the same pure selectors.js math as Phase 9, not reimplemented', () => {
  const card = buildMatchCard(
    baseRow({
      status: 'live',
      overs_per_innings: 20,
      i1_id: 900,
      i1_status: 'completed',
      i1_batting_team_id: 1,
      i1_runs: 150,
      i1_wickets: 6,
      i1_legal_balls: 120,
      i2_id: 901,
      i2_status: 'live',
      i2_batting_team_id: 2,
      i2_runs: 100,
      i2_wickets: 3,
      i2_legal_balls: 90, // 15 overs bowled, 30 balls remaining
    })
  )
  assert.equal(card.innings.length, 2)
  assert.equal(card.chase.target, 151)
  assert.equal(card.chase.runsNeeded, 51)
  assert.equal(card.chase.ballsRemaining, 30)
  // requiredRunRate = 51 / (30/6) = 10.2
  assert.equal(card.chase.requiredRunRate, 10.2)
  assert.equal(card.isInningsBreak, false)
})

test('target already chased down: runsNeeded floors at 0, never negative', () => {
  const card = buildMatchCard(
    baseRow({
      status: 'live',
      i1_id: 900,
      i1_status: 'completed',
      i1_batting_team_id: 1,
      i1_runs: 80,
      i1_wickets: 10,
      i1_legal_balls: 100,
      i2_id: 901,
      i2_status: 'live',
      i2_batting_team_id: 2,
      i2_runs: 85,
      i2_wickets: 2,
      i2_legal_balls: 90,
    })
  )
  assert.equal(card.chase.runsNeeded, 0)
})

test('completed match: awaitingFinalization true, isOfficial false, both innings present', () => {
  const card = buildMatchCard(
    baseRow({
      status: 'completed',
      i1_id: 900,
      i1_status: 'completed',
      i1_batting_team_id: 1,
      i1_runs: 150,
      i1_wickets: 6,
      i1_legal_balls: 120,
      i2_id: 901,
      i2_status: 'completed',
      i2_batting_team_id: 2,
      i2_runs: 133,
      i2_wickets: 10,
      i2_legal_balls: 118,
      winner_team_id: 1,
      result_type: 'RUNS',
      result_margin: 17,
      result: 'LOC Strikers won by 17 runs',
    })
  )
  assert.equal(card.awaitingFinalization, true)
  assert.equal(card.isOfficial, false)
  assert.deepEqual(card.result, { winnerTeamId: 1, resultType: 'RUNS', resultMargin: 17, text: 'LOC Strikers won by 17 runs' })
  assert.equal(card.chase, null, 'a decided match never shows a live chase block')
})

test('finalized match: isOfficial true, totals/result identical to completed — finalization changes only status flags', () => {
  const completed = buildMatchCard(
    baseRow({
      status: 'completed',
      i1_id: 900,
      i1_status: 'completed',
      i1_runs: 150,
      i1_wickets: 6,
      i1_legal_balls: 120,
      i2_id: 901,
      i2_status: 'completed',
      i2_runs: 133,
      i2_wickets: 10,
      i2_legal_balls: 118,
      result_type: 'RUNS',
      result_margin: 17,
      result: 'LOC Strikers won by 17 runs',
    })
  )
  const finalized = buildMatchCard(
    baseRow({
      status: 'finalized',
      i1_id: 900,
      i1_status: 'completed',
      i1_runs: 150,
      i1_wickets: 6,
      i1_legal_balls: 120,
      i2_id: 901,
      i2_status: 'completed',
      i2_runs: 133,
      i2_wickets: 10,
      i2_legal_balls: 118,
      result_type: 'RUNS',
      result_margin: 17,
      result: 'LOC Strikers won by 17 runs',
    })
  )
  assert.equal(completed.awaitingFinalization, true)
  assert.equal(completed.isOfficial, false)
  assert.equal(finalized.awaitingFinalization, false)
  assert.equal(finalized.isOfficial, true)
  assert.deepEqual(completed.innings, finalized.innings, 'finalization must never change the cricket totals')
  assert.deepEqual(completed.result, finalized.result)
})

test('non-6 balls-per-over match formats overs correctly, never a hardcoded /6', () => {
  const card = buildMatchCard(baseRow({ status: 'live', balls_per_over: 5, i1_id: 900, i1_status: 'live', i1_runs: 20, i1_wickets: 1, i1_legal_balls: 12 }))
  assert.equal(card.innings[0].oversLabel, '2.2')
})
