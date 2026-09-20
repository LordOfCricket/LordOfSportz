// Umpire Communication & Commercial 2.0 — pure formatting helpers for
// match-scoped messages, mirroring matchDiscovery.model.js's convention.

export function formatMessageTime(createdAt) {
  return new Date(createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function senderLabel(senderRole) {
  return senderRole === 'GROUND_OWNER' ? 'Ground Owner' : 'Umpire'
}
