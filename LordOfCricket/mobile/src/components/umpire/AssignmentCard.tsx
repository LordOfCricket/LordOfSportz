import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { UmpireAssignment } from '../../services/umpireApi'
import { assignmentBucket, isAssignmentLocked } from '../../lib/umpireAssignments'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

function fmt(dt: string) {
  const d = new Date(dt)
  if (isNaN(d.getTime())) return { date: dt, time: '' }
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

const PILL: Record<string, { label: string; tone: 'good' | 'live' | 'neutral' | 'bad' }> = {
  upcoming: { label: 'Assigned', tone: 'good' },
  live: { label: 'Live', tone: 'live' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  noShow: { label: 'No-show', tone: 'bad' },
}

export function AssignmentCard({ a, onPress }: { a: UmpireAssignment; onPress: () => void }) {
  const bucket = assignmentBucket(a)
  const pill = PILL[bucket]
  const { date, time } = fmt(a.match_date)
  const locked = bucket === 'upcoming' && isAssignmentLocked(a.match_date)

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel="Open assignment">
      <View style={styles.headRow}>
        <Text style={styles.teams} numberOfLines={2}>
          {a.team_a_name} <Text style={styles.vs}>vs</Text> {a.team_b_name}
        </Text>
        <View
          style={[
            styles.pill,
            pill.tone === 'good' && styles.pillGood,
            pill.tone === 'live' && styles.pillLive,
            pill.tone === 'neutral' && styles.pillNeutral,
            pill.tone === 'bad' && styles.pillBad,
          ]}
        >
          <Text
            style={[
              styles.pillText,
              pill.tone === 'good' && styles.pillTextGood,
              pill.tone === 'live' && styles.pillTextLive,
              pill.tone === 'neutral' && styles.pillTextNeutral,
              pill.tone === 'bad' && styles.pillTextBad,
            ]}
          >
            {pill.label}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar" size={14} color={LocColors.muted} />
        <Text style={styles.meta}>
          {date}
          {time ? ` · ${time}` : ''}
          {locked ? ' · locked' : ''}
        </Text>
      </View>
      {(a.ground_name || a.venue || a.ground_city) && (
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color={LocColors.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {[a.ground_name || a.venue, a.ground_city].filter(Boolean).join(', ')}
          </Text>
        </View>
      )}
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="whistle-outline" size={14} color={LocColors.muted} />
        <Text style={styles.meta}>Slot {a.slot_number}</Text>
      </View>
      {bucket === 'cancelled' && a.cancellation_reason ? (
        <Text style={styles.reason}>Reason: {a.cancellation_reason}</Text>
      ) : null}
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
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  teams: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  vs: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: { flex: 1, fontSize: Typography.fontSize.xs, color: LocColors.muted },
  reason: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 4, fontStyle: 'italic' },
  pill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  pillGood: { backgroundColor: LocColors.greenPale },
  pillLive: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: LocColors.green },
  pillNeutral: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  pillBad: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  pillText: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
  pillTextGood: { color: LocColors.greenStrong },
  pillTextLive: { color: LocColors.greenStrong },
  pillTextNeutral: { color: LocColors.muted },
  pillTextBad: { color: '#B91C1C' },
})
