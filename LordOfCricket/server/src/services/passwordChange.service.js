// SUPER_ADMIN Identity & Secure Provisioning feature — self-service
// "change my password while already logged in", genuinely new (the only
// existing password-set path, otpAuth.service.js#resetPassword, is the
// logged-OUT forgot-password OTP flow). Reuses every existing primitive
// this codebase already has for passwords: domain/otpAuth/password.js's
// policy, bcrypt cost 10, accountAudit.service.js, session.service.js's
// revoke-other-sessions shape — nothing here is a second password system.
import bcrypt from 'bcryptjs'
import { validatePasswordPolicy } from '../domain/otpAuth/password.js'
import { OtpAuthError, OTP_AUTH_ERROR_CODES as CODES } from '../domain/otpAuth/errors.js'
import { findPasswordHashById, updateUser } from '../models/user.model.js'
import { revokeAllSessionsForUserExceptCurrent } from './session.service.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { logger } from '../utils/logger.js'

// This is the one place a Super Admin (or anyone) who was force-changed
// clears that flag AND, defensively, any leftover temp credential fields —
// belt-and-suspenders alongside otpAuth.service.js#loginWithPassword's own
// immediate temp-credential invalidation on successful use.
export async function changePassword(user, sessionId, { currentPassword, newPassword, confirmPassword }) {
  const currentHash = await findPasswordHashById(user.id)
  const currentMatches = await bcrypt.compare(typeof currentPassword === 'string' ? currentPassword : '', currentHash || bcrypt.hashSync('no-password-set', 10))
  if (!currentHash || !currentMatches) {
    throw new OtpAuthError(CODES.INVALID_CREDENTIALS, 'Your current password is incorrect.')
  }

  if (newPassword !== confirmPassword) {
    throw new OtpAuthError(CODES.PASSWORD_MISMATCH, 'Passwords do not match.')
  }
  const policy = validatePasswordPolicy(newPassword)
  if (!policy.valid) {
    throw new OtpAuthError(CODES.PASSWORD_POLICY_VIOLATION, policy.reason)
  }
  if (newPassword === currentPassword) {
    throw new OtpAuthError(CODES.PASSWORD_POLICY_VIOLATION, 'Your new password must be different from your current password.')
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await updateUser(user.id, {
    password_hash: passwordHash,
    force_password_change: false,
    temp_password_hash: null,
    temp_password_expires_at: null,
  })

  await revokeAllSessionsForUserExceptCurrent(user.id, sessionId)
  await recordEvent(ACCOUNT_AUDIT_EVENTS.PASSWORD_CHANGED, { actorUserId: user.id, targetUserId: user.id })

  logger.info('Password changed', { userId: user.id })
}
