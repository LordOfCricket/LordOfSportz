import React, { useState } from "react"
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons"
import { useMyPlayer, useMyPlayerStats } from "../../../src/hooks/usePlayer"
import { useAuth } from "../../../src/hooks/useAuth"
import { usePhotoUpload } from "../../../src/hooks/usePhotoUpload"
import { useTeamDetail } from "../../../src/hooks/useTeams"
import { TeamProfileResponse } from "../../../src/services/teamApi"
import { useHallOfFame } from "../../../src/hooks/useHallOfFame"
import { useNextGeneration } from "../../../src/hooks/useNextGeneration"
import { useNotifications } from "../../../src/hooks/useNotifications"
import { Colors, Spacing, Typography, BorderRadius, Shadows } from "../../../src/constants/colors"
import { LoadingScreen } from "../../../src/components/LoadingScreen"
import { ErrorScreen } from "../../../src/components/ErrorScreen"
import { EmptyState } from "../../../src/components/EmptyState"
import { PhotoPreviewModal } from "../../../src/components/PhotoPreviewModal"
import { PlayerAchievements } from "../../../src/components/player/PlayerAchievements"
import {
  formatRole,
  formatBattingStyle,
  formatBowlingStyle,
  formatDate,
  calculateAge,
  formatStatValue,
} from "../../../src/utils/playerFormatting"
import { getErrorMessage } from "../../../src/utils/errors"
import { PlayerMatchPerformance, BattingStats, BowlingStats } from "../../../src/types"
import {
  StatsRange,
  STATS_RANGE_OPTIONS,
  statsRangeLabel,
  filterPerformancesForRange,
  aggregateBattingFromPerformances,
  aggregateBowlingFromPerformances,
  findBestBattingPerformance,
  findBestBowlingPerformance,
} from "../../../src/utils/statsRange"

// Fail closed: a release binary always has __DEV__ === false, so a mis-set
// EXPO_PUBLIC_APP_ENV can never surface dev-only diagnostics in production.
const isDevelopment = __DEV__ && process.env.EXPO_PUBLIC_APP_ENV === "development"

interface StatItem {
  label: string
  value: string
}

interface SectionData {
  title: string
  data: StatItem[]
}

// One team the player currently belongs to. Modeled as a list because the
// LOC domain is a player -> team MEMBERSHIPS relationship, not a single
// fixed team — but the current backend only exposes ONE current membership
// per player (players.team_id is a single nullable FK; there is no
// player-team junction/membership table and no "all teams for this player"
// endpoint — confirmed by inspecting schema.sql and teamRoster.service.js,
// whose own comment states team_id assignment "moves them, one team at a
// time, by design (never a separate join table)"). This type/array shape
// renders correctly for 0, 1, or N teams without fabricating data — it's
// simply fed at most one real entry today until the backend adds real
// multi-team membership support.
interface MyTeamMembership {
  team: {
    id: number
    name: string
    shortName: string
    logoUrl: string | null
  }
}

export default function ProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  const isPlayer = user?.role === "player"
  const playerQuery = useMyPlayer(isPlayer)
  // limit=50 is GET /me/stats's own hard maximum (MAX_MATCH_HISTORY_LIMIT in
  // statistics.service.js) — fetched once here so the Career Statistics
  // range dropdown below can derive Last Match / Last 10 / 1 Week / 1 Month /
  // 1 Year entirely client-side from real per-match performances with no
  // extra network request per filter change. Same queryKey/cache entry the
  // match detail screen already uses (useMyPlayerStats(50, 0, ...) in
  // profile/matches/[matchId].tsx), so this doesn't add a second cached copy
  // for that screen.
  const statsQuery = useMyPlayerStats(50, 0, isPlayer)
  const [statsRange, setStatsRange] = useState<StatsRange>("overall")

  const player = playerQuery.data
  // players.team_id is the ONLY real team relationship the backend exposes
  // (see MyTeamMembership's comment above) — reused exactly as before via
  // the existing useTeamDetail()/GET /teams/:id/profile call.
  const teamId = player?.team_id ?? null
  const teamQuery = useTeamDetail(teamId)
  // getTeamProfile() is now properly typed as TeamProfileResponse at the
  // service layer (teams/[id].tsx, the other consumer that used to depend
  // on it being untyped, was fixed at the same time), so this is just the
  // query's own data — no cast needed.
  const teamProfile: TeamProfileResponse | undefined = teamQuery.data

  const myTeams: MyTeamMembership[] = teamProfile ? [{ team: teamProfile.team }] : []

  const hallOfFameQuery = useHallOfFame()
  const nextGenerationQuery = useNextGeneration()
  // Unread notification count for the header bell (one small request; the
  // Notifications screen itself reuses the same cached query keys).
  const notificationsQuery = useNotifications(1, 0, isPlayer)
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0

  const photoUpload = usePhotoUpload()

  const handlePhotoTap = () => {
    Alert.alert(
      "Change Profile Photo",
      undefined,
      [
        { text: "Take Photo", onPress: photoUpload.launchCamera },
        { text: "Choose from Gallery", onPress: photoUpload.launchGallery },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    )
  }

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([playerQuery.refetch(), statsQuery.refetch()])
    } finally {
      setRefreshing(false)
    }
  }, [playerQuery, statsQuery])

  // Handle loading states
  if (isPlayer && playerQuery.isPending) {
    return <LoadingScreen />
  }

  // Handle error states
  if (isPlayer && playerQuery.error) {
    return (
      <ErrorScreen
        title="Failed to Load Profile"
        message={
          isDevelopment
            ? `Could not load your player profile.\n\n[DEV] ${getErrorMessage(playerQuery.error)}`
            : "Could not load your player profile. Please try again."
        }
        onRetry={() => playerQuery.refetch()}
        retryLabel="Retry"
      />
    )
  }

  // Career Statistics — range-filtered. "Overall" reuses the real backend
  // `career` aggregate untouched (GET /me/stats has no period/last-N
  // parameter — see src/utils/statsRange.ts's header comment for the full
  // audit). Every other range re-aggregates the real per-match performances
  // already fetched above (statsQuery, limit=50) using the same formulas the
  // backend itself uses. Fielding has NO per-match breakdown anywhere in the
  // API response, so it can only ever be shown for Overall — a genuine
  // backend gap, called out below rather than silently shown as 0.
  const career = statsQuery.data?.career
  const isOverallRange = statsRange === "overall"
  // Plain computation, not useMemo: this must not be a hook call, since it
  // sits after the early `return`s above (isPending/error) — a hook here
  // would violate the Rules of Hooks (conditional hook call). The input is
  // at most 50 lightweight items, so recomputing on every render is cheap.
  const rangedPerformances =
    statsQuery.data && !isOverallRange ? filterPerformancesForRange(statsQuery.data.matchHistory.items, statsRange) : null

  const rangeMatchCount = isOverallRange ? career?.matches ?? 0 : rangedPerformances?.length ?? 0
  const hasStatsForRange = !!statsQuery.data && rangeMatchCount > 0
  // True career-wide "this player has never played a match" — distinct from
  // "this specific range has no matches in it" (hasStatsForRange), which
  // needs its own inline empty state inside the section, not the generic
  // bottom "No Statistics Yet" message.
  const hasEverPlayed = !!career && career.matches > 0

  // Sections data for statistics
  const sections: SectionData[] = []

  if (hasStatsForRange) {
    const batting: BattingStats = isOverallRange ? career!.batting : aggregateBattingFromPerformances(rangedPerformances!)
    const bowling: BowlingStats = isOverallRange ? career!.bowling : aggregateBowlingFromPerformances(rangedPerformances!)

    sections.push({
      title: "Batting",
      data: [
        { label: "Matches", value: formatStatValue(batting.innings) },
        { label: "Runs", value: formatStatValue(batting.runs) },
        { label: "Average", value: formatStatValue(batting.average) },
        { label: "Strike Rate", value: formatStatValue(batting.strikeRate) },
        { label: "Fours", value: formatStatValue(batting.fours) },
        { label: "Sixes", value: formatStatValue(batting.sixes) },
      ],
    })

    sections.push({
      title: "Bowling",
      data: [
        { label: "Matches", value: formatStatValue(bowling.innings) },
        { label: "Wickets", value: formatStatValue(bowling.wickets) },
        { label: "Runs", value: formatStatValue(bowling.runsConceded) },
        { label: "Average", value: formatStatValue(bowling.average) },
        { label: "Economy", value: formatStatValue(bowling.economy) },
        { label: "Overs", value: formatStatValue(bowling.equivalentOvers) },
        { label: "Maidens", value: formatStatValue(bowling.maidens) },
      ],
    })

    // Fielding is only ever available for Overall — matchHistory items carry
    // no fielding data at all, so it cannot honestly be recomputed per range.
    if (isOverallRange && career?.fielding) {
      sections.push({
        title: "Fielding",
        data: [
          { label: "Catches", value: formatStatValue(career.fielding.catches) },
          { label: "Stumpings", value: formatStatValue(career.fielding.stumpings) },
        ],
      })
    }
  }

  const personalBests = statsQuery.data?.personalBests

  // Recent Form — already the backend's most-recent-5, newest-first
  // (statistics.service.js#getPlayerCareerStats: recentForm =
  // performances.slice(0, 5), where `performances` was itself sorted
  // newest-first). Never reversed here. `won` is boolean|null — null covers
  // BOTH a tie and a no-result (statistics.service.js#wonFor collapses both
  // to null; there's no separate result_type field on this DTO to tell them
  // apart), so the summary below counts it as a generic "Other" rather than
  // guessing which one it was.
  const recentForm = statsQuery.data?.recentForm || []
  const formWins = recentForm.filter((p) => p.won === true).length
  const formLosses = recentForm.filter((p) => p.won === false).length
  const formOther = recentForm.length - formWins - formLosses
  const formSummaryText =
    recentForm.length > 0 ? `${formWins}W · ${formLosses}L${formOther > 0 ? ` · ${formOther} Other` : ""}` : null

  // Recognition — only real if this player genuinely appears in the
  // existing Hall of Fame / Next Generation data. No fabricated fallback.
  // On either query's error/loading, `.data` is undefined and both arrays
  // below default to [] — the section just doesn't render, never a fake or
  // broken state (satisfies "don't let Recognition failure break Profile").
  //
  // A player can genuinely match MORE THAN ONE Hall of Fame category
  // (useHallOfFame's 4 categories are independent leaderboards — e.g. the
  // same player can be both "Top Performer" and "Max Wickets"), so this
  // uses .filter(), not .find(): the previous .find() silently kept only
  // the first match and dropped any others.
  const hallOfFameEntries = player
    ? (hallOfFameQuery.data || []).filter((c) => c.player?.publicPlayerId === player.public_player_id)
    : []
  // The player's own Next Generation entry (not just membership) so the row
  // below can show their real runs value instead of a generic placeholder.
  const nextGenerationEntry = player
    ? (nextGenerationQuery.data || []).find((p) => p.publicPlayerId === player.public_player_id)
    : undefined

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

  // Cricket Identity / Personal Information both conditionally render one
  // InfoRow per real field — if a player genuinely has none of a card's
  // fields set yet, the card previously rendered as an empty bordered box
  // with nothing inside it. These flags let each section fall back to the
  // same lightweight empty state already used elsewhere on this screen.
  const hasCricketIdentity = !!(
    player &&
    (player.role ||
      player.batting_style ||
      player.bowling_style ||
      (player.jersey_number !== null && player.jersey_number !== undefined) ||
      player.is_wicket_keeper)
  )
  const hasPersonalInfo = !!(
    player &&
    (player.date_of_birth || player.city || player.state || player.address_line || player.postal_code || player.bio)
  )

  // Team History — real teams this player has actually represented in
  // finalized matches (match_players.team_id, immutable per match; see
  // statistics.service.js#buildTeamHistory and TeamHistoryEntry's own
  // comment in types/index.ts). Distinct from `myTeams` above, which is the
  // player's CURRENT team (players.team_id). Excludes the current team here
  // to avoid showing the same team twice — most players today will simply
  // have zero entries left after that filter, since the backend has no
  // multi-team support yet beyond what real match records already capture;
  // this section is architecturally ready for more without fabricating any.
  const teamHistory = statsQuery.data?.teamHistory ?? []
  const pastTeams = teamHistory.filter((t) => t.teamId !== teamId)

  // Performance Insights — the standout individual performance within the
  // player's real last-10-matches window (same client-side range already
  // powering Career Statistics' "Last 10 Matches" option — zero extra
  // network calls). Unlike Personal Bests (career-wide, no opponent),
  // PlayerMatchPerformance carries the real opponent per match, so this
  // surfaces something genuinely new rather than repeating Career
  // Statistics or Personal Bests. See findBestBattingPerformance/
  // findBestBowlingPerformance in statsRange.ts for the exact (shared,
  // already-used) tie-break rules.
  const last10Performances = statsQuery.data
    ? filterPerformancesForRange(statsQuery.data.matchHistory.items, "last-10")
    : []
  const bestRecentBatting = findBestBattingPerformance(last10Performances)
  const bestRecentBowling = findBestBowlingPerformance(last10Performances)
  const hasInsights = !!bestRecentBatting || !!bestRecentBowling

  const profileContent = (
    <>
      {/* Header */}
      {player && (
        <View style={styles.headerSection}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/notifications" as any)}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              style={styles.settingsButton}
            >
              <View>
                <MaterialCommunityIcons name="bell-outline" size={18} color={Colors.textSecondary} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.settingsButtonText}>Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/settings" as any)}
              accessibilityRole="button"
              accessibilityLabel="Open account settings"
              style={styles.settingsButton}
            >
              <MaterialCommunityIcons name="cog-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingsButtonText}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Photo or Avatar */}
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={handlePhotoTap}
            disabled={photoUpload.isLoading}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
          >
            {player.photo_url ? (
              <Image source={{ uri: player.photo_url }} style={styles.photo} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {player.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </Text>
              </View>
            )}
            <View style={styles.photoEditBadge}>
              <MaterialCommunityIcons name="camera" size={16} color={Colors.white} />
            </View>
          </TouchableOpacity>

          <Text style={styles.playerName} numberOfLines={2}>
            {player.name}
          </Text>
          {player.nickname && (
            <Text style={styles.nickname} numberOfLines={1}>
              @{player.nickname}
            </Text>
          )}

          {/* Playing role — subtle identity badge, not a loud colored pill. */}
          {player.role && (
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{formatRole(player.role)}</Text>
            </View>
          )}

          <View style={styles.metaDivider} />

          {/* Profile metadata — Playing Role / Registration Number. Kept as
              its own full-width row, separate from the Edit Profile action
              below, so the action never shares a row with metadata. */}
          <View style={styles.metaRow}>
            {player.role && (
              <View style={styles.metaColumn}>
                <Text style={styles.metaLabel}>Playing Role</Text>
                <Text style={styles.metaValue}>{formatRole(player.role)}</Text>
              </View>
            )}
            <View style={[styles.metaColumn, styles.metaColumnEnd]}>
              <Text style={styles.metaLabel}>Registration Number</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {player.public_player_id}
              </Text>
            </View>
          </View>

          {/* Edit Profile — standalone action, intentionally not part of the
              metadata row above. */}
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push("/(tabs)/profile/edit" as any)}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={Colors.primary} />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cricket Identity — right after the header, since it's still part
          of "who this player is" before performance data begins. A plain
          divided list, not a bordered card: this is the same "reduce card
          wall" reasoning as Personal Information below — a static field/
          value list reads fine as whitespace + row dividers, and doesn't
          need an outer box the way a scannable tile grid or a tappable row
          list genuinely does elsewhere on this screen. */}
      {player && (
        <View style={styles.section}>
          <SectionTitle icon="cricket" title="Cricket Identity" />
          {hasCricketIdentity ? (
            <View style={styles.infoList}>
              {player.role && <InfoRow label="Role" value={formatRole(player.role) || ""} />}
              {player.batting_style && (
                <InfoRow label="Batting" value={formatBattingStyle(player.batting_style) || ""} />
              )}
              {player.bowling_style && (
                <InfoRow label="Bowling" value={formatBowlingStyle(player.bowling_style) || ""} />
              )}
              {player.jersey_number !== null && player.jersey_number !== undefined && (
                <InfoRow label="Jersey" value={`#${player.jersey_number}`} />
              )}
              {player.is_wicket_keeper && <InfoRow label="Position" value="Wicket Keeper" isLast />}
            </View>
          ) : (
            <View style={styles.emptyStateSmall}>
              <Text style={styles.emptySubtext}>No cricket identity added yet.</Text>
            </View>
          )}
        </View>
      )}

      {/* Career Statistics */}
      {(hasEverPlayed || statsQuery.error) && (
        <View style={styles.section}>
          <SectionTitle
            icon="chart-bar"
            title="Career Statistics"
            right={hasEverPlayed ? <RangeDropdown value={statsRange} onChange={setStatsRange} /> : undefined}
          />
          {statsQuery.error ? (
            <ErrorScreen
              title="Statistics Unavailable"
              message="Could not load your statistics. Try refreshing."
              onRetry={() => statsQuery.refetch()}
              retryLabel="Retry"
            />
          ) : (
            <>
              {statsQuery.isFetching && !statsQuery.isPending && (
                <ActivityIndicator color={Colors.primary} style={styles.inlineLoader} />
              )}
              {sections.length > 0 ? (
                <>
                  {sections.map((section, idx) => (
                    <View key={idx} style={styles.statSection}>
                      <View style={styles.statSectionHeader}>
                        <MaterialCommunityIcons name={statSectionIcon(section.title)} size={15} color={Colors.textSecondary} />
                        <Text style={styles.statSectionTitle}>{section.title}</Text>
                      </View>
                      <View style={styles.statGrid}>
                        {section.data.map((item, itemIdx) => (
                          <View key={itemIdx} style={styles.statTile}>
                            <Text style={styles.statTileLabel}>{item.label}</Text>
                            <Text style={styles.statTileValue}>{item.value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                  {/* Fielding has no per-match breakdown anywhere in the API
                      response, so it can only ever be shown for Overall —
                      surfaced as an intentional note, never as fake zeroes. */}
                  {!isOverallRange && (
                    <View style={styles.fieldingNote}>
                      <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textTertiary} />
                      <Text style={styles.fieldingNoteText}>Fielding statistics are available for Overall only.</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.emptyStateSmall}>
                  <MaterialCommunityIcons name="chart-box-outline" size={20} color={Colors.textTertiary} />
                  <Text style={styles.emptySubtext}>
                    {statsRange === "last-match" ? "No match data available." : "No matches found in this range."}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Personal Bests — standout individual records, distinct from Career
          Statistics' overall volume/analysis. Gated on hasEverPlayed (same
          career-activity signal Career Statistics already uses) rather than
          "at least one best exists", so a player who has, say, only ever
          bowled still sees both tiles: their real Best Bowling figure next
          to an honest "no record yet" placeholder for Highest Score, instead
          of that whole category silently vanishing. PersonalBests
          (types/index.ts) carries no opponent/date/venue — highestScore is
          only {runs, notOut} and bestBowling only {wickets, runs} — so there
          is genuinely no real secondary line to add beneath either value. */}
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
          already fetched above (statsQuery, limit=50). */}
      {hasEverPlayed && <PlayerAchievements achievements={statsQuery.data?.achievements} />}

      {/* Career Timeline — its own screen (can get long); reuses the public
          stats endpoint keyed by this player's real publicPlayerId. */}
      {hasEverPlayed && (statsQuery.data?.careerTimeline?.length ?? 0) > 0 && player?.public_player_id && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.timelineLink}
            onPress={() => router.push(`/(tabs)/players/timeline?publicPlayerId=${player.public_player_id}` as any)}
            accessibilityRole="button"
            accessibilityLabel="View your career timeline"
          >
            <MaterialCommunityIcons name="timeline-clock-outline" size={20} color={Colors.primary} />
            <Text style={styles.timelineLinkText}>Career Timeline</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Following — quick-access list of players & teams this user follows. */}
      {isPlayer && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.timelineLink}
            onPress={() => router.push("/(tabs)/profile/following" as any)}
            accessibilityRole="button"
            accessibilityLabel="View who you are following"
          >
            <MaterialCommunityIcons name="account-heart-outline" size={20} color={Colors.primary} />
            <Text style={styles.timelineLinkText}>Following</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Recent Form — a compact form-guide (most recent first, real `won`
          data only) plus a small detail list for the latest few matches.
          Navigation/tap target unchanged: /(tabs)/profile/matches/[matchId]. */}
      {statsQuery.data && (
        <View style={styles.section}>
          <SectionTitle icon="trending-up" title="Recent Form" />
          {recentForm.length === 0 ? (
            <View style={styles.emptyStateSmall}>
              <MaterialCommunityIcons name="trending-up" size={20} color={Colors.textTertiary} />
              <Text style={styles.emptySubtext}>No recent matches</Text>
            </View>
          ) : (
            <>
              <View style={styles.formDotsRow}>
                {recentForm.map((perf: PlayerMatchPerformance) => (
                  <TouchableOpacity
                    key={perf.matchId}
                    style={[
                      styles.formDot,
                      perf.won === true ? styles.formResultWon : perf.won === false ? styles.formResultLost : styles.formResultNeutral,
                    ]}
                    onPress={() => router.push(`/(tabs)/profile/matches/${perf.matchId}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`vs ${perf.opponent}, ${perf.won === true ? "won" : perf.won === false ? "lost" : perf.result}`}
                  >
                    <Text style={styles.formDotText}>{perf.won === true ? "W" : perf.won === false ? "L" : "–"}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formSummaryText && <Text style={styles.formSummaryText}>{formSummaryText}</Text>}

              <View style={styles.formList}>
                {recentForm.slice(0, 3).map((perf, idx) => {
                  const statLabel = formMatchStatLabel(perf)
                  return (
                    <TouchableOpacity
                      key={perf.matchId}
                      style={[styles.formListRow, idx > 0 && styles.formListRowDivider]}
                      onPress={() => router.push(`/(tabs)/profile/matches/${perf.matchId}` as any)}
                      accessibilityRole="button"
                      accessibilityLabel={`View match performance vs ${perf.opponent}`}
                    >
                      <View
                        style={[
                          styles.formListBadge,
                          perf.won === true ? styles.formResultWon : perf.won === false ? styles.formResultLost : styles.formResultNeutral,
                        ]}
                      >
                        <Text style={styles.formListBadgeText}>{perf.won === true ? "W" : perf.won === false ? "L" : "–"}</Text>
                      </View>
                      <View style={styles.formListInfo}>
                        <Text style={styles.formListOpponent} numberOfLines={1}>
                          vs {perf.opponent}
                        </Text>
                        <Text style={styles.formListDate} numberOfLines={1}>
                          {formatDate(perf.date)}
                        </Text>
                      </View>
                      {statLabel && (
                        <Text style={styles.formListStat} numberOfLines={1}>
                          {statLabel}
                        </Text>
                      )}
                      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  )
                })}
              </View>
            </>
          )}
        </View>
      )}

      {/* Performance Insights — the standout individual performance within
          the player's real last-10-matches window, WITH the real opponent
          (something neither Career Statistics nor Personal Bests shows).
          Simple, transparent, deterministic — no ratings/scores/trends. */}
      {hasEverPlayed && (
        <View style={styles.section}>
          <SectionTitle icon="lightbulb-on-outline" title="Performance Insights" />
          {hasInsights ? (
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
          ) : (
            <View style={styles.emptyStateSmall}>
              <Text style={styles.emptySubtext}>Not enough recent match data yet.</Text>
            </View>
          )}
        </View>
      )}

      {/* No Stats Message — genuinely zero career matches (never played),
          distinct from a specific range simply having no matches in it,
          which is handled inline inside Career Statistics above. */}
      {statsQuery.data && !hasEverPlayed && !statsQuery.error && (
        <View style={styles.section}>
          <EmptyState title="No Statistics Yet" message="You haven't played any matches yet. Statistics will appear here after your first match." />
        </View>
      )}

      {/* Stats Loading */}
      {statsQuery.isPending && sections.length === 0 && (
        <View style={[styles.section, styles.loadingContainer]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {/* My Teams — myTeams is architecturally a list (see MyTeamMembership's
          comment above); this renders correctly for 0, 1, or N real
          memberships without assuming there can only ever be one. Team
          History (real past teams from finalized-match records) renders
          below as its own labeled list, only when there's genuinely more
          than the current team to show. */}
      <View style={styles.section}>
        <SectionTitle icon="account-group-outline" title="My Teams" />
        {teamId && teamQuery.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={styles.inlineLoader} />
        ) : myTeams.length === 0 ? (
          <View style={styles.emptyStateSmall}>
            <MaterialCommunityIcons name="account-group-outline" size={20} color={Colors.textTertiary} />
            <Text style={styles.emptySubtext}>You{"'"}re not part of any team yet.</Text>
          </View>
        ) : (
          <>
            {pastTeams.length > 0 && <Text style={styles.teamGroupLabel}>Current Team</Text>}
            <View style={styles.teamsList}>
              {myTeams.map((membership, idx) => {
                // Record data only exists for whichever membership the currently
                // fetched team profile corresponds to — never fabricated for the
                // others. Real fields only: TeamRecord (teamApi.ts) always has
                // wins/losses/ties as numbers; ties is omitted when 0 rather than
                // shown, matching this row's own existing convention below.
                const record =
                  teamProfile && teamProfile.team.id === membership.team.id ? teamProfile.record : null
                return (
                  <TouchableOpacity
                    key={membership.team.id}
                    style={[styles.teamRow, idx > 0 && styles.teamRowDivider]}
                    onPress={() => router.push(`/(tabs)/teams/${membership.team.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${membership.team.name} team profile`}
                  >
                    {membership.team.logoUrl ? (
                      <Image source={{ uri: membership.team.logoUrl }} style={styles.teamLogo} />
                    ) : (
                      <View style={styles.teamLogoPlaceholder}>
                        <Text style={styles.teamLogoText}>{membership.team.shortName?.slice(0, 2) || "TM"}</Text>
                      </View>
                    )}
                    <View style={styles.teamInfo}>
                      <Text style={styles.teamName} numberOfLines={2}>
                        {membership.team.name}
                      </Text>
                      {!!membership.team.shortName && (
                        <Text style={styles.teamShortName} numberOfLines={1}>
                          {membership.team.shortName}
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
              })}
            </View>
          </>
        )}

        {pastTeams.length > 0 && (
          <>
            <Text style={[styles.teamGroupLabel, styles.teamHistorySpacing]}>Team History</Text>
            <View style={styles.teamsList}>
              {pastTeams.map((t, idx) => (
                <TouchableOpacity
                  key={t.teamId}
                  style={[styles.teamRow, idx > 0 && styles.teamRowDivider]}
                  onPress={() => router.push(`/(tabs)/teams/${t.teamId}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${t.name} team profile`}
                >
                  {t.logoUrl ? (
                    <Image source={{ uri: t.logoUrl }} style={styles.teamLogo} />
                  ) : (
                    <View style={styles.teamLogoPlaceholder}>
                      <Text style={styles.teamLogoText}>{t.shortName?.slice(0, 2) || "TM"}</Text>
                    </View>
                  )}
                  <View style={styles.teamInfo}>
                    <Text style={styles.teamName} numberOfLines={2}>
                      {t.name}
                    </Text>
                    {!!t.shortName && (
                      <Text style={styles.teamShortName} numberOfLines={1}>
                        {t.shortName}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.teamRecord} numberOfLines={1}>
                    {t.record.wins}W · {t.record.losses}L{t.record.ties > 0 ? ` · ${t.record.ties}T` : ""}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Recognition — informational only (no real destination exists for
          any of these entries, so no chevron/navigation is implied). Renders
          as a mapped list of compact rows so it scales correctly whether the
          player has 1 or several genuine recognitions. */}
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

      {/* Personal Information — secondary/quiet by design: a plain divided
          list rather than a bordered card (see the same note on Cricket
          Identity above). */}
      {player && (
        <View style={styles.section}>
          <SectionTitle icon="card-account-details-outline" title="Personal Information" />
          {hasPersonalInfo ? (
            <View style={styles.infoList}>
              {player.date_of_birth && (
                <InfoRow
                  label="Date of Birth"
                  value={`${formatDate(player.date_of_birth)} (${calculateAge(player.date_of_birth)} years)`}
                />
              )}
              {player.city && <InfoRow label="City" value={player.city} />}
              {player.state && <InfoRow label="State" value={player.state} />}
              {player.address_line && <InfoRow label="Address" value={player.address_line} />}
              {player.postal_code && <InfoRow label="Postal Code" value={player.postal_code} />}
              {player.bio && <InfoRow label="Bio" value={player.bio} isLast />}
            </View>
          ) : (
            <View style={styles.emptyStateSmall}>
              <Text style={styles.emptySubtext}>No personal information added yet.</Text>
            </View>
          )}
        </View>
      )}

      {/* Match History Entry Point */}
      {hasEverPlayed && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.matchHistoryButton}
            onPress={() => router.push("/(tabs)/profile/matches" as any)}
            accessibilityLabel="View player match history"
            accessibilityRole="button"
          >
            <View style={styles.matchHistoryContent}>
              <Text style={styles.matchHistoryLabel}>Match History</Text>
              <Text style={styles.matchHistoryCount}>{career!.matches} matches</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </>
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {isPlayer ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {profileContent}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.centerContainer}>
            <EmptyState title="Player Profile" message="You need to select a player role to view your player profile." />
          </View>
        </ScrollView>
      )}

      <PhotoPreviewModal
        visible={photoUpload.showPreview}
        imageUri={photoUpload.selectedImageUri}
        onUpload={photoUpload.handleUpload}
        onCancel={photoUpload.closePreview}
        onChooseAnother={photoUpload.retryImageSelection}
      />
    </View>
  )
}

function SectionTitle({
  icon,
  title,
  right,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]
  title: string
  right?: React.ReactNode
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleLeft}>
        <MaterialCommunityIcons name={icon} size={18} color={Colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {right}
    </View>
  )
}

// One small, recognizable icon per Career Statistics subsection (not per
// stat tile — the numbers must stay the visual focus). Falls back to the
// section's own chart icon for any future subsection title this doesn't
// recognize yet, so an icon is never silently missing.
function statSectionIcon(title: string): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  switch (title) {
    case "Batting":
      return "cricket"
    case "Bowling":
      return "target"
    case "Fielding":
      return "hand-back-right-outline"
    default:
      return "chart-bar"
  }
}

// One compact secondary stat per Recent Form list row — only ever a field
// that genuinely exists on the performance (real batting runs, or real
// bowling wickets when the player didn't bat), never both, never invented.
function formMatchStatLabel(perf: PlayerMatchPerformance): string | null {
  if (perf.batting.didBat && typeof perf.batting.runs === "number") {
    return `${perf.batting.runs} runs`
  }
  if (perf.bowling.didBowl && typeof perf.bowling.wickets === "number") {
    return `${perf.bowling.wickets} wkt${perf.bowling.wickets === 1 ? "" : "s"}`
  }
  return null
}

// Compact range selector for Career Statistics. Built on RN's built-in
// Modal (already used elsewhere in this app — see PhotoPreviewModal) rather
// than a new picker dependency, so it works identically on iOS and Android.
function RangeDropdown({ value, onChange }: { value: StatsRange; onChange: (range: StatsRange) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TouchableOpacity
        style={styles.rangeTrigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Statistics range: ${statsRangeLabel(value)}. Tap to change.`}
      >
        <Text style={styles.rangeTriggerText}>{statsRangeLabel(value)}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.rangeBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.rangeMenu}>
            {STATS_RANGE_OPTIONS.map((opt, idx) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.rangeMenuItem, idx > 0 && styles.rangeMenuItemDivider]}
                onPress={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.rangeMenuItemText, opt.value === value && styles.rangeMenuItemTextActive]}>
                  {opt.label}
                </Text>
                {opt.value === value && <MaterialCommunityIcons name="check" size={18} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: Spacing.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 120,
  },
  headerSection: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  headerTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: Spacing.sm,
  },
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  settingsButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  bellBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: Typography.fontWeight.bold,
  },
  photoContainer: {
    marginBottom: Spacing.md,
  },
  photo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Colors.gray[100],
    // Soft lift so the photo reads as the header's primary identity
    // element without a heavy/loud border.
    boxShadow: Shadows.sm,
  },
  photoEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: Colors.white,
    boxShadow: Shadows.sm,
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    boxShadow: Shadows.sm,
  },
  avatarText: {
    fontSize: Typography.fontSize["2xl"],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  playerName: {
    fontSize: Typography.fontSize["2xl"],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  nickname: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    marginBottom: Spacing.md,
  },
  // Subtle professional identity badge — outlined, not a loud filled pill.
  roleChip: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginBottom: Spacing.lg,
  },
  roleChipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaDivider: {
    width: "100%",
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: Spacing.lg,
  },
  metaColumn: {
    flexShrink: 1,
    maxWidth: "60%",
  },
  metaColumnEnd: {
    alignItems: "flex-end",
  },
  metaLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  editButtonText: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.sm,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  rangeTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  rangeTriggerText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  rangeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  rangeMenu: {
    width: 240,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    // RN New Architecture (Expo 57) supports CSS-style boxShadow directly.
    boxShadow: Shadows.lg,
  },
  rangeMenuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rangeMenuItemDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rangeMenuItemText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  rangeMenuItemTextActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  // Career Statistics — one subsection block (Batting/Bowling) per SectionData,
  // each holding a responsive 2-column grid of stat tiles instead of a
  // vertical wall of label/value rows.
  statSection: {
    marginBottom: Spacing.lg,
  },
  statSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  statSectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  // Informational, not an error — no warning colors, just a muted note.
  fieldingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  fieldingNoteText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    flexShrink: 1,
  },
  // Cricket Identity / Personal Information — deliberately unstyled wrapper.
  // No border/background: these are static label/value lists, not a
  // scannable grid or a tappable row list, so an outer card box would only
  // add another heavy container to a screen that already has several
  // (Career Statistics tiles, My Teams, Recognition, Recent Form's list).
  // InfoRow's own row padding + divider below carry all the structure this
  // needs.
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
  inlineLoader: {
    marginVertical: Spacing.md,
  },
  emptyStateSmall: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  // Bordered, not filled — consistent with the Cricket Identity / Personal
  // Information `card` treatment elsewhere on this screen.
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
  // "Current Team" / "Team History" sub-labels — only shown when both
  // groups are present, so the single-team case (still the common one)
  // stays exactly as before, unlabeled.
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
  // Recognition — a bordered list of compact rows (same pattern as My Teams
  // / Recent Form's detail list), so it scales cleanly whether the player
  // has one recognition or several, instead of a fixed-width side-by-side
  // card pair that only ever worked for exactly two items.
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
  // Personal Bests — a small "record book" pair, deliberately simpler than
  // Career Statistics' tiles (no icon, no subsection grouping) so the two
  // sections stay visually distinct.
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
  // Performance Insights — reuses Personal Bests' bestsRow/bestTile/
  // bestLabel/bestValue tile treatment (same "small standout record" role),
  // just with one extra line for the real opponent.
  insightSubtext: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  // Recent Form — compact form-guide dots (scan-at-a-glance) + a small
  // bordered detail list for the latest matches, mirroring the card
  // treatment already used by My Teams elsewhere on this screen.
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
  // Shared result-color tokens, reused at both dot size and list-badge size.
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
    marginBottom: Spacing.md,
  },
  formList: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  formListRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    minHeight: 56,
  },
  formListRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  formListBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  formListBadgeText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.xs,
  },
  formListInfo: {
    flex: 1,
  },
  formListOpponent: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  formListDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  formListStat: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    flexShrink: 0,
  },
  bottomSpacer: {
    height: Spacing.lg,
  },
  matchHistoryButton: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 56,
  },
  matchHistoryContent: {
    flex: 1,
  },
  matchHistoryLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  matchHistoryCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
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
})
