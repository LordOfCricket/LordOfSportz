import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../src/store/authStore'
import { useMyPlayer } from '../../src/hooks/usePlayer'
import { useTeamMatches } from '../../src/hooks/useTeams'
import { useMyAvailability, useSetMyAvailability } from '../../src/hooks/useMatchAvailability'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'
import { MatchCard } from '../../src/components/MatchCard'
import { HomeHeader } from '../../src/components/home/HomeHeader'
import { useTabBarScroll } from '../../src/components/navigation/TabBarScrollContext'
import { WhoWeAreSection } from '../../src/components/home/WhoWeAreSection'
import { FeaturedGroundsSection } from '../../src/components/home/FeaturedGroundsSection'
import { HallOfFameSection } from '../../src/components/home/HallOfFameSection'
import { SponsorsSection } from '../../src/components/home/SponsorsSection'
import { getErrorMessage } from '../../src/utils/errors'
import { Match } from '../../src/types'

const YEAR = new Date().getFullYear()

const EXPLORE_LINKS: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; sub: string; href: string }[] = [
  { icon: 'trophy-outline', title: 'Player Rankings', sub: 'Official leaderboards from finalized matches', href: '/(tabs)/rankings' },
  { icon: 'tournament', title: 'Tournaments', sub: 'Live, upcoming and completed competitions', href: '/(tabs)/tournaments' },
]

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: 'Grounds', href: '/(tabs)/grounds' },
  { label: 'Matches', href: '/(tabs)/matches' },
  { label: 'Teams', href: '/(tabs)/teams' },
  { label: 'Players', href: '/(tabs)/players' },
  { label: 'Tournaments', href: '/(tabs)/tournaments' },
]

export default function HomeScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [refreshing, setRefreshing] = useState(false)

  const isPlayer = user?.role === 'player'
  const playerQuery = useMyPlayer(isPlayer)
  const teamId = playerQuery.data?.team_id ?? null
  const teamMatchesQuery = useTeamMatches(teamId as number)

  const nextMatch = useMemo<Match | null>(() => {
    const matches: Match[] = teamMatchesQuery.data || []
    const upcoming = matches
      .filter((m) => m.status === 'upcoming' && (m.teamA.id === teamId || m.teamB.id === teamId))
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime())
    return upcoming[0] || null
  }, [teamMatchesQuery.data, teamId])

  const availabilityQuery = useMyAvailability(nextMatch?.id ?? null)
  const setAvailability = useSetMyAvailability(nextMatch?.id ?? null)

  const { scrollHandler } = useTabBarScroll()

  const handleRsvp = async (status: 'AVAILABLE' | 'NOT_AVAILABLE') => {
    try {
      await setAvailability.mutateAsync(status)
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err))
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await teamMatchesQuery.refetch()
    setRefreshing(false)
  }

  return (
    <View style={styles.container}>
      <HomeHeader />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LocColors.green} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroHeadline}>
            Your Game.{'\n'}Your Ground.{'\n'}Your Legacy.
          </Text>
          <Text style={styles.heroSubtext}>
            Discover cricket grounds, matches, teams and players in one powerful platform built for the game you love.
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroBtnSolid}
              onPress={() => router.push('/(tabs)/matches')}
              accessibilityRole="button"
              accessibilityLabel="Explore matches"
            >
              <Text style={styles.heroBtnSolidText}>Explore Matches</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroBtnOutline}
              onPress={() => router.push('/(tabs)/players' as any)}
              accessibilityRole="button"
              accessibilityLabel="Discover players"
            >
              <Text style={styles.heroBtnOutlineText}>Discover Players</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Personalized Next Match / Availability (logged-in players only) */}
        {isPlayer && teamId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next Match</Text>
            {teamMatchesQuery.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.inlineLoader} />
            ) : nextMatch ? (
              <>
                <MatchCard match={nextMatch} />
                <View style={styles.rsvpRow}>
                  <Text style={styles.rsvpLabel}>Your Availability</Text>
                  <View style={styles.rsvpButtons}>
                    <TouchableOpacity
                      style={[
                        styles.rsvpButton,
                        availabilityQuery.data?.status === 'AVAILABLE' && styles.rsvpButtonAvailableActive,
                      ]}
                      disabled={setAvailability.isPending}
                      onPress={() => handleRsvp('AVAILABLE')}
                      accessibilityRole="button"
                      accessibilityLabel="Mark yourself available for the next match"
                    >
                      <Text
                        style={[
                          styles.rsvpButtonText,
                          availabilityQuery.data?.status === 'AVAILABLE' && styles.rsvpButtonTextActive,
                        ]}
                      >
                        Available
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.rsvpButton,
                        availabilityQuery.data?.status === 'NOT_AVAILABLE' && styles.rsvpButtonUnavailableActive,
                      ]}
                      disabled={setAvailability.isPending}
                      onPress={() => handleRsvp('NOT_AVAILABLE')}
                      accessibilityRole="button"
                      accessibilityLabel="Mark yourself not available for the next match"
                    >
                      <Text
                        style={[
                          styles.rsvpButtonText,
                          availabilityQuery.data?.status === 'NOT_AVAILABLE' && styles.rsvpButtonTextActive,
                        ]}
                      >
                        Not Available
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyStateSmall}>
                <Text style={styles.emptySubtext}>No upcoming match scheduled for your team</Text>
              </View>
            )}
          </View>
        )}

        {/* Who We Are */}
        <WhoWeAreSection />

        {/* Featured Grounds */}
        <FeaturedGroundsSection />

        {/* Hall of Fame */}
        <HallOfFameSection title="Hall of Fame" />

        {/* Explore — entry points to the rankings & tournament hubs
            (hidden routes reached only from Home). */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Explore</Text>
          <View style={styles.exploreList}>
            {EXPLORE_LINKS.map((link) => (
              <TouchableOpacity
                key={link.href}
                style={styles.exploreCard}
                onPress={() => router.push(link.href as any)}
                accessibilityRole="button"
                accessibilityLabel={link.title}
              >
                <MaterialCommunityIcons name={link.icon} size={22} color={LocColors.green} />
                <View style={styles.exploreText}>
                  <Text style={styles.exploreTitle}>{link.title}</Text>
                  <Text style={styles.exploreSub}>{link.sub}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={LocColors.faint} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Our Network */}
        <SponsorsSection title="Our Network" />

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerBrand}>
            <View style={styles.footerLogoChip}>
              <Text style={styles.footerLogoEmoji}>🏏</Text>
            </View>
            <Text style={styles.footerLogoText}>LOC</Text>
          </View>
          <View style={styles.footerLinks}>
            {FOOTER_LINKS.map((link) => (
              <TouchableOpacity key={link.href} onPress={() => router.push(link.href as any)}>
                <Text style={styles.footerLink}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.footerCopy}>© {YEAR} LOC</Text>
        </View>
      </Animated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LocColors.mint,
  },
  scrollContent: {
    // Small resting gap only. The tab bar sits in its own layout slot
    // below the scroll view and collapses to 0 when hidden, so the
    // content reclaims that space with no spacer left behind.
    paddingBottom: Spacing.lg,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.navy,
    marginBottom: Spacing.md,
  },
  inlineLoader: {
    marginVertical: Spacing.md,
  },
  emptyStateSmall: {
    backgroundColor: LocColors.mint,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
  },

  // Hero
  hero: {
    backgroundColor: LocColors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing['2xl'],
  },
  heroHeadline: {
    fontSize: Typography.fontSize['3xl'],
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.navy,
    lineHeight: Typography.fontSize['3xl'] * 1.1,
  },
  heroSubtext: {
    marginTop: Spacing.lg,
    fontSize: Typography.fontSize.base,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.base * Typography.lineHeight.relaxed,
  },
  heroActions: {
    marginTop: Spacing.xl,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  heroBtnSolid: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: LocColors.green,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  heroBtnSolidText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
  heroBtnOutline: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LocColors.green,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  heroBtnOutlineText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.greenStrong,
  },

  // RSVP
  rsvpRow: {
    marginTop: Spacing.md,
  },
  rsvpLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: LocColors.muted,
    marginBottom: Spacing.sm,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rsvpButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: LocColors.surface,
  },
  rsvpButtonAvailableActive: {
    borderColor: LocColors.green,
    backgroundColor: LocColors.green,
  },
  rsvpButtonUnavailableActive: {
    borderColor: '#DC2626',
    backgroundColor: '#DC2626',
  },
  rsvpButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.ink,
  },
  rsvpButtonTextActive: {
    color: LocColors.surface,
  },

  // Explore
  exploreList: {
    gap: Spacing.md,
  },
  exploreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  },
  exploreText: {
    flex: 1,
  },
  exploreTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.navy,
  },
  exploreSub: {
    fontSize: Typography.fontSize.xs,
    color: LocColors.muted,
    marginTop: 2,
  },

  // Footer
  footer: {
    backgroundColor: LocColors.darkBandDeep,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.md,
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  footerLogoChip: {
    // website footer: h-9 w-9, rounded-lg, bg-loc-green-bright
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLogoEmoji: {
    fontSize: 18, // website footer: text-lg
  },
  footerLogoText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  footerLink: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.onDarkMuted,
  },
  footerCopy: {
    fontSize: Typography.fontSize.xs,
    color: LocColors.onDarkMuted,
  },
})
