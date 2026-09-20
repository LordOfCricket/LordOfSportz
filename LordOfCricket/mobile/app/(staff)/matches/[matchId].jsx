import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StaffGuard } from '../../../src/components/staff/StaffGuard'
import { StaffSubHeader } from '../../../src/components/staff/StaffSubHeader'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import { useStaffMatch } from '../../../src/hooks/useStaffMatches'
import { matchStatusMeta, staffingForecastMeta } from '../../../src/utils/ownerStatus'
import { formatDateLong, formatTime } from '../../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function MatchDetailContent() {
  const router = useRouter()
  const { matchId } = useLocalSearchParams()
  const { match, groundName, isLoading, isError, refetch } = useStaffMatch(matchId)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.container}>
      <StaffSubHeader title="Match" subtitle={groundName ?? undefined} />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load this match.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !match ? (
        <EmptyState
          icon="🔍"
          title="Match not found"
          message="This match is no longer in the upcoming list for this ground."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.teams}>
                {match.teamAName} <Text style={styles.vs}>v</Text> {match.teamBName}
              </Text>
              <StatusBadge {...matchStatusMeta(match.status)} />
            </View>
            <Row label="Date" value={formatDateLong(match.matchDate)} />
            <Row label="Start time" value={formatTime(match.matchDate)} />
            {match.venue ? <Row label="Venue" value={match.venue} /> : null}
            <Row
              label="Umpires"
              value={match.requiredUmpires > 0 ? `${match.filledSlots}/${match.requiredUmpires} filled` : 'None required'}
            />
            {match.staffingForecast ? <Row label="Staffing" value={staffingForecastMeta(match.staffingForecast.status).label} /> : null}
          </View>
          <Text style={styles.note}>Match details are read-only for staff.</Text>
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function StaffMatchDetailScreen() {
  return (
    <StaffGuard title="Match" anyOf={['MATCH_VIEW']}>
      <MatchDetailContent />
    </StaffGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.xs },
  teams: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  vs: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy, textAlign: 'right' },
  note: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
