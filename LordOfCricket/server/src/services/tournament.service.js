// Tournament CRUD, lifecycle, team registration, and squad management.
// Fixture generation/scheduling/progression lives in tournamentFixture.service.js
// (kept separate — this file is "who's in the tournament", that one is
// "what matches result from it").

import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'
import * as repo from '../repositories/tournament.repository.js'
import { findTeamById } from '../models/team.model.js'
import { findPlayerById } from '../models/player.model.js'
import { TournamentError, TOURNAMENT_ERROR_CODES as CODES } from '../domain/tournament/errors.js'

const FORMATS = ['LEAGUE', 'GROUPS_KNOCKOUT', 'KNOCKOUT']
const MAX_SQUAD_SIZE_DEFAULT = 15

function badRequest(message) {
  throw new TournamentError(CODES.VALIDATION_ERROR, message)
}

export async function createTournament({ name, description = null, format, startDate, endDate, oversPerInnings, ballsPerOver = 6, maxTeams, maxSquadSize = MAX_SQUAD_SIZE_DEFAULT, createdBy }) {
  if (!name || !String(name).trim()) badRequest('name is required.')
  if (!FORMATS.includes(format)) badRequest(`format must be one of ${FORMATS.join(', ')}.`)
  if (!startDate || Number.isNaN(new Date(startDate).getTime())) badRequest('startDate must be a valid date.')
  if (!endDate || Number.isNaN(new Date(endDate).getTime())) badRequest('endDate must be a valid date.')
  if (new Date(endDate) < new Date(startDate)) badRequest('endDate cannot be before startDate.')
  if (!Number.isInteger(oversPerInnings) || oversPerInnings <= 0) badRequest('oversPerInnings must be a positive integer.')
  if (!Number.isInteger(ballsPerOver) || ballsPerOver <= 0) badRequest('ballsPerOver must be a positive integer.')
  if (!Number.isInteger(maxTeams) || maxTeams < 2) badRequest('maxTeams must be at least 2.')
  if (!Number.isInteger(maxSquadSize) || maxSquadSize < 2) badRequest('maxSquadSize must be at least 2.')

  return repo.insertTournament(pool, {
    publicTournamentId: generatePublicId('TRN', 6),
    name: String(name).trim(),
    description: description ? String(description).trim() : null,
    format,
    startDate,
    endDate,
    oversPerInnings,
    ballsPerOver,
    maxTeams,
    maxSquadSize,
    createdBy,
  })
}

export async function findTournamentByPublicId(publicTournamentId) {
  const tournament = await repo.findTournamentByPublicId(publicTournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  return tournament
}

export async function listPublicTournaments({ category = null, limit = 20, offset = 0 } = {}) {
  if (category && !['LIVE', 'UPCOMING', 'COMPLETED'].includes(category)) {
    badRequest("category must be one of 'LIVE', 'UPCOMING', 'COMPLETED'.")
  }
  const clampedLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 20, 50))
  const clampedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0)
  const { rows, total } = await repo.listPublicTournaments({ category, limit: clampedLimit, offset: clampedOffset })
  return { pagination: { limit: clampedLimit, offset: clampedOffset, total }, items: rows }
}

/** DRAFT -> REGISTRATION: the one explicit staff action that opens team
 * registration (Part 5 — no frontend-driven lifecycle changes). */
export async function openRegistration(tournamentId) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  if (tournament.status !== 'DRAFT') {
    throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, `Cannot open registration while tournament is '${tournament.status}'.`)
  }
  return repo.updateTournament(tournamentId, { status: 'REGISTRATION' })
}

export async function registerTeam(tournamentId, { teamId, groupName = null }) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  if (tournament.status !== 'REGISTRATION') {
    throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, `Cannot register teams while tournament is '${tournament.status}'.`)
  }
  if (!Number.isInteger(teamId)) badRequest('teamId is required.')
  const team = await findTeamById(teamId)
  if (!team) badRequest('teamId must reference an existing team.')
  if (groupName != null && !['A', 'B'].includes(groupName)) badRequest("groupName must be 'A' or 'B'.")

  const existing = await repo.findTournamentTeam(tournamentId, teamId)
  if (existing) throw new TournamentError(CODES.TEAM_ALREADY_REGISTERED, 'This team is already registered in the tournament.')

  const currentTeams = await repo.listTournamentTeams(tournamentId)
  if (currentTeams.length >= tournament.max_teams) {
    throw new TournamentError(CODES.TOURNAMENT_FULL, `This tournament is limited to ${tournament.max_teams} teams.`)
  }

  return repo.insertTournamentTeam(pool, { tournamentId, teamId, groupName })
}

export async function removeTeam(tournamentId, teamId) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  if (tournament.status !== 'REGISTRATION') {
    throw new TournamentError(CODES.INVALID_TOURNAMENT_STATE, `Cannot remove teams while tournament is '${tournament.status}'.`)
  }
  const existing = await repo.findTournamentTeam(tournamentId, teamId)
  if (!existing) throw new TournamentError(CODES.TEAM_NOT_REGISTERED, 'This team is not registered in the tournament.')
  await repo.removeTournamentTeam(tournamentId, teamId)
}

export async function listTeams(tournamentId) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  return repo.listTournamentTeams(tournamentId)
}

function assertSquadMutable(tournament) {
  if (tournament.status !== 'REGISTRATION') {
    throw new TournamentError(CODES.SQUAD_LOCKED, `Squads can only be edited while a tournament is in 'REGISTRATION' (currently '${tournament.status}').`)
  }
}

export async function addSquadPlayer(tournamentId, { teamId, playerId }) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  assertSquadMutable(tournament)

  const tournamentTeam = await repo.findTournamentTeam(tournamentId, teamId)
  if (!tournamentTeam) throw new TournamentError(CODES.TEAM_NOT_REGISTERED, 'This team is not registered in the tournament.')

  const player = await findPlayerById(playerId)
  if (!player) badRequest('playerId must reference an existing player.')

  const existingForPlayer = await repo.findSquadPlayerByPlayerId(tournamentId, playerId)
  if (existingForPlayer) throw new TournamentError(CODES.PLAYER_ALREADY_REGISTERED, 'This player is already registered in this tournament (for one team only).')

  const squadCount = await repo.countSquadPlayers(tournamentTeam.id)
  if (squadCount >= tournament.max_squad_size) {
    throw new TournamentError(CODES.SQUAD_FULL, `This team's squad is limited to ${tournament.max_squad_size} players.`)
  }

  return repo.insertSquadPlayer(pool, { tournamentId, tournamentTeamId: tournamentTeam.id, playerId })
}

export async function removeSquadPlayer(tournamentId, { teamId, playerId }) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  assertSquadMutable(tournament)

  const tournamentTeam = await repo.findTournamentTeam(tournamentId, teamId)
  if (!tournamentTeam) throw new TournamentError(CODES.TEAM_NOT_REGISTERED, 'This team is not registered in the tournament.')

  const existing = await repo.findSquadPlayerByPlayerId(tournamentId, playerId)
  if (!existing || existing.tournament_team_id !== tournamentTeam.id) {
    throw new TournamentError(CODES.VALIDATION_ERROR, 'This player is not in this team\'s tournament squad.')
  }
  await repo.removeSquadPlayer(tournamentId, playerId)
}

export async function listSquad(tournamentId) {
  const tournament = await repo.findTournamentById(tournamentId)
  if (!tournament) throw new TournamentError(CODES.TOURNAMENT_NOT_FOUND, 'Tournament not found.')
  return repo.listSquadPlayers(tournamentId)
}
