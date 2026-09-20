import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { shareEntity } from '../../../src/lib/shareEntity'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { useMatchDetail } from '../../../src/hooks/useMatches'
import { useLiveMatch } from '../../../src/hooks/useSocketMatches'
import { useSocketCommentary } from '../../../src/hooks/useSocketCommentary'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { LiveIndicator } from '../../../src/components/LiveIndicator'
import { CurrentPlayers } from '../../../src/components/CurrentPlayers'
import { RecentDeliveries } from '../../../src/components/RecentDeliveries'
import { LiveCommentary } from '../../../src/components/LiveCommentary'
import { MatchScorecard } from '../../../src/components/match/MatchScorecard'
import { AIInsightSection } from '../../../src/components/AIInsightSection'
import { useMatchInsight } from '../../../src/hooks/useAIInsight'

export default function MatchDetailsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const matchId = parseInt(id || '0', 10)
  const [refreshing, setRefreshing] = useState(false)

  const { data: match, isLoading, isError, refetch } = useMatchDetail(matchId)

  // AI match insight is generated only for FINALIZED matches (server returns
  // INSUFFICIENT_DATA otherwise) — don't even request it before then.
  const aiInsight = useMatchInsight(matchId && match?.match?.status === 'finalized' ? matchId : null)

  // Subscribe to realtime match state (enabled when match is live)
  const liveMatch = useLiveMatch(matchId && match?.match?.status === 'live' ? matchId : null, {
    enabled: !!(matchId && match),
  })

  // Subscribe to realtime commentary (enabled when match exists)
  const commentary = useSocketCommentary(matchId && match ? matchId : null, {
    enabled: !!(matchId && match),
  })

  // Focus effect ensures proper cleanup when navigating away
  useFocusEffect(
    React.useCallback(() => {
      // Screen is in focus — listeners should be active (handled by hooks)
      return () => {
        // Screen lost focus — hooks will clean up automatically on unmount
      }
    }, [])
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  // Share the PUBLIC web match-summary URL (opens in any browser), not the
  // app-scheme deep link. The /matches/:id/summary page is a public read.
  const handleShare = async () => {
    if (!match) return
    const a = match.teams.teamA.name
    const b = match.teams.teamB.name
    const line = match.result?.text || (match.match.status === 'live' ? 'Live now' : 'on Lord Of Cricket')
    await shareEntity({ title: `${a} vs ${b}`, message: `${a} vs ${b} — ${line}`, path: `/matches/${matchId}/summary` })
  }

  if (!id) {
    return (
      <ErrorScreen
        title="Error"
        message="Match ID is required"
        onRetry={() => router.back()}
        retryLabel="Go Back"
      />
    )
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load match details. Please try again."
        onRetry={() => refetch()}
      />
    )
  }

  if (!match) {
    return (
      <ErrorScreen
        title="Not Found"
        message="This match could not be found."
        onRetry={() => router.back()}
        retryLabel="Go Back"
      />
    )
  }

  const matchDate = new Date(match.match.matchDate)
  const dateStr = matchDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Use live data if available and it's the current innings, otherwise use HTTP data
  const displayMatch = liveMatch.data && liveMatch.data.currentInnings
    ? liveMatch.data
    : match

  // Determine actual status (prefer live data)
  const actualStatus = displayMatch?.match?.status || match.match.status

  // Get team scores — prefer live data if available, else the most recent
  // REST innings that team batted in (buildInningsSummary's score object).
  const getTeamScore = (teamId: number) => {
    const restInningsForTeam = match.innings.filter((inn) => inn.battingTeamId === teamId)
    const latestRestInnings = restInningsForTeam[restInningsForTeam.length - 1] || null

    if (!liveMatch.data?.currentInnings) {
      if (!latestRestInnings) return { runs: null, wickets: null, overs: null }
      return {
        runs: latestRestInnings.score.runs,
        wickets: latestRestInnings.score.wickets,
        overs: latestRestInnings.score.oversLabel,
      }
    }

    const teamBattingInCurrent = liveMatch.data.currentInnings.battingTeamId === teamId
    if (!teamBattingInCurrent) {
      if (!latestRestInnings) return { runs: null, wickets: null, overs: null }
      return {
        runs: latestRestInnings.score.runs,
        wickets: latestRestInnings.score.wickets,
        overs: latestRestInnings.score.oversLabel,
      }
    }

    // This team is batting now — use live data
    return {
      runs: liveMatch.data.currentInnings.runs,
      wickets: liveMatch.data.currentInnings.wickets,
      overs: liveMatch.data.currentInnings.oversLabel,
    }
  }

  const teamAScore = getTeamScore(match.teams.teamA.id)
  const teamBScore = getTeamScore(match.teams.teamB.id)

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <LiveIndicator
            status={(actualStatus as 'live' | 'upcoming' | 'completed' | 'finalized' | 'cancelled') || 'upcoming'}
            isConnected={liveMatch.connected}
          />
          <TouchableOpacity onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share this match" hitSlop={8}>
            <MaterialCommunityIcons name="share-variant" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Match Info */}
      <View style={styles.card}>
        <Text style={styles.dateText}>{dateStr}</Text>
        {match.match.venue && <Text style={styles.venueText}>{match.match.venue}</Text>}
      </View>

      {/* Teams with Live Score — team names navigate to the Team Profile
          (real numeric team id from the match summary DTO). */}
      <View style={styles.card}>
        <View style={styles.teamContainer}>
          <View style={styles.team}>
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/teams/${match.teams.teamA.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View ${match.teams.teamA.name} team profile`}
            >
              <Text style={[styles.teamName, styles.teamNameLink]} numberOfLines={2}>
                {match.teams.teamA.name}
              </Text>
            </TouchableOpacity>
            {teamAScore.runs !== null && (
              <Text style={styles.score}>
                {teamAScore.runs}/{teamAScore.wickets}
              </Text>
            )}
            {teamAScore.overs && <Text style={styles.overs}>{teamAScore.overs} overs</Text>}
          </View>

          <Text style={styles.vs}>vs</Text>

          <View style={styles.team}>
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/teams/${match.teams.teamB.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View ${match.teams.teamB.name} team profile`}
            >
              <Text style={[styles.teamName, styles.teamNameLink]} numberOfLines={2}>
                {match.teams.teamB.name}
              </Text>
            </TouchableOpacity>
            {teamBScore.runs !== null && (
              <Text style={styles.score}>
                {teamBScore.runs}/{teamBScore.wickets}
              </Text>
            )}
            {teamBScore.overs && <Text style={styles.overs}>{teamBScore.overs} overs</Text>}
          </View>
        </View>
      </View>

      {/* Chase Information (if available). Every value is straight off the
          live socket payload — target/runsNeeded/ballsRemaining/RRR and the
          current run rate, none derived here. */}
      {liveMatch.data?.currentInnings?.chase && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Chase</Text>
          <View style={styles.chaseInfo}>
            {liveMatch.data.target != null && (
              <View style={styles.chaseItem}>
                <Text style={styles.chaseLabel}>Target</Text>
                <Text style={styles.chaseValue}>{liveMatch.data.target}</Text>
              </View>
            )}
            <View style={styles.chaseItem}>
              <Text style={styles.chaseLabel}>Runs Needed</Text>
              <Text style={styles.chaseValue}>{liveMatch.data.currentInnings.chase.runsNeeded}</Text>
            </View>
            {liveMatch.data.currentInnings.chase.ballsRemaining != null && (
              <View style={styles.chaseItem}>
                <Text style={styles.chaseLabel}>Balls Left</Text>
                <Text style={styles.chaseValue}>
                  {liveMatch.data.currentInnings.chase.ballsRemaining}
                </Text>
              </View>
            )}
            {liveMatch.data.currentInnings.currentRunRate != null && (
              <View style={styles.chaseItem}>
                <Text style={styles.chaseLabel}>Current RR</Text>
                <Text style={styles.chaseValue}>{liveMatch.data.currentInnings.currentRunRate.toFixed(2)}</Text>
              </View>
            )}
            {liveMatch.data.currentInnings.chase.requiredRunRate != null && (
              <View style={styles.chaseItem}>
                <Text style={styles.chaseLabel}>Required RR</Text>
                <Text style={styles.chaseValue}>
                  {liveMatch.data.currentInnings.chase.requiredRunRate.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Current Players (Live Only) */}
      {liveMatch.data?.currentInnings && (
        <CurrentPlayers
          striker={liveMatch.data.currentInnings.striker}
          nonStriker={liveMatch.data.currentInnings.nonStriker}
          bowler={liveMatch.data.currentInnings.bowler}
        />
      )}

      {/* Recent Deliveries (Live Only) */}
      {liveMatch.data?.currentInnings && (
        <RecentDeliveries
          deliveries={liveMatch.data.currentInnings.recentDeliveries}
        />
      )}

      {/* Result/Toss Info */}
      {(liveMatch.data?.result || match.result) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Result</Text>
          <Text style={styles.resultText}>
            {liveMatch.data?.result?.text || match.result?.text}
          </Text>
        </View>
      )}

      {match.toss && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Toss</Text>
          <Text style={styles.infoText}>{match.toss.text}</Text>
        </View>
      )}

      {/* Innings Details — lightweight scorelines when the full scorecard
          isn't available yet (e.g. an upcoming match); otherwise the full
          per-innings scorecard below replaces this. */}
      {match.innings.length > 0 && !match.innings.some((inn) => Array.isArray(inn.batting)) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Innings</Text>
          {match.innings.map((innings, idx) => (
            <View key={innings.inningsId} style={styles.inningsDetail}>
              <Text style={styles.inningsLabel}>Innings {idx + 1}</Text>
              <Text style={styles.inningsStats}>
                {innings.score.runs}/{innings.score.wickets} in {innings.score.oversLabel} overs
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Full scorecard — batting/bowling/fall-of-wickets/playing XI/match
          info, all from the GET /matches/:id/summary payload already
          fetched by useMatchDetail. Only shown once there's real content
          (an innings has begun, or a playing XI has been named). */}
      {(match.innings.some((inn) => Array.isArray(inn.batting)) ||
        match.playingXi.teamA.length > 0 ||
        match.playingXi.teamB.length > 0) && (
        <View style={styles.scorecardWrap}>
          <MatchScorecard summary={match} />
        </View>
      )}

      {match.match.status === 'finalized' && (
        <View style={styles.aiWrap}>
          <AIInsightSection
            title="AI Match Insight"
            kind="match"
            result={aiInsight.data}
            loading={aiInsight.isPending}
            error={aiInsight.isError}
            onOpenPlayer={(pid) => router.push(`/(tabs)/players/${pid}` as any)}
          />
        </View>
      )}

      {/* Live Commentary */}
      <LiveCommentary
        entries={commentary.entries}
        loading={commentary.loading}
        error={commentary.error}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scorecardWrap: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  aiWrap: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  dateText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  venueText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  teamContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  teamNameLink: {
    color: Colors.primary,
  },
  score: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  overs: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  vs: {
    fontSize: Typography.fontSize.base,
    color: Colors.textTertiary,
    marginHorizontal: Spacing.md,
    fontWeight: Typography.fontWeight.semibold,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  resultText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 20,
  },
  infoText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  inningsDetail: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  inningsLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  inningsStats: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  commentaryText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    lineHeight: 20,
  },
  chaseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
  },
  chaseItem: {
    alignItems: 'center',
  },
  chaseLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    fontWeight: Typography.fontWeight.semibold,
  },
  chaseValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
})
