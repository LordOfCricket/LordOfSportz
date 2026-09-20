function ballLabel(d) {
  if (d.voided) return '×'
  if (d.isDeadBall) return '•DB'
  if (d.wicket) return 'W'
  if (d.illegal?.type === 'wide') return `WD${d.illegal.runs > 1 ? `+${d.illegal.runs - 1}` : ''}`
  if (d.illegal?.type === 'no-ball') return `NB${d.batRuns ? `+${d.batRuns}` : ''}`
  if (d.extra?.type === 'bye') return `${d.extra.runs}B`
  if (d.extra?.type === 'leg-bye') return `${d.extra.runs}LB`
  if (d.totalRuns === 0) return '•'
  return String(d.totalRuns)
}

function ballClass(d) {
  if (d.wicket) return 'bg-rose-500 text-white'
  if (d.totalRuns === 6) return 'bg-fuchsia-500 text-white'
  if (d.totalRuns === 4) return 'bg-amber-400 text-amber-950'
  if (d.illegal || d.extra) return 'bg-amber-400/30 text-amber-100'
  if (d.voided) return 'bg-white/5 text-slate-500 line-through'
  return 'bg-white/10 text-white'
}

export default function CurrentOverStrip({ timeline, currentOverDisplay }) {
  const group = timeline.byOver.find((g) => g.over === currentOverDisplay)
  const deliveries = group?.deliveries || []

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">This Over</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {deliveries.length === 0 && <p className="text-sm text-slate-400">No balls bowled yet.</p>}
        {deliveries.map((d) => (
          <span key={d.id} className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-bold ${ballClass(d)}`}>
            {ballLabel(d)}
          </span>
        ))}
      </div>
    </div>
  )
}
