import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { usePublicPlayerStats, usePublicPlayerProfile } from '../../../src/hooks/usePlayer'
import { CareerTimelineYear } from '../../../src/types'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'

// Standalone Career Timeline — GET /players/:publicPlayerId/stats
// `careerTimeline` (server/src/domain/statistics/careerTimeline.js). A
// year-by-year summary derived from finalized-match history; team names come
// from the real per-match team snapshot, never the current roster. Kept off
// the profile scroll (it can get long) with entry points from both the
// public profile and the authenticated Profile. Reuses the same 50-match
// stats query key the public profile uses, so arriving from there is a
// cache hit — no extra request.

export default function CareerTimelineScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { publicPlayerId } = useLocalSearchParams<{ publicPlayerId: string }>()

  const statsQuery = usePublicPlayerStats(publicPlayerId ?? null, 50, 0)
  const profileQuery = usePublicPlayerProfile(publicPlayerId ?? null)

  const openMatch = (matchId: number) => router.push(`/(tabs)/matches/${matchId}` as any)
  const openTeam = (teamId: number) => router.push(`/(tabs)/teams/${teamId}` as any)

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {profileQuery.data?.name ? `${profileQuery.data.name} · Timeline` : 'Career Timeline'}
      </Text>
      <View style={{ width: 22 }} />
    </View>
  )

  if (!publicPlayerId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorScreen title="Invalid Player" message="Player ID is missing." onRetry={() => router.back()} retryLabel="Back" />
      </View>
    )
  }

  if (statsQuery.isPending) return <LoadingScreen />

  if (statsQuery.error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorScreen
          title="Timeline Unavailable"
          message="Could not load this player's career timeline."
          onRetry={() => statsQuery.refetch()}
          retryLabel="Retry"
        />
      </View>
    )
  }

  const timeline: CareerTimelineYear[] = statsQuery.data?.careerTimeline ?? []

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}
      {timeline.length === 0 ? (
        <View style={styles.centerFill}>
          <EmptyState
            title="No Career Timeline Yet"
            message="It builds from finalized match history — check back after a first finalized match."
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {timeline.map((y) => (
            <View key={y.year} style={styles.yearCard}>
              <View style={styles.yearHead}>
                <Text style={styles.year}>{y.year}</Text>
                <Text style={styles.yearSummary} numberOfLines={1}>
                  {y.matches} {y.matches === 1 ? 'match' : 'matches'}
                  {y.runs > 0 ? ` · ${y.runs} runs` : ''}
                  {y.wickets > 0 ? ` · ${y.wickets} wkts` : ''}
                </Text>
              </View>

              {y.teams.length > 0 && (
                <View style={styles.teamRow}>
                  {y.teams.map((t) => {
                    const label = `${t.name || t.shortName || `Team ${t.teamId}`} · ${t.matches}`
                    return (
                      <TouchableOpacity
                        key={t.teamId}
                        style={styles.teamChip}
                        disabled={!t.teamId}
                        onPress={() => openTeam(t.teamId)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${t.name || 'team'}`}
                      >
                        <Text style={styles.teamChipText} numberOfLines={1}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {y.milestones.length > 0 && (
                <View style={styles.milestoneList}>
                  {y.milestones.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.milestoneRow}
                      disabled={!m.matchId}
                      onPress={() => m.matchId && openMatch(m.matchId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.title}${m.opponent ? `, versus ${m.opponent}` : ''}`}
                    >
                      <MaterialCommunityIcons name="sign-direction" size={15} color={Colors.primary} />
                      <Text style={styles.milestoneText} numberOfLines={2}>
                        {m.title}
                        {m.opponent ? <Text style={styles.milestoneOpp}> · vs {m.opponent}</Text> : null}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
          <View style={{ height: Spacing['3xl'] }} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  centerFill: { flex: 1, justifyContent: 'center' },
  scroll: { padding: Spacing.lg, gap: Spacing.md },
  yearCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    marginBottom: Spacing.md,
  },
  yearHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
  year: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  yearSummary: { flexShrink: 1, fontSize: Typography.fontSize.xs, color: Colors.textSecondary, textAlign: 'right' },
  teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  teamChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: Colors.background,
    maxWidth: '100%',
  },
  teamChipText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.text },
  milestoneList: { marginTop: Spacing.md, gap: Spacing.sm },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  milestoneText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.primary, fontWeight: Typography.fontWeight.medium },
  milestoneOpp: { color: Colors.textTertiary, fontWeight: Typography.fontWeight.normal },
})
