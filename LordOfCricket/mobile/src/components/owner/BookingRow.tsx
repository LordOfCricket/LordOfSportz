import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerBooking } from '../../types'
import { groundBlockTypeLabel } from '../../constants/groundBlockTypes'
import { formatDateLong, formatTimeRange } from '../../utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function BookingRow({ booking, onPress }: { booking: OwnerBooking; onPress: () => void }) {
  const isBlock = booking.bookingType === 'STAFF_BLOCK'
  const cancelled = booking.status === 'CANCELLED'
  const title = isBlock
    ? groundBlockTypeLabel(booking.blockType) ?? booking.purpose ?? 'Staff block'
    : booking.customerName ?? 'Booking'

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} on ${formatDateLong(booking.startTime)}`}>
      <View style={[styles.iconWrap, isBlock ? styles.iconBlock : styles.iconBooking]}>
        <MaterialCommunityIcons
          name={isBlock ? 'wrench-outline' : 'account-outline'}
          size={18}
          color={isBlock ? LocColors.muted : LocColors.green}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatDateLong(booking.startTime)} · {formatTimeRange(booking.startTime, booking.endTime)}
        </Text>
      </View>
      <View style={[styles.badge, cancelled ? styles.badgeCancelled : styles.badgeConfirmed]}>
        <Text style={[styles.badgeText, cancelled ? styles.badgeTextCancelled : styles.badgeTextConfirmed]}>
          {cancelled ? 'Cancelled' : isBlock ? 'Blocked' : 'Confirmed'}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  iconWrap: { width: 34, height: 34, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  iconBooking: { backgroundColor: LocColors.greenPale },
  iconBlock: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  body: { flex: 1 },
  title: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeConfirmed: { backgroundColor: LocColors.greenPale },
  badgeCancelled: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  badgeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
  badgeTextConfirmed: { color: LocColors.greenStrong },
  badgeTextCancelled: { color: LocColors.muted },
})
