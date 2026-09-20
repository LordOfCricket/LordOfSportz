import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchGrounds, suspendGround, reactivateGround } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

// Platform-wide ground oversight. The list endpoint is unpaginated; search
// and status filtering are client-side (see the list screen). Backend
// re-authorizes every call as SUPER_ADMIN.
export function useAdminGrounds() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.grounds(userId),
    queryFn: fetchGrounds,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 30,
    retry: false,
  })
}

// Derives one ground from the cached list — there is no Super Admin
// ground-detail endpoint.
export function useAdminGround(publicGroundId) {
  const query = useAdminGrounds()
  const ground = useMemo(
    () => (query.data ?? []).find((g) => g.publicGroundId === publicGroundId) ?? null,
    [query.data, publicGroundId],
  )
  return { ...query, ground }
}

function useGroundStatusMutation(mutationFn) {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const key = adminKeys.grounds(userId)

  return useMutation({
    mutationFn,
    onSuccess: (updated) => {
      if (updated?.publicGroundId) {
        queryClient.setQueryData(key, (old) =>
          Array.isArray(old) ? old.map((g) => (g.publicGroundId === updated.publicGroundId ? updated : g)) : old,
        )
      }
      queryClient.invalidateQueries({ queryKey: key })
    },
    onError: () => {
      // Status may have changed elsewhere — reconcile with the server.
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useSuspendGround() {
  return useGroundStatusMutation(suspendGround)
}

export function useReactivateGround() {
  return useGroundStatusMutation(reactivateGround)
}
