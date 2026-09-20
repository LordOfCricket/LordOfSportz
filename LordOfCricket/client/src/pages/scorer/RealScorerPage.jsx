import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, History, Trophy } from 'lucide-react'
import { useRealScorer } from '../../hooks/useRealScorer.js'
import { formatMatchResultLine } from '../../models/matchDiscovery.model.js'
import ScorerHeader from '../../components/scorer/ScorerHeader.jsx'
import ChaseHeader from '../../components/scorer/ChaseHeader.jsx'
import BatsmenPanel from '../../components/scorer/BatsmenPanel.jsx'
import BowlerPanel from '../../components/scorer/BowlerPanel.jsx'
import CurrentOverStrip from '../../components/scorer/CurrentOverStrip.jsx'
import ScoringControls from '../../components/scorer/ScoringControls.jsx'
import WicketModal from '../../components/scorer/WicketModal.jsx'
import NewBatsmanModal from '../../components/scorer/NewBatsmanModal.jsx'
import NewBowlerModal from '../../components/scorer/NewBowlerModal.jsx'
import WagonWheelPanel from '../../components/scorer/WagonWheelPanel.jsx'
import EditScorePanel from '../../components/scorer/EditScorePanel.jsx'

export default function RealScorerPage() {
  const { matchId } = useParams()
  const [searchParams] = useSearchParams()
  const inningsId = searchParams.get('inningsId')
  const openingBowler = searchParams.get('openingBowler')
  const navigate = useNavigate()

  const scorer = useRealScorer(matchId, inningsId, openingBowler)
  const {
    match,
    state,
    timeline,
    wagonWheelShots,
    corrections,
    loading,
    loadError,
    actionError,
    conflictNotice,
    pending,
    pendingBowlerId,
    needsBowlerSelection,
    changeBowler,
    matchPlayers,
    playersById,
  } = scorer

  const [wicketOpen, setWicketOpen] = useState(false)
  const [editScoreOpen, setEditScoreOpen] = useState(false)
  const [pendingShot, setPendingShot] = useState(null)

  // A match that's no longer live (completed/finalized) has nothing for the
  // live scorer to show — the lifecycle hub (match setup page) knows how to
  // route to the right view (innings break / second-innings setup / result).
  useEffect(() => {
    if (match && match.status !== 'live') {
      navigate(`/matches/${matchId}/setup`, { replace: true })
    }
  }, [match, matchId, navigate])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-950 text-white">
        <p className="text-slate-300">Loading match…</p>
      </main>
    )
  }

  if (loadError || !state || !match) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-emerald-950 px-4 text-center text-white">
        <p className="text-rose-300">{loadError || 'Unable to load this innings.'}</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950">
            Retry
          </button>
          <button type="button" onClick={() => navigate('/umpire/dashboard')} className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-white">
            Back to Dashboard
          </button>
        </div>
      </main>
    )
  }

  const bowlingTeamId = state.innings.battingTeamId === match.team_a_id ? match.team_b_id : match.team_a_id
  const battingSquad = matchPlayers.filter((mp) => mp.team_id === state.innings.battingTeamId)
  const bowlingSquad = matchPlayers.filter((mp) => mp.team_id === bowlingTeamId)

  const striker = playersById.get(state.striker)
  const nonStriker = playersById.get(state.nonStriker)

  const inningsFinished = state.isAllOut || state.isOversComplete || state.isTargetChased || state.innings.status !== 'live'
  // The real, authoritative "the WHOLE MATCH — not just this innings — is
  // decided" signal (refreshed on every write, see useRealScorer.js) — an
  // innings-1 break also sets inningsFinished but leaves match.status
  // 'live' (more play still to come), so this is what actually
  // distinguishes "target reached / all out — MATCH WON" from "innings 1
  // is over, set up innings 2".
  const matchDecided = match.status === 'completed' || match.status === 'finalized'
  const matchResultLine = matchDecided
    ? formatMatchResultLine(
        match.result_type ? { resultType: match.result_type, winnerTeamId: match.winner_team_id, text: match.result } : null,
        { id: match.team_a_id, name: match.team_a_name },
        { id: match.team_b_id, name: match.team_b_name },
      )
    : null

  const eligibleBatsmen = battingSquad.filter((mp) => !state.batsmen[mp.id]?.out && mp.id !== state.striker && mp.id !== state.nonStriker)
  const eligibleBowlers = bowlingSquad.filter((mp) => mp.id !== state.bowler)

  const lastCompletedOver = needsBowlerSelection ? timeline.byOver.find((g) => g.over === state.score.overNumber) : null
  const overSummary = lastCompletedOver
    ? {
        over: lastCompletedOver.over,
        runs: lastCompletedOver.deliveries.reduce((sum, d) => sum + d.totalRuns, 0),
        wickets: lastCompletedOver.deliveries.filter((d) => d.wicket).length,
      }
    : null

  const controlsDisabled = pending || inningsFinished || matchDecided || Boolean(state.pendingBatsmanSelection) || needsBowlerSelection

  const withShot = (input) => {
    const result = pendingShot ? { ...input, shot: pendingShot } : input
    setPendingShot(null)
    return result
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-8 text-white sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate('/umpire/dashboard')} className="inline-flex items-center gap-2 text-sm font-medium text-emerald-100/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Exit Scorer
          </button>
          <button
            type="button"
            onClick={() => setEditScoreOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            <History className="h-3.5 w-3.5" /> Edit Score
          </button>
        </div>

        {conflictNotice && <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{conflictNotice}</div>}
        {actionError && <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">{actionError}</div>}
        {matchDecided ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span className="flex items-center gap-2 font-bold">
              <Trophy className="h-5 w-5 text-amber-300" />
              {matchResultLine || 'Match complete.'}
            </span>
            <button
              type="button"
              onClick={() => navigate(`/matches/${matchId}/setup`)}
              className="rounded-full bg-amber-400 px-4 py-2 text-xs font-bold uppercase tracking-wide text-amber-950"
            >
              View Full Scorecard
            </button>
          </div>
        ) : (
          inningsFinished && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <span>
                {state.isTargetChased ? 'Target reached!' : state.isAllOut ? 'All out!' : 'Overs complete!'} This innings has finished.
              </span>
              <button
                type="button"
                onClick={() => navigate(`/matches/${matchId}/setup`)}
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-950"
              >
                Continue
              </button>
            </div>
          )
        )}
        {state.conflicts.length > 0 && (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            ⚠ A historical correction left the lineup in an unresolved state. Open Edit Score to review.
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            <ScorerHeader match={match} state={state} />
            <ChaseHeader state={state} />
            <CurrentOverStrip timeline={timeline} currentOverDisplay={state.score.overNumber + 1} />
            <WagonWheelPanel shots={wagonWheelShots} pendingShot={pendingShot} onSelectShot={setPendingShot} />
          </div>

          <div className="space-y-4">
            <BatsmenPanel state={state} playersById={playersById} />
            <BowlerPanel state={state} playersById={playersById} pendingBowlerId={pendingBowlerId} />
            <p className="text-center text-sm text-slate-400">
              Partnership: {state.partnership.runs} ({state.partnership.balls})
            </p>
            <ScoringControls
              disabled={controlsDisabled}
              onRuns={(n) => scorer.recordDelivery(withShot({ batRuns: n }))}
              onWide={(extra) => scorer.recordDelivery({ illegal: { type: 'wide', runs: 1 + extra } })}
              onNoBall={(batRuns) => scorer.recordDelivery(withShot({ batRuns, illegal: { type: 'no-ball', runs: 1 } }))}
              onBye={(runs) => scorer.recordDelivery({ extra: { type: 'bye', runs } })}
              onLegBye={(runs) => scorer.recordDelivery({ extra: { type: 'leg-bye', runs } })}
              onDeadBall={() => scorer.recordDelivery({ isDeadBall: true })}
              onWicket={() => setWicketOpen(true)}
            />
          </div>
        </div>
      </div>

      <WicketModal
        open={wicketOpen}
        onClose={() => setWicketOpen(false)}
        striker={striker}
        nonStriker={nonStriker}
        bowlingSquad={bowlingSquad}
        isFreeHit={state.isFreeHitNext}
        onConfirm={(wicket) => {
          setWicketOpen(false)
          const batRuns = wicket.type === 'run-out' ? wicket.runsCompleted || 0 : 0
          scorer.recordDelivery(withShot({ batRuns, wicket }))
        }}
      />

      <NewBatsmanModal
        open={Boolean(state.pendingBatsmanSelection) && !state.isAllOut}
        end={state.pendingBatsmanSelection}
        eligiblePlayers={eligibleBatsmen}
        onSelect={(id) => scorer.selectNextBatsman(state.pendingBatsmanSelection, id)}
      />

      <NewBowlerModal open={needsBowlerSelection && !inningsFinished} overSummary={overSummary} eligiblePlayers={eligibleBowlers} onSelect={changeBowler} />

      {editScoreOpen && (
        <EditScorePanel
          timeline={timeline}
          corrections={corrections}
          playersById={playersById}
          bowlingSquad={bowlingSquad}
          previewCorrection={scorer.previewCorrection}
          onApplyCorrection={(targetId, patch, reasonCode, note) => scorer.applyCorrection('delivery', targetId, patch, reasonCode, note)}
          onUndoCorrection={(correctionId) => scorer.undoCorrection(correctionId)}
          onClose={() => setEditScoreOpen(false)}
        />
      )}
    </main>
  )
}
