import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import {
  getAvailableMatches,
  getUmpireGroundsAll,
  getUmpireGroundsByCity,
  getMatchUmpireSlots,
  applyForMatchSlot,
  cancelMatchSlot,
} from '../services/umpireApi'

function useScope() {
  const userId = useAuthStore((s) => s.user?.id)
  const enabled = useAuthStore((s) => s.isUmpire && s.umpireApproval === 'approved')
  return { userId, enabled: Boolean(userId) && enabled }
}

export function useAvailableMatches() {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'available-matches', userId],
    queryFn: getAvailableMatches,
    enabled,
    staleTime: 1000 * 60,
  })
}

export type GroundMode = 'all' | 'city'

export function useUmpireGrounds(mode: GroundMode, city: string) {
  const { userId, enabled } = useScope()
  const trimmedCity = city.trim()
  return useQuery({
    queryKey: ['umpire', 'grounds', userId, mode, mode === 'city' ? trimmedCity.toLowerCase() : ''],
    queryFn: () => (mode === 'city' ? getUmpireGroundsByCity(trimmedCity) : getUmpireGroundsAll()),
    enabled: enabled && (mode === 'all' || trimmedCity.length > 0),
    staleTime: 1000 * 60,
  })
}

export function useMatchUmpireSlots(matchId: number | null) {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'slots', userId, matchId],
    queryFn: () => getMatchUmpireSlots(matchId as number),
    enabled: enabled && matchId != null,
    staleTime: 1000 * 30,
  })
}

export function useApplyForSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: number) => applyForMatchSlot(matchId),
    onSuccess: () => {
      // Slot state, discovery feeds, Home next-match, and availability
      // conflict data can all shift after an apply/cancel.
      queryClient.invalidateQueries({ queryKey: ['umpire'] })
    },
  })
}

export function useCancelSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: number) => cancelMatchSlot(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umpire'] })
    },
  })
}
