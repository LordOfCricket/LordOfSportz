import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPhaseMetrics } from './phaseMetrics.js'

function delivery({ over, batRuns = 0, illegal = null, extra = null, wicket = null, voided = false, isDeadBall = false }) {
  const illegalRunRuns = illegal ? illegal.runs - 1 : 0
  const flatPenalty = illegal ? 1 : 0
  const totalRuns = batRuns + illegalRunRuns + flatPenalty + (extra?.runs || 0)
  return { over, batRuns, illegal, extra, wicket, voided, isDeadBall, isLegalDelivery: !illegal, totalRuns }
}

test('buildPhaseMetrics: null when oversPerInnings is too short to split', () => {
  assert.equal(buildPhaseMetrics([], 2, 6), null)
})

test('buildPhaseMetrics: runs/wickets/legalBalls reconcile exactly with the innings total', () => {
  // 6-over innings: 2 opening overs, 2 middle overs, 2 closing overs (third = round(6/3) = 2).
  const deliveries = []
  let totalRuns = 0
  let totalWickets = 0
  for (let over = 1; over <= 6; over++) {
    for (let ball = 0; ball < 6; ball++) {
      const isWicket = over === 4 && ball === 0
      const runs = isWicket ? 0 : (over + ball) % 5
      deliveries.push(delivery({ over, batRuns: runs, wicket: isWicket ? { type: 'bowled' } : null }))
      totalRuns += runs
      if (isWicket) totalWickets += 1
    }
  }
  const phases = buildPhaseMetrics(deliveries, 6, 6)
  assert.equal(phases.length, 3)
  assert.equal(phases.reduce((s, p) => s + p.runs, 0), totalRuns)
  assert.equal(phases.reduce((s, p) => s + p.wickets, 0), totalWickets)
  assert.equal(phases.reduce((s, p) => s + p.legalBalls, 0), 36)
})

test('buildPhaseMetrics: voided and dead-ball deliveries are excluded entirely', () => {
  const deliveries = [delivery({ over: 1, batRuns: 4 }), delivery({ over: 1, batRuns: 6, voided: true }), delivery({ over: 1, batRuns: 1, isDeadBall: true })]
  const phases = buildPhaseMetrics(deliveries, 3, 6)
  const opening = phases.find((p) => p.phase === 'Opening Phase')
  assert.equal(opening.runs, 4)
  assert.equal(opening.fours, 1)
  assert.equal(opening.sixes, 0)
})

test('buildPhaseMetrics: dot-ball predicate matches replay.js exactly (0 total runs, no wicket)', () => {
  const deliveries = [
    delivery({ over: 1, batRuns: 0 }), // dot
    delivery({ over: 1, batRuns: 0, wicket: { type: 'bowled' } }), // NOT a dot (a wicket ball)
    delivery({ over: 1, illegal: { type: 'wide', runs: 1 } }), // NOT a dot (illegal always totalRuns >= 1)
  ]
  const phases = buildPhaseMetrics(deliveries, 3, 6)
  assert.equal(phases.find((p) => p.phase === 'Opening Phase').dotBalls, 1)
})
