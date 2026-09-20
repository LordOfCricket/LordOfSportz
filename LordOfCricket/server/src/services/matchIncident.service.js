import { insertIncident, findIncidentsByMatch } from '../models/matchIncident.model.js'
import { findMatchByIdWithTeams } from '../models/match.model.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import { createNotification } from './groundNotification.service.js'

// Fixed, small taxonomy validated at the service layer — same convention as
// app_feature_liked/umpire_requests.status elsewhere in this codebase
// (plain VARCHAR + application validation, not a second enum table).
export const INCIDENT_TYPES = [
  'RAIN',
  'INJURY',
  'BAD_LIGHT',
  'GROUND_CONDITION',
  'PLAYER_MISCONDUCT',
  'EQUIPMENT_ISSUE',
  'TECHNICAL_PROBLEM',
  'MATCH_ABANDONED',
  'OTHER',
]

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

// Route is gated by requireMatchScorerByParam, so the caller is already
// confirmed to be the actively-assigned umpire on this match — reporting an
// incident can never be done by an unassigned user, and never bypasses that
// gate itself.
export async function reportIncident({ matchId, user, incidentType, description, occurredAt }) {
  if (!INCIDENT_TYPES.includes(incidentType)) {
    throw badRequest(`incidentType must be one of: ${INCIDENT_TYPES.join(', ')}`)
  }
  const trimmedDescription = typeof description === 'string' ? description.slice(0, 500) : null

  const incident = await insertIncident({ matchId, reportedBy: user.id, incidentType, description: trimmedDescription, occurredAt })

  // Best-effort, same posture as every other notification in this codebase
  // (createNotification already swallows its own write failures) — never
  // rolls back the incident itself if notifying the owner fails.
  const match = await findMatchByIdWithTeams(matchId)
  if (match?.ground_id) {
    const ownerIds = await findActiveGroundOwnerUserIds(match.ground_id)
    await Promise.all(
      ownerIds.map((ownerId) =>
        createNotification({
          userId: ownerId,
          type: 'MATCH_INCIDENT_REPORTED',
          title: 'An incident was reported for your match',
          body: `${incidentType.replace(/_/g, ' ')} — ${match.team_a_name} vs ${match.team_b_name}.`,
          relatedMatchId: matchId,
          // Phase 2 Cleanup — groundId lets NotificationBell deep-link to
          // this ground's Matches tab (TYPE_ROUTE_SUFFIX), never leaking
          // which ground since it's always this incident's own match.ground_id.
          groundId: match.ground_id,
        }),
      ),
    )
  }

  return incident
}

export async function listIncidents(matchId) {
  return findIncidentsByMatch(matchId)
}
