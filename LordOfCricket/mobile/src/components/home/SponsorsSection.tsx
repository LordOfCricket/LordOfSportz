import React from 'react'
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native'
import { usePartners } from '../../hooks/usePartners'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function SponsorsSection({ title = 'Our Network' }: { title?: string }) {
  const { data: partners, isLoading, isError } = usePartners()

  if (isError) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {isLoading ? (
        <ActivityIndicator color={LocColors.green} style={styles.inlineLoader} />
      ) : !partners || partners.length === 0 ? (
        <View style={styles.emptyStateSmall}>
          <Text style={styles.emptySubtext}>No partners yet</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {partners.map((partner) => (
            <View key={partner.id} style={styles.card}>
              <Image source={{ uri: partner.logo_url }} style={styles.logo} resizeMode="contain" />
              <Text style={styles.name} numberOfLines={1}>
                {partner.name}
              </Text>
            </View>
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
  sectionTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.navy,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
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
  hScroll: {
    gap: Spacing.md,
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    alignItems: 'center',
    width: 104,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  },
  logo: {
    width: 60,
    height: 60,
  },
  name: {
    fontSize: Typography.fontSize.xs,
    color: LocColors.muted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
})
