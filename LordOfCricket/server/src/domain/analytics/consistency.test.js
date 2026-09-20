import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBattingConsistency } from './consistency.js'

test('computeBattingConsistency: zero innings -> clean zeroed/null response, never a crash', () => {
  const r = computeBattingConsistency([])
  assert.deepEqual(r, { innings: 0, meanRuns: null, medianRuns: null, thirtyPlusCount: 0, fiftyPlusCount: 0, dismissals: 0, notOuts: 0 })
})

test('computeBattingConsistency: mean/median/thresholds over a known set of innings', () => {
  const perfs = [{ runs: 10, notOut: false }, { runs: 55, notOut: false }, { runs: 32, notOut: true }, { runs: 0, notOut: false }]
  const r = computeBattingConsistency(perfs)
  assert.equal(r.innings, 4)
  assert.equal(r.meanRuns, (10 + 55 + 32 + 0) / 4)
  assert.equal(r.medianRuns, (10 + 32) / 2) // sorted: 0,10,32,55 -> median of middle two
  assert.equal(r.thirtyPlusCount, 2) // 55 and 32
  assert.equal(r.fiftyPlusCount, 1) // 55
  assert.equal(r.dismissals, 3)
  assert.equal(r.notOuts, 1)
})

test('computeBattingConsistency: median of an odd-length list is the middle value', () => {
  const perfs = [{ runs: 1, notOut: false }, { runs: 5, notOut: false }, { runs: 9, notOut: false }]
  assert.equal(computeBattingConsistency(perfs).medianRuns, 5)
})
