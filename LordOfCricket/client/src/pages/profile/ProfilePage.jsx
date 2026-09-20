import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useCareerStats } from '../../hooks/useCareerStats.js'
import { fetchTeam } from '../../services/playerApi.js'
import Avatar from '../../components/ui/Avatar.jsx'
import Button from '../../components/ui/Button.jsx'
import BackButton from '../../components/common/BackButton.jsx'
import { roleLabel, battingStyleLabel, bowlingStyleLabel, statPriorityForRole } from '../../models/player.model.js'
import { StatsLoadingGrid, StatsErrorState, StatsEmptyState } from '../../components/stats/StatsStates.jsx'
import BattingStatsPanel from '../../components/stats/BattingStatsPanel.jsx'
import BowlingStatsPanel from '../../components/stats/BowlingStatsPanel.jsx'
import FieldingStatsPanel from '../../components/stats/FieldingStatsPanel.jsx'
import MatchHistoryPanel from '../../components/stats/MatchHistoryPanel.jsx'
import RecentFormStrip from '../../components/stats/RecentFormStrip.jsx'
import PlayerAchievements from '../../components/player/PlayerAchievements.jsx'
import CareerTimeline from '../../components/player/CareerTimeline.jsx'
import FollowingList from '../../components/player/FollowingList.jsx'

const TABS = ['OVERVIEW', 'BATTING', 'BOWLING', 'FIELDING', 'MATCHES', 'ACHIEVEMENTS', 'TIMELINE', 'FOLLOWING', 'TEAMS']
// Tabs whose content doesn't depend on the career-stats load (their own
// data source), so the stats loading/empty/error gating is skipped for them.
const NON_STATS_TABS = ['TEAMS', 'FOLLOWING']

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value ?? '—'}</p>
    </div>
  )
}

// Batting panel is visually primary unless the player's role says otherwise
// (role changes presentation emphasis, never which stats are true).
function OverviewPanels({ role, matches, batting, bowling }) {
  const primary = statPriorityForRole(role)[0]
  const bowlingFirst = primary === 'wickets' || primary === 'economy'
  const panels = [
    <div key="batting">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Batting</p>
      <BattingStatsPanel matches={matches} batting={batting} />
    </div>,
    <div key="bowling">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Bowling</p>
      <BowlingStatsPanel bowling={bowling} />
    </div>,
  ]
  return <div className="space-y-6">{bowlingFirst ? panels.slice().reverse() : panels}</div>
}

export default function ProfilePage() {
  const { user, player, refreshPlayer } = useAuth()
  const [team, setTeam] = useState(null)
  const [tab, setTab] = useState('OVERVIEW')
  const navigate = useNavigate()
  const { stats, loading, error, noPlayerProfile, retry, loadMoreMatchHistory } = useCareerStats()

  useEffect(() => {
    if (!player) refreshPlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!player?.team_id) return undefined
    let cancelled = false
    fetchTeam(player.team_id)
      .then((fetchedTeam) => {
        if (!cancelled) setTeam(fetchedTeam)
      })
      .catch(() => {
        if (!cancelled) setTeam(null)
      })
    return () => {
      cancelled = true
    }
  }, [player?.team_id])

  const displayTeam = player?.team_id ? team : null

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage: `linear-gradient(rgba(2,6,23,0.78), rgba(2,6,23,0.78)), url('/images/cricket-stadium.jpg')`,
      }}
    >
      <div className="mx-auto max-w-5xl">
        <BackButton label="Back to Dashboard" fallback="/player/dashboard" />

        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-5">
              <Avatar name={user?.name} photoUrl={player?.photo_url} size="lg" />
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">{user?.name}</h1>
                <p className="mt-1 text-sm font-semibold text-emerald-300">{player?.public_player_id || 'No public ID yet'}</p>
                <p className="text-sm text-slate-300">{roleLabel(player?.role) || 'Playing role not set'}</p>
              </div>
            </div>
            <Button className="h-11 px-5 text-sm" onClick={() => navigate('/profile/edit')}>
              Edit Profile
            </Button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Batting Style" value={battingStyleLabel(player?.batting_style)} />
            <Field label="Bowling Style" value={bowlingStyleLabel(player?.bowling_style)} />
            <Field label="Jersey Number" value={player?.jersey_number != null ? `#${player.jersey_number}` : null} />
            <Field label="Team" value={displayTeam?.name} />
          </div>

          {player?.bio && <p className="mt-6 text-sm text-slate-300">{player.bio}</p>}
        </div>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-slate-900/50 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-colors ${
                tab === t ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
          {!NON_STATS_TABS.includes(tab) && loading && <StatsLoadingGrid tiles={tab === 'FIELDING' ? 3 : 8} />}
          {!NON_STATS_TABS.includes(tab) && !loading && noPlayerProfile && (
            <StatsEmptyState label={tab === 'OVERVIEW' ? 'Your career overview' : `Your ${tab.toLowerCase()} statistics`} />
          )}
          {!NON_STATS_TABS.includes(tab) && !loading && !noPlayerProfile && error && <StatsErrorState message={error} onRetry={retry} />}
          {!NON_STATS_TABS.includes(tab) && !loading && !noPlayerProfile && !error && stats && stats.career.matches === 0 && (
            <StatsEmptyState label={tab === 'OVERVIEW' ? 'Your career overview' : `Your ${tab.toLowerCase()} statistics`} />
          )}
          {tab !== 'TEAMS' && !loading && !noPlayerProfile && !error && stats && stats.career.matches > 0 && (
            <>
              {tab === 'OVERVIEW' && (
                <div className="space-y-6">
                  <OverviewPanels role={player?.role} matches={stats.career.matches} batting={stats.career.batting} bowling={stats.career.bowling} />
                  {stats.recentForm.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Recent Form</p>
                      <RecentFormStrip performances={stats.recentForm} onOpenMatch={(matchId) => navigate(`/matches/${matchId}/summary`)} />
                    </div>
                  )}
                </div>
              )}
              {tab === 'BATTING' && <BattingStatsPanel matches={stats.career.matches} batting={stats.career.batting} />}
              {tab === 'BOWLING' && <BowlingStatsPanel bowling={stats.career.bowling} />}
              {tab === 'FIELDING' && <FieldingStatsPanel fielding={stats.career.fielding} />}
              {tab === 'MATCHES' && (
                <MatchHistoryPanel
                  matchHistory={stats.matchHistory}
                  onLoadMore={loadMoreMatchHistory}
                  teamNamesById={Object.fromEntries((stats.teamHistory ?? []).map((t) => [t.teamId, t.shortName || t.name]))}
                />
              )}
              {tab === 'ACHIEVEMENTS' && <PlayerAchievements achievements={stats.achievements} />}
              {tab === 'TIMELINE' && <CareerTimeline timeline={stats.careerTimeline} onOpenMatch={(matchId) => navigate(`/matches/${matchId}/summary`)} />}
            </>
          )}
          {tab === 'FOLLOWING' && <FollowingList />}
          {tab === 'TEAMS' &&
            (displayTeam ? (
              <div className="flex items-center gap-4 rounded-2xl bg-white/5 px-4 py-4">
                {displayTeam.logo_url ? (
                  <img src={displayTeam.logo_url} alt={displayTeam.name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-200">
                    {displayTeam.short_name}
                  </span>
                )}
                <div>
                  <p className="font-semibold text-white">{displayTeam.name}</p>
                  <p className="text-sm text-slate-300">{roleLabel(player?.role) || 'Playing role not set'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-300">You haven't joined a team yet.</p>
            ))}
        </div>
      </div>
    </main>
  )
}
