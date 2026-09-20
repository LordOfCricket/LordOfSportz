import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { StatusBadge } from '../owner/StatusBadge'
import { groundRequestStatusMeta } from '../../utils/adminRequestStatus'
import { formatDateLong } from '../../utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function AdminGroundRequestRow({ request, onPress }) {
  const meta = groundRequestStatusMeta(request.status)
  const place = [request.city, request.state].filter(Boolean).join(', ')

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${request.groundName || 'Ground request'}, ${meta.label}`}
    >
      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.name} numberOfLines={1}>
            {request.groundName || 'Ground request'}
          </Text>
          <StatusBadge label={meta.label} tone={meta.tone} />
        </View>
        {place ? <Text style={styles.meta} numberOfLines={1}>{place}</Text> : null}
        {request.createdAt ? (
          <Text style={styles.sub}>Submitted {formatDateLong(request.createdAt)}</Text>
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
  name: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  sub: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
