import { useCallback, useEffect, useState } from 'react'
import { fetchMyNotifications, markNotificationRead, markAllNotificationsRead } from '../services/groundOpsApi.js'

// Phase 15 fix — errors used to be silently swallowed (`.catch(() => {})`),
// so a failed fetch left the bell showing a permanent, misleading "you're
// all caught up" instead of any error state. `error` is now surfaced so
// NotificationBell can render it and offer a retry.
export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return fetchMyNotifications({ limit: 10 })
      .then((data) => {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load notifications')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const markRead = async (id) => {
    await markNotificationRead(id)
    await load()
  }

  const markAllRead = async () => {
    await markAllNotificationsRead()
    await load()
  }

  return { notifications, unreadCount, loading, error, markRead, markAllRead, reload: load }
}
