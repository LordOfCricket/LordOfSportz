import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isReplayedStep } from './replayGuard.js'

test('isReplayedStep: no prior step recorded is never a replay', () => {
  assert.equal(isReplayedStep(null, 58234123), false)
  assert.equal(isReplayedStep(undefined, 58234123), false)
})

test('isReplayedStep: the same step as last time is a replay', () => {
  assert.equal(isReplayedStep(58234123, 58234123), true)
})

test('isReplayedStep: a later step is not a replay', () => {
  assert.equal(isReplayedStep(58234123, 58234124), false)
})

test('isReplayedStep: compares numerically even if the stored value is a string (BIGINT column via pg)', () => {
  assert.equal(isReplayedStep('58234123', 58234123), true)
})

test('isReplayedStep: a step of exactly 0 is a valid recorded step, not treated as "none"', () => {
  assert.equal(isReplayedStep(0, 0), true)
  assert.equal(isReplayedStep(0, 1), false)
})
