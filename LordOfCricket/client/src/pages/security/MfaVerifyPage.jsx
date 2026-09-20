import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import * as mfaApi from '../../services/mfaApi.js'
import MfaChallenge from '../../components/security/MfaChallenge.jsx'

// Phase 6 — reached only via RequireMfaVerified's redirect (never a login-
// time destination — see docs/MFA.md and roleRedirect.model.js, both
// untouched). Proves an already-enrolled factor to unlock the privileged
// session for this request onward, then returns to wherever the user was
// trying to go.
export default function MfaVerifyPage() {
  const { mfa, verifyMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.from || '/'
  const [hasPasskey, setHasPasskey] = useState(false)

  useEffect(() => {
    if (!mfa.enrolled) return
    mfaApi
      .fetchMfaStatus()
      .then((status) => setHasPasskey((status.passkeys || []).length > 0))
      .catch(() => setHasPasskey(false))
  }, [mfa.enrolled])

  const handleSubmit = async (payload) => {
    await verifyMfa(payload)
    navigate(returnTo, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-[32px] border border-white/15 bg-slate-900/45 p-8 shadow-2xl backdrop-blur-2xl">
        <h1 className="text-2xl font-bold text-white">Verify it's you</h1>
        <p className="mt-2 text-sm text-slate-300">
          This account requires an extra verification step before continuing. Confirm your identity with a
          passkey or authenticator app code.
        </p>

        {!mfa.enrolled ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-amber-300">
              You haven't set up a security method yet. Set one up first to continue.
            </p>
            <Link
              to="/security"
              className="block w-full rounded-2xl bg-gradient-to-r from-green-700 via-green-500 to-lime-500 px-6 py-4 text-center font-semibold text-white shadow-xl shadow-green-900/40 transition-all hover:scale-[1.02] hover:brightness-110"
            >
              Set up Security Settings
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <MfaChallenge getWebauthnOptions={mfaApi.mfaVerifyOptions} onSubmit={handleSubmit} hasPasskey={hasPasskey} />
          </div>
        )}
      </div>
    </div>
  )
}
