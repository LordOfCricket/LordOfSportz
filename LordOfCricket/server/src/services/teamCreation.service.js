import { createTeam } from '../models/team.model.js'
import { findPlayerByUserId } from '../models/player.model.js'

// Phase 5D.4 — Team Creation & Ownership
// Players can create new cricket teams and become the owner.
// The backend derives ownership from the authenticated session, not from client data.

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function unauthorized(message) {
  const err = new Error(message)
  err.statusCode = 401
  return err
}

/**
 * Create a new team owned by the authenticated player.
 *
 * @param {Object} params - Creation parameters
 * @param {number} params.userId - Authenticated user ID (from session)
 * @param {string} params.name - Team name (required, trimmed, non-empty)
 * @param {string} params.shortName - Team short name (required, trimmed, non-empty)
 * @param {string|null} params.logoUrl - Team logo URL (optional)
 * @returns {Promise<Object>} Created team with owner_id set
 * @throws {Error} BadRequest for validation errors, Unauthorized if user is not a player
 */
export async function createTeamByPlayer({ userId, name, shortName, logoUrl = null }) {
  if (!userId) throw unauthorized('Authentication required to create a team.')

  // Trim and validate name
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw badRequest('Team name is required.')
  if (trimmedName.length > 100) throw badRequest('Team name must not exceed 100 characters.')

  // Trim and validate shortName
  const trimmedShortName = String(shortName || '').trim()
  if (!trimmedShortName) throw badRequest('Team short name is required.')
  if (trimmedShortName.length > 10) throw badRequest('Team short name must not exceed 10 characters.')

  // Only players can create teams
  const player = await findPlayerByUserId(userId)
  if (!player) throw unauthorized('Only registered players can create teams.')

  // Create the team with authenticated user as owner
  const team = await createTeam({
    name: trimmedName,
    shortName: trimmedShortName,
    logoUrl: logoUrl ? String(logoUrl).trim() : null,
    ownerId: userId,
  })

  return team
}
