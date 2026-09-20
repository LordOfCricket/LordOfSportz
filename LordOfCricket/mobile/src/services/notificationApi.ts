import api from './api'
import { Notification, NotificationsResponse } from '../types'

// The API returns raw DB rows (snake_case) with no serializer; the app's
// Notification type is camelCase. Normalize here so both stay true.
function normalizeNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    type: row.type,
    title: row.title,
    body: row.body ?? undefined,
    relatedBookingId: row.relatedBookingId ?? row.related_booking_id ?? undefined,
    relatedMatchId: row.relatedMatchId ?? row.related_match_id ?? undefined,
    isRead: row.isRead ?? row.is_read ?? false,
    createdAt: row.createdAt ?? row.created_at,
  }
}

export async function getNotifications(limit: number = 20, offset: number = 0): Promise<NotificationsResponse> {
  const response = await api.get<any>('/ground/notifications', { params: { limit, offset } })
  return {
    notifications: (response.data?.notifications ?? []).map(normalizeNotification),
    total: response.data?.total ?? 0,
    unreadCount: response.data?.unreadCount ?? 0,
  }
}

export async function markNotificationRead(notificationId: number): Promise<Notification> {
  const response = await api.post<{ notification: any }>(`/ground/notifications/${notificationId}/read`)
  return normalizeNotification(response.data.notification)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/ground/notifications/read-all')
}
