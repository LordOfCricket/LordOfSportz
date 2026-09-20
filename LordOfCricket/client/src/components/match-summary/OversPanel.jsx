import { ballLabel, ballClass } from './ballChip.js'

export default function OversPanel({ innings }) {
  if (innings.overs.length === 0) {
    return <p className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-5 text-sm text-loc-faint">No overs bowled yet.</p>
  }

  return (
    <div className="space-y-3">
      {innings.overs.map((over) => (
        <div key={over.over} className="rounded-[1.5rem] border border-loc-border bg-loc-surface p-4 shadow-sm backdrop-blur-sm sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">
              Over {over.over} <span className="text-loc-faint">· {over.bowler?.name}</span>
            </p>
            <p className="text-xs font-semibold text-loc-muted">
              {over.runs} run{over.runs === 1 ? '' : 's'}
              {over.wickets > 0 ? ` · ${over.wickets} wicket${over.wickets === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {over.deliveries.map((d) => (
              <span key={d.id} className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-bold ${ballClass(d)}`}>
                {ballLabel(d)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-right text-xs font-semibold text-loc-green">Score: {over.scoreAfter}</p>
        </div>
      ))}
    </div>
  )
}
