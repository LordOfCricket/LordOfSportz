import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFixtureResolved, winnerOf, isRoundComplete } from './progression.js'

test('progression: a finalized decisive result resolves, winner advances', () => {
  const fr = { matchStatus: 'finalized', resultType: 'RUNS', winnerTeamId: 7, manualWinnerTeamId: null }
  assert.equal(isFixtureResolved(fr), true)
  assert.equal(winnerOf(fr), 7)
})

test('progression: a live/completed-but-not-finalized match never resolves', () => {
  const live = { matchStatus: 'live', resultType: null, winnerTeamId: null, manualWinnerTeamId: null }
  const completed = { matchStatus: 'completed', resultType: 'RUNS', winnerTeamId: 7, manualWinnerTeamId: null }
  assert.equal(isFixtureResolved(live), false)
  assert.equal(isFixtureResolved(completed), false)
  assert.equal(winnerOf(completed), null)
})

test('progression: a tie does NOT auto-resolve — no fake winner invented', () => {
  const fr = { matchStatus: 'finalized', resultType: 'TIE', winnerTeamId: null, manualWinnerTeamId: null }
  assert.equal(isFixtureResolved(fr), false)
  assert.equal(winnerOf(fr), null)
})

test('progression: NO_RESULT does NOT auto-resolve — no fake winner invented', () => {
  const fr = { matchStatus: 'finalized', resultType: 'NO_RESULT', winnerTeamId: null, manualWinnerTeamId: null }
  assert.equal(isFixtureResolved(fr), false)
  assert.equal(winnerOf(fr), null)
})

test('progression: a staff manual-resolution override resolves a tie explicitly, never automatically', () => {
  const fr = { matchStatus: 'finalized', resultType: 'TIE', winnerTeamId: null, manualWinnerTeamId: 12 }
  assert.equal(isFixtureResolved(fr), true)
  assert.equal(winnerOf(fr), 12)
})

test('progression: reprocessing the same finalized result is idempotent (same input -> same output)', () => {
  const fr = { matchStatus: 'finalized', resultType: 'WICKETS', winnerTeamId: 3, manualWinnerTeamId: null }
  assert.equal(winnerOf(fr), winnerOf(fr))
})

test('isRoundComplete: true only when every fixture in the round is resolved', () => {
  const resolved = { matchStatus: 'finalized', resultType: 'RUNS', winnerTeamId: 1, manualWinnerTeamId: null }
  const unresolved = { matchStatus: 'finalized', resultType: 'TIE', winnerTeamId: null, manualWinnerTeamId: null }
  assert.equal(isRoundComplete([resolved, resolved]), true)
  assert.equal(isRoundComplete([resolved, unresolved]), false)
  assert.equal(isRoundComplete([]), false)
})
