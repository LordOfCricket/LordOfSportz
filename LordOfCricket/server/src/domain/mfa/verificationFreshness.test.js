import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMfaVerificationFresh } from './verificationFreshness.js'

const TTL_MS = 15 * 60 * 1000 // 15 minutes, the default MFA_VERIFIED_TTL_MINUTES

test('isMfaVerificationFresh: null/undefined mfa_verified_at is never fresh (never verified)', () => {
  assert.equal(isMfaVerificationFresh(null, TTL_MS), false)
  assert.equal(isMfaVerificationFresh(undefined, TTL_MS), false)
})

test('isMfaVerificationFresh: one second before the TTL boundary is still fresh', () => {
  const verifiedAt = new Date('2026-01-01T00:00:00.000Z')
  const now = verifiedAt.getTime() + TTL_MS - 1000
  assert.equal(isMfaVerificationFresh(verifiedAt, TTL_MS, now), true)
})

test('isMfaVerificationFresh: exactly at the TTL boundary is expired (half-open interval, < not <=)', () => {
  const verifiedAt = new Date('2026-01-01T00:00:00.000Z')
  const now = verifiedAt.getTime() + TTL_MS
  assert.equal(isMfaVerificationFresh(verifiedAt, TTL_MS, now), false)
})

test('isMfaVerificationFresh: one second after the TTL boundary is expired', () => {
  const verifiedAt = new Date('2026-01-01T00:00:00.000Z')
  const now = verifiedAt.getTime() + TTL_MS + 1000
  assert.equal(isMfaVerificationFresh(verifiedAt, TTL_MS, now), false)
})

test('isMfaVerificationFresh: accepts a raw timestamp string (as read back from Postgres via pg/Prisma)', () => {
  const verifiedAtIso = '2026-01-01T00:00:00.000Z'
  const now = new Date(verifiedAtIso).getTime() + 1000
  assert.equal(isMfaVerificationFresh(verifiedAtIso, TTL_MS, now), true)
})
