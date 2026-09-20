// Phase 17 — Team Analytics. Every metric here derives from either the
// innings table's own replay-written cache columns (no replay call needed —
// Part 46) or existing, unmodified Phase 10/15 services
// (publicTeam.service.js#buildTopPerformers, tournamentStandings.service.js).

import { findTeamById } from '../models/team.model.js'
import * as analyticsRepo from '../repositories/analytics.repository.js'
import * as publicTeamService from './publicTeam.service.js'
import * as tournamentStandingsService from './tournamentStandings.service.js'
import { computeBattingFirstVsChasing } from '../domain/analytics/teamSplitAnalytics.js'
import { computeAverageInnings } from '../domain/analytics/teamAverages.js'
import { calculateRunRate } from '../domain/scoring/selectors.js'

const DEFAULT_RECENT = 5
const MAX_RECENT = 20

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function clampRecent(recent) {
  const n = Number.isFinite(recent) ? Math.trunc(recent) : DEFAULT_RECENT
  return Math.max(1, Math.min(n, MAX_RECENT))
}

function wonFor(resultType, winnerTeamId, teamId) {
  if (resultType === 'TIE' || resultType === 'NO_RESULT') return null
  if (winnerTeamId == null) return null
  return winnerTeamId === teamId
}

function resultLetter(resultType, winnerTeamId, teamId) {
  if (resultType === 'NO_RESULT') return 'NR'
  if (resultType === 'TIE') return 'T'
  return winnerTeamId === teamId ? 'W' : 'L'
}

/** Groups the flat innings-row list (2 rows per match) by match_id into one summary row per match. */
function groupByMatch(rows, teamId) {
  const byMatch = new Map()
  for (const row of rows) {
    if (!byMatch.has(row.match_id)) {
      byMatch.set(row.match_id, {
        matchId: row.match_id,
        date: row.match_date,
        ballsPerOver: row.balls_per_over,
        oversPerInnings: row.overs_per_innings,
        opponentTeamId: row.team_a_id === teamId ? row.team_b_id : row.team_a_id,
        opponent: row.team_a_id === teamId ? row.team_b_name : row.team_a_name,
        resultType: row.result_type,
        winnerTeamId: row.winner_team_id,
        own: null,
        opp: null,
      })
    }
    const entry = byMatch.get(row.match_id)
    if (row.batting_team_id === teamId) entry.own = row
    else entry.opp = row
  }
  return [...byMatch.values()].filter((m) => m.own && m.opp) // both innings must exist for a match to count here
}

async function buildTournamentPerformance(teamId) {
  const tournaments = await analyticsRepo.listTournamentsForTeam(teamId)
  const performance = []
  for (const t of tournaments) {
    const standings = await tournamentStandingsService.getTournamentStandings(t.id)
    let row = null
    if (standings?.overall) row = standings.overall.find((r) => r.teamId === teamId) || null
    else if (standings?.groupA || standings?.groupB) {
      row = (standings.groupA || []).find((r) => r.teamId === teamId) || (standings.groupB || []).find((r) => r.teamId === teamId) || null
    }
    performance.push({
      tournamentId: t.id,
      publicTournamentId: t.public_tournament_id,
      name: t.name,
      format: t.format,
      status: t.status,
      isChampion: t.champion_team_id === teamId,
      played: row?.played ?? null,
      won: row?.won ?? null,
      lost: row?.lost ?? null,
      tied: row?.tied ?? null,
      noResult: row?.noResult ?? null,
      points: row?.points ?? null,
    })
  }
  return performance
}

export async function getTeamAnalytics(teamId, { recent = DEFAULT_RECENT } = {}) {
  if (!/^\d+$/.test(String(teamId))) throw notFound('Team not found.')
  const team = await findTeamById(teamId)
  if (!team) throw notFound('Team not found.')

  const recentN = clampRecent(recent)
  const rawRows = await analyticsRepo.listTeamInningsForFinalizedMatches(team.id)
  const matches = groupByMatch(rawRows, team.id) // already newest-first (query is DESC)

  const splitRows = matches.map((m) => ({ battingFirst: m.own.innings_number === 1, won: wonFor(m.resultType, m.winnerTeamId, team.id) }))
  const battingFirstVsChasing = computeBattingFirstVsChasing(splitRows)

  const averageScore = computeAverageInnings(matches.map((m) => m.own.runs))
  const averageConceded = computeAverageInnings(matches.map((m) => m.opp.runs))

  const recentMatches = matches.slice(0, recentN)
  const recentForm = recentMatches.map((m) => ({
    matchId: m.matchId,
    date: m.date,
    opponent: m.opponent,
    opponentTeamId: m.opponentTeamId,
    result: resultLetter(m.resultType, m.winnerTeamId, team.id),
    runsFor: m.own.runs,
    runsAgainst: m.opp.runs,
  }))

  const runRateTrend = recentMatches
    .slice()
    .reverse() // chronological for the chart
    .map((m) => ({
      matchId: m.matchId,
      date: m.date,
      opponent: m.opponent,
      runs: m.own.runs,
      legalBalls: m.own.legal_balls,
      runRate: calculateRunRate(m.own.runs, m.own.legal_balls, m.ballsPerOver),
    }))

  const [topPerformers, tournamentPerformance] = await Promise.all([
    publicTeamService.buildTopPerformers(team.id),
    buildTournamentPerformance(team.id),
  ])

  return {
    team: { id: team.id, name: team.name, shortName: team.short_name, logoUrl: team.logo_url },
    recentMatchesConsidered: recentN,
    recentForm,
    battingFirstVsChasing,
    averageScore,
    averageConceded,
    runRateTrend,
    tournamentPerformance,
    topContributors: topPerformers,
  }
}
