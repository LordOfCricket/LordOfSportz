import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { mfaVerifyLimiter, mfaManageLimiter, stepUpLimiter } from '../middlewares/rateLimit.js'
import {
  getStatus,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  webauthnRemove,
  totpEnroll,
  totpVerify,
  totpDisable,
  regenerateRecoveryCodes,
  disableMfa,
  mfaVerifyOptions,
  mfaVerify,
  stepUpOptions,
  stepUpVerify,
} from '../controllers/mfa.controller.js'

// Mounted at /api/auth. Every route requires an authenticated session
// (requireAuth) — none of these are reachable pre-login. See
// docs/MFA.md for the bootstrap-vs-step-up rule enforced inside the
// services these controllers call, and for why the legacy JWT bearer path
// can never pass mfaVerify/stepUpVerify (no session row to attach state to).
//
// Deliberately NOT role-restricted to SUPER_ADMIN/GROUND_OWNER here: MFA is
// only *mandatory* for those roles (docs/MFA.md), but enrolling it is
// harmless for any other authenticated account (it is simply never
// consulted by requireStaffRole/requireGroundRole for a non-privileged
// role) — the same posture as a consumer app letting anyone turn on 2FA
// even when it isn't required. The Security Settings *page* is restricted
// to privileged roles client-side (RequireMfaVerified/AppRoutes) as a UX
// choice about who has a reason to see it, not a server-side security
// boundary — there is no sensitive data behind these routes that a
// non-privileged account couldn't already see/change about their own
// account via some other path.
const router = Router()

router.get('/mfa/status', requireAuth, getStatus)

router.post('/mfa/webauthn/register/options', requireAuth, mfaManageLimiter, webauthnRegisterOptions)
router.post('/mfa/webauthn/register/verify', requireAuth, mfaVerifyLimiter, webauthnRegisterVerify)
router.delete('/mfa/webauthn/:credentialId', requireAuth, mfaManageLimiter, webauthnRemove)

router.post('/mfa/totp/enroll', requireAuth, mfaManageLimiter, totpEnroll)
router.post('/mfa/totp/verify', requireAuth, mfaVerifyLimiter, totpVerify)
router.post('/mfa/totp/disable', requireAuth, mfaManageLimiter, totpDisable)

router.post('/mfa/recovery-codes/regenerate', requireAuth, mfaManageLimiter, regenerateRecoveryCodes)
router.post('/mfa/disable', requireAuth, mfaManageLimiter, disableMfa)

// Baseline MFA verification — unlocks the privileged session (sets
// sessions.mfa_verified_at). options/verify both accept any of the user's
// enrolled factors (webauthn/totp/recovery) via body.method.
router.post('/mfa/verify/options', requireAuth, mfaManageLimiter, mfaVerifyOptions)
router.post('/mfa/verify', requireAuth, mfaVerifyLimiter, mfaVerify)

// Step-up — short-lived, single-use, action-scoped (never a substitute for
// the baseline verify above).
router.post('/step-up/options', requireAuth, stepUpLimiter, stepUpOptions)
router.post('/step-up/verify', requireAuth, stepUpLimiter, stepUpVerify)

export default router
