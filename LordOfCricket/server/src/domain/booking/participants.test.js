import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeParticipantIds, assertPlayersExist } from './participants.js'
import { BookingError } from './errors.js'

test('normalizeParticipantIds: a clean list of positive integers passes through unchanged', () => {
  assert.deepEqual(normalizeParticipantIds([3, 1, 2]), [3, 1, 2])
})

test('normalizeParticipantIds: coerces numeric strings the same way the rest of the app does', () => {
  assert.deepEqual(normalizeParticipantIds(['3', '1']), [3, 1])
})

test('normalizeParticipantIds: rejects a non-array outright, never coerces', () => {
  assert.throws(() => normalizeParticipantIds('3,1'), BookingError)
  assert.throws(() => normalizeParticipantIds(null), BookingError)
})

test('normalizeParticipantIds: rejects zero, negative, non-integer, and non-numeric ids', () => {
  assert.throws(() => normalizeParticipantIds([0]), BookingError)
  assert.throws(() => normalizeParticipantIds([-1]), BookingError)
  assert.throws(() => normalizeParticipantIds([1.5]), BookingError)
  assert.throws(() => normalizeParticipantIds(['abc']), BookingError)
})

test('normalizeParticipantIds: an empty list is rejected by default (EMPTY_PARTICIPANTS), never silently allowed', () => {
  assert.throws(() => normalizeParticipantIds([]), (err) => err instanceof BookingError && err.code === 'EMPTY_PARTICIPANTS')
})

test('normalizeParticipantIds: allowEmpty:true permits an empty list (e.g. removing the last participant is a separate, explicit action)', () => {
  assert.deepEqual(normalizeParticipantIds([], { allowEmpty: true }), [])
})

test('normalizeParticipantIds: duplicate ids are rejected outright (§37), never silently deduplicated', () => {
  assert.throws(() => normalizeParticipantIds([1, 2, 1]), (err) => err instanceof BookingError && err.code === 'DUPLICATE_PARTICIPANT')
})

test('assertPlayersExist: passes silently when every id resolved to a real row', () => {
  assert.doesNotThrow(() => assertPlayersExist([1, 2], [{ id: 1 }, { id: 2 }]))
})

test('assertPlayersExist: throws PLAYER_NOT_FOUND naming the first id that never resolved to a real row (never trusts a plausible-looking client id)', () => {
  assert.throws(() => assertPlayersExist([1, 2, 3], [{ id: 1 }, { id: 3 }]), (err) => err instanceof BookingError && err.code === 'PLAYER_NOT_FOUND' && err.message.includes('2'))
})
