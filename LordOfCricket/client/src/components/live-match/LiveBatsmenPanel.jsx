// Strike is marked with text ("*"), never
// color alone. A missing batsman (post-wicket, before the scorer seats a
// replacement) is shown honestly — never a stale or fabricated name.
function BatsmanRow({ figure, isStriker }) {
  if (!figure) {
    return <p className="text-sm text-slate-400">Waiting for next batsman...</p>
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-sm font-semibold text-white">
        {figure.player.name}
        {isStriker && (
          <span className="ml-1 font-bold text-emerald-400" aria-label="on strike">
            *
          </span>
        )}
      </p>
      <p className="shrink-0 text-sm text-slate-300">
        {figure.runs} <span className="text-slate-500">({figure.balls})</span>
        <span className="ml-1.5 text-xs text-slate-500">SR {figure.strikeRate != null ? figure.strikeRate.toFixed(1) : '—'}</span>
      </p>
    </div>
  )
}

export default function LiveBatsmenPanel({ striker, nonStriker }) {
  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Batsmen</p>
      <BatsmanRow figure={striker} isStriker />
      <BatsmanRow figure={nonStriker} isStriker={false} />
    </div>
  )
}
