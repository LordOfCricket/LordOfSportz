import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReliability } from './reliability.js'

test('computeReliability: no terminal history at all returns null, never a fabricated number', () => {
  assert.equal(computeReliability({ completed: 0, noShows: 0, cancellations: 0 }), null)
  assert.equal(computeReliability(), null)
})

test('computeReliability: matches the task brief\'s own worked example (126 completed, 2 no-shows, 3 cancellations ~= 96%)', () => {
  assert.equal(computeReliability({ completed: 126, noShows: 2, cancellations: 3 }), 96)
})

test('computeReliability: a perfect record is 100%', () => {
  assert.equal(computeReliability({ completed: 10, noShows: 0, cancellations: 0 }), 100)
})

test('computeReliability: no-shows and cancellations both count against the denominator', () => {
  assert.equal(computeReliability({ completed: 1, noShows: 1, cancellations: 0 }), 50)
  assert.equal(computeReliability({ completed: 1, noShows: 0, cancellations: 1 }), 50)
})

test('computeReliability: rounds to the nearest whole percent', () => {
  assert.equal(computeReliability({ completed: 2, noShows: 1, cancellations: 0 }), 67) // 2/3 = 66.67 -> 67
})
