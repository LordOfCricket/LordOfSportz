// Umpire Proposals — Ground-Owner-initiated invitations to a specific
// approved umpire for a specific open slot, optionally with a private
// bonus on top of the match's base fee. Mirrors groundOwnerApi.js /
// umpireSelfApi.js's thin-wrapper convention.
import api from './api.js'

// Ground Owner side.
export async function proposeUmpireForSlot(publicGroundId, matchId, slotId, { umpireUserId, incentiveAmount, message } = {}) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/propose`, {
    umpireUserId,
    incentiveAmount,
    message,
  })
  return data.proposal
}

export async function fetchMatchProposals(publicGroundId, matchId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/proposals`)
  return data.proposals
}

export async function cancelMatchProposal(publicGroundId, matchId, proposalId) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/proposals/${proposalId}/cancel`)
  return data.proposal
}

// Umpire side.
export async function fetchMyProposals() {
  const { data } = await api.get('/umpire/proposals')
  return data.proposals
}

export async function respondToProposal(proposalId, accept) {
  const { data } = await api.post(`/umpire/proposals/${proposalId}/respond`, { accept })
  return data
}
