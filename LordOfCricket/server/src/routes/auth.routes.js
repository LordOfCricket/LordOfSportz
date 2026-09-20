import { Router } from 'express'
import {
  me,
  selectRole,
  selectPlayerType,
  sendOtp,
  verifyOtpAndLogin,
  logout,
  registerPlayer,
  registerUmpire,
  loginWithPassword,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js'
import { sendCode as signupSendCode, verifyCode as signupVerifyCode, createAccount } from '../controllers/signup.controller.js'
import { changePasswordHandler } from '../controllers/passwordChange.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import {
  otpRequestLimiter,
  otpVerifyLimiter,
  passwordLoginLimiter,
  passwordLoginIdentifierLimiter,
  accountCreationLimiter,
  passwordChangeLimiter,
} from '../middlewares/rateLimit.js'

const router = Router()

// Phase 3 — unified OTP login (email or phone), the new primary auth path.
router.post('/send-otp', otpRequestLimiter, sendOtp)
router.post('/verify-otp', otpVerifyLimiter, verifyOtpAndLogin)
router.post('/logout', logout)

// Phase 4 — Player/Umpire self-registration. Both public (no auth); both
// complete via the SAME /verify-otp above, not a separate endpoint (the
// brief forbids a generic role-selection registration endpoint) — the
// verified code's `purpose` is what tells verify-otp which kind of account
// to create.
router.post('/register/player', otpRequestLimiter, registerPlayer)
router.post('/register/umpire', otpRequestLimiter, registerUmpire)

// Phase 8 — the legacy email+password `/signup`/`/login` routes were
// removed here (zero reachable frontend callers — see docs/AUTH.md).

// Auth Enhancement — the second credential type for the SAME unified login
// entry point above (not a second auth system): email/phone + password,
// creating the identical session-cookie-based session /verify-otp does.
// Two limiters chained (IP, then identifier) — see rateLimit.js's own
// comment for why password guessing needs both dimensions, unlike a route
// that only needed one.
router.post('/login-password', passwordLoginLimiter, passwordLoginIdentifierLimiter, loginWithPassword)

// Auth Enhancement — forgot-password. Reuses otpRequestLimiter/
// otpVerifyLimiter directly (not new limiters) since requesting/submitting
// a reset code is the same shape of action those already protect for
// login/registration.
router.post('/forgot-password', otpRequestLimiter, forgotPassword)
router.post('/reset-password', otpVerifyLimiter, resetPassword)

// New Signup Flow — collects + verifies BOTH email and phone before a
// single account-creation call (unlike /register/player|umpire above,
// which verify exactly one identifier and create the account as part of
// that same verification). send-code/verify-code reuse otpRequestLimiter/
// otpVerifyLimiter directly since requesting/submitting a code is the same
// shape of action those already protect.
router.post('/signup/send-code', otpRequestLimiter, signupSendCode)
router.post('/signup/verify-code', otpVerifyLimiter, signupVerifyCode)
router.post('/signup/create-account', accountCreationLimiter, createAccount)

router.get('/me', requireAuth, me)
router.patch('/role', requireAuth, selectRole)
router.patch('/player-type', requireAuth, selectPlayerType)

// SUPER_ADMIN Identity & Secure Provisioning feature — self-service change
// password while authenticated. Deliberately requireAuth-only, never
// requireStaffRole — this must stay reachable for a force_password_change=
// true account, which requireStaffRole itself blocks from every OTHER
// staff route (see middlewares/auth.js).
router.post('/change-password', requireAuth, passwordChangeLimiter, changePasswordHandler)

export default router
