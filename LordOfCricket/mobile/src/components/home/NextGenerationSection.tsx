import React from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useNextGeneration } from '../../hooks/useNextGeneration'
import { Colors, Spacing, Typography } from '../../constants/colors'
import { formatRole } from '../../utils/playerFormatting'

export function NextGenerationSection() {
  const router = useRouter()
  const { data: players, isLoading, isError } = useNextGeneration()

  if (isError) return null
  if (!isLoading && (!players || players.length === 0)) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>The Next Generation</Text>

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={styles.inlineLoader} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {(players || []).map((player) => (
            <TouchableOpacity
              key={player.publicPlayerId}
              style={styles.card}
              onPress={() => router.push(`/(tabs)/players/${player.publicPlayerId}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View ${player.name}'s player profile`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{player.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName} numberOfLines={1}>
                {player.name}
              </Text>
              <Text style={styles.playerRole} numberOfLines={1}>
                {formatRole(player.role) || 'Playing role not set'}
              </Text>
              <Text style={styles.stats}>
                {player.runs} Runs · {player.matches ?? '-'} {player.matches === 1 ? 'Match' : 'Matches'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  inlineLoader: {
    marginVertical: Spacing.lg,
  },
  hScroll: {
    gap: Spacing.md,
  },
  card: {
    width: 140,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
  playerName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    textAlign: 'center',
  },
  playerRole: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  stats: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
})
