import { test } from 'node:test'
import assert from 'node:assert/strict'
import { senderLabel } from './matchChat.model.js'

test('senderLabel maps GROUND_OWNER/UMPIRE to their display labels', () => {
  assert.equal(senderLabel('GROUND_OWNER'), 'Ground Owner')
  assert.equal(senderLabel('UMPIRE'), 'Umpire')
})

test('senderLabel falls back to "Umpire" for an unrecognized role rather than throwing', () => {
  assert.equal(senderLabel('SOMETHING_ELSE'), 'Umpire')
  assert.equal(senderLabel(undefined), 'Umpire')
})
