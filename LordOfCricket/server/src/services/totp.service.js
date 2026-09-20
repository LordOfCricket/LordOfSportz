import { randomInt, createHash } from 'node:crypto'
import { generateSecret, generate, verify, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { getRpName } from '../config/webauthn.js'
import { findByUserId, findActiveByUserId, upsertPendingSecret, markVerified, updateLastVerifiedStep, disable } from '../models/totpCredential.model.js'
import { replaceCodesForUser, consumeMatchingCode } from '../models/mfaRecoveryCode.model.js'
import { MfaError, MFA_ERROR_CODES as CODES } from '../domain/mfa/errors.js'
import { encryptSecret as encryptWithKey, decryptSecret as decryptWithKey } from '../domain/mfa/totpCrypto.js'
import { isReplayedStep } from '../domain/mfa/replayGuard.js'

// Phase 6 — TOTP fallback + recovery codes. AES-256-GCM via node:crypto
// (already used in domain/otpAuth/otp.js — no new crypto dependency) keyed
// by MFA_ENCRYPTION_KEY, never Base64-only "encryption". otplib owns every
// TOTP cryptographic operation (generation, constant-time verification) —
// nothing here re-implements it.

const TOTP_PERIOD_SECONDS = 30
const RECOVERY_CODE_COUNT = 10

function getEncryptionKey() {
  return Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64')
}

// Actual AES-256-GCM implementation lives in domain/mfa/totpCrypto.js
// (pure, key-as-parameter) so it's independently unit-testable; these
// wrappers are the only place that reads MFA_ENCRYPTION_KEY from env.
export function encryptSecret(plaintext) {
  return encryptWithKey(plaintext, getEncryptionKey())
}

export function decryptSecret(encrypted) {
  return decryptWithKey(encrypted, getEncryptionKey())
}

function currentTimeStep() {
  return Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS)
}

// Starts (or restarts) enrollment — not yet an active factor until
// verifyAndActivateTotp confirms the user actually has it enrolled in a
// real authenticator app. Returns the QR code as a data URI, shown to the
// caller exactly once; the secret itself is never returned in plaintext.
export async function enrollTotp(user) {
  const secret = generateSecret()
  await upsertPendingSecret(user.id, encryptSecret(secret))

  const identifier = user.email || user.phone || `user-${user.id}`
  const uri = generateURI({ issuer: getRpName(), label: identifier, secret })
  const qrDataUrl = await QRCode.toDataURL(uri)

  return { qrDataUrl }
}

export async function verifyAndActivateTotp(user, code) {
  const pending = await findByUserId(user.id)
  if (!pending) {
    throw new MfaError(CODES.TOTP_NOT_ENROLLED, 'Start TOTP enrollment first.')
  }

  const secret = decryptSecret(pending.encrypted_secret)
  const result = await verify({ secret, token: code })
  if (!result.valid) {
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Incorrect code. Please try again.')
  }

  await markVerified(user.id)
  await updateLastVerifiedStep(user.id, currentTimeStep() + (result.delta || 0))
}

// Ongoing verification (MFA baseline / step-up) — requires an already-
// ACTIVE (verified, non-disabled) enrollment, unlike verifyAndActivateTotp
// above which operates on a still-pending one.
export async function verifyTotpCode(user, code) {
  const active = await findActiveByUserId(user.id)
  if (!active) {
    throw new MfaError(CODES.TOTP_NOT_ENROLLED, 'TOTP is not enabled for this account.')
  }

  const secret = decryptSecret(active.encrypted_secret)
  const result = await verify({ secret, token: code })
  if (!result.valid) {
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Incorrect code. Please try again.')
  }

  const matchedStep = currentTimeStep() + (result.delta || 0)
  // Blocks replaying the exact same 30s code twice — otplib's window
  // tolerance alone only prevents clock-drift issues, not intentional reuse.
  if (isReplayedStep(active.last_verified_step, matchedStep)) {
    throw new MfaError(CODES.VERIFICATION_FAILED, 'This code has already been used. Please wait for a new one.')
  }

  await updateLastVerifiedStep(user.id, matchedStep)
  return true
}

export async function disableTotp(userId, client) {
  return disable(userId, client)
}

function hashRecoveryCode(code) {
  return createHash('sha256').update(code).digest('hex')
}

// crypto.randomInt (CSPRNG, same as domain/otpAuth/otp.js's OTP generator)
// — 10 alphanumeric-ish codes, shown once, never logged.
function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0/O, 1/I)
  let code = ''
  for (let i = 0; i < 10; i++) code += alphabet[randomInt(0, alphabet.length)]
  return code
}

export async function regenerateRecoveryCodes(userId, client) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode)
  await replaceCodesForUser(userId, codes.map(hashRecoveryCode), client)
  return codes
}

export async function verifyRecoveryCode(userId, code) {
  const match = await consumeMatchingCode(userId, hashRecoveryCode(code.trim().toUpperCase()))
  if (!match) {
    throw new MfaError(CODES.VERIFICATION_FAILED, 'Invalid or already-used recovery code.')
  }
  return true
}
