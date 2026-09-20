import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useDiscoverTeams } from '../../../src/hooks/useTeams'
import { useAuth } from '../../../src/hooks/useAuth'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'

export default function TeamsScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, isError, refetch } = useDiscoverTeams(searchQuery || undefined, 50, 0)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const handleTeamPress = (teamId: number) => {
    router.push(`/(tabs)/teams/${teamId}`)
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message="Could not load teams. Please try again."
        onRetry={() => refetch()}
      />
    )
  }

  const teams = data?.teams || []

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <View>
            <Text style={styles.title}>Teams</Text>
            <Text style={styles.subtitle}>Browse cricket teams</Text>
          </View>
          <View style={styles.headerActions}>
            {/* Player Discovery entry point — Teams is this app's other
                "browse people" screen, and already has this exact header
                action pattern, so a new player-directory link belongs here
                rather than as a 6th bottom tab. The /(tabs)/players route
                itself already exists (hidden from the tab bar). */}
            <TouchableOpacity
              style={styles.playersButton}
              onPress={() => router.push('/(tabs)/players' as any)}
              accessibilityRole="button"
              accessibilityLabel="Browse players"
            >
              <Text style={styles.playersButtonText}>Players</Text>
            </TouchableOpacity>
            {user?.role === 'player' && (
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/(tabs)/teams/create')}
                accessibilityLabel="Create new team"
              >
                <Text style={styles.createButtonText}>+ Create</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search teams..."
          placeholderTextColor={Colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Team Comparison entry — mirrors the "Compare Players" affordance on
          the Players directory; the /(tabs)/teams/compare route is a static
          sibling of /(tabs)/teams/[id]. */}
      <View style={styles.compareRow}>
        <TouchableOpacity
          style={styles.compareButton}
          onPress={() => router.push('/(tabs)/teams/compare' as any)}
          accessibilityRole="button"
          accessibilityLabel="Compare two teams"
        >
          <Text style={styles.compareButtonText}>Compare Teams</Text>
        </TouchableOpacity>
      </View>

      {/* Teams List */}
      {teams.length > 0 ? (
        <FlatList
          data={teams}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.teamCard}
              onPress={() => handleTeamPress(item.id)}
            >
              {item.logo_url && (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>🏏</Text>
                </View>
              )}
              <View style={styles.teamInfo}>
                <Text style={styles.teamName}>{item.name}</Text>
                <Text style={styles.teamShortName}>{item.short_name}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => `${item.id}`}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListEmptyComponent={
            <EmptyState
              title="No teams found"
              message={searchQuery ? `No teams match "${searchQuery}"` : 'No teams available'}
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
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
  headerTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  playersButton: {
    borderWidth: 1,
    borderColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
  },
  playersButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontSize: Typography.fontSize.sm,
  },
  createButton: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
  },
  createButtonText: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
    fontSize: Typography.fontSize.sm,
  },
  compareRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
  },
  compareButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.backgroundAlt,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  logoText: {
    fontSize: 24,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  teamShortName: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  arrow: {
    fontSize: Typography.fontSize.lg,
    color: Colors.textTertiary,
  },
})
