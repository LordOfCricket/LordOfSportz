import React from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { SubScreenHeader } from '../../src/components/umpire/SubScreenHeader'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '../../src/hooks/useNotifications'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'
import type { Notification } from '../../src/types'

function ago(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function UmpireNotificationsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications(30, 0)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const items = data?.notifications ?? []
  const unread = data?.unreadCount ?? 0

  const open = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id)
    if (n.relatedMatchId) router.push(`/(umpire)/matches/${n.relatedMatchId}` as any)
  }

  return (
    <View style={styles.container}>
      <SubScreenHeader
        title="Notifications"
        right={
          unread > 0 ? (
            <TouchableOpacity
              onPress={() => markAll.mutate()}
              disabled={markAll.isPending}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.markAll}>{markAll.isPending ? '…' : 'Mark all'}</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={LocColors.green} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={LocColors.green} />
            </View>
          ) : isError ? (
            <View style={styles.centerPad}>
              <Text style={styles.stateTitle}>Couldn’t load notifications</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.centerPad}>
              <MaterialCommunityIcons name="bell-outline" size={36} color={LocColors.border} />
              <Text style={styles.stateTitle}>You’re all caught up</Text>
              <Text style={styles.stateBody}>Assignment offers and match reminders will appear here.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, !item.isRead && styles.rowUnread]}
            onPress={() => open(item)}
            accessibilityRole="button"
          >
            {!item.isRead && <View style={styles.dot} />}
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {!!item.body && (
                <Text style={styles.rowBody} numberOfLines={3}>
                  {item.body}
                </Text>
              )}
              <Text style={styles.rowTime}>{ago(item.createdAt)}</Text>
            </View>
            {item.relatedMatchId ? (
              <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.faint} />
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  listContent: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  centerPad: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  stateTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy, marginTop: Spacing.sm },
  stateBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  markAll: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
  },
  rowUnread: { borderColor: LocColors.green, backgroundColor: '#F0FDF4' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LocColors.green, marginTop: 6 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  rowBody: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2, lineHeight: Typography.fontSize.xs * 1.5 },
  rowTime: { fontSize: 11, color: LocColors.faint, marginTop: 4 },
})
