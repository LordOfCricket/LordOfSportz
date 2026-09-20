// Phase 9 — professional match summary/scorecard read model. Derives
// everything from the SAME authoritative PostgreSQL history the live scorer
// and Phase 7/8 statistics already trust (scoring.service.js#getInningsState
// reuses the identical replay engine) — no independent scorecard truth, no
// cache table (Phase 9's non-negotiable rule). Bounded to ONE match's rows
// regardless of how many deliveries it has (Part 66): match+teams (1 query),
// match_players+players (1 query), innings list (1 query), then per innings
// getInningsState (format + deliveries + events, ~3 queries) and wagon-wheel
// shots (1 query) — never one query per player/delivery/over.

import { findMatchByIdWithTeams } from '../models/match.model.js'
import { findGroundSummaryById } from '../models/ground.model.js'
import * as scoringService from './scoring.service.js'
import * as matchPlayerRepo from '../repositories/matchPlayer.repository.js'
import * as tournamentRepo from '../repositories/tournament.repository.js'
import { buildInningsSummary } from '../domain/matchSummary/buildInningsSummary.js'

// Phase 23, Workstream B — additive only, same "null for most matches"
// posture as buildTournamentContext below: a legacy/ground-less match
// (ground_id=NULL, U1's own convention) simply gets ground: null, never a
// fabricated placeholder. Exists specifically so Match Briefing can show
// real ground amenities without a second match-detail endpoint.
async function buildGroundContext(match) {
  if (!match.ground_id) return null
  const ground = await findGroundSummaryById(match.ground_id)
  if (!ground) return null
  return { name: ground.name, amenities: ground.amenity_names || [] }
}

// Phase 15 Part 55 — additive only: null for the vast majority of matches
// (never tournament-linked), a small cross-nav pointer when it is. Never
// touches scoring/replay — a plain lookup of the fixture this match belongs to.
async function buildTournamentContext(matchId) {
  const fixture = await tournamentRepo.findFixtureByMatchId(matchId)
  if (!fixture) return null
  const tournament = await tournamentRepo.findTournamentById(fixture.tournament_id)
  if (!tournament) return null
  return { publicTournamentId: tournament.public_tournament_id, name: tournament.name, stage: fixture.stage, groupName: fixture.group_name, round: fixture.round }
}

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function teamSummary(match, prefix) {
  return { id: match[`${prefix}_id`], name: match[`${prefix}_name`], shortName: match[`${prefix}_short`], logoUrl: match[`${prefix}_logo`] }
}

function buildToss(match) {
  if (!match.toss_winner_id || !match.toss_decision) return null
  const winnerName = match.toss_winner_id === match.team_a_id ? match.team_a_name : match.team_b_name
  const decisionText = match.toss_decision === 'bat' ? 'bat' : 'bowl'
  return { winnerTeamId: match.toss_winner_id, decision: match.toss_decision, text: `${winnerName} won the toss and elected to ${decisionText}.` }
}

function buildResult(match) {
  if (!match.result_type) return null
  return { winnerTeamId: match.winner_team_id, resultType: match.result_type, resultMargin: match.result_margin, text: match.result }
}

export async function getMatchSummary(matchId) {
  const match = await findMatchByIdWithTeams(matchId)
  if (!match) throw notFound('Match not found.')

  const matchPlayers = await matchPlayerRepo.listMatchPlayers(matchId)
  const roster = new Map(
    matchPlayers.map((mp) => [
      mp.id,
      { publicPlayerId: mp.public_player_id, name: mp.name, teamId: mp.team_id, isCaptain: mp.is_captain, isWicketkeeper: mp.is_wicketkeeper },
    ])
  )

  const inningsRows = await scoringService.listInningsByMatch(matchId)
  const inningsSummaries = []
  for (const inningsRow of inningsRows) {
    const result = await scoringService.getInningsState(inningsRow.id)
    if (!result) continue
    const shots = await scoringService.listWagonWheelShots(inningsRow.id)
    const shotsByDeliveryId = new Map(shots.map((s) => [String(s.delivery_id), s]))
    const playingXiIds = matchPlayers.filter((mp) => mp.team_id === inningsRow.batting_team_id && mp.is_playing_xi).map((mp) => mp.id)

    inningsSummaries.push(buildInningsSummary({ innings: result.innings, state: result.state, format: result.format, roster, playingXiIds, shotsByDeliveryId }))
  }

  // A match doesn't stay 'live' between innings — 'live' covers both "an
  // innings is being bowled" and "innings 1 finished, innings 2 hasn't
  // started yet." Distinguish the latter from real DB state (never guessed)
  // for Part 41's "Innings Break" badge.
  const isInningsBreak = match.status === 'live' && inningsSummaries.length === 1 && inningsSummaries[0].status !== 'live'

  const playingXi = { teamA: [], teamB: [] }
  for (const mp of matchPlayers) {
    if (!mp.is_playing_xi) continue
    const entry = { player: { publicPlayerId: mp.public_player_id, name: mp.name }, isCaptain: mp.is_captain, isWicketkeeper: mp.is_wicketkeeper }
    if (mp.team_id === match.team_a_id) playingXi.teamA.push(entry)
    else if (mp.team_id === match.team_b_id) playingXi.teamB.push(entry)
  }

  return {
    match: {
      id: match.id,
      status: match.status,
      isInningsBreak,
      isOfficial: match.status === 'finalized',
      awaitingFinalization: match.status === 'completed',
      venue: match.venue,
      matchDate: match.match_date,
      oversPerInnings: match.overs_per_innings,
      ballsPerOver: match.balls_per_over,
    },
    teams: { teamA: teamSummary(match, 'team_a'), teamB: teamSummary(match, 'team_b') },
    toss: buildToss(match),
    result: buildResult(match),
    ground: await buildGroundContext(match),
    innings: inningsSummaries,
    playingXi,
    tournamentContext: await buildTournamentContext(matchId),
  }
}
