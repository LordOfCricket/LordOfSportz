import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../src/components/owner/GroundSelector'
import { MfaRequiredNotice } from '../../src/components/owner/MfaRequiredNotice'
import { EmptyState } from '../../src/components/EmptyState'
import { useActiveGround } from '../../src/hooks/useMyGrounds'
import {
  useGroundNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../src/hooks/useOwnerNotifications'
import { isMfaRequiredError } from '../../src/utils/errors'
import { formatDateLong, formatTime } from '../../src/utils/bookingFormat'
import { OwnerGroundNotification } from '../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const PAGE = 20

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name']

function iconFor(type: string): IconName {
  if (type.startsWith('CANTEEN')) return 'silverware-fork-knife'
  if (type.startsWith('UMPIRE') || type.startsWith('MATCH')) return 'cricket'
  if (type.includes('BOOKING')) return 'calendar-clock'
  if (type.startsWith('GROUND_STAFF')) return 'account-hard-hat'
  return 'bell-outline'
}

export default function OwnerNotificationsScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const [limit, setLimit] = useState(PAGE)
  const notifs = useGroundNotifications(publicGroundId, limit)
  const markRead = useMarkNotificationRead(publicGroundId ?? '')
  const markAll = useMarkAllNotificationsRead(publicGroundId ?? '')

  const list = notifs.data?.notifications ?? []
  const total = notifs.data?.total ?? 0
  const unread = notifs.data?.unreadCount ?? 0

  const onPress = (n: OwnerGroundNotification) => {
    if (!n.isRead) markRead.mutate(n.id)
    // Only match notifications carry an id the owner routes can resolve
    // (matches/:id is an internal integer and the detail screen re-checks
    // ground scope). Booking/order ids here are internal, not public ids.
    if (n.relatedMatchId != null) {
      router.push(`/(owner)/matches/${n.relatedMatchId}`)
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Notifications" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to view its notifications." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Notifications"
        subtitle={activeGround?.name}
        right={
          unread > 0 ? (
            <TouchableOpacity onPress={() => markAll.mutate()} disabled={markAll.isPending} accessibilityRole="button" accessibilityLabel="Mark all read">
              {markAll.isPending ? <ActivityIndicator color={LocColors.green} /> : <Text style={styles.markAll}>Mark all</Text>}
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={notifs.isRefetching} onRefresh={() => notifs.refetch()} tintColor={LocColors.green} />}
      >
        <GroundSelector />

        {notifs.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isMfaRequiredError(notifs.error) ? (
          <MfaRequiredNotice />
        ) : notifs.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load notifications.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => notifs.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <EmptyState icon="🔔" title="No notifications" message="Ground activity for this ground will show up here." />
        ) : (
          <>
            {unread > 0 ? <Text style={styles.unreadLine}>{unread} unread</Text> : null}
            {list.map((n) => {
              const navigable = n.relatedMatchId != null
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.row, !n.isRead && styles.rowUnread]}
                  onPress={() => onPress(n)}
                  accessibilityRole="button"
                  accessibilityLabel={n.title}
                >
                  <View style={styles.iconWrap}>
                    <MaterialCommunityIcons name={iconFor(n.type)} size={18} color={LocColors.green} />
                    {!n.isRead ? <View style={styles.dot} /> : null}
                  </View>
                  <View style={styles.body}>
                    <Text style={[styles.title, !n.isRead && styles.titleUnread]} numberOfLines={2}>
                      {n.title}
                    </Text>
                    {n.body ? (
                      <Text style={styles.text} numberOfLines={3}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text style={styles.time}>
                      {formatDateLong(n.createdAt)} · {formatTime(n.createdAt)}
                    </Text>
                  </View>
                  {navigable ? <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} /> : null}
                </TouchableOpacity>
              )
            })}
            {list.length < total ? (
              <TouchableOpacity style={styles.moreBtn} onPress={() => setLimit((l) => l + PAGE)} accessibilityRole="button">
                <Text style={styles.moreBtnText}>Load more</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  markAll: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  unreadLine: { fontSize: Typography.fontSize.xs, color: LocColors.muted, fontWeight: Typography.fontWeight.semibold },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  rowUnread: { borderColor: LocColors.green, backgroundColor: LocColors.greenPale },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: LocColors.green },
  body: { flex: 1, gap: 2 },
  title: { fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy },
  titleUnread: { fontWeight: '800' },
  text: { fontSize: Typography.fontSize.xs, color: LocColors.muted, lineHeight: Typography.fontSize.xs * 1.5 },
  time: { fontSize: Typography.fontSize.xs, color: LocColors.faint, marginTop: 2 },
  moreBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  moreBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
