import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function OwnerHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={styles.bar}>
        <View style={styles.brand}>
          <View style={styles.logoChip}>
            <Text style={styles.logoEmoji}>🏟️</Text>
          </View>
          <Text style={styles.logoText}>LOC</Text>
        </View>
        <Text style={styles.roleTag}>{title ?? 'Ground Owner'}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: LocColors.mint,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoChip: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 18 },
  logoText: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.greenStrong,
    letterSpacing: 0.5,
  },
  roleTag: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: LocColors.green,
    backgroundColor: LocColors.greenPale,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
})
