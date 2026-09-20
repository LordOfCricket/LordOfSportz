import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { SubScreenHeader } from '../../src/components/umpire/SubScreenHeader'
import { useUmpireProposals, useRespondToProposal } from '../../src/hooks/useUmpireSecondary'
import { getErrorMessage } from '../../src/utils/errors'
import type { UmpireProposal } from '../../src/services/umpireApi'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const money = (n: number, ccy: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy || 'INR', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${ccy} ${n}`
  }
}
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function UmpireProposalsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, refetch, isRefetching } = useUmpireProposals()
  const respond = useRespondToProposal()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; msg: string } | null>(null)

  const act = (p: UmpireProposal, accept: boolean) => {
    const run = async () => {
      setBusyId(p.id)
      setRowError(null)
      try {
        await respond.mutateAsync({ proposalId: p.id, accept })
      } catch (err) {
        setRowError({ id: p.id, msg: getErrorMessage(err) })
      } finally {
        setBusyId(null)
      }
    }
    if (accept) {
      Alert.alert('Accept offer', 'Accept this umpiring assignment?', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Accept', onPress: run },
      ])
    } else {
      Alert.alert('Decline offer', 'Decline this umpiring offer?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: run },
      ])
    }
  }

  return (
    <View style={styles.container}>
      <SubScreenHeader title="Proposals" />
      <FlatList
        data={data ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={LocColors.green} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={LocColors.green} />
            </View>
          ) : isError ? (
            <View style={styles.centerPad}>
              <Text style={styles.stateTitle}>Couldn’t load proposals</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.centerPad}>
              <MaterialCommunityIcons name="email-outline" size={36} color={LocColors.border} />
              <Text style={styles.stateTitle}>No proposals</Text>
              <Text style={styles.stateBody}>Direct umpiring offers from organisers will appear here.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const pending = item.status === 'PENDING'
          const busy = busyId === item.id
          return (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => router.push(`/(umpire)/matches/${item.match_id}` as any)}
                accessibilityRole="button"
              >
                <Text style={styles.teams} numberOfLines={2}>
                  {item.team_a_name} <Text style={styles.vs}>vs</Text> {item.team_b_name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[fmtDate(item.match_date), item.ground_name, item.ground_city].filter(Boolean).join(' · ')}
                </Text>
                {item.proposed_by_name && (
                  <Text style={styles.meta} numberOfLines={1}>
                    From {item.proposed_by_name}
                  </Text>
                )}
                {Number(item.incentive_amount) > 0 && (
                  <Text style={styles.fee}>Fee offered: {money(Number(item.incentive_amount), item.currency)}</Text>
                )}
                {!!item.message && <Text style={styles.message}>“{item.message}”</Text>}
              </TouchableOpacity>

              {!pending && (
                <View style={[styles.statusPill, styles.statusPillNeutral]}>
                  <Text style={styles.statusPillText}>{item.status.toLowerCase()}</Text>
                </View>
              )}

              {rowError?.id === item.id && <Text style={styles.rowError}>{rowError.msg}</Text>}

              {pending && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.declineBtn, busy && styles.btnDisabled]}
                    onPress={() => act(item, false)}
                    disabled={busy}
                    accessibilityRole="button"
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, busy && styles.btnDisabled]}
                    onPress={() => act(item, true)}
                    disabled={busy}
                    accessibilityRole="button"
                  >
                    {busy ? (
                      <ActivityIndicator color={LocColors.surface} />
                    ) : (
                      <Text style={styles.acceptText}>Accept</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  listContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  stateTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy, marginTop: Spacing.sm },
  stateBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  teams: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  vs: { color: LocColors.faint, fontWeight: Typography.fontWeight.normal },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  fee: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.greenStrong, marginTop: 4 },
  message: { fontSize: Typography.fontSize.xs, color: LocColors.muted, fontStyle: 'italic', marginTop: 4 },
  statusPill: { alignSelf: 'flex-start', marginTop: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusPillNeutral: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  statusPillText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: LocColors.muted, textTransform: 'capitalize' },
  rowError: { fontSize: Typography.fontSize.xs, color: '#DC2626', marginTop: Spacing.xs },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  declineBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: LocColors.borderSoft },
  declineText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
  acceptBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  acceptText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  btnDisabled: { opacity: 0.6 },
})
