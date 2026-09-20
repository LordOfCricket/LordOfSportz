import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { StaffHeader } from '../../src/components/staff/StaffHeader'
import { StaffGroundSelector } from '../../src/components/staff/StaffGroundSelector'
import { StatusBadge } from '../../src/components/owner/StatusBadge'
import { EmptyState } from '../../src/components/EmptyState'
import { useAuthStore } from '../../src/store/authStore'
import { useStaffDashboard } from '../../src/hooks/useStaffDashboard'
import { staffRoleLabel } from '../../src/utils/staffLabels'
import { orderStatusMeta } from '../../src/utils/canteenStatus'
import { formatDateLong, formatTime } from '../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

export default function StaffDashboardScreen() {
  const router = useRouter()
  const logout = useAuthStore((s) => s.logout)
  const vm = useStaffDashboard()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await vm.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Log out', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout()
          } finally {
            router.replace('/(auth)/login')
          }
        },
      },
    ])
  }

  const { status, membership, ground, membershipCount, sections, anySectionVisible } = vm

  return (
    <View style={styles.container}>
      <StaffHeader title={membership ? staffRoleLabel(membership.role) : 'Staff'} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {status === 'loading' ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : status === 'mfa' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Additional verification required</Text>
            <Text style={styles.cardBody}>
              This account needs extra verification that isn’t available in the app yet. Please sign in on the LOC
              website.
            </Text>
          </View>
        ) : status === 'error' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your staff access</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <RetryButton onPress={vm.refetch} />
          </View>
        ) : status === 'no-access' ? (
          <>
            <EmptyState
              icon="🔒"
              title="No active staff access"
              message="Your staff access to any ground has been removed or hasn’t been granted yet. Contact the ground owner if you think this is a mistake."
            />
            <LogoutRow onPress={handleLogout} />
          </>
        ) : (
          <>
            <StaffGroundSelector />

            {ground.city || membershipCount > 1 ? (
              <Text style={styles.groundContext}>
                {[
                  [ground.city, ground.state].filter(Boolean).join(', '),
                  membershipCount > 1 ? `${membershipCount} assigned grounds` : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            ) : null}

            {!anySectionVisible ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Modules</Text>
                <Text style={styles.cardBody}>
                  You don’t have any permissions for this ground yet. Ask the ground owner to grant access.
                </Text>
              </View>
            ) : null}

            {sections.matches ? (
              <SectionCard
                icon="cricket"
                title="Upcoming matches"
                count={sections.matches.totalUpcoming}
                section={sections.matches}
                emptyText="No upcoming matches."
                onPress={() => router.push('/(staff)/matches')}
                renderItem={(m) => (
                  <MiniRow
                    key={m.id}
                    primary={`${m.teamAName} v ${m.teamBName}`}
                    secondary={`${formatDateLong(m.matchDate)} · ${formatTime(m.matchDate)}`}
                  />
                )}
              />
            ) : null}

            {sections.bookings ? (
              <SectionCard
                icon="calendar-clock"
                title="Upcoming bookings"
                count={sections.bookings.totalUpcoming}
                section={sections.bookings}
                emptyText="No upcoming bookings."
                onPress={() => router.push('/(staff)/bookings')}
                renderItem={(b) => (
                  <MiniRow
                    key={b.publicBookingId}
                    primary={b.customerName || 'Booking'}
                    secondary={`${formatDateLong(b.startTime)} · ${formatTime(b.startTime)}`}
                  />
                )}
              />
            ) : null}

            {sections.canteen ? (
              sections.canteen.canteenCount > 1 ? (
                <View style={styles.card}>
                  <View style={styles.sectionTop}>
                    <CardHead icon="silverware-fork-knife" title="Canteen" />
                  </View>
                  <Text style={styles.cardBody}>
                    {sections.canteen.canteenCount} canteens on this ground.
                  </Text>
                  <TouchableOpacity
                    style={styles.viewAll}
                    hitSlop={8}
                    onPress={() => router.push('/(staff)/canteen')}
                    accessibilityRole="button"
                    accessibilityLabel="View canteen orders"
                  >
                    <Text style={styles.link}>Open canteen orders</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={LocColors.green} />
                  </TouchableOpacity>
                </View>
              ) : (
                <SectionCard
                  icon="silverware-fork-knife"
                  title={sections.canteen.canteenName ? `Canteen · ${sections.canteen.canteenName}` : 'Canteen'}
                  count={sections.canteen.activeCount ?? 0}
                  countLabel="active"
                  section={sections.canteen}
                  emptyText="No active orders."
                  onPress={() => router.push('/(staff)/canteen')}
                  renderItem={(o) => {
                    const meta = orderStatusMeta(o.status)
                    return (
                      <View key={o.id} style={styles.orderRow}>
                        <Text style={styles.orderId} numberOfLines={1}>
                          {o.id}
                        </Text>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </View>
                    )
                  }}
                />
              )
            ) : null}

            <SectionCard
              icon="bell-outline"
              title="Notifications"
              count={sections.notifications.unreadCount}
              countLabel="unread"
              section={sections.notifications}
              emptyText="No notifications."
              renderItem={(n) => (
                <MiniRow key={n.id} primary={n.title} secondary={`${formatDateLong(n.createdAt)} · ${formatTime(n.createdAt)}`} />
              )}
            />

            <LogoutRow onPress={handleLogout} />
          </>
        )}
      </ScrollView>
    </View>
  )
}

function CardHead({ icon, title }) {
  return (
    <View style={styles.cardHead}>
      <MaterialCommunityIcons name={icon} size={18} color={LocColors.green} />
      <Text style={styles.cardHeadTitle}>{title}</Text>
    </View>
  )
}

function SectionCard({ icon, title, count, countLabel, section, emptyText, renderItem, onPress }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionTop}>
        <CardHead icon={icon} title={title} />
        {typeof count === 'number' && count > 0 ? (
          <Text style={styles.count}>
            {count}
            {countLabel ? ` ${countLabel}` : ''}
          </Text>
        ) : null}
      </View>
      {section.isLoading ? (
        <ActivityIndicator color={LocColors.green} style={styles.sectionLoader} />
      ) : section.isError ? (
        <View style={styles.sectionErrorRow}>
          <Text style={styles.cardBody}>Couldn’t load this section.</Text>
          <TouchableOpacity onPress={() => section.refetch()} accessibilityRole="button">
            <Text style={styles.link}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (section.items ?? section.orders ?? []).length === 0 ? (
        <Text style={styles.emptyLine}>{emptyText}</Text>
      ) : (
        <View style={styles.rows}>{(section.items ?? section.orders).map(renderItem)}</View>
      )}
      {onPress ? (
        <TouchableOpacity style={styles.viewAll} hitSlop={8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`View all ${title}`}>
          <Text style={styles.link}>View all</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={LocColors.green} />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function MiniRow({ primary, secondary }) {
  return (
    <View style={styles.miniRow}>
      <Text style={styles.miniPrimary} numberOfLines={1}>
        {primary}
      </Text>
      <Text style={styles.miniSecondary} numberOfLines={1}>
        {secondary}
      </Text>
    </View>
  )
}

function RetryButton({ onPress }) {
  return (
    <TouchableOpacity style={styles.retryBtn} onPress={onPress} accessibilityRole="button">
      <Text style={styles.retryBtnText}>Retry</Text>
    </TouchableOpacity>
  )
}

function LogoutRow({ onPress }) {
  return (
    <TouchableOpacity style={styles.logoutRow} onPress={onPress} accessibilityRole="button">
      <MaterialCommunityIcons name="logout" size={18} color={LocColors.muted} />
      <Text style={styles.logoutText}>Log out</Text>
    </TouchableOpacity>
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
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardHeadTitle: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  count: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.greenStrong },
  groundContext: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: -Spacing.xs, marginLeft: Spacing.xs },
  rows: { gap: Spacing.xs, marginTop: Spacing.xs },
  miniRow: { paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: LocColors.border },
  miniPrimary: { fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy },
  miniSecondary: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  orderId: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  sectionLoader: { alignSelf: 'flex-start', marginTop: Spacing.xs },
  sectionErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: Spacing.xs },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  logoutText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
})
