import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { getMyUmpireProfile, updateMyUmpireProfile } from '../services/umpireApi'

function useUmpireUserId() {
  return useAuthStore((s) => s.user?.id)
}

function useUmpireEnabled() {
  return useAuthStore((s) => s.isUmpire && s.umpireApproval === 'approved')
}

export function useUmpireProfile() {
  const userId = useUmpireUserId()
  const enabled = useUmpireEnabled()
  return useQuery({
    queryKey: ['umpire', 'profile', userId],
    queryFn: getMyUmpireProfile,
    enabled: Boolean(userId) && enabled,
    staleTime: 1000 * 60 * 2,
  })
}

export function useUpdateUmpireProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateMyUmpireProfile,
    onSuccess: () => {
      // Profile + Home both read the umpire profile; Availability shows the
      // global toggle too.
      queryClient.invalidateQueries({ queryKey: ['umpire'] })
    },
  })
}
