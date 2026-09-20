import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { BadgeTone } from '../../utils/ownerStatus'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

const TONES: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
  positive: { bg: LocColors.greenPale, fg: LocColors.greenStrong },
  neutral: { bg: LocColors.mint, fg: LocColors.muted, border: LocColors.border },
  warn: { bg: '#FEF3C7', fg: '#92400E' },
  danger: { bg: '#FEE2E2', fg: '#B91C1C' },
  info: { bg: '#DBEAFE', fg: '#1D4ED8' },
}

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  const t = TONES[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border ?? t.bg, borderWidth: t.border ? 1 : 0 }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
})
