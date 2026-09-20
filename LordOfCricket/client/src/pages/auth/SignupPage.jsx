import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react'
import Input from '../../components/ui/Input.jsx'
import { useSignupPage } from '../../hooks/useSignupPage.js'

// Length-tiered only, matching domain/otpAuth/password.js's own length-over-
// complexity policy (8-128 chars, no forced character classes) — a strength
// meter that pushed for symbol/digit substitutions would contradict the
// actual server-side policy it's supposed to reflect.
function passwordStrength(password) {
  if (!password) return null
  if (password.length < 8) return { label: 'Too short', className: 'text-red-600', barClass: 'w-1/4 bg-red-400' }
  if (password.length < 12) return { label: 'Fair', className: 'text-amber-600', barClass: 'w-2/4 bg-yellow-400' }
  if (password.length < 16) return { label: 'Good', className: 'text-loc-green', barClass: 'w-3/4 bg-green-400' }
  return { label: 'Strong', className: 'text-loc-green', barClass: 'w-full bg-green-400' }
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-loc-green">
      <CheckCircle2 className="h-4 w-4" /> Verified
    </span>
  )
}

export default function SignupPage() {
  const {
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
  } = useSignupPage()

  const strength = passwordStrength(password)

  if (accountCreated) {
    return (
      <main className="loc-page flex min-h-screen items-center justify-center px-6 font-loc-body">
        <div className="loc-card mx-auto w-full max-w-lg p-10 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-loc-green" />
          <h1 className="loc-heading mt-6 text-3xl">Account Created</h1>
          <p className="mt-4 text-loc-muted">Your LOC account is ready. Sign in with your email or phone number and your new password.</p>
          <Link to="/login" className="loc-btn mt-8 h-14 w-full font-loc-display uppercase tracking-wider">
            Continue to Login <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="loc-page py-16 font-loc-body">
      <section className="mx-auto flex min-h-full max-w-3xl flex-col items-center px-6">
        <div className="w-full text-center">
          <span className="loc-eyebrow text-xs sm:text-sm">Join LOC</span>
          <h1 className="loc-heading mt-4 text-4xl leading-[0.95] sm:text-5xl">
            Create Your <span className="text-loc-green">Account</span>
          </h1>
          <p className="mt-4 text-lg text-loc-muted">One account for every LOC role — Player or Umpire.</p>
        </div>

        <form
          onSubmit={submitCreateAccount}
          className="loc-card mt-10 w-full space-y-8 p-8 sm:p-10"
        >
          {/* --- Name --- */}
          <div>
            <span className="mb-3 block text-sm font-semibold tracking-wide text-loc-muted uppercase">Full Name</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input light label="First Name*" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" autoFocus required />
              <Input light label="Middle Name*" type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Middle name" required />
              <Input light label="Last Name*" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required />
            </div>
          </div>

          {/* --- Account Type --- */}
          <div>
            <span className="mb-3 block text-sm font-semibold tracking-wide text-loc-muted uppercase">Register as</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { value: 'PLAYER', label: 'Player' },
                { value: 'UMPIRE', label: 'Umpire' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-5 py-4 backdrop-blur-md transition-all duration-200 ${
                    accountType === option.value ? 'border-loc-green bg-loc-mint' : 'border-loc-border bg-loc-surface hover:border-loc-green/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={option.value}
                    checked={accountType === option.value}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="h-4 w-4 accent-[var(--color-loc-green)]"
                    required
                  />
                  <span className="text-base font-semibold text-loc-navy">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* --- Email verification --- */}
          <div className="space-y-3 rounded-2xl border border-loc-border bg-loc-mint p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold tracking-wide text-loc-muted uppercase">Email Address*</span>
              {emailVerified && <VerifiedBadge />}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input light type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="you@example.com" disabled={emailVerified} required />
              </div>
              {!emailVerified && (
                <button
                  type="button"
                  onClick={sendEmailCode}
                  disabled={emailBusy || emailCooldown > 0}
                  className="loc-btn-outline h-14 shrink-0 px-6 uppercase tracking-wide disabled:cursor-not-allowed"
                >
                  {emailCooldown > 0 ? `Resend in ${emailCooldown}s` : emailCodeSent ? 'Resend Code' : 'Send Verification Code'}
                </button>
              )}
            </div>
            {emailCodeSent && !emailVerified && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input light
                    label="Verification Code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <button
                  type="button"
                  onClick={verifyEmailCode}
                  disabled={emailBusy}
                  className="loc-btn h-14 shrink-0 px-6 uppercase tracking-wide disabled:cursor-not-allowed"
                >
                  Verify Email
                </button>
              </div>
            )}
            {emailError && <p className="text-sm text-red-600">{emailError}</p>}
          </div>

          {/* --- Phone verification --- */}
          <div className="space-y-3 rounded-2xl border border-loc-border bg-loc-mint p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold tracking-wide text-loc-muted uppercase">Phone Number*</span>
              {phoneVerified && <VerifiedBadge />}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input light type="tel" value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="+91XXXXXXXXXX" disabled={phoneVerified} required />
              </div>
              {!phoneVerified && (
                <button
                  type="button"
                  onClick={sendPhoneCode}
                  disabled={phoneBusy || phoneCooldown > 0}
                  className="loc-btn-outline h-14 shrink-0 px-6 uppercase tracking-wide disabled:cursor-not-allowed"
                >
                  {phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : phoneCodeSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              )}
            </div>
            {phoneCodeSent && !phoneVerified && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Input light
                    label="Enter OTP"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                  />
                </div>
                <button
                  type="button"
                  onClick={verifyPhoneCode}
                  disabled={phoneBusy}
                  className="loc-btn h-14 shrink-0 px-6 uppercase tracking-wide disabled:cursor-not-allowed"
                >
                  Verify Phone
                </button>
              </div>
            )}
            {phoneError && <p className="text-sm text-red-600">{phoneError}</p>}
          </div>

          {/* --- Password --- */}
          <div className="space-y-5">
            <div>
              <Input light label="Password*" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
              {strength && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-loc-border-soft">
                    <div className={`h-full rounded-full transition-all duration-300 ${strength.barClass}`} />
                  </div>
                  <span className={`text-xs font-semibold tracking-wide uppercase ${strength.className}`}>Password strength: {strength.label}</span>
                </div>
              )}
            </div>
            <Input light
              label="Confirm Password*"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
            />
            {password && confirmPassword && password !== confirmPassword && <p className="text-sm text-red-600">Passwords do not match.</p>}
          </div>

          {error && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="loc-btn group h-14 w-full font-loc-display uppercase tracking-wider disabled:cursor-not-allowed"
          >
            {submitting ? (
              'Creating account…'
            ) : (
              <>
                Create Account <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </>
            )}
          </button>

          <div className="flex flex-col items-center gap-4">
            <Link to="/login" className="text-sm text-loc-muted underline-offset-4 hover:text-loc-navy hover:underline">
              Already have an account? Sign in
            </Link>
            <div className="flex items-center justify-center gap-2 text-xs text-loc-muted">
              <ShieldCheck className="h-4 w-4 text-loc-green" />
              One secure sign-in for every LOC role.
            </div>
          </div>
        </form>
      </section>
    </main>
  )
}
