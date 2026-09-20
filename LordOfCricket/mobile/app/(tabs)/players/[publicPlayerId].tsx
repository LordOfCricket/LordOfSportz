import React from "react"
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { usePublicPlayerProfile, usePublicPlayerStats } from "../../../src/hooks/usePlayer"
import { useHallOfFame } from "../../../src/hooks/useHallOfFame"
import { useNextGeneration } from "../../../src/hooks/useNextGeneration"
import { Colors, Spacing, Typography, BorderRadius, Shadows } from "../../../src/constants/colors"
import { LoadingScreen } from "../../../src/components/LoadingScreen"
import { ErrorScreen } from "../../../src/components/ErrorScreen"
import { formatRole, formatBattingStyle, formatBowlingStyle, formatStatValue } from "../../../src/utils/playerFormatting"
import { filterPerformancesForRange, findBestBattingPerformance, findBestBowlingPerformance } from "../../../src/utils/statsRange"
import { PlayerAnalyticsSection } from "../../../src/components/analytics/PlayerAnalyticsSection"
import { PlayerAchievements } from "../../../src/components/player/PlayerAchievements"
import { FollowButton } from "../../../src/components/FollowButton"
import { AIInsightSection } from "../../../src/components/AIInsightSection"
import { usePlayerInsight } from "../../../src/hooks/useAIInsight"
import { shareEntity } from "../../../src/lib/shareEntity"

// Public player profile — GET /players/:publicPlayerId + GET /players/:publicPlayerId/stats
// (both already existed and were already public/unauthenticated; this
// screen is the first mobile consumer). Deliberately reads ONLY these two
// endpoints' real response shapes (PublicPlayerProfile / PlayerStats) —
// never /me/player, which is a different, private-field-carrying endpoint.
// See PublicPlayerProfile's own comment in types/index.ts for exactly which
// fields the backend excludes from this response (email/phone/user_id/
// date_of_birth/address_line/state/postal_code/is_wicket_keeper).
export default function PublicPlayerProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { publicPlayerId } = useLocalSearchParams<{ publicPlayerId: string }>()

  const profileQuery = usePublicPlayerProfile(publicPlayerId ?? null)
  // limit=50 mirrors the authenticated Profile's own choice (GET /me/stats's
  // hard max) — same reasoning: lets "last 10 matches" performance insights
  // be derived client-side with a single request, no extra API call.
  const statsQuery = usePublicPlayerStats(publicPlayerId ?? null, 50, 0)
  const aiInsight = usePlayerInsight(publicPlayerId ?? null)
  // Same existing hooks the authenticated Profile's Recognition section
  // already uses — just filtered by THIS route's publicPlayerId instead of
  // the logged-in user's own.
  const hallOfFameQuery = useHallOfFame()
  const nextGenerationQuery = useNextGeneration()

  if (!publicPlayerId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorScreen title="Invalid Player" message="Player ID is missing." onRetry={() => router.back()} retryLabel="Back" />
      </View>
    )
  }

  if (profileQuery.isPending) {
    return <LoadingScreen />
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Player Profile</Text>
          <View style={{ width: 22 }} />
        </View>
        <ErrorScreen
          title="Player Not Found"
          message="Could not load this player's profile."
          onRetry={() => profileQuery.refetch()}
          retryLabel="Retry"
        />
      </View>
    )
  }

  const profile = profileQuery.data
  const career = statsQuery.data?.career
  const hasEverPlayed = !!career && career.matches > 0
  const personalBests = statsQuery.data?.personalBests
  const recentForm = statsQuery.data?.recentForm ?? []
  const formWins = recentForm.filter((p) => p.won === true).length
  const formLosses = recentForm.filter((p) => p.won === false).length
  const formOther = recentForm.length - formWins - formLosses
  const formSummaryText =
    recentForm.length > 0 ? `${formWins}W · ${formLosses}L${formOther > 0 ? ` · ${formOther} Other` : ""}` : null

  const teamHistory = statsQuery.data?.teamHistory ?? []
  const pastTeams = teamHistory.filter((t) => t.teamId !== profile.team?.id)

  const hallOfFameEntries = (hallOfFameQuery.data || []).filter((c) => c.player?.publicPlayerId === profile.publicPlayerId)
  const nextGenerationEntry = (nextGenerationQuery.data || []).find((p) => p.publicPlayerId === profile.publicPlayerId)
  interface RecognitionItem {
    key: string
    icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]
    label: string
    headline: string
  }
  const recognitionItems: RecognitionItem[] = [
    ...hallOfFameEntries.map((entry) => ({
      key: `hof-${entry.key}`,
      icon: "trophy-outline" as const,
      label: entry.label,
      headline: entry.player!.headline,
    })),
    ...(nextGenerationEntry
      ? [{ key: "next-generation", icon: "star-outline" as const, label: "Next Generation", headline: `${nextGenerationEntry.runs} Runs` }]
      : []),
  ]
  const hasRecognition = recognitionItems.length > 0

  const last10Performances = statsQuery.data
    ? filterPerformancesForRange(statsQuery.data.matchHistory.items, "last-10")
    : []
  const bestRecentBatting = findBestBattingPerformance(last10Performances)
  const bestRecentBowling = findBestBowlingPerformance(last10Performances)
  const hasInsights = !!bestRecentBatting || !!bestRecentBowling

  const hasCricketIdentity = !!(profile.role || profile.battingStyle || profile.bowlingStyle || profile.jerseyNumber != null)

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Player Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Identity header — clearly labeled PUBLIC PROFILE so it never
            reads as if it were the viewer's own account. */}
        <View style={styles.identitySection}>
          <View style={styles.publicBadge}>
            <MaterialCommunityIcons name="earth" size={12} color={Colors.textSecondary} />
            <Text style={styles.publicBadgeText}>Public Profile</Text>
          </View>

          {profile.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={styles.photo} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {profile.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
              </Text>
            </View>
          )}

          <Text style={styles.playerName} numberOfLines={2}>
            {profile.name}
          </Text>
          <Text style={styles.publicId}>{profile.publicPlayerId}</Text>

          {profile.role && (
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{formatRole(profile.role)}</Text>
            </View>
          )}

          <View style={styles.followRow}>
            <FollowButton type="player" publicPlayerId={profile.publicPlayerId} />
            <TouchableOpacity
              onPress={() =>
                shareEntity({
                  title: profile.name,
                  message: career && career.matches > 0
                    ? `${profile.name} — ${career.batting.runs} career runs on Lord Of Cricket`
                    : `${profile.name} on Lord Of Cricket`,
                  path: `/players/${profile.publicPlayerId}`,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Share ${profile.name}`}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="share-variant" size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/players/head-to-head?p1=${profile.publicPlayerId}&n1=${encodeURIComponent(profile.name)}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`Head-to-head with ${profile.name}`}
            >
              <Text style={styles.h2hLink}>Head-to-Head →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cricket Identity */}
        {hasCricketIdentity && (
          <View style={styles.section}>
            <SectionTitle icon="cricket" title="Cricket Identity" />
            <View style={styles.infoList}>
              {profile.role && <InfoRow label="Role" value={formatRole(profile.role) || ""} />}
              {profile.battingStyle && <InfoRow label="Batting" value={formatBattingStyle(profile.battingStyle) || ""} />}
              {profile.bowlingStyle && <InfoRow label="Bowling" value={formatBowlingStyle(profile.bowlingStyle) || ""} />}
              {profile.jerseyNumber != null && <InfoRow label="Jersey" value={`#${profile.jerseyNumber}`} isLast />}
            </View>
          </View>
        )}

        {/* Career Statistics — Overall only. The authenticated Profile's
            range selector (Last Match/1 Week/Last 10/1 Month/1 Year) is
            intentionally not duplicated here for a first public-profile
            version; Overall is the one range every viewer immediately
            understands without extra UI. */}
        {(hasEverPlayed || statsQuery.error) && (
          <View style={styles.section}>
            <SectionTitle icon="chart-bar" title="Career Statistics" />
            {statsQuery.error ? (
              <ErrorScreen
                title="Statistics Unavailable"
                message="Could not load this player's statistics."
                onRetry={() => statsQuery.refetch()}
                retryLabel="Retry"
              />
            ) : (
              career && (
                <>
                  <View style={styles.statSection}>
                    <Text style={styles.statSectionTitle}>Batting</Text>
                    <View style={styles.statGrid}>
                      <StatTile label="Matches" value={formatStatValue(career.batting.innings)} />
                      <StatTile label="Runs" value={formatStatValue(career.batting.runs)} />
                      <StatTile label="Average" value={formatStatValue(career.batting.average)} />
                      <StatTile label="Strike Rate" value={formatStatValue(career.batting.strikeRate)} />
                      <StatTile label="Fours" value={formatStatValue(career.batting.fours)} />
                      <StatTile label="Sixes" value={formatStatValue(career.batting.sixes)} />
                    </View>
                  </View>
                  <View style={styles.statSection}>
                    <Text style={styles.statSectionTitle}>Bowling</Text>
                    <View style={styles.statGrid}>
                      <StatTile label="Matches" value={formatStatValue(career.bowling.innings)} />
                      <StatTile label="Wickets" value={formatStatValue(career.bowling.wickets)} />
                      <StatTile label="Runs" value={formatStatValue(career.bowling.runsConceded)} />
                      <StatTile label="Average" value={formatStatValue(career.bowling.average)} />
                      <StatTile label="Economy" value={formatStatValue(career.bowling.economy)} />
                      <StatTile label="Maidens" value={formatStatValue(career.bowling.maidens)} />
                    </View>
                  </View>
                </>
              )
            )}
          </View>
        )}

        {/* Personal Bests */}
        {hasEverPlayed && (
          <View style={styles.section}>
            <SectionTitle icon="medal-outline" title="Personal Bests" />
            <View style={styles.bestsRow}>
              <View style={styles.bestTile}>
                <Text style={styles.bestLabel}>Highest Score</Text>
                {personalBests?.highestScore ? (
                  <Text style={styles.bestValue}>
                    {personalBests.highestScore.runs}
                    {personalBests.highestScore.notOut ? "*" : ""}
                  </Text>
                ) : (
                  <Text style={styles.bestEmptyValue}>No highest score recorded</Text>
                )}
              </View>
              <View style={styles.bestTile}>
                <Text style={styles.bestLabel}>Best Bowling</Text>
                {personalBests?.bestBowling ? (
                  <Text style={styles.bestValue}>
                    {personalBests.bestBowling.wickets}/{personalBests.bestBowling.runs}
                  </Text>
                ) : (
                  <Text style={styles.bestEmptyValue}>No bowling record</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Achievements — career milestones from the same stats payload
            (statsQuery.data.achievements), computed server-side. */}
        {hasEverPlayed && <PlayerAchievements achievements={statsQuery.data?.achievements} />}

        {/* Career Timeline lives on its own screen (it can get long). */}
        {hasEverPlayed && (statsQuery.data?.careerTimeline?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.timelineLink}
              onPress={() => router.push(`/(tabs)/players/timeline?publicPlayerId=${profile.publicPlayerId}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View ${profile.name}'s career timeline`}
            >
              <MaterialCommunityIcons name="timeline-clock-outline" size={20} color={Colors.primary} />
              <Text style={styles.timelineLinkText}>Career Timeline</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Form — each result is tappable to the public match
            scorecard (/(tabs)/matches/[id]). */}
        {statsQuery.data && recentForm.length > 0 && (
          <View style={styles.section}>
            <SectionTitle icon="trending-up" title="Recent Form" />
            <View style={styles.formDotsRow}>
              {recentForm.map((perf) => (
                <TouchableOpacity
                  key={perf.matchId}
                  onPress={() => router.push(`/(tabs)/matches/${perf.matchId}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`${perf.won === true ? "Won" : perf.won === false ? "Lost" : "Result"} vs ${perf.opponent} — open match`}
                  style={[
                    styles.formDot,
                    perf.won === true ? styles.formResultWon : perf.won === false ? styles.formResultLost : styles.formResultNeutral,
                  ]}
                >
                  <Text style={styles.formDotText}>{perf.won === true ? "W" : perf.won === false ? "L" : "–"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {formSummaryText && <Text style={styles.formSummaryText}>{formSummaryText}</Text>}
          </View>
        )}

        {/* Full match history — its own screen (paginated). Parity with the
            website Player Profile "Matches" tab. */}
        {hasEverPlayed && (statsQuery.data?.matchHistory?.total ?? 0) > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.timelineLink}
              onPress={() => router.push(`/(tabs)/players/match-history?publicPlayerId=${profile.publicPlayerId}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View all of ${profile.name}'s matches`}
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={20} color={Colors.primary} />
              <Text style={styles.timelineLinkText}>
                All Matches ({statsQuery.data?.matchHistory?.total ?? 0})
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Performance Insights */}
        {hasEverPlayed && hasInsights && (
          <View style={styles.section}>
            <SectionTitle icon="lightbulb-on-outline" title="Performance Insights" />
            <View style={styles.bestsRow}>
              {bestRecentBatting && (
                <View style={styles.bestTile}>
                  <Text style={styles.bestLabel}>Best Recent Batting</Text>
                  <Text style={styles.bestValue}>
                    {bestRecentBatting.runs}
                    {bestRecentBatting.notOut ? "*" : ""}
                  </Text>
                  <Text style={styles.insightSubtext} numberOfLines={1}>
                    vs {bestRecentBatting.opponent}
                  </Text>
                </View>
              )}
              {bestRecentBowling && (
                <View style={styles.bestTile}>
                  <Text style={styles.bestLabel}>Best Recent Bowling</Text>
                  <Text style={styles.bestValue}>
                    {bestRecentBowling.wickets}/{bestRecentBowling.runs}
                  </Text>
                  <Text style={styles.insightSubtext} numberOfLines={1}>
                    vs {bestRecentBowling.opponent}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Advanced Analytics — GET /players/:id/analytics. The website
            shows this as a tab on the public profile; on mobile it is a
            section in the same scroll. Only rendered once the player has a
            finalized-match history (the section otherwise just repeats the
            "no statistics yet" message shown below). */}
        {hasEverPlayed && <PlayerAnalyticsSection publicPlayerId={profile.publicPlayerId} />}

        {hasEverPlayed && (
          <View style={styles.section}>
            <AIInsightSection
              title="AI Performance Insight"
              kind="person"
              result={aiInsight.data}
              loading={aiInsight.isPending}
              error={aiInsight.isError}
            />
          </View>
        )}

        {/* Current Team / Team History — reuses the existing team public
            page route (already used elsewhere in the app). */}
        {(profile.team || pastTeams.length > 0) && (
          <View style={styles.section}>
            <SectionTitle icon="account-group-outline" title="Teams" />
            {profile.team && (
              <>
                {pastTeams.length > 0 && <Text style={styles.teamGroupLabel}>Current Team</Text>}
                <View style={styles.teamsList}>
                  <TeamRow
                    id={profile.team.id}
                    name={profile.team.name}
                    shortName={profile.team.shortName}
                    logoUrl={profile.team.logoUrl}
                    onPress={() => router.push(`/(tabs)/teams/${profile.team!.id}` as any)}
                  />
                </View>
              </>
            )}
            {pastTeams.length > 0 && (
              <>
                <Text style={[styles.teamGroupLabel, styles.teamHistorySpacing]}>Team History</Text>
                <View style={styles.teamsList}>
                  {pastTeams.map((t, idx) => (
                    <TeamRow
                      key={t.teamId}
                      id={t.teamId}
                      name={t.name}
                      shortName={t.shortName}
                      logoUrl={t.logoUrl}
                      record={t.record}
                      isDivided={idx > 0}
                      onPress={() => router.push(`/(tabs)/teams/${t.teamId}` as any)}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Recognition */}
        {hasRecognition && (
          <View style={styles.section}>
            <SectionTitle icon="trophy-outline" title="Recognition" />
            <View style={styles.recognitionList}>
              {recognitionItems.map((item, idx) => (
                <View key={item.key} style={[styles.recognitionRow, idx > 0 && styles.recognitionRowDivider]}>
                  <MaterialCommunityIcons name={item.icon} size={20} color={Colors.secondary} />
                  <View style={styles.recognitionInfo}>
                    <Text style={styles.recognitionLabel}>{item.label}</Text>
                    <Text style={styles.recognitionHeadline}>{item.headline}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {statsQuery.isPending && (
          <View style={styles.section}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}

        {statsQuery.data && !hasEverPlayed && !statsQuery.error && (
          <View style={styles.section}>
            <View style={styles.emptyStateSmall}>
              <Text style={styles.emptySubtext}>No statistics yet — this player hasn{"'"}t played a finalized match.</Text>
            </View>
          </View>
        )}

        {/* About — real, public-safe fields the DTO already carries
            (PublicPlayerProfile.city / .bio) but this screen never
            displayed. Positioned last, same as the authenticated Profile's
            own Personal Information section — secondary/quiet relative to
            cricket performance. Reuses InfoRow exactly as the authenticated
            Profile does for these same two fields, for consistency. */}
        {(profile.city || profile.bio) && (
          <View style={styles.section}>
            <SectionTitle icon="card-account-details-outline" title="About" />
            <View style={styles.infoList}>
              {profile.city && <InfoRow label="City" value={profile.city} isLast={!profile.bio} />}
              {profile.bio && <InfoRow label="Bio" value={profile.bio} isLast />}
            </View>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  )
}

function SectionTitle({ icon, title }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <MaterialCommunityIcons name={icon} size={18} color={Colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  )
}

function InfoRow({ label, value, isLast = false }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {!isLast && <View style={styles.divider} />}
    </View>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileLabel}>{label}</Text>
      <Text style={styles.statTileValue}>{value}</Text>
    </View>
  )
}

function TeamRow({
  id,
  name,
  shortName,
  logoUrl,
  record,
  isDivided = false,
  onPress,
}: {
  id: number
  name: string
  shortName: string
  logoUrl: string | null
  record?: { wins: number; losses: number; ties: number }
  isDivided?: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.teamRow, isDivided && styles.teamRowDivider]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${name} team profile`}
    >
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={styles.teamLogo} />
      ) : (
        <View style={styles.teamLogoPlaceholder}>
          <Text style={styles.teamLogoText}>{shortName?.slice(0, 2) || "TM"}</Text>
        </View>
      )}
      <View style={styles.teamInfo}>
        <Text style={styles.teamName} numberOfLines={2}>
          {name}
        </Text>
        {!!shortName && (
          <Text style={styles.teamShortName} numberOfLines={1}>
            {shortName}
          </Text>
        )}
      </View>
      {record && (
        <Text style={styles.teamRecord} numberOfLines={1}>
          {record.wins}W · {record.losses}L{record.ties > 0 ? ` · ${record.ties}T` : ""}
        </Text>
      )}
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  identitySection: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  publicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundAlt,
    marginBottom: Spacing.md,
  },
  publicBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.gray[100],
    boxShadow: Shadows.sm,
    marginBottom: Spacing.md,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    boxShadow: Shadows.sm,
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  playerName: {
    fontSize: Typography.fontSize["2xl"],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    letterSpacing: -0.3,
    marginBottom: 2,
    textAlign: "center",
  },
  publicId: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: Spacing.md,
  },
  followRow: {
    marginTop: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  h2hLink: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  roleChipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  timelineLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  timelineLinkText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  infoList: {},
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  infoLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    flex: 1,
  },
  infoValue: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.semibold,
    flex: 1,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  statSection: {
    marginBottom: Spacing.lg,
  },
  statSectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  statTileLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statTileValue: {
    fontSize: Typography.fontSize.xl,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
  bestsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  bestTile: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
  },
  bestLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
  },
  bestValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  bestEmptyValue: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    fontStyle: "italic",
    textAlign: "center",
  },
  insightSubtext: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  formDotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  formDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  formDotText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.sm,
  },
  formResultWon: {
    backgroundColor: Colors.success,
  },
  formResultLost: {
    backgroundColor: Colors.error,
  },
  formResultNeutral: {
    backgroundColor: Colors.gray[400],
  },
  formSummaryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  teamGroupLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
  },
  teamHistorySpacing: {
    marginTop: Spacing.md,
  },
  teamsList: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    minHeight: 56,
  },
  teamRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  teamLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  teamLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  teamLogoText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.sm,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  teamShortName: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    marginTop: 2,
  },
  teamRecord: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    flexShrink: 0,
  },
  recognitionList: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  recognitionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    minHeight: 56,
  },
  recognitionRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  recognitionInfo: {
    flex: 1,
  },
  recognitionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  recognitionHeadline: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: 2,
  },
  emptyStateSmall: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySubtext: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  bottomSpacer: {
    height: Spacing.lg,
  },
})
