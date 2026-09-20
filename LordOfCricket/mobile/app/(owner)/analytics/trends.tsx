import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { MfaRequiredNotice } from '../../../src/components/owner/MfaRequiredNotice'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundAnalyticsTrends } from '../../../src/hooks/useOwnerAnalytics'
import { isMfaRequiredError } from '../../../src/utils/errors'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { OwnerAnalyticsRange } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const RANGES: { key: OwnerAnalyticsRange; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'LAST_7_DAYS', label: '7 days' },
  { key: 'LAST_30_DAYS', label: '30 days' },
]

const VALID: OwnerAnalyticsRange[] = ['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS']

export default function OwnerAnalyticsTrendsScreen() {
  const params = useLocalSearchParams<{ range?: string }>()
  const initial = VALID.includes(params.range as OwnerAnalyticsRange)
    ? (params.range as OwnerAnalyticsRange)
    : 'LAST_7_DAYS'
  const [range, setRange] = useState<OwnerAnalyticsRange>(initial)
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const trends = useGroundAnalyticsTrends(publicGroundId, range)

  const days = trends.data?.days ?? []
  const maxUtil = Math.max(1, ...days.map((d) => d.utilizedPercentage ?? 0))

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Trends" subtitle={activeGround?.name} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={trends.isRefetching} onRefresh={() => trends.refetch()} tintColor={LocColors.green} />}
      >
        <View style={styles.segment}>
          {RANGES.map((r) => {
            const active = range === r.key
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setRange(r.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {trends.isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isMfaRequiredError(trends.error) ? (
          <MfaRequiredNotice />
        ) : trends.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load trends.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => trends.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : days.length === 0 ? (
          <EmptyState icon="📈" title="No trend data" message="There is no day-by-day activity for this range yet." />
        ) : (
          <View style={styles.list}>
            {days.map((d) => {
              const util = d.utilizedPercentage
              const barPct = Math.max(0, Math.min(100, Math.round(((util ?? 0) / maxUtil) * 100)))
              return (
                <View key={d.date} style={styles.card}>
                  <Text style={styles.date}>{formatDateLong(`${d.date}T00:00:00`)}</Text>
                  <View style={styles.statsRow}>
                    <Stat label="Bookings" value={String(d.bookingCount)} />
                    <Stat label="Canteen ₹" value={`₹${d.canteenRevenue}`} />
                    <Stat label="Utilization" value={util == null ? '—' : `${util.toFixed(1)}%`} />
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${barPct}%` }]} />
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  segment: {
    flexDirection: 'row',
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: LocColors.green },
  segmentText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  segmentTextActive: { color: LocColors.surface },
  list: { gap: Spacing.sm },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  date: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  statLabel: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: LocColors.mint, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: LocColors.greenBright },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
