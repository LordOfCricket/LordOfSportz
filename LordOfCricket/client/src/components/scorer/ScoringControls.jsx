import { useState } from 'react'

const RUN_BUTTONS = [0, 1, 2, 3, 4, 5, 6]

export default function ScoringControls({ disabled, onRuns, onWide, onNoBall, onBye, onLegBye, onWicket, onDeadBall }) {
  const [sheet, setSheet] = useState(null) // 'wide' | 'no-ball' | 'bye' | 'leg-bye' | null

  const closeSheet = () => setSheet(null)

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Runs</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {RUN_BUTTONS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onRuns(n)}
            className={`min-h-14 rounded-2xl text-xl font-extrabold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
              n === 4 ? 'bg-amber-400 text-amber-950' : n === 6 ? 'bg-fuchsia-500 text-white' : 'bg-white/10 text-white hover:bg-white/15'
            }`}
          >
            {n === 0 ? '•' : n}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onDeadBall}
          className="min-h-14 rounded-2xl bg-white/5 text-xs font-bold uppercase text-slate-300 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Dead Ball
        </button>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Extras</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled} onClick={() => setSheet('wide')} className="min-h-12 rounded-xl border border-amber-400/30 bg-amber-500/10 text-sm font-bold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">
          Wide
        </button>
        <button type="button" disabled={disabled} onClick={() => setSheet('no-ball')} className="min-h-12 rounded-xl border border-amber-400/30 bg-amber-500/10 text-sm font-bold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">
          No Ball
        </button>
        <button type="button" disabled={disabled} onClick={() => setSheet('bye')} className="min-h-12 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">
          Bye
        </button>
        <button type="button" disabled={disabled} onClick={() => setSheet('leg-bye')} className="min-h-12 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40">
          Leg Bye
        </button>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onWicket}
        className="mt-4 min-h-14 w-full rounded-2xl border border-rose-400/40 bg-rose-500/20 text-base font-extrabold uppercase tracking-wide text-rose-200 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Wicket
      </button>

      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={closeSheet}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-emerald-950 p-5" onClick={(e) => e.stopPropagation()}>
            {sheet === 'wide' && (
              <>
                <p className="text-sm font-semibold text-white">Wide — additional runs</p>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        onWide(n)
                        closeSheet()
                      }}
                      className="min-h-12 rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/20"
                    >
                      +{n}
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === 'no-ball' && (
              <>
                <p className="text-sm font-semibold text-white">No Ball — bat runs</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2, 3, 4, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        onNoBall(n)
                        closeSheet()
                      }}
                      className="min-h-12 rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/20"
                    >
                      +{n} bat
                    </button>
                  ))}
                </div>
              </>
            )}
            {(sheet === 'bye' || sheet === 'leg-bye') && (
              <>
                <p className="text-sm font-semibold text-white">{sheet === 'bye' ? 'Bye' : 'Leg Bye'} — runs</p>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        ;(sheet === 'bye' ? onBye : onLegBye)(n)
                        closeSheet()
                      }}
                      className="min-h-12 rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/20"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" onClick={closeSheet} className="mt-4 w-full rounded-xl bg-white/5 py-2.5 text-sm font-semibold text-slate-300">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
