// SUPER_ADMIN Identity & Secure Provisioning feature — "help a user who
// forgot their password" without ever letting the Super Admin see/retrieve
// their EXISTING password (impossible anyway — only a bcrypt hash is ever
// stored — but this also never round-trips the plaintext through anything
// but this one synchronous response). Reuses every existing primitive:
// bcrypt (cost 10, same as every other password path), accountAudit.service.js,
// session revocation, step-up gating (services/stepUp.service.js, scope
// 'ADMIN_PASSWORD_RESET' — see schema.sql's step_up_grants widening).
//
// A "secure reset link" (the brief's other suggested option) was
// deliberately NOT built: this app's email delivery is OTP-code-only
// (SendGrid/console — see otpProviders/), not a general "send an arbitrary
// email with a link" capability, and building that would itself be
// introducing a second delivery/token mechanism the brief's own §14
// warns against. A crypto-random, hashed, short-lived, single-use
// temporary PASSWORD — authenticated through the exact same
// otpAuth.service.js#loginWithPassword path every other password already
// goes through — stays inside the existing architecture instead.
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { findUserById, updateUser } from '../models/user.model.js'
import { revokeAllSessionsForUser } from './session.service.js'
import { consumeStepUpGrant } from './stepUp.service.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { sendPasswordRecoveryEmail } from './emailService.js'
import { MfaError, MFA_ERROR_CODES } from '../domain/mfa/errors.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as CODES } from '../domain/accountCreation/errors.js'
import { logger } from '../utils/logger.js'

const TEMP_CREDENTIAL_TTL_MS = 30 * 60 * 1000 // 30 minutes — short-lived by design (§13)
const TEMP_CREDENTIAL_BYTE_LENGTH = 18 // -> 24-char base64url string, well past the 8-char policy minimum

// Alphanumeric-ish, URL-safe, no padding — easy for an admin to read aloud/
// copy-paste to relay out-of-band, still cryptographically random
// (crypto.randomBytes, never Math.random).
function generateTemporaryPassword() {
  return crypto.randomBytes(TEMP_CREDENTIAL_BYTE_LENGTH).toString('base64url')
}

export async function generateTemporaryCredential(targetUserId, actorUser, sessionId) {
  if (targetUserId === actorUser.id) {
    throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Use Change Password for your own account instead.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const grant = await consumeStepUpGrant(sessionId, 'ADMIN_PASSWORD_RESET', client)
    if (!grant) {
      throw new MfaError(MFA_ERROR_CODES.STEP_UP_REQUIRED, 'This action requires a fresh step-up verification.')
    }

    const targetUser = await findUserById(targetUserId, client)
    if (!targetUser) {
      throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Account not found.')
    }

    const temporaryPassword = generateTemporaryPassword()
    const tempHash = await bcrypt.hash(temporaryPassword, 10)
    const expiresAt = new Date(Date.now() + TEMP_CREDENTIAL_TTL_MS)

    await updateUser(
      targetUserId,
      { temp_password_hash: tempHash, temp_password_expires_at: expiresAt, force_password_change: true },
      client,
    )

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.PASSWORD_RESET_INITIATED_BY_ADMIN,
      { actorUserId: actorUser.id, targetUserId, metadata: { expiresAt: expiresAt.toISOString() } },
      client,
    )
    // Deliberately a SEPARATE event from the one above (not folded
    // together) — "an admin decided to reset this account" and "a real
    // credential was generated for it" are both independently worth being
    // able to answer "which Super Admin performed this action?" for.
    // Metadata never includes the plaintext or the hash — only that a
    // credential exists and when it expires.
    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.TEMPORARY_CREDENTIAL_GENERATED,
      { actorUserId: actorUser.id, targetUserId, metadata: { expiresAt: expiresAt.toISOString() } },
      client,
    )

    await client.query('COMMIT')

    await revokeAllSessionsForUser(targetUserId)

    logger.info('Temporary credential generated for account recovery', { actorUserId: actorUser.id, targetUserId, expiresAt })

    try {
      const loginUrl = process.env.APP_URL || 'https://lordofcricket.com'
      await sendPasswordRecoveryEmail({
        recipientEmail: targetUser.email,
        recipientName: targetUser.name,
        temporaryPassword,
        loginUrl,
      })
      logger.info('Password recovery email sent', { targetUserId, email: targetUser.email })
    } catch (emailErr) {
      logger.error('Failed to send password recovery email', { targetUserId, email: targetUser.email, error: emailErr.message })
    }

    return { temporaryPassword, expiresAt, targetUser }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
