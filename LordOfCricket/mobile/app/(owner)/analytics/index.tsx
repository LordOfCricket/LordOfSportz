import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { KpiCard } from '../../../src/components/owner/KpiCard'
import { MfaRequiredNotice } from '../../../src/components/owner/MfaRequiredNotice'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundAnalytics, useGroundAnalyticsCsv } from '../../../src/hooks/useOwnerAnalytics'
import { isMfaRequiredError, getErrorMessage } from '../../../src/utils/errors'
import { OwnerAnalyticsRange } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const RANGES: { key: OwnerAnalyticsRange; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'LAST_7_DAYS', label: '7 days' },
  { key: 'LAST_30_DAYS', label: '30 days' },
]

function pct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function hrs(v: number): string {
  return `${Number(v).toFixed(1)} h`
}

export default function OwnerAnalyticsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const [range, setRange] = useState<OwnerAnalyticsRange>('LAST_7_DAYS')
  const analytics = useGroundAnalytics(publicGroundId, range)
  const csv = useGroundAnalyticsCsv(publicGroundId ?? '')
  const [csvOpen, setCsvOpen] = useState(false)

  const data = analytics.data

  const onExport = async () => {
    try {
      await csv.mutateAsync(range)
      setCsvOpen(true)
    } catch {
      setCsvOpen(true)
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Analytics" />
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Select a ground to view its analytics.</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Analytics"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity onPress={() => router.push({ pathname: '/(owner)/analytics/trends', params: { range } })} accessibilityRole="button" accessibilityLabel="Trends">
            <MaterialCommunityIcons name="chart-line" size={22} color={LocColors.green} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={analytics.isRefetching} onRefresh={() => analytics.refetch()} tintColor={LocColors.green} />}
      >
        <GroundSelector />

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

        {analytics.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isMfaRequiredError(analytics.error) ? (
          <MfaRequiredNotice />
        ) : analytics.isError || !data ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load analytics.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => analytics.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.rangeLabel}>{data.dateRange}</Text>

            <View style={styles.grid}>
              <KpiCard
                label="Bookings"
                value={String(data.metrics.totalBookings)}
                sub={`${data.metrics.confirmedBookings} confirmed · ${data.metrics.cancelledBookings} cancelled · ${data.metrics.noShowBookings} no-show`}
              />
              <KpiCard label="Booked hours" value={hrs(data.metrics.totalBookedHours)} sub={`avg ${data.metrics.averageBookingHours} h / booking`} />
              <KpiCard label="Utilization" value={pct(data.utilization.utilizedPercentage)} sub={`${data.utilization.totalHours} open hrs`} />
              <KpiCard label="Free hours" value={hrs(data.utilization.freeHours)} />
              <KpiCard label="Match hours" value={hrs(data.utilization.matchHours)} />
              <KpiCard label="Blocked hours" value={hrs(data.utilization.blockedHours)} />
              <KpiCard label="Canteen revenue" value={`₹${data.canteenRevenue.revenue}`} sub={`${data.canteenRevenue.orderCount} orders`} />
              <KpiCard label="Avg order value" value={`₹${data.canteenRevenue.averageOrderValue}`} />
            </View>

            <TouchableOpacity style={styles.exportBtn} onPress={onExport} disabled={csv.isPending} accessibilityRole="button">
              {csv.isPending ? (
                <ActivityIndicator color={LocColors.green} />
              ) : (
                <>
                  <MaterialCommunityIcons name="file-delimited-outline" size={16} color={LocColors.green} />
                  <Text style={styles.exportBtnText}>Export CSV</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.exportNote}>Preview only — save a CSV file from the LOC website.</Text>
          </>
        )}
      </ScrollView>

      <Modal visible={csvOpen} transparent animationType="slide" onRequestClose={() => setCsvOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Analytics CSV</Text>
              <TouchableOpacity onPress={() => setCsvOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
                <MaterialCommunityIcons name="close" size={22} color={LocColors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.csvScroll} horizontal>
              <Text selectable style={styles.csvText}>
                {csv.isError ? getErrorMessage(csv.error) : csv.data ?? ''}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  rangeLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    marginTop: Spacing.sm,
  },
  exportBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  exportNote: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    maxHeight: '70%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  csvScroll: { backgroundColor: LocColors.mint, borderRadius: BorderRadius.md, padding: Spacing.md },
  csvText: { fontSize: Typography.fontSize.xs, color: LocColors.ink, fontFamily: 'monospace' },
})
