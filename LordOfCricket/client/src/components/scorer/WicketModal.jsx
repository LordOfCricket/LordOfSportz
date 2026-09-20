import { useState } from 'react'
import { X } from 'lucide-react'
import { DISMISSAL_TYPES } from '../../models/dismissalTypes.js'

export default function WicketModal({ open, onClose, onConfirm, striker, nonStriker, bowlingSquad, isFreeHit }) {
  const [type, setType] = useState(null)
  const [fielderId, setFielderId] = useState(null)
  const [dismissedId, setDismissedId] = useState(striker?.id ?? null)
  const [runsCompleted, setRunsCompleted] = useState(0)

  if (!open) return null

  const allowedTypes = isFreeHit ? DISMISSAL_TYPES.filter((d) => d.id === 'run-out') : DISMISSAL_TYPES
  const canConfirm = type && (type !== 'run-out' || dismissedId)

  const handleConfirm = () => {
    if (!canConfirm) return
    const wicket =
      type === 'run-out'
        ? { type, dismissedMatchPlayerId: dismissedId, fielderMatchPlayerId: fielderId, runsCompleted }
        : { type, fielderMatchPlayerId: type === 'caught' ? fielderId : null }
    onConfirm(wicket)
    setType(null)
    setFielderId(null)
    setRunsCompleted(0)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-emerald-950">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-bold text-white">Wicket</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5 text-emerald-100/60" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Dismissal Type</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {allowedTypes.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setType(d.id)}
              className={`min-h-12 rounded-xl border px-2 text-sm font-semibold ${type === d.id ? 'border-rose-400/60 bg-rose-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {type === 'caught' && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Caught By</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {bowlingSquad.map((mp) => (
                <button
                  key={mp.id}
                  type="button"
                  onClick={() => setFielderId(mp.id)}
                  className={`min-h-12 rounded-xl border px-2 text-left text-sm font-medium ${fielderId === mp.id ? 'border-emerald-400/50 bg-emerald-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}
                >
                  {mp.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {type === 'run-out' && (
          <>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Who Was Dismissed?</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[striker, nonStriker].filter(Boolean).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDismissedId(p.id)}
                    className={`min-h-12 rounded-xl border px-2 text-sm font-medium ${dismissedId === p.id ? 'border-rose-400/50 bg-rose-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Runs Completed</p>
              <div className="mt-2 flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRunsCompleted(n)}
                    className={`h-12 w-12 rounded-xl text-sm font-bold ${runsCompleted === n ? 'bg-emerald-500 text-emerald-950' : 'bg-white/10 text-emerald-100/70'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">Fielder (optional)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {bowlingSquad.map((mp) => (
                  <button
                    key={mp.id}
                    type="button"
                    onClick={() => setFielderId(fielderId === mp.id ? null : mp.id)}
                    className={`min-h-12 rounded-xl border px-2 text-left text-sm font-medium ${fielderId === mp.id ? 'border-emerald-400/50 bg-emerald-500/20 text-white' : 'border-white/10 bg-white/5 text-emerald-100/80'}`}
                  >
                    {mp.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 border-t border-white/10 p-4">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white">
          Cancel
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-bold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm Wicket
        </button>
      </div>
    </div>
  )
}
