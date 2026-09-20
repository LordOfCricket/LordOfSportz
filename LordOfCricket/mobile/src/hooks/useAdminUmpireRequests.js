import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUmpireRequests, decideUmpireRequest } from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

export function useAdminUmpireRequests() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.umpireRequests(userId),
    queryFn: fetchUmpireRequests,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 30,
    retry: false,
  })
}

// Body is { status: 'approved' | 'rejected' }. A decided request drops out
// of the pending list on the next fetch, so success + error both just
// reconcile the list.
export function useDecideUmpireRequest() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }) => decideUmpireRequest(id, status),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.umpireRequests(userId) })
    },
  })
}
