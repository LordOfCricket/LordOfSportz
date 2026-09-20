// Run with: node --test src/models/umpireStatistics.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesThisMonth, groundsOfficiatedAt, matchesInLastNMonths } from './umpireStatistics.model.js'

const NOW = new Date('2026-08-12T00:00:00Z')

test('matchesThisMonth counts ASSIGNED and COMPLETED slots whose match falls in the given month', () => {
  const assignments = [
    { status: 'ASSIGNED', match_date: '2026-08-05T18:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-08-30T10:00:00Z' },
    { status: 'CANCELLED', match_date: '2026-08-10T10:00:00Z' },
    { status: 'NO_SHOW', match_date: '2026-08-11T10:00:00Z' },
    { status: 'ASSIGNED', match_date: '2026-07-31T10:00:00Z' },
  ]
  assert.equal(matchesThisMonth(assignments, NOW), 2)
})

test('matchesThisMonth: a match that completed earlier this month still counts (COMPLETED, not stuck at ASSIGNED)', () => {
  const assignments = [{ status: 'COMPLETED', match_date: '2026-08-01T10:00:00Z' }]
  assert.equal(matchesThisMonth(assignments, NOW), 1)
})

test('matchesThisMonth handles empty/missing input', () => {
  assert.equal(matchesThisMonth([], NOW), 0)
  assert.equal(matchesThisMonth(undefined, NOW), 0)
})

test('groundsOfficiatedAt counts distinct grounds from COMPLETED slots only', () => {
  const assignments = [
    { status: 'COMPLETED', ground_name: 'ABC Ground' },
    { status: 'COMPLETED', ground_name: 'ABC Ground' },
    { status: 'COMPLETED', ground_name: 'XYZ Ground' },
    { status: 'ASSIGNED', ground_name: 'Upcoming Ground' },
    { status: 'CANCELLED', ground_name: 'Cancelled Ground' },
    { status: 'NO_SHOW', ground_name: 'No Show Ground' },
    { status: 'COMPLETED', ground_name: null },
  ]
  assert.equal(groundsOfficiatedAt(assignments), 2, 'ABC Ground counted once despite two matches, XYZ once; upcoming/cancelled/no-show/null excluded')
})

test('groundsOfficiatedAt handles empty/missing input', () => {
  assert.equal(groundsOfficiatedAt([]), 0)
  assert.equal(groundsOfficiatedAt(undefined), 0)
})

// Fixture timestamps sit mid-month (noon UTC, days away from any month
// boundary) so this test is stable regardless of the host machine's local
// timezone offset used internally by matchesInLastNMonths's calendar-month
// arithmetic.
test('matchesInLastNMonths(1) counts only the full previous calendar month, excluding the current month', () => {
  const assignments = [
    { status: 'COMPLETED', match_date: '2026-07-15T12:00:00Z' },
    { status: 'ASSIGNED', match_date: '2026-07-10T12:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-08-05T12:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-06-20T12:00:00Z' },
  ]
  assert.equal(matchesInLastNMonths(assignments, 1, NOW), 2)
})

test('matchesInLastNMonths(3) covers the three full calendar months before the current one', () => {
  const assignments = [
    { status: 'COMPLETED', match_date: '2026-05-15T12:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-06-15T12:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-07-15T12:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-08-05T12:00:00Z' },
    { status: 'COMPLETED', match_date: '2026-04-20T12:00:00Z' },
  ]
  assert.equal(matchesInLastNMonths(assignments, 3, NOW), 3)
})

test('matchesInLastNMonths excludes CANCELLED/NO_SHOW and handles empty/missing input', () => {
  const assignments = [
    { status: 'CANCELLED', match_date: '2026-07-15T10:00:00Z' },
    { status: 'NO_SHOW', match_date: '2026-07-15T10:00:00Z' },
  ]
  assert.equal(matchesInLastNMonths(assignments, 1, NOW), 0)
  assert.equal(matchesInLastNMonths([], 1, NOW), 0)
  assert.equal(matchesInLastNMonths(undefined, 1, NOW), 0)
})
