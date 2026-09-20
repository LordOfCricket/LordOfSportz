import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { SubScreenHeader } from '../../src/components/umpire/SubScreenHeader'
import { useUmpireProfile } from '../../src/hooks/useUmpireProfile'
import { useUmpireAssignments } from '../../src/hooks/useUmpireAvailability'
import { useUmpireTrend } from '../../src/hooks/useUmpireSecondary'
import { assignmentBucket } from '../../src/lib/umpireAssignments'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const monthLabel = (m: string) => {
  const [y, mm] = m.split('-').map(Number)
  return new Date(y, mm - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

export default function UmpireHistoryScreen() {
  const insets = useSafeAreaInsets()
  const profile = useUmpireProfile()
  const assignments = useUmpireAssignments()
  const trend = useUmpireTrend(6)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([profile.refetch(), assignments.refetch(), trend.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  const counts = useMemo(() => {
    const c = { completed: 0, cancelled: 0, noShow: 0, upcoming: 0 }
    for (const a of assignments.data ?? []) {
      const b = assignmentBucket(a)
      if (b === 'completed') c.completed++
      else if (b === 'cancelled') c.cancelled++
      else if (b === 'noShow') c.noShow++
      else c.upcoming++
    }
    return c
  }, [assignments.data])

  const p = profile.data
  const maxTrend = Math.max(1, ...(trend.data ?? []).map((m) => m.matchesOfficiated))
  const loading = profile.isLoading || assignments.isLoading
  const errored = profile.isError && assignments.isError

  return (
    <View style={styles.container}>
      <SubScreenHeader title="History & performance" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {loading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : errored ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your history</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Assignments</Text>
              <View style={styles.grid}>
                <Stat value={counts.completed} caption="Completed" />
                <Stat value={counts.upcoming} caption="Upcoming" />
                {counts.cancelled > 0 && <Stat value={counts.cancelled} caption="Cancelled" />}
                {counts.noShow > 0 && <Stat value={counts.noShow} caption="No-shows" />}
              </View>
              {counts.completed + counts.cancelled + counts.noShow + counts.upcoming === 0 && (
                <Text style={styles.bodyEmpty}>No assignment history yet.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Reputation</Text>
              {p && (p.matches_officiated > 0 || (p.rating_count ?? 0) > 0 || p.reliability != null) ? (
                <View style={styles.grid}>
                  <Stat value={p.matches_officiated} caption="Officiated" />
                  {p.reliability != null && <Stat value={`${Math.round(p.reliability * 100)}%`} caption="Reliability" />}
                  {(p.rating_count ?? 0) > 0 && p.rating_avg != null && (
                    <Stat value={Number(p.rating_avg).toFixed(1)} caption={`Rating · ${p.rating_count}`} />
                  )}
                </View>
              ) : (
                <Text style={styles.bodyEmpty}>
                  No reputation data yet — officiate matches and receive ratings to build your record.
                </Text>
              )}
              {(p?.badges?.length ?? 0) > 0 && (
                <View style={styles.badges}>
                  {p!.badges.map((b) => (
                    <View key={b} style={styles.badge}>
                      <MaterialCommunityIcons name="medal-outline" size={12} color={LocColors.greenStrong} />
                      <Text style={styles.badgeText}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Last 6 months</Text>
              {trend.isLoading ? (
                <ActivityIndicator color={LocColors.green} style={{ marginVertical: Spacing.md }} />
              ) : trend.isError ? (
                <TouchableOpacity onPress={() => trend.refetch()}>
                  <Text style={styles.link}>Couldn’t load trend — tap to retry</Text>
                </TouchableOpacity>
              ) : (trend.data ?? []).every((m) => m.matchesOfficiated === 0) ? (
                <Text style={styles.bodyEmpty}>No matches officiated in the last 6 months.</Text>
              ) : (
                <View style={styles.trendRow}>
                  {(trend.data ?? []).map((m) => (
                    <View key={m.month} style={styles.trendCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { height: `${Math.round((m.matchesOfficiated / maxTrend) * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.trendVal}>{m.matchesOfficiated}</Text>
                      <Text style={styles.trendMonth}>{monthLabel(m.month)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Stat({ value, caption }: { value: number | string; caption: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['3xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: { fontSize: Typography.fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: LocColors.faint },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  bodyEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xl, marginTop: Spacing.xs },
  stat: { gap: 2 },
  statValue: { fontSize: Typography.fontSize.xl, fontWeight: '800', color: LocColors.greenStrong },
  statCaption: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LocColors.greenPale, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: LocColors.greenStrong },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: Spacing.sm, height: 120 },
  trendCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { width: 18, height: 80, borderRadius: 6, backgroundColor: LocColors.mint, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: LocColors.green, borderRadius: 6 },
  trendVal: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  trendMonth: { fontSize: 10, color: LocColors.faint },
  retryBtn: { alignSelf: 'flex-start', marginTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
