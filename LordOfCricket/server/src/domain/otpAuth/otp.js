// Phase 3 — pure OTP domain logic. No pg/Prisma/provider imports, no I/O —
// independently unit-testable, same convention as every other domain/*
// module (see domain/scoring, domain/booking).

import { randomInt, createHash } from 'node:crypto'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// E.164-ish: optional leading +, 8-15 digits total. Deliberately permissive
// (real validation/normalization happens provider-side at send time) — this
// is just enough to route to the right provider and reject obvious garbage.
const PHONE_RE = /^\+?[0-9]{8,15}$/

export function detectIdentifierType(rawIdentifier) {
  const value = (rawIdentifier || '').trim()
  if (EMAIL_RE.test(value)) return 'EMAIL'
  if (PHONE_RE.test(value)) return 'PHONE'
  return null
}

// Normalized form is what's stored/looked-up by — lowercase for email
// (Postgres UNIQUE is case-sensitive by default, and "Foo@x.com"/"foo@x.com"
// must be the same account), digits-and-leading-plus-only for phone (strips
// spaces/dashes a user might type).
export function normalizeIdentifier(rawIdentifier, identifierType) {
  const value = (rawIdentifier || '').trim()
  if (identifierType === 'EMAIL') return value.toLowerCase()
  if (identifierType === 'PHONE') return value.replace(/[^\d+]/g, '')
  return value
}

const DEFAULT_OTP_LENGTH = 6
const DEFAULT_OTP_TTL_MINUTES = 5
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_RESEND_COOLDOWN_SECONDS = 30
const DEFAULT_SESSION_TTL_DAYS = 30

export function getOtpLength() {
  return Number(process.env.OTP_LENGTH) || DEFAULT_OTP_LENGTH
}
export function getOtpTtlMinutes() {
  return Number(process.env.OTP_TTL_MINUTES) || DEFAULT_OTP_TTL_MINUTES
}
export function getOtpMaxAttempts() {
  return Number(process.env.OTP_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS
}
export function getResendCooldownSeconds() {
  return Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || DEFAULT_RESEND_COOLDOWN_SECONDS
}
export function getSessionTtlDays() {
  return Number(process.env.SESSION_TTL_DAYS) || DEFAULT_SESSION_TTL_DAYS
}

// crypto.randomInt is a CSPRNG (unlike Math.random) — the brief's "OTP
// enumeration" concern is about brute-forcing a live code via the verify
// endpoint (mitigated by attempts/expiry below), not about the generator
// itself being predictable.
export function generateOtpCode(length = getOtpLength()) {
  const max = 10 ** length
  const code = randomInt(0, max)
  return String(code).padStart(length, '0')
}

// SHA-256, not bcrypt: a 6-digit OTP has only 10^6 possibilities and lives
// for a few minutes — the real defenses are expiry + max-attempts (below),
// not hash cost. A slow hash here would only slow down the server's own
// verification, not a determined attacker who is already rate-limited by
// attempts. (Contrast with password_hash, which uses bcrypt because
// passwords are long-lived and higher-entropy.)
export function hashOtpCode(code) {
  return createHash('sha256').update(code).digest('hex')
}

export function isOtpMatch(code, otpHash) {
  return hashOtpCode(code) === otpHash
}

export function isExpired(expiresAt, now = new Date()) {
  return now.getTime() >= new Date(expiresAt).getTime()
}

// For structured logging only — never log the raw identifier in full
// (§18's "prevent OTP enumeration"/PII-minimization spirit), and never the
// code itself.
export function maskIdentifier(identifier, identifierType) {
  if (!identifier) return ''
  if (identifierType === 'EMAIL') {
    const [local, domain] = identifier.split('@')
    if (!domain) return '***'
    return `${local.slice(0, 1)}***@${domain}`
  }
  return identifier.length <= 4 ? '***' : `${identifier.slice(0, -4).replace(/./g, '*')}${identifier.slice(-4)}`
}

export const OTP_DEFAULTS = Object.freeze({
  DEFAULT_OTP_LENGTH,
  DEFAULT_OTP_TTL_MINUTES,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  DEFAULT_SESSION_TTL_DAYS,
})
