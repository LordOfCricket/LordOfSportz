import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export interface UmpireMatchCardData {
  matchId: number
  matchDate: string
  teamA: string
  teamB: string
  groundName?: string | null
  city?: string | null
  totalSlots?: number
  filledSlots?: number
  overs?: number | null
  assigned?: boolean
}

function fmt(dt: string) {
  const d = new Date(dt)
  if (isNaN(d.getTime())) return { date: dt, time: '' }
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

export function UmpireMatchCard({
  data,
  onOpen,
  onViewGround,
}: {
  data: UmpireMatchCardData
  onOpen: () => void
  onViewGround?: () => void
}) {
  const { date, time } = fmt(data.matchDate)
  const open =
    data.totalSlots != null && data.filledSlots != null ? Math.max(0, data.totalSlots - data.filledSlots) : null

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open match">
      <View style={styles.teamsRow}>
        <Text style={styles.teams} numberOfLines={2}>
          {data.teamA} <Text style={styles.vs}>vs</Text> {data.teamB}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar" size={14} color={LocColors.muted} />
        <Text style={styles.meta}>
          {date}
          {time ? ` · ${time}` : ''}
        </Text>
      </View>
      {(data.groundName || data.city) && (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={LocColors.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {[data.groundName, data.city].filter(Boolean).join(', ')}
          </Text>
        </View>
      )}
      {data.overs != null && (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="cricket" size={14} color={LocColors.muted} />
          <Text style={styles.meta}>{data.overs} overs</Text>
        </View>
      )}

      <View style={styles.footer}>
        {data.assigned ? (
          <View style={[styles.pill, styles.pillGood]}>
            <MaterialCommunityIcons name="check" size={12} color={LocColors.greenStrong} />
            <Text style={styles.pillGoodText}>You’re assigned</Text>
          </View>
        ) : open != null ? (
          <View style={[styles.pill, open > 0 ? styles.pillGood : styles.pillNeutral]}>
            <Text style={open > 0 ? styles.pillGoodText : styles.pillNeutralText}>
              {open > 0 ? `${open} umpire slot${open === 1 ? '' : 's'} open` : 'Slots full'}
            </Text>
          </View>
        ) : (
          <View />
        )}
        {onViewGround && (
          <TouchableOpacity onPress={onViewGround} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>View ground</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: 4,
  },
  teamsRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  teams: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  vs: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: { flex: 1, fontSize: Typography.fontSize.xs, color: LocColors.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  pillGood: { backgroundColor: LocColors.greenPale },
  pillNeutral: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  pillGoodText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: LocColors.greenStrong },
  pillNeutralText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
})
