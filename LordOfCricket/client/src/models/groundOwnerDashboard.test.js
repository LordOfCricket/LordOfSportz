import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotStatusInfo, describeSlot } from './groundOwnerDashboard.model.js'

test('slotStatusInfo: 3-state logic across both known shapes', () => {
  assert.equal(slotStatusInfo({ total_slots: 0, filled_slots: 0 }).label, 'No umpire slots configured')
  assert.equal(slotStatusInfo({ total_slots: 2, filled_slots: 0 }).label, 'Needs Umpires')
  assert.equal(slotStatusInfo({ total_slots: 2, filled_slots: 1 }).label, '1 Slot Available')
  assert.equal(slotStatusInfo({ total_slots: 2, filled_slots: 2 }).label, 'Fulfilled')
  assert.equal(slotStatusInfo({ umpireSlotsTotal: 1, umpireSlotsFilled: 1 }).label, 'Fulfilled')
})

test('describeSlot: an assigned slot shows the real umpire name', () => {
  assert.deepEqual(describeSlot({ status: 'ASSIGNED', umpire_name: 'Rahul Sharma' }), { label: 'Rahul Sharma', detail: 'Assigned' })
})

test('describeSlot: an open/cancelled slot is honestly "Slot Available"', () => {
  assert.deepEqual(describeSlot({ status: 'AVAILABLE', umpire_name: null }), { label: 'Slot Available', detail: null })
  assert.deepEqual(describeSlot({ status: 'CANCELLED', umpire_name: null }), { label: 'Slot Available', detail: null })
})

test('describeSlot: a NO_SHOW slot never falls through to "Slot Available" — it needs a replacement, not a self-claim', () => {
  assert.deepEqual(describeSlot({ status: 'NO_SHOW', umpire_name: 'Rahul Sharma' }), { label: 'Rahul Sharma', detail: 'No-Show — needs replacement' })
})

test('describeSlot: a COMPLETED slot shows who officiated, not "Slot Available"', () => {
  assert.deepEqual(describeSlot({ status: 'COMPLETED', umpire_name: 'Amit Verma' }), { label: 'Amit Verma', detail: 'Officiated' })
})
