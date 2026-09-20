// Phase 17 — Player Analytics. Recent form/batting-trend/bowling-trend are a
// thin chart-ready reshaping of statistics.service.js#getPlayerCareerStats
// (Phase 7, unmodified, untouched) — never a second career-derivation path.
// Only the genuinely NEW metrics (dot-ball %, tournament breakdown) do their
// own bounded replay, scoped to exactly the recent-N matches / one
// tournament's matches being requested — never the player's whole history.

import * as statsRepo from '../repositories/statistics.repository.js'
import * as analyticsRepo from '../repositories/analytics.repository.js'
import * as tournamentRepo from '../repositories/tournament.repository.js'
import * as scoringService from './scoring.service.js'
import * as statisticsService from './statistics.service.js'
import { extractBattingPerformance, aggregateBatting } from '../domain/statistics/battingStats.js'
import { extractBowlingPerformance, aggregateBowling } from '../domain/statistics/bowlingStats.js'
import { countBattingDots, battingDotBallPercentage, computeBoundaryAnalysis } from '../domain/analytics/battingAnalytics.js'
import { bowlingDotBallPercentage } from '../domain/analytics/bowlingAnalytics.js'
import { computeBattingConsistency } from '../domain/analytics/consistency.js'
import { buildDismissalBreakdown } from '../domain/analytics/dismissalBreakdown.js'

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

/** Bounded delivery-level replay of exactly the given (matchId -> matchPlayerId) set — never the whole career. */
async function computeRecentDotBallAnalysis(matchPlayerIdByMatch) {
  const matchIds = [...matchPlayerIdByMatch.keys()]
  const inningsRows = matchIds.length ? await statsRepo.listInningsForMatches(matchIds) : []
  let battingDots = 0
  let ballsFaced = 0
  let bowlingDots = 0
  let legalBalls = 0

  for (const inn of inningsRows) {
    const matchPlayerId = matchPlayerIdByMatch.get(inn.match_id)
    if (!matchPlayerId) continue
    const result = await scoringService.getInningsState(inn.id)
    if (!result) continue
    const { state } = result

    battingDots += countBattingDots(state.deliveries, matchPlayerId)
    const battingPerf = extractBattingPerformance(state, matchPlayerId)
    if (battingPerf) ballsFaced += battingPerf.balls

    const bowlerStat = state.bowlers[matchPlayerId]
    if (bowlerStat) {
      bowlingDots += bowlerStat.dots
      legalBalls += bowlerStat.legalBalls
    }
  }

  return {
    batting: { dots: battingDots, ballsFaced, dotBallPercentage: battingDotBallPercentage(battingDots, ballsFaced) },
    bowling: { dots: bowlingDots, legalBalls, dotBallPercentage: bowlingDotBallPercentage(bowlingDots, legalBalls) },
  }
}

/** Scoped to ONE tournament's finalized matches this player appeared in (Part 16). */
async function buildTournamentBreakdown(playerId, tournamentId) {
  if (!tournamentId) return null
  const tournament = await tournamentRepo.findTournamentById(tournamentId)
  if (!tournament) return null

  const participation = await tournamentRepo.listFinalizedTournamentParticipation(tournamentId)
  const myRows = participation.filter((p) => p.player_id === playerId)
  const matchPlayerIdByMatch = new Map(myRows.map((p) => [p.match_id, p.match_player_id]))
  const matchIds = [...matchPlayerIdByMatch.keys()]
  const inningsRows = matchIds.length ? await statsRepo.listInningsForMatches(matchIds) : []

  const battingPerfs = []
  const bowlingPerfs = []
  for (const inn of inningsRows) {
    const matchPlayerId = matchPlayerIdByMatch.get(inn.match_id)
    if (!matchPlayerId) continue
    const result = await scoringService.getInningsState(inn.id)
    if (!result) continue
    const { state, format } = result
    const bp = extractBattingPerformance(state, matchPlayerId)
    if (bp) battingPerfs.push(bp)
    const bwp = extractBowlingPerformance(state, matchPlayerId, format.ballsPerOver)
    if (bwp) bowlingPerfs.push(bwp)
  }

  return {
    tournamentId: tournament.id,
    publicTournamentId: tournament.public_tournament_id,
    name: tournament.name,
    matches: myRows.length,
    batting: aggregateBatting(battingPerfs),
    bowling: aggregateBowling(bowlingPerfs),
  }
}

export async function getPlayerAnalytics(publicPlayerId, { recent = DEFAULT_RECENT, tournamentId = null } = {}) {
  const playerRow = await statsRepo.findPublicPlayerByPublicId(publicPlayerId)
  if (!playerRow) throw notFound('Player not found.')

  const recentN = clampRecent(recent)
  const stats = await statisticsService.getPlayerCareerStats(playerRow.id, { matchHistoryLimit: recentN })
  const recentItems = stats.matchHistory.items.slice().reverse() // newest-first -> chronological

  const recentForm = recentItems.map((p) => ({
    matchId: p.matchId,
    date: p.date,
    opponent: p.opponent,
    won: p.won,
    batting: p.batting.didBat ? { runs: p.batting.runs, balls: p.batting.balls, strikeRate: p.batting.strikeRate } : null,
    bowling: p.bowling.didBowl ? { wickets: p.bowling.wickets, runsConceded: p.bowling.runs, legalBalls: p.bowling.legalBalls, economy: p.bowling.economy } : null,
  }))

  const battingTrend = recentItems
    .filter((p) => p.batting.didBat)
    .map((p) => ({ matchId: p.matchId, date: p.date, opponent: p.opponent, runs: p.batting.runs, balls: p.batting.balls, strikeRate: p.batting.strikeRate }))

  const bowlingTrend = recentItems
    .filter((p) => p.bowling.didBowl)
    .map((p) => ({
      matchId: p.matchId,
      date: p.date,
      opponent: p.opponent,
      wickets: p.bowling.wickets,
      runsConceded: p.bowling.runs,
      legalBalls: p.bowling.legalBalls,
      economy: p.bowling.economy,
    }))

  const consistency = computeBattingConsistency(recentItems.filter((p) => p.batting.didBat).map((p) => ({ runs: p.batting.runs, notOut: p.batting.notOut })))
  const boundaryAnalysis = computeBoundaryAnalysis({ runs: stats.career.batting.runs, fours: stats.career.batting.fours, sixes: stats.career.batting.sixes })

  // Career vs Recent — the SAME aggregateBatting/aggregateBowling the career
  // stats endpoint uses (one formula, never a second), run over exactly the
  // recent-N finalized innings already loaded above. `stats.career` is the
  // full-career side, unchanged. No trend conclusions ("improving") are
  // computed — just the two comparable figure sets.
  const recentBattingPerfs = recentItems
    .filter((p) => p.batting.didBat)
    .map((p) => ({ runs: p.batting.runs, balls: p.batting.balls, fours: p.batting.fours, sixes: p.batting.sixes, notOut: p.batting.notOut }))
  const recentBowlingPerfs = recentItems
    .filter((p) => p.bowling.didBowl)
    .map((p) => ({ legalBalls: p.bowling.legalBalls, runs: p.bowling.runs, wickets: p.bowling.wickets, maidens: p.bowling.maidens, ballsPerOver: p.bowling.ballsPerOver }))
  const careerVsRecent = {
    recentMatches: recentItems.length,
    career: { matches: stats.career.matches, batting: stats.career.batting, bowling: stats.career.bowling },
    recent: { matches: recentItems.length, batting: aggregateBatting(recentBattingPerfs), bowling: aggregateBowling(recentBowlingPerfs) },
  }

  const participation = await statsRepo.listFinalizedMatchParticipation(playerRow.id)
  const recentMatchIds = new Set(recentItems.map((p) => p.matchId))
  const matchPlayerIdByMatch = new Map(participation.filter((p) => recentMatchIds.has(p.match_id)).map((p) => [p.match_id, p.match_player_id]))
  const dotBallAnalysis = await computeRecentDotBallAnalysis(matchPlayerIdByMatch)

  const allMatchPlayerIds = participation.map((p) => p.match_player_id)
  const dismissalRows = await analyticsRepo.listDismissalsForMatchPlayers(allMatchPlayerIds)
  const dismissalBreakdown = buildDismissalBreakdown(dismissalRows)

  const tournamentBreakdown = await buildTournamentBreakdown(playerRow.id, tournamentId)

  return {
    player: { publicPlayerId: playerRow.public_player_id, name: playerRow.name, role: playerRow.role },
    recentMatchesConsidered: recentN,
    recentForm,
    battingTrend,
    bowlingTrend,
    consistency,
    boundaryAnalysis,
    careerVsRecent,
    dotBallAnalysis,
    dismissalBreakdown,
    tournamentBreakdown,
  }
}
