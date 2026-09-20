import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { PlayerAchievements as PlayerAchievementsData, CareerAchievement } from '../../types'
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Career milestones — straight from GET /players/:id/stats (or /me/stats):
// `achievements.earned` + `achievements.next`, both computed server-side from
// finalized-match history (server/src/domain/statistics/careerMilestones.js).
// No client-side cricket math, no fabricated locked badges.

const CATEGORY_ICON: Record<CareerAchievement['category'], React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  appearance: 'calendar-check',
  batting: 'trending-up',
  bowling: 'target',
  fielding: 'hand-back-right-outline',
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PlayerAchievements({ achievements }: { achievements: PlayerAchievementsData | undefined }) {
  const earned = achievements?.earned ?? []
  const next = achievements?.next ?? null

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="trophy-award" size={18} color={Colors.primary} />
        <Text style={styles.title}>Achievements</Text>
      </View>

      {earned.length === 0 && !next ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No career milestones reached yet — they appear as finalized matches add up.</Text>
        </View>
      ) : (
        <>
          {earned.map((a) => {
            const when = formatDate(a.achievedOn?.date)
            return (
              <View key={a.id} style={styles.badge}>
                <View style={styles.badgeIcon}>
                  <MaterialCommunityIcons name={CATEGORY_ICON[a.category] || 'medal-outline'} size={18} color={Colors.primary} />
                </View>
                <View style={styles.badgeBody}>
                  <Text style={styles.badgeTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={styles.badgeDesc} numberOfLines={2}>
                    {a.description}
                  </Text>
                  {when ? (
                    <Text style={styles.badgeWhen}>
                      {when}
                      {a.achievedOn?.opponent ? ` · vs ${a.achievedOn.opponent}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            )
          })}

          {next ? (
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>Next Milestone</Text>
              <Text style={styles.nextTitle} numberOfLines={1}>
                {next.title}
              </Text>
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${Math.min(100, Math.round((next.value / next.target) * 100))}%` }]} />
              </View>
              <Text style={styles.nextProgress}>
                {next.value} / {next.target}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  title: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  emptyCard: { backgroundColor: Colors.backgroundAlt, borderRadius: BorderRadius.md, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  badgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBody: { flex: 1, minWidth: 0 },
  badgeTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  badgeDesc: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  badgeWhen: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  nextCard: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  nextLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nextTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.text, marginTop: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden', marginTop: Spacing.sm },
  trackFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  nextProgress: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 4 },
})
