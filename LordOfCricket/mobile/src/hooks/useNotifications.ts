import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as notificationApi from '../services/notificationApi'
import { useAuthStore } from '../store/authStore'

const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: number | string, limit: number, offset: number) =>
    [...notificationKeys.all, userId, 'list', limit, offset] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
}

export function useNotifications(limit: number = 20, offset: number = 0, enabled = true) {
  // Scope by the authenticated user so a previous account's feed can never
  // surface after an account switch (belt-and-braces alongside
  // queryClient.clear() on logout). Invalidation still targets the
  // ['notifications'] prefix, so mark-read/mark-all keep working.
  const userId = useAuthStore((s) => s.user?.id) ?? 'anon'
  return useQuery({
    queryKey: notificationKeys.list(userId, limit, offset),
    queryFn: () => notificationApi.getNotifications(limit, offset),
    enabled,
    staleTime: 1000 * 60, // 1 minute
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: number) => notificationApi.markNotificationRead(notificationId),
    onSuccess: (notification) => {
      // Invalidate all notification queries to refresh unread count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => notificationApi.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}
