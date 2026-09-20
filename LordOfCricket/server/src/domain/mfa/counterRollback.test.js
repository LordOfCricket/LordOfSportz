import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCounterRollback } from './counterRollback.js'

test('isCounterRollback: a strictly higher new counter is not a rollback (the normal case)', () => {
  assert.equal(isCounterRollback(5, 6), false)
})

test('isCounterRollback: an equal counter is a rollback (replay of the same assertion)', () => {
  assert.equal(isCounterRollback(5, 5), true)
})

test('isCounterRollback: a lower counter is a rollback (cloned credential)', () => {
  assert.equal(isCounterRollback(5, 4), true)
})

test('isCounterRollback: both zero is the documented exception, never flagged', () => {
  assert.equal(isCounterRollback(0, 0), false)
})

test('isCounterRollback: stored zero but new counter also zero after a prior nonzero value would be caught elsewhere; here 0->1 is fine', () => {
  assert.equal(isCounterRollback(0, 1), false)
})

test('isCounterRollback: nonzero stored but new counter resets to zero is a rollback, not the both-zero exception', () => {
  assert.equal(isCounterRollback(5, 0), true)
})
