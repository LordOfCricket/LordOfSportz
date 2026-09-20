import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidPaymentStatusTransition, isTerminalPaymentStatus, PAYMENT_STATUSES } from './paymentStatus.js'

test('PAYMENT_STATUSES is exactly the 5 documented statuses', () => {
  assert.deepEqual(PAYMENT_STATUSES, ['PENDING', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED'])
})

test('PENDING can move to APPROVED, PAID, CANCELLED, or FAILED', () => {
  assert.equal(isValidPaymentStatusTransition('PENDING', 'APPROVED'), true)
  assert.equal(isValidPaymentStatusTransition('PENDING', 'PAID'), true)
  assert.equal(isValidPaymentStatusTransition('PENDING', 'CANCELLED'), true)
  assert.equal(isValidPaymentStatusTransition('PENDING', 'FAILED'), true)
})

test('APPROVED can move to PAID, CANCELLED, or FAILED, but not back to PENDING', () => {
  assert.equal(isValidPaymentStatusTransition('APPROVED', 'PAID'), true)
  assert.equal(isValidPaymentStatusTransition('APPROVED', 'CANCELLED'), true)
  assert.equal(isValidPaymentStatusTransition('APPROVED', 'FAILED'), true)
  assert.equal(isValidPaymentStatusTransition('APPROVED', 'PENDING'), false)
})

test('PAID, FAILED, and CANCELLED are terminal — no transition out of any of them', () => {
  for (const terminal of ['PAID', 'FAILED', 'CANCELLED']) {
    for (const target of PAYMENT_STATUSES) {
      assert.equal(isValidPaymentStatusTransition(terminal, target), false, `${terminal} -> ${target} must be rejected`)
    }
  }
})

test('a status transitioning to itself is rejected — never a no-op "transition"', () => {
  assert.equal(isValidPaymentStatusTransition('PENDING', 'PENDING'), false)
})

test('unknown status values are always rejected, never crash', () => {
  assert.equal(isValidPaymentStatusTransition('PENDING', 'NOT_A_STATUS'), false)
  assert.equal(isValidPaymentStatusTransition('NOT_A_STATUS', 'PENDING'), false)
})

test('isTerminalPaymentStatus matches the transition table exactly', () => {
  assert.equal(isTerminalPaymentStatus('PAID'), true)
  assert.equal(isTerminalPaymentStatus('FAILED'), true)
  assert.equal(isTerminalPaymentStatus('CANCELLED'), true)
  assert.equal(isTerminalPaymentStatus('PENDING'), false)
  assert.equal(isTerminalPaymentStatus('APPROVED'), false)
})
