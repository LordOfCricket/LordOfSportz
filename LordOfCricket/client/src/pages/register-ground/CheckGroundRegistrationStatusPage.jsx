import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/home/Navbar.jsx'
import BackButton from '../../components/common/BackButton.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { statusLabel } from '../../models/groundRegistration.model.js'
import { fetchMyGroundRegistrations, requestLookupCode, verifyLookupCode } from '../../services/groundRegistrationApi.js'

function RequestCard({ request }) {
  return (
    <Link
      to={`/register-ground/status/${request.publicRequestId}`}
      className="block rounded-xl loc-card p-5 transition-colors hover:border-loc-green"
    >
      <p className="font-semibold text-loc-navy">{request.groundName}</p>
      <p className="mt-1 font-mono text-xs text-loc-faint">Registration ID: {request.publicRequestId}</p>
      <p className="mt-2 text-sm font-semibold text-loc-green">{statusLabel(request.status)}</p>
      <p className="mt-1 text-xs text-loc-faint">Submitted {new Date(request.submittedAt).toLocaleDateString()}</p>
    </Link>
  )
}

// §20/§21 — a logged-in user sees "My Ground Registrations" straight away
// (server-scoped to their own submissions, GET .../mine).
function MyRegistrations() {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMyGroundRegistrations()
      .then(setRequests)
      .catch(() => setError('Unable to load your registrations.'))
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-loc-navy">My Ground Registrations</h1>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {requests === null && !error && <p className="text-loc-muted">Loading…</p>}
      {requests?.length === 0 && <p className="text-loc-muted">You haven't submitted any ground registrations yet.</p>}
      <div className="space-y-3">{requests?.map((r) => <RequestCard key={r.publicRequestId} request={r} />)}</div>
      <Link to="/register-ground/new" className="inline-block text-sm font-semibold text-loc-green underline underline-offset-2 hover:text-loc-green">
        Register another ground
      </Link>
    </div>
  )
}

// §22 — non-logged-in status check, OTP-gated (never expose registrations
// just because someone knows the email/phone).
function LookupByOtp() {
  const [identifier, setIdentifier] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)

  const sendCode = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestLookupCode(identifier.trim())
      setCodeSent(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const requests = await verifyLookupCode(identifier.trim(), code)
      setResults(requests)
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setBusy(false)
    }
  }

  if (results) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-loc-navy">Your Registrations</h1>
        {results.length === 0 ? (
          <p className="text-loc-muted">No registrations found for that contact detail.</p>
        ) : (
          <div className="space-y-3">{results.map((r) => <RequestCard key={r.publicRequestId} request={r} />)}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <span className="loc-eyebrow">Check Registration Status</span>
        <h1 className="mt-2 text-2xl font-bold text-loc-navy">Find your registration</h1>
        <p className="mt-1 text-sm text-loc-muted">Enter the email or phone number you registered with — we'll send a verification code.</p>
      </div>

      <form onSubmit={codeSent ? verify : sendCode} className="space-y-3 rounded-2xl loc-card p-6">
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={codeSent}
          placeholder="you@example.com or +91XXXXXXXXXX"
          className="w-full rounded-xl loc-card px-3 py-2.5 text-sm text-loc-navy placeholder:text-loc-faint focus:border-loc-green focus:outline-none disabled:opacity-60"
        />
        {codeSent && (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            className="w-full rounded-xl loc-card px-3 py-2.5 text-sm text-loc-navy placeholder:text-loc-faint focus:border-loc-green focus:outline-none"
          />
        )}
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={busy || !identifier.trim() || (codeSent && code.length !== 6)}
          className="w-full rounded-full bg-loc-green px-6 py-2.5 text-sm font-bold text-loc-navy transition hover:bg-loc-green-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Please wait…' : codeSent ? 'Check Status' : 'Send Verification Code'}
        </button>
      </form>

      <p className="text-sm text-loc-faint">Already have your Registration ID? Open the status link from your confirmation email or the page you saw after submitting.</p>
    </div>
  )
}

export default function CheckGroundRegistrationStatusPage() {
  const { status: authStatus } = useAuth()

  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative mx-auto flex max-w-2xl flex-col gap-6 px-6 pt-32 pb-20 lg:px-10">
        <BackButton label="Back to LOC" fallback="/register-ground" className="w-fit" />
        {authStatus === 'loading' ? <p className="text-loc-muted">Loading…</p> : authStatus === 'authenticated' ? <MyRegistrations /> : <LookupByOtp />}
      </main>
    </div>
  )
}
