import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { usePlayerSearch } from '../../../src/hooks/usePlayer'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'
import { formatRole } from '../../../src/utils/playerFormatting'
import { PlayerSearchResult } from '../../../src/services/playerApi'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400

// Player Discovery — GET /players (statistics.service.js#searchPlayers),
// already existed, public, paginated, case-insensitive (Postgres ILIKE),
// no auth required. An empty search lists all players; typing filters the
// same real list server-side. No client-side filtering over a partial page
// — every filter is a real backend query.
export default function PlayersDirectoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [searchText, setSearchText] = useState('')
  const debouncedQuery = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS)
  const [offset, setOffset] = useState(0)
  const [allPlayers, setAllPlayers] = useState<PlayerSearchResult[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const query = usePlayerSearch(debouncedQuery, PAGE_SIZE, offset)

  // A new (debounced) search term always starts a fresh page 0 — adjust
  // state during render (React's documented "reset on prop change" pattern)
  // rather than in an effect.
  const [queryForPage, setQueryForPage] = useState(debouncedQuery)
  if (debouncedQuery !== queryForPage) {
    setQueryForPage(debouncedQuery)
    setOffset(0)
    setAllPlayers([])
  }

  useEffect(() => {
    if (!query.data?.items) return
    const players = query.data.items.map((i) => i.player)
    setAllPlayers((prev) => {
      if (offset === 0) return players
      // Dedupe by publicPlayerId — guards against a background refetch
      // re-firing this effect at an unchanged offset.
      const existingIds = new Set(prev.map((p) => p.publicPlayerId))
      const newPlayers = players.filter((p) => !existingIds.has(p.publicPlayerId))
      return newPlayers.length > 0 ? [...prev, ...newPlayers] : prev
    })
  }, [query.data, offset])

  const handleRefresh = async () => {
    setRefreshing(true)
    setOffset(0)
    try {
      await query.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const handleLoadMore = () => {
    const total = query.data?.pagination.total ?? 0
    if (allPlayers.length < total && !query.isPending) {
      setOffset((prev) => prev + PAGE_SIZE)
    }
  }

  const handlePlayerPress = (publicPlayerId: string) => {
    router.push(`/(tabs)/players/${publicPlayerId}` as any)
  }

  const total = query.data?.pagination.total ?? 0
  const hasMoreToLoad = allPlayers.length < total
  const isFirstLoad = offset === 0 && allPlayers.length === 0 && query.isPending
  const showLoadMoreError = hasMoreToLoad && !!query.error && offset > 0
  const showLoadMore = hasMoreToLoad && !query.isPending && !query.error
  const showEndOfList = !hasMoreToLoad && allPlayers.length > 0 && !query.isPending

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* QA fix: this screen had no way back (players/_layout.tsx disables
          the native header, and this is a hidden tab only reachable via
          router.push from Teams). Header now matches
          players/[publicPlayerId].tsx's exact back-arrow treatment. */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Players</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Entry points into the two other public player-stats features —
          Rankings and Player Comparison. The Players directory is the
          natural hub for both (the website places its "Compare Players"
          link on the equivalent discovery page). */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/(tabs)/rankings' as any)}
          accessibilityRole="button"
          accessibilityLabel="Open player rankings"
        >
          <MaterialCommunityIcons name="trophy-outline" size={16} color={Colors.text} />
          <Text style={styles.actionButtonText}>Rankings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/(tabs)/players/compare' as any)}
          accessibilityRole="button"
          accessibilityLabel="Compare two players"
        >
          <MaterialCommunityIcons name="compare-horizontal" size={16} color={Colors.text} />
          <Text style={styles.actionButtonText} numberOfLines={1}>Compare</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/(tabs)/players/head-to-head' as any)}
          accessibilityRole="button"
          accessibilityLabel="Player head-to-head"
        >
          <MaterialCommunityIcons name="sword-cross" size={16} color={Colors.text} />
          <Text style={styles.actionButtonText} numberOfLines={1}>Head-to-Head</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <MaterialCommunityIcons name="magnify" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or player ID"
            placeholderTextColor={Colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            maxLength={100}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isFirstLoad ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : offset === 0 && query.error ? (
        <View style={styles.centerContent}>
          <ErrorScreen
            title="Failed to Load Players"
            message="Could not load the player directory. Please try again."
            onRetry={() => query.refetch()}
            retryLabel="Retry"
          />
        </View>
      ) : allPlayers.length === 0 ? (
        <View style={styles.centerContent}>
          <EmptyState
            title="No Players Found"
            message={debouncedQuery ? `No players match "${debouncedQuery}"` : 'No players are registered yet.'}
          />
        </View>
      ) : (
        <FlatList
          data={allPlayers}
          keyExtractor={(item) => item.publicPlayerId}
          renderItem={({ item }) => <PlayerRow player={item} onPress={() => handlePlayerPress(item.publicPlayerId)} />}
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
          ListFooterComponent={
            <>
              {query.isPending && allPlayers.length > 0 && (
                <View style={styles.loadingFooter}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              )}
              {showLoadMoreError && (
                <View style={styles.loadMoreErrorBox}>
                  <Text style={styles.loadMoreErrorText}>Could not load more players.</Text>
                  <TouchableOpacity onPress={() => query.refetch()}>
                    <Text style={styles.loadMoreRetryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {showLoadMore && (
                <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                  <Text style={styles.loadMoreText}>Load More Players</Text>
                </TouchableOpacity>
              )}
              {showEndOfList && <Text style={styles.endOfListText}>That{"'"}s everyone.</Text>}
            </>
          }
        />
      )}
    </View>
  )
}

function PlayerRow({ player, onPress }: { player: PlayerSearchResult; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.playerRow}
      onPress={onPress}
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
            {formatRole(player.role)}
          </Text>
        )}
      </View>
      <Text style={styles.playerPublicId} numberOfLines={1}>
        {player.publicPlayerId}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
    </TouchableOpacity>
  )
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
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  actionButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  rowGap: {
    height: Spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: 56,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
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
  playerPublicId: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    flexShrink: 0,
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  loadMoreButton: {
    marginVertical: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  loadMoreText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.base,
  },
  loadMoreErrorBox: {
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
  endOfListText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginVertical: Spacing.lg,
  },
})
