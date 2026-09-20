import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundBooking, useDeleteStaffBlock } from '../../../src/hooks/useGroundBookings'
import { groundBlockTypeLabel } from '../../../src/constants/groundBlockTypes'
import { formatDateLong, formatTimeRange } from '../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function OwnerBookingDetailScreen() {
  const router = useRouter()
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const query = useGroundBooking(publicGroundId, bookingId)
  const cancelBlock = useDeleteStaffBlock(publicGroundId ?? '')
  const [error, setError] = useState<string | null>(null)

  const booking = query.data
  const isBlock = booking?.bookingType === 'STAFF_BLOCK'
  const canCancelBlock = isBlock && booking?.status === 'CONFIRMED'

  const onCancelBlock = () => {
    if (!bookingId) return
    Alert.alert('Cancel this staff block?', 'The slot will become available for bookings again.', [
      { text: 'Keep block', style: 'cancel' },
      {
        text: 'Cancel block',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          try {
            await cancelBlock.mutateAsync(bookingId)
            router.back()
          } catch (err) {
            setError(getErrorMessage(err))
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Booking" subtitle={activeGround?.name} />

      {query.isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : query.isError || !booking ? (
        <EmptyState
          icon="🔍"
          title="Booking not found"
          message="This booking may have been removed, or it belongs to a different ground."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.type}>{isBlock ? 'Staff block' : 'Customer booking'}</Text>
              <View style={[styles.badge, booking.status === 'CANCELLED' ? styles.badgeCancelled : styles.badgeConfirmed]}>
                <Text style={[styles.badgeText, booking.status === 'CANCELLED' ? styles.badgeTextCancelled : styles.badgeTextConfirmed]}>
                  {booking.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed'}
                </Text>
              </View>
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
            {!isBlock && booking.contactPhone ? <Row label="Contact phone" value={booking.contactPhone} /> : null}
            {!isBlock && booking.contactEmail ? <Row label="Contact email" value={booking.contactEmail} /> : null}
            {booking.notes ? <Row label="Notes" value={booking.notes} /> : null}
            <Row label="Created" value={formatDateLong(booking.createdAt)} />
            {booking.cancelledAt ? <Row label="Cancelled" value={formatDateLong(booking.cancelledAt)} /> : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {canCancelBlock ? (
            <TouchableOpacity
              style={[styles.dangerBtn, cancelBlock.isPending && styles.btnDisabled]}
              onPress={onCancelBlock}
              disabled={cancelBlock.isPending}
              accessibilityRole="button"
            >
              {cancelBlock.isPending ? (
                <ActivityIndicator color={LocColors.surface} />
              ) : (
                <>
                  <MaterialCommunityIcons name="close-circle-outline" size={18} color={LocColors.surface} />
                  <Text style={styles.dangerBtnText}>Cancel staff block</Text>
                </>
              )}
            </TouchableOpacity>
          ) : !isBlock && booking.status === 'CONFIRMED' ? (
            <View style={styles.noteCard}>
              <MaterialCommunityIcons name="information-outline" size={16} color={LocColors.muted} />
              <Text style={styles.noteText}>
                Customer bookings are managed by the customer. Check-in and no-show tracking aren’t available in the app yet.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
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
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeConfirmed: { backgroundColor: LocColors.greenPale },
  badgeCancelled: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  badgeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
  badgeTextConfirmed: { color: LocColors.greenStrong },
  badgeTextCancelled: { color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: '#B91C1C',
  },
  btnDisabled: { opacity: 0.6 },
  dangerBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  noteCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  noteText: { flex: 1, fontSize: Typography.fontSize.xs, color: LocColors.muted, lineHeight: Typography.fontSize.xs * 1.6 },
})
