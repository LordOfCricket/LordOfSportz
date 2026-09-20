import * as signupService from '../services/signup.service.js'
import { OtpAuthError } from '../domain/otpAuth/errors.js'
import { AccountCreationError } from '../domain/accountCreation/errors.js'

function forward(err, next) {
  if (err instanceof OtpAuthError || err instanceof AccountCreationError) return next(err)
  next(err)
}

// New Signup Flow — "Send Verification Code" (email) / "Send OTP" (phone).
// One route for both; the service auto-detects which via
// domain/otpAuth/otp.js#detectIdentifierType, same as every other
// identifier-driven auth route already does.
export async function sendCode(req, res, next) {
  try {
    const { identifier } = req.body
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'identifier is required.' })
    }
    await signupService.requestSignupVerification(identifier)
    res.json({ message: 'Verification code sent.' })
  } catch (err) {
    forward(err, next)
  }
}

// "Verify Email" / "Verify Phone" — one route for both, same reasoning.
export async function verifyCode(req, res, next) {
  try {
    const { identifier, code } = req.body
    if (!identifier || !code) {
      return res.status(400).json({ message: 'identifier and code are required.' })
    }
    await signupService.verifySignupIdentifier({ identifier, code })
    res.json({ verified: true })
  } catch (err) {
    forward(err, next)
  }
}

// "Create Account" — the terminal step. Field presence is checked here
// (shape only); every actual requirement — verification state, duplicate
// email/phone, password policy/match — is enforced in the service, which is
// the real backend source of truth the brief requires.
export async function createAccount(req, res, next) {
  try {
    const { firstName, middleName, lastName, accountType, email, phone, password, confirmPassword } = req.body
    if (
      !firstName ||
      !middleName ||
      !lastName ||
      !accountType ||
      !email ||
      !phone ||
      typeof password !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      return res.status(400).json({ message: 'All fields are required.' })
    }
    const { user } = await signupService.createAccount({ firstName, middleName, lastName, accountType, email, phone, password, confirmPassword })
    res.status(201).json({ user })
  } catch (err) {
    forward(err, next)
  }
}
