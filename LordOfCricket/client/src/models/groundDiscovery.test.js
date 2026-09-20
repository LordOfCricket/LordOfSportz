// Run with: node --test src/models/groundDiscovery.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasValue,
  formatGroundAddress,
  isValidLatitude,
  isValidLongitude,
  formatDistance,
  RADIUS_OPTIONS_KM,
  MIN_RADIUS_KM,
  MAX_RADIUS_KM,
} from './groundDiscovery.model.js'

test('hasValue rejects null/undefined/empty/whitespace-only, accepts real content', () => {
  assert.equal(hasValue(null), false)
  assert.equal(hasValue(undefined), false)
  assert.equal(hasValue(''), false)
  assert.equal(hasValue('   '), false)
  assert.equal(hasValue('Delhi'), true)
  assert.equal(hasValue(0), true, '0 is a real value, not "missing"')
})

test('formatGroundAddress joins only present parts, in order, with no dangling separators', () => {
  assert.equal(
    formatGroundAddress({ addressLine: '221B Baker St', city: 'Delhi', state: 'Delhi', postalCode: '110001', country: 'India' }),
    '221B Baker St, Delhi, Delhi, 110001, India',
  )
  assert.equal(formatGroundAddress({ addressLine: null, city: 'Delhi', state: null, postalCode: null, country: 'India' }), 'Delhi, India')
  assert.equal(formatGroundAddress(null), '')
  assert.equal(formatGroundAddress({}), '')
})

test('isValidLatitude accepts the full range and rejects out-of-range/non-numeric/blank input', () => {
  assert.equal(isValidLatitude(0), true)
  assert.equal(isValidLatitude(90), true)
  assert.equal(isValidLatitude(-90), true)
  assert.equal(isValidLatitude(90.1), false)
  assert.equal(isValidLatitude(-90.1), false)
  assert.equal(isValidLatitude('abc'), false)
  assert.equal(isValidLatitude(''), false, 'blank must not silently coerce to 0/equator')
  assert.equal(isValidLatitude(Infinity), false)
  assert.equal(isValidLatitude(NaN), false)
})

test('isValidLongitude accepts the full range and rejects out-of-range/non-numeric/blank input', () => {
  assert.equal(isValidLongitude(0), true)
  assert.equal(isValidLongitude(180), true)
  assert.equal(isValidLongitude(-180), true)
  assert.equal(isValidLongitude(180.1), false)
  assert.equal(isValidLongitude('nope'), false)
  assert.equal(isValidLongitude(''), false)
})

test('formatDistance switches units at sensible thresholds', () => {
  assert.equal(formatDistance(0.42), '420 m away')
  assert.equal(formatDistance(2.37), '2.4 km away')
  assert.equal(formatDistance(9.96), '10.0 km away')
  assert.equal(formatDistance(42.6), '43 km away')
  assert.equal(formatDistance(null), null)
  assert.equal(formatDistance(undefined), null)
  assert.equal(formatDistance(NaN), null)
})

test('RADIUS_OPTIONS_KM matches the brief\'s 5/10/15/25 km presets', () => {
  assert.deepEqual(RADIUS_OPTIONS_KM, [5, 10, 15, 25])
})

test('MIN_RADIUS_KM/MAX_RADIUS_KM mirror the backend\'s own radius bounds so the km slider can never request a rejected value', () => {
  assert.equal(MIN_RADIUS_KM, 1)
  assert.equal(MAX_RADIUS_KM, 100)
})
