function formatOvers(legalBalls, ballsPerOver) {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`
}

export default function ScorerHeader({ match, state }) {
  const battingTeamName = state.innings.battingTeamId === match.team_a_id ? match.team_a_name : match.team_b_name
  const oversLabel = state.format.oversPerInnings ? `${formatOvers(state.score.legalBalls, state.format.ballsPerOver)} / ${state.format.oversPerInnings} Overs` : formatOvers(state.score.legalBalls, state.format.ballsPerOver)

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/60 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
        {match.team_a_name} vs {match.team_b_name} · Innings {state.innings.inningsNumber}
      </p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <p className="text-lg font-bold text-white">{battingTeamName}</p>
          <p className="text-4xl font-extrabold text-white">
            {state.score.runs}/{state.score.wickets}
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-300">{oversLabel}</p>
      </div>
      {state.isFreeHitNext && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-300">
          🔥 Free Hit Next
        </p>
      )}
    </div>
  )
}
