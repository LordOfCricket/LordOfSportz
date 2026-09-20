import {
  startPasskeyRegistration,
  completePasskeyRegistration,
  removePasskey,
  startTotpEnrollment,
  completeTotpEnrollment,
  disableTotpFactor,
  regenerateRecoveryCodesFlow,
  disableMfaEntirely,
  getSecurityStatus,
} from '../services/mfaEnrollment.service.js'
import { getMfaVerificationOptions, verifyBaselineMfa, getStepUpOptions, verifyStepUp } from '../services/mfaVerification.service.js'
import { hasAnyActiveFactor, isSuperAdmin } from '../services/mfaState.service.js'
import { MfaError, MFA_ERROR_CODES } from '../domain/mfa/errors.js'

// Phase 6 — thin controllers; all orchestration lives in
// services/mfaEnrollment.service.js and services/mfaVerification.service.js.
// Every route here is requireAuth-gated (routes/mfa.routes.js) — none of
// these ever trust a userId from the request body, only req.user/req.session.

function requireSession(req) {
  if (!req.session) {
    throw new MfaError(MFA_ERROR_CODES.VALIDATION_ERROR, 'This action requires a session-based login. Please sign in again.')
  }
}

export async function getStatus(req, res, next) {
  try {
    const [security, hasFactor] = await Promise.all([getSecurityStatus(req.user), hasAnyActiveFactor(req.user.id)])
    res.json({
      mfa: {
        enrolled: hasFactor,
        required: isSuperAdmin(req.user), // Ground Owner "required" is resolved per-ground, not globally — see /auth/me
        verified: Boolean(req.mfaVerified),
      },
      ...security,
    })
  } catch (err) {
    next(err)
  }
}

export async function webauthnRegisterOptions(req, res, next) {
  try {
    const options = await startPasskeyRegistration(req.user)
    res.json(options)
  } catch (err) {
    next(err)
  }
}

export async function webauthnRegisterVerify(req, res, next) {
  try {
    requireSession(req)
    const { response, deviceName } = req.body || {}
    const credential = await completePasskeyRegistration(req.user, req.session.id, response, deviceName)
    res.status(201).json({ credential })
  } catch (err) {
    next(err)
  }
}

export async function webauthnRemove(req, res, next) {
  try {
    requireSession(req)
    await removePasskey(req.user, req.session.id, Number(req.params.credentialId))
    res.json({ removed: true })
  } catch (err) {
    next(err)
  }
}

export async function totpEnroll(req, res, next) {
  try {
    const { qrDataUrl } = await startTotpEnrollment(req.user)
    res.json({ qrDataUrl })
  } catch (err) {
    next(err)
  }
}

export async function totpVerify(req, res, next) {
  try {
    requireSession(req)
    const { code } = req.body || {}
    await completeTotpEnrollment(req.user, req.session.id, code)
    res.json({ enabled: true })
  } catch (err) {
    next(err)
  }
}

export async function totpDisable(req, res, next) {
  try {
    requireSession(req)
    await disableTotpFactor(req.user, req.session.id)
    res.json({ disabled: true })
  } catch (err) {
    next(err)
  }
}

export async function regenerateRecoveryCodes(req, res, next) {
  try {
    requireSession(req)
    const codes = await regenerateRecoveryCodesFlow(req.user, req.session.id)
    res.json({ codes })
  } catch (err) {
    next(err)
  }
}

// GROUND_OWNER only — Super Admin has no path to this endpoint at all (see
// docs/MFA.md "MFA disable" for why this is the safer architecture).
export async function disableMfa(req, res, next) {
  try {
    requireSession(req)
    if (isSuperAdmin(req.user)) {
      throw new MfaError(MFA_ERROR_CODES.MFA_DISABLE_NOT_ALLOWED, 'Super Admin MFA cannot be self-disabled. Contact another Super Admin for account recovery.')
    }
    await disableMfaEntirely(req.user, req.session.id)
    res.json({ disabled: true })
  } catch (err) {
    next(err)
  }
}

export async function mfaVerifyOptions(req, res, next) {
  try {
    const options = await getMfaVerificationOptions(req.user)
    res.json(options)
  } catch (err) {
    next(err)
  }
}

export async function mfaVerify(req, res, next) {
  try {
    requireSession(req)
    const { method, response, code } = req.body || {}
    await verifyBaselineMfa(req.user, req.session, { method, response, code })
    res.json({ verified: true })
  } catch (err) {
    next(err)
  }
}

export async function stepUpOptions(req, res, next) {
  try {
    requireSession(req)
    const { actionScope } = req.body || {}
    const result = await getStepUpOptions(req.user, req.session, actionScope)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function stepUpVerify(req, res, next) {
  try {
    requireSession(req)
    const { actionScope, method, response, code } = req.body || {}
    await verifyStepUp(req.user, req.session, actionScope, { method, response, code })
    res.json({ verified: true })
  } catch (err) {
    next(err)
  }
}
