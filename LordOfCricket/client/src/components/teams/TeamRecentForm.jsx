import { useNavigate } from 'react-router-dom'

// Newest-first W/L/T/NR sequence. Text labels
// carry the meaning, not color alone (accessibility) — color is a secondary
// reinforcement only.
const RESULT_STYLE = {
  W: 'bg-emerald-500/15 text-emerald-300',
  L: 'bg-rose-500/15 text-rose-300',
  T: 'bg-amber-500/15 text-amber-300',
  NR: 'bg-white/10 text-slate-300',
}
const RESULT_STYLE_LIGHT = {
  W: 'bg-loc-mint text-loc-green',
  L: 'bg-red-100 text-red-700',
  T: 'bg-amber-100 text-amber-700',
  NR: 'bg-slate-100 text-slate-600',
}

export default function TeamRecentForm({ recentForm, light = false }) {
  const navigate = useNavigate()

  if (recentForm.length === 0) {
    return <p className={`rounded-2xl border border-dashed px-6 py-6 text-center text-sm ${light ? "border-loc-border bg-loc-mint text-loc-muted" : "border-white/10 bg-white/5 text-slate-300"}`}>No official results yet.</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Recent form, newest first">
      {recentForm.map((f) => (
        <button
          key={f.matchId}
          type="button"
          onClick={() => navigate(`/matches/${f.matchId}/summary`)}
          title={f.result === 'W' ? 'Win' : f.result === 'L' ? 'Loss' : f.result === 'T' ? 'Tie' : 'No Result'}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-105 ${(light ? RESULT_STYLE_LIGHT : RESULT_STYLE)[f.result] || (light ? RESULT_STYLE_LIGHT : RESULT_STYLE).NR}`}
        >
          {f.result}
        </button>
      ))}
    </div>
  )
}
