import React from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { MatchRow } from '../../../src/components/owner/MatchRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useOwnerMatches, useUmpireOpsSummary } from '../../../src/hooks/useOwnerMatches'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function OwnerMatchesScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const matches = useOwnerMatches(publicGroundId)
  const ops = useUmpireOpsSummary(publicGroundId)

  const list = matches.data ?? []

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Matches" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to view its matches." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Matches"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity onPress={() => router.push('/(owner)/matches/new')} accessibilityRole="button" accessibilityLabel="Create match">
            <MaterialCommunityIcons name="plus" size={22} color={LocColors.green} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={matches.isRefetching}
            onRefresh={() => {
              matches.refetch()
              ops.refetch()
            }}
            tintColor={LocColors.green}
          />
        }
      >
        <GroundSelector />

        {ops.data ? (
          <View style={styles.opsCard}>
            <Text style={styles.opsTitle}>This month</Text>
            <View style={styles.opsGrid}>
              <Metric value={String(ops.data.matchesThisMonth)} label="Matches" />
              <Metric value={String(ops.data.fullyStaffed)} label="Fully staffed" />
              <Metric value={String(ops.data.currentlyUnderstaffedUpcoming)} label="Understaffed" />
              <Metric value={String(ops.data.noShowCount)} label="No-shows" />
              {ops.data.avgUmpireRating != null ? (
                <Metric value={ops.data.avgUmpireRating.toFixed(1)} label={`Umpire rating (${ops.data.ratingSampleSize})`} />
              ) : null}
            </View>
          </View>
        ) : null}

        {matches.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : matches.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load matches.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => matches.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <EmptyState
            icon="🏏"
            title="No matches"
            message="No matches have been scheduled at this ground yet. Tap + to create one."
            actionLabel="Create match"
            onAction={() => router.push('/(owner)/matches/new')}
          />
        ) : (
          <View style={styles.list}>
            {list.map((m) => (
              <MatchRow key={m.id} match={m} onPress={() => router.push(`/(owner)/matches/${m.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  opsCard: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  opsTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  opsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  metric: { minWidth: 72, gap: 2 },
  metricValue: { fontSize: Typography.fontSize.xl, fontWeight: '800', color: LocColors.greenStrong },
  metricLabel: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  list: { gap: Spacing.sm },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
