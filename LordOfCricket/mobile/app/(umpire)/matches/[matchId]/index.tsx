import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../../../src/store/authStore'
import { getMatchSummary } from '../../../../src/services/matchApi'
import { useMatchUmpireSlots, useApplyForSlot, useCancelSlot } from '../../../../src/hooks/useUmpireDiscovery'
import { isAssignmentLocked } from '../../../../src/lib/umpireAssignments'
import { getErrorMessage } from '../../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

const SLOT_LABEL: Record<string, string> = {
  AVAILABLE: 'Open',
  ASSIGNED: 'Assigned',
  COMPLETED: 'Completed',
  CANCELLED: 'Reopened',
  NO_SHOW: 'No-show',
}

export default function UmpireMatchDetailScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const userId = useAuthStore((s) => s.user?.id)
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId: string }>()
  const matchId = Number(matchIdParam)

  const matchQuery = useQuery({
    queryKey: ['umpire', 'match-detail', matchId],
    queryFn: () => getMatchSummary(matchId),
    enabled: Number.isFinite(matchId),
    staleTime: 1000 * 60,
  })
  const slotsQuery = useMatchUmpireSlots(Number.isFinite(matchId) ? matchId : null)
  const applyMut = useApplyForSlot()
  const cancelMut = useCancelSlot()
  const [actionError, setActionError] = useState<string | null>(null)

  const slots = slotsQuery.data ?? []
  const userSlot = slots.find((s) => s.umpire_user_id === userId)
  const mySlot = userSlot && userSlot.status === 'ASSIGNED' ? userSlot : undefined
  const hasOpen = slots.some((s) => s.status === 'AVAILABLE' || s.status === 'CANCELLED')
  const busy = applyMut.isPending || cancelMut.isPending

  const runApply = async () => {
    if (busy) return
    setActionError(null)
    try {
      await applyMut.mutateAsync(matchId)
    } catch (err) {
      setActionError(getErrorMessage(err))
    }
  }
  const runCancel = () => {
    if (busy) return
    Alert.alert('Cancel assignment', 'Give up your umpire slot for this match?', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel assignment',
        style: 'destructive',
        onPress: async () => {
          setActionError(null)
          try {
            await cancelMut.mutateAsync(matchId)
          } catch (err) {
            setActionError(getErrorMessage(err))
          }
        },
      },
    ])
  }

  const m = matchQuery.data
  const teamA = m?.teams?.teamA
  const teamB = m?.teams?.teamB
  const dt = m?.match?.matchDate ? new Date(m.match.matchDate) : null
  const cancelLocked = !!mySlot && !!m?.match?.matchDate && isAssignmentLocked(m.match.matchDate)

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={LocColors.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match</Text>
        <TouchableOpacity
          onPress={() => router.push('/(umpire)/home')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Umpire home"
        >
          <MaterialCommunityIcons name="home-outline" size={22} color={LocColors.navy} />
        </TouchableOpacity>
      </View>

      {matchQuery.isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : matchQuery.isError || !m ? (
        <View style={styles.centerPad}>
          <Text style={styles.stateTitle}>Couldn’t load this match</Text>
          <TouchableOpacity style={styles.btn} onPress={() => matchQuery.refetch()} accessibilityRole="button">
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.card}>
            <Text style={styles.teams}>
              {teamA?.name} <Text style={styles.vs}>vs</Text> {teamB?.name}
            </Text>
            {dt && (
              <Row icon="calendar">
                {dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
                {dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Row>
            )}
            {(m?.ground?.name || m?.match?.venue) && (
              <Row icon="map-marker-outline">{m?.ground?.name || m?.match?.venue}</Row>
            )}
            {m?.match?.oversPerInnings != null && <Row icon="cricket">{m.match?.oversPerInnings} overs per innings</Row>}
            <Row icon="information-outline">
              Status: {String(m?.match?.status ?? '').replace(/^\w/, (c) => c.toUpperCase())}
            </Row>
          </View>

          {mySlot && (m?.match?.status === 'live' || m?.match?.status === 'upcoming') && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionApply]}
              onPress={() => router.push(`/(umpire)/matches/${matchId}/score` as any)}
              accessibilityRole="button"
              accessibilityLabel="Open scoring workspace"
            >
              <Text style={styles.actionApplyText}>
                {m?.match?.status === 'live' ? 'Open scoring' : 'Match day — set up & start'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Umpire slots</Text>
            {slotsQuery.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={{ marginVertical: Spacing.md }} />
            ) : slotsQuery.isError ? (
              <TouchableOpacity onPress={() => slotsQuery.refetch()} accessibilityRole="button">
                <Text style={styles.link}>Couldn’t load slots — tap to retry</Text>
              </TouchableOpacity>
            ) : slots.length === 0 ? (
              <Text style={styles.bodyEmpty}>This match has no umpire slots.</Text>
            ) : (
              slots.map((s) => (
                <View key={s.id} style={styles.slotRow}>
                  <Text style={styles.slotName}>Slot {s.slot_number}</Text>
                  <Text style={styles.slotStatus}>
                    {SLOT_LABEL[s.status] ?? s.status}
                    {s.umpire_name ? ` · ${s.umpire_name}` : ''}
                  </Text>
                </View>
              ))
            )}

            {userSlot && (
              <View style={styles.yourSlot}>
                <Text style={styles.yourSlotLabel}>Your slot</Text>
                <Text style={styles.yourSlotValue}>
                  {SLOT_LABEL[userSlot.status] ?? userSlot.status}
                  {userSlot.status === 'ASSIGNED' && userSlot.assigned_at
                    ? ` · since ${new Date(userSlot.assigned_at).toLocaleDateString()}`
                    : ''}
                </Text>
                {(userSlot.status === 'CANCELLED' || userSlot.status === 'NO_SHOW') && userSlot.cancellation_reason ? (
                  <Text style={styles.yourSlotReason}>Reason: {userSlot.cancellation_reason}</Text>
                ) : null}
              </View>
            )}

            {actionError && <Text style={styles.fieldError}>{actionError}</Text>}

            {mySlot ? (
              cancelLocked ? (
                <View style={[styles.actionBtn, styles.actionDisabled]}>
                  <Text style={styles.actionDisabledText}>Cancellation locked (within 24h of start)</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionCancel, busy && styles.btnDisabled]}
                  onPress={runCancel}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  {cancelMut.isPending ? (
                    <ActivityIndicator color="#B91C1C" />
                  ) : (
                    <Text style={styles.actionCancelText}>Cancel my assignment</Text>
                  )}
                </TouchableOpacity>
              )
            ) : hasOpen ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionApply, busy && styles.btnDisabled]}
                onPress={runApply}
                disabled={busy}
                accessibilityRole="button"
              >
                {applyMut.isPending ? (
                  <ActivityIndicator color={LocColors.surface} />
                ) : (
                  <Text style={styles.actionApplyText}>Apply for an umpire slot</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.actionBtn, styles.actionDisabled]}>
                <Text style={styles.actionDisabledText}>No slots available</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function Row({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon} size={16} color={LocColors.muted} />
      <Text style={styles.rowText}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: LocColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  headerTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  teams: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  vs: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowText: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.ink },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  slotName: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  slotStatus: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  bodyEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  yourSlot: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.mint,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  yourSlotLabel: { fontSize: Typography.fontSize.xs, color: LocColors.faint, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  yourSlotValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy, marginTop: 2 },
  yourSlotReason: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2, fontStyle: 'italic' },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  fieldError: { fontSize: Typography.fontSize.xs, color: '#DC2626', marginTop: Spacing.xs },
  actionBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  actionApply: { backgroundColor: LocColors.green },
  actionApplyText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  actionCancel: { borderWidth: 1, borderColor: '#DC2626' },
  actionCancelText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: '#B91C1C' },
  actionDisabled: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  actionDisabledText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.faint },
  btnDisabled: { opacity: 0.6 },
  btn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  btnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  stateTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
})
