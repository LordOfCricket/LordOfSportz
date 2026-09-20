import React, { useState } from 'react'
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../src/store/authStore'
import { useTabBarScroll } from '../../src/components/navigation/TabBarScrollContext'
import { useUmpireProfile } from '../../src/hooks/useUmpireProfile'
import { useUmpireProposals } from '../../src/hooks/useUmpireSecondary'
import { useNotifications } from '../../src/hooks/useNotifications'
import { UmpireHeader } from '../../src/components/umpire/UmpireHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function UmpireHomeScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { scrollHandler } = useTabBarScroll()
  const { data: profile, isLoading, isError, refetch, isRefetching } = useUmpireProfile()
  const proposalsQuery = useUmpireProposals()
  const notificationsQuery = useNotifications(1, 0)
  const [refreshing, setRefreshing] = useState(false)

  const pendingProposals = (proposalsQuery.data ?? []).filter((p) => p.status === 'PENDING').length
  const unread = notificationsQuery.data?.unreadCount ?? 0

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const verified = profile?.verified ?? false
  const available = profile?.is_available ?? null
  const officiated = profile?.matches_officiated ?? 0
  const ratingAvg = profile?.rating_avg ?? null
  const ratingCount = profile?.rating_count ?? 0

  return (
    <View style={styles.container}>
      <UmpireHeader title="Umpire" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <Text style={styles.greeting}>
          {greeting()},{'\n'}
          <Text style={styles.name}>{user?.name || 'Umpire'}</Text>
        </Text>
        <Text style={styles.subtitle}>Your umpiring workspace</Text>

        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your status</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity
              style={[styles.retryBtn, isRefetching && styles.btnDisabled]}
              onPress={() => refetch()}
              disabled={isRefetching}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Account</Text>
              <StatusRow
                icon={verified ? 'shield-check' : 'shield-alert-outline'}
                label="Verification"
                value={verified ? 'Verified umpire' : 'Approved · not yet verified'}
                tone={verified ? 'good' : 'neutral'}
              />
              <StatusRow
                icon={available ? 'check-circle-outline' : 'pause-circle-outline'}
                label="Availability"
                value={available == null ? '—' : available ? 'Available for matches' : 'Not available'}
                tone={available ? 'good' : 'neutral'}
                last
              />
            </View>

            {officiated > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Record</Text>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{officiated}</Text>
                    <Text style={styles.statCaption}>Matches officiated</Text>
                  </View>
                  {ratingCount > 0 && ratingAvg != null && (
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{Number(ratingAvg).toFixed(1)}</Text>
                      <Text style={styles.statCaption}>Avg rating · {ratingCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>No assignments yet</Text>
                <Text style={styles.cardBody}>
                  Once you officiate matches, your record and ratings will appear here. Use the tabs below to set your
                  availability and discover matches that need an umpire.
                </Text>
              </View>
            )}
          </>
        )}

        {pendingProposals > 0 && (
          <TouchableOpacity
            style={styles.nudge}
            onPress={() => router.push('/(umpire)/proposals')}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="email-alert-outline" size={20} color={LocColors.greenStrong} />
            <Text style={styles.nudgeText}>
              {pendingProposals} umpiring offer{pendingProposals === 1 ? '' : 's'} awaiting your response
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.greenStrong} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.quickRow}
          onPress={() => router.push('/(umpire)/notifications')}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="bell-outline" size={18} color={LocColors.green} />
          <Text style={styles.quickLabel}>Notifications</Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.faint} />
        </TouchableOpacity>
      </Animated.ScrollView>
    </View>
  )
}

function StatusRow({
  icon,
  label,
  value,
  tone,
  last,
}: {
  icon: any
  label: string
  value: string
  tone: 'good' | 'neutral'
  last?: boolean
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={tone === 'good' ? LocColors.green : LocColors.faint}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.lg },
  greeting: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: '800',
    color: LocColors.navy,
    lineHeight: Typography.fontSize['2xl'] * 1.2,
  },
  name: { color: LocColors.greenStrong },
  subtitle: { fontSize: Typography.fontSize.sm, color: LocColors.muted, marginTop: -Spacing.sm },
  centerPad: { paddingVertical: Spacing['3xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
    marginBottom: Spacing.xs,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: LocColors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  rowValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  statRow: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.xs },
  stat: { gap: 2 },
  statValue: { fontSize: Typography.fontSize['2xl'], fontWeight: '800', color: LocColors.greenStrong },
  statCaption: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  btnDisabled: { opacity: 0.6 },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: LocColors.greenPale,
    borderWidth: 1,
    borderColor: LocColors.green,
  },
  nudgeText: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.greenStrong },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
  },
  quickLabel: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  badge: { minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: LocColors.green, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
