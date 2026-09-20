import LiveBatsmenPanel from './LiveBatsmenPanel.jsx'
import LiveBowlerCard from './LiveBowlerCard.jsx'
import LiveOverStrip from './LiveOverStrip.jsx'
import LiveStatusBar from './LiveStatusBar.jsx'

// The spectator "alive" section: batsmen,
// bowler, this over, chase, innings-break/connection state. Purely
// presentational — polling lives one level up in MatchSummaryPage (
// one poller per page, not one per panel), so this component only renders
// whatever `liveState` it's handed. Every number is server-computed
// (buildLiveMatchState.js); nothing here recalculates cricket facts.

function chaseLine(chase) {
  if (!chase) return null
  const rrr = chase.requiredRunRate != null ? ` · RRR ${chase.requiredRunRate.toFixed(2)}` : ''
  return `Need ${chase.runsNeeded}${chase.ballsRemaining != null ? ` from ${chase.ballsRemaining} balls` : ''}${rrr}`
}

export default function LiveMatchPanel({ liveState, loading, connectionStatus, lastUpdatedAt, refresh }) {
  if (loading && !liveState) {
    return <div className="h-40 animate-pulse rounded-[1.5rem] border border-loc-border bg-loc-mint" role="status" aria-label="Loading live match" />
  }
  if (!liveState || !liveState.currentInnings) return null

  const { currentInnings, match, target } = liveState
  const isActivelyLive = currentInnings.status === 'live'

  return (
    <div className="space-y-3 rounded-[1.5rem] border border-loc-border bg-loc-surface p-5 shadow-sm backdrop-blur-sm sm:p-6">
      {match.isInningsBreak && (
        <div className="rounded-2xl bg-sky-500/10 px-4 py-3 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-sky-300">Innings Break</p>
          <p className="mt-1 text-xs text-sky-100/70">Waiting for the second innings to begin{target ? ` · Target ${target}` : ''}</p>
        </div>
      )}

      {currentInnings.chase && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold text-amber-700">
          Target {target} · {chaseLine(currentInnings.chase)}
        </p>
      )}

      {isActivelyLive && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LiveBatsmenPanel striker={currentInnings.striker} nonStriker={currentInnings.nonStriker} />
            <LiveBowlerCard bowler={currentInnings.bowler} />
          </div>
          <LiveOverStrip title="This Over" deliveries={currentInnings.currentOver} />
        </>
      )}

      <LiveStatusBar connectionStatus={connectionStatus} lastUpdatedAt={lastUpdatedAt} onRefresh={refresh} />
    </div>
  )
}
