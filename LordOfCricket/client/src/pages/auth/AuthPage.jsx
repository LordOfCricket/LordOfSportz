import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import Input from '../../components/ui/Input.jsx'
import { useAuthPage } from '../../hooks/useAuthPage.js'

const COPY = {
  eyebrow: 'Member Access',
  heading: 'Welcome to LOC',
  subtitle: 'Sign in with your email or phone number.',
}

// New Signup Flow — subtitles for login's sub-views. 'password' (the
// default view) uses COPY.subtitle above; these only ever render once the
// user has clicked into a sub-view of this SAME page.
const STEP_SUBTITLE = {
  'otp-request': 'Enter your email or phone number and we’ll send you a code.',
  'forgot-request': 'Enter your email or phone number and we’ll send you a reset code.',
  'forgot-reset': 'Enter the code we sent you, then choose a new password.',
}

export default function AuthPage() {
  const {
    step,
    identifier,
    setIdentifier,
    code,
    setCode,
    password,
    setPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    info,
    submitting,
    resendCooldown,
    verifyCode,
    resendCode,
    submitPassword,
    startOtpLogin,
    requestOtpCode,
    backToPasswordLogin,
    startForgotPassword,
    requestPasswordReset,
    resendPasswordReset,
    submitPasswordReset,
    backToLogin,
  } = useAuthPage()

  const isDefaultLoginView = step === 'password'

  const subtitle =
    step === 'password'
      ? COPY.subtitle
      : step === 'otp-verify'
        ? `Enter the 6-digit code sent to ${identifier}.`
        : STEP_SUBTITLE[step] || COPY.subtitle

  const onSubmit =
    {
      password: submitPassword,
      'otp-request': requestOtpCode,
      'otp-verify': verifyCode,
      'forgot-request': requestPasswordReset,
      'forgot-reset': submitPasswordReset,
    }[step] || ((e) => e.preventDefault())

  return (
    <main className="loc-page font-loc-body">
      <section className="mx-auto flex min-h-screen max-w-7xl items-center px-8 lg:px-16">
        <div className="w-full max-w-2xl">
          <span className="loc-eyebrow text-xs sm:text-sm">{COPY.eyebrow}</span>

          <h1 className="loc-heading mt-4 text-5xl leading-[0.95] sm:text-6xl">
            Welcome <span className="text-loc-green">Back</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-loc-muted">{subtitle}</p>

          <form
            onSubmit={onSubmit}
            className="loc-card mt-10 p-8 sm:p-10"
          >
            <div className="space-y-7">
              {/* --- Default view: identifier + password together --- */}
              {isDefaultLoginView && (
                <>
                  <Input light
                    label="Email or Phone Number"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com or +91XXXXXXXXXX"
                    autoFocus
                    required
                  />
                  <Input light
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={startForgotPassword}
                    disabled={submitting}
                    className="text-sm text-loc-muted underline-offset-4 hover:text-loc-navy hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </>
              )}

              {/* --- OTP request sub-view --- */}
              {step === 'otp-request' && (
                <Input light
                  label="Email or Phone Number"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or +91XXXXXXXXXX"
                  autoFocus
                  required
                />
              )}

              {/* --- OTP verify sub-view --- */}
              {step === 'otp-verify' && (
                <Input light
                  label="6-Digit Code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  required
                />
              )}

              {/* --- Forgot-password request sub-view --- */}
              {step === 'forgot-request' && (
                <Input light
                  label="Email or Phone Number"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or +91XXXXXXXXXX"
                  autoFocus
                  required
                />
              )}

              {/* --- Forgot-password reset sub-view --- */}
              {step === 'forgot-reset' && (
                <>
                  <Input light
                    label="6-Digit Code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    required
                  />
                  <Input light
                    label="New Password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                  />
                  <Input light
                    label="Confirm New Password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                  />
                </>
              )}

              {error && <div className="loc-alert loc-alert-error">{error}</div>}
              {info && <div className="loc-alert loc-alert-success">{info}</div>}

              <button
                type="submit"
                disabled={submitting}
                className="loc-btn group h-14 w-full font-loc-display uppercase tracking-wider disabled:cursor-not-allowed"
              >
                {submitting ? (
                  'Please wait…'
                ) : (
                  <>
                    {
                      {
                        password: 'Login',
                        'otp-request': 'Send OTP',
                        'otp-verify': 'Verify OTP',
                        'forgot-request': 'Send OTP',
                        'forgot-reset': 'Reset Password',
                      }[step]
                    }
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </button>

              {/* --- Resend links (OTP verify / forgot reset only) --- */}
              {(step === 'otp-verify' || step === 'forgot-reset') && (
                <button
                  type="button"
                  onClick={step === 'otp-verify' ? resendCode : resendPasswordReset}
                  disabled={resendCooldown > 0 || submitting}
                  className="w-full text-center text-sm text-loc-muted underline-offset-4 hover:text-loc-navy hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>
              )}

              {/* --- "OR / Login with OTP" divider — default view only --- */}
              {isDefaultLoginView && (
                <>
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-loc-border-soft" />
                    <span className="text-xs font-semibold tracking-[0.2em] text-loc-muted uppercase">Or</span>
                    <div className="h-px flex-1 bg-loc-border-soft" />
                  </div>
                  <button
                    type="button"
                    onClick={startOtpLogin}
                    disabled={submitting}
                    className="loc-btn-outline h-14 w-full font-loc-display uppercase tracking-wider disabled:cursor-not-allowed"
                  >
                    Login with OTP
                  </button>
                </>
              )}

              {/* --- Back links for every sub-view --- */}
              {(step === 'otp-request' || step === 'otp-verify') && (
                <button
                  type="button"
                  onClick={backToPasswordLogin}
                  className="w-full text-center text-sm text-loc-muted underline-offset-4 hover:text-loc-navy hover:underline"
                >
                  Back to Password Login
                </button>
              )}
              {(step === 'forgot-request' || step === 'forgot-reset') && (
                <button
                  type="button"
                  onClick={backToLogin}
                  className="w-full text-center text-sm text-loc-muted underline-offset-4 hover:text-loc-navy hover:underline"
                >
                  Back to Login
                </button>
              )}

              {/* --- Registration entry point — default view only --- */}
              {isDefaultLoginView && (
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-loc-muted">
                  <Link to="/signup" className="font-semibold text-loc-green underline-offset-4 hover:text-loc-green-strong hover:underline">
                    Don't have an account? Register
                  </Link>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-xs text-loc-muted">
                <ShieldCheck className="h-4 w-4 text-loc-green" />
                One secure sign-in for every LOC role.
              </div>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
