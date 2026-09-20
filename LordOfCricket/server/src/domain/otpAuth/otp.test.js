import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectIdentifierType,
  normalizeIdentifier,
  generateOtpCode,
  hashOtpCode,
  isOtpMatch,
  isExpired,
  maskIdentifier,
} from './otp.js'

test('detectIdentifierType recognizes a plain email', () => {
  assert.equal(detectIdentifierType('player@example.com'), 'EMAIL')
})

test('detectIdentifierType recognizes a phone number with or without a leading +', () => {
  assert.equal(detectIdentifierType('+919876543210'), 'PHONE')
  assert.equal(detectIdentifierType('919876543210'), 'PHONE')
})

test('detectIdentifierType rejects garbage input rather than guessing', () => {
  assert.equal(detectIdentifierType('not an identifier'), null)
  assert.equal(detectIdentifierType(''), null)
  assert.equal(detectIdentifierType('12'), null) // too short to be a real phone number
})

test('normalizeIdentifier lowercases email but leaves phone digits/plus only', () => {
  assert.equal(normalizeIdentifier('Player@Example.COM', 'EMAIL'), 'player@example.com')
  assert.equal(normalizeIdentifier('+91 98765 43210', 'PHONE'), '+919876543210')
})

test('generateOtpCode produces a 6-digit zero-padded string by default', () => {
  const code = generateOtpCode()
  assert.equal(code.length, 6)
  assert.match(code, /^\d{6}$/)
})

test('generateOtpCode never produces the same code from two independent draws, statistically', () => {
  // Not a proof of randomness (crypto.randomInt already guarantees CSPRNG
  // quality) — just a sanity check that this isn't accidentally returning a
  // constant.
  const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()))
  assert.ok(codes.size > 1)
})

test('hashOtpCode is deterministic and isOtpMatch confirms a correct code, rejects an incorrect one', () => {
  const code = '123456'
  const hash = hashOtpCode(code)
  assert.equal(hashOtpCode(code), hash) // same input -> same hash, every time
  assert.equal(isOtpMatch(code, hash), true)
  assert.equal(isOtpMatch('654321', hash), false)
})

test('hashOtpCode never returns the plaintext code itself', () => {
  const code = '123456'
  assert.notEqual(hashOtpCode(code), code)
})

test('isExpired: false before the expiry instant, true at or after it', () => {
  const expiresAt = new Date('2026-01-01T00:05:00.000Z')
  assert.equal(isExpired(expiresAt, new Date('2026-01-01T00:04:59.000Z')), false)
  assert.equal(isExpired(expiresAt, new Date('2026-01-01T00:05:00.000Z')), true)
  assert.equal(isExpired(expiresAt, new Date('2026-01-01T00:06:00.000Z')), true)
})

test('maskIdentifier never returns the full email/phone in the clear', () => {
  const maskedEmail = maskIdentifier('rahul@example.com', 'EMAIL')
  assert.ok(!maskedEmail.includes('rahul@example.com'))
  assert.match(maskedEmail, /^.\*\*\*@example\.com$/)

  const maskedPhone = maskIdentifier('+919876543210', 'PHONE')
  assert.ok(!maskedPhone.includes('919876543210'))
  assert.ok(maskedPhone.endsWith('3210'))
})

test('maskIdentifier handles empty/missing input without throwing', () => {
  assert.equal(maskIdentifier('', 'EMAIL'), '')
  assert.equal(maskIdentifier(undefined, 'PHONE'), '')
})
