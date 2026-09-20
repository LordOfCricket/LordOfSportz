import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rangesOverlap, generateSlotGrid, computeDayAvailability } from './availability.js'
import { groundLocalToUtc } from './timezone.js'
import { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR, SLOT_DURATION_MINUTES } from './policy.js'

function slot(date, hour, minute = 0) {
  return groundLocalToUtc(date, hour, minute)
}

// ---- rangesOverlap: the exact interval semantics the DB exclusion
// constraint enforces (Part 20/52) — verified here at the domain level so the
// UI/recommendation logic agrees with what the database will actually allow.

test('rangesOverlap: identical ranges overlap', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 18), slot('2026-08-08', 20), slot('2026-08-08', 18), slot('2026-08-08', 20)), true)
})

test('rangesOverlap: partial overlap (7-9 vs existing 6-8) overlaps', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 18), slot('2026-08-08', 20), slot('2026-08-08', 19), slot('2026-08-08', 21)), true)
})

test('rangesOverlap: partial overlap (5-7 vs existing 6-8) overlaps', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 18), slot('2026-08-08', 20), slot('2026-08-08', 17), slot('2026-08-08', 19)), true)
})

test('rangesOverlap: engulfing range (5-9 vs existing 6-8) overlaps', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 18), slot('2026-08-08', 20), slot('2026-08-08', 17), slot('2026-08-08', 21)), true)
})

test('rangesOverlap: touching ranges (6-8 then 8-10) do NOT overlap — half-open [) semantics', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 18), slot('2026-08-08', 20), slot('2026-08-08', 20), slot('2026-08-08', 22)), false)
})

test('rangesOverlap: touching ranges (4-6 then 6-8) do NOT overlap', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 18), slot('2026-08-08', 20), slot('2026-08-08', 16), slot('2026-08-08', 18)), false)
})

test('rangesOverlap: fully disjoint ranges do not overlap', () => {
  assert.equal(rangesOverlap(slot('2026-08-08', 10), slot('2026-08-08', 12), slot('2026-08-08', 18), slot('2026-08-08', 20)), false)
})

// ---- generateSlotGrid

test('generateSlotGrid: produces back-to-back fixed-width slots from opening to closing', () => {
  const slots = generateSlotGrid('2026-08-08')
  const expectedCount = Math.floor(((GROUND_CLOSING_HOUR - GROUND_OPENING_HOUR) * 60) / SLOT_DURATION_MINUTES)
  assert.equal(slots.length, expectedCount)
  assert.equal(slots[0].startTime.getTime(), slot('2026-08-08', GROUND_OPENING_HOUR).getTime())
  for (let i = 1; i < slots.length; i++) {
    assert.equal(slots[i].startTime.getTime(), slots[i - 1].endTime.getTime(), 'slots must be contiguous, no gaps or overlaps')
  }
  assert.ok(slots[slots.length - 1].endTime.getTime() <= slot('2026-08-08', GROUND_CLOSING_HOUR).getTime())
})

// ---- computeDayAvailability

test('computeDayAvailability: a slot overlapping an occupied range is UNAVAILABLE with the given reason', () => {
  const occupied = [{ startTime: slot('2026-08-08', 18), endTime: slot('2026-08-08', 20), reason: 'BOOKED' }]
  const result = computeDayAvailability('2026-08-08', occupied, { now: slot('2026-08-01', 0) })
  const sixPm = result.find((s) => s.startTime.getTime() === slot('2026-08-08', 18).getTime())
  assert.equal(sixPm.status, 'UNAVAILABLE')
  assert.equal(sixPm.reason, 'BOOKED')
})

test('computeDayAvailability: a slot with no occupied overlap is AVAILABLE', () => {
  const occupied = [{ startTime: slot('2026-08-08', 18), endTime: slot('2026-08-08', 20), reason: 'BOOKED' }]
  const result = computeDayAvailability('2026-08-08', occupied, { now: slot('2026-08-01', 0) })
  const tenAm = result.find((s) => s.startTime.getTime() === slot('2026-08-08', 10).getTime())
  assert.equal(tenAm.status, 'AVAILABLE')
  assert.equal(tenAm.reason, null)
})

test('computeDayAvailability: a slot whose start time has already passed is UNAVAILABLE/PAST, never bookable', () => {
  const now = slot('2026-08-08', 15) // 3pm — 10am slot already passed today
  const result = computeDayAvailability('2026-08-08', [], { now })
  const tenAm = result.find((s) => s.startTime.getTime() === slot('2026-08-08', 10).getTime())
  assert.equal(tenAm.status, 'UNAVAILABLE')
  assert.equal(tenAm.reason, 'PAST')
  const fourPm = result.find((s) => s.startTime.getTime() === slot('2026-08-08', 16).getTime())
  assert.equal(fourPm.status, 'AVAILABLE')
})

test('computeDayAvailability: a touching adjacent booking does not make the next slot unavailable', () => {
  const occupied = [{ startTime: slot('2026-08-08', 18), endTime: slot('2026-08-08', 20), reason: 'BOOKED' }]
  const result = computeDayAvailability('2026-08-08', occupied, { now: slot('2026-08-01', 0) })
  const eightPm = result.find((s) => s.startTime.getTime() === slot('2026-08-08', 20).getTime())
  assert.equal(eightPm.status, 'AVAILABLE')
})
