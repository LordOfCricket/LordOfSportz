import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { encryptSecret, decryptSecret } from './totpCrypto.js'

const testKey = randomBytes(32)

test('encryptSecret/decryptSecret: round-trips the plaintext exactly', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const encrypted = encryptSecret(secret, testKey)
  assert.equal(decryptSecret(encrypted, testKey), secret)
})

test('encryptSecret: never stores the plaintext secret in the output', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const encrypted = encryptSecret(secret, testKey)
  assert.equal(encrypted.includes(secret), false)
})

test('encryptSecret: two encryptions of the same plaintext produce different ciphertext (random IV)', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  assert.notEqual(encryptSecret(secret, testKey), encryptSecret(secret, testKey))
})

test('decryptSecret: a tampered ciphertext byte fails GCM authentication instead of decrypting to garbage', () => {
  const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', testKey)
  const [iv, authTag, ciphertext] = encrypted.split(':')
  const flipped = (ciphertext[0] === 'a' ? 'b' : 'a') + ciphertext.slice(1)
  assert.throws(() => decryptSecret(`${iv}:${authTag}:${flipped}`, testKey))
})

test('decryptSecret: a tampered auth tag fails authentication', () => {
  const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', testKey)
  const [iv, authTag, ciphertext] = encrypted.split(':')
  const flipped = (authTag[0] === 'a' ? 'b' : 'a') + authTag.slice(1)
  assert.throws(() => decryptSecret(`${iv}:${flipped}:${ciphertext}`, testKey))
})

test('decryptSecret: the wrong key fails authentication rather than decrypting silently', () => {
  const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', testKey)
  assert.throws(() => decryptSecret(encrypted, randomBytes(32)))
})
