import { Link } from 'react-router-dom'
import { Milestone } from 'lucide-react'

// Year-by-year career summary — comes straight from GET /players/:id/stats
// (or /me/stats): `careerTimeline`, computed server-side from the same
// finalized-match history (see server/src/domain/statistics/careerTimeline.js).
// Teams per year come from the real per-match match_players.team_id snapshot,
// never the player's current team. No invented join/leave dates — a year
// only shows what the match records actually contain.

export default function CareerTimeline({ timeline, onOpenMatch, light = false }) {
  const years = timeline ?? []
  const cardCls = light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'
  const label = light ? 'text-loc-faint' : 'text-slate-400'

  if (years.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center ${cardCls}`}>
        <Milestone className={`h-8 w-8 ${light ? 'text-loc-faint' : 'text-slate-500'}`} />
        <p className={`text-sm ${light ? 'text-loc-muted' : 'text-slate-300'}`}>No career timeline yet — it builds from finalized match history.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {years.map((y) => (
        <div key={y.year} className={`rounded-2xl border p-4 ${cardCls}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className={`text-lg font-bold ${light ? 'text-loc-navy' : 'text-white'}`}>{y.year}</h3>
            <p className={`text-xs font-semibold ${label}`}>
              {y.matches} {y.matches === 1 ? 'match' : 'matches'}
              {y.runs > 0 ? ` · ${y.runs} runs` : ''}
              {y.wickets > 0 ? ` · ${y.wickets} wkts` : ''}
            </p>
          </div>

          {y.teams.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {y.teams.map((t) => {
                const text = `${t.name || t.shortName || `Team ${t.teamId}`} · ${t.matches}`
                const chip = `rounded-full border px-3 py-1 text-xs font-semibold ${
                  light ? 'border-loc-border bg-loc-surface text-loc-muted' : 'border-white/10 bg-white/5 text-slate-200'
                }`
                return t.teamId ? (
                  <Link
                    key={t.teamId}
                    to={`/teams/${t.teamId}`}
                    className={`${chip} transition-colors ${light ? 'hover:text-loc-green' : 'hover:text-emerald-300'}`}
                  >
                    {text}
                  </Link>
                ) : (
                  <span key={`x-${text}`} className={chip}>
                    {text}
                  </span>
                )
              })}
            </div>
          )}

          {y.milestones.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {y.milestones.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => m.matchId && onOpenMatch?.(m.matchId)}
                    disabled={!m.matchId}
                    className={`flex items-center gap-2 text-left text-sm disabled:cursor-default ${
                      light ? 'text-loc-green hover:text-loc-green-strong' : 'text-emerald-200 hover:text-emerald-100'
                    }`}
                  >
                    <Milestone className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {m.title}
                      {m.opponent ? <span className={label}> · vs {m.opponent}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
