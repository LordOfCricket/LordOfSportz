import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePasswordPolicy, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './password.js'

test('validatePasswordPolicy rejects a password shorter than the minimum', () => {
  const result = validatePasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH - 1))
  assert.equal(result.valid, false)
})

test('validatePasswordPolicy accepts a password at exactly the minimum length', () => {
  const result = validatePasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH))
  assert.equal(result.valid, true)
})

test('validatePasswordPolicy accepts a password at exactly the maximum length', () => {
  const result = validatePasswordPolicy('a'.repeat(PASSWORD_MAX_LENGTH))
  assert.equal(result.valid, true)
})

test('validatePasswordPolicy rejects a password longer than the maximum', () => {
  const result = validatePasswordPolicy('a'.repeat(PASSWORD_MAX_LENGTH + 1))
  assert.equal(result.valid, false)
})

test('validatePasswordPolicy does not require any specific character class (length-only policy)', () => {
  assert.equal(validatePasswordPolicy('alllowercase').valid, true)
  assert.equal(validatePasswordPolicy('12345678').valid, true)
})

test('validatePasswordPolicy rejects non-string input rather than throwing', () => {
  assert.equal(validatePasswordPolicy(undefined).valid, false)
  assert.equal(validatePasswordPolicy(null).valid, false)
  assert.equal(validatePasswordPolicy(12345678).valid, false)
})
