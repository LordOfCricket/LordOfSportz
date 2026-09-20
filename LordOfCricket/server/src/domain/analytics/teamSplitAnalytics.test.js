import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBattingFirstVsChasing } from './teamSplitAnalytics.js'

test('computeBattingFirstVsChasing: splits and computes win% for each side independently', () => {
  const rows = [
    { battingFirst: true, won: true },
    { battingFirst: true, won: false },
    { battingFirst: false, won: true },
    { battingFirst: false, won: true },
    { battingFirst: false, won: false },
  ]
  const r = computeBattingFirstVsChasing(rows)
  assert.deepEqual(r.battingFirst, { matches: 2, wins: 1, winPercentage: 50 })
  assert.deepEqual(r.chasing, { matches: 3, wins: 2, winPercentage: (2 / 3) * 100 })
})

test('computeBattingFirstVsChasing: zero matches on one side -> null win%, never a division-by-zero NaN', () => {
  const r = computeBattingFirstVsChasing([{ battingFirst: true, won: true }])
  assert.deepEqual(r.chasing, { matches: 0, wins: 0, winPercentage: null })
})

test('computeBattingFirstVsChasing: a TIE/NO_RESULT (won=null) counts toward matches but not wins', () => {
  const r = computeBattingFirstVsChasing([{ battingFirst: true, won: null }, { battingFirst: true, won: true }])
  assert.deepEqual(r.battingFirst, { matches: 2, wins: 1, winPercentage: 50 })
})
