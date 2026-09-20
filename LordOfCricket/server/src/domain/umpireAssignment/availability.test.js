import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isUmpireAvailableForMatch } from './availability.js'

test('isUmpireAvailableForMatch: no rules at all = available (default-open, matches every existing umpire today)', () => {
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-17T19:00:00.000Z') }, [], []), true) // Monday
})

test('isUmpireAvailableForMatch: weekly rule applies when no date override exists', () => {
  const weekly = [{ day_of_week: 3, is_available: false }] // Wednesday
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-19T19:00:00.000Z') }, weekly, []), false)
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-17T19:00:00.000Z') }, weekly, []), true) // Monday, no rule for it
})

test('isUmpireAvailableForMatch: a whole-day date override (no start/end time) wins over the weekly rule', () => {
  const weekly = [{ day_of_week: 6, is_available: true }] // Saturday normally available
  const overrides = [{ specific_date: '2026-08-15', is_available: false, start_time: null, end_time: null }]
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-15T13:00:00.000Z') }, weekly, overrides), false)
})

test('isUmpireAvailableForMatch: a windowed date override only applies inside its window, falls back to weekly outside it', () => {
  const weekly = [{ day_of_week: 2, is_available: true }] // Tuesday
  const overrides = [{ specific_date: '2026-08-18', start_time: '18:00', end_time: '21:00', is_available: false }]
  // 6:30pm — inside the 6-9pm unavailable window
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-18T18:30:00.000Z') }, weekly, overrides), false)
  // 10:00am — outside the window, falls back to the (available) weekly rule
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-18T10:00:00.000Z') }, weekly, overrides), true)
})

test('isUmpireAvailableForMatch: date override for a different date does not apply', () => {
  const overrides = [{ specific_date: '2026-08-18', is_available: false, start_time: null, end_time: null }]
  assert.equal(isUmpireAvailableForMatch({ start: new Date('2026-08-19T10:00:00.000Z') }, [], overrides), true)
})
