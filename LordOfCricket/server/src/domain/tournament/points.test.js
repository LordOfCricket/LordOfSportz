import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pointsForResult, TOURNAMENT_POINTS } from './points.js'

test('win = 2 points', () => {
  assert.equal(pointsForResult('RUNS', true), 2)
  assert.equal(pointsForResult('WICKETS', true), 2)
})

test('loss = 0 points', () => {
  assert.equal(pointsForResult('RUNS', false), 0)
  assert.equal(pointsForResult('WICKETS', false), 0)
})

test('tie = 1 point regardless of isWinner', () => {
  assert.equal(pointsForResult('TIE', false), 1)
  assert.equal(pointsForResult('TIE', true), 1)
})

test('no result = 1 point regardless of isWinner', () => {
  assert.equal(pointsForResult('NO_RESULT', false), 1)
  assert.equal(pointsForResult('NO_RESULT', true), 1)
})

test('policy constants match the documented V1 defaults', () => {
  assert.deepEqual(TOURNAMENT_POINTS, { WIN: 2, TIE: 1, NO_RESULT: 1, LOSS: 0 })
})
