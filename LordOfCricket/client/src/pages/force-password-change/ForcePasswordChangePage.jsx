import { ShieldAlert, ArrowRight } from 'lucide-react'
import Input from '../../components/ui/Input.jsx'
import { useForcePasswordChange } from '../../hooks/useForcePasswordChange.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — §4. Reached via
// getPostLoginPath (roleRedirect.model.js) whenever force_password_change
// is true; the same visual language as AuthPage.jsx since this is still
// part of the login journey, not the Admin Control Center itself.
export default function ForcePasswordChangePage() {
  const { currentPassword, setCurrentPassword, newPassword, setNewPassword, confirmPassword, setConfirmPassword, error, submitting, submit } =
    useForcePasswordChange()

  return (
    <main className="loc-page font-loc-body">
      <section className="mx-auto flex min-h-screen max-w-2xl items-center px-8">
        <div className="w-full">
          <div className="flex items-center gap-2 text-loc-green">
            <ShieldAlert className="h-5 w-5" />
            <span className="loc-eyebrow text-xs sm:text-sm">Security Requirement</span>
          </div>

          <h1 className="loc-heading mt-4 text-4xl leading-[0.95] sm:text-5xl">
            Set a New <span className="text-loc-green">Password</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-loc-muted">
            For your account's security, you must set a new password before continuing. Your temporary password will no longer work after this.
          </p>

          <form
            onSubmit={submit}
            className="loc-card mt-10 p-8 sm:p-10"
          >
            <div className="space-y-7">
              <Input light
                label="Current Password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your temporary or initial password"
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

              {error && (
                <div className="loc-alert loc-alert-error">{error}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="loc-btn group h-14 w-full font-loc-display uppercase tracking-wider disabled:cursor-not-allowed"
              >
                {submitting ? 'Please wait…' : 'Set New Password'}
                {!submitting && <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
