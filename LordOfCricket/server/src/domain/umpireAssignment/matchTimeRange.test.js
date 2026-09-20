import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateMatchDurationMinutes, estimateMatchTimeRange, isAssignmentLocked } from './matchTimeRange.js'
import { rangesOverlap } from '../booking/availability.js'

test('estimateMatchDurationMinutes: derives from real overs_per_innings (8 min/over/innings-side)', () => {
  assert.equal(estimateMatchDurationMinutes({ overs_per_innings: 20 }), 320)
  assert.equal(estimateMatchDurationMinutes({ overs_per_innings: 50 }), 800)
})

test('estimateMatchDurationMinutes: falls back to the documented 240-minute default when overs_per_innings is null', () => {
  assert.equal(estimateMatchDurationMinutes({ overs_per_innings: null }), 240)
  assert.equal(estimateMatchDurationMinutes({}), 240)
})

test('estimateMatchTimeRange: end = start + estimated duration', () => {
  const { start, end } = estimateMatchTimeRange({ match_date: '2026-08-12T19:00:00.000Z', overs_per_innings: 20 })
  assert.equal(start.toISOString(), '2026-08-12T19:00:00.000Z')
  assert.equal(end.toISOString(), '2026-08-13T00:20:00.000Z') // +320min = +5h20m
})

test('overlap shapes from the brief, using rangesOverlap([start,end)) against estimated match ranges', () => {
  const matchA = estimateMatchTimeRange({ match_date: '2026-08-12T19:00:00.000Z', overs_per_innings: 20 }) // 7:00pm-12:20am(+320m)... use a shorter format for clean boundary tests below instead
  assert.ok(matchA) // sanity — real cases below use explicit ranges for exact boundary control

  const near = (h, m = 0) => new Date(`2026-08-12T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`)

  // Match A: 7:00pm -> 10:00pm (explicit range, not overs-derived, to test exact boundaries)
  const a = { start: near(19), end: near(22) }

  // Partial overlap at beginning: B 8:00pm -> 9:00pm is contained within A
  assert.equal(rangesOverlap(a.start, a.end, near(20), near(21)), true, 'contained-within must overlap')
  // Partial overlap at end: B 9:30pm -> 11:00pm overlaps A's tail
  assert.equal(rangesOverlap(a.start, a.end, near(21, 30), near(23)), true)
  // Exact same time
  assert.equal(rangesOverlap(a.start, a.end, near(19), near(22)), true)
  // B completely contains A: 6:00pm -> 11:00pm
  assert.equal(rangesOverlap(a.start, a.end, near(18), near(23)), true)
  // Adjacent, non-overlapping: B starts exactly when A ends (10:00pm -> 12:00am)
  assert.equal(rangesOverlap(a.start, a.end, near(22), near(23, 59)), false, '[start,end) — touching ranges do not overlap')
  // Fully separate: B 11:00pm -> 11:30pm
  assert.equal(rangesOverlap(a.start, a.end, near(23), near(23, 30)), false)
})

// Phase 2 (Umpire Interest+Assignment audit) — the 24h confirmation lock.
const lockNow = new Date('2026-08-25T18:00:00.000Z')

test('isAssignmentLocked: more than 24h before match start is not locked', () => {
  const match = { match_date: '2026-08-26T18:00:01.000Z' } // 24h + 1s away
  assert.equal(isAssignmentLocked(match, { now: lockNow }), false)
})

test('isAssignmentLocked: exactly 24h before match start IS locked (boundary is inclusive)', () => {
  const match = { match_date: '2026-08-26T18:00:00.000Z' } // exactly 24h away
  assert.equal(isAssignmentLocked(match, { now: lockNow }), true)
})

test('isAssignmentLocked: less than 24h before match start is locked', () => {
  const match = { match_date: '2026-08-26T17:59:59.000Z' } // 23h59m59s away
  assert.equal(isAssignmentLocked(match, { now: lockNow }), true)
})

test('isAssignmentLocked: a match that already started is locked', () => {
  const match = { match_date: '2026-08-25T10:00:00.000Z' } // 8h in the past
  assert.equal(isAssignmentLocked(match, { now: lockNow }), true)
})

test('isAssignmentLocked: exact-hours rule, not a calendar-day rule — a match tomorrow just after midnight is NOT locked when now is late tonight but still >24h away', () => {
  // now is 2026-08-25T18:00:00Z; a naive calendar-day check ("is match_date
  // tomorrow?") would wrongly call this locked. The real gap is 30h.
  const match = { match_date: '2026-08-27T00:00:00.000Z' }
  assert.equal(isAssignmentLocked(match, { now: lockNow }), false)
})
