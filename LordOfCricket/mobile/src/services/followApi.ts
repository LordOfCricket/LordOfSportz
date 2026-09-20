import api from './api'

// Priority 1 — Follow Players / Teams. Every endpoint is authenticated (a
// follow is personal user state); the public player/team profiles stay
// public. `following` is always read from the server.

export interface FollowState {
  following: boolean
}

export interface FollowedPlayer {
  publicPlayerId: string
  name: string
  role: string | null
  photoUrl: string | null
  team: { id: number; name: string; shortName: string; logoUrl: string | null } | null
  followedAt: string
}

export interface FollowedTeam {
  id: number
  name: string
  shortName: string
  logoUrl: string | null
  followedAt: string
}

export interface FollowedGround {
  publicGroundId: string
  name: string
  city: string | null
  state: string | null
  primaryPhoto: string | null
  followedAt: string
}

export interface FollowingResponse {
  players: { total: number; items: FollowedPlayer[] }
  teams: { total: number; items: FollowedTeam[] }
  grounds: { total: number; items: FollowedGround[] }
}

export async function getPlayerFollowState(publicPlayerId: string): Promise<FollowState> {
  const { data } = await api.get<FollowState>(`/players/${publicPlayerId}/follow`)
  return data
}
export async function followPlayer(publicPlayerId: string): Promise<FollowState> {
  const { data } = await api.post<FollowState>(`/players/${publicPlayerId}/follow`)
  return data
}
export async function unfollowPlayer(publicPlayerId: string): Promise<FollowState> {
  const { data } = await api.delete<FollowState>(`/players/${publicPlayerId}/follow`)
  return data
}

export async function getTeamFollowState(teamId: number): Promise<FollowState> {
  const { data } = await api.get<FollowState>(`/teams/${teamId}/follow`)
  return data
}
export async function followTeam(teamId: number): Promise<FollowState> {
  const { data } = await api.post<FollowState>(`/teams/${teamId}/follow`)
  return data
}
export async function unfollowTeam(teamId: number): Promise<FollowState> {
  const { data } = await api.delete<FollowState>(`/teams/${teamId}/follow`)
  return data
}

export async function getGroundFollowState(publicGroundId: string): Promise<FollowState> {
  const { data } = await api.get<FollowState>(`/grounds/${publicGroundId}/follow`)
  return data
}
export async function followGround(publicGroundId: string): Promise<FollowState> {
  const { data } = await api.post<FollowState>(`/grounds/${publicGroundId}/follow`)
  return data
}
export async function unfollowGround(publicGroundId: string): Promise<FollowState> {
  const { data } = await api.delete<FollowState>(`/grounds/${publicGroundId}/follow`)
  return data
}

export async function getFollowing(): Promise<FollowingResponse> {
  const { data } = await api.get<FollowingResponse>('/me/following')
  return data
}
