import api from './api'
import { MatchProposal, MatchProposalsListResponse } from '../types'

/**
 * Get all open proposals for a specific ground.
 * Public endpoint (no auth required).
 */
export async function getOpenProposalsForGround(publicGroundId: string): Promise<MatchProposalsListResponse> {
  const response = await api.get<MatchProposalsListResponse>(`/grounds/${publicGroundId}/proposals`)
  return response.data
}

/**
 * Get details of a specific proposal.
 * Public endpoint (no auth required).
 */
export async function getMatchProposalDetail(publicGroundId: string, publicProposalId: string): Promise<{ proposal: MatchProposal }> {
  const response = await api.get<{ proposal: MatchProposal }>(`/grounds/${publicGroundId}/proposals/${publicProposalId}`)
  return response.data
}

/**
 * Create a new match proposal on behalf of a team.
 * Authenticated, team-member only.
 */
export async function createMatchProposal(
  publicGroundId: string,
  data: {
    teamId: number
    startTime: string
    endTime: string
    matchFormat?: string
    participantPlayerIds?: number[]
    purpose?: string
    notes?: string
    clientActionId?: string
    expiresInHours?: number
  }
): Promise<{ proposal: MatchProposal }> {
  const response = await api.post<{ proposal: MatchProposal }>(`/grounds/${publicGroundId}/proposals`, data)
  return response.data
}

/**
 * Accept a match proposal on behalf of a team.
 * Authenticated, team-member only.
 */
export async function acceptMatchProposal(
  publicGroundId: string,
  publicProposalId: string,
  data: {
    teamId: number
    participantPlayerIds?: number[]
  }
): Promise<{ proposal: MatchProposal }> {
  const response = await api.post<{ proposal: MatchProposal }>(
    `/grounds/${publicGroundId}/proposals/${publicProposalId}/accept`,
    data
  )
  return response.data
}

/**
 * Cancel a match proposal.
 * Authenticated, proposing team member only.
 */
export async function cancelMatchProposal(
  publicGroundId: string,
  publicProposalId: string,
  data?: {
    reason?: string
  }
): Promise<{ proposal: MatchProposal }> {
  const response = await api.post<{ proposal: MatchProposal }>(
    `/grounds/${publicGroundId}/proposals/${publicProposalId}/cancel`,
    data || {}
  )
  return response.data
}
