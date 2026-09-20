import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../src/hooks/useMyGrounds'
import {
  useOwnerMatch,
  useOwnerMatchIncidents,
  useStartOwnerMatch,
  useCompleteOwnerMatch,
  useCancelOwnerMatch,
} from '../../../../src/hooks/useOwnerMatches'
import { matchStatusMeta, staffingForecastMeta } from '../../../../src/utils/ownerStatus'
import { formatDateLong, formatTime } from '../../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

export default function OwnerMatchDetailScreen() {
  const router = useRouter()
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId: string }>()
  const matchId = Number(matchIdParam)
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const { match, isLoading, isError, refetch, isRefetching } = useOwnerMatch(publicGroundId, matchId)
  const incidents = useOwnerMatchIncidents(publicGroundId, match ? matchId : undefined)
  const start = useStartOwnerMatch(publicGroundId ?? '', matchId)
  const complete = useCompleteOwnerMatch(publicGroundId ?? '', matchId)
  const cancel = useCancelOwnerMatch(publicGroundId ?? '', matchId)
  const [error, setError] = useState<string | null>(null)

  const busy = start.isPending || complete.isPending || cancel.isPending

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const onStart = () => {
    if (!match) return
    const understaffed = match.requiredUmpires > 0 && match.filledSlots < match.requiredUmpires
    const go = () => run(() => start.mutateAsync(understaffed))
    if (understaffed) {
      Alert.alert('Start understaffed?', `Only ${match.filledSlots} of ${match.requiredUmpires} umpire slots are filled.`, [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Start anyway', style: 'destructive', onPress: go },
      ])
    } else {
      go()
    }
  }

  const onComplete = () => {
    Alert.alert('Complete this match?', 'This ends the match and notifies assigned umpires.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => run(() => complete.mutateAsync()) },
    ])
  }

  const onCancel = () => {
    Alert.alert('Cancel this match?', 'Assigned umpires are released and pending proposals expire. This cannot be undone.', [
      { text: 'Keep match', style: 'cancel' },
      { text: 'Cancel match', style: 'destructive', onPress: () => run(() => cancel.mutateAsync(undefined)) },
    ])
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Match" subtitle={activeGround?.name} />

      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError || !match ? (
        <EmptyState
          icon="🔍"
          title="Match not found"
          message="This match may have been removed, or it belongs to a different ground."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch()
                incidents.refetch()
              }}
              tintColor={LocColors.green}
            />
          }
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {match.status === 'upcoming' || match.status === 'live' ? (
            <View style={styles.actions}>
              {match.status === 'upcoming' ? (
                <ActionButton icon="play" label="Start match" onPress={onStart} disabled={busy} loading={start.isPending} />
              ) : null}
              {match.status === 'live' ? (
                <ActionButton icon="flag-checkered" label="Complete match" onPress={onComplete} disabled={busy} loading={complete.isPending} />
              ) : null}
              {match.status === 'upcoming' ? (
                <ActionButton icon="close-circle-outline" label="Cancel match" onPress={onCancel} disabled={busy} loading={cancel.isPending} danger />
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.navCard}
            onPress={() => router.push(`/(owner)/matches/${matchId}/umpires`)}
            accessibilityRole="button"
            accessibilityLabel="Umpire staffing"
          >
            <MaterialCommunityIcons name="whistle-outline" size={20} color={LocColors.green} />
            <View style={styles.navText}>
              <Text style={styles.navTitle}>Umpire staffing</Text>
              <Text style={styles.navHelp}>Slots, proposals, recommendations, fees</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Incidents</Text>
            {incidents.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
            ) : incidents.isError ? (
              <Text style={styles.muted}>Couldn’t load incidents.</Text>
            ) : (incidents.data ?? []).length === 0 ? (
              <Text style={styles.emptyLine}>No incidents reported.</Text>
            ) : (
              (incidents.data ?? []).map((i) => (
                <View key={i.id} style={styles.incidentRow}>
                  <Text style={styles.incidentType}>{i.incidentType.replace(/_/g, ' ')}</Text>
                  {i.description ? <Text style={styles.incidentDesc}>{i.description}</Text> : null}
                  <Text style={styles.incidentTime}>{formatDateLong(i.occurredAt)} · {formatTime(i.occurredAt)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  loading,
  danger,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  danger?: boolean
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, danger && styles.actionBtnDanger, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={danger ? '#B91C1C' : LocColors.green} />
      ) : (
        <>
          <MaterialCommunityIcons name={icon} size={18} color={danger ? '#B91C1C' : LocColors.green} />
          <Text style={[styles.actionBtnText, danger && styles.actionBtnTextDanger]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
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
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  actions: { gap: Spacing.sm },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
    backgroundColor: LocColors.surface,
  },
  actionBtnDanger: { borderColor: '#B91C1C' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  actionBtnTextDanger: { color: '#B91C1C' },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
  },
  navText: { flex: 1 },
  navTitle: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  navHelp: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  sectionLoading: { alignSelf: 'flex-start', marginTop: Spacing.xs },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  incidentRow: { paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: LocColors.border, gap: 2 },
  incidentType: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy, textTransform: 'capitalize' },
  incidentDesc: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  incidentTime: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
