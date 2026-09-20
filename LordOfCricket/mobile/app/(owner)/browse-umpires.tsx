import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { OwnerSubHeader } from '../../src/components/owner/OwnerSubHeader'
import { ProposeUmpireSheet } from '../../src/components/owner/ProposeUmpireSheet'
import { EmptyState } from '../../src/components/EmptyState'
import { useActiveGround } from '../../src/hooks/useMyGrounds'
import { useTopUmpires, useProposeUmpire } from '../../src/hooks/useOwnerMatches'
import { getErrorMessage } from '../../src/utils/errors'
import { TopUmpire } from '../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const PAGE = 20

function reputationLine(u: TopUmpire): string | null {
  const rep = u.reputation
  if (!rep) return null
  const parts: string[] = []
  if (rep.ratingAvg != null) parts.push(`★ ${rep.ratingAvg.toFixed(1)} (${rep.ratingCount})`)
  if (rep.matchesOfficiated > 0) parts.push(`${rep.matchesOfficiated} officiated`)
  if (rep.reliability != null) parts.push(`${Math.round(rep.reliability * 100)}% reliable`)
  if (rep.experienceYears != null) parts.push(`${rep.experienceYears}y exp`)
  return parts.join(' · ') || null
}

export default function BrowseUmpiresScreen() {
  const { matchId: matchIdParam, slotId: slotIdParam } = useLocalSearchParams<{ matchId?: string; slotId?: string }>()
  const matchId = matchIdParam ? Number(matchIdParam) : null
  const slotId = slotIdParam ? Number(slotIdParam) : null
  const proposeMode = matchId != null && slotId != null

  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const [limit, setLimit] = useState(PAGE)
  const query = useTopUmpires(limit, 0)
  const propose = useProposeUmpire(publicGroundId ?? '', matchId ?? -1)

  const [target, setTarget] = useState<{ id: number; name: string } | null>(null)
  const [proposeError, setProposeError] = useState<string | null>(null)

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0

  const submitPropose = async (args: { incentiveAmount?: number; message?: string }) => {
    if (!target || slotId == null) return
    setProposeError(null)
    try {
      await propose.mutateAsync({ slotId, umpireUserId: target.id, ...args })
      setTarget(null)
    } catch (err) {
      setProposeError(getErrorMessage(err))
    }
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Umpires"
        subtitle={proposeMode ? 'Propose for a slot' : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={LocColors.green} />}
      >
        {query.isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : query.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load umpires.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => query.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <EmptyState icon="👤" title="No umpires" message="There are no ranked umpires yet." />
        ) : (
          <>
            {items.map((u) => (
              <View key={u.id} style={styles.row}>
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{u.rank}</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name}>{u.name}</Text>
                  {reputationLine(u) ? <Text style={styles.meta}>{reputationLine(u)}</Text> : null}
                  {u.reasons.length > 0 ? <Text style={styles.reason}>{u.reasons[0]}</Text> : null}
                </View>
                {proposeMode ? (
                  <TouchableOpacity
                    style={styles.proposeBtn}
                    onPress={() => {
                      setProposeError(null)
                      setTarget({ id: u.id, name: u.name })
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Propose ${u.name}`}
                  >
                    <Text style={styles.proposeBtnText}>Propose</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {items.length < total ? (
              <TouchableOpacity style={styles.moreBtn} onPress={() => setLimit((l) => l + PAGE)} accessibilityRole="button">
                <Text style={styles.moreBtnText}>Load more</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>

      {target ? (
        <ProposeUmpireSheet
          umpireName={target.name}
          pending={propose.isPending}
          error={proposeError}
          onClose={() => setTarget(null)}
          onSubmit={submitPropose}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: LocColors.greenStrong },
  body: { flex: 1, gap: 2 },
  name: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  reason: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  proposeBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  proposeBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  moreBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  moreBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
