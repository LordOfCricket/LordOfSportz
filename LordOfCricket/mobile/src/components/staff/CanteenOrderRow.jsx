import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { StatusBadge } from '../owner/StatusBadge'
import { orderStatusMeta } from '../../utils/canteenStatus'
import { formatDateLong, formatTime } from '../../utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function CanteenOrderRow({ order, onPress }) {
  const meta = orderStatusMeta(order.status)
  const itemCount = (order.items ?? []).reduce((sum, i) => sum + (i.qty ?? 0), 0)
  const created = order.createdAt ?? order.orderedAt

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Order ${order.id}`}>
      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.id} numberOfLines={1}>
            {order.id}
          </Text>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {order.customerName ? `${order.customerName} · ` : ''}
          {itemCount} item{itemCount === 1 ? '' : 's'}
          {typeof order.total === 'number' ? ` · ₹${order.total}` : ''}
        </Text>
        {created ? (
          <Text style={styles.time}>
            {formatDateLong(created)} · {formatTime(created)}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  body: { gap: 3 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  id: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  time: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
