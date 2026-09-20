// Run with: node --test src/models/backNavigation.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMeaningfulHistory } from './backNavigation.model.js'

test('hasMeaningfulHistory: no history.state at all (fresh load) is false', () => {
  assert.equal(hasMeaningfulHistory(null), false)
  assert.equal(hasMeaningfulHistory(undefined), false)
})

test('hasMeaningfulHistory: idx 0 (the very first entry in this SPA session) is false', () => {
  assert.equal(hasMeaningfulHistory({ idx: 0 }), false)
})

test('hasMeaningfulHistory: idx 1 or higher (at least one in-app navigation happened) is true', () => {
  assert.equal(hasMeaningfulHistory({ idx: 1 }), true)
  assert.equal(hasMeaningfulHistory({ idx: 5 }), true)
})

test('hasMeaningfulHistory: malformed/missing idx never throws, reads as false', () => {
  assert.equal(hasMeaningfulHistory({}), false)
  assert.equal(hasMeaningfulHistory({ idx: 'not-a-number' }), false)
  assert.equal(hasMeaningfulHistory({ idx: null }), false)
})
