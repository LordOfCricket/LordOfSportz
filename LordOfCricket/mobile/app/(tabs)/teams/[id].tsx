import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useTeamDetail } from '../../../src/hooks/useTeams'
import { TeamSquadPlayer, TeamRecentFormEntry } from '../../../src/services/teamApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { MatchCard } from '../../../src/components/MatchCard'
import { FollowButton } from '../../../src/components/FollowButton'
import { AIInsightSection } from '../../../src/components/AIInsightSection'
import { useTeamInsight } from '../../../src/hooks/useAIInsight'
import { shareEntity } from '../../../src/lib/shareEntity'
import { formatRole } from '../../../src/utils/playerFormatting'

const FORM_COLOR: Record<TeamRecentFormEntry['result'], string> = {
  W: Colors.success,
  L: Colors.error,
  T: Colors.warning,
  NR: Colors.gray[400],
}
const FORM_TITLE: Record<TeamRecentFormEntry['result'], string> = {
  W: 'Win',
  L: 'Loss',
  T: 'Tie',
  NR: 'No Result',
}

export default function TeamDetailsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const teamId = parseInt(id || '0', 10)
  const [refreshing, setRefreshing] = useState(false)

  // GET /teams/:id/profile's own `squad` field is the exact same public-safe
  // shape publicTeamService.mapPublicSquadPlayer backs — reusing useTeamDetail
  // here means no redundant request and it works without auth too.
  const { data: team, isLoading: teamLoading, isError: teamError, refetch: refetchTeam } = useTeamDetail(teamId)
  const aiInsight = useTeamInsight(teamId > 0 ? teamId : null)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetchTeam()
    setRefreshing(false)
  }

  const openPlayer = (publicPlayerId: string) => router.push(`/(tabs)/players/${publicPlayerId}` as any)
  const openMatch = (matchId: number) => router.push(`/(tabs)/matches/${matchId}` as any)

  if (!id) {
    return <ErrorScreen title="Error" message="Team ID is required" onRetry={() => router.back()} retryLabel="Go Back" />
  }
  if (teamLoading) {
    return <LoadingScreen />
  }
  if (teamError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load team details. Please try again."
        onRetry={() => refetchTeam()}
      />
    )
  }
  if (!team) {
    return (
      <ErrorScreen title="Not Found" message="This team could not be found." onRetry={() => router.back()} retryLabel="Go Back" />
    )
  }

  const players = team.squad || []
  const record = team.record
  const { topRunScorer, topWicketTaker } = team.topPerformers || { topRunScorer: null, topWicketTaker: null }
  const upcoming = team.upcomingFixtures || []
  const recent = team.recentMatches || []

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() =>
              shareEntity({
                title: team.team.name,
                message: record && record.matches > 0
                  ? `${team.team.name} — ${record.wins}W / ${record.losses}L on Lord Of Cricket`
                  : `${team.team.name} on Lord Of Cricket`,
                path: `/teams/${team.team.id}`,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Share ${team.team.name}`}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="share-variant" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <FollowButton type="team" teamId={team.team.id} />
        </View>
      </View>

      {/* Team Header */}
      <View style={styles.teamHeader}>
        {team.team.logoUrl ? (
          <Image source={{ uri: team.team.logoUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoPlaceholderText}>{team.team.shortName?.slice(0, 2) || 'TM'}</Text>
          </View>
        )}
        <View style={styles.teamInfo}>
          <Text style={styles.teamName} numberOfLines={2}>
            {team.team.name}
          </Text>
          <Text style={styles.shortName} numberOfLines={1}>
            {team.team.shortName} · {players.length} {players.length === 1 ? 'player' : 'players'}
          </Text>
        </View>
      </View>

      {/* Official Record */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Official Record</Text>
        {record && record.matches > 0 ? (
          <View style={styles.recordGrid}>
            <RecordTile label="Matches" value={String(record.matches)} />
            <RecordTile label="Wins" value={String(record.wins)} />
            <RecordTile label="Losses" value={String(record.losses)} />
            <RecordTile
              label="Win %"
              value={record.winPercentage != null ? `${record.winPercentage.toFixed(1)}%` : '—'}
            />
            {record.ties > 0 && <RecordTile label="Ties" value={String(record.ties)} />}
            {record.noResults > 0 && <RecordTile label="No Result" value={String(record.noResults)} />}
          </View>
        ) : (
          <Text style={styles.emptyLine}>No official results yet.</Text>
        )}
      </View>

      {/* Recent Form — real backend result type (W/L/T/NR), each tappable to
          the match. */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Form</Text>
        {team.recentForm && team.recentForm.length > 0 ? (
          <View style={styles.formContainer}>
            {team.recentForm.map((entry) => (
              <TouchableOpacity
                key={entry.matchId}
                onPress={() => openMatch(entry.matchId)}
                accessibilityRole="button"
                accessibilityLabel={`${FORM_TITLE[entry.result]} — open match`}
                style={[styles.formResult, { backgroundColor: FORM_COLOR[entry.result] }]}
              >
                <Text style={styles.formResultText}>{entry.result}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyLine}>No official results yet.</Text>
        )}
      </View>

      {record && record.matches > 0 && (
        <View style={styles.aiWrap}>
          <AIInsightSection
            title="AI Team Insight"
            kind="person"
            result={aiInsight.data}
            loading={aiInsight.isPending}
            error={aiInsight.isError}
          />
        </View>
      )}

      {/* Top Performers — all-time, while representing THIS team. Tappable to
          the public player profile. */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top Performers</Text>
        <View style={styles.performerRow}>
          <PerformerCard
            title="Top Run Scorer"
            name={topRunScorer?.player.name ?? null}
            statLine={topRunScorer ? `${topRunScorer.runs} Runs` : null}
            onPress={topRunScorer ? () => openPlayer(topRunScorer.player.publicPlayerId) : undefined}
          />
          <PerformerCard
            title="Top Wicket Taker"
            name={topWicketTaker?.player.name ?? null}
            statLine={topWicketTaker ? `${topWicketTaker.wickets} Wickets` : null}
            onPress={topWicketTaker ? () => openPlayer(topWicketTaker.player.publicPlayerId) : undefined}
          />
        </View>
      </View>

      {/* Squad */}
      {players.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Squad ({players.length})</Text>
          <View style={styles.squadList}>
            {players.map((player: TeamSquadPlayer, idx: number) => (
              <TouchableOpacity
                key={player.publicPlayerId}
                style={[styles.playerRow, idx > 0 && styles.playerRowDivider]}
                onPress={() => openPlayer(player.publicPlayerId)}
                accessibilityRole="button"
                accessibilityLabel={`View ${player.name}'s player profile`}
              >
                {player.photoUrl ? (
                  <Image source={{ uri: player.photoUrl }} style={styles.playerPhoto} />
                ) : (
                  <View style={styles.playerPhotoPlaceholder}>
                    <Text style={styles.playerPhotoPlaceholderText}>
                      {player.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                )}
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {player.name}
                  </Text>
                  {player.role && (
                    <Text style={styles.playerRole} numberOfLines={1}>
                      {formatRole(player.role) || player.role}
                    </Text>
                  )}
                </View>
                {player.jerseyNumber != null && <Text style={styles.jerseyNumber}>#{player.jerseyNumber}</Text>}
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Live Match */}
      {team.liveMatch && (
        <View style={styles.matchSection}>
          <Text style={styles.matchSectionTitle}>Live Match</Text>
          <MatchCard match={team.liveMatch} />
        </View>
      )}

      {/* Upcoming Fixtures */}
      <View style={styles.matchSection}>
        <Text style={styles.matchSectionTitle}>Upcoming Fixtures</Text>
        {upcoming.length > 0 ? (
          upcoming.map((m) => <MatchCard key={m.id} match={m} />)
        ) : (
          <Text style={styles.emptyLine}>No upcoming fixtures scheduled.</Text>
        )}
      </View>

      {/* Recent Matches */}
      <View style={styles.matchSection}>
        <Text style={styles.matchSectionTitle}>Recent Matches</Text>
        {recent.length > 0 ? (
          recent.map((m) => <MatchCard key={m.id} match={m} />)
        ) : (
          <Text style={styles.emptyLine}>No completed matches yet.</Text>
        )}
      </View>

      <View style={{ height: Spacing['3xl'] }} />
    </ScrollView>
  )
}

function RecordTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.recordTile}>
      <Text style={styles.recordValue}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
    </View>
  )
}

function PerformerCard({
  title,
  name,
  statLine,
  onPress,
}: {
  title: string
  name: string | null
  statLine: string | null
  onPress?: () => void
}) {
  const content = (
    <>
      <Text style={styles.performerTitle}>{title}</Text>
      {name ? (
        <>
          <Text style={styles.performerName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.performerStat}>{statLine}</Text>
        </>
      ) : (
        <Text style={styles.performerEmpty}>No official stats yet.</Text>
      )}
    </>
  )
  return onPress ? (
    <TouchableOpacity style={styles.performerCard} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${name}`}>
      {content}
    </TouchableOpacity>
  ) : (
    <View style={styles.performerCard}>{content}</View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: Spacing.md,
    backgroundColor: Colors.gray[100],
  },
  logoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  logoPlaceholderText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  shortName: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  aiWrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  emptyLine: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
  },
  recordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  recordTile: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
  },
  recordValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  recordLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: Spacing.xs,
  },
  formContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  formResult: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formResultText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  performerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  performerCard: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  performerTitle: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  performerName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  performerStat: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    marginTop: 2,
  },
  performerEmpty: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  squadList: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
  },
  playerRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  playerPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
  },
  playerPhotoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerPhotoPlaceholderText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.sm,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  playerRole: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  jerseyNumber: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    flexShrink: 0,
  },
  matchSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  matchSectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
})
