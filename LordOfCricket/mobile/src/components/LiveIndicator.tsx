import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors, Spacing, Typography } from '../constants/colors'

interface LiveIndicatorProps {
  status: 'live' | 'reconnecting' | 'disconnected' | 'completed' | 'finalized' | 'upcoming' | 'cancelled'
  isConnected: boolean
}

export function LiveIndicator({ status, isConnected }: LiveIndicatorProps) {
  const getStatusDisplay = () => {
    if (status === 'live' && !isConnected) {
      return { text: '🟡 Reconnecting...', color: Colors.warning }
    }
    if (status === 'live' && isConnected) {
      return { text: '🔴 LIVE', color: Colors.error }
    }
    if (status === 'upcoming') {
      return { text: 'UPCOMING', color: Colors.statusUpcoming }
    }
    if (status === 'completed' || status === 'finalized') {
      return { text: 'FINAL', color: Colors.statusCompleted }
    }
    if (status === 'cancelled') {
      return { text: 'CANCELLED', color: Colors.statusCancelled }
    }
    return { text: status.toUpperCase(), color: Colors.textTertiary }
  }

  const { text, color } = getStatusDisplay()

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: Typography.fontSize.sm,
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
})
