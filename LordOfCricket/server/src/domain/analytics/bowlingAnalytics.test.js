import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bowlingDotBallPercentage } from './bowlingAnalytics.js'

test('bowlingDotBallPercentage: zero legal balls -> null, never NaN/Infinity', () => {
  assert.equal(bowlingDotBallPercentage(0, 0), null)
})

test('bowlingDotBallPercentage: normal case', () => {
  assert.equal(bowlingDotBallPercentage(18, 24), 75)
})
