// "Last 5 matches" strip. DNB and "did not bowl" are shown as literal DNB
// text, never collapsed into a fake 0-run innings or a 0-wicket spell — the
// one explicit rule for recent form.
function battingLabel(batting) {
  if (!batting.didBat) return 'DNB'
  return `${batting.runs}${batting.notOut ? '*' : ''}`
}

function bowlingLabel(bowling) {
  if (!bowling.didBowl) return 'DNB'
  return `${bowling.wickets}/${bowling.runs}`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function RecentFormStrip({ performances, onOpenMatch, light = false }) {
  if (!performances.length) return null

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {performances.map((perf) => (
        <button
          type="button"
          key={perf.matchId}
          onClick={() => onOpenMatch?.(perf.matchId)}
          className={`flex min-w-[9.5rem] shrink-0 flex-col gap-1 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
            light ? 'border-loc-border bg-loc-mint hover:bg-loc-surface' : 'border-white/10 bg-white/5 hover:bg-white/10'
          }`}
        >
          <p className={`truncate text-[11px] font-semibold ${light ? 'text-loc-faint' : 'text-slate-400'}`}>{formatDate(perf.date)}</p>
          <p className={`truncate text-xs ${light ? 'text-loc-muted' : 'text-slate-300'}`}>vs {perf.opponent}</p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                light ? 'bg-loc-mint text-loc-green' : 'bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {battingLabel(perf.batting)}
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                light ? 'bg-sky-100 text-sky-700' : 'bg-sky-500/10 text-sky-300'
              }`}
            >
              {bowlingLabel(perf.bowling)}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
