import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeAverageInnings } from './teamAverages.js'

test('computeAverageInnings: mean of the real final scores', () => {
  assert.equal(computeAverageInnings([120, 150, 90]), 120)
})

test('computeAverageInnings: empty list -> null, never a division-by-zero NaN', () => {
  assert.equal(computeAverageInnings([]), null)
})
