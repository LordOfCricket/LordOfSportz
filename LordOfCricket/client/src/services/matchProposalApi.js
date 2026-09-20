// Phase 25 — Match proposals: team A proposes to team B for a ground/time.
// Two-sided: proposer (create/cancel via ground) + acceptor (discover public,
// accept with team validation). Mirrors umpireProposalApi.js's two-sided shape.
import api from './api.js'

// Proposer side (ground-scoped).
export async function createMatchProposal(publicGroundId, payload) {
  const { data } = await api.post(`/grounds/${publicGroundId}/proposals`, payload)
  return data.proposal
}

export async function fetchGroundProposals(publicGroundId) {
  const { data } = await api.get(`/grounds/${publicGroundId}/proposals`)
  return data.proposals
}

export async function fetchProposalDetail(publicProposalId) {
  // Public endpoint — no ground ID required for read-only access.
  const { data } = await api.get(`/proposals/${publicProposalId}`)
  return data.proposal
}

export async function cancelMatchProposal(publicGroundId, publicProposalId) {
  const { data } = await api.post(`/grounds/${publicGroundId}/proposals/${publicProposalId}/cancel`)
  return data.proposal
}

// Acceptor side (team-facing, ground-scoped for tenancy validation).
export async function acceptMatchProposal(publicGroundId, publicProposalId, payload) {
  const { data } = await api.post(`/grounds/${publicGroundId}/proposals/${publicProposalId}/accept`, payload)
  return data.proposal
}
