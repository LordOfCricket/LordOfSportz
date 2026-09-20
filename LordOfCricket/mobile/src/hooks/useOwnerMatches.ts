import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { fetchTopUmpires } from '../services/statisticsApi'
import { useAuthStore } from '../store/authStore'
import { groundOwnerKeys } from './useMyGrounds'
import { CreateMatchInput, UmpirePaymentStatus } from '../types'

// Every query is scoped to one ground (+ match/slot) and stays disabled
// until useActiveGround resolves an id. Backend permission checks remain the
// security boundary.

export function useOwnerMatches(publicGroundId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.matches(publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundMatches(publicGroundId as string),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 30,
  })
}

// No single-match GET endpoint exists — the detail screen selects the row
// from the list query so both stay consistent after a mutation.
export function useOwnerMatch(publicGroundId: string | undefined, matchId: number | undefined) {
  const query = useOwnerMatches(publicGroundId)
  const match = matchId != null ? (query.data ?? []).find((m) => m.id === matchId) ?? null : null
  return { ...query, match }
}

export function useOwnerMatchUmpireSlots(publicGroundId: string | undefined, matchId: number | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.matchUmpireSlots(publicGroundId ?? 'none', matchId ?? -1),
    queryFn: () => groundOwnerApi.fetchGroundMatchUmpireSlots(publicGroundId as string, matchId as number),
    enabled: Boolean(publicGroundId) && matchId != null,
    staleTime: 1000 * 20,
  })
}

export function useOwnerMatchProposals(publicGroundId: string | undefined, matchId: number | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.matchProposals(publicGroundId ?? 'none', matchId ?? -1),
    queryFn: () => groundOwnerApi.fetchGroundMatchProposals(publicGroundId as string, matchId as number),
    enabled: Boolean(publicGroundId) && matchId != null,
    staleTime: 1000 * 20,
  })
}

export function useOwnerMatchHistory(publicGroundId: string | undefined, matchId: number | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.matchHistory(publicGroundId ?? 'none', matchId ?? -1),
    queryFn: () => groundOwnerApi.fetchGroundMatchAssignmentHistory(publicGroundId as string, matchId as number),
    enabled: Boolean(publicGroundId) && matchId != null,
    staleTime: 1000 * 30,
  })
}

export function useOwnerMatchIncidents(publicGroundId: string | undefined, matchId: number | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.matchIncidents(publicGroundId ?? 'none', matchId ?? -1),
    queryFn: () => groundOwnerApi.fetchGroundMatchIncidents(publicGroundId as string, matchId as number),
    enabled: Boolean(publicGroundId) && matchId != null,
    staleTime: 1000 * 30,
  })
}

export function useRecommendedUmpires(publicGroundId: string | undefined, matchId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: groundOwnerKeys.recommendedUmpires(publicGroundId ?? 'none', matchId ?? -1),
    queryFn: () => groundOwnerApi.fetchGroundMatchRecommendedUmpires(publicGroundId as string, matchId as number),
    enabled: enabled && Boolean(publicGroundId) && matchId != null,
    staleTime: 1000 * 60,
  })
}

export function useUmpireOpsSummary(publicGroundId: string | undefined) {
  return useQuery({
    queryKey: groundOwnerKeys.umpireOpsSummary(publicGroundId ?? 'none'),
    queryFn: () => groundOwnerApi.fetchGroundUmpireOperationsSummary(publicGroundId as string),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 60,
    retry: false,
  })
}

export function useEligibleReplacements(
  publicGroundId: string | undefined,
  matchId: number | undefined,
  slotId: number | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: groundOwnerKeys.eligibleReplacements(publicGroundId ?? 'none', matchId ?? -1, slotId ?? -1),
    queryFn: () =>
      groundOwnerApi.fetchEligibleReplacements(publicGroundId as string, matchId as number, slotId as number),
    enabled: enabled && Boolean(publicGroundId) && matchId != null && slotId != null,
    staleTime: 1000 * 30,
  })
}

export function useTopUmpires(limit = 20, offset = 0) {
  return useQuery({
    queryKey: groundOwnerKeys.topUmpires(limit, offset),
    queryFn: () => fetchTopUmpires(limit, offset),
    staleTime: 1000 * 60 * 5,
  })
}

function useMatchInvalidation(publicGroundId: string, matchId: number) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return () => {
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.matches(publicGroundId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.matchUmpireSlots(publicGroundId, matchId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.matchProposals(publicGroundId, matchId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.matchHistory(publicGroundId, matchId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.umpireOpsSummary(publicGroundId) })
    queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
  }
}

export function useCreateOwnerMatch(publicGroundId: string) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return useMutation({
    mutationFn: (input: CreateMatchInput) => groundOwnerApi.createGroundMatch(publicGroundId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.matches(publicGroundId) })
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.umpireOpsSummary(publicGroundId) })
      queryClient.invalidateQueries({ queryKey: groundOwnerKeys.dashboard(userId, publicGroundId) })
    },
  })
}

export function useStartOwnerMatch(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (confirmUnderstaffed: boolean) =>
      groundOwnerApi.startGroundMatch(publicGroundId, matchId, confirmUnderstaffed),
    onSuccess: invalidate,
  })
}

export function useCompleteOwnerMatch(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: () => groundOwnerApi.completeGroundMatch(publicGroundId, matchId),
    onSuccess: invalidate,
  })
}

export function useCancelOwnerMatch(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (reason: string | undefined) => groundOwnerApi.cancelGroundMatch(publicGroundId, matchId, reason),
    onSuccess: invalidate,
  })
}

export function useSetUmpireFee(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (args: { amount: number; currency?: string }) =>
      groundOwnerApi.setGroundMatchUmpireFee(publicGroundId, matchId, args.amount, args.currency),
    onSuccess: invalidate,
  })
}

export function useUpdateSlotPaymentStatus(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (args: { slotId: number; status: UmpirePaymentStatus }) =>
      groundOwnerApi.updateGroundMatchSlotPaymentStatus(publicGroundId, matchId, args.slotId, args.status),
    onSuccess: invalidate,
  })
}

export function useMarkNoShow(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (slotId: number) => groundOwnerApi.markGroundMatchUmpireNoShow(publicGroundId, matchId, slotId),
    onSuccess: invalidate,
  })
}

export function useAssignReplacement(publicGroundId: string, matchId: number) {
  const queryClient = useQueryClient()
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (args: { slotId: number; newUmpireUserId: number }) =>
      groundOwnerApi.assignGroundMatchReplacement(publicGroundId, matchId, args.slotId, args.newUmpireUserId),
    onSuccess: (_data, args) => {
      invalidate()
      queryClient.invalidateQueries({
        queryKey: groundOwnerKeys.eligibleReplacements(publicGroundId, matchId, args.slotId),
      })
    },
  })
}

export function useProposeUmpire(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (args: { slotId: number; umpireUserId: number; incentiveAmount?: number; message?: string }) =>
      groundOwnerApi.proposeGroundMatchUmpire(publicGroundId, matchId, args.slotId, {
        umpireUserId: args.umpireUserId,
        incentiveAmount: args.incentiveAmount,
        message: args.message,
      }),
    onSuccess: invalidate,
  })
}

export function useCancelProposal(publicGroundId: string, matchId: number) {
  const invalidate = useMatchInvalidation(publicGroundId, matchId)
  return useMutation({
    mutationFn: (proposalId: number) => groundOwnerApi.cancelGroundMatchProposal(publicGroundId, matchId, proposalId),
    onSuccess: invalidate,
  })
}
