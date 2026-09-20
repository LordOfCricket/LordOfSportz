import * as statisticsService from '../services/statistics.service.js'
import { findPlayerByPublicId, findPlayerByUserId } from '../models/player.model.js'

// Round only at the HTTP presentation boundary — the service/domain layers
// keep full precision so nothing gets compounded-rounded across aggregation.
function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

function roundBatting(batting) {
  return { ...batting, average: round2(batting.average), strikeRate: round2(batting.strikeRate) }
}

function roundBowling(bowling) {
  return {
    ...bowling,
    average: round2(bowling.average),
    economy: round2(bowling.economy),
    strikeRate: round2(bowling.strikeRate),
    equivalentOvers: round2(bowling.equivalentOvers),
  }
}

function roundPerformance(perf) {
  return {
    ...perf,
    batting: perf.batting.didBat ? { ...perf.batting, strikeRate: round2(perf.batting.strikeRate) } : perf.batting,
    bowling: perf.bowling.didBowl ? { ...perf.bowling, economy: round2(perf.bowling.economy) } : perf.bowling,
  }
}

function roundTeamHistoryEntry(entry) {
  return { ...entry, record: { ...entry.record, winPercentage: round2(entry.record.winPercentage) } }
}

function serializeStats(stats) {
  return {
    ...stats,
    career: { ...stats.career, batting: roundBatting(stats.career.batting), bowling: roundBowling(stats.career.bowling) },
    recentForm: stats.recentForm.map(roundPerformance),
    matchHistory: { ...stats.matchHistory, items: stats.matchHistory.items.map(roundPerformance) },
    teamHistory: stats.teamHistory.map(roundTeamHistoryEntry),
  }
}

function parsePagination(query) {
  const limit = query.limit !== undefined ? Number(query.limit) : undefined
  const offset = query.offset !== undefined ? Number(query.offset) : undefined
  return {
    matchHistoryLimit: Number.isFinite(limit) ? limit : undefined,
    matchHistoryOffset: Number.isFinite(offset) ? offset : undefined,
  }
}

export async function getPlayerStats(req, res, next) {
  try {
    const player = await findPlayerByPublicId(req.params.publicPlayerId)
    if (!player) return res.status(404).json({ message: 'Player not found.' })
    const stats = await statisticsService.getPlayerCareerStats(player.id, parsePagination(req.query))
    res.json(serializeStats(stats))
  } catch (err) {
    next(err)
  }
}

export async function getMyStats(req, res, next) {
  try {
    const player = await findPlayerByUserId(req.user.id)
    if (!player) return res.status(404).json({ message: 'No player profile is linked to this account yet.' })
    const stats = await statisticsService.getPlayerCareerStats(player.id, parsePagination(req.query))
    res.json(serializeStats(stats))
  } catch (err) {
    next(err)
  }
}

function roundLeaderboardItem(item) {
  return {
    ...item,
    value: typeof item.value === 'number' ? round2(item.value) : item.value,
    secondary: {
      ...item.secondary,
      average: round2(item.secondary?.average),
      strikeRate: round2(item.secondary?.strikeRate),
      economy: round2(item.secondary?.economy),
    },
  }
}

export async function getLeaderboard(req, res, next) {
  try {
    const limit = Number(req.query.limit)
    const offset = Number(req.query.offset)
    const leaderboard = await statisticsService.getLeaderboard(req.params.metric, {
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
      role: req.query.role || null,
      teamId: req.query.teamId ? Number(req.query.teamId) : null,
    })
    res.json({ ...leaderboard, items: leaderboard.items.map(roundLeaderboardItem) })
  } catch (err) {
    next(err)
  }
}

export async function getCricketRecords(req, res, next) {
  try {
    const records = await statisticsService.getCricketRecords()
    res.json(records)
  } catch (err) {
    next(err)
  }
}

export async function searchPlayersHandler(req, res, next) {
  try {
    const limit = Number(req.query.limit)
    const offset = Number(req.query.offset)
    const result = await statisticsService.searchPlayers({
      q: req.query.q || null,
      role: req.query.role || null,
      teamId: req.query.teamId ? Number(req.query.teamId) : null,
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    })
    res.json({
      ...result,
      items: result.items.map((item) => ({
        ...item,
        career: {
          ...item.career,
          batting: { ...item.career.batting, average: round2(item.career.batting.average), strikeRate: round2(item.career.batting.strikeRate) },
          bowling: { ...item.career.bowling, average: round2(item.career.bowling.average), economy: round2(item.career.bowling.economy) },
        },
      })),
    })
  } catch (err) {
    next(err)
  }
}

export async function getPublicPlayerInfo(req, res, next) {
  try {
    const profile = await statisticsService.getPublicPlayerProfile(req.params.publicPlayerId)
    res.json({ player: profile })
  } catch (err) {
    next(err)
  }
}
