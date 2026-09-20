// Tournament management client. React never computes standings,
// NRR, qualification, or a winner itself; every number here comes straight
// from the server's read model.
import api from './api.js'

export async function fetchTournaments({ category, limit, offset } = {}) {
  const { data } = await api.get('/tournaments', { params: { category, limit, offset } })
  return data
}

export async function fetchTournament(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}`)
  return data.tournament
}

export async function fetchTournamentTeams(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}/teams`)
  return data.teams
}

export async function fetchTournamentSquad(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}/squad`)
  return data.squad
}

export async function fetchTournamentFixtures(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}/fixtures`)
  return data.fixtures
}

export async function fetchTournamentStandings(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}/standings`)
  return data.standings
}

export async function fetchTournamentStatistics(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}/statistics`)
  return data
}

// --- Organizer (staff-only) actions ---

export async function createTournament(payload) {
  const { data } = await api.post('/tournaments', payload)
  return data.tournament
}

export async function openRegistration(publicTournamentId) {
  const { data } = await api.post(`/tournaments/${publicTournamentId}/open-registration`)
  return data.tournament
}

export async function registerTeam(publicTournamentId, teamId, groupName) {
  const { data } = await api.post(`/tournaments/${publicTournamentId}/teams`, { teamId, groupName })
  return data.tournamentTeam
}

export async function removeTeam(publicTournamentId, teamId) {
  await api.delete(`/tournaments/${publicTournamentId}/teams/${teamId}`)
}

export async function addSquadPlayer(publicTournamentId, teamId, playerId) {
  const { data } = await api.post(`/tournaments/${publicTournamentId}/squad`, { teamId, playerId })
  return data.squadPlayer
}

export async function removeSquadPlayer(publicTournamentId, teamId, playerId) {
  await api.delete(`/tournaments/${publicTournamentId}/squad/${teamId}/${playerId}`)
}

export async function generateFixtures(publicTournamentId) {
  const { data } = await api.post(`/tournaments/${publicTournamentId}/fixtures/generate`)
  return data.tournament
}

export async function scheduleFixture(publicTournamentId, fixtureId, matchDate, venue) {
  const { data } = await api.patch(`/tournaments/${publicTournamentId}/fixtures/${fixtureId}/schedule`, { matchDate, venue })
  return data.fixture
}

export async function resolveFixture(publicTournamentId, fixtureId, winnerTeamId) {
  const { data } = await api.post(`/tournaments/${publicTournamentId}/fixtures/${fixtureId}/resolve`, { winnerTeamId })
  return data.fixture
}

export async function completeLeague(publicTournamentId) {
  const { data } = await api.post(`/tournaments/${publicTournamentId}/complete`)
  return data.tournament
}
