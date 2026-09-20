// Client for the server-authoritative scoring API (recording and
// correction). Nothing else in the client should call these routes
// directly — the Umpire Testing prototype only wires some of these
// endpoints.
import api from './api.js'

// One idempotency key per user-initiated scoring/correction action. Reuse the
// SAME id if retrying the identical request (e.g. an axios timeout retry);
// generate a new one for every distinct action a scorer takes.
export function generateClientActionId() {
  return crypto.randomUUID()
}

export async function createInnings(matchId, { inningsNumber, battingTeamId, bowlingTeamId }) {
  const { data } = await api.post(`/matches/${matchId}/innings`, { inningsNumber, battingTeamId, bowlingTeamId })
  return data.innings
}

export async function addMatchPlayer(matchId, { teamId, playerId, isPlayingXi, isCaptain, isWicketkeeper, battingOrder }) {
  const { data } = await api.post(`/matches/${matchId}/match-players`, { teamId, playerId, isPlayingXi, isCaptain, isWicketkeeper, battingOrder })
  return data.matchPlayer
}

export async function listMatchPlayers(matchId) {
  const { data } = await api.get(`/matches/${matchId}/match-players`)
  return data.matchPlayers
}

export async function getInningsState(inningsId) {
  const { data } = await api.get(`/innings/${inningsId}/state`)
  return data
}

export async function getInningsTimeline(inningsId) {
  const { data } = await api.get(`/innings/${inningsId}/timeline`)
  return data
}

export async function getWagonWheel(inningsId) {
  const { data } = await api.get(`/innings/${inningsId}/wagon-wheel`)
  return data.shots
}

export async function recordDelivery(inningsId, { expectedVersion, clientActionId, ...input }) {
  const { data } = await api.post(`/innings/${inningsId}/deliveries`, { expectedVersion, clientActionId, ...input })
  return data
}

export async function recordEvent(inningsId, { expectedVersion, clientActionId, eventType, payload, deliveryId }) {
  const { data } = await api.post(`/innings/${inningsId}/events`, { expectedVersion, clientActionId, eventType, payload, deliveryId })
  return data
}

/** Read-only — computes but never persists a projected correction. */
export async function previewCorrection(inningsId, { targetType, targetId, patch }) {
  const { data } = await api.post(`/innings/${inningsId}/corrections/preview`, { targetType, targetId, patch })
  return data
}

export async function applyCorrection(inningsId, { targetType, targetId, patch, reasonCode, note, expectedVersion, clientActionId }) {
  const { data } = await api.post(`/innings/${inningsId}/corrections`, { targetType, targetId, patch, reasonCode, note, expectedVersion, clientActionId })
  return data
}

export async function getCorrectionHistory(inningsId) {
  const { data } = await api.get(`/innings/${inningsId}/corrections`)
  return data.corrections
}

export async function undoCorrection(inningsId, correctionId, { expectedVersion, clientActionId }) {
  const { data } = await api.post(`/innings/${inningsId}/corrections/${correctionId}/undo`, { expectedVersion, clientActionId })
  return data
}
