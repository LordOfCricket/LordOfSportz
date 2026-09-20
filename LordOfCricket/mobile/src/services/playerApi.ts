import api from './api'
import { Player, EditablePlayerFields, PlayerStats, PublicPlayerProfile } from '../types'

/**
 * GET /me/player
 * Fetch the authenticated user's player profile
 * Backend returns { player: Player }, we unwrap to Player
 */
export async function fetchMyPlayer(): Promise<Player> {
  const response = await api.get<{ player: Player }>('/me/player')
  return response.data.player
}

/**
 * PATCH /me/player
 * Update the authenticated user's player profile
 * Only submitted fields are updated; unsubmitted fields remain unchanged
 * Accepts null to clear optional fields
 * Backend returns { player: Player }, we unwrap to Player
 */
export async function updateMyPlayer(updates: EditablePlayerFields): Promise<Player> {
  const response = await api.patch<{ player: Player }>('/me/player', updates)
  return response.data.player
}

/**
 * POST /me/player/photo
 * Upload a profile photo
 * Backend expects multipart FormData with 'photo' field
 * File must be JPEG, PNG, or WEBP; max 10MB
 * Returns updated player object with new photo_url
 * Backend returns { player: Player }, we unwrap to Player
 */
export async function uploadPlayerPhoto(file: Blob): Promise<Player> {
  const formData = new FormData()
  formData.append('photo', file)

  const response = await api.post<{ player: Player }>('/me/player/photo', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data.player
}

/**
 * GET /me/stats
 * Fetch the authenticated user's career statistics
 * Includes career stats, recent form, and paginated match history
 */
export async function getMyPlayerStats(limit: number = 10, offset: number = 0): Promise<PlayerStats> {
  const response = await api.get<PlayerStats>('/me/stats', {
    params: { limit, offset },
  })
  return response.data
}

/**
 * GET /players/:publicPlayerId
 * Fetch public player profile information
 * No authentication required
 * Backend returns { player: PublicPlayerProfile } — a narrower, camelCase,
 * public-safe DTO (see PublicPlayerProfile's own comment in types/index.ts),
 * NOT the private `Player` shape GET /me/player returns.
 */
export async function getPublicPlayerProfile(publicPlayerId: string): Promise<PublicPlayerProfile> {
  const response = await api.get<{ player: PublicPlayerProfile }>(`/players/${publicPlayerId}`)
  return response.data.player
}

/**
 * GET /players/:publicPlayerId/stats
 * Fetch public player statistics
 * No authentication required
 * Includes career stats, recent form, and paginated match history
 */
export async function getPublicPlayerStats(
  publicPlayerId: string,
  limit: number = 10,
  offset: number = 0
): Promise<PlayerStats> {
  const response = await api.get<PlayerStats>(`/players/${publicPlayerId}/stats`, {
    params: { limit, offset },
  })
  return response.data
}

// GET /players?q=&role=&limit=&offset= — player directory/search
// (statistics.controller.js#searchPlayersHandler ->
// statistics.service.js#searchPlayers). Already existed, public, no auth,
// rate-limited (searchLimiter). Case-insensitive (Postgres ILIKE) match on
// name/public_player_id; `q` omitted/empty lists all players, paginated
// (backend clamps to a max of 50 per page, defaults to 20). The real
// response also includes a `career` summary per item — not modeled below
// since the directory doesn't display it.
export interface PlayerSearchResult {
  publicPlayerId: string
  name: string
  role: string | null
  photoUrl: string | null
  battingStyle: string | null
  bowlingStyle: string | null
  team: { id: number; name: string; shortName: string; logoUrl: string | null } | null
}

export interface PlayerSearchResponse {
  pagination: { limit: number; offset: number; total: number }
  items: { player: PlayerSearchResult }[]
}

export async function searchPlayers(
  q: string,
  limit: number = 20,
  offset: number = 0
): Promise<PlayerSearchResponse> {
  const response = await api.get<PlayerSearchResponse>('/players', {
    params: { q: q || undefined, limit, offset },
  })
  return response.data
}
