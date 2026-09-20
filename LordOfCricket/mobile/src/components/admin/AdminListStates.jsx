import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { EmptyState } from '../EmptyState'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Shared loading / error / empty / no-match wrapper for the read-only
// directory lists. Renders `children` (the actual list) only when there is
// visible data.
export function AdminListStates({
  isLoading,
  isError,
  hasData,
  hasVisible,
  onRetry,
  emptyIcon = '📇',
  emptyTitle,
  emptyMessage,
  noMatchMessage = 'Nothing matches your search.',
  children,
}) {
  if (isLoading) {
    return (
      <View style={styles.centerPad}>
        <ActivityIndicator color={LocColors.green} />
      </View>
    )
  }

  if (isError && !hasData) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Couldn’t load this list</Text>
        <Text style={styles.cardBody}>Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!hasData) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
  }

  if (!hasVisible) {
    return <EmptyState icon="🔍" title="No matches" message={noMatchMessage} />
  }

  return children
}

const styles = StyleSheet.create({
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
