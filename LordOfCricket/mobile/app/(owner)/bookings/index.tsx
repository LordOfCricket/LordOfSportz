import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { BookingRow } from '../../../src/components/owner/BookingRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundBookings } from '../../../src/hooks/useGroundBookings'
import { groundTodayDateStr, toGroundDateStr } from '../../../src/utils/groundTime'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { OwnerBookingFilters, OwnerBookingStatusFilter } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const STATUS_OPTIONS: { key: OwnerBookingStatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

function defaultFilters(): OwnerBookingFilters {
  return { status: 'ALL', fromDate: groundTodayDateStr(), toDate: null }
}

function isDefault(f: OwnerBookingFilters): boolean {
  const d = defaultFilters()
  return f.status === d.status && f.fromDate === d.fromDate && f.toDate === d.toDate
}

export default function OwnerBookingsScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const [filters, setFilters] = useState<OwnerBookingFilters>(defaultFilters)
  const [picker, setPicker] = useState<'from' | 'to' | null>(null)
  const bookings = useGroundBookings(publicGroundId, filters)

  const list = bookings.data ?? []
  const filtered = !isDefault(filters)

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Bookings" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to view its bookings." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Bookings"
        subtitle={activeGround?.name}
        right={
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push('/(owner)/bookings/calendar')} accessibilityRole="button" accessibilityLabel="Availability calendar">
              <MaterialCommunityIcons name="calendar-month-outline" size={22} color={LocColors.green} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(owner)/bookings/blocks')} accessibilityRole="button" accessibilityLabel="Staff blocks">
              <MaterialCommunityIcons name="wrench-outline" size={20} color={LocColors.green} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => bookings.refetch()} tintColor={LocColors.green} />}
      >
        <GroundSelector />

        <View style={styles.segment}>
          {STATUS_OPTIONS.map((o) => {
            const active = filters.status === o.key
            return (
              <TouchableOpacity
                key={o.key}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => setFilters((f) => ({ ...f, status: o.key }))}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={styles.dateRow}>
          <DateChip label="From" value={filters.fromDate} onPress={() => setPicker('from')} />
          <DateChip label="To" value={filters.toDate} onPress={() => setPicker('to')} />
          {filtered ? (
            <TouchableOpacity style={styles.resetBtn} onPress={() => setFilters(defaultFilters())} accessibilityRole="button">
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {bookings.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : bookings.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load bookings.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => bookings.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No bookings"
            message={filtered ? 'No bookings match these filters.' : 'There are no bookings for this ground yet.'}
          />
        ) : (
          <View style={styles.list}>
            {list.map((b) => (
              <BookingRow key={b.publicBookingId} booking={b} onPress={() => router.push(`/(owner)/bookings/${b.publicBookingId}`)} />
            ))}
          </View>
        )}
      </ScrollView>

      {picker ? (
        <DateTimePicker
          value={
            (picker === 'from' ? filters.fromDate : filters.toDate)
              ? new Date(`${picker === 'from' ? filters.fromDate : filters.toDate}T00:00:00`)
              : new Date()
          }
          mode="date"
          onChange={(e, selected) => {
            setPicker(null)
            if (e.type !== 'set' || !selected) return
            const value = toGroundDateStr(selected)
            setFilters((f) => (picker === 'from' ? { ...f, fromDate: value } : { ...f, toDate: value }))
          }}
        />
      ) : null}
    </View>
  )
}

function DateChip({ label, value, onPress }: { label: string; value: string | null; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dateChip} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label} date`}>
      <Text style={styles.dateChipLabel}>{label}</Text>
      <Text style={styles.dateChipValue}>{value ? formatDateLong(`${value}T00:00:00`) : 'Any'}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
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
  dateRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
  dateChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: LocColors.surface,
  },
  dateChipLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  dateChipValue: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy, marginTop: 2 },
  resetBtn: { justifyContent: 'center', paddingHorizontal: Spacing.md },
  resetText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  list: { gap: Spacing.sm },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
