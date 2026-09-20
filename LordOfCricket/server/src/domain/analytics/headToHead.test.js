import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHeadToHead } from './headToHead.js'

test('computeHeadToHead: counts wins/ties/no-results correctly for both sides', () => {
  const rows = [
    { id: 1, match_date: '2026-01-01', winner_team_id: 1, result_type: 'RUNS', result_margin: 10 },
    { id: 2, match_date: '2026-02-01', winner_team_id: 2, result_type: 'WICKETS', result_margin: 3 },
    { id: 3, match_date: '2026-03-01', winner_team_id: null, result_type: 'TIE', result_margin: null },
    { id: 4, match_date: '2026-04-01', winner_team_id: null, result_type: 'NO_RESULT', result_margin: null },
  ]
  const r = computeHeadToHead(rows, 1, 2)
  assert.equal(r.matchesPlayed, 4)
  assert.equal(r.teamAWins, 1)
  assert.equal(r.teamBWins, 1)
  assert.equal(r.ties, 1)
  assert.equal(r.noResults, 1)
})

test('computeHeadToHead: recentMeetings is newest-first and bounded by recentCount', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, match_date: `2026-01-${String(i + 1).padStart(2, '0')}`, winner_team_id: 1, result_type: 'RUNS', result_margin: 5,
  }))
  const r = computeHeadToHead(rows, 1, 2, 5)
  assert.equal(r.recentMeetings.length, 5)
  assert.equal(r.recentMeetings[0].matchId, 8)
})

test('computeHeadToHead: zero prior meetings -> clean zeroed response', () => {
  const r = computeHeadToHead([], 1, 2)
  assert.deepEqual(r, { matchesPlayed: 0, teamAWins: 0, teamBWins: 0, ties: 0, noResults: 0, recentMeetings: [] })
})
