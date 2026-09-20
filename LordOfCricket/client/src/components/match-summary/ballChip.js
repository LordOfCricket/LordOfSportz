// Compact cricket ball-chip notation — same convention already established by
// CurrentOverStrip.jsx for the live scorer, applied here to historical
// deliveries. Pure presentation formatting over already-authoritative facts
// (batRuns/illegal/extra/wicket/totalRuns), never a cricket-rule calculation.
export function ballLabel(d) {
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

export function ballClass(d) {
  if (d.wicket) return 'bg-rose-500 text-white'
  if (d.totalRuns === 6) return 'bg-fuchsia-500 text-white'
  if (d.totalRuns === 4) return 'bg-amber-400 text-amber-950'
  if (d.illegal || d.extra) return 'bg-amber-400/30 text-amber-100'
  if (d.voided) return 'bg-white/5 text-slate-500 line-through'
  return 'bg-white/10 text-white'
}
