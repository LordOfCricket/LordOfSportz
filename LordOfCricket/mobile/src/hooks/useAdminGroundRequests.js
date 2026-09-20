import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchGroundRequests,
  fetchGroundRequest,
  rejectGroundRequest,
  requestGroundInformation,
} from '../services/adminApi'
import { useAuthStore } from '../store/authStore'
import { adminKeys } from './adminKeys'

export function useAdminGroundRequests() {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.groundRequests(userId),
    queryFn: fetchGroundRequests,
    enabled: Boolean(userId) && isSuperAdmin,
    staleTime: 1000 * 30,
    retry: false,
  })
}

// Real detail fetch — opening a PENDING request moves it to UNDER_REVIEW
// server-side, so this is a genuine GET, not a list-derived view.
export function useAdminGroundRequest(publicRequestId) {
  const userId = useAuthStore((s) => s.user?.id)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  return useQuery({
    queryKey: adminKeys.groundRequest(userId, publicRequestId),
    queryFn: () => fetchGroundRequest(publicRequestId),
    enabled: Boolean(userId) && isSuperAdmin && Boolean(publicRequestId),
    staleTime: 1000 * 15,
    retry: false,
  })
}

function useGroundRequestDecision(mutationFn) {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicRequestId, value }) => mutationFn(publicRequestId, value),
    onSettled: (_data, _err, { publicRequestId }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.groundRequests(userId) })
      queryClient.invalidateQueries({ queryKey: adminKeys.groundRequest(userId, publicRequestId) })
    },
  })
}

export function useRejectGroundRequest() {
  return useGroundRequestDecision(rejectGroundRequest)
}

export function useRequestGroundInformation() {
  return useGroundRequestDecision(requestGroundInformation)
}
