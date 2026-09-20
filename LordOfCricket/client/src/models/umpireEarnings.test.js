import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paymentStatusLabel, paymentStatusClasses, formatAmount, PAYMENT_STATUSES } from './umpireEarnings.model.js'

test('PAYMENT_STATUSES matches the backend enum exactly', () => {
  assert.deepEqual(PAYMENT_STATUSES, ['PENDING', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED'])
})

test('paymentStatusLabel maps every known status, falls back to the raw value for an unknown one', () => {
  assert.equal(paymentStatusLabel('PENDING'), 'Pending')
  assert.equal(paymentStatusLabel('PAID'), 'Paid')
  assert.equal(paymentStatusLabel('SOMETHING_ELSE'), 'SOMETHING_ELSE')
})

test('paymentStatusClasses returns a real class string for every known status, and a safe default otherwise', () => {
  for (const status of PAYMENT_STATUSES) {
    assert.ok(paymentStatusClasses(status).length > 0)
  }
  assert.equal(paymentStatusClasses('unknown'), paymentStatusClasses('PENDING'))
})

test('formatAmount renders INR with the rupee symbol and 2 decimal places', () => {
  assert.equal(formatAmount('800.00', 'INR'), '₹800.00')
  assert.equal(formatAmount('1600.5', 'INR'), '₹1,600.50')
})

test('formatAmount handles a non-INR currency code and null amount', () => {
  assert.equal(formatAmount('50.00', 'USD'), 'USD 50.00')
  assert.equal(formatAmount(null), null)
})
