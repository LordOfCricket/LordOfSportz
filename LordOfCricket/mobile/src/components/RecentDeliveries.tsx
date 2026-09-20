import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { Colors, Spacing, Typography } from '../constants/colors'

interface Delivery {
  id: number
  over: number
  ball: number
  batRuns: number
  illegal: boolean
  extra: string | null
  totalRuns: number
  isLegalDelivery: boolean
  isFreeHit: boolean
  voided: boolean
  isDeadBall: boolean
  wicket: boolean
}

interface RecentDeliveriesProps {
  deliveries: Delivery[] | null | undefined
}

function getBallLabel(d: Delivery): string {
  if (d.voided) return '×'
  if (d.isDeadBall) return '•DB'
  if (d.wicket) return 'W'
  if (d.illegal && d.extra === 'wide') return `WD${d.totalRuns > 1 ? `+${d.totalRuns - 1}` : ''}`
  if (d.illegal && d.extra === 'no_ball') return `NB${d.batRuns ? `+${d.batRuns}` : ''}`
  if (d.extra === 'bye') return `${d.totalRuns}B`
  if (d.extra === 'leg_bye') return `${d.totalRuns}LB`
  if (d.totalRuns === 0) return '•'
  return String(d.totalRuns)
}

function getBallColor(d: Delivery): string {
  if (d.wicket) return Colors.error
  if (d.totalRuns === 6) return '#EC4899' // Magenta for six
  if (d.totalRuns === 4) return Colors.warning
  if (d.illegal || d.extra) return '#FBBF24' // Amber for extras
  if (d.voided) return Colors.gray[300]
  return Colors.gray[400]
}

export function RecentDeliveries({ deliveries }: RecentDeliveriesProps) {
  if (!deliveries || deliveries.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Recent Deliveries</Text>
        <Text style={styles.emptyText}>No deliveries yet</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recent Deliveries</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.ballsContainer}>
          {deliveries.map((d) => (
            <View
              key={d.id}
              style={[
                styles.ball,
                {
                  backgroundColor: getBallColor(d),
                },
              ]}
            >
              <Text
                style={[
                  styles.ballText,
                  {
                    color: d.totalRuns === 4 ? Colors.black : Colors.white,
                  },
                ]}
              >
                {getBallLabel(d)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  scrollView: {
    flexGrow: 0,
  },
  ballsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ball: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ballText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
})
