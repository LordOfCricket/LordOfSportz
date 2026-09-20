import api from './api.js'

export async function fetchMyPlayer() {
  const response = await api.get('/me/player')
  return response.data.player
}

export async function updateMyPlayer(fields) {
  const response = await api.patch('/me/player', fields)
  return response.data.player
}

export async function uploadMyPlayerPhoto(file) {
  const formData = new FormData()
  formData.append('photo', file)
  const response = await api.post('/me/player/photo', formData)
  return response.data.player
}

export async function fetchTeams() {
  const response = await api.get('/teams')
  return response.data.teams
}

export async function fetchTeam(id) {
  const response = await api.get(`/teams/${id}`)
  return response.data.team
}

export async function fetchTeamPlayers(id) {
  const response = await api.get(`/teams/${id}/players`)
  return response.data.players
}
