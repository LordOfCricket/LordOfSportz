import { generateAuthenticationChallenge, verifyAuthentication } from './webauthn.service.js'
import { verifyTotpCode, verifyRecoveryCode } from './totp.service.js'
import { markSessionMfaVerified } from './mfaState.service.js'
import { hasFreshStepUpGrant, issueStepUpGrant } from './stepUp.service.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { isValidActionScope } from '../domain/mfa/actionScopes.js'
import { MfaError, MFA_ERROR_CODES as CODES } from '../domain/mfa/errors.js'

// Phase 6 — the shared "prove you still hold a factor" mechanics used by
// BOTH baseline MFA verification (unlocks the privileged session) and
// step-up verification (unlocks one scoped action). Neither ever ENROLLS a
// new factor — only verifies against one that already exists.

async function verifyByMethod(user, { method, response, code }) {
  if (method === 'webauthn') return verifyAuthentication(user, response)
  if (method === 'totp') return verifyTotpCode(user, code)
  if (method === 'recovery') return verifyRecoveryCode(user.id, code)
  throw new MfaError(CODES.VALIDATION_ERROR, "method must be 'webauthn', 'totp', or 'recovery'.")
}

function auditEventsFor(method) {
  if (method === 'webauthn') return { success: ACCOUNT_AUDIT_EVENTS.PASSKEY_AUTHENTICATION_SUCCESS, failure: ACCOUNT_AUDIT_EVENTS.PASSKEY_AUTHENTICATION_FAILURE }
  if (method === 'totp') return { success: ACCOUNT_AUDIT_EVENTS.TOTP_VERIFICATION_SUCCESS, failure: ACCOUNT_AUDIT_EVENTS.TOTP_VERIFICATION_FAILURE }
  return { success: ACCOUNT_AUDIT_EVENTS.MFA_RECOVERY_COMPLETED, failure: ACCOUNT_AUDIT_EVENTS.MFA_RECOVERY_STARTED }
}

// A TOTP-only user (no enrolled passkey) is a legitimate, expected
// configuration (docs/MFA.md — TOTP is a real fallback, not a lesser
// citizen). generateAuthenticationChallenge throws CREDENTIAL_NOT_FOUND for
// that user; the frontend needs a clean "no WebAuthn challenge available,
// fall back to your code" signal here, not a hard error on what is a normal
// path for a large fraction of enrolled users.
async function tryGenerateAuthenticationChallenge(user) {
  try {
    return await generateAuthenticationChallenge(user)
  } catch (err) {
    if (err instanceof MfaError && err.code === CODES.CREDENTIAL_NOT_FOUND) return null
    throw err
  }
}

export async function getMfaVerificationOptions(user) {
  const challenge = await tryGenerateAuthenticationChallenge(user)
  return { challenge }
}

export async function verifyBaselineMfa(user, session, payload) {
  const events = auditEventsFor(payload.method)
  try {
    await verifyByMethod(user, payload)
  } catch (err) {
    await recordEvent(events.failure, { actorUserId: user.id, targetUserId: user.id, metadata: { method: payload.method } })
    throw err
  }

  await markSessionMfaVerified(session.id)
  await recordEvent(events.success, { actorUserId: user.id, targetUserId: user.id, metadata: { method: payload.method } })
}

export async function getStepUpOptions(user, session, actionScope) {
  if (!isValidActionScope(actionScope)) {
    throw new MfaError(CODES.VALIDATION_ERROR, `Unknown action scope: ${actionScope}`)
  }
  await recordEvent(ACCOUNT_AUDIT_EVENTS.STEP_UP_REQUESTED, { actorUserId: user.id, targetUserId: user.id, metadata: { actionScope } })

  const alreadyGranted = await hasFreshStepUpGrant(session.id, actionScope)
  if (alreadyGranted) return { alreadyGranted: true }

  const challenge = await tryGenerateAuthenticationChallenge(user)
  return { alreadyGranted: false, challenge }
}

export async function verifyStepUp(user, session, actionScope, payload) {
  if (!isValidActionScope(actionScope)) {
    throw new MfaError(CODES.VALIDATION_ERROR, `Unknown action scope: ${actionScope}`)
  }

  try {
    await verifyByMethod(user, payload)
  } catch (err) {
    await recordEvent(ACCOUNT_AUDIT_EVENTS.STEP_UP_FAILED, { actorUserId: user.id, targetUserId: user.id, metadata: { actionScope, method: payload.method } })
    throw err
  }

  await issueStepUpGrant(session.id, user.id, actionScope)
  await recordEvent(ACCOUNT_AUDIT_EVENTS.STEP_UP_SUCCEEDED, { actorUserId: user.id, targetUserId: user.id, metadata: { actionScope, method: payload.method } })
}
