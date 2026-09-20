import { useState } from 'react'
import { Gift } from 'lucide-react'
import { QUICK_INCENTIVE_AMOUNTS } from '../../models/umpireProposal.model.js'

// Uber/Rapido-style "+₹50, +₹100" bonus picker, shared by both entry points
// (RecommendedUmpires' inline Propose action and Browse Umpires' picker
// modal) so the incentive UX never diverges between them. The bonus is
// entirely optional (0 is a valid, plain "please take this slot" offer) and
// is private — only ever shown to the specific umpire it's offered to,
// never surfaced publicly on the match listing.
export default function ProposeUmpireForm({ busy, error, onSubmit, onCancel }) {
  const [amount, setAmount] = useState(0)
  const [customAmount, setCustomAmount] = useState('')
  const [message, setMessage] = useState('')

  const selectQuick = (value) => {
    setAmount(value)
    setCustomAmount('')
  }

  const handleCustomChange = (e) => {
    const value = e.target.value
    setCustomAmount(value)
    const n = Number(value)
    setAmount(Number.isFinite(n) && n >= 0 ? n : 0)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ incentiveAmount: amount, message: message.trim() || undefined })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Gift className="h-3.5 w-3.5 text-emerald-300" />
        Offer a bonus (private, only this umpire sees it)
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectQuick(0)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            amount === 0 && !customAmount ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-white/15 text-slate-300 hover:bg-white/5'
          }`}
        >
          No bonus
        </button>
        {QUICK_INCENTIVE_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => selectQuick(value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              amount === value && !customAmount ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-white/15 text-slate-300 hover:bg-white/5'
            }`}
          >
            +₹{value}
          </button>
        ))}
        <input
          type="number"
          min={0}
          step="1"
          placeholder="Custom ₹"
          value={customAmount}
          onChange={handleCustomChange}
          className="w-24 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white"
        />
      </div>

      <input
        type="text"
        maxLength={280}
        placeholder="Optional message (e.g. Big match, need you there!)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500"
      />

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Sending…' : amount > 0 ? `Send Offer (+₹${amount})` : 'Send Offer'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </form>
  )
}
