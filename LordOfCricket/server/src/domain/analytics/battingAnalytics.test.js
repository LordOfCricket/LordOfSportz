import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBoundaryAnalysis, countBattingDots, battingDotBallPercentage } from './battingAnalytics.js'

test('computeBoundaryAnalysis: boundaryRunsPercentage = boundaryRuns / totalRuns * 100', () => {
  const r = computeBoundaryAnalysis({ runs: 50, fours: 4, sixes: 2 })
  assert.equal(r.boundaryRuns, 28) // 4*4 + 2*6
  assert.ok(Math.abs(r.boundaryRunsPercentage - 56) < 1e-9) // 28/50*100
})

test('computeBoundaryAnalysis: zero runs -> null percentage, never a 0/0 crash or a fake 0%', () => {
  const r = computeBoundaryAnalysis({ runs: 0, fours: 0, sixes: 0 })
  assert.equal(r.boundaryRunsPercentage, null)
})

function delivery({ over = 1, strikerMatchPlayerId, batRuns = 0, illegal = null, voided = false, isDeadBall = false }) {
  return { over, strikerMatchPlayerId, batRuns, illegal, voided, isDeadBall }
}

test('countBattingDots: counts faced deliveries with 0 bat runs, excludes wides (never a ball faced)', () => {
  const deliveries = [
    delivery({ strikerMatchPlayerId: 1, batRuns: 0 }), // dot
    delivery({ strikerMatchPlayerId: 1, batRuns: 4 }), // not a dot
    delivery({ strikerMatchPlayerId: 1, batRuns: 0, illegal: { type: 'wide', runs: 1 } }), // wide never counts as faced
    delivery({ strikerMatchPlayerId: 2, batRuns: 0 }), // different batter
  ]
  assert.equal(countBattingDots(deliveries, 1), 1)
})

test('countBattingDots: a no-ball WITH 0 bat runs still counts as a faced dot (no-ball counts as a ball faced)', () => {
  const deliveries = [delivery({ strikerMatchPlayerId: 1, batRuns: 0, illegal: { type: 'no-ball', runs: 1 } })]
  assert.equal(countBattingDots(deliveries, 1), 1)
})

test('countBattingDots: voided and dead-ball deliveries are excluded', () => {
  const deliveries = [delivery({ strikerMatchPlayerId: 1, batRuns: 0, voided: true }), delivery({ strikerMatchPlayerId: 1, batRuns: 0, isDeadBall: true })]
  assert.equal(countBattingDots(deliveries, 1), 0)
})

test('battingDotBallPercentage: zero balls faced -> null, never NaN/Infinity', () => {
  assert.equal(battingDotBallPercentage(0, 0), null)
})

test('battingDotBallPercentage: normal case', () => {
  assert.equal(battingDotBallPercentage(12, 30), 40)
})
