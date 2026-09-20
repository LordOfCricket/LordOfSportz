// Tournament-scoped statistics (Part 33/48/49/50) — reuses the EXACT same
// replay-derived batting/bowling domain functions career stats/leaderboards
// already trust (Part 68: no second cricket engine). Each innings is
// replayed via scoring.service.js#getInningsState exactly ONCE regardless of
// how many players appeared in it (Part 67 — avoid N+1 replay calls).

import * as repo from '../repositories/tournament.repository.js'
import * as statsRepo from '../repositories/statistics.repository.js'
import * as scoringService from './scoring.service.js'
import { extractBattingPerformance, aggregateBatting } from '../domain/statistics/battingStats.js'
import { extractBowlingPerformance, aggregateBowling } from '../domain/statistics/bowlingStats.js'

const TOP_N = 10

export async function getTournamentStatistics(tournamentId) {
  const participation = await repo.listFinalizedTournamentParticipation(tournamentId)
  const matchIds = [...new Set(participation.map((p) => p.match_id))]
  const inningsRows = matchIds.length ? await statsRepo.listInningsForMatches(matchIds) : []

  const stateCache = new Map()
  for (const inn of inningsRows) {
    const result = await scoringService.getInningsState(inn.id)
    if (result) stateCache.set(inn.id, result)
  }

  const inningsByMatch = new Map()
  for (const row of inningsRows) {
    if (!inningsByMatch.has(row.match_id)) inningsByMatch.set(row.match_id, [])
    inningsByMatch.get(row.match_id).push(row)
  }

  const byPlayer = new Map()
  for (const p of participation) {
    if (!byPlayer.has(p.player_id)) byPlayer.set(p.player_id, { player: { name: p.name, publicPlayerId: p.public_player_id }, rows: [] })
    byPlayer.get(p.player_id).rows.push(p)
  }

  const battingLeaders = []
  const bowlingLeaders = []
  for (const entry of byPlayer.values()) {
    const battingPerfs = []
    const bowlingPerfs = []
    for (const row of entry.rows) {
      for (const inn of inningsByMatch.get(row.match_id) || []) {
        const cached = stateCache.get(inn.id)
        if (!cached) continue
        const { state, format } = cached
        const battingPerf = extractBattingPerformance(state, row.match_player_id)
        if (battingPerf) battingPerfs.push(battingPerf)
        const bowlingPerf = extractBowlingPerformance(state, row.match_player_id, format.ballsPerOver)
        if (bowlingPerf) bowlingPerfs.push(bowlingPerf)
      }
    }
    const batting = aggregateBatting(battingPerfs)
    const bowling = aggregateBowling(bowlingPerfs)
    if (batting.runs > 0) battingLeaders.push({ player: entry.player, runs: batting.runs, average: batting.average, strikeRate: batting.strikeRate, highestScore: batting.highestScore })
    if (bowling.wickets > 0) bowlingLeaders.push({ player: entry.player, wickets: bowling.wickets, average: bowling.average, economy: bowling.economy, bestBowling: bowling.bestBowling })
  }

  battingLeaders.sort((a, b) => b.runs - a.runs)
  bowlingLeaders.sort((a, b) => b.wickets - a.wickets)

  return {
    topRunScorers: battingLeaders.slice(0, TOP_N),
    topWicketTakers: bowlingLeaders.slice(0, TOP_N),
  }
}
