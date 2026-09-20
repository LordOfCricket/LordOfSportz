import { useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar.jsx'

// All-time team representation, scoped by
// historical match_players.team_id server-side (survives transfers in both
// directions). Never a fake winner when no finalized matches exist.
function PerformerCard({ title, player, statLine, onClick, light }) {
  if (!player) {
    return (
      <div className={`rounded-2xl border border-dashed p-4 text-center ${light ? "border-loc-border bg-loc-mint" : "border-white/10 bg-white/5"}`}>
        <p className={`text-xs font-bold uppercase tracking-wide ${light ? "text-loc-faint" : "text-slate-400"}`}>{title}</p>
        <p className={`mt-3 text-sm ${light ? "text-loc-muted" : "text-slate-300"}`}>No official player statistics yet.</p>
      </div>
    )
  }

  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${light ? "border-loc-border bg-loc-mint hover:bg-loc-surface" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
      <Avatar name={player.name} size="md" />
      <div className="min-w-0">
        <p className={`text-[11px] font-bold uppercase tracking-wide ${light ? "text-loc-faint" : "text-slate-400"}`}>{title}</p>
        <p className={`truncate text-sm font-semibold ${light ? "text-loc-navy" : "text-white"}`}>{player.name}</p>
        <p className={`text-xs ${light ? "text-loc-green" : "text-emerald-300"}`}>{statLine}</p>
      </div>
    </button>
  )
}

export default function TeamTopPerformers({ topPerformers, light = false }) {
  const navigate = useNavigate()
  const { topRunScorer, topWicketTaker } = topPerformers

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <PerformerCard
        light={light}
        title="Top Run Scorer"
        player={topRunScorer?.player}
        statLine={topRunScorer ? `${topRunScorer.runs} Runs` : null}
        onClick={() => navigate(`/players/${topRunScorer.player.publicPlayerId}`)}
      />
      <PerformerCard
        light={light}
        title="Top Wicket Taker"
        player={topWicketTaker?.player}
        statLine={topWicketTaker ? `${topWicketTaker.wickets} Wickets` : null}
        onClick={() => navigate(`/players/${topWicketTaker.player.publicPlayerId}`)}
      />
    </div>
  )
}
