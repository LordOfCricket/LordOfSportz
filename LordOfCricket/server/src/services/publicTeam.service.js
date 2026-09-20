// Phase 10 Part 2 — public team ecosystem read model. PostgreSQL (teams,
// players, match_players, matches, innings) -> pure domain (teamRecord.js/
// buildTeamCard.js/teamTopPerformers.js) -> public DTO. No team-statistics
// cache table, no second cricket engine: current squad reuses player.model.js
// unchanged, official record/top-performers reuse the exact same finalized-
// only eligibility rule and per-innings replay Phase 7 already established
// (scoring.service.js#getInningsState, battingStats.js/bowlingStats.js),
// and live/upcoming/recent-match previews reuse Phase 10 Part 1's
// publicMatchService unchanged (just scoped with its new optional teamId
// filter) — never a forked mapper (Part 48).

import { findTeamById } from '../models/team.model.js'
import { findPlayersByTeam } from '../models/player.model.js'
import * as teamRepo from '../repositories/team.repository.js'
import * as statsRepo from '../repositories/statistics.repository.js'
import * as scoringService from './scoring.service.js'
import * as publicMatchService from './publicMatch.service.js'
import { extractBattingPerformance, aggregateBatting } from '../domain/statistics/battingStats.js'
import { extractBowlingPerformance, aggregateBowling } from '../domain/statistics/bowlingStats.js'
import { buildTeamRecord, buildRecentForm } from '../domain/team/teamRecord.js'
import { buildTeamCard } from '../domain/team/buildTeamCard.js'
import { pickTopRunScorer, pickTopWicketTaker } from '../domain/team/teamTopPerformers.js'

const DEFAULT_LIST_LIMIT = 20
const MAX_LIST_LIMIT = 50
const RECENT_FORM_COUNT = 5
const RECENT_MATCHES_LIMIT = 5
const UPCOMING_FIXTURES_LIMIT = 5

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

export async function listPublicTeams({ search, limit, offset } = {}) {
  const clampedLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT))
  const clampedOffset = Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0)
  const { rows, total } = await teamRepo.listPublicTeams({ search: search || null, limit: clampedLimit, offset: clampedOffset })
  return { pagination: { limit: clampedLimit, offset: clampedOffset, total }, items: rows.map(buildTeamCard) }
}

// Explicit public-safe mapping (Part 49) — findPlayersByTeam's raw row
// includes user_id and other internal columns that must never reach a
// public response. Exported (Player Role Audit) so team.controller.js's
// GET /teams/:id/players can reuse the exact same allowlist instead of
// leaking the raw row (it previously did) — same fix, one source of truth.
export function mapPublicSquadPlayer(row) {
  return {
    publicPlayerId: row.public_player_id,
    name: row.name,
    role: row.role,
    battingStyle: row.batting_style,
    bowlingStyle: row.bowling_style,
    photoUrl: row.photo_url,
    jerseyNumber: row.jersey_number,
  }
}

/**
 * All-time top run scorer / wicket taker while representing THIS team
 * (Part 37-41): scoped by match_players.team_id — historical representation
 * — never players.team_id (current team), so a transfer can never rewrite
 * which team gets credit for a past performance. Replays each finalized
 * innings this team appeared in exactly once (cached by innings id), the
 * same N+1-avoidance shape Phase 7's getPlayerCareerStats already uses.
 */
// Exported additively for Phase 17's Team Analytics "Top Contributors" section
// to reuse (Part 23 — "do not create a second player-stat replay path
// unnecessarily"). Behavior is completely unchanged for every existing caller.
export async function buildTopPerformers(teamId) {
  const participation = await teamRepo.listFinalizedMatchParticipationForTeam(teamId)
  if (participation.length === 0) return { topRunScorer: null, topWicketTaker: null }

  const matchIds = [...new Set(participation.map((p) => p.match_id))]
  const inningsRows = await statsRepo.listInningsForMatches(matchIds)
  const inningsByMatch = new Map()
  for (const row of inningsRows) {
    if (!inningsByMatch.has(row.match_id)) inningsByMatch.set(row.match_id, [])
    inningsByMatch.get(row.match_id).push(row)
  }

  const battingByPlayer = new Map()
  const bowlingByPlayer = new Map()
  const stateCache = new Map()

  for (const p of participation) {
    for (const inn of inningsByMatch.get(p.match_id) || []) {
      let result = stateCache.get(inn.id)
      if (result === undefined) {
        result = await scoringService.getInningsState(inn.id)
        stateCache.set(inn.id, result)
      }
      if (!result) continue
      const { state, format } = result
      const player = { publicPlayerId: p.public_player_id, name: p.name }

      const battingPerf = extractBattingPerformance(state, p.match_player_id)
      if (battingPerf) {
        if (!battingByPlayer.has(p.player_id)) battingByPlayer.set(p.player_id, { player, perfs: [] })
        battingByPlayer.get(p.player_id).perfs.push(battingPerf)
      }

      const bowlingPerf = extractBowlingPerformance(state, p.match_player_id, format.ballsPerOver)
      if (bowlingPerf) {
        if (!bowlingByPlayer.has(p.player_id)) bowlingByPlayer.set(p.player_id, { player, perfs: [] })
        bowlingByPlayer.get(p.player_id).perfs.push(bowlingPerf)
      }
    }
  }

  const battingEntries = [...battingByPlayer.values()].map((e) => ({ player: e.player, batting: aggregateBatting(e.perfs) }))
  const bowlingEntries = [...bowlingByPlayer.values()].map((e) => ({ player: e.player, bowling: aggregateBowling(e.perfs) }))

  return { topRunScorer: pickTopRunScorer(battingEntries), topWicketTaker: pickTopWicketTaker(bowlingEntries) }
}

export async function getPublicTeamProfile(teamId) {
  // A non-numeric id must 404, not fall through to a raw SQL type-cast error
  // (Part 59/117).
  if (!/^\d+$/.test(String(teamId))) throw notFound('Team not found.')

  const team = await findTeamById(teamId)
  if (!team) throw notFound('Team not found.')

  const [squadRows, finalizedMatches, live, upcoming, recentMatches, topPerformers] = await Promise.all([
    findPlayersByTeam(team.id),
    teamRepo.listFinalizedMatchesForTeam(team.id),
    publicMatchService.listPublicMatches({ category: 'LIVE', limit: 1, offset: 0, teamId: team.id }),
    publicMatchService.listPublicMatches({ category: 'UPCOMING', limit: UPCOMING_FIXTURES_LIMIT, offset: 0, teamId: team.id }),
    publicMatchService.listPublicMatches({ category: 'RESULTS', limit: RECENT_MATCHES_LIMIT, offset: 0, teamId: team.id }),
    buildTopPerformers(team.id),
  ])

  return {
    team: { id: team.id, name: team.name, shortName: team.short_name, logoUrl: team.logo_url, registeredAt: team.created_at },
    squad: squadRows.map(mapPublicSquadPlayer),
    record: buildTeamRecord(finalizedMatches, team.id),
    recentForm: buildRecentForm(finalizedMatches, team.id, RECENT_FORM_COUNT),
    liveMatch: live.items[0] || null,
    upcomingFixtures: upcoming.items,
    recentMatches: recentMatches.items,
    topPerformers,
  }
}
