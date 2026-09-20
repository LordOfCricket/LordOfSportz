import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useLeaderboard } from '../../../src/hooks/useLeaderboard'
import { useDiscoverTeams } from '../../../src/hooks/useTeams'
import {
  CATEGORIES,
  METRIC_GROUPS,
  metricCategory,
  qualificationText,
  LeaderboardCategory,
} from '../../../src/constants/leaderboardMetrics'
import { formatLeaderboardValue, LeaderboardItem } from '../../../src/services/statisticsApi'
import { PLAYING_ROLES } from '../../../src/domain/playerEnums'
import { formatRole } from '../../../src/utils/playerFormatting'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'

// Mobile Rankings — the same official leaderboards as the website
// (client/src/pages/leaderboards/LeaderboardsPage.jsx): 15 metrics across
// batting / bowling / fielding, filterable by playing role and current
// team, server-ranked and server-paginated. Every value traces to
// finalized-match data via GET /stats/leaderboards/:metric. No invented
// ratings or combined "all-round" score.

const PAGE_SIZE = 15

function secondaryLine(item: LeaderboardItem, category: LeaderboardCategory): string {
  const s = item.secondary || {}
  if (category === 'batting') return `Avg ${s.average ?? '—'} · SR ${s.strikeRate ?? '—'}`
  if (category === 'bowling') return `Avg ${s.average ?? '—'} · Econ ${s.economy ?? '—'}`
  return `${s.matches ?? '—'} matches`
}

function rankBadgeStyle(rank: number) {
  if (rank === 1) return styles.rankGold
  if (rank === 2) return styles.rankSilver
  if (rank === 3) return styles.rankBronze
  return undefined
}

export default function RankingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [metric, setMetric] = useState('runs')
  const [role, setRole] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)

  const category = metricCategory(metric)

  const { data: board, isPending, isError, refetch, isFetching } = useLeaderboard({
    metric,
    role,
    teamId,
    limit: PAGE_SIZE,
    offset,
  })

  const teamsQuery = useDiscoverTeams(undefined, 100, 0)
  const teams: { id: number; name: string; short_name: string }[] = teamsQuery.data?.teams || []

  const selectMetric = (key: string) => {
    setMetric(key)
    setOffset(0)
  }
  const selectCategory = (cat: LeaderboardCategory) => selectMetric(METRIC_GROUPS[cat][0].key)
  const changeRole = (value: string | null) => {
    setRole(value)
    setOffset(0)
  }
  const changeTeam = (value: number | null) => {
    setTeamId(value)
    setOffset(0)
  }

  const total = board?.pagination.total ?? 0
  const qualText = useMemo(() => qualificationText(board?.qualification ?? null), [board?.qualification])
  const rangeStart = offset + 1
  const rangeEnd = Math.min(offset + PAGE_SIZE, total)

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Rankings</Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/rankings/records' as any)}
          accessibilityRole="button"
          accessibilityLabel="Cricket records"
        >
          <Text style={styles.headerLink}>Records</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>All-time official rankings, derived from finalized LOC matches.</Text>

        {/* Category tabs */}
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => selectCategory(cat)}
              style={[styles.categoryTab, category === cat && styles.categoryTabActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.categoryTabText, category === cat && styles.categoryTabTextActive]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Metric pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {METRIC_GROUPS[category].map((m) => (
            <TouchableOpacity
              key={m.key}
              onPress={() => selectMetric(m.key)}
              style={[styles.pill, metric === m.key && styles.pillActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.pillText, metric === m.key && styles.pillTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Role filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <FilterChip label="All Roles" active={role === null} onPress={() => changeRole(null)} />
          {PLAYING_ROLES.map((r) => (
            <FilterChip key={r} label={formatRole(r) || r} active={role === r} onPress={() => changeRole(r)} />
          ))}
        </ScrollView>

        {/* Team filter */}
        {teams.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterChip label="All Teams" active={teamId === null} onPress={() => changeTeam(null)} />
            {teams.map((t) => (
              <FilterChip
                key={t.id}
                label={t.short_name || t.name}
                active={teamId === t.id}
                onPress={() => changeTeam(t.id)}
              />
            ))}
          </ScrollView>
        )}

        {/* Board */}
        <View style={styles.boardCard}>
          {isPending ? (
            <View style={styles.centerPad}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : isError ? (
            <ErrorScreen
              title="Couldn't Load Rankings"
              message="The leaderboard could not be loaded. Please try again."
              onRetry={() => refetch()}
              retryLabel="Retry"
            />
          ) : board ? (
            <>
              <View style={styles.boardHeader}>
                <Text style={styles.boardTitle}>{board.title}</Text>
                {total > 0 && <Text style={styles.boardCount}>{total} ranked</Text>}
              </View>

              {qualText && (
                <View style={styles.qualBox}>
                  <Text style={styles.qualText}>{qualText}</Text>
                </View>
              )}

              {board.items.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    {board.qualification
                      ? 'No players have met the qualification yet.'
                      : 'No official rankings yet. Rankings appear as LOC matches are finalized.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.rows}>
                  {board.items.map((item) => (
                    <TouchableOpacity
                      key={item.player.publicPlayerId}
                      style={styles.row}
                      onPress={() => router.push(`/(tabs)/players/${item.player.publicPlayerId}` as any)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${item.player.name}'s profile — ranked ${item.rank}`}
                    >
                      <View style={[styles.rankBadge, rankBadgeStyle(item.rank)]}>
                        <Text style={styles.rankBadgeText}>{item.rank}</Text>
                      </View>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {item.player.name}
                        </Text>
                        <Text style={styles.rowSecondary} numberOfLines={1}>
                          {formatRole(item.player.role) || 'Player'} · {secondaryLine(item, board.category)}
                        </Text>
                      </View>
                      <View style={styles.rowValueWrap}>
                        <Text style={styles.rowValue}>{formatLeaderboardValue(item.value)}</Text>
                        <Text style={styles.rowUnit}>{board.unit}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {total > PAGE_SIZE && (
                <View style={styles.pager}>
                  <TouchableOpacity
                    disabled={offset === 0 || isFetching}
                    onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    style={[styles.pagerButton, (offset === 0 || isFetching) && styles.pagerButtonDisabled]}
                  >
                    <Text style={styles.pagerButtonText}>Previous</Text>
                  </TouchableOpacity>
                  <Text style={styles.pagerLabel}>
                    #{rangeStart}–#{rangeEnd} of {total}
                  </Text>
                  <TouchableOpacity
                    disabled={offset + PAGE_SIZE >= total || isFetching}
                    onPress={() => setOffset(offset + PAGE_SIZE)}
                    style={[styles.pagerButton, (offset + PAGE_SIZE >= total || isFetching) && styles.pagerButtonDisabled]}
                  >
                    <Text style={styles.pagerButtonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
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
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  headerLink: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.md,
  },
  categoryTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  categoryTabActive: { backgroundColor: Colors.primary },
  categoryTabText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryTabTextActive: { color: Colors.white },
  pillRow: { gap: Spacing.sm, paddingVertical: Spacing.xs, paddingRight: Spacing.lg },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  pillText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },
  pillTextActive: { color: Colors.white },
  filterRow: { gap: Spacing.sm, paddingVertical: Spacing.xs, paddingRight: Spacing.lg },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 160,
  },
  filterChipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  filterChipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: Colors.white },
  boardCard: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  centerPad: { paddingVertical: Spacing['3xl'], alignItems: 'center' },
  boardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  boardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    flex: 1,
  },
  boardCount: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  qualBox: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  qualText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  emptyBox: {
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  rows: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 56,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankGold: { backgroundColor: '#FCEFC7', borderColor: '#E6C34D' },
  rankSilver: { backgroundColor: '#ECECEC', borderColor: '#C7C7C7' },
  rankBronze: { backgroundColor: '#F3DEC9', borderColor: '#CFA06B' },
  rankBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  rowSecondary: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  rowValueWrap: { alignItems: 'flex-end', flexShrink: 0 },
  rowValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  rowUnit: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  pagerButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pagerButtonDisabled: { opacity: 0.4 },
  pagerButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  pagerLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    flexShrink: 1,
    textAlign: 'center',
  },
})
