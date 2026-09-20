import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { fetchPublicPlayerInfo } from '../../services/statisticsApi.js'
import { useCareerStats } from '../../hooks/useCareerStats.js'
import Avatar from '../../components/ui/Avatar.jsx'
import { roleLabel, battingStyleLabel, bowlingStyleLabel, statPriorityForRole } from '../../models/player.model.js'
import { StatsLoadingGrid, StatsErrorState, StatsEmptyState } from '../../components/stats/StatsStates.jsx'
import BattingStatsPanel from '../../components/stats/BattingStatsPanel.jsx'
import BowlingStatsPanel from '../../components/stats/BowlingStatsPanel.jsx'
import FieldingStatsPanel from '../../components/stats/FieldingStatsPanel.jsx'
import MatchHistoryPanel from '../../components/stats/MatchHistoryPanel.jsx'
import RecentFormStrip from '../../components/stats/RecentFormStrip.jsx'
import AIInsightSection from '../../components/ai/AIInsightSection.jsx'
import { fetchPlayerInsight } from '../../services/aiInsightApi.js'
import PlayerAnalyticsSection from '../../components/analytics/PlayerAnalyticsSection.jsx'
import PlayerAchievements from '../../components/player/PlayerAchievements.jsx'
import CareerTimeline from '../../components/player/CareerTimeline.jsx'
import FollowButton from '../../components/common/FollowButton.jsx'
import ShareButton from '../../components/common/ShareButton.jsx'
import BackButton from '../../components/common/BackButton.jsx'

const TABS = ['OVERVIEW', 'BATTING', 'BOWLING', 'FIELDING', 'MATCHES', 'ACHIEVEMENTS', 'TIMELINE', 'ANALYTICS']

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">{label}</p>
      <p className="mt-1 text-sm font-semibold text-loc-navy">{value ?? '—'}</p>
    </div>
  )
}

function OverviewPanels({ role, matches, batting, bowling, light }) {
  const primary = statPriorityForRole(role)[0]
  const bowlingFirst = primary === 'wickets' || primary === 'economy'
  const panels = [
    <div key="batting">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-loc-faint">Batting</p>
      <BattingStatsPanel matches={matches} batting={batting} light={light} />
    </div>,
    <div key="bowling">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-loc-faint">Bowling</p>
      <BowlingStatsPanel bowling={bowling} light={light} />
    </div>,
  ]
  return <div className="space-y-6">{bowlingFirst ? panels.slice().reverse() : panels}</div>
}

/**
 * The PUBLIC cricket profile — distinct from ProfilePage.jsx (the private
 * self-profile, which reads from useAuth() and includes Edit Profile /
 * Settings access). This page only ever fetches the narrow public-safe
 * player projection (GET /players/:publicPlayerId) plus the same official
 * career stats endpoint every player-stats surface uses — never account,
 * canteen, or auth data.
 */
export default function PublicPlayerProfilePage() {
  const { publicPlayerId } = useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [playerLoading, setPlayerLoading] = useState(true)
  const [playerError, setPlayerError] = useState(null)
  const [tab, setTab] = useState('OVERVIEW')
  const { stats, loading, error, retry, loadMoreMatchHistory } = useCareerStats(publicPlayerId)

  useEffect(() => {
    document.title = 'Lord Of Cricket'
  }, [])

  useEffect(() => {
    fetchPublicPlayerInfo(publicPlayerId)
      .then((p) => {
        setPlayer(p)
        setPlayerError(null)
        document.title = `${p.name} — Lord Of Cricket`
      })
      .catch((err) => setPlayerError(err.response?.data?.message || "Couldn't load this player."))
      .finally(() => setPlayerLoading(false))
  }, [publicPlayerId])

  return (
    <main className="loc-page px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <BackButton fallback="/players" />

        {playerLoading && <div className="mt-6"><StatsLoadingGrid tiles={4} light /></div>}
        {!playerLoading && playerError && (
          <div className="mt-6">
            <StatsErrorState message={playerError} onRetry={() => window.location.reload()} light />
          </div>
        )}

        {!playerLoading && !playerError && player && (
          <>
            <div className="mt-6 loc-card p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-5">
                  <Avatar name={player.name} photoUrl={player.photoUrl} size="lg" />
                  <div>
                    <h1 className="loc-heading text-2xl sm:text-3xl">{player.name}</h1>
                    <p className="mt-1 text-sm font-semibold text-loc-green">{player.publicPlayerId}</p>
                    <p className="text-sm text-loc-muted">{roleLabel(player.role) || 'Playing role not set'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <FollowButton type="player" id={publicPlayerId} />
                    <ShareButton
                      size="sm"
                      title={player.name}
                      text={
                        stats && stats.career.matches > 0
                          ? `${player.name} — ${stats.career.batting.runs} career runs on Lord Of Cricket`
                          : `${player.name} on Lord Of Cricket`
                      }
                      path={`/players/${publicPlayerId}`}
                    />
                  </div>
                  <Link
                    to={`/players/head-to-head?p1=${publicPlayerId}`}
                    className="text-xs font-semibold text-loc-green hover:text-loc-green-strong"
                  >
                    Head-to-Head →
                  </Link>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Batting Style" value={battingStyleLabel(player.battingStyle)} />
                <Field label="Bowling Style" value={bowlingStyleLabel(player.bowlingStyle)} />
                <Field label="Jersey Number" value={player.jerseyNumber != null ? `#${player.jerseyNumber}` : null} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">Team</p>
                  {player.team ? (
                    <Link to={`/teams/${player.team.id}`} className="mt-1 block text-sm font-semibold text-loc-green hover:underline">
                      {player.team.name}
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-loc-navy">—</p>
                  )}
                </div>
              </div>

              {player.bio && <p className="mt-6 text-sm text-loc-muted">{player.bio}</p>}
            </div>

            <div className="mt-6 flex gap-1 overflow-x-auto rounded-full border border-loc-border bg-loc-surface p-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-colors ${
                    tab === t ? 'bg-loc-green text-white' : 'text-loc-muted hover:bg-loc-mint'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-6 loc-card p-6">
              {loading && <StatsLoadingGrid tiles={tab === 'FIELDING' ? 3 : 8} light />}
              {!loading && error && <StatsErrorState message={error} onRetry={retry} light />}
              {!loading && !error && stats && stats.career.matches === 0 && (
                <StatsEmptyState light label={tab === 'OVERVIEW' ? `${player.name}'s career overview` : `${player.name}'s ${tab.toLowerCase()} statistics`} />
              )}
              {!loading && !error && stats && stats.career.matches > 0 && (
                <>
                  {tab === 'OVERVIEW' && (
                    <div className="space-y-6">
                      <OverviewPanels role={player.role} matches={stats.career.matches} batting={stats.career.batting} bowling={stats.career.bowling} light />
                      {stats.recentForm.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-loc-faint">Recent Form</p>
                          <RecentFormStrip performances={stats.recentForm} light onOpenMatch={(matchId) => navigate(`/matches/${matchId}/summary`)} />
                        </div>
                      )}
                    </div>
                  )}
                  {tab === 'BATTING' && <BattingStatsPanel matches={stats.career.matches} batting={stats.career.batting} light />}
                  {tab === 'BOWLING' && <BowlingStatsPanel bowling={stats.career.bowling} light />}
                  {tab === 'FIELDING' && <FieldingStatsPanel fielding={stats.career.fielding} light />}
                  {tab === 'MATCHES' && (
                    <MatchHistoryPanel
                      light
                      matchHistory={stats.matchHistory}
                      onLoadMore={loadMoreMatchHistory}
                      teamNamesById={Object.fromEntries((stats.teamHistory ?? []).map((t) => [t.teamId, t.shortName || t.name]))}
                    />
                  )}
                  {tab === 'ACHIEVEMENTS' && <PlayerAchievements achievements={stats.achievements} light />}
                  {tab === 'TIMELINE' && <CareerTimeline timeline={stats.careerTimeline} light onOpenMatch={(matchId) => navigate(`/matches/${matchId}/summary`)} />}
                  {tab === 'ANALYTICS' && <PlayerAnalyticsSection publicPlayerId={publicPlayerId} light />}
                </>
              )}
            </div>

            {/* Bounded, independently-loading; career stats above remain primary. */}
            <div className="mt-6">
              <AIInsightSection title="AI Performance Insight" fetchFn={fetchPlayerInsight} id={publicPlayerId} kind="person" light />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
