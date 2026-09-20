import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StaffGuard } from '../../../src/components/staff/StaffGuard'
import { StaffSubHeader } from '../../../src/components/staff/StaffSubHeader'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import { useStaffBooking } from '../../../src/hooks/useStaffBookings'
import { groundBlockTypeLabel } from '../../../src/constants/groundBlockTypes'
import { formatDateLong, formatTimeRange } from '../../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function BookingDetailContent() {
  const router = useRouter()
  const { bookingId } = useLocalSearchParams()
  const { booking, groundName, isLoading, isError, refetch } = useStaffBooking(bookingId)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const isBlock = booking?.bookingType === 'STAFF_BLOCK'
  const cancelled = booking?.status === 'CANCELLED'

  return (
    <View style={styles.container}>
      <StaffSubHeader title="Booking" subtitle={groundName ?? undefined} />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError || !booking ? (
        <EmptyState
          icon="🔍"
          title="Booking unavailable"
          message="This booking couldn’t be loaded. It may have been removed, or it belongs to a different ground."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.type}>{isBlock ? 'Staff block' : 'Customer booking'}</Text>
              <StatusBadge label={cancelled ? 'Cancelled' : 'Confirmed'} tone={cancelled ? 'neutral' : 'positive'} />
            </View>
            <Row label="Reference" value={booking.publicBookingId} />
            <Row label="Date" value={formatDateLong(booking.startTime)} />
            <Row label="Time" value={formatTimeRange(booking.startTime, booking.endTime)} />
            {isBlock ? (
              <Row label="Block type" value={groundBlockTypeLabel(booking.blockType) ?? 'Not set'} />
            ) : (
              <Row label="Customer" value={booking.customerName ?? 'Not provided'} />
            )}
            {booking.purpose ? <Row label="Purpose" value={booking.purpose} /> : null}
            {!isBlock && booking.expectedPlayers != null ? (
              <Row label="Expected players" value={String(booking.expectedPlayers)} />
            ) : null}
            {booking.notes ? <Row label="Notes" value={booking.notes} /> : null}
            {booking.cancelledAt ? <Row label="Cancelled" value={formatDateLong(booking.cancelledAt)} /> : null}
          </View>
          <Text style={styles.note}>Bookings are read-only for staff.</Text>
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function StaffBookingDetailScreen() {
  return (
    <StaffGuard title="Booking" anyOf={['BOOKING_VIEW', 'BOOKING_MANAGE']}>
      <BookingDetailContent />
    </StaffGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  type: { fontSize: Typography.fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: LocColors.faint },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy, textAlign: 'right' },
  note: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center' },
})
