import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import {
  getMyAvailability,
  getMyAssignments,
  setWeeklyAvailability,
  setDateAvailability,
  deleteDateAvailability,
} from '../services/umpireApi'

function useScope() {
  const userId = useAuthStore((s) => s.user?.id)
  const enabled = useAuthStore((s) => s.isUmpire && s.umpireApproval === 'approved')
  return { userId, enabled: Boolean(userId) && enabled }
}

export function useUmpireAvailability() {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'availability', userId],
    queryFn: getMyAvailability,
    enabled,
    staleTime: 1000 * 60,
  })
}

export function useUmpireAssignments() {
  const { userId, enabled } = useScope()
  return useQuery({
    queryKey: ['umpire', 'assignments', userId],
    queryFn: getMyAssignments,
    enabled,
    staleTime: 1000 * 60,
  })
}

function useInvalidateUmpire() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['umpire'] })
}

export function useSetWeeklyAvailability() {
  const invalidate = useInvalidateUmpire()
  return useMutation({
    mutationFn: ({ dayOfWeek, isAvailable }: { dayOfWeek: number; isAvailable: boolean }) =>
      setWeeklyAvailability(dayOfWeek, isAvailable),
    onSuccess: invalidate,
  })
}

export function useSetDateAvailability() {
  const invalidate = useInvalidateUmpire()
  return useMutation({
    mutationFn: setDateAvailability,
    onSuccess: invalidate,
  })
}

export function useDeleteDateAvailability() {
  const invalidate = useInvalidateUmpire()
  return useMutation({
    mutationFn: (date: string) => deleteDateAvailability(date),
    onSuccess: invalidate,
  })
}
