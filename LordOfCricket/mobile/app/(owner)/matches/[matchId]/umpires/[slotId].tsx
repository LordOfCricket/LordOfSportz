import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../../../src/components/owner/StatusBadge'
import { ProposeUmpireSheet } from '../../../../../src/components/owner/ProposeUmpireSheet'
import { EmptyState } from '../../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../../src/hooks/useMyGrounds'
import {
  useOwnerMatch,
  useOwnerMatchUmpireSlots,
  useOwnerMatchHistory,
  useRecommendedUmpires,
  useEligibleReplacements,
  useMarkNoShow,
  useAssignReplacement,
  useProposeUmpire,
  useUpdateSlotPaymentStatus,
} from '../../../../../src/hooks/useOwnerMatches'
import { slotStatusMeta, paymentStatusMeta, nextPaymentStatuses } from '../../../../../src/utils/ownerStatus'
import { formatDateLong, formatTime } from '../../../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../../../src/utils/errors'
import { UmpireReputationSummary } from '../../../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../../src/constants/colors'

function reputationLine(rep: UmpireReputationSummary | null): string | null {
  if (!rep) return null
  const parts: string[] = []
  if (rep.ratingAvg != null) parts.push(`★ ${rep.ratingAvg.toFixed(1)} (${rep.ratingCount})`)
  if (rep.matchesOfficiated > 0) parts.push(`${rep.matchesOfficiated} officiated`)
  if (rep.reliability != null) parts.push(`${Math.round(rep.reliability * 100)}% reliable`)
  return parts.join(' · ') || null
}

export default function UmpireSlotDetailScreen() {
  const router = useRouter()
  const { matchId: matchIdParam, slotId: slotIdParam } = useLocalSearchParams<{ matchId: string; slotId: string }>()
  const matchId = Number(matchIdParam)
  const slotId = Number(slotIdParam)
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const { match } = useOwnerMatch(publicGroundId, matchId)
  const slotsQuery = useOwnerMatchUmpireSlots(publicGroundId, matchId)
  const history = useOwnerMatchHistory(publicGroundId, matchId)
  const slot = (slotsQuery.data?.slots ?? []).find((s) => s.id === slotId) ?? null

  const matchOpen = match?.status === 'upcoming'
  const matchActive = match?.status === 'upcoming' || match?.status === 'live'
  const isOpenSlot = slot?.status === 'AVAILABLE' || slot?.status === 'CANCELLED'

  const recommended = useRecommendedUmpires(publicGroundId, matchId, matchOpen && isOpenSlot)
  const replacements = useEligibleReplacements(publicGroundId, matchId, slotId, matchActive && slot?.status === 'NO_SHOW')

  const propose = useProposeUmpire(publicGroundId ?? '', matchId)
  const noShow = useMarkNoShow(publicGroundId ?? '', matchId)
  const replace = useAssignReplacement(publicGroundId ?? '', matchId)
  const updatePayment = useUpdateSlotPaymentStatus(publicGroundId ?? '', matchId)

  const [proposeTarget, setProposeTarget] = useState<{ id: number; name: string } | null>(null)
  const [proposeError, setProposeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slotHistory = (history.data ?? []).filter((e) => e.matchUmpireSlotId === slotId)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const onNoShow = () => {
    Alert.alert('Mark umpire as no-show?', 'This releases the slot and notifies the umpire. Confirm only if they did not attend.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark no-show', style: 'destructive', onPress: () => run(() => noShow.mutateAsync(slotId)) },
    ])
  }

  const onReplace = (candidate: { id: number; name: string }) => {
    Alert.alert('Assign replacement?', `${candidate.name} will be assigned to this slot.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Assign', onPress: () => run(() => replace.mutateAsync({ slotId, newUmpireUserId: candidate.id })) },
    ])
  }

  const submitPropose = async (args: { incentiveAmount?: number; message?: string }) => {
    if (!proposeTarget) return
    setProposeError(null)
    try {
      await propose.mutateAsync({ slotId, umpireUserId: proposeTarget.id, ...args })
      setProposeTarget(null)
    } catch (err) {
      setProposeError(getErrorMessage(err))
    }
  }

  if (slotsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Umpire slot" subtitle={activeGround?.name} />
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      </View>
    )
  }

  if (slotsQuery.isError || !slot) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Umpire slot" subtitle={activeGround?.name} />
        <EmptyState
          icon="🔍"
          title="Slot not found"
          message="This umpire slot is no longer available."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title={`Slot ${slot.slotNumber}`} subtitle={activeGround?.name} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={slotsQuery.isRefetching}
            onRefresh={() => {
              slotsQuery.refetch()
              history.refetch()
              if (matchOpen && isOpenSlot) recommended.refetch()
              if (matchActive && slot.status === 'NO_SHOW') replacements.refetch()
            }}
            tintColor={LocColors.green}
          />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.title}>Slot {slot.slotNumber}</Text>
            <StatusBadge {...slotStatusMeta(slot.status)} />
          </View>
          {slot.umpireName ? (
            <>
              <Row label="Umpire" value={slot.umpireName} />
              {reputationLine(slot.reputation) ? <Row label="Reputation" value={reputationLine(slot.reputation)!} /> : null}
              {slot.assignedAt ? <Row label="Assigned" value={formatDateLong(slot.assignedAt)} /> : null}
            </>
          ) : (
            <Text style={styles.emptyLine}>No umpire assigned.</Text>
          )}
          {slot.cancellationReason ? <Row label="Reason" value={slot.cancellationReason} /> : null}
        </View>

        {slot.earning ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Payment</Text>
            <View style={styles.paymentHead}>
              <Text style={styles.feeValue}>
                {slot.earning.currency} {slot.earning.amount}
              </Text>
              <StatusBadge {...paymentStatusMeta(slot.earning.status)} />
            </View>
            {nextPaymentStatuses(slot.earning.status).length > 0 ? (
              <>
                <Text style={styles.help}>Update payment status:</Text>
                <View style={styles.chipRow}>
                  {nextPaymentStatuses(slot.earning.status).map((next) => (
                    <TouchableOpacity
                      key={next}
                      style={styles.chip}
                      disabled={updatePayment.isPending}
                      onPress={() =>
                        Alert.alert('Update payment status?', `Set this earning to ${next}.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Confirm', onPress: () => run(() => updatePayment.mutateAsync({ slotId, status: next })) },
                        ])
                      }
                      accessibilityRole="button"
                    >
                      <Text style={styles.chipText}>{next}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.help}>This payment status is final.</Text>
            )}
          </View>
        ) : null}

        {slot.status === 'ASSIGNED' && matchActive ? (
          <TouchableOpacity
            style={[styles.dangerBtn, noShow.isPending && styles.btnDisabled]}
            onPress={onNoShow}
            disabled={noShow.isPending}
            accessibilityRole="button"
          >
            {noShow.isPending ? (
              <ActivityIndicator color={LocColors.surface} />
            ) : (
              <>
                <MaterialCommunityIcons name="account-alert-outline" size={18} color={LocColors.surface} />
                <Text style={styles.dangerBtnText}>Mark no-show</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {slot.status === 'NO_SHOW' && matchActive ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Assign replacement</Text>
            {replacements.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
            ) : replacements.isError ? (
              <Text style={styles.muted}>Couldn’t load candidates.</Text>
            ) : (replacements.data ?? []).length === 0 ? (
              <Text style={styles.emptyLine}>No eligible replacement umpires available.</Text>
            ) : (
              (replacements.data ?? []).map((c) => (
                <View key={c.id} style={styles.candRow}>
                  <View style={styles.candBody}>
                    <Text style={styles.candName}>{c.name}</Text>
                    {reputationLine(c.reputation) ? <Text style={styles.candMeta}>{reputationLine(c.reputation)}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={replace.isPending}
                    onPress={() => onReplace(c)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.smallBtnText}>Assign</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        ) : null}

        {isOpenSlot && matchOpen ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Propose an umpire</Text>
            {recommended.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
            ) : recommended.isError ? (
              <Text style={styles.muted}>Couldn’t load recommendations.</Text>
            ) : (recommended.data ?? []).length === 0 ? (
              <Text style={styles.emptyLine}>No eligible umpires right now.</Text>
            ) : (
              (recommended.data ?? []).slice(0, 6).map((c) => (
                <View key={c.id} style={styles.candRow}>
                  <View style={styles.candBody}>
                    <Text style={styles.candName}>{c.name}</Text>
                    {reputationLine(c.reputation) ? <Text style={styles.candMeta}>{reputationLine(c.reputation)}</Text> : null}
                    {c.reasons.length > 0 ? <Text style={styles.candReason}>{c.reasons[0]}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => {
                      setProposeError(null)
                      setProposeTarget({ id: c.id, name: c.name })
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.smallBtnText}>Propose</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => router.push({ pathname: '/(owner)/browse-umpires', params: { matchId: String(matchId), slotId: String(slotId) } })}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="account-search-outline" size={16} color={LocColors.green} />
              <Text style={styles.browseBtnText}>Browse all umpires</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {slotHistory.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>History</Text>
            {slotHistory.map((e) => (
              <View key={e.id} style={styles.histRow}>
                <Text style={styles.histEvent}>
                  {e.eventType.replace(/_/g, ' ')}
                  {e.umpireName ? ` — ${e.umpireName}` : ''}
                </Text>
                <Text style={styles.histTime}>
                  {formatDateLong(e.recordedAt)} · {formatTime(e.recordedAt)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {proposeTarget ? (
        <ProposeUmpireSheet
          umpireName={proposeTarget.name}
          pending={propose.isPending}
          error={proposeError}
          onClose={() => setProposeTarget(null)}
          onSubmit={submitPropose}
        />
      ) : null}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  title: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  sectionLoading: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy, textAlign: 'right' },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  help: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  feeValue: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  paymentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
  },
  chipText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: '#B91C1C',
  },
  btnDisabled: { opacity: 0.6 },
  dangerBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  candRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  candBody: { flex: 1, gap: 2 },
  candName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  candMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  candReason: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  smallBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  smallBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
  },
  browseBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  histRow: { paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: LocColors.border },
  histEvent: { fontSize: Typography.fontSize.sm, color: LocColors.navy, textTransform: 'capitalize' },
  histTime: { fontSize: Typography.fontSize.xs, color: LocColors.faint, marginTop: 1 },
})
