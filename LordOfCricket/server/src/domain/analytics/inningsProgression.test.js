import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScoreProgression, attachRequiredRunRate } from './inningsProgression.js'

function delivery({ over, batRuns = 0, illegal = null, wicket = null, voided = false, isDeadBall = false, isLegalDelivery = true }) {
  const illegalRunRuns = illegal ? illegal.runs - 1 : 0
  const flatPenalty = illegal ? 1 : 0
  const totalRuns = batRuns + illegalRunRuns + flatPenalty
  return { over, batRuns, illegal, wicket, voided, isDeadBall, isLegalDelivery, totalRuns }
}

test('buildScoreProgression: cumulative runs/wickets/legalBalls accumulate correctly over by over', () => {
  const deliveries = [
    delivery({ over: 1, batRuns: 4 }),
    delivery({ over: 1, batRuns: 1 }),
    delivery({ over: 2, batRuns: 0, wicket: { type: 'bowled' } }),
    delivery({ over: 2, batRuns: 6 }),
  ]
  const points = buildScoreProgression(deliveries, 6)
  assert.equal(points.length, 2)
  assert.deepEqual(points[0], { over: 1, cumulativeRuns: 5, cumulativeWickets: 0, cumulativeLegalBalls: 2, runRate: (5 / 2) * 6 })
  assert.equal(points[1].cumulativeRuns, 11)
  assert.equal(points[1].cumulativeWickets, 1)
  assert.equal(points[1].cumulativeLegalBalls, 4)
})

test('buildScoreProgression: a final PARTIAL over is included with its real (not padded) legal-ball count', () => {
  const deliveries = [delivery({ over: 1, batRuns: 4 }), delivery({ over: 1, batRuns: 1 }), delivery({ over: 1, batRuns: 2 })]
  const points = buildScoreProgression(deliveries, 6)
  assert.equal(points.length, 1)
  assert.equal(points[0].cumulativeLegalBalls, 3)
  assert.equal(points[0].cumulativeRuns, 7)
})

test('buildScoreProgression: voided and dead-ball deliveries never affect the progression', () => {
  const deliveries = [delivery({ over: 1, batRuns: 4 }), delivery({ over: 1, batRuns: 6, voided: true }), delivery({ over: 1, batRuns: 1, isDeadBall: true })]
  const points = buildScoreProgression(deliveries, 6)
  assert.equal(points[0].cumulativeRuns, 4)
  assert.equal(points[0].cumulativeLegalBalls, 1)
})

test('attachRequiredRunRate: null target (innings 1, not chasing) -> requiredRunRate null throughout', () => {
  const points = [{ over: 1, cumulativeRuns: 6, cumulativeLegalBalls: 6, cumulativeWickets: 0, runRate: 6 }]
  const withRrr = attachRequiredRunRate(points, null, 20, 6)
  assert.equal(withRrr[0].requiredRunRate, null)
})

test('attachRequiredRunRate: a real chase reuses calculateRequiredRunRate exactly', () => {
  const points = [{ over: 5, cumulativeRuns: 30, cumulativeLegalBalls: 30, cumulativeWickets: 1, runRate: 6 }]
  const withRrr = attachRequiredRunRate(points, 121, 20, 6)
  // target 121, scored 30, balls remaining = 120-30=90 -> runsNeeded 91 -> 91/(90/6) = 6.0666...
  assert.equal(withRrr[0].requiredRunRate, 91 / (90 / 6))
})
