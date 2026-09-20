import React from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMyPlayer, useMyPlayerStats } from '../../../../src/hooks/usePlayer'
import { useMatchDetail } from '../../../../src/hooks/useMatches'
import { useAuth } from '../../../../src/hooks/useAuth'
import { Colors, Spacing, Typography } from '../../../../src/constants/colors'
import { LoadingScreen } from '../../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../../src/components/ErrorScreen'
import { EmptyState } from '../../../../src/components/EmptyState'
import { MatchSummary } from '../../../../src/types'

export default function MatchDetailScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const matchIdNum = matchId ? parseInt(matchId, 10) : NaN

  // Fetch all player stats to find the requested match (unchanged — this
  // remains the source for the player's OWN batting/bowling figures).
  const statsQuery = useMyPlayerStats(50, 0, user?.role === 'player')
  const playerQuery = useMyPlayer(user?.role === 'player')
  // Reuses the EXISTING GET /matches/:id/summary hook (already used by the
  // public Matches tab) purely as an enrichment layer: real result_type
  // (Won/Lost/Tied/No Result, instead of guessing from won:boolean|null)
  // and the REAL team the player represented in THIS match specifically
  // (match_players.team_id snapshot, via playingXi — never
  // player.team_id, which is only the player's CURRENT team and can be
  // wrong for an older match). Soft/optional: if this fails or is still
  // loading, the screen still renders fully from statsQuery alone, just
  // without these two enrichments — no second hard loading/error gate.
  const matchSummaryQuery = useMatchDetail(matchIdNum)

  if (!user || user.role !== 'player') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          title="Player Profile Required"
          message="You need a player role to view match details."
        />
      </View>
    )
  }

  if (!matchId) {
    return (
      <ErrorScreen
        title="Invalid Match"
        message="Match ID is missing. Please try again."
        onRetry={() => router.back()}
        retryLabel="Back"
      />
    )
  }

  if (statsQuery.isPending) {
    return <LoadingScreen />
  }

  if (statsQuery.error) {
    return (
      <ErrorScreen
        title="Failed to Load Match"
        message="Could not load match details."
        onRetry={() => statsQuery.refetch()}
        retryLabel="Retry"
      />
    )
  }

  const match = statsQuery.data?.matchHistory?.items?.find((m) => m.matchId === matchIdNum)

  if (!match) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Match Details</Text>
          <View style={{ width: 50 }} />
        </View>
        <EmptyState
          title="Match Not Found"
          message="Unable to find this match in your match history."
        />
      </View>
    )
  }

  const matchSummary: MatchSummary | undefined = matchSummaryQuery.data
  // The real team this player represented in THIS match specifically —
  // resolved from the match's own playing-XI snapshot (matches
  // match_players.team_id), never from player.team_id (only the player's
  // CURRENT team, which is wrong for an older match after a transfer). Soft:
  // simply absent while matchSummaryQuery is loading/unavailable.
  const playerPublicId = playerQuery.data?.public_player_id
  const representedTeam =
    matchSummary && playerPublicId
      ? matchSummary.playingXi.teamA.some((e) => e.player.publicPlayerId === playerPublicId)
        ? matchSummary.teams.teamA
        : matchSummary.playingXi.teamB.some((e) => e.player.publicPlayerId === playerPublicId)
        ? matchSummary.teams.teamB
        : null
      : null
  const resultInfo = getResultInfo(match.won, matchSummary?.result?.resultType)

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Match Performance</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Match Header */}
        <View style={styles.matchHeader}>
          <Text style={styles.date}>{formatDate(match.date)}</Text>
          <Text style={styles.venue}>{match.venue || 'Venue unavailable'}</Text>

          {representedTeam && <Text style={styles.representedTeam}>Playing for {representedTeam.name}</Text>}

          <View style={styles.matchupRow}>
            <Text style={styles.opponent}>vs {match.opponent || 'Unknown'}</Text>
          </View>

          {/* Real per-innings scoreline, when the match summary is available
              — genuine match-level context beyond the player's own figures. */}
          {matchSummary && matchSummary.innings.length > 0 && (
            <View style={styles.inningsRow}>
              {matchSummary.innings.map((inn) => {
                const teamName =
                  inn.battingTeamId === matchSummary.teams.teamA.id
                    ? matchSummary.teams.teamA.shortName
                    : matchSummary.teams.teamB.shortName
                return (
                  <Text key={inn.inningsId} style={styles.inningsLine}>
                    {teamName} {inn.score.runs}/{inn.score.wickets} ({inn.score.oversLabel})
                  </Text>
                )
              })}
            </View>
          )}

          {match.result && <Text style={styles.matchResult}>{match.result}</Text>}

          <View style={[styles.resultBadge, { backgroundColor: resultInfo.color }]}>
            <Text style={styles.resultText}>{resultInfo.label}</Text>
          </View>

          {/* Route into the full public scorecard for this match (batting/
              bowling tables, fall of wickets, playing XI). Only offered
              once the match summary has actually loaded. */}
          {matchSummary && matchSummary.innings.length > 0 && (
            <TouchableOpacity
              style={styles.scorecardLink}
              onPress={() => router.push(`/(tabs)/matches/${matchIdNum}` as any)}
              accessibilityRole="button"
              accessibilityLabel="View the full match scorecard"
            >
              <Text style={styles.scorecardLinkText}>View full scorecard →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Batting Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BATTING</Text>
          <View style={styles.card}>
            {match.batting?.didBat ? (
              <>
                <StatRow label="Runs" value={match.batting.runs?.toString() || '-'} highlight />
                <StatRow label="Balls" value={match.batting.balls?.toString() || '-'} />
                <StatRow label="Fours" value={match.batting.fours?.toString() || '-'} />
                <StatRow label="Sixes" value={match.batting.sixes?.toString() || '-'} />
                <StatRow
                  label="Strike Rate"
                  value={match.batting.strikeRate ? match.batting.strikeRate.toFixed(2) : '-'}
                />
              </>
            ) : (
              <Text style={styles.didNotParticipateText}>Did not bat</Text>
            )}
          </View>
        </View>

        {/* Bowling Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BOWLING</Text>
          <View style={styles.card}>
            {match.bowling?.didBowl ? (
              <>
                <StatRow label="Wickets" value={match.bowling.wickets?.toString() || '-'} highlight />
                <StatRow label="Runs" value={match.bowling.runs?.toString() || '-'} />
                <StatRow
                  label="Overs"
                  value={match.bowling.legalBalls ? formatOvers(match.bowling.legalBalls) : '-'}
                />
                <StatRow label="Maidens" value={match.bowling.maidens?.toString() || '-'} />
                <StatRow
                  label="Economy"
                  value={match.bowling.economy ? match.bowling.economy.toFixed(2) : '-'}
                />
              </>
            ) : (
              <Text style={styles.didNotParticipateText}>Did not bowl</Text>
            )}
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  )
}

function StatRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>{value}</Text>
    </View>
  )
}

// QA fix: was `new Date(dateString).toLocaleDateString(...)` with no
// `timeZone` option — silently shifts the displayed day back by one on any
// negative-UTC-offset device (match.date's digits are already the correct
// ground-local calendar date — see server/src/domain/shared/groundTime.js
// — but a UTC-anchored parse + local-timezone render can re-interpret them
// a day early). Parsing the digits directly and building via the local
// numeric Date constructor never round-trips through UTC.
function formatDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString)
  if (!match) return dateString
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatOvers(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6)
  const balls = legalBalls % 6
  return `${overs}.${balls}`
}

// `won` (boolean|null) alone can't distinguish a tie from a no-result — both
// collapse to null (statistics.service.js#wonFor has no separate field for
// this on the PlayerMatchPerformance DTO). The match summary's real
// `result.resultType` (GET /matches/:id/summary) DOES carry that distinction
// when available, so it's used here instead of guessing — never inventing a
// Tie/Draw label from the boolean alone. Falls back to the safe
// Won/Lost/Other behavior when the summary hasn't loaded.
function getResultInfo(won: boolean | null, resultType?: string): { label: string; color: string } {
  if (won === true) return { label: 'Won', color: Colors.success }
  if (won === false) return { label: 'Lost', color: Colors.error }
  if (resultType === 'TIE') return { label: 'Tied', color: Colors.gray[400] }
  if (resultType === 'NO_RESULT') return { label: 'No Result', color: Colors.gray[400] }
  return { label: 'Other', color: Colors.gray[400] }
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
  scrollView: {
    flex: 1,
  },
  matchHeader: {
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  date: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: Spacing.sm,
  },
  venue: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  representedTeam: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
  },
  matchupRow: {
    marginBottom: Spacing.md,
  },
  opponent: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  inningsRow: {
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  inningsLine: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  matchResult: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  resultBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 4,
  },
  resultText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  scorecardLink: {
    marginTop: Spacing.md,
  },
  scorecardLinkText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  statValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.semibold,
  },
  statValueHighlight: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  didNotParticipateText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    padding: Spacing.md,
  },
  bottomSpacer: {
    height: Spacing.lg,
  },
})
