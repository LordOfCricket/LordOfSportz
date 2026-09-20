import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useTournaments } from '../../../src/hooks/useTournaments'
import { TournamentCategory, TournamentSummary } from '../../../src/services/tournamentApi'
import { formatLabel, statusLabel, formatDateRange } from '../../../src/constants/tournamentLabels'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'

const TABS: { key: TournamentCategory; label: string }[] = [
  { key: 'LIVE', label: 'Live' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
]

const STATUS_COLOR: Record<string, string> = {
  DRAFT: Colors.gray[400],
  REGISTRATION: Colors.warning,
  SCHEDULED: Colors.statusUpcoming,
  LIVE: Colors.error,
  COMPLETED: Colors.success,
}

export default function TournamentsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [category, setCategory] = useState<TournamentCategory>('LIVE')
  const { data, isPending, isError, refetch, isFetching } = useTournaments(category)

  const items = data?.items ?? []

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tournaments</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setCategory(t.key)}
            style={[styles.tab, category === t.key && styles.tabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: category === t.key }}
          >
            <Text style={[styles.tabText, category === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <ErrorScreen
            title="Couldn't Load Tournaments"
            message="Please try again."
            onRetry={() => refetch()}
            retryLabel="Retry"
          />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <EmptyState title="No Tournaments" message={`No ${TABS.find((t) => t.key === category)?.label.toLowerCase()} tournaments right now.`} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.publicTournamentId}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          refreshing={isFetching}
          onRefresh={refetch}
          renderItem={({ item }) => <TournamentRow tournament={item} onPress={() => router.push(`/(tabs)/tournaments/${item.publicTournamentId}` as any)} />}
        />
      )}
    </View>
  )
}

function TournamentRow({ tournament, onPress }: { tournament: TournamentSummary; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${tournament.name}`}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={2}>
          {tournament.name}
        </Text>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[tournament.status] || Colors.gray[400] }]} />
          <Text style={styles.statusText}>{statusLabel(tournament.status)}</Text>
        </View>
      </View>

      <Text style={styles.cardFormat}>{formatLabel(tournament.format)}</Text>

      <View style={styles.cardMetaRow}>
        <View style={styles.cardMeta}>
          <MaterialCommunityIcons name="calendar-range" size={13} color={Colors.textTertiary} />
          <Text style={styles.cardMetaText} numberOfLines={1}>
            {formatDateRange(tournament.startDate, tournament.endDate)}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <MaterialCommunityIcons name="account-group" size={13} color={Colors.textTertiary} />
          <Text style={styles.cardMetaText}>
            {tournament.teamCount ?? 0}/{tournament.maxTeams} teams
          </Text>
        </View>
      </View>

      {tournament.status === 'COMPLETED' && tournament.championTeamName && (
        <View style={styles.championRow}>
          <MaterialCommunityIcons name="trophy" size={14} color={Colors.secondary} />
          <Text style={styles.championText} numberOfLines={1}>
            {tournament.championTeamName}
          </Text>
        </View>
      )}
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
  title: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.xs,
    margin: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundAlt,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },
  center: { flex: 1, justifyContent: 'center' },
  listContent: { padding: Spacing.lg, paddingTop: Spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    gap: Spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardName: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardFormat: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  championText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.text },
})
