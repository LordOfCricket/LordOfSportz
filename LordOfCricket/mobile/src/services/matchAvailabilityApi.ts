import api from './api'

export type AvailabilityStatus = 'AVAILABLE' | 'NOT_AVAILABLE'

export interface MatchAvailability {
  status: AvailabilityStatus | null
}

/**
 * GET /me/availability/:matchId
 * Fetch the authenticated player's RSVP status for a match
 */
export async function fetchMyAvailability(matchId: number): Promise<MatchAvailability> {
  const response = await api.get<MatchAvailability>(`/me/availability/${matchId}`)
  return response.data
}

/**
 * PATCH /me/availability/:matchId
 * Set the authenticated player's RSVP status for a match
 */
export async function setMyAvailability(matchId: number, status: AvailabilityStatus): Promise<MatchAvailability> {
  const response = await api.patch<MatchAvailability>(`/me/availability/${matchId}`, { status })
  return response.data
}
