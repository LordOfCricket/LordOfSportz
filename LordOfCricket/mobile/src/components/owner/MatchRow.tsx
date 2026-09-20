import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerMatchListItem } from '../../types'
import { matchStatusMeta, staffingForecastMeta } from '../../utils/ownerStatus'
import { formatDateLong, formatTime } from '../../utils/bookingFormat'
import { StatusBadge } from './StatusBadge'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function MatchRow({ match, onPress }: { match: OwnerMatchListItem; onPress: () => void }) {
  const meta = matchStatusMeta(match.status)
  const staffed = match.requiredUmpires > 0
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${match.teamAName} versus ${match.teamBName}`}>
      <View style={styles.head}>
        <Text style={styles.teams} numberOfLines={1}>
          {match.teamAName} <Text style={styles.vs}>v</Text> {match.teamBName}
        </Text>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </View>
      <Text style={styles.meta}>
        {formatDateLong(match.matchDate)} · {formatTime(match.matchDate)}
      </Text>
      {staffed ? (
        <View style={styles.staffing}>
          <MaterialCommunityIcons name="whistle-outline" size={14} color={LocColors.muted} />
          <Text style={styles.staffingText}>
            {match.filledSlots}/{match.requiredUmpires} umpires
          </Text>
          {match.staffingForecast ? <Text style={styles.forecast}> · {staffingForecastMeta(match.staffingForecast.status).label}</Text> : null}
        </View>
      ) : null}
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
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  teams: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  vs: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  staffing: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  staffingText: { fontSize: Typography.fontSize.xs, color: LocColors.muted, fontWeight: Typography.fontWeight.semibold },
  forecast: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
