import React from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useHallOfFame } from '../../hooks/useHallOfFame'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'
import { formatRole } from '../../utils/playerFormatting'

export function HallOfFameSection({ title = 'Hall of Fame' }: { title?: string }) {
  const router = useRouter()
  const { data: categories, isLoading, isError } = useHallOfFame()
  const awarded = (categories || []).filter((c) => c.player)

  if (isError) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {isLoading ? (
        <ActivityIndicator color={LocColors.onDark} style={styles.inlineLoader} />
      ) : awarded.length === 0 ? (
        <View style={styles.emptyStateSmall}>
          <Text style={styles.emptySubtext}>Not yet awarded — check back once more matches are played</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {awarded.map((category) => (
            <TouchableOpacity
              key={category.key}
              style={styles.card}
              onPress={() => router.push(`/(tabs)/players/${category.player!.publicPlayerId}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`View ${category.player!.name}'s player profile`}
            >
              <Text style={styles.categoryLabel}>{category.label}</Text>
              <Text style={styles.playerName} numberOfLines={1}>
                {category.player!.name}
              </Text>
              <Text style={styles.playerRole} numberOfLines={1}>
                {formatRole(category.player!.role) || 'Playing role not set'}
              </Text>
              <Text style={styles.headline}>{category.player!.headline}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: Spacing.xl,
    backgroundColor: LocColors.darkBand,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.surface,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  inlineLoader: {
    marginVertical: Spacing.lg,
  },
  emptyStateSmall: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.onDark,
    textAlign: 'center',
  },
  hScroll: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: 172,
    minHeight: 150,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    boxShadow: '0 2px 8px rgba(2, 46, 22, 0.24)',
  },
  categoryLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.green,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  playerName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.navy,
    marginTop: Spacing.md,
  },
  playerRole: {
    fontSize: Typography.fontSize.xs,
    color: LocColors.muted,
    marginTop: 2,
  },
  headline: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.greenStrong,
    marginTop: 'auto',
    paddingTop: Spacing.md,
  },
})
