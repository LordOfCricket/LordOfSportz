// Phase 17 — Player vs. Player and Team vs. Team comparison. No composite
// "winner"/score is ever computed (Part 33 — "show side-by-side facts, users
// decide"); this reuses statistics.service.js/team.repository.js/
// domain/team/teamRecord.js and domain/analytics/headToHead.js entirely —
// zero new cricket derivation, purely side-by-side assembly.

import { findTeamById } from '../models/team.model.js'
import * as statsRepo from '../repositories/statistics.repository.js'
import * as teamRepo from '../repositories/team.repository.js'
import * as analyticsRepo from '../repositories/analytics.repository.js'
import * as statisticsService from './statistics.service.js'
import { buildTeamRecord } from '../domain/team/teamRecord.js'
import { computeAverageInnings } from '../domain/analytics/teamAverages.js'
import { computeHeadToHead } from '../domain/analytics/headToHead.js'

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

export async function comparePlayers(publicPlayerIdA, publicPlayerIdB) {
  if (!publicPlayerIdA || !publicPlayerIdB) throw badRequest('Two distinct player ids are required.')
  if (publicPlayerIdA === publicPlayerIdB) throw badRequest('Cannot compare a player to themselves.')

  const [rowA, rowB] = await Promise.all([statsRepo.findPublicPlayerByPublicId(publicPlayerIdA), statsRepo.findPublicPlayerByPublicId(publicPlayerIdB)])
  if (!rowA) throw notFound(`Player not found: ${publicPlayerIdA}`)
  if (!rowB) throw notFound(`Player not found: ${publicPlayerIdB}`)

  const [statsA, statsB] = await Promise.all([
    statisticsService.getPlayerCareerStats(rowA.id, { matchHistoryLimit: 0 }),
    statisticsService.getPlayerCareerStats(rowB.id, { matchHistoryLimit: 0 }),
  ])

  return { playerA: { player: statsA.player, career: statsA.career }, playerB: { player: statsB.player, career: statsB.career } }
}

function h2hBatting(agg) {
  const runs = agg.bat_runs
  const balls = agg.balls_faced
  const outs = agg.dismissals
  return {
    runs,
    ballsFaced: balls,
    fours: agg.fours,
    sixes: agg.sixes,
    dots: agg.batting_dots,
    dismissals: outs,
    average: outs > 0 ? runs / outs : null,
    strikeRate: balls > 0 ? (runs / balls) * 100 : null,
  }
}

function h2hBowling(agg) {
  const runs = agg.runs_conceded
  const balls = agg.legal_balls
  const wkts = agg.dismissals
  const overs = agg.equivalent_overs
  return {
    runsConceded: runs,
    legalBalls: balls,
    wickets: wkts,
    dots: agg.bowling_dots,
    economy: overs > 0 ? runs / overs : null,
    average: wkts > 0 ? runs / wkts : null,
    strikeRate: wkts > 0 ? balls / wkts : null,
  }
}

/**
 * Player Head-to-Head — real batter-vs-bowler ENCOUNTERS, never career
 * totals. Aggregates ball-by-ball data (deliveries + wickets) from the
 * finalized matches where BOTH players appeared. When they have never shared
 * a finalized match, every figure is 0/null and `matchesPlayed` is 0 — the
 * caller must show an honest "no encounters" state, not fabricate anything.
 */
export async function headToHeadPlayers(publicPlayerIdA, publicPlayerIdB) {
  if (!publicPlayerIdA || !publicPlayerIdB) throw badRequest('Two distinct player ids are required.')
  if (publicPlayerIdA === publicPlayerIdB) throw badRequest('Cannot compute head-to-head for a player against themselves.')

  const [rowA, rowB] = await Promise.all([
    statsRepo.findPublicPlayerByPublicId(publicPlayerIdA),
    statsRepo.findPublicPlayerByPublicId(publicPlayerIdB),
  ])
  if (!rowA) throw notFound(`Player not found: ${publicPlayerIdA}`)
  if (!rowB) throw notFound(`Player not found: ${publicPlayerIdB}`)

  const [sharedRows, aStrikesB, bStrikesA] = await Promise.all([
    analyticsRepo.listSharedFinalizedMatches(rowA.id, rowB.id),
    // A batting vs B bowling
    analyticsRepo.aggregateHeadToHeadDeliveries(rowA.id, rowB.id),
    // B batting vs A bowling
    analyticsRepo.aggregateHeadToHeadDeliveries(rowB.id, rowA.id),
  ])

  const meetings = sharedRows.map((m) => {
    const teamName = (id) => (id === m.team_a_id ? m.team_a_name : id === m.team_b_id ? m.team_b_name : null)
    return {
      matchId: m.match_id,
      date: m.match_date,
      teamAName: m.team_a_name,
      teamBName: m.team_b_name,
      resultType: m.result_type,
      winnerTeamId: m.winner_team_id,
      resultText: m.result,
      playerATeam: teamName(m.player_a_team_id),
      playerBTeam: teamName(m.player_b_team_id),
    }
  })

  return {
    playerA: { publicPlayerId: rowA.public_player_id, name: rowA.name, role: rowA.role },
    playerB: { publicPlayerId: rowB.public_player_id, name: rowB.name, role: rowB.role },
    matchesPlayed: sharedRows.length,
    meetings,
    // "A vs B" = A batting against B's bowling, and A bowling to B.
    aVsB: { batting: h2hBatting(aStrikesB), bowling: h2hBowling(bStrikesA) },
    bVsA: { batting: h2hBatting(bStrikesA), bowling: h2hBowling(aStrikesB) },
  }
}

export async function compareTeams(teamIdA, teamIdB) {
  if (!/^\d+$/.test(String(teamIdA)) || !/^\d+$/.test(String(teamIdB))) throw notFound('Team not found.')
  if (String(teamIdA) === String(teamIdB)) throw badRequest('Cannot compare a team to itself.')

  const [teamA, teamB] = await Promise.all([findTeamById(teamIdA), findTeamById(teamIdB)])
  if (!teamA) throw notFound(`Team not found: ${teamIdA}`)
  if (!teamB) throw notFound(`Team not found: ${teamIdB}`)

  const [matchesA, matchesB, headToHeadRows] = await Promise.all([
    teamRepo.listFinalizedMatchesForTeam(teamA.id),
    teamRepo.listFinalizedMatchesForTeam(teamB.id),
    analyticsRepo.listHeadToHeadMatches(teamA.id, teamB.id),
  ])

  const ownInningsRunsFor = async (teamId) => {
    const rows = await analyticsRepo.listTeamInningsForFinalizedMatches(teamId)
    const own = new Map()
    for (const r of rows) {
      if (r.batting_team_id === teamId) own.set(r.match_id, r.runs)
    }
    return [...own.values()]
  }
  const [runsA, runsB] = await Promise.all([ownInningsRunsFor(teamA.id), ownInningsRunsFor(teamB.id)])

  return {
    teamA: { team: { id: teamA.id, name: teamA.name, shortName: teamA.short_name, logoUrl: teamA.logo_url }, record: buildTeamRecord(matchesA, teamA.id), averageScore: computeAverageInnings(runsA) },
    teamB: { team: { id: teamB.id, name: teamB.name, shortName: teamB.short_name, logoUrl: teamB.logo_url }, record: buildTeamRecord(matchesB, teamB.id), averageScore: computeAverageInnings(runsB) },
    headToHead: computeHeadToHead(headToHeadRows, teamA.id, teamB.id),
  }
}
