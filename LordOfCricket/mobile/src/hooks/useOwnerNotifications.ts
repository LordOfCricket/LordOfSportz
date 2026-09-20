import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groundOwnerApi from '../services/groundOwnerApi'
import { groundOwnerKeys } from './useMyGrounds'

export function useGroundNotifications(publicGroundId: string | undefined, limit: number) {
  return useQuery({
    queryKey: groundOwnerKeys.notifications(publicGroundId ?? 'none', limit),
    queryFn: () => groundOwnerApi.fetchGroundNotifications(publicGroundId as string, { limit, offset: 0 }),
    enabled: Boolean(publicGroundId),
    staleTime: 1000 * 30,
    retry: false,
  })
}

function useNotificationsInvalidation(publicGroundId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: groundOwnerKeys.notificationsRoot(publicGroundId) })
}

export function useMarkNotificationRead(publicGroundId: string) {
  const invalidate = useNotificationsInvalidation(publicGroundId)
  return useMutation({
    mutationFn: (notificationId: number) =>
      groundOwnerApi.markGroundNotificationRead(publicGroundId, notificationId),
    onSuccess: invalidate,
  })
}

export function useMarkAllNotificationsRead(publicGroundId: string) {
  const invalidate = useNotificationsInvalidation(publicGroundId)
  return useMutation({
    mutationFn: () => groundOwnerApi.markAllGroundNotificationsRead(publicGroundId),
    onSuccess: invalidate,
  })
}
