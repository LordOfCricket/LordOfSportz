import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePhaseBoundaries, phaseForOver, PHASE_NAMES } from './matchPhases.js'

test('computePhaseBoundaries: null for no overs limit (unlimited-overs match)', () => {
  assert.equal(computePhaseBoundaries(null), null)
})

test('computePhaseBoundaries: null for a match too short to split meaningfully', () => {
  assert.equal(computePhaseBoundaries(2), null)
  assert.equal(computePhaseBoundaries(0), null)
})

test('computePhaseBoundaries: a 20-over match splits into three proportional thirds', () => {
  const b = computePhaseBoundaries(20)
  assert.deepEqual(b, { openingEndOver: 7, closingStartOver: 14, oversPerInnings: 20 })
})

test('phaseForOver: every over from 1..oversPerInnings is covered exactly once, no gaps/overlaps', () => {
  for (const overs of [3, 4, 5, 6, 10, 20, 50]) {
    const b = computePhaseBoundaries(overs)
    const seen = []
    for (let over = 1; over <= overs; over++) {
      const phase = phaseForOver(over, b)
      assert.ok(PHASE_NAMES.includes(phase), `over ${over} of ${overs} got an unknown phase: ${phase}`)
      seen.push(phase)
    }
    assert.equal(seen.length, overs)
  }
})

test('phaseForOver: null boundaries -> null phase (caller must treat as "not available")', () => {
  assert.equal(phaseForOver(1, null), null)
})
