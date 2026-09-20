import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidBlockType, blockTypeLabel, GROUND_BLOCK_TYPES } from './blockTypes.js'

test('isValidBlockType: accepts every documented type, rejects unknown strings', () => {
  for (const type of Object.keys(GROUND_BLOCK_TYPES)) assert.equal(isValidBlockType(type), true)
  assert.equal(isValidBlockType('NOT_A_TYPE'), false)
  assert.equal(isValidBlockType(''), false)
})

test('blockTypeLabel: returns the friendly label, falls back to the raw type for unknown values', () => {
  assert.equal(blockTypeLabel('PITCH_ROLLING'), 'Pitch Rolling')
  assert.equal(blockTypeLabel('SOMETHING_ELSE'), 'SOMETHING_ELSE')
})
