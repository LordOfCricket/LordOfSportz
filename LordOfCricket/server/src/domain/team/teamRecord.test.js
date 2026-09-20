import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTeamRecord, buildRecentForm } from './teamRecord.js'

function match({ id, date, winnerTeamId, resultType = 'RUNS' }) {
  return { match_id: id, match_date: date, winner_team_id: winnerTeamId, result_type: resultType }
}

test('buildTeamRecord: wins/losses/ties/win% for a mixed record', () => {
  const matches = [
    match({ id: 1, date: '2026-01-01', winnerTeamId: 10 }), // win
    match({ id: 2, date: '2026-01-02', winnerTeamId: 20 }), // loss
    match({ id: 3, date: '2026-01-03', winnerTeamId: null, resultType: 'TIE' }), // tie
    match({ id: 4, date: '2026-01-04', winnerTeamId: 10 }), // win
  ]
  const record = buildTeamRecord(matches, 10)
  assert.equal(record.matches, 4)
  assert.equal(record.wins, 2)
  assert.equal(record.losses, 1)
  assert.equal(record.ties, 1)
  assert.equal(record.noResults, 0)
  assert.equal(record.winPercentage, 50)
})

test('buildTeamRecord: zero matches -> zeros and a null win percentage, never a division-by-zero NaN', () => {
  const record = buildTeamRecord([], 10)
  assert.deepEqual(record, { matches: 0, wins: 0, losses: 0, ties: 0, noResults: 0, winPercentage: null })
})

test('buildTeamRecord: NO_RESULT is tracked separately from TIE and never counted as a win or loss', () => {
  const matches = [match({ id: 1, date: '2026-01-01', winnerTeamId: null, resultType: 'NO_RESULT' })]
  const record = buildTeamRecord(matches, 10)
  assert.equal(record.noResults, 1)
  assert.equal(record.wins, 0)
  assert.equal(record.losses, 0)
})

test('buildRecentForm: newest-first, bounded to `count`, correct W/L/T letters', () => {
  const matches = [
    match({ id: 1, date: '2026-01-01', winnerTeamId: 10 }),
    match({ id: 2, date: '2026-01-05', winnerTeamId: 20 }),
    match({ id: 3, date: '2026-01-03', winnerTeamId: null, resultType: 'TIE' }),
  ]
  const form = buildRecentForm(matches, 10, 5)
  assert.deepEqual(
    form.map((f) => f.matchId),
    [2, 3, 1],
    'sorted newest match_date first'
  )
  assert.deepEqual(
    form.map((f) => f.result),
    ['L', 'T', 'W']
  )
})

test('buildRecentForm: bounded by count even with more eligible matches', () => {
  const matches = Array.from({ length: 8 }, (_, i) => match({ id: i, date: `2026-01-0${i + 1}`, winnerTeamId: 10 }))
  const form = buildRecentForm(matches, 10, 5)
  assert.equal(form.length, 5)
})

test('buildRecentForm: same-date matches tie-break deterministically by match id', () => {
  const matches = [match({ id: 1, date: '2026-01-01', winnerTeamId: 10 }), match({ id: 5, date: '2026-01-01', winnerTeamId: 10 })]
  const form = buildRecentForm(matches, 10, 5)
  assert.deepEqual(
    form.map((f) => f.matchId),
    [5, 1]
  )
})
