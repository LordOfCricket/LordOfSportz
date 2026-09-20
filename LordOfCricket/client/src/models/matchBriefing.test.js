import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checklistLabel, incidentTypeLabel, checklistProgress, INCIDENT_TYPES } from './matchBriefing.model.js'

test('checklistLabel maps every known key to a human label, falls back to the raw key for an unknown one', () => {
  assert.equal(checklistLabel('PITCH_INSPECTED'), 'Pitch inspected')
  assert.equal(checklistLabel('READY_TO_START'), 'Ready to Start')
  assert.equal(checklistLabel('SOMETHING_NEW'), 'SOMETHING_NEW')
})

test('incidentTypeLabel maps every known type, falls back to the raw value for an unknown one', () => {
  assert.equal(incidentTypeLabel('BAD_LIGHT'), 'Bad Light')
  assert.equal(incidentTypeLabel('MATCH_ABANDONED'), 'Match Abandoned')
  assert.equal(incidentTypeLabel('UNKNOWN'), 'UNKNOWN')
})

test('INCIDENT_TYPES has exactly the 9 fixed types from the brief', () => {
  assert.equal(INCIDENT_TYPES.length, 9)
  assert.ok(INCIDENT_TYPES.includes('RAIN'))
  assert.ok(INCIDENT_TYPES.includes('OTHER'))
})

test('checklistProgress: empty/missing input never throws, allDone requires at least one item', () => {
  assert.deepEqual(checklistProgress([]), { total: 0, done: 0, allDone: false })
  assert.deepEqual(checklistProgress(undefined), { total: 0, done: 0, allDone: false })
})

test('checklistProgress: counts done items, allDone only when every item is checked', () => {
  const items = [{ isChecked: true }, { isChecked: false }, { isChecked: true }]
  assert.deepEqual(checklistProgress(items), { total: 3, done: 2, allDone: false })
  assert.equal(checklistProgress([{ isChecked: true }, { isChecked: true }]).allDone, true)
})
