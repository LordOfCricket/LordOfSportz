import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useFeaturedGrounds } from '../../hooks/useGrounds'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function FeaturedGroundsSection() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useFeaturedGrounds(8)
  const grounds = data?.grounds || []

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Featured Grounds</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/grounds')}>
          <Text style={styles.viewAllText}>View all</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={LocColors.green} style={styles.inlineLoader} />
      ) : isError ? (
        <TouchableOpacity style={styles.emptyStateSmall} onPress={() => refetch()}>
          <Text style={styles.emptySubtext}>Unable to load grounds. Tap to retry.</Text>
        </TouchableOpacity>
      ) : grounds.length === 0 ? (
        <View style={styles.emptyStateSmall}>
          <Text style={styles.emptySubtext}>No registered grounds yet</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.hScrollContainer}
          contentContainerStyle={styles.hScroll}
        >
          {grounds.map((ground) => (
            <TouchableOpacity
              key={ground.publicGroundId}
              style={styles.groundCard}
              onPress={() => router.push(`/(tabs)/grounds/${ground.publicGroundId}` as any)}
            >
              {ground.primaryPhoto ? (
                <Image source={{ uri: ground.primaryPhoto }} style={styles.groundImage} />
              ) : (
                <View style={[styles.groundImage, styles.groundImagePlaceholder]} />
              )}
              <View style={styles.groundBody}>
                <Text style={styles.groundName} numberOfLines={1}>
                  {ground.name}
                </Text>
                {(ground.city || ground.state) && (
                  <Text style={styles.groundLocation} numberOfLines={1}>
                    {[ground.city, ground.state].filter(Boolean).join(', ')}
                  </Text>
                )}
              </View>
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
    backgroundColor: LocColors.surface,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.navy,
  },
  viewAllText: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.green,
    fontWeight: Typography.fontWeight.bold,
  },
  inlineLoader: {
    marginVertical: Spacing.lg,
  },
  emptyStateSmall: {
    backgroundColor: LocColors.mint,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
  },
  hScrollContainer: {
    flexGrow: 0,
  },
  hScroll: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  groundCard: {
    width: 172,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  },
  groundImage: {
    width: '100%',
    height: 104,
  },
  groundImagePlaceholder: {
    backgroundColor: LocColors.greenPale,
  },
  groundBody: {
    minHeight: 58,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 2,
  },
  groundName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.navy,
  },
  groundLocation: {
    fontSize: Typography.fontSize.xs,
    color: LocColors.muted,
  },
})
