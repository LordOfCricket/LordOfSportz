import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../../src/components/owner/StatusBadge'
import { FormField } from '../../../../src/components/owner/FormField'
import { useActiveGround } from '../../../../src/hooks/useMyGrounds'
import {
  useOwnerMatch,
  useOwnerMatchUmpireSlots,
  useOwnerMatchProposals,
  useOwnerMatchHistory,
  useRecommendedUmpires,
  useSetUmpireFee,
  useCancelProposal,
} from '../../../../src/hooks/useOwnerMatches'
import { slotStatusMeta, paymentStatusMeta } from '../../../../src/utils/ownerStatus'
import { formatDateLong, formatTime } from '../../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../../src/utils/errors'
import { UmpireReputationSummary } from '../../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function reputationLine(rep: UmpireReputationSummary | null): string | null {
  if (!rep) return null
  const parts: string[] = []
  if (rep.ratingAvg != null) parts.push(`★ ${rep.ratingAvg.toFixed(1)} (${rep.ratingCount})`)
  if (rep.matchesOfficiated > 0) parts.push(`${rep.matchesOfficiated} officiated`)
  if (rep.reliability != null) parts.push(`${Math.round(rep.reliability * 100)}% reliable`)
  if (rep.experienceYears != null) parts.push(`${rep.experienceYears}y exp`)
  return parts.join(' · ') || null
}

export default function MatchUmpiresScreen() {
  const router = useRouter()
  const { matchId: matchIdParam } = useLocalSearchParams<{ matchId: string }>()
  const matchId = Number(matchIdParam)
  const insets = useSafeAreaInsets()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const { match } = useOwnerMatch(publicGroundId, matchId)
  const slotsQuery = useOwnerMatchUmpireSlots(publicGroundId, matchId)
  const proposals = useOwnerMatchProposals(publicGroundId, matchId)
  const history = useOwnerMatchHistory(publicGroundId, matchId)
  const canRecommend = match?.status === 'upcoming'
  const recommended = useRecommendedUmpires(publicGroundId, matchId, canRecommend)

  const setFee = useSetUmpireFee(publicGroundId ?? '', matchId)
  const cancelProposal = useCancelProposal(publicGroundId ?? '', matchId)

  const [feeOpen, setFeeOpen] = useState(false)
  const [feeInput, setFeeInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const slots = slotsQuery.data?.slots ?? []
  const fee = slotsQuery.data?.umpireFee ?? null
  const feeEditable = match ? match.status !== 'completed' && match.status !== 'finalized' : false
  const pendingProposals = (proposals.data ?? []).filter((p) => p.status === 'PENDING')
  const feeNum = Number(feeInput.trim())
  const feeInvalid = !feeInput.trim() || !Number.isFinite(feeNum) || feeNum < 0

  const onRefresh = () => {
    slotsQuery.refetch()
    proposals.refetch()
    history.refetch()
    if (canRecommend) recommended.refetch()
  }

  const submitFee = async () => {
    if (feeInvalid || setFee.isPending) return
    setError(null)
    try {
      await setFee.mutateAsync({ amount: feeNum })
      setFeeOpen(false)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const onWithdraw = async (proposalId: number) => {
    setError(null)
    try {
      await cancelProposal.mutateAsync(proposalId)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (slotsQuery.isLoading) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Umpire staffing" subtitle={activeGround?.name} />
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      </View>
    )
  }

  if (slotsQuery.isError) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Umpire staffing" subtitle={activeGround?.name} />
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load umpire staffing.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => slotsQuery.refetch()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Umpire staffing" subtitle={activeGround?.name} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={slotsQuery.isRefetching} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.sectionLabel}>Umpire fee</Text>
            {feeEditable ? (
              <TouchableOpacity
                onPress={() => {
                  setFeeInput(fee ? String(fee.amount) : '')
                  setError(null)
                  setFeeOpen(true)
                }}
                accessibilityRole="button"
              >
                <Text style={styles.link}>{fee ? 'Edit' : 'Set fee'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.feeValue}>{fee ? `${fee.currency} ${fee.amount}` : 'Not set'}</Text>
          <Text style={styles.help}>Applied per umpire to every slot on this match.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Slots</Text>
          {slots.length === 0 ? (
            <Text style={styles.emptyLine}>This match has no umpire slots.</Text>
          ) : (
            slots.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.slotRow}
                onPress={() => router.push(`/(owner)/matches/${matchId}/umpires/${s.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Slot ${s.slotNumber}`}
              >
                <View style={styles.slotBody}>
                  <Text style={styles.slotName}>{s.umpireName ?? `Slot ${s.slotNumber}`}</Text>
                  <View style={styles.slotBadges}>
                    <StatusBadge {...slotStatusMeta(s.status)} />
                    {s.earning ? <StatusBadge {...paymentStatusMeta(s.earning.status)} /> : null}
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Proposals</Text>
          {proposals.isLoading ? (
            <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
          ) : (proposals.data ?? []).length === 0 ? (
            <Text style={styles.emptyLine}>No proposals sent.</Text>
          ) : (
            (proposals.data ?? []).map((p) => (
              <View key={p.id} style={styles.proposalRow}>
                <View style={styles.proposalBody}>
                  <Text style={styles.proposalName}>{p.umpireName}</Text>
                  <Text style={styles.proposalMeta}>
                    {p.status}
                    {Number(p.incentiveAmount) > 0 ? ` · +${p.currency} ${p.incentiveAmount}` : ''}
                  </Text>
                  {p.message ? <Text style={styles.proposalMsg}>{p.message}</Text> : null}
                </View>
                {p.status === 'PENDING' ? (
                  <TouchableOpacity
                    onPress={() => onWithdraw(p.id)}
                    disabled={cancelProposal.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw proposal"
                  >
                    <Text style={styles.linkDanger}>Withdraw</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
          {pendingProposals.length > 0 ? (
            <Text style={styles.help}>{pendingProposals.length} awaiting a response.</Text>
          ) : null}
        </View>

        {canRecommend ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Recommended umpires</Text>
            {recommended.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
            ) : recommended.isError ? (
              <Text style={styles.muted}>Couldn’t load recommendations.</Text>
            ) : (recommended.data ?? []).length === 0 ? (
              <Text style={styles.emptyLine}>No eligible umpires right now.</Text>
            ) : (
              <>
                {(recommended.data ?? []).slice(0, 5).map((c) => (
                  <View key={c.id} style={styles.recRow}>
                    <Text style={styles.recName}>{c.name}</Text>
                    {reputationLine(c.reputation) ? <Text style={styles.recMeta}>{reputationLine(c.reputation)}</Text> : null}
                    {c.reasons.length > 0 ? <Text style={styles.recReason}>{c.reasons[0]}</Text> : null}
                  </View>
                ))}
                <Text style={styles.help}>Open a slot to propose an umpire.</Text>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Staffing history</Text>
          {history.isLoading ? (
            <ActivityIndicator color={LocColors.green} style={styles.sectionLoading} />
          ) : (history.data ?? []).length === 0 ? (
            <Text style={styles.emptyLine}>No staffing changes yet.</Text>
          ) : (
            (history.data ?? []).map((e) => (
              <View key={e.id} style={styles.histRow}>
                <Text style={styles.histEvent}>
                  {e.eventType.replace(/_/g, ' ')}
                  {e.umpireName ? ` — ${e.umpireName}` : ''}
                </Text>
                <Text style={styles.histTime}>
                  {formatDateLong(e.recordedAt)} · {formatTime(e.recordedAt)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={feeOpen} transparent animationType="slide" onRequestClose={() => setFeeOpen(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.sheetTitle}>Umpire fee</Text>
            <FormField
              label="Amount (₹ per umpire)"
              value={feeInput}
              onChangeText={setFeeInput}
              keyboardType="number-pad"
              error={feeInput.trim() && feeInvalid ? 'Enter a valid non-negative amount.' : null}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setFeeOpen(false)} disabled={setFee.isPending} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (feeInvalid || setFee.isPending) && styles.primaryBtnDisabled]}
                onPress={submitFee}
                disabled={feeInvalid || setFee.isPending}
                accessibilityRole="button"
              >
                {setFee.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
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
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  sectionLoading: { alignSelf: 'flex-start' },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  linkDanger: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: '#B91C1C' },
  help: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  feeValue: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  slotBody: { flex: 1, gap: 4 },
  slotName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  slotBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  proposalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  proposalBody: { flex: 1, gap: 2 },
  proposalName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  proposalMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  proposalMsg: { fontSize: Typography.fontSize.xs, color: LocColors.ink },
  recRow: { paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: LocColors.border, gap: 2 },
  recName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  recMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  recReason: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  histRow: { paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: LocColors.border },
  histEvent: { fontSize: Typography.fontSize.sm, color: LocColors.navy, textTransform: 'capitalize' },
  histTime: { fontSize: Typography.fontSize.xs, color: LocColors.faint, marginTop: 1 },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sheetTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  sheetActions: { flexDirection: 'row', gap: Spacing.md },
  primaryBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  secondaryBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
})
