import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { StatusBadge } from '../owner/StatusBadge'
import { groundStatusMeta } from '../../utils/adminGroundStatus'
import { formatDateLong } from '../../utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function AdminGroundRow({ ground, onPress }) {
  const meta = groundStatusMeta(ground.status)
  const place = [ground.city, ground.state].filter(Boolean).join(', ')

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ground.name}, ${meta.label}`}
    >
      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.name} numberOfLines={1}>
            {ground.name || 'Unnamed ground'}
          </Text>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </View>
        {place ? <Text style={styles.meta} numberOfLines={1}>{place}</Text> : null}
        <Text style={styles.sub} numberOfLines={1}>
          {ground.ownerName ? ground.ownerName : 'No owner on record'}
          {ground.createdAt ? ` · ${formatDateLong(ground.createdAt)}` : ''}
        </Text>
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
  name: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  sub: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
