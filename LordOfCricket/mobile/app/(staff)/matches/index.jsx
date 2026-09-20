import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { StaffGuard } from '../../../src/components/staff/StaffGuard'
import { StaffSubHeader } from '../../../src/components/staff/StaffSubHeader'
import { MatchRow } from '../../../src/components/owner/MatchRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useStaffMatches } from '../../../src/hooks/useStaffMatches'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function MatchesContent() {
  const router = useRouter()
  const { upcoming, groundName, isLoading, isError, refetch } = useStaffMatches()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.container}>
      <StaffSubHeader title="Upcoming matches" subtitle={groundName ?? undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.cardBody}>Couldn’t load matches.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : upcoming.length === 0 ? (
          <EmptyState icon="🏏" title="No upcoming matches" message="There are no upcoming matches scheduled at this ground." />
        ) : (
          <View style={styles.list}>
            {upcoming.map((m) => (
              <MatchRow key={m.id} match={m} onPress={() => router.push(`/(staff)/matches/${m.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

export default function StaffMatchesScreen() {
  return (
    <StaffGuard title="Upcoming matches" anyOf={['MATCH_VIEW']}>
      <MatchesContent />
    </StaffGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  list: { gap: Spacing.sm },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
