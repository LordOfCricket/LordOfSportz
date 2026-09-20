import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Trophy, CalendarRange, Users2, ListOrdered, ArrowLeft } from 'lucide-react'
import { useTournamentDetail } from '../../hooks/useTournamentDetail.js'
import { useAuth } from '../../hooks/useAuth.js'
import { formatLabel, statusLabel, stageLabel, formatDateRange, formatMatchDateTime, nrrDisplay } from '../../models/tournament.model.js'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import BracketView from '../../components/tournaments/BracketView.jsx'
import OrganizerPanel from '../../components/tournaments/OrganizerPanel.jsx'
import TournamentAnalyticsPanel from '../../components/tournaments/TournamentAnalyticsPanel.jsx'
import ShareButton from '../../components/common/ShareButton.jsx'
import Navbar from '../../components/home/Navbar.jsx'

function BackLink() {
  return (
    <Link
      to="/tournaments"
      className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-loc-muted transition-colors hover:bg-loc-mint hover:text-loc-navy"
    >
      <ArrowLeft className="h-4 w-4" />
      All Tournaments
    </Link>
  )
}

const TABS_BASE = ['Overview', 'Fixtures', 'Results', 'Teams', 'Statistics']

function liveScoreLine(fixture) {
  const ls = fixture.matchStatus === 'live' ? fixture.liveScore : null
  if (!ls || ls.innings.length === 0) return null
  const teamName = (id) =>
    id === fixture.teamA.id ? fixture.teamA.short || fixture.teamA.name : id === fixture.teamB.id ? fixture.teamB.short || fixture.teamB.name : ''
  const parts = ls.innings.map((i) => `${teamName(i.battingTeamId)} ${i.runs}/${i.wickets} (${i.oversLabel})`)
  const chase = ls.chase
    ? `Need ${ls.chase.runsNeeded}${ls.chase.ballsRemaining != null ? ` from ${ls.chase.ballsRemaining}` : ''}${
        ls.chase.requiredRunRate != null ? ` · RRR ${ls.chase.requiredRunRate.toFixed(2)}` : ''
      }`
    : null
  return { text: parts.join('  •  '), chase }
}

function FixtureRow({ fixture }) {
  const hasResult = fixture.matchStatus === 'finalized'
  const live = liveScoreLine(fixture)
  return (
    <div className="flex flex-col gap-2 rounded-xl loc-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-green">{stageLabel(fixture)}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-loc-navy">
          {fixture.teamA.name} vs {fixture.teamB.name}
        </p>
        <p className="mt-0.5 text-xs text-loc-faint">{formatMatchDateTime(fixture.matchDate)}</p>
        {live && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-loc-navy">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            {live.text}
          </p>
        )}
        {live?.chase && <p className="mt-0.5 text-xs font-medium text-amber-700">{live.chase}</p>}
        {hasResult && fixture.resultText && <p className="mt-1 text-xs font-medium text-loc-green">{fixture.resultText}</p>}
        {fixture.awaitingResolution && <p className="mt-1 text-xs font-semibold text-amber-700">Tie-break required</p>}
      </div>
      {fixture.matchId && (
        <Link
          to={`/matches/${fixture.matchId}/summary`}
          className="shrink-0 self-start rounded-full border border-loc-border px-3 py-1.5 text-xs font-semibold text-loc-muted transition-colors hover:bg-loc-mint sm:self-center"
        >
          {hasResult ? 'View Scorecard' : fixture.matchStatus === 'live' ? 'Watch Live' : 'View Match'}
        </Link>
      )}
    </div>
  )
}

function StandingsTable({ rows, title }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="rounded-2xl loc-card p-4">
      {title && <h3 className="mb-3 text-sm font-bold text-loc-navy">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-loc-faint">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Team</th>
              <th className="py-2 pr-2 text-center">P</th>
              <th className="py-2 pr-2 text-center">W</th>
              <th className="py-2 pr-2 text-center">L</th>
              <th className="py-2 pr-2 text-center">T</th>
              <th className="py-2 pr-2 text-center">NR</th>
              <th className="py-2 pr-2 text-center">Pts</th>
              <th className="py-2 pr-2 text-center">NRR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamId} className="border-t border-loc-border text-loc-muted">
                <td className="py-2 pr-2 font-semibold text-loc-faint">{r.position}</td>
                <td className="py-2 pr-2 font-semibold text-loc-navy">
                  <Link to={`/teams/${r.teamId}`} className="hover:text-loc-green">
                    {r.teamName}
                  </Link>
                </td>
                <td className="py-2 pr-2 text-center">{r.played}</td>
                <td className="py-2 pr-2 text-center">{r.won}</td>
                <td className="py-2 pr-2 text-center">{r.lost}</td>
                <td className="py-2 pr-2 text-center">{r.tied}</td>
                <td className="py-2 pr-2 text-center">{r.noResult}</td>
                <td className="py-2 pr-2 text-center font-bold text-loc-green">{r.points}</td>
                <td className="py-2 pr-2 text-center">{nrrDisplay(r.nrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function TournamentPage() {
  const { publicTournamentId } = useParams()
  const { user } = useAuth()
  const detail = useTournamentDetail(publicTournamentId)
  const [tab, setTab] = useState('Overview')

  const { tournament, teams, squad, fixtures, standings, statistics, loading, error } = detail
  const isStaff = user?.role === 'staff'
  const showBracket = tournament && tournament.format !== 'LEAGUE'
  const showStandings = tournament && tournament.format !== 'KNOCKOUT'
  const tabs = [...TABS_BASE.slice(0, 2), ...(showStandings ? ['Standings'] : []), ...(showBracket ? ['Bracket'] : []), ...TABS_BASE.slice(2)]

  if (loading) {
    return (
      <div className="loc-page overflow-x-hidden">
        <Navbar theme="light" />
        <main className="mx-auto max-w-5xl px-4 pt-32 pb-20 text-center text-loc-muted sm:px-6 lg:px-8">
          <p>Loading tournament…</p>
        </main>
      </div>
    )
  }
  if (error || !tournament) {
    return (
      <div className="loc-page overflow-x-hidden">
        <Navbar theme="light" />
        <main className="mx-auto max-w-xl px-4 pt-32 pb-20 sm:px-6 lg:px-8">
          <StatsErrorState light message={error} onRetry={() => window.location.reload()} />
        </main>
      </div>
    )
  }

  const fixturesUpcoming = fixtures.filter((f) => f.matchStatus !== 'finalized')
  const fixturesResults = fixtures.filter((f) => f.matchStatus === 'finalized')

  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="mx-auto max-w-5xl px-4 pt-32 pb-20 text-loc-navy sm:px-6 lg:px-8">
        <BackLink />

        {/* Hero */}
        <div className="mt-4 loc-card rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-loc-green">{formatLabel(tournament.format)}</p>
              <h1 className="mt-1 loc-heading font-loc-display text-3xl sm:text-4xl">{tournament.name}</h1>
              {tournament.description && <p className="mt-2 max-w-xl text-sm text-loc-muted">{tournament.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full loc-card px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-loc-muted">{statusLabel(tournament.status)}</span>
              <ShareButton
                size="sm"
                title={tournament.name}
                text={
                  tournament.status === 'COMPLETED' && tournament.championTeamName
                    ? `${tournament.name} — won by ${tournament.championTeamName} on Lord Of Cricket`
                    : `${tournament.name} on Lord Of Cricket`
                }
                path={`/tournaments/${tournament.publicTournamentId}`}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-loc-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="h-4 w-4 text-loc-faint" />
              {formatDateRange(tournament.startDate, tournament.endDate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users2 className="h-4 w-4 text-loc-faint" />
              {teams.length}/{tournament.maxTeams} teams
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListOrdered className="h-4 w-4 text-loc-faint" />
              {tournament.oversPerInnings} overs
            </span>
          </div>

          {tournament.status === 'COMPLETED' && tournament.championTeamName && (
            <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
              <Trophy className="h-6 w-6 text-amber-700" />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Champion</p>
                <Link to={`/teams/${tournament.championTeamId}`} className="text-lg font-bold text-loc-navy hover:text-amber-700">
                  {tournament.championTeamName}
                </Link>
              </div>
            </div>
          )}
        </div>

        {isStaff && <OrganizerPanel detail={detail} />}

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-1 rounded-full loc-card p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                tab === t ? 'bg-loc-green text-white' : 'text-loc-muted hover:text-loc-navy'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'Overview' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl loc-card p-4">
                <h3 className="text-sm font-bold text-loc-navy">Next Up</h3>
                {fixturesUpcoming.length === 0 && <p className="mt-2 text-sm text-loc-faint">No upcoming fixtures.</p>}
                <div className="mt-3 flex flex-col gap-2">
                  {fixturesUpcoming.slice(0, 3).map((f) => (
                    <FixtureRow key={f.id} fixture={f} />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl loc-card p-4">
                <h3 className="text-sm font-bold text-loc-navy">Recent Results</h3>
                {fixturesResults.length === 0 && <p className="mt-2 text-sm text-loc-faint">No results yet.</p>}
                <div className="mt-3 flex flex-col gap-2">
                  {fixturesResults.slice(-3).reverse().map((f) => (
                    <FixtureRow key={f.id} fixture={f} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'Fixtures' && (
            <div className="flex flex-col gap-2">
              {fixturesUpcoming.length === 0 && <p className="text-sm text-loc-faint">No upcoming fixtures.</p>}
              {fixturesUpcoming.map((f) => (
                <FixtureRow key={f.id} fixture={f} />
              ))}
            </div>
          )}

          {tab === 'Results' && (
            <div className="flex flex-col gap-2">
              {fixturesResults.length === 0 && <p className="text-sm text-loc-faint">No results yet.</p>}
              {fixturesResults.map((f) => (
                <FixtureRow key={f.id} fixture={f} />
              ))}
            </div>
          )}

          {tab === 'Standings' && showStandings && (
            <div className="flex flex-col gap-4">
              {standings?.overall && <StandingsTable rows={standings.overall} />}
              {standings?.groupA && <StandingsTable rows={standings.groupA} title="Group A" />}
              {standings?.groupB && <StandingsTable rows={standings.groupB} title="Group B" />}
              {!standings && <p className="text-sm text-loc-faint">Standings will appear once fixtures are generated.</p>}
            </div>
          )}

          {tab === 'Bracket' && showBracket && <BracketView fixtures={fixtures} />}

          {tab === 'Teams' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {teams.length === 0 && <p className="text-sm text-loc-faint">No teams registered yet.</p>}
              {teams.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl loc-card p-4">
                  <div>
                    <Link to={`/teams/${t.teamId}`} className="font-semibold text-loc-navy hover:text-loc-green">
                      {t.teamName}
                    </Link>
                    {t.groupName && <p className="text-xs text-loc-faint">Group {t.groupName}</p>}
                  </div>
                  <p className="text-xs text-loc-faint">{squad.filter((s) => s.tournamentTeamId === t.id).length} players</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'Statistics' && (
            <div className="space-y-4">
              <TournamentAnalyticsPanel publicTournamentId={publicTournamentId} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl loc-card p-4">
                <h3 className="text-sm font-bold text-loc-navy">Top Run Scorers</h3>
                {(!statistics || statistics.topRunScorers.length === 0) && <p className="mt-2 text-sm text-loc-faint">No batting data yet.</p>}
                <ol className="mt-3 flex flex-col gap-2">
                  {statistics?.topRunScorers.map((p, i) => (
                    <li key={p.player.publicPlayerId} className="flex items-center justify-between text-sm">
                      <span className="text-loc-muted">
                        {i + 1}.{' '}
                        <Link to={`/players/${p.player.publicPlayerId}`} className="font-semibold hover:text-loc-green">
                          {p.player.name}
                        </Link>
                      </span>
                      <span className="font-bold text-loc-green">{p.runs} runs</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-2xl loc-card p-4">
                <h3 className="text-sm font-bold text-loc-navy">Top Wicket Takers</h3>
                {(!statistics || statistics.topWicketTakers.length === 0) && <p className="mt-2 text-sm text-loc-faint">No bowling data yet.</p>}
                <ol className="mt-3 flex flex-col gap-2">
                  {statistics?.topWicketTakers.map((p, i) => (
                    <li key={p.player.publicPlayerId} className="flex items-center justify-between text-sm">
                      <span className="text-loc-muted">
                        {i + 1}.{' '}
                        <Link to={`/players/${p.player.publicPlayerId}`} className="font-semibold hover:text-loc-green">
                          {p.player.name}
                        </Link>
                      </span>
                      <span className="font-bold text-loc-green">{p.wickets} wkts</span>
                    </li>
                  ))}
                </ol>
              </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
