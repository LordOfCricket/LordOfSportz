import * as playerAnalyticsService from '../services/playerAnalytics.service.js'
import * as teamAnalyticsService from '../services/teamAnalytics.service.js'
import * as matchAnalyticsService from '../services/matchAnalytics.service.js'
import * as tournamentAnalyticsService from '../services/tournamentAnalytics.service.js'
import * as comparisonAnalyticsService from '../services/comparisonAnalytics.service.js'

function parseIntParam(value, fallback) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export async function getPlayerAnalytics(req, res, next) {
  try {
    const recent = parseIntParam(req.query.recent, undefined)
    const tournamentId = req.query.tournamentId != null ? parseIntParam(req.query.tournamentId, null) : null
    const result = await playerAnalyticsService.getPlayerAnalytics(req.params.publicPlayerId, { recent, tournamentId })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getTeamAnalytics(req, res, next) {
  try {
    const recent = parseIntParam(req.query.recent, undefined)
    const result = await teamAnalyticsService.getTeamAnalytics(req.params.id, { recent })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getMatchAnalytics(req, res, next) {
  try {
    const result = await matchAnalyticsService.getMatchAnalytics(req.params.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getTournamentAnalytics(req, res, next) {
  try {
    const result = await tournamentAnalyticsService.getTournamentAnalytics(req.params.publicTournamentId)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function comparePlayers(req, res, next) {
  try {
    const result = await comparisonAnalyticsService.comparePlayers(req.query.p1, req.query.p2)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function playerHeadToHead(req, res, next) {
  try {
    const result = await comparisonAnalyticsService.headToHeadPlayers(req.query.p1, req.query.p2)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function compareTeams(req, res, next) {
  try {
    const result = await comparisonAnalyticsService.compareTeams(req.query.t1, req.query.t2)
    res.json(result)
  } catch (err) {
    next(err)
  }
}
