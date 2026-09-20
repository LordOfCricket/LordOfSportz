import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Trophy, Share2, Check } from 'lucide-react'
import BackButton from '../../components/common/BackButton.jsx'
import { useMatchSummary } from '../../hooks/useMatchSummary.js'
import { useLiveMatch } from '../../hooks/useLiveMatch.js'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import MatchHero from '../../components/match-summary/MatchHero.jsx'
import LiveMatchPanel from '../../components/live-match/LiveMatchPanel.jsx'
import InningsTabs from '../../components/match-summary/InningsTabs.jsx'
import BattingScorecard from '../../components/match-summary/BattingScorecard.jsx'
import BowlingScorecard from '../../components/match-summary/BowlingScorecard.jsx'
import FallOfWicketsPanel from '../../components/match-summary/FallOfWicketsPanel.jsx'
import PartnershipsPanel from '../../components/match-summary/PartnershipsPanel.jsx'
import WagonWheelSection from '../../components/match-summary/WagonWheelSection.jsx'
import OversPanel from '../../components/match-summary/OversPanel.jsx'
import MatchTimelinePanel from '../../components/match-summary/MatchTimelinePanel.jsx'
import MatchInfoPanel from '../../components/match-summary/MatchInfoPanel.jsx'
import CommentaryPanel from '../../components/match-summary/CommentaryPanel.jsx'
import AIInsightSection from '../../components/ai/AIInsightSection.jsx'
import { fetchMatchInsight } from '../../services/aiInsightApi.js'
import MatchAnalyticsPanel from '../../components/match-summary/MatchAnalyticsPanel.jsx'

const TABS = [
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'overs', label: 'Overs' },
  { key: 'commentary', label: 'Commentary' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'info', label: 'Info' },
]

function requiredRunRateLabel(chase) {
  if (!chase) return null
  return `Need ${chase.runsNeeded}${chase.ballsRemaining != null ? ` from ${chase.ballsRemaining} balls` : ''}${
    chase.requiredRunRate != null ? ` (RRR ${chase.requiredRunRate.toFixed(2)})` : ''
  }`
}

export default function MatchSummaryPage() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const [shareCopied, setShareCopied] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const { summary, loading, error, retry, reload } = useMatchSummary(matchId)

  // The ONE live poller for this page. Disabled
  // until `summary` has loaded once (initialStatus known), and self-latches
  // off once the server reports a terminal match status.
  const { liveState, loading: liveLoading, connectionStatus, lastUpdatedAt, refresh: refreshLive } = useLiveMatch(matchId, { initialStatus: summary?.match?.status })

  // When the live poller detects a lifecycle transition the initial summary
  // fetch doesn't know about yet (upcoming -> live, innings break -> second
  // innings, live -> completed), silently refetch the full summary
  // so the static scorecard/Playing XI/result catch up too — no page reload.
  const liveLifecycleSignature = liveState ? `${liveState.match.status}:${liveState.match.isInningsBreak}:${liveState.currentInnings?.number ?? 0}` : null
  const summaryLifecycleSignature = summary ? `${summary.match.status}:${summary.match.isInningsBreak}:${summary.innings.length}` : null
  useEffect(() => {
    if (liveLifecycleSignature && summaryLifecycleSignature && liveLifecycleSignature !== summaryLifecycleSignature) reload()
  }, [liveLifecycleSignature, summaryLifecycleSignature, reload])

  // In-innings freshness: the live poller advances `currentInnings.version`
  // every recorded ball, but the lifecycle signature above only changes at
  // an innings/match boundary — so BattingScorecard / BowlingScorecard /
  // WagonWheelSection / FallOfWicketsPanel / PartnershipsPanel / OversPanel
  // (all fed from `summary.innings`) would stay frozen for the whole innings.
  // Silently reload the summary when the version advances, but at most once
  // per RELOAD_MIN_INTERVAL_MS so a fast over never triggers a burst of
  // /summary fetches. Fires only while the poller has LIVE coverage of an
  // innings the summary already knows about — so it self-stops at an innings
  // break / completion (leaving the lifecycle effect to do that transition).
  const liveInnings = liveState?.currentInnings
  const summaryKnowsLiveInnings = Boolean(summary && liveInnings && summary.innings.some((i) => i.inningsId === liveInnings.id))
  const liveInningsVersionKey =
    liveInnings && liveInnings.status === 'live' && summaryKnowsLiveInnings ? `${liveInnings.id}:${liveInnings.version}` : null
  const lastVersionReloadRef = useRef({ key: null, ts: 0 })
  useEffect(() => {
    if (!liveInningsVersionKey || lastVersionReloadRef.current.key === liveInningsVersionKey) return
    const RELOAD_MIN_INTERVAL_MS = 4000
    const wait = Math.max(0, RELOAD_MIN_INTERVAL_MS - (Date.now() - lastVersionReloadRef.current.ts))
    const timer = setTimeout(() => {
      lastVersionReloadRef.current = { key: liveInningsVersionKey, ts: Date.now() }
      reload()
    }, wait)
    return () => clearTimeout(timer)
  }, [liveInningsVersionKey, reload])

  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'scorecard'

  // Derived directly from the URL + loaded data on every render — no
  // separate state/effect needed (and no synchronous setState-in-effect):
  // default to the latest innings whenever the URL doesn't name a valid one.
  const inningsFromUrl = Number(searchParams.get('innings'))
  const activeInningsId =
    summary && summary.innings.some((i) => i.inningsId === inningsFromUrl) ? inningsFromUrl : summary?.innings[summary.innings.length - 1]?.inningsId ?? null

  const selectTab = (key) => setSearchParams((prev) => ({ ...Object.fromEntries(prev), tab: key }), { replace: true })
  const selectInnings = (id) => setSearchParams((prev) => ({ ...Object.fromEntries(prev), innings: String(id) }), { replace: true })

  // This page's URL is already a stable, public deep link to the match.
  const handleShare = async () => {
    const url = window.location.href
    const title = summary ? `${summary.teams.teamA.name} vs ${summary.teams.teamB.name} — Lord Of Cricket` : 'Lord Of Cricket'
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      }
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }

  if (loading) {
    return (
      <main className="loc-page px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <StatsLoadingGrid tiles={4} light />
        </div>
      </main>
    )
  }

  if (error || !summary) {
    return (
      <main className="loc-page flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <StatsErrorState message={error} onRetry={retry} light />
        <button type="button" onClick={() => navigate('/')} className="text-sm font-semibold text-loc-green hover:text-loc-green-strong">
          Back to Home
        </button>
      </main>
    )
  }

  const activeInnings = summary.innings.find((i) => i.inningsId === activeInningsId) || summary.innings[summary.innings.length - 1] || null

  // Supersedes MatchHero's snapshot score for whichever innings the live
  // poller is currently tracking — one authoritative score display, never
  // two numbers silently drifting apart on the same page.
  const liveScoreForHero = liveState?.currentInnings
    ? { inningsId: liveState.currentInnings.id, runs: liveState.currentInnings.runs, wickets: liveState.currentInnings.wickets, oversLabel: liveState.currentInnings.oversLabel }
    : null
  const liveCoversActiveInnings = Boolean(liveState?.currentInnings && activeInnings && liveState.currentInnings.id === activeInnings.inningsId && liveState.currentInnings.status === 'live')

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-8 text-loc-navy sm:px-6 lg:px-8"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,0.85), rgba(2,6,23,0.85)), url('/images/cricket-stadium.jpg')` }}
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <BackButton fallback="/matches" />
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-full loc-card px-3 py-1.5 text-xs font-semibold text-loc-muted transition-colors hover:bg-loc-mint"
          >
            {shareCopied ? <Check className="h-3.5 w-3.5 text-loc-green" /> : <Share2 className="h-3.5 w-3.5" />}
            {shareCopied ? 'Link copied' : 'Share'}
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Only present for a tournament-linked match; never clutters a normal match. */}
          {summary.tournamentContext && (
            <Link
              to={`/tournaments/${summary.tournamentContext.publicTournamentId}`}
              className="inline-flex items-center gap-2 rounded-full border border-loc-border bg-loc-mint px-4 py-2 text-xs font-semibold text-loc-green transition-colors hover:bg-loc-surface"
            >
              <Trophy className="h-3.5 w-3.5" />
              {summary.tournamentContext.name}
              {summary.tournamentContext.stage && <span className="text-loc-green/70">· {summary.tournamentContext.stage.replace('_', ' ')}</span>}
            </Link>
          )}

          <MatchHero summary={summary} liveScore={liveScoreForHero} />

          {summary.match.status === 'live' && (
            <LiveMatchPanel liveState={liveState} loading={liveLoading} connectionStatus={connectionStatus} lastUpdatedAt={lastUpdatedAt} refresh={refreshLive} />
          )}

          {summary.innings.length === 0 ? (
            <MatchInfoPanel summary={summary} />
          ) : (
            <>
              <InningsTabs summary={summary} activeInningsId={activeInnings?.inningsId} onSelect={selectInnings} />

              {activeInnings?.chase && !liveCoversActiveInnings && (
                <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-500/10 p-4 text-sm font-semibold text-amber-700">
                  Target {activeInnings.target} · {requiredRunRateLabel(activeInnings.chase)}
                </div>
              )}

              <div className="flex gap-1 overflow-x-auto rounded-full border border-loc-border bg-loc-surface p-1">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => selectTab(t.key)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                      tab === t.key ? 'bg-loc-green text-loc-navy' : 'text-loc-muted hover:bg-loc-mint'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeInnings && (
                <div className="space-y-4">
                  {tab === 'scorecard' && (
                    <>
                      <BattingScorecard innings={activeInnings} />
                      <FallOfWicketsPanel innings={activeInnings} />
                      <BowlingScorecard innings={activeInnings} />
                      <PartnershipsPanel innings={activeInnings} />
                      <WagonWheelSection innings={activeInnings} />
                    </>
                  )}
                  {tab === 'overs' && <OversPanel innings={activeInnings} />}
                  {tab === 'commentary' && <CommentaryPanel matchId={matchId} inningsId={activeInnings.inningsId} />}
                  {tab === 'timeline' && <MatchTimelinePanel innings={activeInnings} />}
                  {tab === 'analytics' && <MatchAnalyticsPanel matchId={matchId} teams={summary.teams} />}
                  {tab === 'info' && <MatchInfoPanel summary={summary} />}
                </div>
              )}
            </>
          )}

          {/* Clearly-labeled, independently-loading; never part of the deterministic scorecard above. */}
          <AIInsightSection title="AI Match Insight" fetchFn={fetchMatchInsight} id={matchId} kind="match" light />
        </div>
      </div>
    </main>
  )
}
