import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyTimeline } from './timeline.js'

function d(hour) {
  return new Date(`2026-06-01T${String(hour).padStart(2, '0')}:00:00Z`)
}

test('buildDailyTimeline: empty entries -> one FREE segment spanning the whole day', () => {
  const segments = buildDailyTimeline([], d(6), d(22))
  assert.deepEqual(segments, [{ startTime: d(6), endTime: d(22), type: 'FREE', label: 'Free' }])
})

test('buildDailyTimeline: entries are sorted, gaps become FREE segments (Part 8\'s example shape)', () => {
  const entries = [
    { startTime: d(10), endTime: d(12), type: 'MATCH', label: 'Match' },
    { startTime: d(14), endTime: d(16), type: 'BOOKING', label: 'Booking' },
  ]
  const segments = buildDailyTimeline(entries, d(8), d(18))
  assert.deepEqual(segments, [
    { startTime: d(8), endTime: d(10), type: 'FREE', label: 'Free' },
    { startTime: d(10), endTime: d(12), type: 'MATCH', label: 'Match' },
    { startTime: d(12), endTime: d(14), type: 'FREE', label: 'Free' },
    { startTime: d(14), endTime: d(16), type: 'BOOKING', label: 'Booking' },
    { startTime: d(16), endTime: d(18), type: 'FREE', label: 'Free' },
  ])
})

test('buildDailyTimeline: back-to-back entries produce no spurious zero-length FREE segment', () => {
  const entries = [
    { startTime: d(8), endTime: d(10), type: 'BOOKING', label: 'A' },
    { startTime: d(10), endTime: d(12), type: 'BOOKING', label: 'B' },
  ]
  const segments = buildDailyTimeline(entries, d(8), d(12))
  assert.equal(segments.length, 2)
  assert.ok(segments.every((s) => s.type === 'BOOKING'))
})

test('buildDailyTimeline: a whole-day MATCH entry leaves no FREE segments', () => {
  const entries = [{ startTime: d(6), endTime: d(22), type: 'MATCH', label: 'Match' }]
  const segments = buildDailyTimeline(entries, d(6), d(22))
  assert.deepEqual(segments, [{ startTime: d(6), endTime: d(22), type: 'MATCH', label: 'Match' }])
})
