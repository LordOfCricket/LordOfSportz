import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

// §3 — "reuse existing verification state." When the authenticated user's
// account already has this contact value (the common case: the New Signup
// Flow already required both email and phone verified), this renders a
// plain "✓ Verified" and nothing else — no code is ever sent needlessly.
// Only when `value` is missing does it show an input + send/verify flow,
// reusing the account's own contact-verification OTP endpoints (never the
// signup-flow's own send-code/verify-code, which is scoped to unauthenticated
// signup and would reject an already-registered account).
export default function ContactVerificationBlock({ label, value, verified, draftValue, onDraftChange, onSendCode, onVerifyCode, codeSent, busy, error }) {
  const [code, setCode] = useState('')

  if (verified) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-emerald-100/80">{label}</span>
        <p className="text-sm text-white">{value}</p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Verified
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <span className="block text-sm font-semibold text-emerald-100/80">{label} — not verified yet</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={draftValue}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={codeSent}
          placeholder={label === 'Email' ? 'you@example.com' : '+91XXXXXXXXXX'}
          className="flex-1 rounded-xl border border-emerald-400/20 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-emerald-100/30 focus:border-emerald-400/60 focus:outline-none disabled:opacity-60"
        />
        {!codeSent && (
          <button
            type="button"
            onClick={onSendCode}
            disabled={busy || !draftValue.trim()}
            className="shrink-0 rounded-xl border border-emerald-400/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition-colors hover:border-emerald-400/60 hover:text-white disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send Verification Code'}
          </button>
        )}
      </div>
      {codeSent && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            className="flex-1 rounded-xl border border-emerald-400/20 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-emerald-100/30 focus:border-emerald-400/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onVerifyCode(code)}
            disabled={busy || code.length !== 6}
            className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Verifying…' : `Verify ${label}`}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}
