// Run with: node --test src/models/umpireGroundDiscovery.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotState } from './umpireGroundDiscovery.model.js'

test('slotState: currentUserAssigned wins even when the match is also otherwise fully staffed', () => {
  assert.equal(slotState({ currentUserAssigned: true, requiredUmpires: 2, filledSlots: 2, hasScheduleConflict: false }), 'ASSIGNED')
})

test('slotState: a schedule conflict blocks the row regardless of open capacity', () => {
  assert.equal(slotState({ currentUserAssigned: false, hasScheduleConflict: true, requiredUmpires: 2, filledSlots: 0 }), 'SCHEDULE_CONFLICT')
})

test('slotState: requiredUmpires=0 reads as NOT_REQUIRED, never FULLY_STAFFED', () => {
  assert.equal(slotState({ currentUserAssigned: false, hasScheduleConflict: false, requiredUmpires: 0, filledSlots: 0 }), 'NOT_REQUIRED')
})

test('slotState: filled >= required reads as FULLY_STAFFED', () => {
  assert.equal(slotState({ currentUserAssigned: false, hasScheduleConflict: false, requiredUmpires: 2, filledSlots: 2 }), 'FULLY_STAFFED')
})

test('slotState: otherwise OPEN', () => {
  assert.equal(slotState({ currentUserAssigned: false, hasScheduleConflict: false, requiredUmpires: 2, filledSlots: 1 }), 'OPEN')
})
