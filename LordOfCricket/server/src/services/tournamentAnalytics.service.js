// Phase 17 — Tournament Analytics. Reuses tournamentStats.service.js#
// getTournamentStatistics (Phase 15, unmodified — one replay pass, already
// paid for by that service) for top scorer/top wicket taker, and cheap
// SQL-only aggregates (innings cache columns, no replay) for scoring totals.
// "Most fours/most sixes" is deliberately NOT included in V1 — see
// docs/TECHNICAL_DEBT.md: it would require a second full tournament replay
// pass duplicating tournamentStats.service.js's existing work, which
// Part 46/90 both caution against for a metric outside the mandatory set.

import * as tournamentRepo from '../repositories/tournament.repository.js'
import * as analyticsRepo from '../repositories/analytics.repository.js'
import * as tournamentStatsService from './tournamentStats.service.js'

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function average(list) {
  if (list.length === 0) return null
  return list.reduce((s, n) => s + n, 0) / list.length
}

export async function getTournamentAnalytics(publicTournamentId) {
  const tournament = await tournamentRepo.findTournamentByPublicId(publicTournamentId)
  if (!tournament) throw notFound('Tournament not found.')

  const [fixtures, finalizedResults, innings, statistics] = await Promise.all([
    tournamentRepo.listFixturesByTournament(tournament.id),
    tournamentRepo.listFinalizedTournamentFixtureResults(tournament.id),
    analyticsRepo.listFinalizedTournamentInningsDetailed(tournament.id),
    tournamentStatsService.getTournamentStatistics(tournament.id),
  ])

  const runsList = innings.map((i) => i.runs)
  const firstInningsRuns = innings.filter((i) => i.innings_number === 1).map((i) => i.runs)

  return {
    tournament: { publicTournamentId: tournament.public_tournament_id, name: tournament.name, format: tournament.format, status: tournament.status },
    totalFixtures: fixtures.length,
    finalizedMatches: finalizedResults.length,
    totalRuns: runsList.reduce((s, r) => s + r, 0),
    totalWickets: innings.reduce((s, i) => s + i.wickets, 0),
    averageFirstInningsScore: average(firstInningsRuns),
    highestTeamTotal: runsList.length ? Math.max(...runsList) : null,
    lowestTeamTotal: runsList.length ? Math.min(...runsList) : null,
    topRunScorers: statistics.topRunScorers,
    topWicketTakers: statistics.topWicketTakers,
  }
}
