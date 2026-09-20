import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useSecuritySettings } from '../../hooks/useSecuritySettings.js'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import StepUpModal from '../../components/security/StepUpModal.jsx'

// Phase 6 — Security Settings for privileged accounts. Restricted to
// Super Admin/Ground Owner client-side here (a UX nicety only — every
// mutation this page calls is independently, and unconditionally, enforced
// server-side regardless of what this page shows). See docs/MFA.md.
function TotpEnrollmentPanel({ enrollment, onConfirm, onCancel, busy }) {
  const [code, setCode] = useState('')

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-300">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
      <img src={enrollment.qrDataUrl} alt="Authenticator app QR code" className="mx-auto h-40 w-40 rounded-xl bg-white p-2" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(code)
          setCode('')
        }}
        className="space-y-3"
      >
        <Input label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
        <div className="flex gap-3">
          <Button type="submit" disabled={busy || !code} className="flex-1">
            {busy ? 'Confirming…' : 'Confirm'}
          </Button>
          <button type="button" onClick={onCancel} className="rounded-2xl border border-white/15 px-6 text-sm text-slate-300 hover:text-white">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function RecoveryCodesPanel({ codes, onDismiss }) {
  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
      <p className="text-sm font-semibold text-amber-200">
        Save these recovery codes somewhere safe. Each one works once, and they will not be shown again.
      </p>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm text-white">
        {codes.map((code) => (
          <span key={code} className="rounded-lg bg-black/30 px-3 py-2 text-center">
            {code}
          </span>
        ))}
      </div>
      <Button type="button" onClick={onDismiss} className="w-full">
        I've saved these codes
      </Button>
    </div>
  )
}

export default function SecuritySettingsPage() {
  const { user } = useAuth()
  const {
    status,
    loading,
    busy,
    error,
    notice,
    recoveryCodes,
    dismissRecoveryCodes,
    totpEnrollment,
    cancelTotpEnrollment,
    addPasskey,
    removePasskey,
    startTotpEnrollment,
    confirmTotpEnrollment,
    disableTotp,
    regenerateRecoveryCodes,
    disableMfaEntirely,
    stepUpModal,
    submitStepUp,
    cancelStepUp,
  } = useSecuritySettings()

  const isSuperAdmin = user?.role === 'staff' && user?.staff_role === 'super_admin'

  if (loading || !status) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-slate-300">Loading security settings…</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">Security Settings</h1>
      <p className="mt-2 text-sm text-slate-300">
        Manage the passkeys and authenticator app codes that protect this privileged account. See{' '}
        <span className="font-medium text-slate-200">docs/MFA.md</span> for the full policy.
      </p>

      {error && <p className="mt-6 text-sm text-rose-300">{error}</p>}
      {notice && <p className="mt-6 text-sm text-emerald-300">{notice}</p>}

      {recoveryCodes && <RecoveryCodesPanel codes={recoveryCodes} onDismiss={dismissRecoveryCodes} />}

      <section className="mt-8 rounded-[28px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Passkeys</h2>
          <Button type="button" onClick={addPasskey} disabled={busy} className="h-11 px-5 text-sm">
            Add Passkey
          </Button>
        </div>
        {status.passkeys.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No passkeys registered yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {status.passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{pk.deviceName}</p>
                  <p className="text-xs text-slate-400">Added {new Date(pk.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removePasskey(pk.id)}
                  className="text-xs font-medium text-rose-300 hover:text-rose-200 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-[28px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Authenticator App (TOTP)</h2>
          {status.totpEnabled ? (
            <button type="button" disabled={busy} onClick={disableTotp} className="text-xs font-medium text-rose-300 hover:text-rose-200 disabled:opacity-50">
              Disable
            </button>
          ) : (
            !totpEnrollment && (
              <Button type="button" onClick={startTotpEnrollment} disabled={busy} className="h-11 px-5 text-sm">
                Enable
              </Button>
            )
          )}
        </div>
        <p className="mt-2 text-sm text-slate-400">{status.totpEnabled ? 'Enabled as a fallback to your passkeys.' : 'Not enabled.'}</p>
        {totpEnrollment && (
          <TotpEnrollmentPanel enrollment={totpEnrollment} onConfirm={confirmTotpEnrollment} onCancel={cancelTotpEnrollment} busy={busy} />
        )}
      </section>

      <section className="mt-6 rounded-[28px] border border-white/15 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Recovery Codes</h2>
          <Button type="button" onClick={regenerateRecoveryCodes} disabled={busy} className="h-11 px-5 text-sm">
            Regenerate
          </Button>
        </div>
        <p className="mt-2 text-sm text-slate-400">{status.recoveryCodesRemaining} unused code(s) remaining.</p>
      </section>

      {!isSuperAdmin && (
        <section className="mt-6 rounded-[28px] border border-rose-400/20 bg-rose-950/20 p-6">
          <h2 className="text-lg font-bold text-white">Disable MFA</h2>
          <p className="mt-2 text-sm text-slate-400">
            Removes every passkey and authenticator app, and invalidates all recovery codes. You'll be asked to set MFA up
            again the next time you perform a privileged action.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={disableMfaEntirely}
            className="mt-4 rounded-2xl border border-rose-400/40 px-5 py-3 text-sm font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Disable MFA entirely
          </button>
        </section>
      )}
      {isSuperAdmin && (
        <p className="mt-6 text-xs text-slate-500">
          Super Admin MFA cannot be self-disabled — this is a deliberate safety measure. Contact another Super Admin for
          account recovery.
        </p>
      )}

      <StepUpModal pending={stepUpModal} onSubmit={submitStepUp} onCancel={cancelStepUp} />
    </div>
  )
}
