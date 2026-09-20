import React from 'react'
import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useFollowing } from '../../../src/hooks/useFollow'
import { FollowedPlayer, FollowedTeam, FollowedGround } from '../../../src/services/followApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'
import { formatRole } from '../../../src/utils/playerFormatting'

// The authenticated user's "Following" quick-access list — players and teams
// they follow, each linking to its existing public profile. Every item is a
// real public-safe reference from GET /me/following.
export default function FollowingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const query = useFollowing()

  const header = (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Following</Text>
      <View style={{ width: 44 }} />
    </View>
  )

  if (query.isPending) return <LoadingScreen />
  if (query.error) {
    return (
      <View style={styles.container}>
        {header}
        <ErrorScreen
          title="Failed to Load"
          message="Could not load your Following list."
          onRetry={() => query.refetch()}
          retryLabel="Retry"
        />
      </View>
    )
  }

  const players = query.data?.players.items ?? []
  const teams = query.data?.teams.items ?? []
  const grounds = query.data?.grounds?.items ?? []

  return (
    <View style={styles.container}>
      {header}
      {players.length === 0 && teams.length === 0 && grounds.length === 0 ? (
        <EmptyState
          title="Not Following Anyone"
          message="Tap Follow on a player, team or ground to keep them here."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {players.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Players ({query.data?.players.total})</Text>
              <View style={styles.list}>
                {players.map((p: FollowedPlayer, i) => (
                  <TouchableOpacity
                    key={p.publicPlayerId}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                    onPress={() => router.push(`/(tabs)/players/${p.publicPlayerId}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${p.name}'s profile`}
                  >
                    {p.photoUrl ? (
                      <Image source={{ uri: p.photoUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>
                          {p.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {formatRole(p.role) || 'Player'}
                        {p.team ? ` · ${p.team.name}` : ''}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {teams.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Teams ({query.data?.teams.total})</Text>
              <View style={styles.list}>
                {teams.map((t: FollowedTeam, i) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                    onPress={() => router.push(`/(tabs)/teams/${t.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${t.name} team profile`}
                  >
                    {t.logoUrl ? (
                      <Image source={{ uri: t.logoUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>{(t.shortName || t.name || 'T').slice(0, 2)}</Text>
                      </View>
                    )}
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {t.name}
                      </Text>
                      {!!t.shortName && (
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {t.shortName}
                        </Text>
                      )}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {grounds.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grounds ({query.data?.grounds.total})</Text>
              <View style={styles.list}>
                {grounds.map((g: FollowedGround, i) => (
                  <TouchableOpacity
                    key={g.publicGroundId}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                    onPress={() => router.push(`/(tabs)/grounds/${g.publicGroundId}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${g.name}`}
                  >
                    {g.primaryPhoto ? (
                      <Image source={{ uri: g.primaryPhoto }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <MaterialCommunityIcons name="map-marker" size={20} color={Colors.white} />
                      </View>
                    )}
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      {(g.city || g.state) && (
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {[g.city, g.state].filter(Boolean).join(', ')}
                        </Text>
                      )}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <View style={{ height: Spacing['3xl'] }} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  title: { flex: 1, textAlign: 'center', fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  scroll: { padding: Spacing.lg },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
  },
  list: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 56 },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100] },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: Colors.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.sm },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text },
  rowSub: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
})
