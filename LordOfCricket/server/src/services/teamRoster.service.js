import { findTeamById } from '../models/team.model.js'
import { findPlayerByPublicId, findPlayersByTeam, updatePlayer } from '../models/player.model.js'

// Phase 13 — team roster membership (players.team_id) previously had no
// HTTP-reachable write path at all: `createPlayer` always seeds `teamId:
// null`, and the only code that ever set it was a dev-only seed script that
// refuses to run in production. This is the smallest robust fix: a real,
// staff-only way to add/remove a player from a team's roster. `players.team_id`
// is a single FK, so assigning a player who is already on another team simply
// moves them — one team at a time, by design (never a separate join table).
function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function conflict(message) {
  const err = new Error(message)
  err.statusCode = 409
  return err
}

export async function addPlayerToTeamRoster(teamId, publicPlayerId) {
  const team = await findTeamById(teamId)
  if (!team) throw notFound('Team not found.')

  const player = await findPlayerByPublicId(publicPlayerId)
  if (!player) throw notFound('Player not found.')
  if (player.team_id === team.id) throw conflict('Player is already on this team.')

  await updatePlayer(player.id, { team_id: team.id })
  return findPlayersByTeam(team.id)
}

export async function removePlayerFromTeamRoster(teamId, publicPlayerId) {
  const team = await findTeamById(teamId)
  if (!team) throw notFound('Team not found.')

  const player = await findPlayerByPublicId(publicPlayerId)
  if (!player || player.team_id !== team.id) throw notFound('Player is not on this team.')

  await updatePlayer(player.id, { team_id: null })
  return findPlayersByTeam(team.id)
}
