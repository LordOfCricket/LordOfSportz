import { hasAnyActiveFactor } from './mfaState.service.js'
import { consumeStepUpGrant } from './stepUp.service.js'
import {
  generateRegistrationChallenge,
  verifyRegistration,
  listCredentialsForUser,
  revokeCredentialForUser,
} from './webauthn.service.js'
import { enrollTotp, verifyAndActivateTotp, disableTotp, regenerateRecoveryCodes } from './totp.service.js'
import { countActiveCredentialsForUser } from '../models/webauthnCredential.model.js'
import { findActiveByUserId as findActiveTotp } from '../models/totpCredential.model.js'
import { countActiveForUser as countActiveRecoveryCodes } from '../models/mfaRecoveryCode.model.js'
import { revokeAllSessionsForUserExceptCurrent } from '../repositories/prisma/session.prisma-repository.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { MfaError, MFA_ERROR_CODES as CODES } from '../domain/mfa/errors.js'
import { logger } from '../utils/logger.js'

// Phase 6 — orchestrates the bootstrap-vs-step-up decision (docs/MFA.md)
// for every factor-management mutation. WebAuthn/TOTP mechanics stay
// isolated in their own services; this file only decides WHEN a mutation
// is allowed to proceed and records the resulting audit event — matching
// the brief's "MFA logic in dedicated services, controllers stay thin".
//
// Deliberately NOT wrapped in a single shared DB transaction across
// consumeStepUpGrant + the actual WebAuthn/TOTP write: unlike the
// privilege-granting mutations in groundStaff.service.js/
// staffAccount.service.js/groundOwnerRequest.service.js (where a
// step-up/mutation mismatch would corrupt real authorization state), a
// factor-management mismatch here is at worst a wasted, already-short-lived
// step-up grant — the user simply re-verifies. Ordering (consume step-up
// BEFORE attempting the mutation, never after) still guarantees a failed
// mutation can never be retried for free on an already-spent grant.

async function requireStepUpUnlessBootstrapping(userId, sessionId, actionScope) {
  const bootstrapping = !(await hasAnyActiveFactor(userId))
  if (bootstrapping) return true
  const grant = await consumeStepUpGrant(sessionId, actionScope)
  if (!grant) {
    throw new MfaError(CODES.STEP_UP_REQUIRED, 'This action requires a fresh step-up verification.')
  }
  return false
}

async function assertNotRemovingLastFactor(userId, { removingWebauthnId, removingTotp } = {}) {
  const [webauthnCount, totp] = await Promise.all([countActiveCredentialsForUser(userId), findActiveTotp(userId)])
  const remainingWebauthn = removingWebauthnId ? webauthnCount - 1 : webauthnCount
  const remainingTotp = removingTotp ? false : Boolean(totp)
  if (remainingWebauthn <= 0 && !remainingTotp) {
    throw new MfaError(
      CODES.LAST_FACTOR_REMOVAL_BLOCKED,
      'You cannot remove your last authentication factor. Add another passkey or enable an authenticator app first.',
    )
  }
}

export async function startPasskeyRegistration(user) {
  return generateRegistrationChallenge(user)
}

export async function completePasskeyRegistration(user, sessionId, response, deviceName) {
  const bootstrapping = await requireStepUpUnlessBootstrapping(user.id, sessionId, 'WEBAUTHN_ADD')
  const credential = await verifyRegistration(user, response, deviceName)

  await recordEvent(ACCOUNT_AUDIT_EVENTS.PASSKEY_REGISTERED, {
    actorUserId: user.id,
    targetUserId: user.id,
    metadata: { credentialId: credential.id, deviceName: credential.device_name },
  })
  if (bootstrapping) {
    await recordEvent(ACCOUNT_AUDIT_EVENTS.MFA_ENROLLMENT_COMPLETED, { actorUserId: user.id, targetUserId: user.id, metadata: { method: 'webauthn' } })
  }
  logger.info('Passkey registered', { userId: user.id, bootstrapping })
  return { id: credential.id, deviceName: credential.device_name }
}

export async function removePasskey(user, sessionId, credentialRowId) {
  await consumeOrThrow(sessionId, 'WEBAUTHN_REMOVE')
  await assertNotRemovingLastFactor(user.id, { removingWebauthnId: credentialRowId })
  await revokeCredentialForUser(user.id, credentialRowId)
  await revokeAllSessionsForUserExceptCurrent(user.id, sessionId)

  await recordEvent(ACCOUNT_AUDIT_EVENTS.PASSKEY_REVOKED, { actorUserId: user.id, targetUserId: user.id, metadata: { credentialId: credentialRowId } })
  await recordEvent(ACCOUNT_AUDIT_EVENTS.SESSION_REVOKED_FOR_SECURITY_REASON, { actorUserId: user.id, targetUserId: user.id, metadata: { reason: 'PASSKEY_REMOVED' } })
}

export async function startTotpEnrollment(user) {
  return enrollTotp(user)
}

export async function completeTotpEnrollment(user, sessionId, code) {
  const bootstrapping = await requireStepUpUnlessBootstrapping(user.id, sessionId, 'TOTP_ENABLE')
  await verifyAndActivateTotp(user, code)

  await recordEvent(ACCOUNT_AUDIT_EVENTS.TOTP_ENABLED, { actorUserId: user.id, targetUserId: user.id })
  if (bootstrapping) {
    await recordEvent(ACCOUNT_AUDIT_EVENTS.MFA_ENROLLMENT_COMPLETED, { actorUserId: user.id, targetUserId: user.id, metadata: { method: 'totp' } })
  }
  logger.info('TOTP enabled', { userId: user.id, bootstrapping })
}

async function consumeOrThrow(sessionId, actionScope) {
  const grant = await consumeStepUpGrant(sessionId, actionScope)
  if (!grant) throw new MfaError(CODES.STEP_UP_REQUIRED, 'This action requires a fresh step-up verification.')
}

export async function disableTotpFactor(user, sessionId) {
  await consumeOrThrow(sessionId, 'TOTP_DISABLE')
  await assertNotRemovingLastFactor(user.id, { removingTotp: true })
  await disableTotp(user.id)
  await revokeAllSessionsForUserExceptCurrent(user.id, sessionId)

  await recordEvent(ACCOUNT_AUDIT_EVENTS.TOTP_DISABLED, { actorUserId: user.id, targetUserId: user.id })
  await recordEvent(ACCOUNT_AUDIT_EVENTS.SESSION_REVOKED_FOR_SECURITY_REASON, { actorUserId: user.id, targetUserId: user.id, metadata: { reason: 'TOTP_DISABLED' } })
}

export async function regenerateRecoveryCodesFlow(user, sessionId) {
  await consumeOrThrow(sessionId, 'RECOVERY_CODES_REGENERATE')
  const codes = await regenerateRecoveryCodes(user.id)

  await recordEvent(ACCOUNT_AUDIT_EVENTS.MFA_RECOVERY_COMPLETED, { actorUserId: user.id, targetUserId: user.id, metadata: { action: 'regenerate' } })
  logger.info('Recovery codes regenerated', { userId: user.id })
  return codes
}

// GROUND_OWNER only — see docs/MFA.md "MFA disable" for why SUPER_ADMIN has
// no path to this at all (enforced by the controller's own role check, not
// repeated here). Wipes every factor + all recovery codes and forces
// re-enrollment the next time a privileged action is attempted.
export async function disableMfaEntirely(user, sessionId) {
  await consumeOrThrow(sessionId, 'MFA_DISABLE')

  const credentials = await listCredentialsForUser(user.id)
  for (const credential of credentials) {
    await revokeCredentialForUser(user.id, credential.id)
  }
  await disableTotp(user.id)
  await regenerateRecoveryCodes(user.id) // regenerating then discarding invalidates every existing code

  await revokeAllSessionsForUserExceptCurrent(user.id, sessionId)
  await recordEvent(ACCOUNT_AUDIT_EVENTS.MFA_DISABLED, { actorUserId: user.id, targetUserId: user.id })
  await recordEvent(ACCOUNT_AUDIT_EVENTS.SESSION_REVOKED_FOR_SECURITY_REASON, { actorUserId: user.id, targetUserId: user.id, metadata: { reason: 'MFA_DISABLED' } })
  logger.info('MFA disabled (all factors removed)', { userId: user.id })
}

export async function getSecurityStatus(user) {
  const [credentials, totp, recoveryCodeCount] = await Promise.all([
    listCredentialsForUser(user.id),
    findActiveTotp(user.id),
    countActiveRecoveryCodes(user.id),
  ])
  return {
    passkeys: credentials,
    totpEnabled: Boolean(totp),
    recoveryCodesRemaining: recoveryCodeCount,
    enrolled: credentials.length > 0 || Boolean(totp),
  }
}
