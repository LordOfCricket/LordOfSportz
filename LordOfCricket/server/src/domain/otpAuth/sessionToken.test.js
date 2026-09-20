import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSessionToken, hashSessionToken } from './sessionToken.js'

test('generateSessionToken produces a 64-char hex string (256 bits)', () => {
  const token = generateSessionToken()
  assert.equal(token.length, 64)
  assert.match(token, /^[0-9a-f]{64}$/)
})

test('generateSessionToken never produces the same token twice', () => {
  const tokens = new Set(Array.from({ length: 20 }, () => generateSessionToken()))
  assert.equal(tokens.size, 20)
})

test('hashSessionToken is deterministic and never returns the raw token', () => {
  const token = generateSessionToken()
  const hash = hashSessionToken(token)
  assert.equal(hashSessionToken(token), hash)
  assert.notEqual(hash, token)
})

test('hashSessionToken produces different hashes for different tokens', () => {
  const hashA = hashSessionToken(generateSessionToken())
  const hashB = hashSessionToken(generateSessionToken())
  assert.notEqual(hashA, hashB)
})
