import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as matchProposalApi from '../services/matchProposalApi'

const matchProposalKeys = {
  all: ['matchProposals'] as const,
  forGround: (publicGroundId: string) => [...matchProposalKeys.all, 'ground', publicGroundId] as const,
  detail: (publicGroundId: string, publicProposalId: string) =>
    [...matchProposalKeys.all, 'detail', publicGroundId, publicProposalId] as const,
}

/**
 * Get all open proposals for a ground.
 * Public query (no auth required).
 */
export function useOpenProposalsForGround(publicGroundId: string, enabled = true) {
  return useQuery({
    queryKey: matchProposalKeys.forGround(publicGroundId),
    queryFn: () => matchProposalApi.getOpenProposalsForGround(publicGroundId),
    staleTime: 1000 * 60, // 1 minute
    enabled: !!publicGroundId && enabled,
  })
}

/**
 * Get details of a specific proposal.
 * Public query (no auth required).
 */
export function useMatchProposalDetail(publicGroundId: string, publicProposalId: string, enabled = true) {
  return useQuery({
    queryKey: matchProposalKeys.detail(publicGroundId, publicProposalId),
    queryFn: () => matchProposalApi.getMatchProposalDetail(publicGroundId, publicProposalId),
    staleTime: 1000 * 60, // 1 minute
    enabled: !!publicGroundId && !!publicProposalId && enabled,
  })
}

/**
 * Create a new match proposal.
 * Authenticated, team-member only.
 */
export function useCreateMatchProposal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      publicGroundId,
      data,
    }: {
      publicGroundId: string
      data: Parameters<typeof matchProposalApi.createMatchProposal>[1]
    }) => matchProposalApi.createMatchProposal(publicGroundId, data),
    onSuccess: (data, { publicGroundId }) => {
      // Invalidate proposals list for this ground
      queryClient.invalidateQueries({ queryKey: matchProposalKeys.forGround(publicGroundId) })
    },
  })
}

/**
 * Accept a match proposal.
 * Authenticated, team-member only.
 */
export function useAcceptMatchProposal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      publicGroundId,
      publicProposalId,
      data,
    }: {
      publicGroundId: string
      publicProposalId: string
      data: Parameters<typeof matchProposalApi.acceptMatchProposal>[2]
    }) => matchProposalApi.acceptMatchProposal(publicGroundId, publicProposalId, data),
    onSuccess: (data, { publicGroundId, publicProposalId }) => {
      // Invalidate this proposal detail
      queryClient.invalidateQueries({ queryKey: matchProposalKeys.detail(publicGroundId, publicProposalId) })
      // Invalidate proposals list for this ground
      queryClient.invalidateQueries({ queryKey: matchProposalKeys.forGround(publicGroundId) })
    },
  })
}

/**
 * Cancel a match proposal.
 * Authenticated, proposing team member only.
 */
export function useCancelMatchProposal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      publicGroundId,
      publicProposalId,
      reason,
    }: {
      publicGroundId: string
      publicProposalId: string
      reason?: string
    }) => matchProposalApi.cancelMatchProposal(publicGroundId, publicProposalId, { reason }),
    onSuccess: (data, { publicGroundId, publicProposalId }) => {
      // Invalidate this proposal detail
      queryClient.invalidateQueries({ queryKey: matchProposalKeys.detail(publicGroundId, publicProposalId) })
      // Invalidate proposals list for this ground
      queryClient.invalidateQueries({ queryKey: matchProposalKeys.forGround(publicGroundId) })
    },
  })
}
