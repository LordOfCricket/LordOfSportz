import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStaffingForecast, STAFFING_STATUS } from './staffingForecast.js'

test('requiredUmpires=0 reads as NOT_REQUIRED, never FULLY_STAFFED/OPEN', () => {
  const result = computeStaffingForecast({ filledSlots: 0, totalSlots: 0, hoursUntilMatch: 10 })
  assert.equal(result.status, STAFFING_STATUS.NOT_REQUIRED)
})

test('filled >= total is FULLY_STAFFED regardless of how soon the match is', () => {
  assert.equal(computeStaffingForecast({ filledSlots: 2, totalSlots: 2, hoursUntilMatch: 0.5 }).status, STAFFING_STATUS.FULLY_STAFFED)
  assert.equal(computeStaffingForecast({ filledSlots: 3, totalSlots: 2, hoursUntilMatch: 10 }).status, STAFFING_STATUS.FULLY_STAFFED)
})

test('understaffed with plenty of time left is OPEN, not an alarm', () => {
  const result = computeStaffingForecast({ filledSlots: 1, totalSlots: 2, hoursUntilMatch: 20 })
  assert.equal(result.status, STAFFING_STATUS.OPEN)
})

test('understaffed with the match imminent is NEEDS_ATTENTION', () => {
  const result = computeStaffingForecast({ filledSlots: 1, totalSlots: 2, hoursUntilMatch: 2 })
  assert.equal(result.status, STAFFING_STATUS.NEEDS_ATTENTION)
})

test('a match already past its start time (negative hoursUntilMatch) and still understaffed is NEEDS_ATTENTION, never a crash', () => {
  const result = computeStaffingForecast({ filledSlots: 0, totalSlots: 2, hoursUntilMatch: -1 })
  assert.equal(result.status, STAFFING_STATUS.NEEDS_ATTENTION)
})

test('exactly at the attention threshold counts as NEEDS_ATTENTION (inclusive boundary)', () => {
  const result = computeStaffingForecast({ filledSlots: 0, totalSlots: 1, hoursUntilMatch: 4 })
  assert.equal(result.status, STAFFING_STATUS.NEEDS_ATTENTION)
})
