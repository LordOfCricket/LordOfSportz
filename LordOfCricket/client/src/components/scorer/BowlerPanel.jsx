function economy(runs, legalBalls, ballsPerOver) {
  if (!legalBalls) return '0.00'
  return (runs / (legalBalls / ballsPerOver)).toFixed(2)
}

export default function BowlerPanel({ state, playersById, pendingBowlerId }) {
  const currentBowlerId = state.bowler ?? pendingBowlerId
  const bowler = playersById.get(currentBowlerId)
  const stat = state.bowlers[currentBowlerId]
  const ballsPerOver = state.format.ballsPerOver

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bowler</p>
      {bowler ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{bowler.name}</span>
          <span className="text-sm text-slate-300">
            {Math.floor((stat?.legalBalls ?? 0) / ballsPerOver)}.{(stat?.legalBalls ?? 0) % ballsPerOver}-{stat?.runs ?? 0}-{stat?.wickets ?? 0} · Econ{' '}
            {economy(stat?.runs ?? 0, stat?.legalBalls ?? 0, ballsPerOver)}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No bowler selected yet.</p>
      )}
    </div>
  )
}
