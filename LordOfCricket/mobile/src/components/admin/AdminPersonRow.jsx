import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { StatusBadge } from '../owner/StatusBadge'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Read-only directory row: a name, up to a couple of muted context lines,
// and an optional status badge. `onPress` is only passed where a further
// read-only screen exists (owners -> grounds).
export function AdminPersonRow({ name, lines = [], badge, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View
  const wrapperProps = onPress
    ? { onPress, accessibilityRole: 'button', accessibilityLabel: name }
    : {}

  return (
    <Wrapper style={styles.row} {...wrapperProps}>
      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.name} numberOfLines={1}>{name || 'Unknown'}</Text>
          {badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
        </View>
        {lines.filter(Boolean).map((line, i) => (
          <Text key={i} style={styles.line} numberOfLines={1}>{line}</Text>
        ))}
      </View>
    </Wrapper>
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
  line: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
})
