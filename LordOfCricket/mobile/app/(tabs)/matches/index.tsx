import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useUpcomingMatches, useLiveMatches, useCompletedMatches } from '../../../src/hooks/useMatches'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'
import { MatchCard } from '../../../src/components/MatchCard'

type MatchCategory = 'LIVE' | 'UPCOMING' | 'COMPLETED'

export default function MatchesScreen() {
  const router = useRouter()
  const [category, setCategory] = useState<MatchCategory>('UPCOMING')
  const [refreshing, setRefreshing] = useState(false)

  const liveMatches = useLiveMatches(50, 0)
  const upcomingMatches = useUpcomingMatches(50, 0)
  const completedMatches = useCompletedMatches(50, 0)

  const getCurrentQuery = () => {
    switch (category) {
      case 'LIVE':
        return liveMatches
      case 'UPCOMING':
        return upcomingMatches
      case 'COMPLETED':
        return completedMatches
    }
  }

  const currentQuery = getCurrentQuery()
  const { data, isLoading, isError, refetch } = currentQuery

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load matches. Please try again."
        onRetry={() => refetch()}
      />
    )
  }

  const matches = data?.items || []

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Matches</Text>
            <Text style={styles.subtitle}>Browse cricket matches</Text>
          </View>
          <TouchableOpacity
            style={styles.tournamentsLink}
            onPress={() => router.push('/(tabs)/tournaments' as any)}
            accessibilityRole="button"
            accessibilityLabel="Browse tournaments"
          >
            <Text style={styles.tournamentsLinkText}>Tournaments</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Filter */}
      <View style={styles.filterContainer}>
        {(['LIVE', 'UPCOMING', 'COMPLETED'] as const).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterButton, category === cat && styles.filterButtonActive]}
            onPress={() => setCategory(cat)}
          >
            <Text
              style={[
                styles.filterButtonText,
                category === cat && styles.filterButtonTextActive,
              ]}
            >
              {cat === 'COMPLETED' ? 'Results' : cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Matches List */}
      {matches.length > 0 ? (
        <FlatList
          data={matches}
          renderItem={({ item }) => (
            <View style={styles.matchItem}>
              <MatchCard match={item} />
            </View>
          )}
          keyExtractor={(item) => `${item.id}`}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <EmptyState
            title={`No ${category.toLowerCase()} matches`}
            message={`There are no ${category.toLowerCase()} matches available right now.`}
          />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    paddingTop: Spacing['3xl'],
    backgroundColor: Colors.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  tournamentsLink: {
    borderWidth: 1,
    borderColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
  },
  tournamentsLinkText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.sm,
  },
  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    opacity: 0.9,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  filterButtonTextActive: {
    color: Colors.white,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  matchItem: {
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
})
