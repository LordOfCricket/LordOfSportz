import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { getMyEarnings, getMyOfficiatingTrend, getMyProposals, respondToProposal } from '../services/umpireApi'

function useScope() {
  const userId = useAuthStore((s) => s.user?.id)
  const enabled = useAuthStore((s) => s.isUmpire && s.umpireApproval === 'approved')
  return { userId, enabled: Boolean(userId) && enabled }
}

export function useUmpireEarnings() {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'earnings', userId],
    queryFn: getMyEarnings,
    enabled,
    staleTime: 1000 * 60 * 2,
  })
}

export function useUmpireTrend(months = 6) {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'trend', userId, months],
    queryFn: () => getMyOfficiatingTrend(months),
    enabled,
    staleTime: 1000 * 60 * 5,
  })
}

export function useUmpireProposals() {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'proposals', userId],
    queryFn: getMyProposals,
    enabled,
    staleTime: 1000 * 60,
  })
}

export function useRespondToProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ proposalId, accept }: { proposalId: number; accept: boolean }) =>
      respondToProposal(proposalId, accept),
    onSuccess: () => {
      // Accepting a proposal creates an assignment and can shift slots,
      // discovery feeds, home and availability conflicts.
      queryClient.invalidateQueries({ queryKey: ['umpire'] })
    },
  })
}
