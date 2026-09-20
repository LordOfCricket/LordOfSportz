// Pure display math over server-returned numbers only (target/runs/legalBalls
// all come from the authoritative state) — never a second cricket engine.
function requiredRunRate(runsNeeded, ballsRemaining, ballsPerOver) {
  if (ballsRemaining <= 0) return null
  return (runsNeeded / (ballsRemaining / ballsPerOver)).toFixed(2)
}

export default function ChaseHeader({ state }) {
  const { target, oversPerInnings, ballsPerOver } = state.format
  if (target == null) return null

  const runsNeeded = Math.max(target - state.score.runs, 0)
  const totalLegalBalls = oversPerInnings != null ? oversPerInnings * ballsPerOver : null
  const ballsRemaining = totalLegalBalls != null ? Math.max(totalLegalBalls - state.score.legalBalls, 0) : null
  const rrr = ballsRemaining != null ? requiredRunRate(runsNeeded, ballsRemaining, ballsPerOver) : null

  return (
    <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-5 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Target: {target}</p>
      <p className="mt-1 text-lg font-bold text-white">
        Need {runsNeeded} from {ballsRemaining != null ? `${ballsRemaining} balls` : 'remaining balls'}
      </p>
      {rrr != null && <p className="mt-1 text-sm font-semibold text-amber-200">Required RR: {rrr}</p>}
    </div>
  )
}
