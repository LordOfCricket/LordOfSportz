import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { useGlobalSearch, MIN_QUERY_LENGTH } from '../../../src/hooks/useGlobalSearch'
import { getRecentSearches, addRecentSearch, clearRecentSearches } from '../../../src/lib/recentSearches'
import type { SearchEntityType, SearchResultItem } from '../../../src/services/searchApi'

const DEBOUNCE_MS = 400

const TYPE_META: Record<SearchEntityType, { label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = {
  player: { label: 'Players', icon: 'account-outline' },
  team: { label: 'Teams', icon: 'account-group-outline' },
  ground: { label: 'Grounds', icon: 'stadium-outline' },
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [text, setText] = useState('')
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS)
  const { data, isLoading, isError, isFetching, refetch } = useGlobalSearch(query)

  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    getRecentSearches().then(setRecent)
  }, [])

  // Persist a term once it has produced a completed search.
  useEffect(() => {
    if (query.length >= MIN_QUERY_LENGTH && data && !isFetching) {
      addRecentSearch(query).then(setRecent)
    }
  }, [query, data, isFetching])

  const groups = useMemo(() => {
    if (!data) return []
    return (['player', 'team', 'ground'] as SearchEntityType[])
      .map((type) => ({
        type,
        items: type === 'player' ? data.players : type === 'team' ? data.teams : data.grounds,
      }))
      .filter((g) => g.items.length > 0)
  }, [data])

  const openResult = (item: SearchResultItem) => {
    const path =
      item.type === 'player'
        ? `/(tabs)/players/${item.id}`
        : item.type === 'team'
          ? `/(tabs)/teams/${item.id}`
          : `/(tabs)/grounds/${item.id}`
    router.push(path as any)
  }

  const showIdle = query.length < MIN_QUERY_LENGTH
  const totalResults = (data?.players.length ?? 0) + (data?.teams.length ?? 0) + (data?.grounds.length ?? 0)

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={LocColors.faint} />
          <TextInput
            style={styles.input}
            placeholder="Search players, teams, grounds…"
            placeholderTextColor={LocColors.faint}
            value={text}
            onChangeText={setText}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            autoFocus
            accessibilityLabel="Search"
          />
          {text.length > 0 && (
            <TouchableOpacity
              onPress={() => setText('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color={LocColors.faint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {showIdle ? (
          <IdleState
            recent={recent}
            onPick={(t) => setText(t)}
            onClear={() => {
              clearRecentSearches()
              setRecent([])
            }}
          />
        ) : isLoading || isFetching ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.stateTitle}>Search failed</Text>
            <Text style={styles.stateBody}>Something went wrong. Please try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : totalResults === 0 ? (
          <View style={styles.centerPad}>
            <Text style={styles.stateTitle}>No results</Text>
            <Text style={styles.stateBody}>
              Nothing matched “{query}”. Try a player or team name, or a city for grounds.
            </Text>
          </View>
        ) : (
          <>
            {groups.map((group) => (
              <View key={group.type} style={styles.section}>
                <Text style={styles.sectionLabel}>{TYPE_META[group.type].label}</Text>
                <View style={styles.card}>
                  {group.items.map((item, i) => (
                    <TouchableOpacity
                      key={`${item.type}-${item.id}`}
                      style={[styles.row, i > 0 && styles.rowDivider]}
                      onPress={() => openResult(item)}
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                    >
                      <View style={styles.rowIcon}>
                        <MaterialCommunityIcons
                          name={TYPE_META[item.type].icon}
                          size={18}
                          color={LocColors.green}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.subtitle ? (
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            {data && data.failed.length > 0 && (
              <TouchableOpacity onPress={() => refetch()} accessibilityRole="button">
                <Text style={styles.partialNote}>Some results couldn’t be loaded. Tap to retry.</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function IdleState({
  recent,
  onPick,
  onClear,
}: {
  recent: string[]
  onPick: (term: string) => void
  onClear: () => void
}) {
  if (recent.length === 0) {
    return (
      <View style={styles.centerPad}>
        <MaterialCommunityIcons name="magnify" size={40} color={LocColors.border} />
        <Text style={styles.stateTitle}>Search LOC</Text>
        <Text style={styles.stateBody}>Find players and teams by name, or grounds by city.</Text>
      </View>
    )
  }
  return (
    <View style={styles.section}>
      <View style={styles.recentHeader}>
        <Text style={styles.sectionLabel}>Recent</Text>
        <TouchableOpacity onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        {recent.map((term, i) => (
          <TouchableOpacity
            key={term}
            style={[styles.row, i > 0 && styles.rowDivider]}
            onPress={() => onPick(term)}
            accessibilityRole="button"
            accessibilityLabel={`Search ${term}`}
          >
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="history" size={18} color={LocColors.muted} />
            </View>
            <Text style={[styles.rowTitle, styles.recentTerm]} numberOfLines={1}>
              {term}
            </Text>
            <MaterialCommunityIcons name="arrow-top-left" size={18} color={LocColors.faint} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LocColors.mint,
  },
  searchBarWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  input: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: LocColors.navy,
    padding: 0,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.navy,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: LocColors.navy,
  },
  rowSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: LocColors.muted,
    marginTop: 2,
  },
  recentTerm: {
    flex: 1,
    fontWeight: Typography.fontWeight.medium,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: LocColors.green,
    marginBottom: Spacing.sm,
  },
  centerPad: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'] * 2,
    gap: Spacing.sm,
  },
  stateTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.navy,
    marginTop: Spacing.sm,
  },
  stateBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    textAlign: 'center',
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
  partialNote: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    fontSize: Typography.fontSize.xs,
    color: LocColors.faint,
    textAlign: 'center',
  },
})
