import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMyPlayerStats } from '../../../src/hooks/usePlayer'
import { useAuth } from '../../../src/hooks/useAuth'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'
import { PlayerMatchPerformance } from '../../../src/types'

const PAGE_SIZE = 10

export default function MatchHistoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [offset, setOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [allMatches, setAllMatches] = useState<PlayerMatchPerformance[]>([])

  const handleMatchTap = useCallback((matchId: number) => {
    router.push(`/profile/matches/${matchId}`)
  }, [router])

  const statsQuery = useMyPlayerStats(PAGE_SIZE, offset, user?.role === 'player')

  React.useEffect(() => {
    if (statsQuery.data?.matchHistory?.items) {
      if (offset === 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAllMatches(statsQuery.data.matchHistory.items)
      } else {
        // QA fix: append with a dedupe-by-matchId guard instead of a blind
        // concat. A background refetch of the SAME page (window focus,
        // reconnect, pull-to-refresh racing a load-more) can re-fire this
        // effect with a new `items` array reference at an unchanged
        // `offset`, which previously re-appended the same matches and
        // produced visible duplicate rows.
        const items = statsQuery.data.matchHistory.items
        setAllMatches((prev) => {
          const existingIds = new Set(prev.map((m) => m.matchId))
          const newItems = items.filter((m) => !existingIds.has(m.matchId))
          return newItems.length > 0 ? [...prev, ...newItems] : prev
        })
      }
    }
  }, [statsQuery.data?.matchHistory?.items, offset])

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    setOffset(0)
    setAllMatches([])
    try {
      await statsQuery.refetch()
    } finally {
      setRefreshing(false)
    }
  }, [statsQuery])

  const handleLoadMore = React.useCallback(() => {
    if (
      statsQuery.data?.matchHistory &&
      allMatches.length < statsQuery.data.matchHistory.total &&
      !statsQuery.isPending
    ) {
      setOffset((prev) => prev + PAGE_SIZE)
    }
  }, [statsQuery.data, allMatches.length, statsQuery.isPending])

  if (!user || user.role !== 'player') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          title="Player Profile Required"
          message="You need a player role to view match history."
        />
      </View>
    )
  }

  if (offset === 0 && statsQuery.isPending) {
    return <LoadingScreen />
  }

  if (offset === 0 && statsQuery.error) {
    return (
      <ErrorScreen
        title="Failed to Load Matches"
        message="Could not load your match history."
        onRetry={() => statsQuery.refetch()}
        retryLabel="Retry"
      />
    )
  }

  // Real per-match team representation (match_players.team_id snapshot),
  // resolved to a name via teamHistory. Only surfaced when the player has
  // represented more than one team — otherwise it's redundant with the
  // header. Never the player's CURRENT team.
  const teamHistory = statsQuery.data?.teamHistory ?? []
  const showRepresented = teamHistory.length > 1
  const teamNameById = new Map<number, string>(teamHistory.map((t) => [t.teamId, t.shortName || t.name]))

  const total = statsQuery.data?.matchHistory?.total || 0
  const hasMoreToLoad = allMatches.length < total
  // A first-page error already returns the full-screen ErrorScreen above
  // (offset === 0 && statsQuery.error), so reaching here with an error
  // means a LOAD MORE request specifically failed — show that inline in the
  // footer instead of leaving the "Load More" button silently misleading.
  const showLoadMoreError = hasMoreToLoad && !!statsQuery.error
  const showLoadMore = hasMoreToLoad && !statsQuery.isPending && !statsQuery.error
  const showEndOfHistory = !hasMoreToLoad && allMatches.length > 0 && !statsQuery.isPending

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Match History</Text>
        <View style={{ width: 50 }} />
      </View>

      {allMatches.length === 0 && !statsQuery.isPending ? (
        <EmptyState
          title="No Matches"
          message="Your match performances will appear here after you play."
        />
      ) : (
        <FlatList
          data={allMatches}
          keyExtractor={(item) => `${item.matchId}`}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              representedTeam={showRepresented && item.teamId != null ? teamNameById.get(item.teamId) : undefined}
              onPress={() => handleMatchTap(item.matchId)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
          }
          ListFooterComponent={
            <>
              {statsQuery.isPending && allMatches.length > 0 && (
                <View style={styles.loadingFooter}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              )}
              {showLoadMoreError && (
                <View style={styles.loadMoreErrorBox}>
                  <Text style={styles.loadMoreErrorText}>Could not load more matches.</Text>
                  <TouchableOpacity onPress={() => statsQuery.refetch()}>
                    <Text style={styles.loadMoreRetryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {showLoadMore && (
                <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                  <Text style={styles.loadMoreText}>Load More Matches</Text>
                </TouchableOpacity>
              )}
              {showEndOfHistory && (
                <Text style={styles.endOfHistoryText}>You{"'"}ve reached the end of your match history.</Text>
              )}
            </>
          }
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
        />
      )}
    </View>
  )
}

function MatchCard({
  match,
  representedTeam,
  onPress,
}: {
  match: PlayerMatchPerformance
  representedTeam?: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.date}>{formatDate(match.date)}</Text>
        <View style={[styles.resultBadge, { backgroundColor: getResultColor(match.won) }]}>
          <Text style={styles.resultText}>{getResultLabel(match.won)}</Text>
        </View>
      </View>

      <Text style={styles.venue}>{match.venue || 'Venue unavailable'}</Text>
      <Text style={styles.opponent}>vs {match.opponent || 'Opponent unavailable'}</Text>
      {representedTeam ? <Text style={styles.represented}>Represented: {representedTeam}</Text> : null}

      {match.result && <Text style={styles.matchResult}>{match.result}</Text>}

      <View style={styles.statsContainer}>
        {match.batting?.didBat && (
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Batting</Text>
            <Text style={styles.statValue}>
              {match.batting.runs} ({match.batting.balls})
            </Text>
            <Text style={styles.statDetail}>
              {match.batting.fours}•4 {match.batting.sixes}•6 SR:{' '}
              {match.batting.strikeRate?.toFixed(2) || '-'}
            </Text>
          </View>
        )}

        {match.bowling?.didBowl && (
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Bowling</Text>
            <Text style={styles.statValue}>
              {match.bowling.wickets} / {match.bowling.runs}
            </Text>
            <Text style={styles.statDetail}>
              {formatOvers(match.bowling.legalBalls)} Eco: {match.bowling.economy?.toFixed(2) || '-'}
            </Text>
          </View>
        )}

        {!match.batting?.didBat && !match.bowling?.didBowl && (
          <Text style={styles.dnbText}>Did not participate</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// QA fix: was `new Date(dateString).toLocaleDateString(...)` with no
// `timeZone` option — silently shifts the displayed day back by one on any
// negative-UTC-offset device, since match.date's digits are already the
// correct ground-local calendar date (see server/src/domain/shared/
// groundTime.js) but a UTC-anchored parse + local-timezone render can
// re-interpret them a day early. Parsing the digits directly and building
// via the local numeric Date constructor never round-trips through UTC.
function formatDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString)
  if (!match) return dateString
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatOvers(legalBalls: number | undefined): string {
  if (!legalBalls) return '-'
  const overs = Math.floor(legalBalls / 6)
  const balls = legalBalls % 6
  return `${overs}.${balls}`
}

function getResultColor(won: boolean | null): string {
  if (won === true) return Colors.success
  if (won === false) return Colors.error
  return Colors.gray[400]
}

// QA fix: the neutral (tie/no-result) case previously showed the literal
// word "Result" as the badge text, which reads like an unfinished
// placeholder rather than an honest "we don't know which" state. `won` is
// boolean|null with null covering BOTH a tie and a no-result — there's no
// separate field to tell them apart (see statistics.service.js#wonFor) —
// so this stays neutral rather than guessing, matching the same "–" this
// app's Recent Form already uses for the identical ambiguous case.
function getResultLabel(won: boolean | null): string {
  if (won === true) return 'Won'
  if (won === false) return 'Lost'
  return '–'
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 50,
  },
  backButtonText: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  date: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  resultBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resultText: {
    color: Colors.white,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  venue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: Spacing.xs,
  },
  opponent: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
    marginBottom: Spacing.xs,
  },
  represented: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: Spacing.xs,
  },
  matchResult: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  statsContainer: {
    marginTop: Spacing.md,
  },
  statBlock: {
    marginBottom: Spacing.sm,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.semibold,
    marginBottom: 2,
  },
  statValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  statDetail: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  dnbText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  loadMoreButton: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  loadMoreText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  loadMoreErrorBox: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  loadMoreErrorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  loadMoreRetryText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  endOfHistoryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginVertical: Spacing.lg,
  },
})
