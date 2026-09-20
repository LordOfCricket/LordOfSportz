import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundBookingAvailability } from '../../../src/hooks/useGroundBookings'
import { groundTodayDateStr, toGroundDateStr, toGroundHour, addGroundDays } from '../../../src/utils/groundTime'
import { formatDateLong, formatTimeRange } from '../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../src/utils/errors'
import { OwnerAvailabilitySlot, OwnerSlotReason } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const HORIZON_DAYS = 60

const REASON_LABEL: Record<Exclude<OwnerSlotReason, null>, string> = {
  PAST: 'Past',
  BOOKED: 'Booked',
  BLOCKED: 'Staff block',
  MATCH: 'Match',
}

function slotTone(slot: OwnerAvailabilitySlot): { dot: string; label: string } {
  if (slot.status === 'AVAILABLE') return { dot: LocColors.greenBright, label: 'Available' }
  switch (slot.reason) {
    case 'BOOKED':
      return { dot: '#D97706', label: 'Booked' }
    case 'BLOCKED':
      return { dot: LocColors.faint, label: 'Staff block' }
    case 'MATCH':
      return { dot: '#2563EB', label: 'Match' }
    default:
      return { dot: LocColors.border, label: 'Unavailable' }
  }
}

export default function OwnerAvailabilityCalendarScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const [date, setDate] = useState<string>(groundTodayDateStr())
  const [showPicker, setShowPicker] = useState(false)
  const availability = useGroundBookingAvailability(publicGroundId, date)

  const maxDate = useMemo(() => addGroundDays(groundTodayDateStr(), HORIZON_DAYS), [])
  const slots = availability.data?.slots ?? []

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Availability" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to view its availability." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Availability" subtitle={activeGround?.name} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={availability.isRefetching} onRefresh={() => availability.refetch()} tintColor={LocColors.green} />}
      >
        <GroundSelector />

        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel="Change date">
          <MaterialCommunityIcons name="calendar" size={18} color={LocColors.green} />
          <Text style={styles.dateBtnText}>{formatDateLong(`${date}T00:00:00`)}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={LocColors.faint} />
        </TouchableOpacity>

        <View style={styles.legend}>
          {[
            { c: LocColors.greenBright, t: 'Available' },
            { c: '#D97706', t: 'Booked' },
            { c: LocColors.faint, t: 'Staff block' },
            { c: '#2563EB', t: 'Match' },
          ].map((l) => (
            <View key={l.t} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: l.c }]} />
              <Text style={styles.legendText}>{l.t}</Text>
            </View>
          ))}
        </View>

        {availability.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : availability.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>{getErrorMessage(availability.error)}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => availability.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : slots.length === 0 ? (
          <EmptyState icon="🕒" title="No slots" message="This ground has no bookable hours configured for this day." />
        ) : (
          <View style={styles.list}>
            {slots.map((slot) => {
              const tone = slotTone(slot)
              const canBlock = slot.status === 'AVAILABLE'
              return (
                <View key={slot.startTime} style={styles.slotRow}>
                  <View style={[styles.slotDot, { backgroundColor: tone.dot }]} />
                  <View style={styles.slotBody}>
                    <Text style={styles.slotTime}>{formatTimeRange(slot.startTime, slot.endTime)}</Text>
                    <Text style={styles.slotStatus}>
                      {tone.label}
                      {slot.status === 'AVAILABLE' && slot.price != null ? ` · ₹${slot.price}` : ''}
                      {slot.status === 'UNAVAILABLE' && slot.reason && REASON_LABEL[slot.reason] && tone.label !== REASON_LABEL[slot.reason]
                        ? ` · ${REASON_LABEL[slot.reason]}`
                        : ''}
                    </Text>
                  </View>
                  {canBlock ? (
                    <TouchableOpacity
                      style={styles.blockBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/(owner)/bookings/blocks',
                          params: { date, hour: String(toGroundHour(new Date(slot.startTime))) },
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Block this slot"
                    >
                      <Text style={styles.blockBtnText}>Block</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {showPicker ? (
        <DateTimePicker
          value={new Date(`${date}T00:00:00`)}
          mode="date"
          minimumDate={new Date()}
          maximumDate={new Date(`${maxDate}T00:00:00`)}
          onChange={(e, selected) => {
            setShowPicker(false)
            if (e.type !== 'set' || !selected) return
            setDate(toGroundDateStr(selected))
          }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  dateBtnText: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  list: { gap: Spacing.sm },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  slotDot: { width: 10, height: 10, borderRadius: 5 },
  slotBody: { flex: 1 },
  slotTime: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  slotStatus: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  blockBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
  },
  blockBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
