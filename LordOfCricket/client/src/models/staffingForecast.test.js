import { test } from 'node:test'
import assert from 'node:assert/strict'
import { staffingForecastLabel, staffingForecastClasses } from './staffingForecast.model.js'

test('staffingForecastLabel maps every known status, falls back to the raw value for an unknown one', () => {
  assert.equal(staffingForecastLabel('FULLY_STAFFED'), 'Fully staffed')
  assert.equal(staffingForecastLabel('NEEDS_ATTENTION'), 'Needs attention')
  assert.equal(staffingForecastLabel('OPEN'), 'Open')
  assert.equal(staffingForecastLabel('NOT_REQUIRED'), 'No umpires required')
  assert.equal(staffingForecastLabel('SOMETHING_ELSE'), 'SOMETHING_ELSE')
})

test('staffingForecastClasses returns a real class string for every known status, and a safe default otherwise', () => {
  for (const status of ['FULLY_STAFFED', 'NEEDS_ATTENTION', 'OPEN', 'NOT_REQUIRED']) {
    assert.ok(staffingForecastClasses(status).length > 0)
  }
  assert.equal(staffingForecastClasses('unknown'), staffingForecastClasses('OPEN'))
})
