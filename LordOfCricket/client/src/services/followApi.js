// Priority 1 — Follow Players / Teams. Every endpoint is authenticated (a
// follow is personal user state); the public player/team profiles stay
// public. `following` state is always read from the server, never trusted
// from client memory.
import api from './api.js'

export async function fetchPlayerFollowState(publicPlayerId) {
  const { data } = await api.get(`/players/${publicPlayerId}/follow`)
  return data // { following: boolean }
}
export async function followPlayer(publicPlayerId) {
  const { data } = await api.post(`/players/${publicPlayerId}/follow`)
  return data
}
export async function unfollowPlayer(publicPlayerId) {
  const { data } = await api.delete(`/players/${publicPlayerId}/follow`)
  return data
}

export async function fetchTeamFollowState(teamId) {
  const { data } = await api.get(`/teams/${teamId}/follow`)
  return data
}
export async function followTeam(teamId) {
  const { data } = await api.post(`/teams/${teamId}/follow`)
  return data
}
export async function unfollowTeam(teamId) {
  const { data } = await api.delete(`/teams/${teamId}/follow`)
  return data
}

// Priority 5 — Favorite Grounds. Same authenticated `/follow` sub-path as
// player/team, keyed by the public ground id.
export async function fetchGroundFollowState(publicGroundId) {
  const { data } = await api.get(`/grounds/${publicGroundId}/follow`)
  return data
}
export async function followGround(publicGroundId) {
  const { data } = await api.post(`/grounds/${publicGroundId}/follow`)
  return data
}
export async function unfollowGround(publicGroundId) {
  const { data } = await api.delete(`/grounds/${publicGroundId}/follow`)
  return data
}

export async function fetchFollowing() {
  const { data } = await api.get('/me/following')
  return data // { players: { total, items }, teams: { total, items }, grounds: { total, items } }
}
