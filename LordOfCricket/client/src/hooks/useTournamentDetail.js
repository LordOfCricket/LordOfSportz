import { useCallback, useEffect, useState } from 'react'
import * as api from '../services/tournamentApi.js'
import { useVisibilityAwarePolling } from './useVisibilityAwarePolling.js'

const LIVE_FIXTURES_POLL_MS = 20000

/** The full tournament hub read model — overview/teams/squad/fixtures/
 * standings/statistics loaded together, plus organizer-action wrappers that
 * each refresh afterward. React never computes any of this itself. */
export function useTournamentDetail(publicTournamentId) {
  const [tournament, setTournament] = useState(null)
  const [teams, setTeams] = useState([])
  const [squad, setSquad] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [standings, setStandings] = useState(null)
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const load = useCallback(() => {
    return Promise.all([
      api.fetchTournament(publicTournamentId),
      api.fetchTournamentTeams(publicTournamentId),
      api.fetchTournamentSquad(publicTournamentId),
      api.fetchTournamentFixtures(publicTournamentId),
      api.fetchTournamentStandings(publicTournamentId),
      api.fetchTournamentStatistics(publicTournamentId),
    ])
      .then(([t, tm, sq, fx, st, stats]) => {
        setTournament(t)
        setTeams(tm)
        setSquad(sq)
        setFixtures(fx)
        setStandings(st)
        setStatistics(stats)
        setError(null)
      })
      .catch((err) => setError(err.response?.status === 404 ? 'Tournament not found.' : err.response?.data?.message || "Couldn't load this tournament."))
      .finally(() => setLoading(false))
  }, [publicTournamentId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // While any fixture's match is live, keep JUST the fixtures list fresh so
  // its cards show a moving score — one batched /fixtures request per tick
  // (not per card), on the shared visibility-aware transport (pauses when
  // the tab is hidden). Re-arms when a fixture transitions to/from live.
  const hasLiveFixture = fixtures.some((f) => f.matchStatus === 'live')
  const refetchFixtures = useCallback(
    () => api.fetchTournamentFixtures(publicTournamentId).then((fx) => setFixtures(fx)),
    [publicTournamentId]
  )
  useVisibilityAwarePolling(refetchFixtures, {
    intervalMs: LIVE_FIXTURES_POLL_MS,
    enabled: hasLiveFixture,
    resetKey: `${publicTournamentId}:${hasLiveFixture}`,
  })

  const runAction = useCallback(
    async (fn) => {
      setActionError(null)
      try {
        await fn()
        await load()
      } catch (err) {
        setActionError(err.response?.data?.message || 'That action failed.')
        throw err
      }
    },
    [load]
  )

  return {
    tournament,
    teams,
    squad,
    fixtures,
    standings,
    statistics,
    loading,
    error,
    actionError,
    refresh: load,
    openRegistration: () => runAction(() => api.openRegistration(publicTournamentId)),
    registerTeam: (teamId, groupName) => runAction(() => api.registerTeam(publicTournamentId, teamId, groupName)),
    removeTeam: (teamId) => runAction(() => api.removeTeam(publicTournamentId, teamId)),
    addSquadPlayer: (teamId, playerId) => runAction(() => api.addSquadPlayer(publicTournamentId, teamId, playerId)),
    removeSquadPlayer: (teamId, playerId) => runAction(() => api.removeSquadPlayer(publicTournamentId, teamId, playerId)),
    generateFixtures: () => runAction(() => api.generateFixtures(publicTournamentId)),
    scheduleFixture: (fixtureId, matchDate, venue) => runAction(() => api.scheduleFixture(publicTournamentId, fixtureId, matchDate, venue)),
    resolveFixture: (fixtureId, winnerTeamId) => runAction(() => api.resolveFixture(publicTournamentId, fixtureId, winnerTeamId)),
    completeLeague: () => runAction(() => api.completeLeague(publicTournamentId)),
  }
}
