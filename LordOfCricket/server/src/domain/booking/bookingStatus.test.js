import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveDisplayStatus, isValidStatusTransition, isBlockingStatus, BLOCKING_STATUSES, NON_BLOCKING_STATUSES } from './bookingStatus.js'

test('deriveDisplayStatus: a cancelled booking is always CANCELLED regardless of time', () => {
  const booking = { status: 'CANCELLED', end_time: '2099-01-01T00:00:00Z' }
  assert.equal(deriveDisplayStatus(booking, new Date('2000-01-01')), 'CANCELLED')
})

test('deriveDisplayStatus: a confirmed booking whose slot is still in the future is APPROVED', () => {
  const booking = { status: 'CONFIRMED', end_time: '2099-01-01T00:00:00Z' }
  assert.equal(deriveDisplayStatus(booking, new Date('2020-01-01')), 'APPROVED')
})

test('deriveDisplayStatus: a confirmed booking whose slot has already ended is COMPLETED', () => {
  const booking = { status: 'CONFIRMED', end_time: '2000-01-01T00:00:00Z' }
  assert.equal(deriveDisplayStatus(booking, new Date('2020-01-01')), 'COMPLETED')
})

test('deriveDisplayStatus: exactly at end_time counts as COMPLETED (half-open, matches EXCLUDE constraint semantics)', () => {
  const booking = { status: 'CONFIRMED', end_time: '2020-01-01T10:00:00Z' }
  assert.equal(deriveDisplayStatus(booking, new Date('2020-01-01T10:00:00Z')), 'COMPLETED')
})

test('isValidStatusTransition: CONFIRMED -> CANCELLED is valid', () => {
  assert.equal(isValidStatusTransition('CONFIRMED', 'CANCELLED'), true)
})

test('isValidStatusTransition: CANCELLED -> anything is invalid, never resurrected', () => {
  assert.equal(isValidStatusTransition('CANCELLED', 'CONFIRMED'), false)
  assert.equal(isValidStatusTransition('CANCELLED', 'CANCELLED'), false)
})

test('isValidStatusTransition: unknown states are invalid, never a crash', () => {
  assert.equal(isValidStatusTransition('BOGUS', 'CANCELLED'), false)
})

// Phase 24 — the widened multi-ground/team/player state machine.

test('isBlockingStatus: HOLD/PROPOSED/PENDING/CONFIRMED occupy the slot, nothing else does', () => {
  for (const s of BLOCKING_STATUSES) assert.equal(isBlockingStatus(s), true, s)
  for (const s of NON_BLOCKING_STATUSES) assert.equal(isBlockingStatus(s), false, s)
  assert.equal(isBlockingStatus('BOGUS'), false)
})

test('BLOCKING_STATUSES and NON_BLOCKING_STATUSES partition the full state machine with no overlap', () => {
  const all = [...BLOCKING_STATUSES, ...NON_BLOCKING_STATUSES]
  assert.equal(new Set(all).size, all.length, 'no status appears in both lists')
})

test('isValidStatusTransition: HOLD can move to CONFIRMED, CANCELLED, or EXPIRED, never back to PENDING/PROPOSED', () => {
  assert.equal(isValidStatusTransition('HOLD', 'CONFIRMED'), true)
  assert.equal(isValidStatusTransition('HOLD', 'CANCELLED'), true)
  assert.equal(isValidStatusTransition('HOLD', 'EXPIRED'), true)
  assert.equal(isValidStatusTransition('HOLD', 'PENDING'), false)
  assert.equal(isValidStatusTransition('HOLD', 'PROPOSED'), false)
})

test('isValidStatusTransition: PROPOSED (open match proposal) can move to CONFIRMED (accepted), CANCELLED, or EXPIRED', () => {
  assert.equal(isValidStatusTransition('PROPOSED', 'CONFIRMED'), true)
  assert.equal(isValidStatusTransition('PROPOSED', 'CANCELLED'), true)
  assert.equal(isValidStatusTransition('PROPOSED', 'EXPIRED'), true)
  assert.equal(isValidStatusTransition('PROPOSED', 'REJECTED'), false)
})

test('isValidStatusTransition: PENDING can move to CONFIRMED, REJECTED, or CANCELLED', () => {
  assert.equal(isValidStatusTransition('PENDING', 'CONFIRMED'), true)
  assert.equal(isValidStatusTransition('PENDING', 'REJECTED'), true)
  assert.equal(isValidStatusTransition('PENDING', 'CANCELLED'), true)
  assert.equal(isValidStatusTransition('PENDING', 'EXPIRED'), false)
})

test('isValidStatusTransition: CONFIRMED can move to CANCELLED, NO_SHOW, or COMPLETED', () => {
  assert.equal(isValidStatusTransition('CONFIRMED', 'NO_SHOW'), true)
  assert.equal(isValidStatusTransition('CONFIRMED', 'COMPLETED'), true)
  assert.equal(isValidStatusTransition('CONFIRMED', 'PENDING'), false)
})

test('isValidStatusTransition: every terminal status (REJECTED/CANCELLED/EXPIRED/COMPLETED/NO_SHOW) has zero outgoing transitions', () => {
  for (const s of NON_BLOCKING_STATUSES) {
    for (const target of [...BLOCKING_STATUSES, ...NON_BLOCKING_STATUSES]) {
      assert.equal(isValidStatusTransition(s, target), false, `${s} -> ${target} must be invalid`)
    }
  }
})

test('deriveDisplayStatus: a non-CONFIRMED/CANCELLED stored status (e.g. a match-engine PENDING/HOLD row) passes through as-is', () => {
  assert.equal(deriveDisplayStatus({ status: 'PENDING', end_time: '2099-01-01T00:00:00Z' }), 'PENDING')
  assert.equal(deriveDisplayStatus({ status: 'NO_SHOW', end_time: '2000-01-01T00:00:00Z' }), 'NO_SHOW')
})
