import * as followRepo from '../repositories/follow.repository.js'
import { findPlayerByPublicId } from '../models/player.model.js'
import { findTeamById } from '../models/team.model.js'
import { findPublicActiveGroundByPublicId } from '../models/ground.model.js'

const MAX_LIST_LIMIT = 100
const DEFAULT_LIST_LIMIT = 50

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}
function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function clamp(value, fallback, max) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(n, max))
}

async function resolvePlayer(publicPlayerId) {
  const player = await findPlayerByPublicId(publicPlayerId)
  if (!player) throw notFound('Player not found.')
  return player
}

async function resolveTeam(teamId) {
  if (!/^\d+$/.test(String(teamId))) throw notFound('Team not found.')
  const team = await findTeamById(teamId)
  if (!team) throw notFound('Team not found.')
  return team
}

async function resolveGround(publicGroundId) {
  // Same lookup the public ground profile route uses — resolves only ACTIVE
  // grounds, never a raw internal id trusted from the client.
  const ground = await findPublicActiveGroundByPublicId(publicGroundId)
  if (!ground) throw notFound('Ground not found.')
  return ground
}

export async function followPlayer(userId, publicPlayerId) {
  const player = await resolvePlayer(publicPlayerId)
  // A user can't follow their own linked player profile.
  if (player.user_id === userId) throw badRequest('You cannot follow your own profile.')
  await followRepo.followPlayer(userId, player.id)
  return { following: true }
}

export async function unfollowPlayer(userId, publicPlayerId) {
  const player = await resolvePlayer(publicPlayerId)
  await followRepo.unfollowPlayer(userId, player.id)
  return { following: false }
}

export async function followTeam(userId, teamId) {
  const team = await resolveTeam(teamId)
  await followRepo.followTeam(userId, team.id)
  return { following: true }
}

export async function unfollowTeam(userId, teamId) {
  const team = await resolveTeam(teamId)
  await followRepo.unfollowTeam(userId, team.id)
  return { following: false }
}

export async function getPlayerFollowState(userId, publicPlayerId) {
  const player = await resolvePlayer(publicPlayerId)
  return { following: await followRepo.isFollowingPlayer(userId, player.id) }
}

export async function getTeamFollowState(userId, teamId) {
  const team = await resolveTeam(teamId)
  return { following: await followRepo.isFollowingTeam(userId, team.id) }
}

export async function followGround(userId, publicGroundId) {
  const ground = await resolveGround(publicGroundId)
  await followRepo.followGround(userId, ground.id)
  return { following: true }
}

export async function unfollowGround(userId, publicGroundId) {
  const ground = await resolveGround(publicGroundId)
  await followRepo.unfollowGround(userId, ground.id)
  return { following: false }
}

export async function getGroundFollowState(userId, publicGroundId) {
  const ground = await resolveGround(publicGroundId)
  return { following: await followRepo.isFollowingGround(userId, ground.id) }
}

/**
 * The authenticated user's "Following" list — both entity types in one
 * response (the screen shows both). Each list is independently paginated and
 * hard-capped at MAX_LIST_LIMIT; at LOC's club scale a personal follow list
 * never approaches that, and the cap keeps the query bounded regardless.
 */
export async function listFollowing(userId, { playersLimit, playersOffset, teamsLimit, teamsOffset, groundsLimit, groundsOffset } = {}) {
  const pLimit = clamp(playersLimit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)
  const pOffset = clamp(playersOffset, 0, Number.MAX_SAFE_INTEGER)
  const tLimit = clamp(teamsLimit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)
  const tOffset = clamp(teamsOffset, 0, Number.MAX_SAFE_INTEGER)
  const gLimit = clamp(groundsLimit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT)
  const gOffset = clamp(groundsOffset, 0, Number.MAX_SAFE_INTEGER)

  const [players, teams, grounds] = await Promise.all([
    followRepo.listFollowedPlayers(userId, { limit: pLimit, offset: pOffset }),
    followRepo.listFollowedTeams(userId, { limit: tLimit, offset: tOffset }),
    followRepo.listFollowedGrounds(userId, { limit: gLimit, offset: gOffset }),
  ])

  return {
    players: {
      total: players.total,
      items: players.rows.map((r) => ({
        publicPlayerId: r.public_player_id,
        name: r.name,
        role: r.role,
        photoUrl: r.photo_url,
        team: r.team_id != null ? { id: r.team_id, name: r.team_name, shortName: r.team_short, logoUrl: r.team_logo } : null,
        followedAt: r.followed_at,
      })),
    },
    teams: {
      total: teams.total,
      items: teams.rows.map((r) => ({
        id: r.id,
        name: r.name,
        shortName: r.short_name,
        logoUrl: r.logo_url,
        followedAt: r.followed_at,
      })),
    },
    grounds: {
      total: grounds.total,
      items: grounds.rows.map((r) => ({
        publicGroundId: r.public_ground_id,
        name: r.name,
        city: r.city,
        state: r.state,
        primaryPhoto: r.primary_photo,
        followedAt: r.followed_at,
      })),
    },
  }
}
