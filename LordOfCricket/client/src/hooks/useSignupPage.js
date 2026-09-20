import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth.js'

const RESEND_COOLDOWN_SECONDS = 30
const CODE_LENGTH = 6

// New Signup Flow — one page, one hook, five independent-but-related
// pieces of state: name (3 fields), account type (radio), email
// verification (its own send/verify sub-state), phone verification (same
// shape, independent), password+confirm. "Create Account" only ever
// succeeds when the backend independently confirms every one of these —
// this hook's own validation is UX only, never the source of truth (see
// services/signup.service.js#createAccount for the real enforcement).
export function useSignupPage() {
  const { sendSignupCode, verifySignupCode, createAccount } = useAuth()

  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [accountType, setAccountType] = useState('')

  const [email, setEmail] = useState('')
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [emailError, setEmailError] = useState('')
  const emailCooldownInterval = useRef(null)

  const [phone, setPhone] = useState('')
  const [phoneCodeSent, setPhoneCodeSent] = useState(false)
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneCooldown, setPhoneCooldown] = useState(0)
  const [phoneError, setPhoneError] = useState('')
  const phoneCooldownInterval = useRef(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)

  useEffect(() => () => clearInterval(emailCooldownInterval.current), [])
  useEffect(() => () => clearInterval(phoneCooldownInterval.current), [])

  // Editing an already-verified identifier invalidates that verification —
  // the backend would reject a stale one anyway (a fresh code is for the
  // NEW value), so reflecting that immediately in the UI avoids a
  // confusing "✓ Verified" badge sitting next to a since-edited value.
  const onEmailChange = (value) => {
    setEmail(value)
    if (emailVerified || emailCodeSent) {
      setEmailVerified(false)
      setEmailCodeSent(false)
      setEmailCode('')
      setEmailError('')
    }
  }

  const onPhoneChange = (value) => {
    setPhone(value)
    if (phoneVerified || phoneCodeSent) {
      setPhoneVerified(false)
      setPhoneCodeSent(false)
      setPhoneCode('')
      setPhoneError('')
    }
  }

  const startCooldown = (setCooldown, intervalRef) => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          clearInterval(intervalRef.current)
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  const sendEmailCode = async () => {
    setEmailError('')
    if (!email.trim()) {
      setEmailError('Enter your email address.')
      return
    }
    setEmailBusy(true)
    try {
      await sendSignupCode(email.trim())
      setEmailCodeSent(true)
      startCooldown(setEmailCooldown, emailCooldownInterval)
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Could not send the verification code. Please try again.')
    } finally {
      setEmailBusy(false)
    }
  }

  const verifyEmailCode = async () => {
    setEmailError('')
    if (emailCode.length !== CODE_LENGTH) {
      setEmailError(`Enter the ${CODE_LENGTH}-digit code.`)
      return
    }
    setEmailBusy(true)
    try {
      await verifySignupCode(email.trim(), emailCode)
      setEmailVerified(true)
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setEmailBusy(false)
    }
  }

  const sendPhoneCode = async () => {
    setPhoneError('')
    if (!phone.trim()) {
      setPhoneError('Enter your phone number.')
      return
    }
    setPhoneBusy(true)
    try {
      await sendSignupCode(phone.trim())
      setPhoneCodeSent(true)
      startCooldown(setPhoneCooldown, phoneCooldownInterval)
    } catch (err) {
      setPhoneError(err.response?.data?.message || 'Could not send the OTP. Please try again.')
    } finally {
      setPhoneBusy(false)
    }
  }

  const verifyPhoneCode = async () => {
    setPhoneError('')
    if (phoneCode.length !== CODE_LENGTH) {
      setPhoneError(`Enter the ${CODE_LENGTH}-digit code.`)
      return
    }
    setPhoneBusy(true)
    try {
      await verifySignupCode(phone.trim(), phoneCode)
      setPhoneVerified(true)
    } catch (err) {
      setPhoneError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setPhoneBusy(false)
    }
  }

  // UX-only gate — mirrors, but never replaces, the backend's own
  // independent checks (missing/verified fields, password policy/match).
  // Never disables the button on a check the backend doesn't also enforce.
  const canSubmit =
    firstName.trim() &&
    middleName.trim() &&
    lastName.trim() &&
    (accountType === 'PLAYER' || accountType === 'UMPIRE') &&
    emailVerified &&
    phoneVerified &&
    password &&
    confirmPassword &&
    !submitting

  const submitCreateAccount = async (e) => {
    e.preventDefault()
    setError('')
    if (!firstName.trim() || !middleName.trim() || !lastName.trim()) {
      setError('First, middle, and last name are all required.')
      return
    }
    if (accountType !== 'PLAYER' && accountType !== 'UMPIRE') {
      setError('Select Player or Umpire.')
      return
    }
    if (!emailVerified) {
      setError('Please verify your email address first.')
      return
    }
    if (!phoneVerified) {
      setError('Please verify your phone number first.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await createAccount({
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        accountType,
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword,
      })
      setAccountCreated(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    firstName,
    setFirstName,
    middleName,
    setMiddleName,
    lastName,
    setLastName,
    accountType,
    setAccountType,
    email,
    onEmailChange,
    emailCodeSent,
    emailCode,
    setEmailCode,
    emailVerified,
    emailBusy,
    emailCooldown,
    emailError,
    sendEmailCode,
    verifyEmailCode,
    phone,
    onPhoneChange,
    phoneCodeSent,
    phoneCode,
    setPhoneCode,
    phoneVerified,
    phoneBusy,
    phoneCooldown,
    phoneError,
    sendPhoneCode,
    verifyPhoneCode,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    submitting,
    accountCreated,
    canSubmit,
    submitCreateAccount,
  }
}
