import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../src/hooks/useNotifications'
import { Colors, Spacing, Typography } from '../../src/constants/colors'
import { LoadingScreen } from '../../src/components/LoadingScreen'
import { ErrorScreen } from '../../src/components/ErrorScreen'
import { EmptyState } from '../../src/components/EmptyState'
import { Notification } from '../../src/types'

const PAGE_SIZE = 20

export default function NotificationsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [offset, setOffset] = useState(0)
  const [allNotifications, setAllNotifications] = useState<Notification[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const notificationsQuery = useNotifications(PAGE_SIZE, offset, user?.role === 'player')
  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()

  React.useEffect(() => {
    const page = notificationsQuery.data?.notifications
    if (!page) return
    setAllNotifications((prev) => (offset === 0 ? page : [...prev, ...page]))
  }, [notificationsQuery.data?.notifications, offset])

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    setOffset(0)
    setAllNotifications([])
    try {
      await notificationsQuery.refetch()
    } finally {
      setRefreshing(false)
    }
  }, [notificationsQuery])

  const handleLoadMore = React.useCallback(() => {
    if (
      notificationsQuery.data?.total &&
      allNotifications.length < notificationsQuery.data.total &&
      !notificationsQuery.isPending
    ) {
      setOffset((prev) => prev + PAGE_SIZE)
    }
  }, [notificationsQuery.data, allNotifications.length, notificationsQuery.isPending])

  const handleNotificationTap = async (notification: Notification) => {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id)
    }

    // Navigate to related resource if available
    if (notification.relatedBookingId) {
      router.push(`/(tabs)/bookings/${notification.relatedBookingId}`)
    } else if (notification.relatedMatchId) {
      router.push(`/(tabs)/matches/${notification.relatedMatchId}`)
    }
  }

  const handleMarkAllRead = () => {
    if (notificationsQuery.data?.unreadCount && notificationsQuery.data.unreadCount > 0) {
      markAllReadMutation.mutate()
    }
  }

  if (!user || user.role !== 'player') {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState title="Not Logged In" message="Please log in to view notifications." />
      </SafeAreaView>
    )
  }

  if (notificationsQuery.isPending && offset === 0) {
    return <LoadingScreen />
  }

  if (notificationsQuery.error && offset === 0) {
    return (
      <ErrorScreen
        title="Failed to Load Notifications"
        message="Could not load your notifications."
        onRetry={() => notificationsQuery.refetch()}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {notificationsQuery.data?.unreadCount ? (
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markAllReadMutation.isPending}>
            <Text style={styles.markAllButton}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {allNotifications.length === 0 ? (
        <EmptyState title="No Notifications" message="You're all caught up!" />
      ) : (
        <FlatList
          data={allNotifications}
          keyExtractor={(item) => `${item.id}`}
          renderItem={({ item }) => (
            <NotificationCard
              notification={item}
              onPress={() => handleNotificationTap(item)}
              isLoading={markReadMutation.isPending}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
          ListFooterComponent={
            notificationsQuery.data && allNotifications.length < notificationsQuery.data.total ? (
              <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} disabled={notificationsQuery.isPending}>
                <Text style={styles.loadMoreText}>Load More</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

function NotificationCard({
  notification,
  onPress,
  isLoading,
}: {
  notification: Notification
  onPress: () => void
  isLoading: boolean
}) {
  const backgroundColor = notification.isRead ? Colors.background : '#F0F8FF'

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor }]}
      onPress={onPress}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={`${notification.isRead ? 'Read' : 'Unread'} notification: ${notification.title}`}
    >
      <View style={styles.cardContent}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{notification.title}</Text>
          {!notification.isRead && <View style={styles.unreadDot} />}
        </View>
        {notification.body && <Text style={styles.body}>{notification.body}</Text>}
        <Text style={styles.time}>{formatTime(notification.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  )
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  markAllButton: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.sm,
  },
  card: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardContent: {
    gap: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  body: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  time: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  loadMore: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  loadMoreText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
})
