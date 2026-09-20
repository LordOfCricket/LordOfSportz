import { useState } from 'react'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'

// Phase 6 — shared "prove you hold an enrolled factor" UI, used by both the
// baseline privileged-session verify page and the step-up challenge prompt.
// Never enrolls anything new — see docs/MFA.md. `getWebauthnOptions` is
// injected by the caller since baseline verify and step-up fetch the
// challenge from different endpoints.
export default function MfaChallenge({ getWebauthnOptions, onSubmit, hasPasskey = true }) {
  const [mode, setMode] = useState(null) // null | 'totp' | 'recovery'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const webauthnSupported = typeof window !== 'undefined' && browserSupportsWebAuthn()

  const handlePasskey = async () => {
    setError('')
    setBusy(true)
    try {
      const optionsJSON = await getWebauthnOptions()
      const response = await startAuthentication({ optionsJSON })
      await onSubmit({ method: 'webauthn', response })
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError('Passkey verification was cancelled.')
      } else {
        setError(err.response?.data?.error || err.response?.data?.message || 'Could not verify with that passkey.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCodeSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onSubmit(mode === 'recovery' ? { method: 'recovery', code } : { method: 'totp', code })
      setCode('')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Verification failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-rose-300">{error}</p>}

      {webauthnSupported && hasPasskey && mode === null && (
        <Button type="button" onClick={handlePasskey} disabled={busy} className="w-full">
          {busy ? 'Waiting for your passkey…' : 'Verify with Passkey'}
        </Button>
      )}

      {mode === null && (
        <button
          type="button"
          onClick={() => setMode('totp')}
          className="block w-full text-center text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
        >
          Use an authenticator app code instead
        </button>
      )}

      {(mode === 'totp' || mode === 'recovery') && (
        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <Input
            label={mode === 'recovery' ? 'Recovery code' : '6-digit code'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={mode === 'recovery' ? 'XXXXXXXXXX' : '123456'}
            autoFocus
          />
          <Button type="submit" disabled={busy || !code} className="w-full">
            {busy ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
      )}

      {mode !== 'recovery' && (
        <button
          type="button"
          onClick={() => {
            setMode('recovery')
            setError('')
            setCode('')
          }}
          className="block w-full text-center text-xs text-slate-400 underline-offset-4 hover:text-white hover:underline"
        >
          Lost access? Use a recovery code
        </button>
      )}
      {mode !== null && (
        <button
          type="button"
          onClick={() => {
            setMode(null)
            setError('')
            setCode('')
          }}
          className="block w-full text-center text-xs text-slate-400 underline-offset-4 hover:text-white hover:underline"
        >
          Back
        </button>
      )}
    </div>
  )
}
