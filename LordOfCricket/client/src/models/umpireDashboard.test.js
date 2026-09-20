// Run with: node --test src/models/umpireDashboard.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  slotSummary,
  bucketAssignments,
  nextAssignment,
  canCancelAssignment,
  canEnterScoring,
  applyErrorMessage,
  cancelErrorMessage,
  isAssignmentLocked,
} from './umpireDashboard.model.js'

test('slotSummary derives open capacity from total/filled, never negative', () => {
  assert.deepEqual(slotSummary({ total_slots: 2, filled_slots: 0 }), { total: 2, filled: 0, open: 2 })
  assert.deepEqual(slotSummary({ total_slots: 2, filled_slots: 2 }), { total: 2, filled: 2, open: 0 })
  assert.deepEqual(slotSummary({ total_slots: 1, filled_slots: 2 }), { total: 1, filled: 2, open: 0 }, 'never a negative open count')
  assert.deepEqual(slotSummary({}), { total: 0, filled: 0, open: 0 })
  assert.deepEqual(slotSummary(null), { total: 0, filled: 0, open: 0 })
})

test('bucketAssignments sorts ASSIGNED slots by match status', () => {
  const assignments = [
    { status: 'ASSIGNED', match_status: 'upcoming', match_id: 1 },
    { status: 'ASSIGNED', match_status: 'live', match_id: 2 },
    { status: 'ASSIGNED', match_status: 'completed', match_id: 3 },
    { status: 'ASSIGNED', match_status: 'finalized', match_id: 4 },
  ]
  const { upcoming, live, completed } = bucketAssignments(assignments)
  assert.deepEqual(upcoming.map((a) => a.match_id), [1])
  assert.deepEqual(live.map((a) => a.match_id), [2])
  assert.deepEqual(completed.map((a) => a.match_id), [3, 4])
})

test('bucketAssignments: a COMPLETED slot always lands in completed, regardless of match_status (officiating credit)', () => {
  const assignments = [{ status: 'COMPLETED', match_status: 'completed', match_id: 10 }]
  assert.deepEqual(bucketAssignments(assignments).completed.map((a) => a.match_id), [10])
})

test('bucketAssignments: CANCELLED and NO_SHOW get their own buckets, not silently dropped', () => {
  const assignments = [
    { status: 'CANCELLED', match_status: 'upcoming', match_id: 5 },
    { status: 'NO_SHOW', match_status: 'live', match_id: 6 },
  ]
  const buckets = bucketAssignments(assignments)
  assert.deepEqual(buckets.cancelled.map((a) => a.match_id), [5])
  assert.deepEqual(buckets.noShow.map((a) => a.match_id), [6])
  assert.deepEqual(buckets.upcoming, [])
  assert.deepEqual(buckets.live, [])
  assert.deepEqual(buckets.completed, [])
})

test('bucketAssignments handles empty/missing input without throwing', () => {
  const empty = { upcoming: [], live: [], completed: [], cancelled: [], noShow: [] }
  assert.deepEqual(bucketAssignments([]), empty)
  assert.deepEqual(bucketAssignments(undefined), empty)
})

test('nextAssignment: picks the soonest upcoming match, not just index 0 (the list isn\'t guaranteed date-sorted)', () => {
  const later = { match_id: 1, match_date: '2026-09-01T10:00:00.000Z' }
  const sooner = { match_id: 2, match_date: '2026-08-15T10:00:00.000Z' }
  assert.equal(nextAssignment([later, sooner]), sooner)
  assert.equal(nextAssignment([sooner, later]), sooner)
})

test('nextAssignment: empty/missing input returns null, never throws', () => {
  assert.equal(nextAssignment([]), null)
  assert.equal(nextAssignment(undefined), null)
})

test('canCancelAssignment: only an ASSIGNED slot on an upcoming match', () => {
  assert.equal(canCancelAssignment({ status: 'ASSIGNED', match_status: 'upcoming' }), true)
  assert.equal(canCancelAssignment({ status: 'ASSIGNED', match_status: 'live' }), false, 'U3.1: self-cancel is upcoming-only')
  assert.equal(canCancelAssignment({ status: 'ASSIGNED', match_status: 'completed' }), false)
  assert.equal(canCancelAssignment({ status: 'CANCELLED', match_status: 'upcoming' }), false)
  assert.equal(canCancelAssignment(null), false)
})

test('canEnterScoring: only an ASSIGNED slot on a live match', () => {
  assert.equal(canEnterScoring({ status: 'ASSIGNED', match_status: 'live' }), true)
  assert.equal(canEnterScoring({ status: 'ASSIGNED', match_status: 'upcoming' }), false)
  assert.equal(canEnterScoring({ status: 'ASSIGNED', match_status: 'completed' }), false)
  assert.equal(canEnterScoring({ status: 'CANCELLED', match_status: 'live' }), false)
})

test('applyErrorMessage translates every backend code, falls back gracefully for an unknown one', () => {
  assert.equal(applyErrorMessage('NO_SLOT_AVAILABLE'), 'This umpire slot was just filled by another umpire.')
  assert.equal(applyErrorMessage('ALREADY_ASSIGNED'), "You're already assigned to umpire this match.")
  assert.equal(applyErrorMessage('MATCH_NOT_ELIGIBLE'), 'This match is no longer accepting umpire applications.')
  assert.equal(applyErrorMessage('NOT_APPROVED_UMPIRE'), 'Your umpire approval is no longer active.')
  assert.equal(applyErrorMessage('MATCH_NOT_FOUND'), 'This match no longer exists.')
  assert.equal(applyErrorMessage('SOMETHING_NEW', 'server said x'), 'server said x')
  assert.equal(applyErrorMessage('SOMETHING_NEW'), 'Unable to apply for this match.')
})

test('cancelErrorMessage translates every backend code, falls back gracefully for an unknown one', () => {
  assert.equal(cancelErrorMessage('MATCH_NOT_ELIGIBLE'), 'This match is no longer eligible for cancellation.')
  assert.equal(cancelErrorMessage('ASSIGNMENT_NOT_FOUND'), "You don't have an active assignment for this match.")
  assert.equal(cancelErrorMessage('MATCH_NOT_FOUND'), 'This match no longer exists.')
  assert.equal(cancelErrorMessage('SOMETHING_NEW', 'server said x'), 'server said x')
  assert.equal(cancelErrorMessage('SOMETHING_NEW'), 'Unable to cancel this assignment.')
})

// Phase 2 (Umpire Interest+Assignment audit) — the 24h assignment lock.
test('cancelErrorMessage: ASSIGNMENT_LOCKED translates to a real, actionable message', () => {
  assert.equal(
    cancelErrorMessage('ASSIGNMENT_LOCKED'),
    'Assignment changes are locked within 24 hours of the match start. Contact the ground owner if you can no longer officiate.',
  )
})

test('isAssignmentLocked: mirrors the backend — exact 24h boundary, not a calendar-day rule', () => {
  const now = new Date('2026-08-25T18:00:00.000Z')
  assert.equal(isAssignmentLocked('2026-08-26T18:00:01.000Z', now), false) // 24h + 1s away
  assert.equal(isAssignmentLocked('2026-08-26T18:00:00.000Z', now), true) // exactly 24h away
  assert.equal(isAssignmentLocked('2026-08-25T10:00:00.000Z', now), true) // already started
  assert.equal(isAssignmentLocked(null, now), false, 'no match_date at all is never treated as locked')
})

test('canCancelAssignment: an ASSIGNED, upcoming, but within-24h assignment cannot be self-cancelled', () => {
  const assignment = { status: 'ASSIGNED', match_status: 'upcoming', match_date: new Date(Date.now() + 6 * 3600000).toISOString() }
  assert.equal(canCancelAssignment(assignment), false)
})

test('canCancelAssignment: an ASSIGNED, upcoming assignment safely outside the 24h window can be self-cancelled', () => {
  const assignment = { status: 'ASSIGNED', match_status: 'upcoming', match_date: new Date(Date.now() + 7 * 86400000).toISOString() }
  assert.equal(canCancelAssignment(assignment), true)
})
