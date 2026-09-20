import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: 2,
  },
  value: { fontSize: Typography.fontSize.xl, fontWeight: '800', color: LocColors.greenStrong },
  label: { fontSize: Typography.fontSize.xs, color: LocColors.muted, fontWeight: Typography.fontWeight.semibold },
  sub: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
