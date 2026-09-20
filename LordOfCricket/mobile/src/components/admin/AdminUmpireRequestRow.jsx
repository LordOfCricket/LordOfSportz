import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { formatDateLong } from '../../utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function AdminUmpireRequestRow({ request, busy, disabled, onApprove, onReject }) {
  return (
    <View style={styles.row}>
      <Text style={styles.name} numberOfLines={1}>{request.name || 'Umpire applicant'}</Text>
      {request.requested_at ? (
        <Text style={styles.sub}>Requested {formatDateLong(request.requested_at)}</Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
          disabled={disabled || busy}
          onPress={onApprove}
          accessibilityRole="button"
          accessibilityLabel={`Approve ${request.name || 'umpire'}`}
        >
          {busy ? <ActivityIndicator color={LocColors.green} /> : <Text style={styles.btnText}>Approve</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnDanger, (disabled || busy) && styles.btnDisabled]}
          disabled={disabled || busy}
          onPress={onReject}
          accessibilityRole="button"
          accessibilityLabel={`Reject ${request.name || 'umpire'}`}
        >
          <Text style={[styles.btnText, styles.btnTextDanger]}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  name: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  sub: { fontSize: Typography.fontSize.xs, color: LocColors.faint, marginTop: -Spacing.xs },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
    backgroundColor: LocColors.surface,
    alignItems: 'center',
  },
  btnDanger: { borderColor: '#B91C1C' },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  btnTextDanger: { color: '#B91C1C' },
})
