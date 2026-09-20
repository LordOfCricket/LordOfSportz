import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePublicPlayerStats, usePublicPlayerProfile } from '../../../src/hooks/usePlayer'
import { PlayerMatchPerformance } from '../../../src/types'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'
import { formatDate } from '../../../src/utils/playerFormatting'

// Full paginated match history for a PUBLIC player — parity with the
// website's Player Profile "Matches" tab. Reuses GET /players/:id/stats with
// the same limit/offset pagination the authenticated Profile match history
// already uses (each page is its own React Query key). Rows open the public
// match scorecard. "Represented: <team>" uses the real per-match
// match_players.team_id snapshot, shown only for multi-team players.

const PAGE_SIZE = 10

function battingLine(b: PlayerMatchPerformance['batting']): string {
  if (!b?.didBat) return 'DNB'
  return `${b.runs} (${b.balls})${b.notOut ? '*' : ''}`
}
function bowlingLine(b: PlayerMatchPerformance['bowling']): string {
  if (!b?.didBowl) return 'DNB'
  return `${b.wickets}/${b.runs}`
}
function resultBadge(won: boolean | null): { text: string; color: string } {
  if (won === true) return { text: 'Won', color: Colors.success }
  if (won === false) return { text: 'Lost', color: Colors.error }
  return { text: 'Result', color: Colors.gray[400] }
}

export default function PublicMatchHistoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { publicPlayerId } = useLocalSearchParams<{ publicPlayerId: string }>()

  const [offset, setOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [rows, setRows] = useState<PlayerMatchPerformance[]>([])

  const statsQuery = usePublicPlayerStats(publicPlayerId ?? null, PAGE_SIZE, offset)
  const profileQuery = usePublicPlayerProfile(publicPlayerId ?? null)

  useEffect(() => {
    const items = statsQuery.data?.matchHistory?.items
    if (!items) return
    if (offset === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows(items)
    } else {
      setRows((prev) => {
        const seen = new Set(prev.map((m) => m.matchId))
        const fresh = items.filter((m) => !seen.has(m.matchId))
        return fresh.length ? [...prev, ...fresh] : prev
      })
    }
  }, [statsQuery.data?.matchHistory?.items, offset])

  const teamHistory = statsQuery.data?.teamHistory ?? []
  const showRepresented = teamHistory.length > 1
  const teamNameById = new Map<number, string>(teamHistory.map((t) => [t.teamId, t.shortName || t.name]))

  const total = statsQuery.data?.matchHistory?.total ?? 0
  const hasMore = rows.length < total

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    setOffset(0)
    setRows([])
    try {
      await statsQuery.refetch()
    } finally {
      setRefreshing(false)
    }
  }, [statsQuery])

  const loadMore = () => {
    if (hasMore && !statsQuery.isPending && !statsQuery.error) setOffset((o) => o + PAGE_SIZE)
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {profileQuery.data?.name ? `${profileQuery.data.name} · Matches` : 'Match History'}
      </Text>
      <View style={{ width: 44 }} />
    </View>
  )

  if (!publicPlayerId) {
    return (
      <View style={styles.container}>
        {header}
        <ErrorScreen title="Invalid Player" message="Player ID is missing." onRetry={() => router.back()} retryLabel="Back" />
      </View>
    )
  }
  if (offset === 0 && statsQuery.isPending) return <LoadingScreen />
  if (offset === 0 && statsQuery.error) {
    return (
      <View style={styles.container}>
        {header}
        <ErrorScreen
          title="Failed to Load"
          message="Could not load this player's match history."
          onRetry={() => statsQuery.refetch()}
          retryLabel="Retry"
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {header}
      {rows.length === 0 && !statsQuery.isPending ? (
        <EmptyState title="No Matches" message="This player has no finalized match history yet." />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => String(m.matchId)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item }) => {
            const badge = resultBadge(item.won)
            const rep = showRepresented && item.teamId != null ? teamNameById.get(item.teamId) : undefined
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/(tabs)/matches/${item.matchId}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`Match vs ${item.opponent} on ${formatDate(item.date)} — open scorecard`}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.rowDate}>{formatDate(item.date)}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.color }]}>
                    <Text style={styles.badgeText}>{badge.text}</Text>
                  </View>
                </View>
                <Text style={styles.rowOpponent} numberOfLines={1}>
                  vs {item.opponent}
                </Text>
                {rep ? <Text style={styles.rowRepresented}>Represented: {rep}</Text> : null}
                {item.result ? (
                  <Text style={styles.rowResult} numberOfLines={1}>
                    {item.result}
                  </Text>
                ) : null}
                <View style={styles.rowStats}>
                  <Text style={styles.rowStat}>Bat {battingLine(item.batting)}</Text>
                  <Text style={styles.rowStat}>Bowl {bowlingLine(item.bowling)}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
          ListFooterComponent={
            <>
              {statsQuery.isPending && rows.length > 0 && (
                <View style={styles.footer}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              )}
              {hasMore && !statsQuery.isPending && !statsQuery.error && (
                <TouchableOpacity style={styles.loadMore} onPress={loadMore}>
                  <Text style={styles.loadMoreText}>
                    Load More ({rows.length} of {total})
                  </Text>
                </TouchableOpacity>
              )}
              {hasMore && !!statsQuery.error && offset > 0 && (
                <View style={styles.footer}>
                  <Text style={styles.loadMoreErr}>Could not load more.</Text>
                  <TouchableOpacity onPress={() => statsQuery.refetch()}>
                    <Text style={styles.loadMoreRetry}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!hasMore && rows.length > 0 && !statsQuery.isPending && (
                <Text style={styles.endText}>That&apos;s the full match history.</Text>
              )}
            </>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  title: { flex: 1, textAlign: 'center', fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  row: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    marginBottom: Spacing.md,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  rowDate: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, fontWeight: Typography.fontWeight.medium },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: Typography.fontSize.xs, color: Colors.white, fontWeight: Typography.fontWeight.bold },
  rowOpponent: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  rowRepresented: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium, marginTop: 2 },
  rowResult: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  rowStats: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.sm },
  rowStat: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.semibold },
  footer: { paddingVertical: Spacing.lg, alignItems: 'center', gap: Spacing.xs },
  loadMore: {
    marginVertical: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  loadMoreText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.semibold },
  loadMoreErr: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  loadMoreRetry: { fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  endText: { textAlign: 'center', fontSize: Typography.fontSize.sm, color: Colors.textTertiary, marginVertical: Spacing.lg },
})
