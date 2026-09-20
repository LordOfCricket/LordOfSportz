import { useNavigate } from 'react-router-dom'

function battingLine(batting) {
  if (!batting.didBat) return 'DNB'
  return `${batting.runs} (${batting.balls})${batting.notOut ? '*' : ''}`
}

function bowlingLine(bowling) {
  if (!bowling.didBowl) return 'DNB'
  return `${bowling.wickets}/${bowling.runs}`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function resultBadge(won, light) {
  if (won === true) return { text: 'Won', className: light ? 'bg-loc-mint text-loc-green' : 'bg-emerald-500/15 text-emerald-300' }
  if (won === false) return { text: 'Lost', className: light ? 'bg-red-100 text-red-700' : 'bg-red-500/15 text-red-300' }
  return { text: 'Tied', className: light ? 'bg-slate-100 text-slate-600' : 'bg-slate-500/15 text-slate-300' }
}

export default function MatchHistoryPanel({ matchHistory, onLoadMore, teamNamesById, light = false }) {
  const navigate = useNavigate()
  const label = light ? 'text-loc-faint' : 'text-slate-400'

  if (matchHistory.items.length === 0) {
    return <p className={`text-sm ${light ? 'text-loc-muted' : 'text-slate-300'}`}>No finalized match history yet.</p>
  }

  const showRepresented = teamNamesById && Object.keys(teamNamesById).length > 1

  return (
    <div className="space-y-3">
      {matchHistory.items.map((perf) => {
        const badge = resultBadge(perf.won, light)
        return (
          <button
            type="button"
            key={perf.matchId}
            onClick={() => navigate(`/matches/${perf.matchId}/summary`)}
            className={`flex w-full flex-col gap-2 rounded-2xl px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${
              light ? 'border border-loc-border bg-loc-mint hover:bg-loc-surface' : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <div>
              <p className={`text-xs font-semibold ${label}`}>{formatDate(perf.date)}</p>
              <p className={`text-sm font-semibold ${light ? 'text-loc-navy' : 'text-white'}`}>vs {perf.opponent}</p>
              {showRepresented && perf.teamId != null && teamNamesById[perf.teamId] && (
                <p className={`text-xs ${label}`}>Represented: {teamNamesById[perf.teamId]}</p>
              )}
              <p className={`text-xs ${label}`}>{perf.result || '—'}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge.className}`}>{badge.text}</span>
              <span className={`text-sm font-semibold ${light ? 'text-loc-green' : 'text-emerald-200'}`}>{battingLine(perf.batting)}</span>
              <span className={`text-sm font-semibold ${light ? 'text-sky-700' : 'text-sky-200'}`}>{bowlingLine(perf.bowling)}</span>
            </div>
          </button>
        )
      })}

      {matchHistory.items.length < matchHistory.total && (
        <button
          type="button"
          onClick={onLoadMore}
          className={`w-full rounded-full border py-2 text-xs font-semibold transition-colors ${
            light ? 'border-loc-border text-loc-muted hover:bg-loc-mint' : 'border-white/10 text-slate-300 hover:bg-white/5'
          }`}
        >
          Load more ({matchHistory.items.length} of {matchHistory.total})
        </button>
      )}
    </div>
  )
}
