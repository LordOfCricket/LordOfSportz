import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBookingTimeRange, resolveGroundHours } from './teamBookingValidation.js'
import { BookingError } from './errors.js'
import { groundLocalToUtc } from '../shared/groundTime.js'

const NOW = groundLocalToUtc('2026-06-01', 8, 0)
const GROUND = { opening_hour: null, closing_hour: null } // falls back to global 6-22 policy default

test('resolveGroundHours: falls back to the global policy default when the ground has no override', () => {
  assert.deepEqual(resolveGroundHours({ opening_hour: null, closing_hour: null }), { openingHour: 6, closingHour: 22 })
})

test('resolveGroundHours: uses the ground-specific override when set', () => {
  assert.deepEqual(resolveGroundHours({ opening_hour: 9, closing_hour: 18 }), { openingHour: 9, closingHour: 18 })
})

test('validateBookingTimeRange: a well-formed future range within operating hours passes silently', () => {
  const startTime = groundLocalToUtc('2026-06-05', 18, 0)
  const endTime = groundLocalToUtc('2026-06-05', 20, 0)
  assert.doesNotThrow(() => validateBookingTimeRange({ startTime, endTime, ground: GROUND, now: NOW }))
})

test('validateBookingTimeRange: end <= start is rejected', () => {
  const t = groundLocalToUtc('2026-06-05', 18, 0)
  assert.throws(() => validateBookingTimeRange({ startTime: t, endTime: t, ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
  assert.throws(() => validateBookingTimeRange({ startTime: t, endTime: groundLocalToUtc('2026-06-05', 17, 0), ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
})

test('validateBookingTimeRange: a start time already in the past is rejected (server clock, never trusts the client)', () => {
  const startTime = groundLocalToUtc('2026-05-31', 18, 0) // before NOW
  const endTime = groundLocalToUtc('2026-05-31', 20, 0)
  assert.throws(() => validateBookingTimeRange({ startTime, endTime, ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'PAST_TIME')
})

test('validateBookingTimeRange: beyond the booking horizon is rejected', () => {
  const startTime = groundLocalToUtc('2027-01-01', 18, 0)
  const endTime = groundLocalToUtc('2027-01-01', 20, 0)
  assert.throws(() => validateBookingTimeRange({ startTime, endTime, ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_DATE')
})

test('validateBookingTimeRange: starting before the ground opens is rejected', () => {
  const startTime = groundLocalToUtc('2026-06-05', 5, 0)
  const endTime = groundLocalToUtc('2026-06-05', 7, 0)
  assert.throws(() => validateBookingTimeRange({ startTime, endTime, ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
})

test('validateBookingTimeRange: ending after the ground closes is rejected', () => {
  const startTime = groundLocalToUtc('2026-06-05', 21, 0)
  const endTime = groundLocalToUtc('2026-06-05', 23, 0)
  assert.throws(() => validateBookingTimeRange({ startTime, endTime, ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
})

test('validateBookingTimeRange: ending exactly at closing hour is allowed (half-open boundary)', () => {
  const startTime = groundLocalToUtc('2026-06-05', 20, 0)
  const endTime = groundLocalToUtc('2026-06-05', 22, 0)
  assert.doesNotThrow(() => validateBookingTimeRange({ startTime, endTime, ground: GROUND, now: NOW }))
})

test('validateBookingTimeRange: a per-ground operating-hours override is honored instead of the global default', () => {
  const narrowGround = { opening_hour: 9, closing_hour: 12 }
  const startTime = groundLocalToUtc('2026-06-05', 7, 0)
  const endTime = groundLocalToUtc('2026-06-05', 9, 0)
  assert.throws(() => validateBookingTimeRange({ startTime, endTime, ground: narrowGround, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
  assert.doesNotThrow(() => validateBookingTimeRange({ startTime: groundLocalToUtc('2026-06-05', 9, 0), endTime: groundLocalToUtc('2026-06-05', 11, 0), ground: narrowGround, now: NOW }))
})

test('validateBookingTimeRange: a booking ending exactly at local midnight the next day is treated as 24:00, not rejected as multi-day', () => {
  const wideGround = { opening_hour: 6, closing_hour: 24 }
  const startTime = groundLocalToUtc('2026-06-05', 22, 0)
  const endTime = groundLocalToUtc('2026-06-06', 0, 0) // midnight = next day's 00:00
  assert.doesNotThrow(() => validateBookingTimeRange({ startTime, endTime, ground: wideGround, now: NOW }))
})

test('validateBookingTimeRange: a range genuinely spanning into the next day (not just touching midnight) is rejected', () => {
  const wideGround = { opening_hour: 0, closing_hour: 24 }
  const startTime = groundLocalToUtc('2026-06-05', 22, 0)
  const endTime = groundLocalToUtc('2026-06-06', 2, 0)
  assert.throws(() => validateBookingTimeRange({ startTime, endTime, ground: wideGround, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
})

test('validateBookingTimeRange: garbage/non-Date inputs are rejected, never crash', () => {
  assert.throws(() => validateBookingTimeRange({ startTime: 'not-a-date', endTime: new Date(), ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
  assert.throws(() => validateBookingTimeRange({ startTime: new Date('bogus'), endTime: new Date(), ground: GROUND, now: NOW }), (e) => e instanceof BookingError && e.code === 'INVALID_SLOT')
})
