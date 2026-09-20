import { test } from 'node:test'
import assert from 'node:assert/strict'
import { timeToMinutes, timeRangesOverlap, hasOverlappingActiveSlot, findSlotContainingTime } from './pricing.js'

test('timeToMinutes: parses HH:MM and HH:MM:SS (pg TIME format) identically', () => {
  assert.equal(timeToMinutes('06:00'), 360)
  assert.equal(timeToMinutes('06:00:00'), 360)
  assert.equal(timeToMinutes('21:30:00'), 1290)
  assert.equal(timeToMinutes('00:00:00'), 0)
})

test('timeRangesOverlap: touching ranges do not overlap ([start,end) semantics)', () => {
  assert.equal(timeRangesOverlap(360, 540, 540, 780), false) // 06:00-09:00 then 09:00-13:00
  assert.equal(timeRangesOverlap(360, 540, 539, 780), true) // one minute of real overlap
})

test('timeRangesOverlap: partial and containing overlaps are both true', () => {
  assert.equal(timeRangesOverlap(360, 540, 480, 600), true) // partial
  assert.equal(timeRangesOverlap(360, 780, 480, 600), true) // b fully inside a
})

test('hasOverlappingActiveSlot: rejects a new slot overlapping an existing active one', () => {
  const existing = [{ id: 1, start_time: '06:00:00', end_time: '09:00:00', is_active: true }]
  assert.equal(hasOverlappingActiveSlot(existing, timeToMinutes('08:00'), timeToMinutes('11:00')), true)
  assert.equal(hasOverlappingActiveSlot(existing, timeToMinutes('09:00'), timeToMinutes('13:00')), false, 'adjacent, non-overlapping slot is fine')
})

test('hasOverlappingActiveSlot: ignores INACTIVE slots — their time range is free to reuse', () => {
  const existing = [{ id: 1, start_time: '06:00:00', end_time: '09:00:00', is_active: false }]
  assert.equal(hasOverlappingActiveSlot(existing, timeToMinutes('06:00'), timeToMinutes('09:00')), false)
})

test('hasOverlappingActiveSlot: excludeSlotId lets an edit compare against every OTHER slot, not itself', () => {
  const existing = [{ id: 1, start_time: '06:00:00', end_time: '09:00:00', is_active: true }]
  assert.equal(hasOverlappingActiveSlot(existing, timeToMinutes('06:00'), timeToMinutes('09:30'), 1), false, 'excluded from comparison')
  assert.equal(hasOverlappingActiveSlot(existing, timeToMinutes('06:00'), timeToMinutes('09:30'), 2), true, 'a DIFFERENT slot id must still be compared')
})

test('findSlotContainingTime: returns the active slot whose range contains the given time', () => {
  const slots = [
    { id: 1, start_time: '06:00:00', end_time: '09:00:00', price: '2000.00', is_active: true },
    { id: 2, start_time: '09:00:00', end_time: '13:00:00', price: '2500.00', is_active: true },
  ]
  assert.equal(findSlotContainingTime(slots, timeToMinutes('07:00')).id, 1)
  assert.equal(findSlotContainingTime(slots, timeToMinutes('09:00')).id, 2, 'boundary instant belongs to the slot that STARTS there, not the one ending there')
  assert.equal(findSlotContainingTime(slots, timeToMinutes('12:59')).id, 2)
})

test('findSlotContainingTime: null when no active slot covers the time (gap in configured pricing)', () => {
  const slots = [{ id: 1, start_time: '06:00:00', end_time: '09:00:00', price: '2000.00', is_active: true }]
  assert.equal(findSlotContainingTime(slots, timeToMinutes('21:00')), null)
})

test('findSlotContainingTime: skips inactive slots even if their range would otherwise match', () => {
  const slots = [{ id: 1, start_time: '06:00:00', end_time: '09:00:00', price: '2000.00', is_active: false }]
  assert.equal(findSlotContainingTime(slots, timeToMinutes('07:00')), null)
})
