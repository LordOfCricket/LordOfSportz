import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerHeader } from '../../src/components/owner/OwnerHeader'
import { GroundSelector } from '../../src/components/owner/GroundSelector'
import { MfaRequiredNotice } from '../../src/components/owner/MfaRequiredNotice'
import { EmptyState } from '../../src/components/EmptyState'
import { useActiveGround, useGroundOwnerDashboard } from '../../src/hooks/useMyGrounds'
import { useGroundNotifications } from '../../src/hooks/useOwnerNotifications'
import { ACTIVE_CANTEEN_ORDER_STATUSES } from '../../src/utils/canteenStatus'
import { isMfaRequiredError } from '../../src/utils/errors'
import { GroundOwnerDashboard } from '../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const GROUND_STATUS_LABEL: Record<string, string> = {
  MATCH_DAY: 'Match day',
  PARTIALLY_BLOCKED: 'Partially blocked',
  BOOKED: 'Booked',
  OPEN: 'Open',
}

const MANAGE_LINKS = [
  { icon: 'cog-outline', label: 'Manage ground content', help: 'Profile, location, photos, amenities, pricing', route: '/(owner)/ground' },
  { icon: 'calendar-clock', label: 'Bookings', help: 'Bookings, availability, staff blocks', route: '/(owner)/bookings' },
  { icon: 'cricket', label: 'Matches & umpires', help: 'Matches, lifecycle, umpire staffing', route: '/(owner)/matches' },
  { icon: 'silverware-fork-knife', label: 'Canteen', help: 'Menu, today’s menu, orders', route: '/(owner)/canteen' },
  { icon: 'account-hard-hat', label: 'Staff', help: 'Staff members and permissions', route: '/(owner)/staff' },
  { icon: 'chart-box-outline', label: 'Analytics', help: 'KPIs and day-by-day trends', route: '/(owner)/analytics' },
  { icon: 'star-outline', label: 'Reviews', help: 'Player ratings for this ground', route: '/(owner)/reviews' },
  { icon: 'bell-outline', label: 'Notifications', help: 'Ground activity alerts', route: '/(owner)/notifications' },
  { icon: 'account-search-outline', label: 'Browse umpires', help: 'Ranked umpire directory', route: '/(owner)/browse-umpires' },
] as const

type OwnerRoute = (typeof MANAGE_LINKS)[number]['route']
type ActionItem = {
  key: string
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']
  text: string
  route: OwnerRoute
}

export default function OwnerDashboardScreen() {
  const router = useRouter()
  const { grounds, activeGround, isLoading, isError, refetch, isRefetching } = useActiveGround()
  const dashboard = useGroundOwnerDashboard(activeGround?.publicGroundId)
  const notifications = useGroundNotifications(activeGround?.publicGroundId, 1)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetch(), dashboard.refetch(), notifications.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  const actionItems = buildActionItems(activeGround?.status, dashboard.data, notifications.data?.unreadCount ?? 0)

  return (
    <View style={styles.container}>
      <OwnerHeader title="Dashboard" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your grounds</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <RetryButton onPress={() => refetch()} busy={isRefetching} />
          </View>
        ) : grounds.length === 0 || !activeGround ? (
          <EmptyState
            icon="🏟️"
            title="No grounds yet"
            message="You don’t own any grounds on LOC yet. Register a ground on the LOC website to manage it here."
          />
        ) : (
          <>
            <GroundSelector />

            <View style={styles.card}>
              <Text style={styles.groundName}>{activeGround.name}</Text>
              {activeGround.city ? (
                <Text style={styles.groundMeta}>
                  {[activeGround.city, activeGround.state].filter(Boolean).join(', ')}
                </Text>
              ) : null}
              <View style={styles.badgeRow}>
                <Badge label={activeGround.status} tone={activeGround.status === 'ACTIVE' ? 'good' : 'neutral'} />
              </View>
            </View>

            {dashboard.data ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Needs attention</Text>
                {actionItems.length === 0 ? (
                  <View style={styles.clearRow}>
                    <MaterialCommunityIcons name="check-circle-outline" size={18} color={LocColors.green} />
                    <Text style={styles.clearText}>You’re all caught up.</Text>
                  </View>
                ) : (
                  actionItems.map((item, i) => (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.actionItemRow, i > 0 && styles.actionItemDivider]}
                      onPress={() => router.push(item.route)}
                      accessibilityRole="button"
                      accessibilityLabel={item.text}
                    >
                      <MaterialCommunityIcons name={item.icon} size={18} color={LocColors.green} />
                      <Text style={styles.actionItemText}>{item.text}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.faint} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}

            {MANAGE_LINKS.map((link) => (
              <TouchableOpacity
                key={link.route}
                style={styles.actionCard}
                onPress={() => router.push(link.route)}
                accessibilityRole="button"
                accessibilityLabel={link.label}
              >
                <MaterialCommunityIcons name={link.icon} size={20} color={LocColors.green} />
                <View style={styles.actionText}>
                  <Text style={styles.actionTitle}>{link.label}</Text>
                  <Text style={styles.actionHelp}>{link.help}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
              </TouchableOpacity>
            ))}

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Today</Text>
              {isMfaRequiredError(dashboard.error) ? (
                <MfaRequiredNotice />
              ) : dashboard.isLoading ? (
                <View style={styles.centerPad}>
                  <ActivityIndicator color={LocColors.green} />
                </View>
              ) : dashboard.isError ? (
                <>
                  <Text style={styles.cardBody}>Activity for this ground is unavailable right now.</Text>
                  <RetryButton onPress={() => dashboard.refetch()} busy={dashboard.isRefetching} />
                </>
              ) : dashboard.data ? (
                <View style={styles.statList}>
                  <Row label="Status" value={GROUND_STATUS_LABEL[dashboard.data.groundStatus] ?? dashboard.data.groundStatus} />
                  <Row label="Bookings today" value={String(dashboard.data.today.bookingsCount)} />
                  <Row label="Matches today" value={String(dashboard.data.today.matchesCount)} />
                  <Row label="Blocks today" value={String(dashboard.data.today.blocksCount)} />
                  <Row label="Upcoming matches (7 days)" value={String(dashboard.data.upcoming7Days.matches.length)} />
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

// Only items derivable from data the dashboard already loads — no invented
// counts, no extra endpoints.
function buildActionItems(
  status: string | undefined,
  dashboard: GroundOwnerDashboard | undefined,
  unreadCount: number,
): ActionItem[] {
  const items: ActionItem[] = []
  if (status && status !== 'ACTIVE') {
    items.push({ key: 'status', icon: 'alert-circle-outline', text: `Ground is ${status} — not accepting bookings`, route: '/(owner)/ground' })
  }
  if (unreadCount > 0) {
    items.push({ key: 'notifications', icon: 'bell-outline', text: `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`, route: '/(owner)/notifications' })
  }
  if (dashboard) {
    const activeOrders = ACTIVE_CANTEEN_ORDER_STATUSES.reduce((sum, s) => sum + (dashboard.canteen.ordersByStatus[s] ?? 0), 0)
    if (activeOrders > 0) {
      items.push({ key: 'orders', icon: 'silverware-fork-knife', text: `${activeOrders} canteen order${activeOrders === 1 ? '' : 's'} in progress`, route: '/(owner)/canteen' })
    }
    if (dashboard.canteen.lowStockItems.length > 0) {
      items.push({ key: 'low-stock', icon: 'package-down', text: `${dashboard.canteen.lowStockItems.length} canteen item${dashboard.canteen.lowStockItems.length === 1 ? '' : 's'} low on stock`, route: '/(owner)/canteen' })
    }
    if (dashboard.today.matchesCount > 0) {
      items.push({ key: 'matches', icon: 'cricket', text: `${dashboard.today.matchesCount} match${dashboard.today.matchesCount === 1 ? '' : 'es'} today`, route: '/(owner)/matches' })
    }
  }
  return items
}

function RetryButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.retryBtn, busy && styles.retryBtnDisabled]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
    >
      <Text style={styles.retryBtnText}>{busy ? 'Retrying…' : 'Retry'}</Text>
    </TouchableOpacity>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

function Badge({ label, tone }: { label: string; tone: 'good' | 'neutral' }) {
  return (
    <View style={[styles.badge, tone === 'good' ? styles.badgeGood : styles.badgeNeutral]}>
      <Text style={[styles.badgeText, tone === 'good' ? styles.badgeTextGood : styles.badgeTextNeutral]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing['3xl'], gap: Spacing.lg },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  groundName: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  groundMeta: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
  },
  actionText: { flex: 1 },
  actionTitle: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  actionHelp: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  clearText: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  actionItemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  actionItemDivider: { borderTopWidth: 1, borderTopColor: LocColors.border },
  actionItemText: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  statList: { gap: Spacing.xs, marginTop: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnDisabled: { opacity: 0.6 },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  badge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeGood: { backgroundColor: LocColors.greenPale },
  badgeNeutral: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  badgeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
  badgeTextGood: { color: LocColors.greenStrong },
  badgeTextNeutral: { color: LocColors.muted },
})
