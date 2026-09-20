import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'
import { useAuthStore } from '../../store/authStore'

const STEPS = [
  { n: '01', title: 'Create Your Profile', body: 'Tell LOC who you are and start your cricket journey.' },
  { n: '02', title: 'Discover', body: 'Find players, teams, grounds, matches and leagues.' },
  { n: '03', title: 'Connect', body: 'Join teams, organize matches and connect with the cricket community.' },
  { n: '04', title: 'Play', body: 'Get on the ground and build your cricket journey.' },
]

/** Mirrors the website V2 "Who We Are" section (dark-green band + numbered steps). */
export function WhoWeAreSection() {
  const router = useRouter()
  const { user } = useAuthStore()

  return (
    <View style={styles.section}>
      <View style={styles.band}>
        <Text style={styles.bandHeading}>The Home of Cricket Beyond Just the Game.</Text>
        <Text style={styles.bandBody}>
          Lord Of Cricket brings players, teams, grounds, matches and leagues together in one place — making it easier
          to discover, connect and be part of the game.
        </Text>
        <TouchableOpacity
          style={styles.bandBtn}
          onPress={() => router.push('/(tabs)/grounds')}
          accessibilityRole="button"
          accessibilityLabel="Explore LOC"
        >
          <Text style={styles.bandBtnText}>Explore LOC</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.heading}>Everything You Need. One Cricket Platform.</Text>

      <View style={styles.steps}>
        {STEPS.map((step) => (
          <View key={step.n} style={styles.step}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{step.n}</Text>
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {!user && (
        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push('/(auth)/register' as any)}
          accessibilityRole="button"
          accessibilityLabel="Start your cricket journey"
        >
          <Text style={styles.ctaText}>Start Your Cricket Journey</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    gap: Spacing['2xl'],
  },
  band: {
    backgroundColor: LocColors.darkBand,
    borderRadius: BorderRadius.xl,
    padding: Spacing['2xl'],
    gap: Spacing.md,
  },
  bandHeading: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.surface,
    lineHeight: Typography.fontSize['2xl'] * 1.12,
  },
  bandBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.onDark,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  bandBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    backgroundColor: LocColors.surface,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  bandBtnText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.greenStrong,
  },
  heading: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: LocColors.navy,
    lineHeight: Typography.fontSize.xl * 1.15,
  },
  steps: {
    gap: Spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  stepBadge: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.green,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.navy,
  },
  stepBody: {
    marginTop: 2,
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
  },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: LocColors.green,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  ctaText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
})
