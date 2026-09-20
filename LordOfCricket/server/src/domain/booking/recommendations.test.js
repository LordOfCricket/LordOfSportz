import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findNearbyAlternatives } from './recommendations.js'
import { computeDayAvailability } from './availability.js'
import { groundLocalToUtc } from './timezone.js'

const EPOCH_NOW = groundLocalToUtc('2020-01-01', 0)

function lookupWithOccupied(occupiedByDate) {
  return (dateStr) => computeDayAvailability(dateStr, occupiedByDate[dateStr] || [], { now: EPOCH_NOW })
}

test('recommendations: requested slot occupied — nearest earlier and later same-day slots come first', () => {
  const occupied = {
    '2026-08-08': [{ startTime: groundLocalToUtc('2026-08-08', 18), endTime: groundLocalToUtc('2026-08-08', 20), reason: 'BOOKED' }],
  }
  const lookup = lookupWithOccupied(occupied)
  const results = findNearbyAlternatives('2026-08-08', 18, 0, lookup, { maxResults: 5 })

  assert.ok(results.length > 0)
  // Priority 1: nearest earlier same-day (16:00, since slots are 2h wide from 6am: 6,8,10,12,14,16,18,20).
  assert.equal(results[0].startTime.getTime(), groundLocalToUtc('2026-08-08', 16).getTime())
  // Priority 2: nearest later same-day (20:00).
  assert.equal(results[1].startTime.getTime(), groundLocalToUtc('2026-08-08', 20).getTime())
})

test('recommendations: every returned alternative is itself genuinely AVAILABLE under the same rules', () => {
  const occupied = {
    '2026-08-08': [{ startTime: groundLocalToUtc('2026-08-08', 18), endTime: groundLocalToUtc('2026-08-08', 20), reason: 'BOOKED' }],
    '2026-08-09': [{ startTime: groundLocalToUtc('2026-08-09', 18), endTime: groundLocalToUtc('2026-08-09', 20), reason: 'MATCH' }],
  }
  const lookup = lookupWithOccupied(occupied)
  const results = findNearbyAlternatives('2026-08-08', 18, 0, lookup, { maxResults: 5 })

  for (const r of results) {
    assert.equal(r.status, 'AVAILABLE')
  }
  // The next-day 18:00 slot is itself occupied (MATCH) — must never be recommended.
  assert.ok(!results.some((r) => r.startTime.getTime() === groundLocalToUtc('2026-08-09', 18).getTime()))
})

test('recommendations: bounded to maxResults, never returns dozens', () => {
  // Fully free calendar — plenty of candidates exist, result must still be capped.
  const lookup = lookupWithOccupied({})
  const results = findNearbyAlternatives('2026-08-08', 18, 0, lookup, { maxResults: 5, maxDaysAhead: 30 })
  assert.ok(results.length <= 5)
})

test('recommendations: next-day same local time is offered when the whole rest of the requested day is occupied', () => {
  const grid = computeDayAvailability('2026-08-08', [], { now: EPOCH_NOW })
  const fullyOccupied = grid.map((s) => ({ startTime: s.startTime, endTime: s.endTime, reason: 'BOOKED' }))
  const occupied = { '2026-08-08': fullyOccupied }
  const lookup = lookupWithOccupied(occupied)

  const results = findNearbyAlternatives('2026-08-08', 18, 0, lookup, { maxResults: 5, maxDaysAhead: 3 })
  assert.ok(results.length > 0)
  assert.equal(results[0].startTime.getTime(), groundLocalToUtc('2026-08-09', 18).getTime(), 'first candidate should be the next day at the same requested time')
})

test('recommendations: no available slot within the search horizon returns an empty (never fabricated) list', () => {
  // Occupy every slot for the requested day AND every day within maxDaysAhead.
  const grid = computeDayAvailability('2026-08-08', [], { now: EPOCH_NOW })
  const occupiedTemplate = grid.map((s) => ({ startTime: s.startTime, endTime: s.endTime, reason: 'BOOKED' }))
  const lookup = () => occupiedTemplate.map((o) => ({ ...o, status: 'UNAVAILABLE', reason: 'BOOKED' }))

  const results = findNearbyAlternatives('2026-08-08', 18, 0, lookup, { maxResults: 5, maxDaysAhead: 2 })
  assert.deepEqual(results, [])
})
