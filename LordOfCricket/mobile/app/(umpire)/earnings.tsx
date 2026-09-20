import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { SubScreenHeader } from '../../src/components/umpire/SubScreenHeader'
import { useUmpireEarnings } from '../../src/hooks/useUmpireSecondary'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const money = (n: number, ccy: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy || 'INR', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${ccy} ${n}`
  }
}
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function UmpireEarningsScreen() {
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, refetch } = useUmpireEarnings()
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const ccy = data?.recent[0]?.currency || 'INR'
  const s = data?.summary

  return (
    <View style={styles.container}>
      <SubScreenHeader title="Earnings" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load earnings</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !s?.hasAnyData ? (
          <View style={styles.centerPad}>
            <MaterialCommunityIcons name="cash-remove" size={36} color={LocColors.border} />
            <Text style={styles.cardTitle}>No earnings yet</Text>
            <Text style={styles.bodyEmpty}>
              Match fees recorded for your officiated matches will appear here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.grid}>
                <Stat value={money(s.thisMonth, ccy)} caption="This month" />
                <Stat value={money(s.pending, ccy)} caption="Pending" />
                <Stat value={money(s.paid, ccy)} caption="Paid" />
              </View>
            </View>

            {(data?.recent.length ?? 0) > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Recent</Text>
                {data!.recent.map((r) => (
                  <View key={r.id} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.teamAName} vs {r.teamBName}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[r.groundName, fmtDate(r.matchDate)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.amount}>{money(r.amount, r.currency)}</Text>
                      <Text style={styles.status}>{r.status.toLowerCase()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Stat({ value, caption }: { value: string; caption: string }) {
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
  centerPad: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm, paddingHorizontal: Spacing.xl },
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
  bodyEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xl },
  stat: { gap: 2 },
  statValue: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.greenStrong },
  statCaption: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  rowMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  amount: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  status: { fontSize: 11, color: LocColors.muted, textTransform: 'capitalize' },
  retryBtn: { alignSelf: 'flex-start', marginTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
